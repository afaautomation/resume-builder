const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authenticatePreview, softAuthenticate } = require('../middleware/auth');

// The editor re-renders the preview as the student types, so it needs more
// headroom than the general API limit (about one render per second).
const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 900,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many preview requests, please slow down.' },
});
const { previewResume, previewFromData, downloadFromData } = require('../controllers/exportController');

// Both preview routes were public. `GET /:resumeId/preview` read any row by id
// using the service-role key, so anyone who knew or guessed a resume UUID could
// read a stranger's full resume — name, email, phone, employment history.
// A session is required; ownership is checked separately in the controller.
//
// Editing, previewing and downloading are all free for signed-in students.
// Previews use the cached, lightweight check (they run on every edit and need
// only the user id).

/**
 * @route   GET /api/export/:resumeId/preview
 * @desc    Rendered HTML for a saved resume
 * @access  Private — owner only (enforced in the controller)
 */
router.get('/:resumeId/preview', authenticatePreview, previewResume);

/**
 * @route   POST /api/export/preview
 * @desc    Render preview HTML from posted data (no DB write)
 * @access  Public / Soft-auth (renders preview smoothly even if token expired)
 */
router.post('/preview', previewLimiter, softAuthenticate, previewFromData);

/**
 * @route   POST /api/export/download
 * @desc    Clean HTML the client turns into the PDF. Free and unlimited.
 * @access  Public / Soft-auth
 */
router.post('/download', softAuthenticate, downloadFromData);

module.exports = router;
