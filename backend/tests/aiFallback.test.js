/**
 * AI key rotation and fallback: when a Gemini key or model hits its limit, the
 * next key/model takes over, then Grok, then OpenRouter, then a 503 "busy".
 */
process.env.NODE_ENV = 'test';

// mockHandler(key, model, kind) decides what each fake Gemini call does.
let mockHandler;
const mockCalls = [];

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation((key) => ({
    getGenerativeModel: jest.fn(({ model }) => ({
      generateContent: async () => {
        mockCalls.push(`${key}:${model}`);
        const text = mockHandler(key, model, 'once');
        return { response: { text: () => text } };
      },
      generateContentStream: async () => {
        mockCalls.push(`${key}:${model}`);
        const text = mockHandler(key, model, 'stream');
        return { stream: (async function* () { yield { text: () => text }; })() };
      },
    })),
  })),
}));

jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');

function quotaError({ perDay = false, retryDelay } = {}) {
  const err = new Error('[429 Too Many Requests] You exceeded your current quota.');
  err.status = 429;
  err.errorDetails = [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId: perDay ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
  ];
  if (retryDelay) err.errorDetails.push({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay });
  return err;
}

function httpError(status) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data: { error: 'no credits' } };
  return err;
}

function loadService(env = {}) {
  Object.assign(process.env, {
    GEMINI_API_KEYS: 'k1,k2', GEMINI_API_KEY: '',
    GEMINI_FAST_MODELS: 'flash-a,flash-b', GEMINI_HEAVY_MODELS: 'pro-a,flash-a,flash-b', XAI_API_KEY: '', OPENROUTER_API_KEY: '', ...env,
  });
  let svc;
  jest.isolateModules(() => { svc = require('../src/services/aiService'); });
  return svc;
}

beforeEach(() => {
  mockCalls.length = 0;
  axios.post.mockReset();
  mockHandler = () => 'ok';
});

describe('Gemini key rotation', () => {
  test('alternates keys between requests to spread the load', async () => {
    const ai = loadService();
    await ai._generate('fast', 'p');
    await ai._generate('fast', 'p');
    expect(mockCalls).toEqual(['k1:flash-a', 'k2:flash-a']);
  });

  test('when key #1 hits its limit, key #2 answers the same request', async () => {
    const ai = loadService();
    mockHandler = (key) => { if (key === 'k1') throw quotaError(); return 'from k2'; };
    await expect(ai._generate('fast', 'p')).resolves.toBe('from k2');
    expect(mockCalls).toEqual(['k1:flash-a', 'k2:flash-a']);
  });

  test('a limited key is skipped on later requests instead of retried', async () => {
    const ai = loadService();
    mockHandler = (key) => { if (key === 'k1') throw quotaError({ retryDelay: '30s' }); return 'from k2'; };
    await ai._generate('fast', 'p');
    mockCalls.length = 0;
    await ai._generate('fast', 'p');
    await ai._generate('fast', 'p');
    expect(mockCalls).toEqual(['k2:flash-a', 'k2:flash-a']);
  });

  test('a paused key comes back once its retry delay has passed', async () => {
    const ai = loadService();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    mockHandler = (key) => { if (key === 'k1') throw quotaError({ retryDelay: '30s' }); return 'ok'; };
    await ai._generate('fast', 'p');
    mockHandler = () => 'ok';
    now.mockReturnValue(1_000_000 + 31_000);
    mockCalls.length = 0;
    ai.nextKey = 0; // start the round-robin at key #1 again
    await ai._generate('fast', 'p');
    expect(mockCalls).toEqual(['k1:flash-a']);
    now.mockRestore();
  });

  test('when both keys are out on Flash, Flash-Lite takes over', async () => {
    const ai = loadService();
    mockHandler = (key, model) => { if (model === 'flash-a') throw quotaError({ perDay: true }); return 'lite'; };
    await expect(ai._generate('fast', 'p')).resolves.toBe('lite');
    expect(mockCalls).toEqual(['k1:flash-a', 'k2:flash-a', 'k1:flash-b']);
  });

  test('a Pro limit on the ATS scan does not stop Flash for AI Write', async () => {
    const ai = loadService();
    mockHandler = (key, model) => { if (model === 'pro-a') throw quotaError({ perDay: true }); return `${model}`; };
    await expect(ai._generate('heavy', 'p')).resolves.toBe('flash-a');
    mockCalls.length = 0;
    await expect(ai._generate('fast', 'p')).resolves.toBe('flash-a');
    expect(mockCalls).toHaveLength(1);
  });

  test('a retired model (404) is skipped, not fatal', async () => {
    const ai = loadService({ GEMINI_API_KEYS: 'k1' });
    mockHandler = (key, model) => {
      if (model === 'flash-a') { const e = new Error('[404 Not Found] model not found'); e.status = 404; throw e; }
      return 'lite';
    };
    await expect(ai._generate('fast', 'p')).resolves.toBe('lite');
  });

  test('duplicate keys are only used once', async () => {
    const ai = loadService({ GEMINI_API_KEYS: 'k1, k1 ,k2' });
    expect(ai.instances).toHaveLength(2);
  });
});

describe('model chains', () => {
  test('default chain prefers current Flash models and never a Pro model', () => {
    const ai = loadService({ GEMINI_FAST_MODELS: '', GEMINI_HEAVY_MODELS: '' });
    const fast = ai._geminiSlots('fast').map(s => s.modelName);
    const heavy = ai._geminiSlots('heavy').map(s => s.modelName);
    expect(fast[0]).toBe('gemini-2.5-flash-lite');
    expect(heavy.some(m => /pro/.test(m))).toBe(false);
  });

  test('AI Write skips thinking without changing deep scans or custom models', () => {
    const ai = loadService({ GEMINI_FAST_MODELS: '', GEMINI_HEAVY_MODELS: '' });
    const instance = ai.instances[0];
    ai._model(instance, 'gemini-2.5-flash-lite', 'fast');
    expect(instance.genAI.getGenerativeModel).toHaveBeenLastCalledWith({
      model: 'gemini-2.5-flash-lite',
      generationConfig: { maxOutputTokens: 350, temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } },
    });
    ai._model(instance, 'gemini-2.5-flash', 'heavy');
    expect(instance.genAI.getGenerativeModel).toHaveBeenLastCalledWith({ model: 'gemini-2.5-flash' });
    ai._model(instance, 'custom-model', 'fast');
    expect(instance.genAI.getGenerativeModel).toHaveBeenLastCalledWith({
      model: 'custom-model', generationConfig: { maxOutputTokens: 350, temperature: 0.5 },
    });
  });

  test('a 503 "high demand" moves to the next key and skips that slot for a minute', async () => {
    const ai = loadService();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    mockHandler = (key) => { if (key === 'k1') { const e = new Error('[503] high demand'); e.status = 503; throw e; } return 'k2'; };
    await expect(ai._generate('fast', 'p')).resolves.toBe('k2');
    expect(ai.pausedUntil.get('gemini#1:flash-a')).toBe(1_000_000 + 60_000);
    now.mockRestore();
  });
});

describe('fallback providers', () => {
  const allGeminiDown = () => { throw quotaError({ perDay: true }); };

  test('Grok answers when every Gemini key and model is out', async () => {
    const ai = loadService({ XAI_API_KEY: 'x' });
    mockHandler = allGeminiDown;
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'from grok' } }] } });
    await expect(ai._generate('fast', 'p')).resolves.toBe('from grok');
    expect(axios.post.mock.calls[0][0]).toBe('https://api.x.ai/v1/chat/completions');
  });

  test('Grok without credits (403) falls through to OpenRouter', async () => {
    const ai = loadService({ XAI_API_KEY: 'x', OPENROUTER_API_KEY: 'o' });
    mockHandler = allGeminiDown;
    axios.post
      .mockRejectedValueOnce(httpError(403))
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'from openrouter' } }] } });
    await expect(ai._generate('fast', 'p')).resolves.toBe('from openrouter');
  });

  test('everything down gives a 503 "busy" error the student can read', async () => {
    const ai = loadService({ XAI_API_KEY: 'x', OPENROUTER_API_KEY: 'o' });
    mockHandler = allGeminiDown;
    axios.post.mockRejectedValue(httpError(402));
    const err = await ai._generate('fast', 'p').catch(e => e);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/busy/i);
  });

  test('providers with no key configured are never called', async () => {
    const ai = loadService();
    mockHandler = allGeminiDown;
    await expect(ai._generate('fast', 'p')).rejects.toThrow(/busy/i);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('streaming (AI Write)', () => {
  test('key #2 streams the answer when key #1 is limited', async () => {
    const ai = loadService();
    mockHandler = (key) => { if (key === 'k1') throw quotaError(); return 'A strong summary.'; };
    const chunks = [];
    await ai.generateSuggestionStream('summary', { role: 'dev' }, c => chunks.push(c));
    expect(chunks.join('')).toBe('A strong summary.');
    expect(mockCalls).toEqual(['k1:flash-a', 'k2:flash-a']);
  });

  test('throws "busy" when nothing can stream', async () => {
    const ai = loadService();
    mockHandler = () => { throw quotaError({ perDay: true }); };
    await expect(ai.generateSuggestionStream('summary', {}, () => {})).rejects.toThrow(/busy/i);
  });
});
