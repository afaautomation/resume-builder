const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Handlebars = require('handlebars');
const { parseDocument } = require('htmlparser2');

const context = {
  window: {}, URL, console, Handlebars: Handlebars.create(),
  localStorage: { getItem: () => null },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../frontend/client-renderer.js'), 'utf8'), context);
const renderer = context.window.ResumeRenderer;
const seed = fs.readFileSync(path.join(__dirname, '../src/scripts/seedTemplates.js'), 'utf8');
const templates = vm.runInNewContext(seed.slice(seed.indexOf('const templates ='), seed.indexOf('const writingTips =')) + '\ntemplates;');

function nodes(html) {
  const found = [];
  function walk(node) { if (node.attribs) found.push(node); (node.children || []).forEach(walk); }
  walk(parseDocument(html)); return found;
}
const content = {
  contact: { name: 'QA Candidate' }, summary: 'Summary',
  skills: ['Testing'], experience: [{ company: 'Company' }],
  education: [{ institution: 'School' }], projects: [{ name: 'Project' }],
  certifications: ['Certificate'], languages: ['English'], additional: [{ title: 'Extra', value: 'Detail' }],
};

test.each(templates.map(template => [template.name, template]))('client renderer tags existing %s sections without changing template data', (name, template) => {
  const before = JSON.stringify(template);
  const html = renderer.buildClientPreviewHtml(content, {}, template);
  const keys = nodes(html).map(node => node.attribs['data-resume-section']).filter(Boolean);
  expect(keys).toEqual(expect.arrayContaining(['summary', 'skills', 'experience', 'education', 'projects']));
  expect(new Set(keys).size).toBe(keys.length);
  expect(JSON.stringify(template)).toBe(before);
});

test('client renderer keeps input text literal and rejects unsafe URLs and design', () => {
  const text = '<img src=x onerror="alert(1)">';
  const html = renderer.buildClientPreviewHtml({ ...content, summary: text + '\nNext line',
    projects: [{ name: 'Project', description: text, link: 'javascript:alert(1)' }],
  }, { primaryColor: '</style><script>alert(1)</script>', fontFamily: '</style><script>alert(1)</script>', margins: null }, templates[0]);
  const parsed = nodes(html);
  expect(parsed.filter(node => node.name === 'img')).toHaveLength(0);
  expect(parsed.filter(node => node.name === 'script')).toHaveLength(1); // Trusted pagination script.
  expect(parsed.some(node => Object.keys(node.attribs).some(attr => /^on/i.test(attr)))).toBe(false);
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain('&lt;img');
  expect(html).toContain('<br>Next line');
});

test('client normalization sanitizes contact links, keeps valid links and does not mutate the input', () => {
  const input = { contact: { website: 'javascript:alert(1)', github: 'github.com/qa' },
    projects: [{ title: 'Imported', link: 'https://example.com/project' }],
    certifications: ['Certificate'], languages: ['English'], experience: '{"bad":"shape"}' };
  const before = JSON.stringify(input);
  const normalized = renderer.normalizeResumeData(input);
  expect(normalized.contact.website).toBe('');
  expect(normalized.contact.github).toBe('https://github.com/qa');
  expect(normalized.projects[0]).toMatchObject({ name: 'Imported', link: 'https://example.com/project' });
  expect(normalized.certifications[0].name).toBe('Certificate');
  expect(normalized.languages[0].name).toBe('English');
  expect(normalized.experience).toEqual([]);
  expect(JSON.stringify(input)).toBe(before);
});

test('template listings preserve complete cached renderers and resolve built-in names', () => {
  const full = { ...templates[0], id: 'server-template' };
  renderer.cacheTemplates([full]);
  renderer.cacheTemplates([{ id: full.id, name: full.name }, { id: 'server-classic', name: 'Classic Serif' }]);
  expect(renderer.getTemplateById(full.id).html_content).toBe(full.html_content);
  expect(renderer.getTemplateById('server-classic').html_content).toContain('{{contact.name}}');
});

test('unavailable template content requests the backend fallback instead of a blank preview', () => {
  renderer.cacheTemplates([{ id: 'unknown-layout', name: 'Custom Layout' }]);
  expect(renderer.getTemplateById('unknown-layout')).toBeNull();
  expect(renderer.getTemplateById('missing-id')).toBeNull();
});
