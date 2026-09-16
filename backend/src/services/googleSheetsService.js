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

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '13NYwVoi-ANdu6mpQEncZ15Jtk8GYSmHDZPBIQawHbJI';
const SHEET_GID = process.env.GOOGLE_SHEET_GID || '89850774';

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
  try {
    await doc.loadInfo();
  } catch (err) {
    if (err.message && err.message.includes('403')) {
      logger.error(`[GoogleSheets] Permission denied (403) for sheet ${SPREADSHEET_ID}. Ensure '${credentials?.client_email}' is shared as Editor on the sheet.`);
    }
    throw err;
  }

  // Resolve sheet by GID or fallback to first index
  let sheet = doc.sheetsById[SHEET_GID];
  if (!sheet) {
    const numGid = parseInt(SHEET_GID, 10);
    if (!isNaN(numGid)) {
      sheet = doc.sheetsById[numGid];
    }
  }
  if (!sheet) {
    logger.warn(`[GoogleSheets] Sheet tab with GID ${SHEET_GID} not found. Falling back to first sheet tab.`);
    sheet = doc.sheetsByIndex[0];
  }
  
  try {
    await sheet.loadHeaderRow();
  } catch (e) {
    logger.warn(`[GoogleSheets] Header row load notice: ${e.message}`);
  }
  cachedSheet = sheet;
  return sheet;
}

/**
 * Append a user authentication row to the shared Google Sheet
 * @param {Object} userData { name, email, phone, method, action, pageUrl, isSignup }
 */
async function appendUserToSheet(userData) {
  try {
    const sheet = await initSheet();
    const headers = sheet.headerValues || [];
    
    const timestamp = new Date().toISOString();
    const defaultMethod = userData.method || (userData.isSignup ? 'Sign Up (Email)' : 'Sign In (Email)');
    const defaultAction = userData.action || (userData.isSignup ? 'Account Created' : 'Logged In');
    const defaultUrl = userData.pageUrl || 'https://afaautomation-resume.hf.space/';

    const cleanPhone = userData.phone ? `'${userData.phone}` : '';
    const rowData = {};

    if (headers.length > 0) {
      for (const h of headers) {
        const lower = h.toLowerCase().trim();
        if (lower.includes('time') || lower === 'date') {
          rowData[h] = timestamp;
        } else if (lower.includes('full name') || lower === 'name') {
          rowData[h] = userData.name || '';
        } else if (lower.includes('email')) {
          rowData[h] = userData.email || '';
        } else if (lower.includes('method')) {
          rowData[h] = defaultMethod;
        } else if (lower.includes('status') || lower.includes('action')) {
          rowData[h] = defaultAction;
        } else if (lower.includes('page') || lower.includes('url')) {
          rowData[h] = defaultUrl;
        } else if (lower.includes('phone') || lower.includes('mobile')) {
          rowData[h] = cleanPhone;
        } else {
          rowData[h] = '';
        }
      }
    } else {
      // Fallback matching Users_Auth columns
      rowData['Timestamp'] = timestamp;
      rowData['Full Name'] = userData.name || '';
      rowData['Email Address'] = userData.email || '';
      rowData['Authentication Method'] = defaultMethod;
      rowData['Status / Action'] = defaultAction;
      rowData['Page URL'] = defaultUrl;
    }

    const cleanEmail = (userData.email || '').toLowerCase().trim();
    const cleanPhoneNoQuote = (userData.phone || '').replace(/^'/, '').trim();

    // Check if user already exists in Users_Auth sheet to prevent duplicate sign-in rows
    const rows = await sheet.getRows();
    let existingRow = null;
    if (cleanEmail) {
      existingRow = rows.find(r => {
        const rowEmail = (r.get('Email Address') || r.get('Email') || '').toLowerCase().trim();
        return rowEmail && rowEmail === cleanEmail;
      });
    }
    if (!existingRow && cleanPhoneNoQuote) {
      existingRow = rows.find(r => {
        const rowPhone = (r.get('Mobile') || r.get('Phone') || r.get('Mobile Number') || '').replace(/^'/, '').trim();
        return rowPhone && (rowPhone === cleanPhoneNoQuote || rowPhone.replace('+', '') === cleanPhoneNoQuote.replace('+', ''));
      });
    }

    if (existingRow) {
      // Update existing record in place
      existingRow.set('Timestamp', timestamp);
      if (userData.name) existingRow.set('Full Name', userData.name);
      existingRow.set('Status / Action', defaultAction);
      if (userData.method) existingRow.set('Authentication Method', userData.method);
      if (defaultUrl) existingRow.set('Page URL', defaultUrl);
      await existingRow.save();
      logger.info(`[GoogleSheets] Updated existing user in "${sheet.title}": ${cleanEmail || cleanPhoneNoQuote} (${defaultAction})`);
      return true;
    }

    await sheet.addRow(rowData);
    logger.info(`[GoogleSheets] Appended new user to "${sheet.title}": ${userData.email || userData.name} (${defaultAction})`);
    return true;
  } catch (err) {
    logger.error(`[GoogleSheets] Failed to append to Google Sheets: ${err.message}`);
    return false;
  }
}

/**
 * Get user by email or phone number from Google Sheets (shared with main website)
 * @param {string} identifier email or phone
 * @returns {Object|null}
 */
async function getUserFromSheet(identifier) {
  if (!identifier) return null;
  try {
    const sheet = await initSheet();
    const rows = await sheet.getRows();
    const cleanInput = identifier.toLowerCase().trim();
    
    // Search in reverse order to get latest details
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const email = (row.get('Email Address') || row.get('Email') || '').toLowerCase().trim();
      const phone = (row.get('Mobile') || row.get('Phone') || row.get('Mobile Number') || '').replace(/^'/, '').trim();
      const name = row.get('Full Name') || row.get('Name') || '';

      const matchEmail = email && email === cleanInput;
      const matchPhone = phone && (phone === cleanInput || phone.replace('+', '') === cleanInput.replace('+', ''));

      if (matchEmail || matchPhone) {
        return {
          name: name || (email ? email.split('@')[0] : 'User'),
          email: email || identifier,
          phone: phone || ''
        };
      }
    }
    return null;
  } catch (err) {
    logger.error(`[GoogleSheets] Failed to query Google Sheets: ${err.message}`);
    return null;
  }
}

const RESUME_SHEET_TITLE = process.env.GOOGLE_RESUME_SHEET_TITLE || 'Resume_Data';
let cachedResumeSheet = null;

async function initResumeDataSheet() {
  if (cachedResumeSheet) return cachedResumeSheet;
  try {
    await doc.loadInfo();
  } catch (err) {
    if (err.message && err.message.includes('403')) {
      logger.error(`[GoogleSheets] Permission denied (403) for sheet ${SPREADSHEET_ID}. Ensure '${credentials?.client_email}' is shared as Editor.`);
    }
    throw err;
  }

  let sheet = doc.sheetsByTitle[RESUME_SHEET_TITLE];
  const requiredHeaders = [
    'Timestamp',
    'Full Name',
    'Job Title',
    'Email',
    'Phone',
    'Location',
    'LinkedIn',
    'Education',
    'Skills',
    'Projects',
    'Certifications',
    'Experience',
    'Resume ID'
  ];

  if (!sheet) {
    try {
      sheet = await doc.addSheet({
        title: RESUME_SHEET_TITLE,
        headerValues: requiredHeaders
      });
      logger.info(`[GoogleSheets] Created new sheet tab "${RESUME_SHEET_TITLE}"`);
    } catch (err) {
      logger.error(`[GoogleSheets] Failed to create sheet tab "${RESUME_SHEET_TITLE}": ${err.message}`);
      sheet = doc.sheetsByIndex[0];
    }
  }

  try {
    await sheet.loadHeaderRow();
  } catch (e) {
    logger.warn(`[GoogleSheets] Header row load notice for ${RESUME_SHEET_TITLE}: ${e.message}`);
  }

  cachedResumeSheet = sheet;
  return sheet;
}

/**
 * Format resume content fields into clean strings for Google Sheets
 * Per user instructions:
 * - contact info without github
 * - education details
 * - skills
 * - projects project name only
 * - certification name
 * - experience company name and title
 */
function formatResumeData(content, resumeId) {
  const contact = content?.contact || {};
  const educationList = Array.isArray(content?.education) ? content.education : [];
  const experienceList = Array.isArray(content?.experience) ? content.experience : [];
  const skillsList = Array.isArray(content?.skills) ? content.skills : [];
  const projectsList = Array.isArray(content?.projects) ? content.projects : [];
  const certsList = Array.isArray(content?.certifications) ? content.certifications : [];

  // 1. Contact info without github
  const fullName = contact.name ? contact.name.trim() : '';
  const jobTitle = contact.title ? contact.title.trim() : '';
  const email = contact.email ? contact.email.trim() : '';
  const phone = contact.phone ? `'${contact.phone.trim()}` : '';
  const location = contact.location ? contact.location.trim() : '';
  const linkedin = contact.linkedin ? contact.linkedin.trim() : '';

  // 2. Education details
  const education = educationList
    .map(e => {
      if (!e) return '';
      const parts = [e.degree, e.institution, e.endDate].filter(Boolean);
      return parts.join(' | ');
    })
    .filter(Boolean)
    .join('\n');

  // 3. Skills
  const skills = skillsList
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(', ');

  // 4. Projects (project name only)
  const projects = projectsList
    .map(p => {
      if (!p) return '';
      return typeof p === 'object' ? (p.name ? p.name.trim() : '') : String(p).trim();
    })
    .filter(Boolean)
    .join(', ');

  // 5. Certification name
  const certifications = certsList
    .map(c => {
      if (!c) return '';
      return typeof c === 'object' ? (c.name ? c.name.trim() : '') : String(c).trim();
    })
    .filter(Boolean)
    .join(', ');

  // 6. Experience (company name and title)
  const experience = experienceList
    .map(exp => {
      if (!exp) return '';
      const title = exp.title ? exp.title.trim() : '';
      const company = exp.company ? exp.company.trim() : '';
      if (title && company) return `${title} at ${company}`;
      return title || company || '';
    })
    .filter(Boolean)
    .join('\n');

  return {
    fullName,
    jobTitle,
    email,
    phone,
    location,
    linkedin,
    education,
    skills,
    projects,
    certifications,
    experience,
    resumeId: resumeId || ''
  };
}

/**
 * Syncs resume info to Google Sheets tab 'Resume_Data'
 * Updates existing row if found by Resume ID or Email, otherwise appends.
 */
async function syncResumeToSheet({ resumeId, content }) {
  if (!content) return false;
  try {
    const formatted = formatResumeData(content, resumeId);

    // If all essential fields are empty, skip to prevent blank rows
    const hasData = formatted.fullName || formatted.email || formatted.phone || 
                    formatted.education || formatted.skills || formatted.projects || 
                    formatted.certifications || formatted.experience;
    if (!hasData) return false;

    const sheet = await initResumeDataSheet();
    const rows = await sheet.getRows();
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) + ' IST';

    let targetRow = null;
    if (formatted.resumeId) {
      targetRow = rows.find(r => r.get('Resume ID') === formatted.resumeId);
    }
    if (!targetRow && formatted.email) {
      targetRow = rows.find(r => (r.get('Email') || '').toLowerCase().trim() === formatted.email.toLowerCase());
    }

    if (targetRow) {
      targetRow.set('Timestamp', timestamp);
      targetRow.set('Full Name', formatted.fullName);
      targetRow.set('Job Title', formatted.jobTitle);
      targetRow.set('Email', formatted.email);
      targetRow.set('Phone', formatted.phone);
      targetRow.set('Location', formatted.location);
      targetRow.set('LinkedIn', formatted.linkedin);
      targetRow.set('Education', formatted.education);
      targetRow.set('Skills', formatted.skills);
      targetRow.set('Projects', formatted.projects);
      targetRow.set('Certifications', formatted.certifications);
      targetRow.set('Experience', formatted.experience);
      if (formatted.resumeId) targetRow.set('Resume ID', formatted.resumeId);
      await targetRow.save();
      logger.info(`[GoogleSheets] Updated resume data in "${sheet.title}" for ${formatted.email || formatted.fullName || formatted.resumeId}`);
    } else {
      await sheet.addRow({
        'Timestamp': timestamp,
        'Full Name': formatted.fullName,
        'Job Title': formatted.jobTitle,
        'Email': formatted.email,
        'Phone': formatted.phone,
        'Location': formatted.location,
        'LinkedIn': formatted.linkedin,
        'Education': formatted.education,
        'Skills': formatted.skills,
        'Projects': formatted.projects,
        'Certifications': formatted.certifications,
        'Experience': formatted.experience,
        'Resume ID': formatted.resumeId
      });
      logger.info(`[GoogleSheets] Appended new resume data to "${sheet.title}" for ${formatted.email || formatted.fullName || formatted.resumeId}`);
    }
    return true;
  } catch (err) {
    logger.error(`[GoogleSheets] Failed to sync resume to sheet: ${err.message}`);
    return false;
  }
}

// In-memory debounce queue so rapid typing doesn't spam Google Sheets API
const pendingResumeSyncs = new Map();

function queueResumeSheetSync({ resumeId, content }) {
  if (!resumeId || !content) return;
  if (pendingResumeSyncs.has(resumeId)) {
    clearTimeout(pendingResumeSyncs.get(resumeId).timer);
  }
  const timer = setTimeout(async () => {
    pendingResumeSyncs.delete(resumeId);
    await syncResumeToSheet({ resumeId, content });
  }, 4000);

  pendingResumeSyncs.set(resumeId, { timer, content });
}

async function flushResumeSheetSync(resumeId, content) {
  if (pendingResumeSyncs.has(resumeId)) {
    const item = pendingResumeSyncs.get(resumeId);
    clearTimeout(item.timer);
    pendingResumeSyncs.delete(resumeId);
    await syncResumeToSheet({ resumeId, content: content || item.content });
  } else if (resumeId && content) {
    await syncResumeToSheet({ resumeId, content });
  }
}

module.exports = {
  appendUserToSheet,
  getUserFromSheet,
  getUserByPhone: getUserFromSheet, // Aliased for backwards compatibility
  syncResumeToSheet,
  queueResumeSheetSync,
  flushResumeSheetSync
};
