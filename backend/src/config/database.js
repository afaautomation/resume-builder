const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/resume_builder.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

async function getDb() {
  if (!db) {
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Enable WAL mode and foreign keys
    await db.run('PRAGMA journal_mode = WAL');
    await db.run('PRAGMA foreign_keys = ON');
    await db.run('PRAGMA synchronous = NORMAL');
    
    logger.info(`SQLite connected: ${DB_PATH}`);
    await initSchema(db);
  }
  return db;
}

async function initSchema(db) {
  await db.exec(`
    -- ─── Users ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL,
      phone       TEXT,
      avatar_url  TEXT,
      plan        TEXT NOT NULL DEFAULT 'free',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ─── Templates ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS templates (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT,
      category      TEXT NOT NULL DEFAULT 'modern',
      layout        TEXT NOT NULL DEFAULT 'single',
      thumbnail_url TEXT,
      html_content  TEXT NOT NULL,
      css_content   TEXT NOT NULL,
      is_ats_safe   INTEGER NOT NULL DEFAULT 1,
      is_premium    INTEGER NOT NULL DEFAULT 0,
      tags          TEXT NOT NULL DEFAULT '[]',
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ─── Resumes ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS resumes (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_id     TEXT REFERENCES templates(id),
      title           TEXT NOT NULL DEFAULT 'Untitled Resume',
      slug            TEXT,
      content         TEXT NOT NULL DEFAULT '{}',
      design          TEXT NOT NULL DEFAULT '{}',
      section_order   TEXT NOT NULL DEFAULT '[]',
      ats_score       INTEGER DEFAULT 0,
      ats_feedback    TEXT DEFAULT '[]',
      is_public       INTEGER NOT NULL DEFAULT 0,
      last_exported   TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);

    -- ─── Resume Versions ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS resume_versions (
      id          TEXT PRIMARY KEY,
      resume_id   TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      version_num INTEGER NOT NULL,
      snapshot    TEXT NOT NULL,
      label       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_versions_resume ON resume_versions(resume_id);

    -- ─── Exports ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS exports (
      id          TEXT PRIMARY KEY,
      resume_id   TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      format      TEXT NOT NULL DEFAULT 'pdf',
      file_path   TEXT NOT NULL,
      file_size   INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_exports_resume ON exports(resume_id);

    -- ─── Import Jobs ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS import_jobs (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resume_id     TEXT REFERENCES resumes(id) ON DELETE SET NULL,
      source_type   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      extracted     TEXT DEFAULT '{}',
      error         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ─── Writing Tips ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS writing_tips (
      id        TEXT PRIMARY KEY,
      section   TEXT NOT NULL,
      tip       TEXT NOT NULL,
      example   TEXT,
      tags      TEXT DEFAULT '[]'
    );
  `);

  await db.run(`
    INSERT OR IGNORE INTO users (id, email, password, name, plan) 
    VALUES ('guest_user', 'guest@resumepro.local', 'none', 'Guest User', 'free');
  `);

  try {
    await db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  } catch (err) {
    // Column likely already exists
  }

  logger.info('Database schema initialized and guest user ensured');

  // Auto-seed if empty
  const templateCount = await db.get('SELECT COUNT(*) as count FROM templates');
  if (templateCount.count === 0) {
    logger.info('Templates table is empty. Triggering auto-seed...');
    try {
      // We require it here to avoid circular dependency if any
      const { templates, writingTips } = require('../scripts/seedData'); 
      for (const tmpl of templates) {
        await db.run(
          `INSERT INTO templates (id, name, description, category, layout, thumbnail_url, html_content, css_content, is_ats_safe, is_premium, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          tmpl.id, tmpl.name, tmpl.description, tmpl.category, tmpl.layout, tmpl.thumbnail_url, tmpl.html_content, tmpl.css_content, tmpl.is_ats_safe, tmpl.is_premium, tmpl.tags
        );
      }
      for (const tip of writingTips) {
        await db.run('INSERT INTO writing_tips (id, section, tip, example) VALUES (?, ?, ?, ?)', tip.id, tip.section, tip.tip, tip.example);
      }
      logger.info(`Successfully auto-seeded ${templates.length} templates.`);
    } catch (seedErr) {
      logger.error('Auto-seed failed:', seedErr);
    }
  }
}

module.exports = { getDb };
