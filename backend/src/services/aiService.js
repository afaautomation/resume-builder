const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const logger = require('../config/logger');

// Heavy tasks (ATS, grammar, translate) — quality matters
const HEAVY_MODEL_CHAIN = [
  'gemini-2.5-pro',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-pro',
];

// Fast tasks (suggest summary/description) — speed matters
const FAST_MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-pro',
];

const COOLDOWN_DURATION = 5 * 60 * 1000; // 5 minutes cooldown for unhealthy providers

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
        // We are at the start of a line. We need to wait until we have a newline OR at least 10 characters
        // so we can reliably strip any leading bullet points/numbers.
        const newlineIndex = this.buffer.indexOf('\n');
        if (newlineIndex !== -1 || this.buffer.length >= 10) {
          // Strip leading bullets/numbers from the start of the buffer
          this.buffer = this.buffer
            .replace(/^[\s*•\-+]+/, '')
            .replace(/^\d+[\.\)]\s*/, '');
          
          this.lineStart = false;
        } else {
          // Wait for more chunks to decide
          break;
        }
      }

      // Now we are in the middle of a line (lineStart is false)
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        // We found a newline. Emit everything up to and including the newline.
        const lineContent = this.buffer.slice(0, newlineIndex + 1);
        onCleanedChunk(lineContent);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        this.lineStart = true; // Next chars will be start of a line
      } else {
        // No newline, emit the entire buffer
        onCleanedChunk(this.buffer);
        this.buffer = '';
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
    this.currentKeyIndex = 0;
    
    // Circuit breaker health flags
    this.providerHealth = {
      gemini: true,
      grok: true,
      openrouter: true
    };
    this.healthCooldowns = {
      gemini: 0,
      grok: 0,
      openrouter: 0
    };

    this.init();
  }

  init() {
    let rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    const keys = rawKeys.split(',').map(k => k.trim()).filter(k => !!k);

    this.instances = keys.map((key, idx) => {
      try {
        const genAI = new GoogleGenerativeAI(key);
        return {
          key,
          genAI,
          heavyModels: HEAVY_MODEL_CHAIN.map(name => ({
            name,
            model: genAI.getGenerativeModel({ model: name })
          })),
          fastModels: FAST_MODEL_CHAIN.map(name => ({
            name,
            model: genAI.getGenerativeModel({
              model: name,
              generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
            })
          }))
        };
      } catch (err) {
        logger.error(`[AI] Failed to initialize key index ${idx}: ${err.message}`);
        return null;
      }
    }).filter(inst => inst !== null);

    const xaiKey = process.env.XAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    logger.info(`[AI Init] Gemini Keys Count: ${this.instances.length}`);
    logger.info(`[AI Init] XAI Key: ${xaiKey ? 'Configured' : 'Missing'}`);
    logger.info(`[AI Init] OpenRouter Key: ${openRouterKey ? 'Configured' : 'Missing'}`);

    if (this.instances.length === 0) {
      this.providerHealth.gemini = false;
      this.healthCooldowns.gemini = Infinity; // Disable permanently if no keys
    }
  }

  checkHealth(provider) {
    if (this.providerHealth[provider]) return true;
    
    const now = Date.now();
    if (now - this.healthCooldowns[provider] > COOLDOWN_DURATION) {
      logger.info(`[AI Health] Cooldown expired for ${provider}. Re-enabling...`);
      this.providerHealth[provider] = true;
      return true;
    }
    return false;
  }

  markUnhealthy(provider) {
    logger.warn(`[AI Health] Marking provider ${provider} as UNHEALTHY due to failure. Placing on 5 min cooldown.`);
    this.providerHealth[provider] = false;
    this.healthCooldowns[provider] = Date.now();
  }

  ensureInitialized() {
    // Kept for backward compatibility
  }

  async _generate(type, prompt) {
    // 1. Try Gemini Chain (if healthy)
    if (this.checkHealth('gemini') && this.instances.length > 0) {
      const chainType = type === 'heavy' ? 'heavyModels' : 'fastModels';
      const chainNames = type === 'heavy' ? HEAVY_MODEL_CHAIN : FAST_MODEL_CHAIN;

      const instance = this.instances[this.currentKeyIndex % this.instances.length];
      const modelObj = instance[chainType][0].model;
      const modelName = chainNames[0];

      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI Request Timeout')), 15000)
        );
        const result = await Promise.race([
          modelObj.generateContent(prompt),
          timeoutPromise
        ]);
        
        return result.response.text();
      } catch (err) {
        logger.error(`[AI Gemini Error] Primary attempt failed on ${modelName}: ${err.message}`);
        
        // Mark Gemini unhealthy on structural auth/quota issues so subsequent calls bypass it instantly
        const errMsg = err.message ? err.message.toLowerCase() : '';
        if (errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('permission') || errMsg.includes('403') || errMsg.includes('quota') || errMsg.includes('429')) {
          logger.error(`[AI Gemini Failure] Key/quota issue detected. Disabling Gemini.`);
          this.markUnhealthy('gemini');
        }
      }
    }

    // 2. Fallback to Grok (xAI) (if healthy)
    const xaiKey = process.env.XAI_API_KEY;
    if (xaiKey && this.checkHealth('grok')) {
      logger.info('[AI] Falling back to Grok...');
      try {
        const response = await axios.post('https://api.x.ai/v1/chat/completions', {
          model: 'grok-2',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        }, {
          headers: {
            'Authorization': `Bearer ${xaiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });

        if (response.data?.choices?.[0]?.message?.content) {
          logger.info('[AI] Successfully generated content using Grok.');
          return response.data.choices[0].message.content;
        }
      } catch (err) {
        logger.error(`[AI Grok Error] ${err.response?.data?.error?.message || err.message}`);
        const status = err.response?.status;
        if (status === 400 || status === 401 || status === 403 || status === 429) {
          logger.error(`[AI Grok Failure] Key or credit issue detected. Disabling Grok.`);
          this.markUnhealthy('grok');
        }
      }
    }

    // 3. Fallback to OpenRouter (if healthy)
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey && this.checkHealth('openrouter')) {
      logger.info('[AI] Falling back to OpenRouter...');
      try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1500
        }, {
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/resume-builder',
            'X-Title': 'Resume Builder'
          },
          timeout: 20000
        });

        if (response.data?.choices?.[0]?.message?.content) {
          logger.info('[AI] Successfully generated content using OpenRouter.');
          return response.data.choices[0].message.content;
        }
      } catch (err) {
        logger.error(`[AI OpenRouter Error] ${err.response?.data?.error?.message || err.message}`);
        const status = err.response?.status;
        if (status === 401 || status === 403 || status === 402 || status === 429) {
          logger.error(`[AI OpenRouter Failure] Limits or auth issue detected. Disabling OpenRouter.`);
          this.markUnhealthy('openrouter');
        }
      }
    }

    throw new Error('All AI services (Gemini, Grok, & OpenRouter) are currently exhausted or unavailable.');
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

  async generateSuggestionStream(type, context, onChunk) {
    const prompt = this._buildPrompt(type, context);

    // 1. Try Gemini Streaming (if healthy)
    if (this.checkHealth('gemini') && this.instances.length > 0) {
      const instance = this.instances[this.currentKeyIndex % this.instances.length];
      const modelObj = instance.fastModels[0].model;

      try {
        const cleaner = new StreamCleaner(type);
        const cleanedOnChunk = (chunk) => {
          if (onChunk) onChunk(chunk);
        };

        const result = await modelObj.generateContentStream(prompt);
        let fullText = '';
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullText += chunkText;
            cleaner.process(chunkText, cleanedOnChunk);
          }
        }
        cleaner.flush(cleanedOnChunk);
        if (fullText) return;
      } catch (err) {
        logger.error(`[AI Stream Gemini Error] ${err.message}`);
        const errMsg = err.message ? err.message.toLowerCase() : '';
        if (errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('permission') || errMsg.includes('403') || errMsg.includes('quota') || errMsg.includes('429')) {
          this.markUnhealthy('gemini');
        }
      }
    }

    // 2. Try OpenRouter Streaming Fallback (if healthy)
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey && this.checkHealth('openrouter')) {
      logger.info('[AI Stream] Falling back to OpenRouter streaming...');
      try {
        const cleaner = new StreamCleaner(type);
        const cleanedOnChunk = (chunk) => {
          if (onChunk) onChunk(chunk);
        };

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1500,
          stream: true
        }, {
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/resume-builder',
            'X-Title': 'Resume Builder'
          },
          responseType: 'stream',
          timeout: 25000
        });

        await new Promise((resolve, reject) => {
          let buffer = '';
          response.data.on('data', chunk => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep last incomplete line

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  cleaner.process(content, cleanedOnChunk);
                }
              } catch (e) {}
            }
          });

          response.data.on('end', () => {
            if (buffer.startsWith('data: ')) {
              const dataStr = buffer.slice(6).trim();
              if (dataStr !== '[DONE]') {
                try {
                  const parsed = JSON.parse(dataStr);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) cleaner.process(content, cleanedOnChunk);
                } catch (e) {}
              }
            }
            cleaner.flush(cleanedOnChunk);
            resolve();
          });

          response.data.on('error', err => {
            reject(err);
          });
        });

        return;
      } catch (err) {
        logger.error(`[AI Stream OpenRouter Error] ${err.message}`);
        const status = err.response?.status;
        if (status === 401 || status === 403 || status === 402 || status === 429) {
          this.markUnhealthy('openrouter');
        }
      }
    }

    // 3. Fallback to Grok (xAI) Streaming (if healthy)
    const xaiKey = process.env.XAI_API_KEY;
    if (xaiKey && this.checkHealth('grok')) {
      logger.info('[AI Stream] Falling back to Grok streaming...');
      try {
        const cleaner = new StreamCleaner(type);
        const cleanedOnChunk = (chunk) => {
          if (onChunk) onChunk(chunk);
        };

        const response = await axios.post('https://api.x.ai/v1/chat/completions', {
          model: 'grok-2',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          stream: true
        }, {
          headers: {
            'Authorization': `Bearer ${xaiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          timeout: 25000
        });

        await new Promise((resolve, reject) => {
          let buffer = '';
          response.data.on('data', chunk => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  cleaner.process(content, cleanedOnChunk);
                }
              } catch (e) {}
            }
          });

          response.data.on('end', () => {
            if (buffer.startsWith('data: ')) {
              const dataStr = buffer.slice(6).trim();
              if (dataStr !== '[DONE]') {
                try {
                  const parsed = JSON.parse(dataStr);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) cleaner.process(content, cleanedOnChunk);
                } catch (e) {}
              }
            }
            cleaner.flush(cleanedOnChunk);
            resolve();
          });

          response.data.on('error', err => {
            reject(err);
          });
        });

        return;
      } catch (err) {
        logger.error(`[AI Stream Grok Error] ${err.message}`);
        const status = err.response?.status;
        if (status === 400 || status === 401 || status === 403 || status === 429) {
          this.markUnhealthy('grok');
        }
      }
    }

    // 4. Fallback to final non-streaming if all streaming fails
    logger.info('[AI Stream] All streaming failed/exhausted. Falling back to non-streaming generateSuggestion...');
    try {
      const fallback = await this.generateSuggestion(type, context);
      if (onChunk && fallback) {
        onChunk(fallback);
      }
    } catch (err) {
      logger.error(`[AI Stream Final Fallback Error] ${err.message}`);
      throw err;
    }
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

  _buildPrompt(type, context) {
    if (type === 'summary') {
      return `Write a cohesive, high-impact professional resume summary paragraph for: ${JSON.stringify(context)}. ` +
             `Write the summary in the implied first-person format typical of resumes (e.g., 'Highly motivated professional...' instead of 'I am...' or '[Name] is...'). ` +
             `Do NOT include the candidate's name or any personal pronouns like 'he', 'she', 'they', or 'I'. ` +
             `Do NOT use a numbered list or bullet points. Use a premium professional tone. ` +
             `Highlight key strengths, career focus, and major value proposition in 3-4 powerful sentences.`;
    }
    return `You are an expert resume writer. Write 3 professional, high-impact resume bullet points for: ${JSON.stringify(context)}. ` +
           `Requirements:\n` +
           `1. Tone & Style: Write EXACTLY like a highly-skilled human professional. Avoid typical robotic AI buzzwords and generic filler (e.g., avoid "spearheaded", "leveraged", "synergy", "cutting-edge", "dynamically"). Write with clear, active, and natural language.\n` +
           `2. Structure: Each point must explain a specific responsibility and highlight a realistic, quantifiable achievement (e.g., percentages, time saved, revenue, or team size).\n` +
           `3. Formatting: Output ONLY the raw bullet text itself. Each point must be on a new line. Do NOT prepend any symbols (such as asterisks *, hyphens -, bullets •, or plus signs +) or list numbers (like 1., 2.) at the start. Start each line directly with a strong action verb (e.g., "Designed", "Developed", "Optimized", "Led").`;
  }
}

module.exports = new AiService();
