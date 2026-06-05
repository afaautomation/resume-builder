const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/database');
const { scoreResume } = require('../services/atsService');
const logger = require('../config/logger');

const DEFAULT_CONTENT = JSON.stringify({
  contact: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '' },
  summary: '', experience: [], education: [], skills: [], certifications: [], projects: [], languages: [], awards: [], customSections: [],
});
const DEFAULT_DESIGN = JSON.stringify({ primaryColor: '#2563EB', fontFamily: 'Inter, sans-serif', fontSize: 11 });
const DEFAULT_ORDER = JSON.stringify(['contact', 'summary', 'experience', 'education', 'skills']);

async function saveVersion(db, resumeId, snapshot, label) {
  const lastVer = await db.get('SELECT version_num FROM resume_versions WHERE resume_id = ? ORDER BY version_num DESC LIMIT 1', resumeId);
  const nextNum = lastVer ? lastVer.version_num + 1 : 1;
  await db.run('INSERT INTO resume_versions (id, resume_id, version_num, snapshot, label) VALUES (?, ?, ?, ?, ?)', uuidv4(), resumeId, nextNum, JSON.stringify(snapshot), label || null);
}

async function createResume(req, res) {
  const { title, templateId, content, design, sectionOrder } = req.body;
  const db = await getDb();
  const id = uuidv4();

  // Default to the first modern template if none provided
  const finalTemplateId = templateId || 'tmpl_modern_1';

  if (finalTemplateId) {
    const tmpl = await db.get('SELECT id FROM templates WHERE id = ?', finalTemplateId);
    if (!tmpl) {
      if (templateId) return res.status(404).json({ success: false, message: 'Template not found' });
      // If default template isn't found, just proceed with null (user will have to select one)
    }
  }

  await db.run(
    `INSERT INTO resumes (id, user_id, template_id, title, content, design, section_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, (req.user ? req.user.id : 'guest_user'), finalTemplateId || null, title || 'Untitled Resume', content ? JSON.stringify(content) : DEFAULT_CONTENT, design ? JSON.stringify(design) : DEFAULT_DESIGN, sectionOrder ? JSON.stringify(sectionOrder) : DEFAULT_ORDER
  );

  const resume = await db.get('SELECT * FROM resumes WHERE id = ?', id);
  return res.status(201).json({ success: true, resume: parseResume(resume) });
}

async function listResumes(req, res) {
  const db = await getDb();
  const resumes = await db.all('SELECT r.*, t.name AS template_name FROM resumes r LEFT JOIN templates t ON r.template_id = t.id WHERE r.user_id = ? ORDER BY r.updated_at DESC', (req.user ? req.user.id : 'guest_user'));
  return res.json({ success: true, resumes: resumes.map(parseResume) });
}

async function getResume(req, res) {
  const db = await getDb();
  const resume = await db.get('SELECT r.*, t.html_content, t.css_content FROM resumes r LEFT JOIN templates t ON r.template_id = t.id WHERE r.id = ? AND (r.user_id = ? OR r.is_public = 1)', req.params.id, (req.user ? req.user.id : 'guest_user'));
  if (!resume) return res.status(404).json({ success: false, message: 'Resume not found' });
  return res.json({ success: true, resume: parseResume(resume) });
}

async function updateResume(req, res) {
  const db = await getDb();
  const existing = await db.get('SELECT * FROM resumes WHERE id = ? AND user_id = ?', req.params.id, (req.user ? req.user.id : 'guest_user'));
  if (!existing) return res.status(404).json({ success: false, message: 'Resume not found' });

  const { title, templateId, content, design, sectionOrder, isPublic } = req.body;

  let atsScore = existing.ats_score;
  let atsFeedback = existing.ats_feedback;


  await db.run(
    `UPDATE resumes SET title = COALESCE(?, title), template_id = COALESCE(?, template_id), content = COALESCE(?, content), design = COALESCE(?, design), section_order = COALESCE(?, section_order), is_public = COALESCE(?, is_public), ats_score = ?, ats_feedback = ?, updated_at = datetime('now') WHERE id = ?`,
    title || null, templateId || null, content ? JSON.stringify(content) : null, design ? JSON.stringify(design) : null, sectionOrder ? JSON.stringify(sectionOrder) : null, isPublic !== undefined ? (isPublic ? 1 : 0) : null, atsScore, atsFeedback, req.params.id
  );

  const updated = await db.get('SELECT * FROM resumes WHERE id = ?', req.params.id);
  return res.json({ success: true, resume: parseResume(updated) });
}

async function deleteResume(req, res) {
  const db = await getDb();
  const result = await db.run('DELETE FROM resumes WHERE id = ? AND user_id = ?', req.params.id, (req.user ? req.user.id : 'guest_user'));
  if (result.changes === 0) return res.status(404).json({ success: false, message: 'Resume not found' });
  return res.json({ success: true, message: 'Resume deleted' });
}

async function getAtsScore(req, res) {
  const db = await getDb();
  const resume = await db.get('SELECT * FROM resumes WHERE id = ? AND user_id = ?', req.params.id, (req.user ? req.user.id : 'guest_user'));
  if (!resume) return res.status(404).json({ success: false, message: 'Resume not found' });
  const result = await scoreResume(JSON.parse(resume.content), resume.template_id);
  await db.run('UPDATE resumes SET ats_score = ?, ats_feedback = ?, updated_at = datetime("now") WHERE id = ?', result.score, JSON.stringify(result.feedback), resume.id);
  return res.json({ success: true, ats: result });
}

async function duplicateResume(req, res) {
  const db = await getDb();
  const original = await db.get('SELECT * FROM resumes WHERE id = ? AND user_id = ?', req.params.id, (req.user ? req.user.id : 'guest_user'));
  if (!original) return res.status(404).json({ success: false, message: 'Resume not found' });

  const id = uuidv4();
  await db.run(
    `INSERT INTO resumes (id, user_id, template_id, title, content, design, section_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, (req.user ? req.user.id : 'guest_user'), original.template_id, `${original.title} (Copy)`, original.content, original.design, original.section_order
  );

  const duplicated = await db.get('SELECT * FROM resumes WHERE id = ?', id);
  return res.status(201).json({ success: true, resume: parseResume(duplicated) });
}

async function getVersions(req, res) {
  const db = await getDb();
  const versions = await db.all('SELECT id, version_num, label, created_at FROM resume_versions WHERE resume_id = ? ORDER BY version_num DESC', req.params.id);
  return res.json({ success: true, versions });
}

async function restoreVersion(req, res) {
  const db = await getDb();
  const version = await db.get('SELECT * FROM resume_versions WHERE id = ? AND resume_id = ?', req.params.versionId, req.params.id);
  if (!version) return res.status(404).json({ success: false, message: 'Version not found' });

  await db.run('UPDATE resumes SET content = ?, updated_at = datetime("now") WHERE id = ?', version.snapshot, req.params.id);
  const updated = await db.get('SELECT * FROM resumes WHERE id = ?', req.params.id);
  return res.json({ success: true, resume: parseResume(updated) });
}

async function updateDesign(req, res) {
  const db = await getDb();
  const { design } = req.body;
  await db.run('UPDATE resumes SET design = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?', JSON.stringify(design), req.params.id, (req.user ? req.user.id : 'guest_user'));
  const updated = await db.get('SELECT * FROM resumes WHERE id = ?', req.params.id);
  return res.json({ success: true, resume: parseResume(updated) });
}

async function updateSectionOrder(req, res) {
  const db = await getDb();
  const { sectionOrder } = req.body;
  await db.run('UPDATE resumes SET section_order = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?', JSON.stringify(sectionOrder), req.params.id, (req.user ? req.user.id : 'guest_user'));
  const updated = await db.get('SELECT * FROM resumes WHERE id = ?', req.params.id);
  return res.json({ success: true, resume: parseResume(updated) });
}

function parseResume(r) {
  if (!r) return null;
  return { ...r, content: JSON.parse(r.content || '{}'), design: JSON.parse(r.design || '{}'), sectionOrder: JSON.parse(r.section_order || '[]'), atsFeedback: JSON.parse(r.ats_feedback || '[]'), isPublic: Boolean(r.is_public) };
}

module.exports = { createResume, listResumes, getResume, updateResume, deleteResume, getAtsScore, duplicateResume, getVersions, restoreVersion, updateDesign, updateSectionOrder };
