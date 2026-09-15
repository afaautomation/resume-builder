const router = require('express').Router();
const {
  register, login, refreshToken, getMe, updateProfile,
  loginWithPhone, loginWithGoogle,
  registerRules, loginRules,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', registerRules, register);

/**
 * @route   POST /api/auth/login
 * @desc    Login and receive tokens
 * @access  Public
 */
router.post('/login', loginRules, login);

/**
 * @route   POST /api/auth/login-phone
 * @desc    Login or register directly with phone (OTP removed)
 * @access  Public
 */
router.post('/login-phone', loginWithPhone);

/**
 * @route   POST /api/auth/google
 * @desc    Sign in or register with Google
 * @access  Public
 */
router.post('/google', loginWithGoogle);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', refreshToken);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user profile
 * @access  Private
 */
router.get('/me', authenticate, getMe);

/**
 * @route   PATCH /api/auth/me
 * @desc    Update name or password
 * @access  Private
 */
router.patch('/me', authenticate, updateProfile);

module.exports = router;