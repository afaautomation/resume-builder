const { getDb } = require('../config/database');

async function getTipsBySection(req, res) {
  const { section } = req.params;
  const db = await getDb();
  
  const tips = await db.all('SELECT * FROM writing_tips WHERE section = ?', section);
  
  return res.json({
    success: true,
    section,
    tips: tips.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') }))
  });
}

async function getAllTips(req, res) {
  const db = await getDb();
  const tips = await db.all('SELECT * FROM writing_tips');
  
  // Group by section
  const grouped = tips.reduce((acc, tip) => {
    if (!acc[tip.section]) acc[tip.section] = [];
    acc[tip.section].push({ ...tip, tags: JSON.parse(tip.tags || '[]') });
    return acc;
  }, {});

  return res.json({
    success: true,
    tips: grouped
  });
}

async function getRandomTip(req, res) {
  const { section } = req.params;
  const db = await getDb();
  
  let query = 'SELECT * FROM writing_tips';
  const params = [];
  
  if (section) {
    query += ' WHERE section = ?';
    params.push(section);
  }
  
  query += ' ORDER BY RANDOM() LIMIT 1';
  const tip = await db.get(query, ...params);

  if (!tip) {
    return res.status(404).json({ success: false, message: 'No tips found for this section' });
  }

  return res.json({
    success: true,
    tip: { ...tip, tags: JSON.parse(tip.tags || '[]') }
  });
}

module.exports = { getTipsBySection, getAllTips, getRandomTip };
