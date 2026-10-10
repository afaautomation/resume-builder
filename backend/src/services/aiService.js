const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const logger = require('../config/logger');

/**
 * Fallback order for every AI call:
 *
 *   each model in the chain → on every Gemini key (round-robin start)
 *   → Grok (xAI) → OpenRouter → friendly "AI is busy" error
 *
 * Each (key, model) pair is paused on its own, for as long as Google asks
 * (RetryInfo), so one exhausted key or model never disables the rest.
 * Gemini limits are per Google Cloud PROJECT, so extra keys only add quota
 * when they come from different projects.
 */

// Each model has its own quota per project, so a longer chain means more free
// requests per day. Google retires models for NEW projects first (a 404 just
// pauses that slot for a day), so the chains are overridable from .env.
// Pro models have no free-tier quota, so the ATS scan uses Flash too.
// The -latest aliases are a safety net if every pinned model is retired.
// Only real, production-available models are listed here.
// Putting the fastest / highest-quota models first avoids serial
// fallback delays on every cold request.
const DEFAULT_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
];

function chainFromEnv(name, fallback) {
  const list = (process.env[name] || '').split(',').map(m => m.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

// Heavy tasks (ATS, translate) and fast tasks (AI Write suggestions).
const HEAVY_MODEL_CHAIN = chainFromEnv('GEMINI_HEAVY_MODELS', DEFAULT_CHAIN);
const FAST_MODEL_CHAIN = chainFromEnv('GEMINI_FAST_MODELS', [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
]);

const XAI_MODEL = process.env.XAI_MODEL || 'grok-3-mini';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

// fast: per-slot streaming timeout. Keep it short so a quota-limited or
// misconfigured slot fails quickly and the next slot is tried immediately.
const TIMEOUT_MS = { heavy: 45000, fast: 6000 };

// How long to pause a key/model/provider after each kind of failure.
const COOLDOWN = {
  rateLimit: 60 * 1000,          // per-minute limit, when Google gives no retry delay
  overloaded: 60 * 1000,         // 503 'high demand' or a timeout: skip that slot for a minute
  dailyLimit: 60 * 60 * 1000,    // per-day limit: re-check hourly (resets midnight Pacific)
  badKey: 30 * 60 * 1000,        // invalid key, no credits, permission denied
  missingModel: 24 * 60 * 60 * 1000, // model retired / not available to this key
};

const BUSY_MESSAGE = 'AI is busy right now. Please try again in a minute.';

/**
 * Classifies a provider error into how long that key/model should be paused.
 * Returns 0 for other transient errors (e.g. a 500): just move on, no pause.
 */
function cooldownFor(err) {
  const status = err.status || err.response?.status;
  const msg = String(err.message || '').toLowerCase();

  if (status === 404 || msg.includes('not found')) return COOLDOWN.missingModel;
  if (status === 503 || msg.includes('high demand') || msg.includes('overloaded') || msg.includes('timeout')) {
    return COOLDOWN.overloaded;
  }

  if (status === 429 || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('429')) {
    const details = Array.isArray(err.errorDetails) ? err.errorDetails : [];
    const perDay = details.some(d => (d.violations || []).some(v => /perday/i.test(v.quotaId || '')))
      || /per ?day/i.test(msg);
    if (perDay) return COOLDOWN.dailyLimit;

    const retry = details.find(d => d.retryDelay);
    const seconds = retry ? parseFloat(retry.retryDelay) : parseFloat((msg.match(/retry in ([\d.]+)s/) || [])[1]);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : COOLDOWN.rateLimit;
  }

  if ([400, 401, 402, 403].includes(status) || msg.includes('api key') || msg.includes('permission')) {
    return COOLDOWN.badKey;
  }
  return 0;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('AI Request Timeout')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** Reads an OpenAI-style SSE stream (OpenRouter, xAI) and forwards text deltas. */
function pipeSse(stream, onText) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const handle = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) return;
      const dataStr = trimmed.slice(6).trim();
      if (dataStr === '[DONE]') return;
      try {
        const content = JSON.parse(dataStr).choices?.[0]?.delta?.content;
        if (content) onText(content);
      } catch (e) { /* partial or keep-alive line */ }
    };
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handle);
    });
    stream.on('end', () => { handle(buffer); resolve(); });
    stream.on('error', reject);
  });
}

class StreamCleaner {
  constructor(type) {
    this.type = type;
    this.buffer = '';
    this.lineStart = true;
  }

  process(chunk, onCleanedChunk) {
    if (this.type === 'summary') {
      onCleanedChunk(chunk);
      return;
    }

    this.buffer += chunk;

    // Process lines
    while (true) {
      if (this.lineStart) {
        // Strip leading bullets/numbers immediately — don't wait for more data.
        // Waiting caused visible write lag because chunks were held back.
        this.buffer = this.buffer
          .replace(/^[\s*•\-+]+/, '')
          .replace(/^\d+[\.\)]\s*/, '');
        this.lineStart = false;
      }

      // Emit up to the next newline (inclusive), or the whole remaining buffer.
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const lineContent = this.buffer.slice(0, newlineIndex + 1);
        onCleanedChunk(lineContent);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        this.lineStart = true;
      } else {
        if (this.buffer) {
          onCleanedChunk(this.buffer);
          this.buffer = '';
        }
        break;
      }
    }
  }

  flush(onCleanedChunk) {
    if (this.buffer) {
      if (this.lineStart) {
        this.buffer = this.buffer
          .replace(/^[\s*•\-+]+/, '')
          .replace(/^\d+[\.\)]\s*/, '');
      }
      onCleanedChunk(this.buffer);
      this.buffer = '';
    }
  }
}

class AiService {
  constructor() {
    this.instances = [];
    this.nextKey = 0;          // round-robin start, so load spreads across keys
    this.pausedUntil = new Map(); // slot id -> timestamp it may be retried
    this.init();
  }

  init() {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    const keys = [...new Set(rawKeys.split(',').map(k => k.trim()).filter(Boolean))];

    this.instances = keys.map((key, index) => {
      try {
        return { index, genAI: new GoogleGenerativeAI(key), models: new Map() };
      } catch (err) {
        logger.error(`[AI] Failed to initialize Gemini key #${index + 1}: ${err.message}`);
        return null;
      }
    }).filter(Boolean);

    logger.info(`[AI Init] Gemini Keys Count: ${this.instances.length}`);
    logger.info(`[AI Init] XAI Key: ${process.env.XAI_API_KEY ? `Configured (${XAI_MODEL})` : 'Missing'}`);
    logger.info(`[AI Init] OpenRouter Key: ${process.env.OPENROUTER_API_KEY ? `Configured (${OPENROUTER_MODEL})` : 'Missing'}`);
  }

  ensureInitialized() {
    // Kept for backward compatibility
  }

  _model(instance, name, type) {
    const cacheKey = `${type}:${name}`;
    if (!instance.models.has(cacheKey)) {
      const config = { model: name };
      // Keep resume suggestions concise without spending output tokens on a
      // reasoning pass. Other models and deep scans keep their own settings.
      if (type === 'fast') {
        config.generationConfig = { maxOutputTokens: 350, temperature: 0.5 };
        if (/^gemini-2\.5-flash(?:-lite)?$/.test(name)) {
          config.generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }
      }
      instance.models.set(cacheKey, instance.genAI.getGenerativeModel(config));
    }
    return instance.models.get(cacheKey);
  }

  /** Every (key, model) pair to try, model by model, keys in round-robin order. */
  _geminiSlots(type) {
    const chain = type === 'heavy' ? HEAVY_MODEL_CHAIN : FAST_MODEL_CHAIN;
    const n = this.instances.length;
    if (!n) return [];
    const start = this.nextKey++ % n;
    const slots = [];
    for (const modelName of chain) {
      for (let i = 0; i < n; i++) {
        const instance = this.instances[(start + i) % n];
        slots.push({ id: `gemini#${instance.index + 1}:${modelName}`, instance, modelName });
      }
    }
    return slots;
  }

  /** OpenAI-compatible fallbacks, in order. Only those with a key configured. */
  _chatProviders() {
    const providers = [];
    if (process.env.XAI_API_KEY) {
      providers.push({
        id: 'grok',
        url: 'https://api.x.ai/v1/chat/completions',
        model: XAI_MODEL,
        headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      });
    }
    if (process.env.OPENROUTER_API_KEY) {
      providers.push({
        id: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: OPENROUTER_MODEL,
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://kompetenzen.in',
          'X-Title': 'Kompetenzen Resume Builder',
        },
      });
    }
    return providers;
  }

  _isPaused(id) {
    const until = this.pausedUntil.get(id);
    if (!until) return false;
    if (Date.now() >= until) {
      this.pausedUntil.delete(id);
      logger.info(`[AI Health] ${id} is available again.`);
      return false;
    }
    return true;
  }

  _fail(id, err) {
    const detail = err.response?.data?.error?.message || err.response?.data?.error || err.message;
    const ms = cooldownFor(err);
    if (ms > 0) {
      this.pausedUntil.set(id, Date.now() + ms);
      logger.warn(`[AI] ${id} failed (${detail}). Paused for ${Math.round(ms / 1000)}s; trying next.`);
    } else {
      logger.warn(`[AI] ${id} failed (${detail}). Trying next.`);
    }
  }

  _busyError() {
    const err = new Error(BUSY_MESSAGE);
    err.status = 503;
    return err;
  }

  async _generate(type, prompt) {
    for (const slot of this._geminiSlots(type)) {
      if (this._isPaused(slot.id)) continue;
      try {
        const result = await withTimeout(
          this._model(slot.instance, slot.modelName, type).generateContent(prompt),
          TIMEOUT_MS[type]
        );
        const text = result.response.text();
        if (text) return text;
      } catch (err) {
        this._fail(slot.id, err);
      }
    }

    for (const provider of this._chatProviders()) {
      if (this._isPaused(provider.id)) continue;
      try {
        const response = await axios.post(provider.url, {
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: type === 'fast' ? 350 : 1500,
        }, {
          headers: { ...provider.headers, 'Content-Type': 'application/json' },
          timeout: TIMEOUT_MS[type],
        });
        const content = response.data?.choices?.[0]?.message?.content;
        if (content) {
          logger.info(`[AI] Served by fallback ${provider.id}.`);
          return content;
        }
      } catch (err) {
        this._fail(provider.id, err);
      }
    }

    logger.error('[AI] Every Gemini key/model and fallback provider is unavailable.');
    throw this._busyError();
  }

  async analyzeAts(resumeData, jobDescription = '', targetJob = '') {
    let contextStr = '';
    if (jobDescription && jobDescription.trim().length > 0) {
      contextStr += `Job Description: ${jobDescription}\n`;
    }
    if (targetJob && targetJob.trim().length > 0) {
      contextStr += `Target Job Title: ${targetJob}\n`;
    }

    let prompt =
      `Analyze this resume for ATS compatibility and impact. Provide an ATS score from 0-100. ` +
      `Crucially, provide 3 to 5 highly detailed, actionable suggestions in the 'topImprovements' array on exactly how the candidate can improve their resume (e.g., specific action verbs to use, missing sections, formatting flaws, quantification of achievements). ` +
      `Return ONLY a raw JSON object. Do not include any explanation or markdown formatting. ` +
      `Structure: {"score":number,"grade":string,"feedback":[],"topImprovements":["Detailed suggestion 1", "Detailed suggestion 2"]}. ` +
      `Resume: ${JSON.stringify(resumeData)}`;
      
    if (contextStr) {
      prompt = `Analyze this resume against the provided target job title and/or Job Description for ATS scoring. Score 0-100 based on how well the resume matches the requirements of the target role. ` +
               `Crucially, provide 3 to 5 highly detailed, actionable suggestions in the 'topImprovements' array detailing exactly what skills, keywords, or experiences are missing from the resume compared to the target role/JD, and how to frame existing experience better. ` +
               `Return ONLY a raw JSON object. Do not include any explanation or markdown formatting. ` +
               `Structure: {"score":number,"grade":string,"feedback":[],"topImprovements":["Detailed suggestion 1", "Detailed suggestion 2"]}. ` +
               `${contextStr}` +
               `Resume: ${JSON.stringify(resumeData)}`;
    }

    const text = await this._generate('heavy', prompt);
    return this._parseJson(text);
  }

  async translateResume(resumeData, language) {
    const prompt = 
      `Translate all text values in this resume JSON to ${language}. ` +
      `Keep the keys and structure exactly the same. ` +
      `Return ONLY the raw translated JSON object. No preamble, no markdown. ` +
      `JSON: ${JSON.stringify(resumeData)}`;
    const text = await this._generate('heavy', prompt);
    return this._parseJson(text);
  }

  _parseJson(text) {
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e2) {
          throw new Error('AI returned invalid JSON structure.');
        }
      }
      throw new Error('AI did not return a valid JSON object.');
    }
  }

  /**
   * Streams an AI Write suggestion through onChunk, with the same fallback
   * order as _generate. A source is only abandoned for the next one if it
   * failed before sending any text; once text has reached the student, a
   * failure is reported instead of mixing two different answers.
   */
  async generateSuggestionStream(type, context, onChunk) {
    const prompt = this._buildPrompt(type, context);
    let sent = false;
    const emit = (chunk) => {
      sent = true;
      if (onChunk) onChunk(chunk);
    };

    for (const slot of this._geminiSlots('fast')) {
      if (this._isPaused(slot.id)) continue;
      try {
        const cleaner = new StreamCleaner(type);
        const result = await withTimeout(
          this._model(slot.instance, slot.modelName, 'fast').generateContentStream(prompt),
          TIMEOUT_MS.fast
        );
        if (result && result.response && typeof result.response.catch === 'function') {
          result.response.catch(() => {});
        }
        let fullText = '';
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullText += chunkText;
            cleaner.process(chunkText, emit);
          }
        }
        cleaner.flush(emit);
        if (fullText) return;
      } catch (err) {
        if (sent) throw err;
        this._fail(slot.id, err);
      }
    }

    for (const provider of this._chatProviders()) {
      if (this._isPaused(provider.id)) continue;
      try {
        const cleaner = new StreamCleaner(type);
        const response = await axios.post(provider.url, {
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 350,
          stream: true,
        }, {
          headers: { ...provider.headers, 'Content-Type': 'application/json' },
          responseType: 'stream',
          timeout: 25000,
        });
        await pipeSse(response.data, (text) => cleaner.process(text, emit));
        cleaner.flush(emit);
        if (sent) {
          logger.info(`[AI Stream] Served by fallback ${provider.id}.`);
          return;
        }
      } catch (err) {
        if (sent) throw err;
        this._fail(provider.id, err);
      }
    }

    logger.error('[AI Stream] Every Gemini key/model and fallback provider is unavailable.');
    throw this._busyError();
  }

  cleanBulletPoints(text) {
    if (!text) return '';
    return text
      .split('\n')
      .map(line => {
        let cleaned = line.trim();
        cleaned = cleaned.replace(/^[\s*•\-+]+/, '');
        cleaned = cleaned.replace(/^\d+[\.\)]\s*/, '');
        return cleaned.trim();
      })
      .filter(line => line.length > 0)
      .join('\n');
  }

  async generateSuggestion(type, context) {
    const text = await this._generate('fast', this._buildPrompt(type, context));
    if (type === 'summary') {
      return text ? text.trim() : '';
    }
    return this.cleanBulletPoints(text);
  }

  /**
   * Build a lean prompt from only the fields each AI type actually needs.
   * Sending less input = lower first-token latency.
   */
  _buildPrompt(type, context) {
    if (type === 'summary') {
      // Only send the fields the summary cares about — not arrays of items.
      const slim = {
        name: context?.contact?.name || '',
        title: context?.contact?.title || '',
        skills: (context?.skills || []).slice(0, 10),
        experience: (context?.experience || []).slice(0, 3).map(e => ({
          title: e.title, company: e.company, startDate: e.startDate, endDate: e.endDate
        })),
        education: (context?.education || []).slice(0, 2).map(e => ({
          degree: e.degree, institution: e.institution
        }))
      };
      return `Write a 3-sentence professional resume summary (implied first-person, no name/pronouns, no bullets) for:\n${JSON.stringify(slim)}`;
    }
    // description — context is a single item object (already lean)
    const slim = {
      title: context?.title || '',
      company: context?.company || context?.name || '',
      description: (context?.description || '').slice(0, 200)
    };
    return `Expert resume writer. Write exactly 3 high-impact bullet points for this role/project:\n${JSON.stringify(slim)}\nRules: active verbs, quantified results, plain text only, one per line, no leading symbols.`;
  }
}

module.exports = new AiService();
