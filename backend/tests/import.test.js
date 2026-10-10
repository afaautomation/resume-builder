process.env.NODE_ENV = 'test';
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/config/supabase', () => ({ supabase: require('./helpers/fakeSupabase').createFakeSupabase() }));
jest.mock('tesseract.js', () => ({ recognize: jest.fn(async () => ({ data: { text: 'Test Candidate\ntest@example.invalid\nSkills\nJavaScript, SQL' } })) }));
const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const { supabase } = require('../src/config/supabase');
const { uploadAndImport, getJobStatus } = require('../src/controllers/importController');
const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
let fixtureDir;
beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-import-test-'));
  const zip = archiver('zip'); const chunks = [];
  const finished = new Promise((resolve, reject) => { zip.on('data', data => chunks.push(data)); zip.on('end', resolve); zip.on('error', reject); });
  zip.append('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', { name: '[Content_Types].xml' });
  zip.append('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', { name: '_rels/.rels' });
  const paragraphs = ['Test Candidate', 'test@example.invalid', 'Skills', 'JavaScript, SQL'].map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('');
  zip.append(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`, { name: 'word/document.xml' });
  await zip.finalize(); await finished;
  fs.writeFileSync(path.join(fixtureDir, 'sample.docx'), Buffer.concat(chunks));
  fs.writeFileSync(path.join(fixtureDir, 'broken.docx'), 'not a document');
});
afterAll(() => {
  for (const name of ['sample.docx', 'broken.docx']) fs.unlinkSync(path.join(fixtureDir, name));
  fs.rmdirSync(fixtureDir);
});
beforeEach(() => { supabase.tables.import_jobs = []; });
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
async function processFile(name, mimetype = mime) {
  // Like multer, hand the controller its own copy of the upload.
  const fixture = path.join(fixtureDir, name), upload = path.join(fixtureDir, `upload-${Date.now()}-${name}`);
  if (fs.existsSync(fixture)) fs.copyFileSync(fixture, upload);
  const res = response();
  await uploadAndImport({ file: { path: upload, mimetype }, user: { id: 'owner' } }, res);
  expect(res.body.success).toBe(true);
  const job = supabase.tables.import_jobs.find(job => job.id === res.body.jobId);
  let end = Date.now() + 3000;
  while (job.status === 'processing' && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
  // The uploaded resume must not be kept once it has been read.
  end = Date.now() + 1000;
  while (fs.existsSync(upload) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
  expect(fs.existsSync(upload)).toBe(false);
  return job;
}

test('a real DOCX import completes and returns editable resume content', async () => {
  const job = await processFile('sample.docx');
  expect(job.status).toBe('completed');
  expect(job.extracted.contact.name).toBe('Test Candidate');
  expect(job.extracted.skills).toEqual(['JavaScript', 'SQL']);
  const owner = response();
  await getJobStatus({ params: { id: job.id }, user: { id: 'owner' } }, owner);
  expect(owner.body.job.extracted).toEqual(job.extracted);
  const other = response();
  await getJobStatus({ params: { id: job.id }, user: { id: 'other' } }, other);
  expect(other.statusCode).toBe(404);
});

test('bad documents transition to failed instead of staying in processing', async () => {
  const job = await processFile('broken.docx');
  expect(job.status).toBe('failed');
  expect(job.error).toBeTruthy();
});

test('image imports use the OCR result in the same content shape', async () => {
  const job = await processFile('image.png', 'image/png');
  expect(job.status).toBe('completed');
  expect(job.extracted.skills).toEqual(['JavaScript', 'SQL']);
});
