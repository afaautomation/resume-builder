/**
 * Cloud Run deployment behaviour: only the Cloudflare proxy may call the
 * service, the builder page is served where the website links to it, and the
 * client IP is taken from the proxy chain.
 */
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';
process.env.PROXY_SECRET = 'synthetic-proxy-secret';
process.env.TRUST_PROXY = '2';

const request = require('supertest');

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../src/services/aiService', () => ({}));
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/config/supabase', () => ({ supabase: require('./helpers/fakeSupabase').createFakeSupabase() }));

const app = require('../src/server');
const SECRET = { 'x-proxy-secret': 'synthetic-proxy-secret' };

describe('proxy secret', () => {
  test('requests without the secret are refused', async () => {
    for (const path of ['/api/templates', '/resume.html', '/frontend/app.js', '/']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(403);
    }
  });

  test('a wrong secret is refused', async () => {
    const res = await request(app).get('/api/templates').set('x-proxy-secret', 'synthetic-proxy-secreT');
    expect(res.status).toBe(403);
  });

  test('health checks work without the secret', async () => {
    const res = await request(app).get('/health');
    expect(res.status).not.toBe(403);
  });
});

describe('builder pages behind the proxy', () => {
  test('/resume.html is the builder page and its files load from /frontend', async () => {
    const page = await request(app).get('/resume.html').set(SECRET);
    expect(page.status).toBe(200);
    expect(page.text).toContain('frontend/app.js');
    const script = await request(app).get('/frontend/app.js').set(SECRET);
    expect(script.status).toBe(200);
    expect(script.text).toContain('API_BASE');
  });

  test('the client IP comes from the proxy chain (TRUST_PROXY=2)', () => {
    const proxyaddr = require('proxy-addr');
    // The Cloudflare function sets the real IP; Google's front end appends Cloudflare's address.
    const req = { headers: { 'x-forwarded-for': '203.0.113.7, 104.16.0.1' }, connection: { remoteAddress: '169.254.1.1' }, socket: { remoteAddress: '169.254.1.1' } };
    expect(proxyaddr(req, app.get('trust proxy fn'))).toBe('203.0.113.7');
  });
});
