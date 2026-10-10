const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { extractResumeFromFile } = require('../services/extractionService');
const logger = require('../config/logger');

async function uploadAndImport(req, res) {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const jobId = uuidv4();
  const { error: insertError } = await supabase
    .from('import_jobs')
    .insert({ id: jobId, user_id: req.user.id, source_type: req.file.mimetype, status: 'processing' });

  if (insertError) {
    logger.error(`Failed to create import job: ${insertError.message}`);
    return res.status(500).json({ success: false, message: 'Failed to start import' });
  }

  // Background processing
  extractResumeFromFile(req.file.path, req.file.mimetype)
    .then(async ({ resumeData }) => {
      const { error } = await supabase
        .from('import_jobs')
        .update({ status: 'completed', extracted: resumeData, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      if (error) logger.error(`Failed to save completed import job ${jobId}: ${error.message}`);
      else logger.info(`Import job ${jobId} completed`);
    })
    .catch(async (err) => {
      const { error } = await supabase
        .from('import_jobs')
        .update({ status: 'failed', error: err.message, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      if (error) logger.error(`Failed to save failed import job ${jobId}: ${error.message}`);
      logger.error(`Import job ${jobId} failed: ${err.message}`);
    })
    // The uploaded file is only needed for extraction. Keeping it would hold a
    // copy of the candidate's resume on disk (in memory on Cloud Run) forever.
    .finally(() => fs.promises.unlink(req.file.path).catch(() => {}));

  return res.json({ success: true, jobId, message: 'File uploaded and processing started' });
}

async function getJobStatus(req, res) {
  const { data: job, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error || !job) return res.status(404).json({ success: false, message: 'Job not found' });

  return res.json({ success: true, job: { ...job, extracted: job.extracted || {} } });
}

module.exports = { uploadAndImport, getJobStatus };
