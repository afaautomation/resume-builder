const aiService = require('./aiService');
const localAtsService = require('./localAtsService');

/**
 * ATS Optimization Service - Hybrid Approach
 * 1. Performs instant local analysis (FREE)
 * 2. Attempts to enhance with AI deep insights if available.
 */
async function scoreResume(resumeContent, templateId = '') {
  const data = typeof resumeContent === 'string' ? JSON.parse(resumeContent) : resumeContent;
  
  // 1. Core Structural Analysis (FAST & FREE)
  const result = localAtsService.analyze(data);

  try {
    // 2. Attempt Deep AI Enhancement
    const aiResult = await aiService.analyzeAts(data);
    
    // Merge AI improvements if they are better/deeper
    if (aiResult.topImprovements && aiResult.topImprovements.length > 0) {
      result.topImprovements = aiResult.topImprovements;
    }
    
    // Keep local structural feedback but add AI feedback if relevant
    if (aiResult.feedback) {
      result.aiFeedback = aiResult.feedback;
    }
    
    // Use AI score if it provides a different perspective
    // (Optional: can also average them or keep local as baseline)
    result.score = Math.round((result.score + (aiResult.score || result.score)) / 2);
    
  } catch (error) {
    console.warn('AI ATS Deep Scan failed, using local analysis only:', error.message);
    // result already contains the local analysis, so we just return it.
  }

  return result;
}

module.exports = { scoreResume };
