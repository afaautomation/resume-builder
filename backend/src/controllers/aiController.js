const aiService = require('../services/aiService');
const localAtsService = require('../services/localAtsService');
const logger = require('../config/logger');

/**
 * Scan Resume - Hybrid Approach
 * Uses local rules for the core score (FREE) and AI for deeper insights if needed.
 */
exports.scanResume = async (req, res) => {
  try {
    const { resumeData, useAi = false, jobDescription = '', targetJob = '' } = req.body;
    if (!resumeData) {
      return res.status(400).json({ success: false, message: 'resumeData is required' });
    }

    // 1. Always do local analysis (FAST & FREE)
    const localResult = localAtsService.analyze(resumeData);

    // 2. If user wants AI "Deep Scan", merge results
    if (useAi) {
      try {
        const aiResult = await aiService.analyzeAts(resumeData, jobDescription, targetJob);
        // Add AI results to the response
        localResult.aiScore = aiResult.score;
        localResult.aiGrade = aiResult.grade;
        localResult.aiFeedback = aiResult.feedback;
        localResult.topImprovements = aiResult.topImprovements || localResult.topImprovements;
      } catch (aiErr) {
        logger.error(`AI Deep Scan failed: ${aiErr.message}`);
      }
    }

    res.json({ success: true, data: localResult });
  } catch (error) {
    logger.error(`ATS Scan Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.translateResume = async (req, res) => {
  try {
    const { resumeData, language } = req.body;
    if (!resumeData || !language) {
      return res.status(400).json({ success: false, message: 'resumeData and language are required' });
    }
    const result = await aiService.translateResume(resumeData, language);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Translation Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.generateSuggestion = async (req, res) => {
  try {
    const { type, context, stream = false } = req.body;
    if (!type || !context) {
      return res.status(400).json({ success: false, message: 'type and context are required' });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      await aiService.generateSuggestionStream(type, context, (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      });

      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const result = await aiService.generateSuggestion(type, context);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`AI Suggestion Error: ${error.message}`, { stack: error.stack });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
};

const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.testKeys = async (req, res) => {
  const results = {
    env: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? `Present (length ${process.env.GEMINI_API_KEY.length}, starts with ${process.env.GEMINI_API_KEY.slice(0, 5)})` : 'Missing',
      GEMINI_API_KEYS: process.env.GEMINI_API_KEYS ? `Present (length ${process.env.GEMINI_API_KEYS.length}, starts with ${process.env.GEMINI_API_KEYS.slice(0, 5)})` : 'Missing',
      XAI_API_KEY: process.env.XAI_API_KEY ? `Present (length ${process.env.XAI_API_KEY.length}, starts with ${process.env.XAI_API_KEY.slice(0, 5)})` : 'Missing',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? `Present (length ${process.env.OPENROUTER_API_KEY.length}, starts with ${process.env.OPENROUTER_API_KEY.slice(0, 5)})` : 'Missing'
    },
    tests: {}
  };

  // 1. Test Gemini
  const geminiKey = process.env.GEMINI_API_KEY || (process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0] : null);
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const r = await model.generateContent('Say Hello');
      results.tests.gemini = { success: true, response: r.response.text() };
    } catch (err) {
      results.tests.gemini = { success: false, error: err.message, status: err.status };
    }
  } else {
    results.tests.gemini = { success: false, error: 'No key available' };
  }

  // 2. Test Grok
  if (process.env.XAI_API_KEY) {
    try {
      const r = await axios.post('https://api.x.ai/v1/chat/completions', {
        model: 'grok-2',
        messages: [{ role: 'user', content: 'Say Hello' }]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      results.tests.grok = { success: true, response: r.data?.choices?.[0]?.message?.content };
    } catch (err) {
      results.tests.grok = { success: false, error: err.message, response: err.response?.data };
    }
  } else {
    results.tests.grok = { success: false, error: 'No key available' };
  }

  // 3. Test OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const r = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Say Hello' }],
        max_tokens: 100
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      results.tests.openrouter = { success: true, response: r.data?.choices?.[0]?.message?.content };
    } catch (err) {
      results.tests.openrouter = { success: false, error: err.message, response: err.response?.data };
    }
  } else {
    results.tests.openrouter = { success: false, error: 'No key available' };
  }

  res.json(results);
};
