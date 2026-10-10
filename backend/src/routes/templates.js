const router = require('express').Router();
const { softAuthenticate, authenticate } = require('../middleware/auth');
const { listTemplates, getTemplate, getCategories } = require('../controllers/templateController');

/**
 * @route   GET /api/templates/categories  – Get all template categories and layouts
 * @access  Public (names only — used for marketing copy)
 */
router.get('/categories', getCategories);

/**
 * @route   GET /api/templates              – List templates (with filters)
 * @query   category, layout, ats_only, premium
 * @access  Public — returns metadata and thumbnails only, no template source.
 *          Soft-auth attaches req.user when a token is present but never blocks.
 */
router.get('/', softAuthenticate, listTemplates);

/**
 * @route   GET /api/templates/:id          – Get single template with HTML/CSS
 * @access  Private — any signed-in student
 */
router.get('/:id', authenticate, getTemplate);

module.exports = router;
