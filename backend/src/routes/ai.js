const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

router.post('/scan', aiController.scanResume);
router.post('/translate', aiController.translateResume);
router.post('/suggest', aiController.generateSuggestion);

module.exports = router;
