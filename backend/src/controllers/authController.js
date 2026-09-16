const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { generateTokens } = require('../middleware/auth');
const logger = require('../config/logger');
const { appendUserToSheet, getUserByPhone } = require('../services/googleSheetsService');

function getPageUrl(req) {
  return req.headers.referer || req.headers.origin || 'https://afaautomation-resume.hf.space/';
}

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  const { name, email, phone, password } = req.body;
  const db = await getDb();

  const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
  if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

  const hashed = await bcrypt.hash(password || uuidv4(), 12);
  const id = uuidv4();
  await db.run('INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)', id, email, hashed, name, phone || null);

  // Sync to Google Sheet
  appendUserToSheet({ name, email, phone: phone || '' }).catch(err => logger.error('Background sheet append failed in register:', err));

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

  let user = await db.get('SELECT * FROM users WHERE email = ? OR phone = ?', email, email);

  // If user not in local DB, check shared Google Sheet (e.g. registered on main website)
  if (!user) {
    try {
      const sheetUser = await getUserByPhone(email);
      if (sheetUser) {
        const id = uuidv4();
        const hashed = password ? await bcrypt.hash(password, 10) : await bcrypt.hash(uuidv4(), 10);
        await db.run('INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)', id, sheetUser.email, hashed, sheetUser.name, sheetUser.phone || null);
        user = { id, email: sheetUser.email, name: sheetUser.name, phone: sheetUser.phone, password: hashed, plan: 'free' };
        logger.info(`Imported user from shared Google Sheet: ${sheetUser.email}`);
      }
    } catch (sheetErr) {
      logger.error(`Error checking shared Google Sheet: ${sheetErr.message}`);
    }
  }

  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials. Account not found.' });

  if (password && user.password) {
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Incorrect password' });
  }

  // Record login event in shared Google Sheet
  const pageUrl = getPageUrl(req);
  appendUserToSheet({
    name: user.name,
    email: user.email,
    phone: user.phone,
    method: 'Sign In (Email)',
    action: 'Logged In',
    pageUrl
  }).catch(err => logger.error('Background sheet append failed on login:', err));

  const { access, refresh } = generateTokens(user.id);
  logger.info(`User logged in: ${user.email || user.phone}`);
  return res.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name, phone: user.phone, plan: user.plan },
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

async function loginWithPhone(req, res) {
  const { phone, name, email } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Mobile number or email is required' });

  const db = await getDb();
  let user;
  if (phone.includes('@')) {
    user = await db.get('SELECT * FROM users WHERE email = ?', phone);
  } else {
    user = await db.get('SELECT * FROM users WHERE phone = ?', phone);
  }

  // 1. Returning User (Exists Locally)
  if (user) {
    if (name || email) {
      return res.status(409).json({
        success: false,
        alreadyRegistered: true,
        email: user.email || phone,
        message: 'This account is already registered. Please sign in.'
      });
    }
    const { access, refresh } = generateTokens(user.id);
    const pageUrl = getPageUrl(req);
    appendUserToSheet({
      name: user.name,
      email: user.email,
      phone: user.phone,
      method: 'Sign In (Email)',
      action: 'Logged In',
      pageUrl
    }).catch(err => logger.error('Background sheet append failed on loginWithPhone returning user:', err));

    logger.info(`User logged in instantly: ${phone}`);
    return res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, plan: user.plan },
      tokens: { access, refresh },
    });
  }

  // 2. New User Sign Up (Provided Name and Email)
  if (name && email) {
    // Check local database
    const emailCheck = await db.get('SELECT id FROM users WHERE email = ?', email);
    if (emailCheck) {
      return res.status(409).json({
        success: false,
        alreadyRegistered: true,
        email: email,
        message: 'This email is already registered. Please sign in.'
      });
    }

    // Check shared Google Sheet (e.g. user registered on main website)
    try {
      const sheetUser = await getUserByPhone(email);
      if (sheetUser) {
        return res.status(409).json({
          success: false,
          alreadyRegistered: true,
          email: email,
          message: 'This email is already registered on our platform. Please sign in.'
        });
      }
    } catch (sheetErr) {
      logger.error(`Error checking shared sheet during signup: ${sheetErr.message}`);
    }

    const id = uuidv4();
    const userPassword = req.body.password;
    const hashed = await bcrypt.hash(userPassword || uuidv4(), 10);
    await db.run('INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)', id, email, hashed, name, phone);
    
    // Sync new registration to shared Google Sheet
    const pageUrl = getPageUrl(req);
    appendUserToSheet({
      name,
      email,
      phone,
      method: 'Sign Up (Email)',
      action: 'Account Created',
      pageUrl,
      isSignup: true
    }).catch(err => logger.error('Background sheet append failed:', err));

    const { access, refresh } = generateTokens(id);
    logger.info(`New user registered instantly: ${email || phone}`);
    return res.json({
      success: true,
      user: { id, email, name, phone, plan: 'free' },
      tokens: { access, refresh },
    });
  }

  // 3. Fallback: User trying to Log In but not found locally. Check shared Google Sheets.
  try {
    const sheetUser = await getUserByPhone(phone);
    if (!sheetUser) {
      return res.status(404).json({ success: false, message: 'Account not found. Please Sign Up to continue.' });
    }

    // Found in Google Sheets, import locally
    const id = uuidv4();
    const hashed = await bcrypt.hash(uuidv4(), 10);
    
    const emailCheck = await db.get('SELECT id FROM users WHERE email = ?', sheetUser.email);
    if (emailCheck) return res.status(409).json({ success: false, message: 'Email already registered' });

    await db.run('INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)', id, sheetUser.email, hashed, sheetUser.name, phone);
    
    const pageUrl = getPageUrl(req);
    appendUserToSheet({
      name: sheetUser.name,
      email: sheetUser.email,
      phone,
      method: 'Sign In (Email)',
      action: 'Logged In',
      pageUrl
    }).catch(err => logger.error('Background sheet append failed on sheetUser import:', err));

    const { access, refresh } = generateTokens(id);
    logger.info(`User logged in (imported from sheets): ${phone}`);
    return res.json({
      success: true,
      user: { id, email: sheetUser.email, name: sheetUser.name, phone, plan: 'free' },
      tokens: { access, refresh },
    });
  } catch (err) {
    logger.error(`Error querying Google Sheets for ${phone}: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Failed to verify account. Please try signing up.' });
  }
}

async function loginWithGoogle(req, res) {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Google account email required' });

  const db = await getDb();
  let user = await db.get('SELECT * FROM users WHERE email = ?', email);

  if (!user) {
    const id = uuidv4();
    const hashed = await bcrypt.hash(uuidv4(), 10);
    const userName = name || email.split('@')[0];
    await db.run('INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)', id, email, hashed, userName, null);
    user = { id, email, name: userName, phone: null, plan: 'free' };
  }

  const pageUrl = getPageUrl(req);
  appendUserToSheet({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    method: 'Google Auth',
    action: 'Google Login',
    pageUrl
  }).catch(err => logger.error('Background sheet append failed in google login:', err));

  const { access, refresh } = generateTokens(user.id);
  logger.info(`Google user authenticated: ${email}`);
  return res.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name, phone: user.phone, plan: user.plan || 'free' },
    tokens: { access, refresh },
  });
}

module.exports = { register, login, refreshToken, getMe, updateProfile, loginWithPhone, loginWithGoogle, registerRules: [], loginRules: [] };