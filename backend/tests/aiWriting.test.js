const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ReadableStream } = require('stream/web');
const source = fs.readFileSync(path.join(__dirname, '../../frontend/app.js'), 'utf8');
const helper = source.slice(source.indexOf('async function requestAiSuggestion('), source.indexOf('function renderSectionForm('));

function setup() {
  const ctx = {
    API_BASE: 'http://localhost:5000/api', isLocalDev: true,
    AbortController, TextDecoder, TypeError,
    authedHeaders: async () => ({ Authorization: 'Bearer test-session' }),
    fetch: jest.fn(), setTimeout: jest.fn(() => 123), clearTimeout: jest.fn(),
  };
  vm.createContext(ctx); vm.runInContext(helper, ctx);
  return ctx;
}
function streamResponse(chunks) {
  return { ok: true, body: new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  } }) };
}

test('AI writing sends authentication, reads split chunks and accepts a final marker without a newline', async () => {
  const ctx = setup(), onChunk = jest.fn();
  ctx.fetch.mockResolvedValue(streamResponse(['data: {"chu', 'nk":"Hello "}\r\n\r\ndata: {"chunk":"world"}\n\ndata: [DONE]']));
  expect(await ctx.requestAiSuggestion('summary', { skills: ['Testing'] }, onChunk)).toBe('Hello world');
  expect(onChunk.mock.calls.map(([text]) => text)).toEqual(['Hello ', 'Hello world']);
  expect(ctx.fetch).toHaveBeenCalledWith('http://localhost:5000/api/ai/suggest', expect.objectContaining({
    method: 'POST', headers: { Authorization: 'Bearer test-session' },
    body: JSON.stringify({ type: 'summary', context: { skills: ['Testing'] }, stream: true }),
  }));
  expect(ctx.clearTimeout).toHaveBeenCalledWith(123);
});

test('an unreachable local backend gives an actionable message and releases its timer', async () => {
  const ctx = setup(); ctx.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(ctx.requestAiSuggestion('summary', {})).rejects.toThrow('Start the backend');
  expect(ctx.clearTimeout).toHaveBeenCalledWith(123);
});

test('a remote connection failure does not incorrectly ask the user to start a local server', async () => {
  const ctx = setup(); ctx.API_BASE = 'https://api.example.com/api';
  ctx.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(ctx.requestAiSuggestion('summary', {})).rejects.toThrow('Check your connection');
});

test('HTTP errors show the server message, including exhausted AI quota', async () => {
  const ctx = setup();
  ctx.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'AI is busy. Please try again shortly.' }) });
  await expect(ctx.requestAiSuggestion('summary', {})).rejects.toThrow('AI is busy. Please try again shortly.');
});

test('expired sessions produce a sign-in error with the HTTP status', async () => {
  const ctx = setup();
  ctx.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'Invalid token' }) });
  await expect(ctx.requestAiSuggestion('summary', {})).rejects.toMatchObject({ status: 401, message: 'Please sign in again to use AI writing.' });
});

test('a provider error after partial output is not reported as a successful suggestion', async () => {
  const ctx = setup();
  ctx.fetch.mockResolvedValue(streamResponse(['data: {"chunk":"Partial"}\n\ndata: {"error":"Provider disconnected"}\n\n']));
  await expect(ctx.requestAiSuggestion('summary', {})).rejects.toThrow('Provider disconnected');
});

test('an interrupted stream cannot silently replace the summary with partial content', async () => {
  const ctx = setup(); ctx.fetch.mockResolvedValue(streamResponse(['data: {"chunk":"Partial"}\n\n']));
  await expect(ctx.requestAiSuggestion('summary', {})).rejects.toThrow('response was interrupted');
});

test('timeout aborts and releases the timer', async () => {
  const ctx = setup();
  ctx.fetch.mockImplementation(async (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    ctx.setTimeout.mock.calls[0][0]();
  }));
  await expect(ctx.requestAiSuggestion('summary', {})).rejects.toThrow('timed out');
  expect(ctx.clearTimeout).toHaveBeenCalledWith(123);
});
