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

const RETRY_DELAYS = [1000, 3000, 10000]; // Shorter delays for rotation

class AiService {
  constructor() {
    this.instances = [];
    this.currentKeyIndex = 0;
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

    if (this.instances.length === 0) {
      logger.error('No valid GEMINI_API_KEY or GEMINI_API_KEYS found in environment.');
    } else {
      logger.info(`[AI] Initialized with ${this.instances.length} API keys.`);
    }
  }

  ensureInitialized() {
    // If no Gemini keys, we might still have Grok, so we don't throw yet
  }

  async _generate(type, prompt) {
    const chainType = type === 'heavy' ? 'heavyModels' : 'fastModels';
    const chainNames = type === 'heavy' ? HEAVY_MODEL_CHAIN : FAST_MODEL_CHAIN;

    // 1. Try Gemini Chain
    if (this.instances.length > 0) {
      for (let modelIdx = 0; modelIdx < chainNames.length; modelIdx++) {
        const modelName = chainNames[modelIdx];

        for (let keyAttempt = 0; keyAttempt < this.instances.length; keyAttempt++) {
          const instanceIdx = (this.currentKeyIndex + keyAttempt) % this.instances.length;
          const instance = this.instances[instanceIdx];
          const modelObj = instance[chainType][modelIdx].model;

          for (let retry = 0; retry <= RETRY_DELAYS.length; retry++) {
            try {
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('AI Request Timeout')), 30000)
              );
              const result = await Promise.race([
                modelObj.generateContent(prompt),
                timeoutPromise
              ]);
              
              this.currentKeyIndex = instanceIdx;
              return result.response.text();
            } catch (err) {
              const is429 = err?.message?.includes('429') || err?.status === 429;
              const isQuota = err?.message?.includes('quota') || err?.message?.includes('limit');

              if (is429 || isQuota) {
                if (retry < RETRY_DELAYS.length) {
                  const delay = RETRY_DELAYS[retry];
                  logger.warn(`[AI] Key ${instanceIdx+1} limited on ${modelName}. Retry ${retry+1}/${RETRY_DELAYS.length} in ${delay}ms...`);
                  await new Promise(r => setTimeout(r, delay));
                  continue;
                }
                break; 
              } else {
                logger.error(`[AI Gemini Error] ${err.message}`);
                break; // Try next model/key
              }
            }
          }
        }
      }
    }

    // 2. Fallback to Grok (xAI)
    const xaiKey = process.env.XAI_API_KEY;
    if (xaiKey) {
      logger.info('[AI] Gemini exhausted or unavailable. Falling back to Grok...');
      try {
        const response = await axios.post('https://api.x.ai/v1/chat/completions', {
          model: 'grok-beta',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        }, {
          headers: {
            'Authorization': `Bearer ${xaiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 45000
        });

        if (response.data?.choices?.[0]?.message?.content) {
          logger.info('[AI] Successfully generated content using Grok.');
          return response.data.choices[0].message.content;
        }
      } catch (err) {
        logger.error(`[AI Grok Error] ${err.response?.data?.error?.message || err.message}`);
      }
    }

    // 3. Fallback to OpenRouter
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey) {
      logger.info('[AI] Gemini and Grok exhausted. Falling back to OpenRouter...');
      try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: 'google/gemini-pro-1.5-exp', // Or another reliable model
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        }, {
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/resume-builder', // Recommended by OpenRouter
            'X-Title': 'Resume Builder'
          },
          timeout: 60000
        });

        if (response.data?.choices?.[0]?.message?.content) {
          logger.info('[AI] Successfully generated content using OpenRouter.');
          return response.data.choices[0].message.content;
        }
      } catch (err) {
        logger.error(`[AI OpenRouter Error] ${err.response?.data?.error?.message || err.message}`);
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
      // 1. Try direct parse
      return JSON.parse(text.trim());
    } catch (e) {
      // 2. Try to find JSON block
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
    const chainType = 'fastModels';
    const chainNames = FAST_MODEL_CHAIN;
    const prompt = this._buildPrompt(type, context);

    for (let modelIdx = 0; modelIdx < chainNames.length; modelIdx++) {
      const modelName = chainNames[modelIdx];

      for (let keyAttempt = 0; keyAttempt < this.instances.length; keyAttempt++) {
        const instanceIdx = (this.currentKeyIndex + keyAttempt) % this.instances.length;
        const instance = this.instances[instanceIdx];
        const modelObj = instance[chainType][modelIdx].model;

        try {
          const result = await modelObj.generateContentStream(prompt);
          let fullText = '';
          for await (const chunk of result.stream) {
            try {
              const chunkText = chunk.text();
              if (chunkText) {
                fullText += chunkText;
                if (onChunk) onChunk(chunkText);
              }
            } catch (chunkErr) {
              logger.warn(`[AI Stream] Failed to get text from chunk: ${chunkErr.message}`);
            }
          }
          
          if (fullText) {
            this.currentKeyIndex = instanceIdx;
            return;
          }
        } catch (err) {
          logger.warn(`[AI Stream] Key ${instanceIdx+1} failed on ${modelName}: ${err.message}. Trying next...`);
          // Continue to next key/model
        }
      }
    }

    // Final fallback to non-streaming if all else fails
    try {
      const fallback = await this.generateSuggestion(type, context);
      if (onChunk) onChunk(fallback);
    } catch (err) {
      logger.error(`[AI Stream] All streaming attempts and fallback failed: ${err.message}`);
      throw err;
    }
  }

  async generateSuggestion(type, context) {
    return this._generate('fast', this._buildPrompt(type, context));
  }

  _buildPrompt(type, context) {
    if (type === 'summary') {
      return `Write a cohesive, high-impact professional resume summary paragraph for: ${JSON.stringify(context)}. ` +
             `Write the summary in the implied first-person format typical of resumes (e.g., 'Highly motivated professional...' instead of 'I am...' or '[Name] is...'). ` +
             `Do NOT include the candidate's name or any personal pronouns like 'he', 'she', 'they', or 'I'. ` +
             `Do NOT use a numbered list or bullet points. Use a premium professional tone. ` +
             `Highlight key strengths, career focus, and major value proposition in 3-4 powerful sentences.`;
    }
    return `Write 3 professional, high-impact resume bullet points for: ${JSON.stringify(context)}. ` +
           `Each bullet should explain a specific responsibility and highlight a quantifiable achievement. ` +
           `Do NOT include numbers (1, 2, 3) at the start. Just the bullet text itself.`;
  }
}

module.exports = new AiService();
