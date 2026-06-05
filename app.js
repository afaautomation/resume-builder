/**
 * Hostinger Passenger Entry Point
 * This file allows Hostinger's Node.js selector (Passenger) to detect and run the application.
 */

// Load environment variables if present
require('dotenv').config({ path: './backend/.env' });

// Simply require the existing backend server
const app = require('./backend/src/server.js');

module.exports = app;
