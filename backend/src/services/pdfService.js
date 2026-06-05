/**
 * HTML Preview Service
 * Renders a resume to HTML using Handlebars templates.
 */

const Handlebars = require('handlebars');

// ─── Handlebars Helpers ───────────────────────────────────────────────────────
Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
  switch (operator) {
    case '==': return v1 == v2 ? options.fn(this) : options.inverse(this);
    case '!=': return v1 != v2 ? options.fn(this) : options.inverse(this);
    case '>':  return v1 > v2  ? options.fn(this) : options.inverse(this);
    case '<':  return v1 < v2  ? options.fn(this) : options.inverse(this);
    default:   return options.inverse(this);
  }
});

Handlebars.registerHelper('join', (arr, sep) =>
  Array.isArray(arr) ? arr.join(typeof sep === 'string' ? sep : ', ') : ''
);

Handlebars.registerHelper('nl2br', (text) =>
  new Handlebars.SafeString(
    (text || '').replace(/\n/g, '<br>')
  )
);

// ─── HTML Builder ─────────────────────────────────────────────────────────────

function normalizeResumeData(resumeData) {
  const normalized = { ...resumeData };
  if (Array.isArray(normalized.education)) {
    normalized.education = normalized.education.map((item) => ({
      ...item,
      institution: item.institution || item.school || '',
      endDate: item.endDate || item.year || '',
    }));
  }
  return normalized;
}

function mmToPx(mm) {
  return Math.round((mm / 25.4) * 96);
}

function buildHtml(resumeData, design, templateHtml, templateCss) {
  const normalizedResume = normalizeResumeData(resumeData);
  const {
    primaryColor = '#2563EB',
    secondaryColor = '#1e293b',
    fontFamily = 'Inter, sans-serif',
    fontSize = 11,
    lineHeight = 1.5,
    margins = { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  } = design || {};

  const mTop = mmToPx(margins.top);
  const mRight = mmToPx(margins.right);
  const mBottom = mmToPx(margins.bottom);
  const mLeft = mmToPx(margins.left);

  const cssVars = `
    :root {
      --primary: ${primaryColor};
      --secondary: ${secondaryColor};
      --font-family: ${fontFamily};
      --font-size: ${fontSize}pt;
      --line-height: ${lineHeight};
      --margin-top: ${mTop}px;
      --margin-right: ${mRight}px;
      --margin-bottom: ${mBottom}px;
      --margin-left: ${mLeft}px;
    }
  `;

  const baseStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Merriweather:wght@300;400;700&family=Playfair+Display:wght@400;500;700&family=Source+Sans+Pro:wght@300;400;600;700&display=swap');
    
    :root {
      --font-size: 10pt;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: var(--font-family) !important;
      font-size: var(--font-size);
      line-height: var(--line-height);
      color: #1e293b;
      background: #fff;
      -webkit-print-color-adjust: exact;
    }

    .page {
      width: 794px;
      min-height: 1123px;
      margin: 0 auto;
      position: relative;
    }

    .page-inner {
      padding: ${mTop}px ${mRight}px ${mBottom}px ${mLeft}px !important;
      box-sizing: border-box;
      min-height: 100%;
    }

    .bleed-header {
      margin-top: -${mTop}px !important;
      margin-right: -${mRight}px !important;
      margin-left: -${mLeft}px !important;
    }

    section, .item, .section {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    h2 { margin-top: 8pt; margin-bottom: 4pt; }
    p, li { margin-bottom: 2pt; }
    a { color: var(--primary); text-decoration: none; }
    ul { padding-left: 1.2em; }
    li { margin-bottom: 2px; }
  `;

  const compiled = Handlebars.compile(templateHtml);
  const body = compiled({ ...normalizedResume, design });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Resume</title>
  <style>${cssVars}${baseStyles}${templateCss || ''}</style>
</head>
<body>
  <div class="page" id="pdf-content">
    <div class="page-inner">
      ${body}
    </div>
  </div>
</body>
</html>`;
}

function generatePreviewHtml(resumeData, design, templateHtml, templateCss) {
  return buildHtml(resumeData, design, templateHtml, templateCss);
}

module.exports = { generatePreviewHtml, buildHtml, normalizeResumeData };
