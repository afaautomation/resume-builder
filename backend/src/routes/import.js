const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { uploadAndImport, getJobStatus } = require('../controllers/importController');
const { uploadResume } = require('../middleware/upload');

router.use(authenticate);

/**
 * @route   POST /api/import
 * @desc    Upload PDF/DOCX/image to extract resume data
 * @access  Private
 */
router.post('/', uploadResume, uploadAndImport);

/**
 * @route   GET /api/import/jobs/:id
 * @desc    Get a specific import job with extracted data
 * @access  Private
 */
router.get('/jobs/:id', getJobStatus);

module.exports = router;
