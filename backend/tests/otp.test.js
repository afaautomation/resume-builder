/**
 * Per-phone OTP abuse limits and log hygiene.
 */
process.env.NODE_ENV = 'test';
delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.WHATSAPP_PHONE_NUMBER_ID;

const logger = require('../src/config/logger');
const otp = require('../src/services/otpService');

// Capture the code the service generated (it is only logged outside production).
function lastLoggedCode(spy) {
  const line = spy.mock.calls.map(c => String(c[0])).reverse().find(m => /Fallback\] Code/.test(m));
  return line && line.match(/(\d{6})$/)[1];
}

beforeEach(() => jest.useFakeTimers({ now: Date.parse('2026-09-29T10:00:00Z') }));
afterEach(() => jest.useRealTimers());

test('rejects a malformed number', async () => {
  const r = await otp.sendOtp('12ab');
  expect(r.success).toBe(false);
  expect(r.status).toBe(400);
});

test('enforces a 30-second cooldown per phone', async () => {
  expect((await otp.sendOtp('9000000001')).success).toBe(true);
  const r = await otp.sendOtp('9000000001');
  expect(r.status).toBe(429);
  jest.advanceTimersByTime(31 * 1000);
  expect((await otp.sendOtp('9000000001')).success).toBe(true);
});

test('allows at most 5 codes per phone per hour', async () => {
  for (let i = 0; i < 5; i++) {
    expect((await otp.sendOtp('9000000002')).success).toBe(true);
    jest.advanceTimersByTime(31 * 1000);
  }
  const r = await otp.sendOtp('9000000002');
  expect(r.status).toBe(429);
  jest.advanceTimersByTime(60 * 60 * 1000);
  expect((await otp.sendOtp('9000000002')).success).toBe(true);
});

test('a code dies after 5 wrong guesses, even if the right one comes next', async () => {
  const spy = jest.spyOn(logger, 'info');
  await otp.sendOtp('9000000003');
  const code = lastLoggedCode(spy);
  expect(code).toMatch(/^\d{6}$/);
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) {
    expect((await otp.verifyOtp('9000000003', wrong)).success).toBe(false);
  }
  const fifth = await otp.verifyOtp('9000000003', wrong);
  expect(fifth.message).toMatch(/Too many incorrect attempts/);
  expect((await otp.verifyOtp('9000000003', code)).success).toBe(false);
  spy.mockRestore();
});

test('the right code verifies once', async () => {
  const spy = jest.spyOn(logger, 'info');
  await otp.sendOtp('9000000004');
  const code = lastLoggedCode(spy);
  expect((await otp.verifyOtp('9000000004', code)).success).toBe(true);
  expect((await otp.verifyOtp('9000000004', code)).success).toBe(false);
  spy.mockRestore();
});

test('logs never contain the full number, and never the code in production', async () => {
  const spy = jest.spyOn(logger, 'info');
  process.env.NODE_ENV = 'production';
  await otp.sendOtp('9876543210');
  process.env.NODE_ENV = 'test';
  const logged = spy.mock.calls.map(c => String(c[0])).join('\n');
  expect(logged).not.toMatch(/9876543210/);
  expect(logged).toMatch(/\*+3210/);
  expect(logged).not.toMatch(/Fallback\] Code/);
  spy.mockRestore();
});
