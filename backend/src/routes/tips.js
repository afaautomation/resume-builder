const router = require('express').Router();
const {
  getTipsBySection, getAllTips, getRandomTip,
} = require('../controllers/tipsController');

/**
 * @route   GET /api/tips
 * @desc    Get all tips grouped by section
 * @access  Public
 */
router.get('/', getAllTips);

/**
 * @route   GET /api/tips/:section
 * @desc    Get all tips for a specific section
 * @access  Public
 */
router.get('/:section', getTipsBySection);

/**
 * @route   GET /api/tips/:section/random
 * @desc    Get a single random tip for inline guidance
 * @access  Public
 */
router.get('/:section/random', getRandomTip);

module.exports = router;
