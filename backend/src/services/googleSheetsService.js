const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const logger = require('../config/logger');

let credentials;
try {
  if (process.env.GOOGLE_CREDENTIALS) {
    credentials = typeof process.env.GOOGLE_CREDENTIALS === 'string' 
      ? JSON.parse(process.env.GOOGLE_CREDENTIALS) 
      : process.env.GOOGLE_CREDENTIALS;
  } else {
    credentials = require('../../google-credentials.json');
  }
} catch (err) {
  logger.error('Failed to load Google Credentials. Ensure GOOGLE_CREDENTIALS is set.');
}

const SPREADSHEET_ID = '1Pc2PIDRfrumb1rnVeZwsmjTPukCYdD-Fa61EfTIEQ3U';

// Initialize auth
const serviceAccountAuth = new JWT({
  email: credentials?.client_email,
  key: credentials?.private_key,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

let cachedSheet = null;

async function initSheet() {
  if (cachedSheet) return cachedSheet;
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  
  // Ensure headers exist
  try {
    await sheet.loadHeaderRow();
  } catch (e) {
    await sheet.setHeaderRow(['Mobile', 'Name', 'Email', 'Date']);
  }
  cachedSheet = sheet;
  return sheet;
}



/**
 * Append a new user row to Google Sheets
 * @param {Object} userData { name, email, phone }
 */
async function appendUserToSheet(userData) {
    try {
        const sheet = await initSheet();
        await sheet.addRow({
            Mobile: `'${userData.phone}`, // Prepend quote to force string in Sheets
            Name: userData.name,
            Email: userData.email,
            Date: new Date().toISOString()
        });

        logger.info(`Appended real user to Google Sheets: ${userData.phone}`);
        return true;
    } catch (err) {
        logger.error(`Failed to append to Google Sheets: ${err.message}`);
        return false;
    }
}

/**
 * Get user by phone number from Google Sheets
 * @param {string} phone
 * @returns {Object|null}
 */
async function getUserByPhone(phone) {
    try {
        const sheet = await initSheet();
        const rows = await sheet.getRows();
        
        for (const row of rows) {
            let sheetPhone = row.get('Mobile');
            if (!sheetPhone) continue;
            
            // Remove the prepended quote if it exists, and any spaces
            sheetPhone = sheetPhone.replace(/^'/, '').trim();
            // Also handle if Sheets stripped the + and they passed a +
            const cleanInputPhone = phone.replace(/^'/, '').trim();
            
            // Loose comparison in case the plus was stripped
            if (sheetPhone === cleanInputPhone || sheetPhone === cleanInputPhone.replace('+', '')) {
                return {
                    phone: sheetPhone,
                    name: row.get('Name'),
                    email: row.get('Email')
                };
            }
        }
        return null;
    } catch (err) {
        logger.error(`Failed to get user from Google Sheets: ${err.message}`);
        return null;
    }
}

module.exports = {
    appendUserToSheet,
    getUserByPhone
};
