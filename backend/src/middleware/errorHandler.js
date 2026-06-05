const logger = require('../config/logger');
const multer = require('multer');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Multer errors
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `File too large. Maximum allowed size is ${process.env.MAX_FILE_SIZE_MB || 10} MB`,
      LIMIT_FILE_COUNT: 'Too many files uploaded',
      LIMIT_UNEXPECTED_FILE: err.message || 'Unexpected file field',
    };
    return res.status(400).json({
      success: false,
      message: messages[err.code] || `Upload error: ${err.message}`,
    });
  }

  // Validation errors (express-validator)
  if (Array.isArray(err)) {
    return res.status(422).json({ success: false, errors: err });
  }

  // JWT / auth errors
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  // Known operational errors
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  // Unknown server errors
  logger.error(err);
  return res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
