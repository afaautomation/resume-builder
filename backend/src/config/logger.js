const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
  ],
});

// Only add file transports if NOT in production or specifically enabled
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
  }));
  logger.add(new transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
  }));
}

module.exports = logger;
