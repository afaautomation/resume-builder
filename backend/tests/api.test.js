process.env.NODE_ENV = 'test';
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/config/supabase', () => ({ supabase: require('./helpers/fakeSupabase').createFakeSupabase() }));
jest.mock('../src/services/aiService', () => ({ analyzeAts: async () => ({ score: 80 }) }));
const request = require('supertest');
const app = require('../src/server');
const { supabase } = require('../src/config/supabase');
const templateId = '22222222-2222-4222-8222-222222222222';
const call = (method, url, token = 'owner') => request(app)[method](url).set('Authorization', `Bearer ${token}`);
const initial = { title: 'Original', templateId, content: { contact: { name: 'Test Candidate' }, summary: 'Original summary', skills: ['JavaScript'] }, design: { primaryColor: '#2563eb' }, sectionOrder: ['summary', 'skills'] };

beforeEach(() => {
  Object.keys(supabase.tables).forEach(table => { supabase.tables[table] = []; });
  Object.keys(supabase.failures).forEach(key => delete supabase.failures[key]);
  supabase.tables.resume_templates.push({ id: templateId, name: 'Test', category: 'modern', layout: 'single', html_content: '{{#if summary}}<section>{{summary}}</section>{{/if}}{{#if skills.length}}<section>{{#each skills}}{{this}}{{/each}}</section>{{/if}}', css_content: '', tags: [] });
  supabase.tables.writing_tips.push({ id: 'tip', section: 'experience', content: 'Quantify outcomes', tags: [] });
});
async function create(body = initial) {
  const response = await call('post', '/api/resumes').send(body);
  expect(response.status).toBe(201);
  return response.body.resume;
}

test('uses Supabase sessions and rejects invalid tokens', async () => {
  expect((await request(app).get('/api/resumes')).status).toBe(401);
  expect((await call('get', '/api/auth/me', 'forged')).status).toBe(401);
  const me = await call('get', '/api/auth/me');
  expect(me.status).toBe(200);
  expect(me.body.user.email).toBe('owner@example.invalid');
});

test('creates, reads, lists, duplicates and deletes owned resumes', async () => {
  const resume = await create();
  expect((await call('get', `/api/resumes/${resume.id}`)).body.resume.content).toEqual(initial.content);
  expect((await call('get', '/api/resumes')).body.resumes).toHaveLength(1);
  expect((await call('get', '/api/resumes', 'other')).body.resumes).toEqual([]);
  const duplicate = await call('post', `/api/resumes/${resume.id}/duplicate`);
  expect(duplicate.status).toBe(201);
  expect(duplicate.body.resume.content).toEqual(initial.content);
  expect((await call('delete', `/api/resumes/${resume.id}`)).status).toBe(200);
  expect((await call('get', `/api/resumes/${resume.id}`)).status).toBe(404);
});

test('a retried local creation keeps the same resume id', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  await create({ ...initial, id });
  expect((await call('post', '/api/resumes').send({ ...initial, id })).status).toBe(200);
  expect(supabase.tables.resumes).toHaveLength(1);
  expect((await call('post', '/api/resumes', 'other').send({ ...initial, id })).status).toBe(404);
});

test('updates create restorable full snapshots and restoration preserves the replaced state', async () => {
  const resume = await create();
  const changed = { title: 'Updated', content: { summary: 'Updated summary' }, design: { primaryColor: '#ff0000' }, sectionOrder: ['skills', 'summary'] };
  expect((await call('patch', `/api/resumes/${resume.id}`).send(changed)).status).toBe(200);
  let versions = await call('get', `/api/resumes/${resume.id}/versions`);
  expect(versions.body.versions).toHaveLength(1);
  const restored = await call('post', `/api/resumes/${resume.id}/versions/${versions.body.versions[0].id}/restore`);
  expect(restored.status).toBe(200);
  expect(restored.body.resume).toMatchObject({ title: initial.title, content: initial.content, design: initial.design, sectionOrder: initial.sectionOrder });
  versions = await call('get', `/api/resumes/${resume.id}/versions`);
  expect(versions.body.versions).toHaveLength(2);
  expect(supabase.tables.resume_versions[1].snapshot.content).toEqual(changed.content);
});

test('unchanged saves do not create duplicate snapshots', async () => {
  const resume = await create();
  expect((await call('patch', `/api/resumes/${resume.id}`).send(initial)).status).toBe(200);
  expect(supabase.tables.resume_versions).toEqual([]);
});

test('legacy content-only history can still be restored', async () => {
  const resume = await create();
  supabase.tables.resume_versions.push({ id: 'legacy-version', resume_id: resume.id, version_num: 1, snapshot: { summary: 'Legacy content' } });
  const restored = await call('post', `/api/resumes/${resume.id}/versions/legacy-version/restore`);
  expect(restored.status).toBe(200);
  expect(restored.body.resume.content).toEqual({ summary: 'Legacy content' });
  expect(restored.body.resume.title).toBe(initial.title);
});

test('history failure prevents overwriting the previous resume', async () => {
  const resume = await create();
  supabase.failures['resume_versions.insert'] = { message: 'Unavailable' };
  expect((await call('patch', `/api/resumes/${resume.id}`).send({ content: { summary: 'Unsaved' } })).status).toBe(500);
  expect(supabase.tables.resumes[0].content).toEqual(initial.content);
});

test('private history, updates, deletion and restore reject another user', async () => {
  const resume = await create();
  await call('patch', `/api/resumes/${resume.id}`).send({ title: 'Changed' });
  const version = supabase.tables.resume_versions[0];
  for (const [method, suffix] of [['get', '/versions'], ['patch', ''], ['delete', ''], ['post', `/versions/${version.id}/restore`]]) {
    expect((await call(method, `/api/resumes/${resume.id}${suffix}`, 'other').send({ title: 'Unauthorized' })).status).toBe(404);
  }
  supabase.tables.resumes[0].is_public = true;
  expect((await call('get', `/api/resumes/${resume.id}/versions`, 'other')).status).toBe(404);
});

test('design and order changes also preserve history', async () => {
  const resume = await create();
  expect((await call('patch', `/api/resumes/${resume.id}/design`).send({ design: { fontSize: 12 } })).status).toBe(200);
  expect((await call('patch', `/api/resumes/${resume.id}/order`).send({ sectionOrder: ['skills', 'summary'] })).status).toBe(200);
  expect(supabase.tables.resume_versions).toHaveLength(2);
});

test('preview and download use the requested section order', async () => {
  const resume = await create();
  for (const endpoint of ['preview', 'download']) {
    const result = await call('post', `/api/export/${endpoint}`).send({ ...initial, sectionOrder: ['skills', 'summary'] });
    expect(result.status).toBe(200);
    expect(result.text.indexOf('data-resume-section="skills"')).toBeLessThan(result.text.indexOf('data-resume-section="summary"'));
  }
  await call('patch', `/api/resumes/${resume.id}/order`).send({ sectionOrder: ['skills', 'summary'] });
  const saved = await call('get', `/api/export/${resume.id}/preview`);
  expect(saved.text.indexOf('data-resume-section="skills"')).toBeLessThan(saved.text.indexOf('data-resume-section="summary"'));
});

test('templates, categories, tips, health and ATS routes respond', async () => {
  for (const url of ['/api/templates', '/api/templates/categories', '/api/tips', '/api/tips/experience', '/health']) {
    expect((await request(app).get(url)).status).toBe(200);
  }
  const resume = await create();
  const ats = await call('get', `/api/resumes/${resume.id}/ats`);
  expect(ats.status).toBe(200);
  expect(typeof ats.body.ats.score).toBe('number');
});
