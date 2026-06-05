const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/database');
const { extractResumeData } = require('../services/extractionService');
const logger = require('../config/logger');

async function uploadAndImport(req, res) {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const db = await getDb();
  const jobId = uuidv4();
  
  await db.run('INSERT INTO import_jobs (id, user_id, source_type, status) VALUES (?, ?, ?, ?)',
    jobId, req.user.id, req.file.mimetype, 'processing'
  );

  // Background processing
  extractResumeData(req.file.path, req.file.mimetype)
    .then(async (data) => {
      await db.run('UPDATE import_jobs SET status = ?, extracted = ?, updated_at = datetime("now") WHERE id = ?',
        'completed', JSON.stringify(data), jobId
      );
      logger.info(`Import job ${jobId} completed`);
    })
    .catch(async (err) => {
      await db.run('UPDATE import_jobs SET status = ?, error = ?, updated_at = datetime("now") WHERE id = ?',
        'failed', err.message, jobId
      );
      logger.error(`Import job ${jobId} failed: ${err.message}`);
    });

  return res.json({ success: true, jobId, message: 'File uploaded and processing started' });
}

async function getJobStatus(req, res) {
  const db = await getDb();
  const job = await db.get('SELECT * FROM import_jobs WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

  return res.json({
    success: true,
    job: {
      ...job,
      extracted: JSON.parse(job.extracted || '{}')
    }
  });
}

module.exports = { uploadAndImport, getJobStatus };
