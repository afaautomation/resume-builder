/**
 * Security regression tests for the resume builder API.
 *
 * Each test pins down a vulnerability that was previously exploitable, so a
 * future refactor cannot quietly reintroduce it.
 */
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

const request = require('supertest');

// Keep the suite offline and deterministic.
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../src/services/aiService', () => ({}));
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
    }),
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error('no token') }),
      admin: { listUsers: async () => ({ data: { users: [] }, error: null }) },
    },
  },
}));

const app = require('../src/server');

describe('resume builder endpoints require a session', () => {
  // Saved resumes and account operations require authentication. Stateless
  // rendering of caller-supplied content is intentionally public.
  const BUILDER_ROUTES = [
    ['post', '/api/ai/scan'],
    ['post', '/api/ai/translate'],
    ['post', '/api/ai/suggest'],
    ['get', '/api/export/00000000-0000-0000-0000-000000000000/preview'],
    ['get', '/api/resumes'],
    ['post', '/api/resumes'],
    ['post', '/api/import'],
    ['get', '/api/templates/00000000-0000-0000-0000-000000000000'],
  ];

  test.each(BUILDER_ROUTES)('%s %s rejects anonymous callers', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  test.each(BUILDER_ROUTES)('%s %s rejects a forged bearer token', async (method, path) => {
    const res = await request(app)[method](path)
      .set('Authorization', 'Bearer not-a-real-token')
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('stateless rendering accepts callers without an active session', () => {
  test.each(['/api/export/preview', '/api/export/download'])('%s still validates the request', async path => {
    for (const token of ['', 'Bearer not-a-real-token']) {
      const res = await request(app).post(path).set('Authorization', token).send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('templateId is required');
    }
  });
});

describe('CORS is not open to any origin', () => {
  test('a disallowed origin is not reflected back', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('an allowed origin is reflected', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://kompetenzen.in');
    expect(res.headers['access-control-allow-origin']).toBe('https://kompetenzen.in');
  });
});

describe('requireAdmin middleware', () => {
  // The route tests above stop at the 401, because this offline suite cannot
  // mint a real Supabase token. These exercise the staff check directly.
  const { requireAdmin } = require('../src/middleware/auth');

  function runMiddleware(mw, user) {
    const req = { user, originalUrl: '/api/resumes' };
    let statusCode = null;
    let payload = null;
    let nextCalled = false;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { payload = body; return this; },
    };
    mw(req, res, () => { nextCalled = true; });
    return { statusCode, payload, nextCalled };
  }

  test('requireAdmin blocks a normal user', () => {
    const r = runMiddleware(requireAdmin, { id: 'u1', role: 'user' });
    expect(r.nextCalled).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  test('requireAdmin admits staff', () => {
    const r = runMiddleware(requireAdmin, { id: 'u1', role: 'admin' });
    expect(r.nextCalled).toBe(true);
  });
});
