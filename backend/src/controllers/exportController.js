const { getDb } = require('../config/database');
const { generatePreviewHtml } = require('../services/pdfService');
const logger = require('../config/logger');

/**
 * GET /api/export/:resumeId/preview
 * Renders an HTML preview by reading from the database.
 */
async function previewResume(req, res) {
  const { resumeId } = req.params;
  const db = await getDb();

  const resume = await db.get(
    `SELECT r.*, t.html_content, t.css_content 
     FROM resumes r 
     LEFT JOIN templates t ON r.template_id = t.id 
     WHERE r.id = ?`,
    resumeId
  );

  if (!resume) return res.status(404).send('Resume not found');

  if (!resume.html_content) {
    return res.send(`
      <div style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; color: #64748b; background: #f8fafc; text-align: center; padding: 2rem;">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem; opacity: 0.5;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/></svg>
        <h2 style="margin: 0 0 0.5rem 0; color: #1e293b;">No Template Selected</h2>
        <p style="margin: 0;">Please select a template in the design sidebar to preview your resume.</p>
      </div>
    `);
  }

  const content = JSON.parse(resume.content || '{}');
  const design = JSON.parse(resume.design || '{}');
  const previewHtml = generatePreviewHtml(content, design, resume.html_content, resume.css_content);
  res.send(previewHtml);
}

/**
 * POST /api/export/preview
 * Renders a live preview directly from posted content+design+templateId.
 * DOES NOT read from or write to the database (except to fetch template HTML/CSS).
 * Body: { content, design, templateId }
 */
async function previewFromData(req, res) {
  const { content, design, templateId } = req.body;

  if (!templateId) {
    return res.status(400).json({ success: false, message: 'templateId is required' });
  }

  const db = await getDb();
  const template = await db.get(
    'SELECT html_content, css_content FROM templates WHERE id = ?',
    templateId
  );

  if (!template || !template.html_content) {
    return res.send(`
      <div style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; color: #64748b; background: #f8fafc; text-align: center; padding: 2rem;">
        <h2 style="margin: 0 0 0.5rem 0; color: #1e293b;">Template not found</h2>
        <p style="margin: 0;">The selected template could not be loaded.</p>
      </div>
    `);
  }

  const previewHtml = generatePreviewHtml(
    content || {},
    design || {},
    template.html_content,
    template.css_content
  );
  res.send(previewHtml);
}

module.exports = { previewResume, previewFromData };
