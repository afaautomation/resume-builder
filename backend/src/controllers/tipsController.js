const { supabase } = require('../config/supabase');
const logger = require('../config/logger');

async function getTipsBySection(req, res) {
  const { section } = req.params;
  const { data: tips, error } = await supabase.from('writing_tips').select('*').eq('section', section);

  if (error) {
    logger.error(`getTipsBySection failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load tips' });
  }

  return res.json({
    success: true,
    section,
    tips: (tips || []).map((t) => ({ ...t, tags: t.tags || [] })),
  });
}

async function getAllTips(req, res) {
  const { data: tips, error } = await supabase.from('writing_tips').select('*');

  if (error) {
    logger.error(`getAllTips failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load tips' });
  }

  // Group by section
  const grouped = (tips || []).reduce((acc, tip) => {
    if (!acc[tip.section]) acc[tip.section] = [];
    acc[tip.section].push({ ...tip, tags: tip.tags || [] });
    return acc;
  }, {});

  return res.json({ success: true, tips: grouped });
}

async function getRandomTip(req, res) {
  const { section } = req.params;

  let query = supabase.from('writing_tips').select('*');
  if (section) query = query.eq('section', section);

  const { data: tips, error } = await query;

  if (error || !tips || tips.length === 0) {
    return res.status(404).json({ success: false, message: 'No tips found for this section' });
  }

  // Table is small (a handful of rows per section), so picking randomly in JS after
  // fetching is simpler than a Postgres-side RANDOM() ordering via supabase-js.
  const tip = tips[Math.floor(Math.random() * tips.length)];

  return res.json({ success: true, tip: { ...tip, tags: tip.tags || [] } });
}

module.exports = { getTipsBySection, getAllTips, getRandomTip };
