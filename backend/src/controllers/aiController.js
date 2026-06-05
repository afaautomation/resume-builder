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
