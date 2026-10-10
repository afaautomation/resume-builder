const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const logger = require('../config/logger');

/**
 * Verifies the Supabase-issued access token sent as `Authorization: Bearer <token>`.
 * The token is the same one the frontend gets from `supabase.auth.getSession()` after
 * signing in via supabase-js — Express no longer issues or verifies its own JWTs.
 *
 * Attaches req.user = { id, email, name, phone, avatarUrl, role, createdAt }.
 */
async function authenticate(req, res, next, identityOnly = false) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    req.user = identityOnly
      ? { id: data.user.id, email: data.user.email }
      : await buildUserContext(data.user);
    next();
  } catch (err) {
    logger.warn(`Auth error: ${err.message}`);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// AI routes only need the verified user id for per-user rate limits. Verify
// every request as before, without an unrelated profile database round trip.
function authenticateIdentity(req, res, next) {
  return authenticate(req, res, next, true);
}

/**
 * Like authenticate(), but never blocks the request — attaches req.user when a valid
 * token is present, otherwise leaves it undefined. Used for routes like GET /api/templates
 * where premium filtering benefits from knowing the caller but anonymous access is fine.
 */
async function softAuthenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data && data.user) {
        req.user = await buildUserContext(data.user);
      }
    } catch (err) {
      // Ignore auth errors for soft-auth
    }
  }
  next();
}

async function buildUserContext(authUser) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name, phone, avatar_url, role, created_at')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileError) {
    logger.warn(`Profile fetch error for user ${authUser.id}: ${profileError.message}`);
  }

  const meta = authUser.user_metadata || {};
  return {
    id: authUser.id,
    email: authUser.email,
    name: (profile && profile.name) || meta.name || meta.full_name || authUser.email,
    phone: (profile && profile.phone) || meta.phone || null,
    avatarUrl: profile ? profile.avatar_url : null,
    role: (profile && profile.role) || 'user',
    createdAt: profile ? profile.created_at : null,
  };
}

/**
 * Lightweight sign-in check for the live resume preview, which runs on every
 * edit. Verifies the token with Supabase once, then remembers it for a few
 * minutes (never beyond the token's own expiry), and skips the profile lookup
 * the preview does not need. Sets req.user = { id, email }.
 */
const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000;
const PREVIEW_TOKEN_CACHE_MAX = 1000;
const previewTokenCache = new Map(); // sha256(token) -> { user, until }

async function authenticatePreview(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const now = Date.now();

  const hit = previewTokenCache.get(key);
  if (hit && hit.until > now) {
    req.user = hit.user;
    return next();
  }
  previewTokenCache.delete(key);

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    // Never trust the cache past the JWT's own expiry.
    let tokenExpiry = now + PREVIEW_TOKEN_TTL_MS;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.exp) tokenExpiry = payload.exp * 1000;
    } catch (e) { /* opaque token: fall back to the TTL */ }

    const user = { id: data.user.id, email: data.user.email };
    if (previewTokenCache.size >= PREVIEW_TOKEN_CACHE_MAX) {
      previewTokenCache.delete(previewTokenCache.keys().next().value); // drop the oldest
    }
    previewTokenCache.set(key, { user, until: Math.min(now + PREVIEW_TOKEN_TTL_MS, tokenExpiry) });
    req.user = user;
    next();
  } catch (err) {
    logger.warn(`Preview auth error: ${err.message}`);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/** Staff-only routes. Role is read from profiles.role, which users cannot edit. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    logger.warn(`Non-admin user ${req.user && req.user.id} attempted an admin route: ${req.originalUrl}`);
    return res.status(403).json({ success: false, message: 'Staff access required.' });
  }
  next();
}

module.exports = { authenticate, authenticateIdentity, authenticatePreview, softAuthenticate, requireAdmin };
