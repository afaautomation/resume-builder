const { supabase } = require('../config/supabase');
const logger = require('../config/logger');

async function listTemplates(req, res) {
  const { category, layout, ats_only, premium_only } = req.query;

  let query = supabase
    .from('resume_templates')
    .select('id, name, description, category, layout, thumbnail_url, is_ats_safe, is_premium, tags')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (category) query = query.eq('category', category);
  if (layout) query = query.eq('layout', layout);
  if (ats_only === 'true') query = query.eq('is_ats_safe', true);
  if (premium_only === 'true') query = query.eq('is_premium', true);

  const { data: templates, error } = await query;

  if (error) {
    logger.error(`listTemplates failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load templates' });
  }

  return res.json({
    success: true,
    count: templates.length,
    templates: templates.map((t) => ({
      ...t,
      tags: t.tags || [],
      isAtsSafe: Boolean(t.is_ats_safe),
      isPremium: Boolean(t.is_premium),
    })),
  });
}

async function getTemplate(req, res) {
  const { data: template, error } = await supabase
    .from('resume_templates')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error || !template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }

  return res.json({
    success: true,
    template: {
      ...template,
      tags: template.tags || [],
      isAtsSafe: Boolean(template.is_ats_safe),
      isPremium: Boolean(template.is_premium),
    },
  });
}

async function getCategories(req, res) {
  const { data, error } = await supabase.from('resume_templates').select('category, layout');

  if (error) {
    logger.error(`getCategories failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load categories' });
  }

  return res.json({
    success: true,
    categories: [...new Set((data || []).map((c) => c.category))],
    layouts: [...new Set((data || []).map((l) => l.layout))],
  });
}

module.exports = { listTemplates, getTemplate, getCategories };
