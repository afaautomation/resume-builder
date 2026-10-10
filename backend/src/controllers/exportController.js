const { supabase } = require('../config/supabase');
const { generatePreviewHtml } = require('../services/previewService');
const logger = require('../config/logger');

const NO_TEMPLATE_HTML = `
  <div style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; color: #64748b; background: #f8fafc; text-align: center; padding: 2rem;">
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem; opacity: 0.5;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/></svg>
    <h2 style="margin: 0 0 0.5rem 0; color: #1e293b;">No Template Selected</h2>
    <p style="margin: 0;">Please select a template in the design sidebar to preview your resume.</p>
  </div>
`;

/**
 * GET /api/export/:resumeId/preview
 * Renders an HTML preview by reading from the database.
 */
async function previewResume(req, res) {
  const { resumeId } = req.params;

  const { data: resume, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', resumeId)
    .maybeSingle();

  if (error || !resume) return res.status(404).send('Resume not found');

  // This query runs with the service-role key, which bypasses RLS, so the
  // ownership check has to happen here. Without it any signed-in user could
  // read any resume by id. `is_public` resumes are deliberately still shareable.
  const isOwner = resume.user_id === req.user.id;
  if (!isOwner && !resume.is_public) {
    logger.warn(`User ${req.user.id} attempted to preview resume ${resumeId} owned by ${resume.user_id}`);
    return res.status(404).send('Resume not found');
  }

  const template = resume.template_id ? await loadTemplate(resume.template_id) : null;

  if (!template || !template.html_content) {
    return res.send(NO_TEMPLATE_HTML);
  }

  const previewHtml = generatePreviewHtml(resume.content || {}, resume.design || {}, template.html_content, template.css_content, resume.section_order);
  res.send(previewHtml);
}

// Templates only change when `npm run seed` runs (at startup), so keep them in
// memory instead of fetching from Supabase on every preview (~350 ms each).
const TEMPLATE_CACHE_TTL_MS = 10 * 60 * 1000;
const templateCache = new Map(); // templateId -> { template, until }

async function loadTemplate(templateId) {
  if (!templateId) templateId = 'd8ab5600-a6de-4059-988a-72e4df7b2bc4';

  const hit = templateCache.get(templateId);
  if (hit && hit.until > Date.now()) return hit.template;

  const legacyMap = {
    'tmpl_classic_1': 'Classic Serif',
    'tmpl_modern_1': 'Minimalist Executive',
    'tmpl_minimal_1': 'Minimalist Executive',
    'tmpl_exec_1': 'Minimalist Executive',
    'tmpl_academic_1': 'Academic Professional'
  };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId);
  let query = supabase.from('resume_templates').select('html_content, css_content');
  if (isUuid) {
    query = query.eq('id', templateId);
  } else if (legacyMap[templateId]) {
    query = query.eq('name', legacyMap[templateId]);
  } else {
    query = query.limit(1);
  }

  let { data: template, error } = await query.maybeSingle();

  if (error || !template || !template.html_content) {
    const { data: fallback } = await supabase.from('resume_templates').select('html_content, css_content').limit(1).maybeSingle();
    template = fallback;
  }

  if (!template || !template.html_content) return null;
  templateCache.set(templateId, { template, until: Date.now() + TEMPLATE_CACHE_TTL_MS });
  return template;
}

const TEMPLATE_NOT_FOUND_HTML = `
      <div style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; color: #64748b; background: #f8fafc; text-align: center; padding: 2rem;">
        <h2 style="margin: 0 0 0.5rem 0; color: #1e293b;">Template not found</h2>
        <p style="margin: 0;">The selected template could not be loaded.</p>
      </div>
    `;

/**
 * POST /api/export/preview
 * Renders a live preview directly from posted content+design+templateId.
 * DOES NOT read from or write to the resume table (only fetches template HTML/CSS).
 * Body: { content, design, templateId }
 */
async function previewFromData(req, res) {
  const { content, design, templateId, sectionOrder } = req.body;

  if (!templateId) {
    return res.status(400).json({ success: false, message: 'templateId is required' });
  }

  const template = await loadTemplate(templateId);
  if (!template) return res.send(TEMPLATE_NOT_FOUND_HTML);

  const previewHtml = generatePreviewHtml(
    content || {},
    design || {},
    template.html_content,
    template.css_content,
    sectionOrder
  );

  res.send(previewHtml);
}

/**
 * POST /api/export/download
 * Clean HTML for the PDF. Free and unlimited for every signed-in student.
 * Body: { content, design, templateId }
 */
async function downloadFromData(req, res) {
  const { content, design, templateId, sectionOrder } = req.body;

  if (!templateId) {
    return res.status(400).json({ success: false, message: 'templateId is required' });
  }

  const template = await loadTemplate(templateId);
  if (!template) {
    return res.status(404).json({ success: false, message: 'The selected template could not be loaded.' });
  }

  const html = generatePreviewHtml(
    content || {},
    design || {},
    template.html_content,
    template.css_content,
    sectionOrder
  );

  res.send(html);
}

module.exports = { previewResume, previewFromData, downloadFromData };
