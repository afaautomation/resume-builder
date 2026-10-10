/**
 * The resume builder is free: previews and downloads are clean and unlimited.
 */
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

const mockRpc = jest.fn();
const TEMPLATE = { html_content: '<div>{{personal.fullName}}</div>', css_content: '' };

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const query = {
          eq: () => query,
          limit: () => query,
          maybeSingle: async () => ({ data: TEMPLATE, error: null }),
        };
        return query;
      },
    }),
    rpc: (...args) => mockRpc(...args),
  },
}));

const { previewFromData, downloadFromData } = require('../src/controllers/exportController');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

const body = { content: {}, design: {}, templateId: 't1' };

beforeEach(() => mockRpc.mockReset());

describe('preview', () => {
  test('previews are clean (no watermark)', async () => {
    const res = mockRes();
    await previewFromData({ body, user: { id: 'u1' } }, res);
    expect(res.body).not.toContain('kp-preview-watermark');
    expect(res.body).not.toContain('PREVIEW');
  });
});

describe('download', () => {
  test('is free and unlimited', async () => {
    const res = mockRes();
    await downloadFromData({ body, user: { id: 'u1' } }, res);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Trial-Downloads-Left']).toBeUndefined();
    expect(res.body).not.toContain('kp-preview-watermark');
  });

  test('still rejects a request with no template', async () => {
    const res = mockRes();
    await downloadFromData({ body: { content: {} }, user: { id: 'u1' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
