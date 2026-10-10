const { parseDocument } = require('htmlparser2');

const SECTION_KEYS = new Set([
  'summary', 'experience', 'education', 'skills', 'projects',
  'certifications', 'additional', 'languages', 'references', 'awards', 'customSections',
]);

// Add stable identifiers to the templates already stored in the database.
// Existing explicitly tagged templates are supported as well; no reseed needed.
function tagTemplateSections(template) {
  return template.replace(/(\{\{#if\s+(\w+)(?:\.length)?\s*\}\}\s*<section)(\s[^>]*|)>/g,
    (match, opening, key, attrs) => SECTION_KEYS.has(key) && !attrs.includes('data-resume-section')
      ? `${opening} data-resume-section="${key}"${attrs}>` : match);
}

function orderSections(html, sectionOrder) {
  if (!Array.isArray(sectionOrder) || !sectionOrder.length) return html;
  const document = parseDocument(html, { withStartIndices: true, withEndIndices: true });
  const sections = [];
  function visit(node) {
    const key = node.attribs && node.attribs['data-resume-section'];
    if (SECTION_KEYS.has(key)) {
      sections.push({ key, start: node.startIndex, end: node.endIndex + 1 });
      return;
    }
    (node.children || []).forEach(visit);
  }
  visit(document);
  const keys = [...new Set(sectionOrder.filter(key => SECTION_KEYS.has(key)))];
  const ranked = new Map(keys.map((key, index) => [key, index]));
  const ordered = [...sections].sort((a, b) =>
    (ranked.get(a.key) ?? keys.length) - (ranked.get(b.key) ?? keys.length));
  let result = '', offset = 0;
  sections.forEach((slot, index) => {
    const next = ordered[index];
    result += html.slice(offset, slot.start) + html.slice(next.start, next.end);
    offset = slot.end;
  });
  // Keep template wrappers/columns and header unchanged, moving only sections.
  return result + html.slice(offset);
}

module.exports = { tagTemplateSections, orderSections };
