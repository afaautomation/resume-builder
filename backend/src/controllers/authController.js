const { supabase } = require('../config/supabase');
const logger = require('../config/logger');

/**
 * GET /api/auth/me
 * Returns the authenticated user's auth.users fields merged with their profiles row.
 * req.user is already populated by the authenticate() middleware.
 */
async function getMe(req, res) {
  return res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      phone: req.user.phone,
      avatar_url: req.user.avatarUrl,
      created_at: req.user.createdAt,
    },
  });
}

/**
 * PATCH /api/auth/me
 * Updates the caller's public.profiles row (name / phone / avatar_url only).
 * Password/email changes are no longer handled here — they go straight through
 * Supabase Auth on the client via supabase.auth.updateUser({...}).
 */
async function updateProfile(req, res) {
  const { name, phone, avatarUrl } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No fields to update' });
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', req.user.id)
    .select('id, name, phone, avatar_url')
    .single();

  if (error) {
    logger.error(`updateProfile failed for ${req.user.id}: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }

  return res.json({ success: true, user: { ...updated, email: req.user.email } });
}

const otpService = require('../services/otpService');

/**
 * POST /api/auth/send-otp
 * Body: { phone }
 */
async function sendOtp(req, res) {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }
  const result = await otpService.sendOtp(phone);
  // Invalid number, 30-second cooldown, or the hourly per-phone limit.
  if (!result.success) {
    return res.status(result.status || 400).json({ success: false, message: result.message });
  }
  // Without WhatsApp credentials the code only reaches the server log. That is
  // fine for local testing but would leave a real visitor waiting forever.
  const delivered = !!(result.delivery && result.delivery.success);
  if (!delivered && process.env.NODE_ENV === 'production') {
    return res.status(503).json({
      success: false,
      message: 'We could not send the WhatsApp code right now. Please try again shortly.'
    });
  }
  return res.json({
    success: true,
    message: 'OTP sent successfully to ' + result.phone,
    phone: result.phone
  });
}

/**
 * POST /api/auth/verify-otp
 * Body: { phone, otp }
 */
async function verifyOtp(req, res) {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
  }
  const result = await otpService.verifyOtp(phone, otp);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json({ success: true, message: 'OTP verified successfully' });
}

module.exports = { getMe, updateProfile, sendOtp, verifyOtp };
