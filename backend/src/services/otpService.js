const logger = require('../config/logger');

// In-memory store for OTPs (In production, use Redis)
const otpStore = new Map();

/**
 * Generate and send OTP to a mobile number (Mock)
 */
async function sendOtp(mobileNumber) {
    // Generate a 4 digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Store it with a 5 minute expiry
    otpStore.set(mobileNumber, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000
    });

    // MOCK SEND SMS
    logger.info(`\n========================================`);
    logger.info(`[MOCK SMS] To: ${mobileNumber}`);
    logger.info(`[MOCK SMS] Your ResumePro verification code is: ${otp}`);
    logger.info(`========================================\n`);

    return true;
}

/**
 * Verify OTP
 */
async function verifyOtp(mobileNumber, inputOtp) {
    const record = otpStore.get(mobileNumber);
    
    if (!record) {
        return { success: false, message: 'OTP not found or expired. Please request a new one.' };
    }

    if (Date.now() > record.expiresAt) {
        otpStore.delete(mobileNumber);
        return { success: false, message: 'OTP has expired.' };
    }

    if (record.otp === inputOtp) {
        otpStore.delete(mobileNumber);
        return { success: true };
    }

    return { success: false, message: 'Invalid OTP code.' };
}

module.exports = {
    sendOtp,
    verifyOtp
};
