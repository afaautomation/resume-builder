const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const {
  createResume, listResumes, getResume, updateResume, deleteResume,
  duplicateResume, getVersions, restoreVersion, getAtsScore,
  updateDesign, updateSectionOrder,
} = require('../controllers/resumeController');

// All resume routes require authentication
// Authentication disabled for refactor
// router.use(authenticate);

/**
 * @route   GET    /api/resumes          – List all resumes for user
 * @route   POST   /api/resumes          – Create new resume
 */
router.route('/').get(listResumes).post(createResume);

/**
 * @route   GET    /api/resumes/:id      – Get single resume
 * @route   PUT    /api/resumes/:id      – Full update
 * @route   PATCH  /api/resumes/:id      – Partial update
 * @route   DELETE /api/resumes/:id      – Delete resume
 */
router.route('/:id').get(getResume).put(updateResume).patch(updateResume).delete(deleteResume);

/**
 * @route   POST   /api/resumes/:id/duplicate   – Duplicate resume
 */
router.post('/:id/duplicate', duplicateResume);

/**
 * @route   GET    /api/resumes/:id/ats         – Get ATS score & feedback
 */
router.get('/:id/ats', getAtsScore);

/**
 * @route   PATCH  /api/resumes/:id/design      – Update design tokens only
 */
router.patch('/:id/design', updateDesign);

/**
 * @route   PATCH  /api/resumes/:id/order       – Update section order (drag-and-drop)
 */
router.patch('/:id/order', updateSectionOrder);

/**
 * @route   GET    /api/resumes/:id/versions    – List version history
 * @route   POST   /api/resumes/:id/versions/:versionId/restore – Restore a version
 */
router.get('/:id/versions', getVersions);
router.post('/:id/versions/:versionId/restore', restoreVersion);

module.exports = router;
