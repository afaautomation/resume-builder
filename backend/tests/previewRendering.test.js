const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseDocument } = require('htmlparser2');
const { generatePreviewHtml, normalizeResumeData } = require('../src/services/previewService');
const seed = fs.readFileSync(path.join(__dirname, '../src/scripts/seedTemplates.js'), 'utf8');
const templates = vm.runInNewContext(seed.slice(seed.indexOf('const templates ='), seed.indexOf('const writingTips =')) + '\ntemplates;');
const content = {
  contact: { name: 'Test Candidate', email: 'test@example.invalid' },
  summary: 'Summary text', experience: [{ company: 'Company', title: 'Engineer', description: 'Worked on systems' }],
  education: [{ institution: 'University', degree: 'BSc' }], skills: ['JavaScript'],
  projects: [{ name: 'Project', description: 'Details' }], certifications: [{ name: 'Certificate' }],
  additional: [{ title: 'Volunteering', value: 'Mentor' }], languages: [{ name: 'English' }], references: [{ name: 'Reference' }],
};
function nodes(html) {
  const found = []; function walk(node) { if (node.attribs) found.push(node); (node.children || []).forEach(walk); }
  walk(parseDocument(html)); return found;
}
const keys = html => nodes(html).map(node => node.attribs['data-resume-section']).filter(Boolean);

test.each(templates.map(template => [template.name, template]))('%s renders custom order without dropping or duplicating sections', (name, template) => {
  const original = generatePreviewHtml(content, {}, template.html_content, template.css_content);
  const originalKeys = keys(original);
  expect(originalKeys.length).toBeGreaterThan(5);
  const order = [...originalKeys].reverse();
  const html = generatePreviewHtml(content, {}, template.html_content, template.css_content, order);
  expect(keys(html)).toEqual(order);
  expect(nodes(html).filter(node => node.name === 'header')).toHaveLength(nodes(original).filter(node => node.name === 'header').length);
  expect(html).toContain('Test Candidate');
});

test('duplicate and unknown order keys are ignored; unspecified sections remain', () => {
  const template = templates[0];
  const html = generatePreviewHtml(content, {}, template.html_content, '', ['skills', 'skills', '<script>', 'summary']);
  const ordered = keys(html);
  expect(ordered.slice(0, 2)).toEqual(['skills', 'summary']);
  expect(new Set(ordered).size).toBe(ordered.length);
  expect(ordered).toContain('experience');
});

test('untrusted resume text, URLs and design cannot inject executable markup', () => {
  const template = templates[0];
  const malicious = '<img src=x onerror="alert(1)">';
  const html = generatePreviewHtml({ ...content, summary: malicious + '\nSecond line', projects: [{ name: 'Link', description: malicious, link: 'javascript:alert(1)' }] }, {
    primaryColor: '</style><script>alert(1)</script>', fontFamily: '</style><script>alert(1)</script>', margins: null,
  }, template.html_content, template.css_content);
  const parsed = nodes(html);
  expect(parsed.filter(node => node.name === 'img')).toHaveLength(0);
  expect(parsed.filter(node => node.name === 'script')).toHaveLength(1); // Trusted pagination only.
  expect(parsed.some(node => Object.keys(node.attribs).some(attr => /^on/i.test(attr)))).toBe(false);
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain('&lt;img');
  expect(html).toContain('<br>Second line');
});

test('legacy imported certificates, languages and project titles remain visible', () => {
  const normalized = normalizeResumeData({ certifications: ['Certificate'], languages: ['English'], projects: [{ title: 'Imported project' }], experience: '{"bad":"shape"}' });
  expect(normalized.certifications[0].name).toBe('Certificate');
  expect(normalized.languages[0].name).toBe('English');
  expect(normalized.projects[0].name).toBe('Imported project');
  expect(normalized.experience).toEqual([]);
});
