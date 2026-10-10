/**
 * authenticatePreview: the live preview's cached sign-in check.
 */
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

const mockGetUser = jest.fn();
jest.mock('../src/config/supabase', () => ({
  supabase: { auth: { getUser: (...a) => mockGetUser(...a) }, from: () => ({}) },
}));

const { authenticatePreview, authenticateIdentity } = require('../src/middleware/auth');

function run(token, middleware = authenticatePreview) {
  const req = { headers: token ? { authorization: 'Bearer ' + token } : {} };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { return this; } };
  let passed = false;
  return middleware(req, res, () => { passed = true; }).then(() => ({ req, res, passed }));
}

beforeEach(() => mockGetUser.mockReset());

test('AI authentication verifies every request without fetching a profile', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'ai-user', email: 'test@example.invalid' } }, error: null });
  expect((await run('ai-token', authenticateIdentity)).passed).toBe(true);
  const second = await run('ai-token', authenticateIdentity);
  expect(second.passed).toBe(true);
  expect(second.req.user).toEqual({ id: 'ai-user', email: 'test@example.invalid' });
  expect(mockGetUser).toHaveBeenCalledTimes(2);
  mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
  expect((await run('ai-token', authenticateIdentity)).res.statusCode).toBe(401);
});

test('rejects a request with no token', async () => {
  const r = await run(null);
  expect(r.passed).toBe(false);
  expect(r.res.statusCode).toBe(401);
});

test('rejects a token Supabase does not recognise', async () => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('bad') });
  const r = await run('bad-token');
  expect(r.passed).toBe(false);
  expect(r.res.statusCode).toBe(401);
});

test('verifies once, then serves repeat previews from the cache', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@x.com' } }, error: null });
  const first = await run('good-token');
  const second = await run('good-token');
  expect(first.passed && second.passed).toBe(true);
  expect(second.req.user).toEqual({ id: 'u1', email: 'a@x.com' });
  expect(mockGetUser).toHaveBeenCalledTimes(1);
});

test('a different token is verified separately', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'b@x.com' } }, error: null });
  await run('token-one');
  await run('token-two');
  expect(mockGetUser).toHaveBeenCalledTimes(2);
});
