const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticateIdentity } = require('../middleware/auth');

/**
 * AI Deep Scan / translate / suggest.
 *
 * These were completely unauthenticated: anyone on the internet could POST here
 * and spend our Gemini / xAI / OpenRouter quota. They are free for every
 * student, but need a valid session and are rate-limited per user.
 */
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id) || req.ip,
  message: { success: false, message: 'AI request limit reached. Please try again shortly.' },
});

router.use(authenticateIdentity, aiLimiter);

router.post('/scan', aiController.scanResume);
router.post('/translate', aiController.translateResume);
router.post('/suggest', aiController.generateSuggestion);

module.exports = router;
