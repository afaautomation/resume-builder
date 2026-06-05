const request = require('supertest');
const app = require('../src/server');
const { getDb } = require('../src/config/database');

let token = '';
let resumeId = '';

afterAll(() => {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE email = 'test@example.com'").run();
});

describe('Auth', () => {
  test('POST /api/auth/register', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User', email: 'test@example.com', password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    token = res.body.tokens.access;
  });

  test('POST /api/auth/login', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com', password: 'password123',
    });
    expect(res.status).toBe(200);
    token = res.body.tokens.access;
  });

  test('GET /api/auth/me', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@example.com');
  });
});

describe('Templates', () => {
  test('GET /api/templates', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.templates)).toBe(true);
  });

  test('GET /api/templates/categories', async () => {
    const res = await request(app).get('/api/templates/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });
});

describe('Resumes', () => {
  test('POST /api/resumes — create', async () => {
    const res = await request(app)
      .post('/api/resumes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Test Resume' });
    expect(res.status).toBe(201);
    resumeId = res.body.resume.id;
  });

  test('GET /api/resumes — list', async () => {
    const res = await request(app)
      .get('/api/resumes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.resumes.length).toBeGreaterThan(0);
  });

  test('PATCH /api/resumes/:id — update content', async () => {
    const res = await request(app)
      .patch(`/api/resumes/${resumeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: {
          contact: { name: 'Jane Doe', email: 'jane@example.com', phone: '555-0100' },
          summary: 'Senior software engineer with 8 years experience.',
          experience: [{ title: 'Engineer', company: 'Acme', startDate: 'Jan 2020', endDate: 'Present', description: 'Built things' }],
          education: [{ degree: 'BSc', field: 'CS', institution: 'MIT', endDate: '2018' }],
          skills: ['JavaScript', 'React', 'Node.js'],
        },
      });
    expect(res.status).toBe(200);
  });

  test('GET /api/resumes/:id/ats — score', async () => {
    const res = await request(app)
      .get(`/api/resumes/${resumeId}/ats`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.ats.score).toBe('number');
  });

  test('POST /api/resumes/:id/duplicate', async () => {
    const res = await request(app)
      .post(`/api/resumes/${resumeId}/duplicate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    // Cleanup duplicate
    await request(app)
      .delete(`/api/resumes/${res.body.resume.id}`)
      .set('Authorization', `Bearer ${token}`);
  });

  test('DELETE /api/resumes/:id', async () => {
    const res = await request(app)
      .delete(`/api/resumes/${resumeId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('Tips', () => {
  test('GET /api/tips', async () => {
    const res = await request(app).get('/api/tips');
    expect(res.status).toBe(200);
    expect(res.body.tips).toBeDefined();
  });

  test('GET /api/tips/experience', async () => {
    const res = await request(app).get('/api/tips/experience');
    expect(res.status).toBe(200);
    expect(res.body.tips.length).toBeGreaterThan(0);
  });
});

describe('Health', () => {
  test('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
