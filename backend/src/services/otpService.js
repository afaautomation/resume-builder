const crypto = require('crypto');
const logger = require('../config/logger');

// In-memory store for OTPs (In production, use Redis)
const otpStore = new Map();

// Per-phone abuse limits. The per-IP limiter in server.js cannot stop one
// attacker spreading requests across many IPs at a single victim's number
// (WhatsApp spam), or guessing a 6-digit code within its 10-minute life.
const RESEND_COOLDOWN_MS = 30 * 1000;   // one code per 30 seconds per phone
const MAX_SENDS_PER_HOUR = 5;           // per phone
const MAX_VERIFY_ATTEMPTS = 5;          // wrong guesses before the code is discarded
const OTP_TTL_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const sendHistory = new Map();          // phone -> [send timestamps within the last hour]

// Drop expired codes and old send history so the maps cannot grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [phone, rec] of otpStore) {
    if (now > rec.expiresAt) otpStore.delete(phone);
  }
  for (const [phone, times] of sendHistory) {
    const recent = times.filter(t => now - t < HOUR_MS);
    if (recent.length) sendHistory.set(phone, recent);
    else sendHistory.delete(phone);
  }
}, 5 * 60 * 1000).unref();

const isProduction = () => process.env.NODE_ENV === 'production';

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.toString().replace(/[\s\-\(\)\+]/g, '').trim();
}

/** Logs show only the last 4 digits of a phone number. */
function maskPhone(phone) {
  const digits = (phone || '').toString().replace(/\D/g, '');
  return digits.length > 4 ? '*'.repeat(digits.length - 4) + digits.slice(-4) : '****';
}

/**
 * Format phone number to international format (without '+') for Meta WhatsApp Cloud API.
 * Automatically prepends Indian country code '91' if a 10-digit number is provided.
 */
function formatForWhatsApp(phone) {
  let cleaned = normalizePhone(phone);
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

/**
 * Dispatch OTP via Meta WhatsApp Cloud API
 */
async function sendWhatsAppOtp(recipientPhone, otp) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';

  const formattedTo = formatForWhatsApp(recipientPhone);

  if (!token || !phoneNumberId || token.includes('your_') || phoneNumberId.includes('your_')) {
    logger.warn(`[Meta WhatsApp] Missing or unconfigured WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID in .env.`);
    // The code itself is logged only on a developer machine, never in production.
    if (!isProduction()) {
      logger.info(`[WhatsApp OTP Fallback] Code for ${maskPhone(formattedTo)}: ${otp}`);
    }
    return { success: false, mode: 'mock', message: 'WhatsApp credentials not yet configured in .env' };
  }

  const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  // If a template name is configured in Meta Business Manager, use template structure.
  // Otherwise, use direct text message format.
  let payload;
  if (templateName && templateName.trim()) {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'template',
      template: {
        name: templateName.trim(),
        language: { code: lang },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: otp }
            ]
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              { type: 'text', text: otp }
            ]
          }
        ]
      }
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'text',
      text: {
        preview_url: false,
        body: `Your Kompetenzen verification code is: *${otp}*.\n\nThis code is valid for 10 minutes. Please do not share it with anyone.`
      }
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const errDetail = (data && data.error && data.error.message) || JSON.stringify(data);
      logger.error(`[Meta WhatsApp API Error]: ${errDetail}`);
      return { success: false, error: errDetail };
    }

    const messageId = data.messages && data.messages[0] && data.messages[0].id;
    logger.info(`[Meta WhatsApp] OTP dispatched to ${maskPhone(formattedTo)}. Message ID: ${messageId}`);
    return { success: true, messageId };
  } catch (err) {
    logger.error(`[Meta WhatsApp Network Error]: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Generate and send OTP to a mobile number.
 * Returns { success, phone, delivery } or, when refused,
 * { success: false, status: 400 | 429, message }.
 */
async function sendOtp(mobileNumber) {
  const cleanPhone = normalizePhone(mobileNumber);
  if (!/^\d{10,15}$/.test(cleanPhone)) {
    return { success: false, status: 400, message: 'Please enter a valid mobile number.' };
  }

  const now = Date.now();
  const recent = (sendHistory.get(cleanPhone) || []).filter(t => now - t < HOUR_MS);
  const last = recent[recent.length - 1];
  if (last && now - last < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
    return { success: false, status: 429, message: `Please wait ${wait} seconds before requesting another code.` };
  }
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    logger.warn(`[OTP] Hourly send limit reached for ${maskPhone(cleanPhone)}`);
    return { success: false, status: 429, message: 'Too many codes requested for this number. Please try again in an hour.' };
  }
  recent.push(now);
  sendHistory.set(cleanPhone, recent);

  const otp = crypto.randomInt(100000, 1000000).toString();
  otpStore.set(cleanPhone, { otp, expiresAt: now + OTP_TTL_MS, attempts: 0 });

  logger.info(`[OTP] Code generated for ${maskPhone(cleanPhone)}`);

  // Dispatch via Meta WhatsApp Cloud API
  const deliveryResult = await sendWhatsAppOtp(cleanPhone, otp);

  return {
    success: true,
    phone: cleanPhone,
    channel: 'whatsapp',
    delivery: deliveryResult
  };
}

/**
 * Verify OTP. A code is discarded after MAX_VERIFY_ATTEMPTS wrong guesses.
 */
async function verifyOtp(mobileNumber, inputOtp) {
  const cleanPhone = normalizePhone(mobileNumber);
  const cleanInput = (inputOtp || '').toString().trim();
  const record = otpStore.get(cleanPhone);

  if (!record) {
    return { success: false, message: 'OTP not found or expired. Please request a new one.' };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(cleanPhone);
    return { success: false, message: 'OTP has expired. Please request a new one.' };
  }

  if (record.otp === cleanInput) {
    otpStore.delete(cleanPhone);
    return { success: true, message: 'OTP verified successfully.' };
  }

  record.attempts += 1;
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(cleanPhone);
    logger.warn(`[OTP] Too many wrong codes for ${maskPhone(cleanPhone)}; code discarded`);
    return { success: false, message: 'Too many incorrect attempts. Please request a new code.' };
  }
  const left = MAX_VERIFY_ATTEMPTS - record.attempts;
  return { success: false, message: `Invalid OTP code. ${left} attempt${left === 1 ? '' : 's'} left.` };
}

module.exports = {
  sendOtp,
  verifyOtp,
  sendWhatsAppOtp,
  formatForWhatsApp,
  maskPhone
};
