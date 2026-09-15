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
    case '>': return v1 > v2 ? options.fn(this) : options.inverse(this);
    case '<': return v1 < v2 ? options.fn(this) : options.inverse(this);
    default: return options.inverse(this);
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

Handlebars.registerHelper('nl2li', (text) => {
  if (!text) return '';
  const items = text.split('\n').filter(line => line.trim().length > 0);
  const listItems = items.map(item => `<li>${Handlebars.escapeExpression(item.trim())}</li>`).join('');
  return new Handlebars.SafeString(`<ul>${listItems}</ul>`);
});

// ─── HTML Builder ─────────────────────────────────────────────────────────────

function normalizeResumeData(resumeData) {
  const normalized = { ...resumeData };

  // Ensure all array fields are real arrays (they might come as null or strings)
  const arrayFields = ['experience', 'education', 'skills', 'certifications', 'projects', 'languages', 'awards', 'customSections', 'references'];
  for (const field of arrayFields) {
    if (!Array.isArray(normalized[field])) {
      if (typeof normalized[field] === 'string' && normalized[field].trim()) {
        try { normalized[field] = JSON.parse(normalized[field]); } catch { normalized[field] = []; }
      } else {
        normalized[field] = [];
      }
    }
  }

  // Filter out completely empty objects from list sections
  const listFields = ['experience', 'education', 'certifications', 'projects', 'languages', 'awards', 'references'];
  for (const field of listFields) {
    normalized[field] = normalized[field].filter(item =>
      item && typeof item === 'object' && Object.values(item).some(v => v !== '' && v !== null && v !== undefined)
    );
  }

  // Ensure skills is an array of non-empty strings
  if (Array.isArray(normalized.skills)) {
    normalized.skills = normalized.skills.filter(s => typeof s === 'string' && s.trim());
  }

  // Normalize education aliases
  if (Array.isArray(normalized.education)) {
    normalized.education = normalized.education.map((item) => ({
      ...item,
      institution: item.institution || item.school || '',
      endDate: item.endDate || item.year || '',
    }));
  }

  // Ensure contact is an object
  if (!normalized.contact || typeof normalized.contact !== 'object') {
    normalized.contact = {};
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

  const defaultMargin = 12.7;
  const mTop    = mmToPx(margins.top    ?? defaultMargin);
  const mRight  = mmToPx(margins.right  ?? margins.left ?? defaultMargin);
  const mBottom = mmToPx(margins.bottom ?? margins.right ?? margins.top ?? defaultMargin);
  const mLeft   = mmToPx(margins.left   ?? margins.right ?? defaultMargin);

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
    
    * {
      box-sizing: border-box !important;
    }

    body {
      font-family: var(--font-family) !important;
      font-size: var(--font-size) !important;
      line-height: var(--line-height) !important;
      color: #1e293b;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      word-break: break-word !important;
    }

    p, span, div, li, h1, h2, h3, h4, h5, h6, a, strong, em, td, th {
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      word-break: break-word !important;
      max-width: 100% !important;
    }

    @media screen {
      html, body {
        background-color: #cbd5e1 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        width: 100% !important;
      }
      #preview-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        padding: 24px 0;
        width: 100%;
        box-sizing: border-box;
        background: #cbd5e1;
      }
      .page {
        background: #fff;
        box-shadow: 0 8px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10);
        border-radius: 2px;
        flex-shrink: 0;
      }
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 0;
      }
      html, body {
        background: #fff !important;
        overflow: visible !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 794px !important;
      }
      #preview-content {
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
        gap: 0 !important;
      }
      .page {
        box-shadow: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
        position: relative !important;
      }
      .page:not(:last-child) {
        page-break-after: always !important;
        break-after: page !important;
      }
      .page:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    }

    .page {
      width: 794px;
      height: 1123px;
      overflow: hidden;
      position: relative;
      background: #ffffff;
      box-sizing: border-box;
    }

    .page-inner {
      padding: ${mTop}px ${mRight}px ${mBottom}px ${mLeft}px !important;
      box-sizing: border-box;
      width: 100%;
      max-width: 794px;
    }

    .bleed-header {
      margin-top: -${mTop}px !important;
      margin-right: -${mRight}px !important;
      margin-left: -${mLeft}px !important;
    }

    section, .item, .section, .sec {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    h1, h2, h3, h4, h5, h6 { line-height: 1.25 !important; }
    h1 { margin-top: 0 !important; margin-bottom: 4px; line-height: 1.15 !important; }
    h2 { margin-top: 6pt; margin-bottom: 4pt; }
    p, li { margin-bottom: 2pt; }
    a { color: var(--primary); text-decoration: none; }
    ul { padding-left: 1.2em; }
    li { margin-bottom: 2px; }

    header {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }

    .page-inner > *:first-child,
    .page-inner > *:first-child > *:first-child,
    .page-inner > *:first-child > *:first-child > h1,
    .page-inner > *:first-child > header,
    .page-inner > *:first-child > header > h1 {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }
    .page-inner > .bleed-header:first-child {
      padding-top: 0 !important;
      margin-top: -${mTop}px !important;
    }
  `;

  const compiled = Handlebars.compile(templateHtml);
  const body = compiled({ ...normalizedResume, design });

  let compiledCss = templateCss || '';
  if (templateCss) {
    try {
      const compileCss = Handlebars.compile(templateCss);
      compiledCss = compileCss({ ...normalizedResume, design });
    } catch (err) {
      console.error('Error compiling template CSS:', err);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Resume</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Merriweather:wght@300;400;700&family=Playfair+Display:wght@400;500;700&family=Source+Sans+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>${cssVars}${baseStyles}${compiledCss}</style>
</head>
<body>
  <div id="preview-content">
    <div class="page" id="original-page">
      <div class="page-inner">
        ${body}
      </div>
    </div>
  </div>

  <script>
    let originalTemplateMarkup = null;

    function paginate() {
      const container = document.getElementById('preview-content');
      if (!container) return;

      const A4_H = 1123;
      const A4_W = 794;

      // 1. Capture pristine template markup on initial run
      let originalPage = document.getElementById('original-page');
      if (!originalTemplateMarkup && originalPage) {
        originalTemplateMarkup = originalPage.innerHTML;
      }
      if (!originalTemplateMarkup) return;

      // Restore measuring container to natural height
      container.innerHTML = '<div class="page" id="original-page" style="width:' + A4_W + 'px; height:auto; min-height:' + A4_H + 'px; overflow:visible; position:relative;">' + originalTemplateMarkup + '</div>';
      originalPage = document.getElementById('original-page');
      const pageInner = originalPage.querySelector('.page-inner');
      if (!pageInner) return;

      pageInner.style.height = 'auto';
      pageInner.style.overflow = 'visible';

      // Measure margins
      const cs = window.getComputedStyle(pageInner);
      const padTop = parseFloat(cs.paddingTop) || 48;
      const padBot = parseFloat(cs.paddingBottom) || 48;
      const padLeft = cs.paddingLeft || '48px';
      const padRight = cs.paddingRight || '48px';

      const pageInnerRect = pageInner.getBoundingClientRect();
      const topOffset = pageInnerRect.top;
      const scale = (pageInnerRect.width > 0 && pageInner.offsetWidth > 0)
        ? (pageInnerRect.width / pageInner.offsetWidth)
        : 1;

      const totalH = Math.max(pageInner.scrollHeight, pageInner.offsetHeight, originalPage.scrollHeight);

      // If entire content fits in a single A4 page with bottom margin
      if (totalH <= (A4_H - padBot)) {
        originalPage.style.height = A4_H + 'px';
        originalPage.style.overflow = 'hidden';
        return;
      }

      // Collect all text line boxes using Range.getClientRects()
      const textNodes = [];
      const walker = document.createTreeWalker(pageInner, NodeFilter.SHOW_TEXT, null, false);
      let textNode;
      while (textNode = walker.nextNode()) {
        if (textNode.nodeValue && textNode.nodeValue.trim().length > 0) {
          textNodes.push(textNode);
        }
      }

      const lineBoxes = [];
      const range = document.createRange();
      for (const tn of textNodes) {
        try {
          range.selectNodeContents(tn);
          const rects = range.getClientRects();
          for (let k = 0; k < rects.length; k++) {
            const r = rects[k];
            if (r.width > 0 && r.height > 0) {
              lineBoxes.push({
                top: (r.top - topOffset) / scale,
                bottom: (r.bottom - topOffset) / scale,
                height: r.height / scale,
                parent: tn.parentElement
              });
            }
          }
        } catch (e) {}
      }

      // Collect block elements (sections, items, headings, lists, table rows, images)
      const blockElements = Array.from(pageInner.querySelectorAll('h1, h2, h3, h4, h5, h6, .section-title, section, .sec, .resume-section, .item, .experience-item, .project-item, .education-item, tr, li, p, img, svg, table, header, .skills-list, .skill-item'));
      const blockBoxes = blockElements.map(el => {
        const r = el.getBoundingClientRect();
        const top = (r.top - topOffset) / scale;
        const bottom = (r.bottom - topOffset) / scale;
        const height = r.height / scale;
        const tag = el.tagName.toUpperCase();
        const isHeading = ['H1','H2','H3','H4','H5','H6'].includes(tag) || el.classList.contains('section-title');
        const isItem = el.classList.contains('item') || el.classList.contains('experience-item') || el.classList.contains('project-item') || el.classList.contains('education-item') || tag === 'TR';
        const isSection = tag === 'SECTION' || el.classList.contains('sec') || el.classList.contains('resume-section');
        return { el, top, bottom, height, isHeading, isItem, isSection, tag };
      });

      // Calculate pagination break offsets
      const offsets = [0];
      let currentOffset = 0;

      while (currentOffset < totalH - 10) {
        // Page 1 usable height is A4_H - padBot
        // Page 2+ usable height is A4_H - padTop - padBot
        const usableHeightOnThisPage = (currentOffset === 0)
          ? (A4_H - padBot)
          : (A4_H - padTop - padBot);

        const idealEnd = currentOffset + usableHeightOnThisPage;

        // If remaining content fits completely within this page with bottom margin:
        if (idealEnd >= totalH) {
          break;
        }

        let breakY = idealEnd;

        // Rule 1: Never slice ANY line of text. Find any line that crosses breakY and break before it.
        const cutLines = lineBoxes.filter(l => l.top + 2 < breakY && l.bottom - 2 > breakY);
        if (cutLines.length > 0) {
          const earliestCutLineTop = Math.min(...cutLines.map(l => l.top));
          if (earliestCutLineTop > currentOffset + 40) {
            breakY = earliestCutLineTop - 2;
          }
        }

        // Rule 2: Heading keep-with-next & section border prevention.
        // If a heading or section header is near breakY, push it to the next page
        for (const b of blockBoxes) {
          if (b.isHeading && b.bottom <= breakY && (breakY - b.bottom) < 80) {
            if (b.top > currentOffset + 40) {
              breakY = b.top - 2;
            }
          } else if (b.isHeading && b.top + 2 < breakY && b.bottom - 2 > breakY) {
            if (b.top > currentOffset + 40) {
              breakY = b.top - 2;
            }
          }
        }

        // Rule 3: Keep items intact if starting close to bottom
        for (const b of blockBoxes) {
          if (b.isItem && b.top + 2 < breakY && b.bottom - 2 > breakY) {
            if (b.top > currentOffset + 40 && (breakY - b.top) < 140) {
              breakY = b.top - 2;
            }
          }
        }

        // Rule 4: Re-verify that breakY does not slice any line after adjustments
        const finalCutLines = lineBoxes.filter(l => l.top + 2 < breakY && l.bottom - 2 > breakY);
        if (finalCutLines.length > 0) {
          const minL = Math.min(...finalCutLines.map(l => l.top));
          if (minL > currentOffset + 40) {
            breakY = minL - 2;
          }
        }

        // Safety forward progress guarantee
        if (breakY <= currentOffset + 40) {
          breakY = idealEnd;
        }

        offsets.push(breakY);
        currentOffset = breakY;
      }

      // Render the paginated A4 pages
      container.innerHTML = '';

      for (let i = 0; i < offsets.length; i++) {
        const startY = offsets[i];
        const isLastPage = (i + 1 >= offsets.length);
        const endY = isLastPage ? totalH : offsets[i + 1];
        const sliceH = Math.ceil(endY - startY);

        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.style.width = A4_W + 'px';
        pageDiv.style.height = A4_H + 'px';
        pageDiv.style.position = 'relative';
        pageDiv.style.overflow = 'hidden';
        pageDiv.style.backgroundColor = '#ffffff';
        pageDiv.style.flexShrink = '0';
        pageDiv.style.boxSizing = 'border-box';

        const viewport = document.createElement('div');
        viewport.className = 'page-viewport';
        viewport.style.position = 'absolute';
        viewport.style.left = '0';
        viewport.style.width = '100%';
        viewport.style.overflow = 'hidden';

        const clone = document.createElement('div');
        clone.className = pageInner.className;
        clone.innerHTML = pageInner.innerHTML;
        clone.style.position = 'absolute';
        clone.style.left = '0';
        clone.style.width = '100%';
        clone.style.height = 'auto';

        // Keep identical padding on clone so internal coordinates match measurement exactly
        clone.style.paddingTop = padTop + 'px';
        clone.style.paddingBottom = padBot + 'px';
        clone.style.paddingLeft = padLeft;
        clone.style.paddingRight = padRight;

        if (i === 0) {
          // Page 1:
          const maxVpH = A4_H - padBot;
          const vpH = Math.min(sliceH, maxVpH);
          viewport.style.top = '0px';
          viewport.style.height = vpH + 'px';
          clone.style.top = '0px';
        } else {
          // Pages 2+:
          const maxVpH = A4_H - padTop - padBot;
          const vpH = Math.min(sliceH, maxVpH);
          viewport.style.top = padTop + 'px';
          viewport.style.height = vpH + 'px';
          // Shift clone so coordinate startY lines up exactly at the top of the viewport
          clone.style.top = '-' + startY + 'px';
        }

        viewport.appendChild(clone);
        pageDiv.appendChild(viewport);
        container.appendChild(pageDiv);
      }
    }

    // Guard: only allow one paginate run at a time
    let paginatePending = false;
    const runPaginate = () => {
      if (paginatePending) return;
      paginatePending = true;
      const doRun = () => {
        paginate();
        paginatePending = false;
      };
      if (document.fonts) {
        document.fonts.ready.then(doRun);
      } else {
        setTimeout(doRun, 150);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runPaginate);
    } else {
      runPaginate();
    }
    window.addEventListener('resize', () => { originalTemplateMarkup = null; paginate(); });
  </script>
</body>
</html>`;
}

function generatePreviewHtml(resumeData, design, templateHtml, templateCss) {
  return buildHtml(resumeData, design, templateHtml, templateCss);
}

module.exports = { generatePreviewHtml, buildHtml, normalizeResumeData };
