const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { previewResume, previewFromData } = require('../controllers/exportController');

/**
 * @route   GET /api/export/:resumeId/preview
 * @desc    Get raw HTML preview for WYSIWYG rendering (reads from DB)
 * @access  Public
 */
router.get('/:resumeId/preview', previewResume);

/**
 * @route   POST /api/export/preview
 * @desc    Render preview HTML directly from posted data (no DB write)
 * @access  Public
 */
router.post('/preview', previewFromData);

module.exports = router;

