const router = require('express').Router();
const { getMe, updateProfile, sendOtp, verifyOtp } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

/**
 * Mobile Number OTP Routes
 */
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user profile
 * @access  Private
 */
router.get('/me', authenticate, getMe);

/**
 * @route   PATCH /api/auth/me
 * @desc    Update name/phone/avatar (profile fields only — password/email changes
 *          go through supabase.auth.updateUser on the client)
 * @access  Private
 */
router.patch('/me', authenticate, updateProfile);

module.exports = router;
