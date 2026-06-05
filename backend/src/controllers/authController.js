const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { generateTokens } = require('../middleware/auth');
const logger = require('../config/logger');

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  const { name, email, phone, password } = req.body;
  const db = await getDb();

  const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
  if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 12);
  const id = uuidv4();
  await db.run('INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)', id, email, hashed, name, phone || null);

  const { access, refresh } = generateTokens(id);
  logger.info(`New user registered: ${email}`);
  return res.status(201).json({
    success: true,
    user: { id, email, name, phone: phone || null, plan: 'free' },
    tokens: { access, refresh },
  });
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  const { email, password } = req.body;
  const db = await getDb();

  const user = await db.get('SELECT * FROM users WHERE email = ?', email);
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const { access, refresh } = generateTokens(user.id);
  logger.info(`User logged in: ${email}`);
  return res.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    tokens: { access, refresh },
  });
}

async function refreshToken(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required' });

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { access, refresh } = generateTokens(decoded.id);
    return res.json({ success: true, tokens: { access, refresh } });
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
}

async function getMe(req, res) {
  const db = await getDb();
  const user = await db.get('SELECT id, email, name, plan, avatar_url, created_at FROM users WHERE id = ?', req.user.id);
  return res.json({ success: true, user });
}

async function updateProfile(req, res) {
  const { name, currentPassword, newPassword } = req.body;
  const db = await getDb();
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password required' });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ success: false, message: 'Current password incorrect' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await db.run('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?', hashed, req.user.id);
  }

  if (name) {
    await db.run('UPDATE users SET name = ?, updated_at = datetime("now") WHERE id = ?', name, req.user.id);
  }

  const updated = await db.get('SELECT id, email, name, plan, avatar_url FROM users WHERE id = ?', req.user.id);
  return res.json({ success: true, user: updated });
}

const { appendUserToSheet, getUserByPhone } = require('../services/googleSheetsService');

async function loginWithPhone(req, res) {
  const { phone, name, email } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Mobile number is required' });

  const db = await getDb();
  let user = await db.get('SELECT * FROM users WHERE phone = ?', phone);

  // 1. Returning User (Exists Locally)
  if (user) {
    if (name || email) {
      return res.status(409).json({ success: false, message: 'Mobile number already registered. Please Log In.' });
    }
    const { access, refresh } = generateTokens(user.id);
    logger.info(`User logged in instantly via phone: ${phone}`);
    return res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, plan: user.plan },
      tokens: { access, refresh },
    });
  }

  // 2. New User Sign Up (Provided Name and Email)
  if (name && email) {
    const emailCheck = await db.get('SELECT id FROM users WHERE email = ?', email);
    if (emailCheck) return res.status(409).json({ success: false, message: 'Email already registered' });

    const id = uuidv4();
    const hashed = await bcrypt.hash(uuidv4(), 10);
    await db.run('INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)', id, email, hashed, name, phone);
    
    // Background async sheet append (Non-blocking!)
    appendUserToSheet({ name, email, phone }).catch(err => logger.error('Background sheet append failed:', err));

    const { access, refresh } = generateTokens(id);
    logger.info(`New user registered instantly via phone: ${phone}`);
    return res.json({
      success: true,
      user: { id, email, name, phone, plan: 'free' },
      tokens: { access, refresh },
    });
  }

  // 3. Fallback: User trying to Log In but not found locally. Check Google Sheets.
  try {
    const sheetUser = await getUserByPhone(phone);
    if (!sheetUser) {
      return res.status(404).json({ success: false, message: 'Mobile number not found. Please Sign Up to continue.' });
    }

    // Found in Google Sheets, import locally
    const id = uuidv4();
    const hashed = await bcrypt.hash(uuidv4(), 10);
    
    const emailCheck = await db.get('SELECT id FROM users WHERE email = ?', sheetUser.email);
    if (emailCheck) return res.status(409).json({ success: false, message: 'Email already registered' });

    await db.run('INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)', id, sheetUser.email, hashed, sheetUser.name, phone);
    
    const { access, refresh } = generateTokens(id);
    logger.info(`User logged in (imported from sheets): ${phone}`);
    return res.json({
      success: true,
      user: { id, email: sheetUser.email, name: sheetUser.name, phone, plan: 'free' },
      tokens: { access, refresh },
    });
  } catch (err) {
    logger.error(`Error querying Google Sheets for ${phone}: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Failed to verify mobile number. Please try signing up.' });
  }
}

module.exports = { register, login, refreshToken, getMe, updateProfile, loginWithPhone, registerRules: [], loginRules: [] };