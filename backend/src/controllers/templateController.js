const { getDb } = require('../config/database');

async function listTemplates(req, res) {
  const { category, layout, ats_only, premium_only } = req.query;
  const db = await getDb();
  
  let query = 'SELECT id, name, description, category, layout, thumbnail_url, is_ats_safe, is_premium, tags FROM templates WHERE 1=1';
  const params = [];

  if (category) { query += ' AND category = ?'; params.push(category); }
  if (layout) { query += ' AND layout = ?'; params.push(layout); }
  if (ats_only === 'true') { query += ' AND is_ats_safe = 1'; }
  if (premium_only === 'true') { query += ' AND is_premium = 1'; }

  query += ' ORDER BY sort_order ASC, created_at DESC';
  const templates = await db.all(query, ...params);

  return res.json({
    success: true,
    count: templates.length,
    templates: templates.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]'), isAtsSafe: Boolean(t.is_ats_safe), isPremium: Boolean(t.is_premium) }))
  });
}

async function getTemplate(req, res) {
  const db = await getDb();
  const template = await db.get('SELECT * FROM templates WHERE id = ?', req.params.id);
  
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }

  return res.json({
    success: true,
    template: {
      ...template,
      tags: JSON.parse(template.tags || '[]'),
      isAtsSafe: Boolean(template.is_ats_safe),
      isPremium: Boolean(template.is_premium)
    }
  });
}

async function getCategories(req, res) {
  const db = await getDb();
  const categories = await db.all('SELECT DISTINCT category FROM templates');
  const layouts = await db.all('SELECT DISTINCT layout FROM templates');

  return res.json({
    success: true,
    categories: categories.map(c => c.category),
    layouts: layouts.map(l => l.layout)
  });
}

module.exports = { listTemplates, getTemplate, getCategories };
