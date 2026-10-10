const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseDocument } = require('htmlparser2');
const source = fs.readFileSync(path.join(__dirname, '../../frontend/app.js'), 'utf8').replace(/\r\n/g, '\n');
function part(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error(`Missing frontend function: ${start}`);
  return source.slice(first, last);
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'test@example.invalid' };
function setup() {
  const resume = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user_id: user.id, title: 'Draft', content: { summary: 'Before' }, design: {}, sectionOrder: ['skills', 'summary'] };
  const storage = new Map();
  const form = { innerHTML: '', querySelectorAll: () => [] };
  const ctx = {
    state: { currentResume: resume, resumes: [resume], isDirty: true, isSaving: false, autosaveEnabled: true },
    window: { scrollTo() {}, confirm: jest.fn(() => true) }, console,
    document: { querySelectorAll: () => [], getElementById: id => id === 'active-section-form' ? form : null },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    getResumeUser: async () => user,
    isSupabaseConfigured: () => false,
    setSaveStatus: jest.fn(), showToast: jest.fn(), updateViewUrl: jest.fn(),
    updatePreview: jest.fn(), updatePreviewDebounced: jest.fn(), scheduleAutosave: jest.fn(),
    setupEditor: jest.fn(), syncAutosaveToggle: jest.fn(), switchView: jest.fn(),
    lucide: { createIcons() {} },
    apiFetch: jest.fn(async () => ({ resume: { id: resume.id, updated_at: new Date().toISOString() } })),
    storage, form,
  };
  vm.createContext(ctx);
  for (const code of [
    part('function getUserResumeCacheKey(', '// Clean up legacy global cache'),
    part('function markDirty()', '// Kept as an alias'),
    part('let activeSavePromise = null;', 'window.saveResumeNow = saveResumeNow;'),
    part('async function leaveEditor(', 'window.leaveEditor = leaveEditor;'),
    part('function escapeHtml(', 'function formatSavedDate('),
    part('async function fetchSavedResumes(', 'function renderSavedResumes('),
    part('async function openEditor(', 'function setupEditor('),
    part('function renderSectionForm(', 'function addListItem('),
  ]) vm.runInContext(code, ctx);
  return ctx;
}

test('remote failure stays dirty, caches a recoverable draft and never claims cloud success', async () => {
  const ctx = setup();
  ctx.apiFetch.mockRejectedValue(new Error('Offline'));
  expect(await ctx.saveResumeNow()).toBe(false);
  expect(ctx.state.isDirty).toBe(true);
  expect(ctx.state.currentResume._needsSync).toBe(true);
  expect(ctx.setSaveStatus).toHaveBeenLastCalledWith('failed');
  expect(ctx.showToast.mock.calls.some(([message]) => message.includes('saved to your account'))).toBe(false);
  expect(JSON.parse([...ctx.storage.values()][0])[0].content.summary).toBe('Before');
});

test('cloud saves go through the versioned API even when direct Supabase is available', async () => {
  const ctx = setup();
  ctx.isSupabaseConfigured = () => true;
  ctx.supabaseClient = { from: jest.fn() };
  expect(await ctx.saveResumeNow()).toBe(true);
  expect(ctx.apiFetch).toHaveBeenCalledTimes(1);
  expect(ctx.supabaseClient.from).not.toHaveBeenCalled();
});

test('an unconfirmed API response keeps a new draft local and pending', async () => {
  const ctx = setup(); ctx.state.currentResume.isLocal = true;
  ctx.apiFetch.mockResolvedValue({ success: true });
  expect(await ctx.saveResumeNow()).toBe(false);
  expect(ctx.state.currentResume.isLocal).toBe(true);
  expect(ctx.state.currentResume._needsSync).toBe(true);
});

test('typing during a slow save is saved in a second request before Save resolves', async () => {
  const ctx = setup();
  let finishFirst;
  ctx.apiFetch.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
  const first = ctx.saveResumeNow();
  await flush();
  ctx.state.currentResume.content.summary = 'Latest';
  ctx.markDirty();
  const second = ctx.saveResumeNow();
  finishFirst({ resume: { id: ctx.state.currentResume.id } });
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(ctx.apiFetch).toHaveBeenCalledTimes(2);
  const sent = ctx.apiFetch.mock.calls.map(([, options]) => JSON.parse(options.body).content.summary);
  expect(sent).toEqual(['Before', 'Latest']);
  expect(ctx.state.isDirty).toBe(false);
  expect(ctx.state.isSaving).toBe(false);
});

test('storage failure does not falsely claim a local backup exists', async () => {
  const ctx = setup();
  ctx.apiFetch.mockRejectedValue(new Error('offline'));
  ctx.localStorage.setItem = () => { throw new Error('quota exceeded'); };
  expect(await ctx.saveResumeNow()).toBe(false);
  expect(ctx.showToast).toHaveBeenCalledWith('Save failed. Keep this page open and retry to avoid losing changes.', 'error');
});

test('a failed follow-up save keeps the latest edit pending', async () => {
  const ctx = setup(); let finish;
  ctx.apiFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('offline'));
  const saving = ctx.saveResumeNow(); await flush();
  ctx.state.currentResume.title = 'Latest title'; ctx.markDirty();
  finish({ resume: { id: ctx.state.currentResume.id } });
  expect(await saving).toBe(false);
  expect(ctx.state.isDirty).toBe(true);
  expect(JSON.parse([...ctx.storage.values()][0])[0].title).toBe('Latest title');
});

test('Back waits for a pending save and stays in the editor on failure', async () => {
  const ctx = setup(); let fail;
  ctx.apiFetch.mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; }));
  const saving = ctx.saveResumeNow(); await flush();
  const leaving = ctx.leaveEditor('templates');
  expect(ctx.switchView).not.toHaveBeenCalled();
  fail(new Error('offline')); await saving; await leaving;
  expect(ctx.switchView).not.toHaveBeenCalled();
});

test('a local draft POST includes its stable id and is marked remote only after success', async () => {
  const ctx = setup(); ctx.state.currentResume.isLocal = true;
  expect(await ctx.saveResumeNow()).toBe(true);
  const [url, options] = ctx.apiFetch.mock.calls[0];
  expect(url).toBe('/resumes'); expect(options.method).toBe('POST');
  expect(JSON.parse(options.body).id).toBe(ctx.state.currentResume.id);
  expect(ctx.state.currentResume.isLocal).toBe(false);
});

test('reopening or listing resumes retains a failed local edit over an older cloud copy', async () => {
  const ctx = setup(); ctx.markDirty();
  const id = ctx.state.currentResume.id;
  ctx.apiFetch.mockResolvedValue({ resumes: [{ id, user_id: user.id, content: { summary: 'Older cloud version' } }] });
  const list = await ctx.fetchSavedResumes(user);
  expect(list[0].content.summary).toBe('Before');
  await ctx.openEditor(id);
  expect(ctx.state.currentResume.content.summary).toBe('Before');
  expect(ctx.state.isDirty).toBe(true);
  expect(ctx.apiFetch).toHaveBeenCalledTimes(1);
});

function elements(html) {
  const list = []; const walk = node => { if (node.type === 'tag') list.push(node); (node.children || []).forEach(walk); };
  walk(parseDocument(html)); return list;
}

test('quotes round-trip through editor fields and pasted HTML remains text', () => {
  const ctx = setup();
  const name = 'Acme "Research" & Development';
  const html = ctx.renderListItem('experience', { company: name, description: '</textarea><img src=x onerror="alert(1)">' }, 0);
  const nodes = elements(html);
  expect(nodes.find(node => node.attribs['data-path'] === 'company').attribs.value).toBe(name);
  expect(nodes.some(node => node.name === 'img')).toBe(false);
  ctx.state.currentResume.content = { contact: { name }, summary: '</textarea><img src=x>' };
  ctx.renderSectionForm('contact');
  expect(elements(ctx.form.innerHTML).find(node => node.attribs['data-path'] === 'contact.name').attribs.value).toBe(name);
  ctx.renderSectionForm('summary');
  expect(elements(ctx.form.innerHTML).some(node => node.name === 'img')).toBe(false);
});

test('typing updates the model immediately, before preview debounce or navigation', () => {
  const ctx = setup();
  const input = { dataset: { path: 'summary' }, value: 'Immediately saved text', tagName: 'TEXTAREA' };
  ctx.form.querySelectorAll = selector => selector === 'input, textarea, select' ? [input] : [];
  ctx.renderSectionForm('summary'); input.oninput();
  expect(ctx.state.currentResume.content.summary).toBe(input.value);
  expect(ctx.state.currentResume._needsSync).toBe(true);
});

test('a failed AI suggestion restores the original text instead of leaving a partial answer', async () => {
  const ctx = setup();
  const textarea = { value: 'My existing summary', readOnly: false };
  const button = { dataset: { type: 'summary' }, innerHTML: 'AI Write', disabled: false };
  ctx.document.getElementById = id => id === 'active-section-form' ? ctx.form : id === 'summary-textarea' ? textarea : null;
  ctx.form.querySelectorAll = selector => selector === '.ai-suggest-btn' ? [button] : [];
  ctx.requireAiAccess = async () => true;
  ctx.requestAiSuggestion = async (type, context, onChunk) => {
    onChunk('Incomplete generated text');
    throw new Error('Provider disconnected');
  };
  ctx.renderSectionForm('summary');
  await button.onclick({ preventDefault() {} });
  expect(textarea.value).toBe('My existing summary');
  expect(textarea.readOnly).toBe(false);
  expect(button.disabled).toBe(false);
  expect(ctx.state.currentResume.content.summary).toBe('Before');
  expect(ctx.showToast).toHaveBeenLastCalledWith('Provider disconnected', 'error');
});
