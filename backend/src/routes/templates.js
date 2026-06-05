const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { listTemplates, getTemplate, getCategories } = require('../controllers/templateController');

/**
 * @route   GET /api/templates/categories  – Get all template categories and layouts
 * @access  Public
 */
router.get('/categories', getCategories);

/**
 * @route   GET /api/templates              – List templates (with filters)
 * @query   category, layout, ats_only, premium
 * @access  Public (premium flag filtered for free users)
 */
router.get('/', async (req, res, next) => {
  // Soft-auth: attach user if token present, but don't block
  const jwt = require('jsonwebtoken');
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
      const { getDb } = require('../config/database');
      const db = await getDb();
      req.user = await db.get('SELECT id, plan FROM users WHERE id = ?', decoded.id);
    } catch (err) {
      // Ignore auth errors for soft-auth
    }
  }
  next();
}, listTemplates);

/**
 * @route   GET /api/templates/:id          – Get single template with HTML/CSS
 * @access  Private (premium gated)
 */
router.get('/:id', getTemplate);

module.exports = router;
