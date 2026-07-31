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
    margins = { top: 10, right: 12.7, bottom: 10, left: 12.7 },
  } = design || {};

  const mTop    = mmToPx(margins.top    ?? 10);
  const mRight  = mmToPx(margins.right  ?? 12.7);
  const mBottom = mmToPx(margins.bottom ?? 10);
  const mLeft   = mmToPx(margins.left   ?? 12.7);

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
    
    body {
      font-family: var(--font-family) !important;
      font-size: var(--font-size) !important;
      line-height: var(--line-height) !important;
      color: #1e293b;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact;
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
      html, body {
        background: #fff !important;
        overflow: visible !important;
        padding: 0 !important;
        margin: 0 !important;
        display: block !important;
      }
      #preview-content {
        display: block !important;
        padding: 0 !important;
        gap: 0 !important;
      }
      .page {
        box-shadow: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
        page-break-inside: avoid;
        break-inside: avoid;
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
    }

    .page-inner {
      padding: ${mTop}px ${mRight}px ${mBottom}px ${mLeft}px !important;
      box-sizing: border-box;
      height: 100%;
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

    h1, h2, h3, h4, h5, h6 { line-height: 1.25 !important; }
    h2 { margin-top: 6pt; margin-bottom: 4pt; }
    p, li { margin-bottom: 2pt; }
    a { color: var(--primary); text-decoration: none; }
    ul { padding-left: 1.2em; }
    li { margin-bottom: 2px; }

    /* Kill any extra top margin/padding on the very first element inside the page so
       templates don't double-stack spacing on top of page-inner's own padding. */
    .page-inner > *:first-child {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }
    /* Exception: bleed-header is intentional and should NOT have this override */
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
    let originalHtml = null;

    function paginate() {
      const container = document.getElementById('preview-content');
      if (!container) return;

      // ── 1. Capture original HTML once ────────────────────────────────────────
      let originalPage = document.getElementById('original-page');
      if (!originalHtml && originalPage) {
        originalHtml = originalPage.innerHTML;
      }
      if (!originalPage && originalHtml) {
        container.innerHTML = '<div class="page" id="original-page">' + originalHtml + '</div>';
        originalPage = document.getElementById('original-page');
      }
      if (!originalPage) return;

      const pageInner = originalPage.querySelector('.page-inner');
      if (!pageInner) return;

      const A4_H = 1123;
      const A4_W = 794;

      // ── 2. Measure true content height ───────────────────────────────────────
      originalPage.style.height = 'auto';
      originalPage.style.overflow = 'visible';
      pageInner.style.height = 'auto';
      pageInner.style.overflow = 'visible';

      const templateRoot = pageInner.firstElementChild;
      const totalH = templateRoot
        ? templateRoot.offsetHeight || templateRoot.scrollHeight
        : pageInner.scrollHeight;

      // Save top/bottom padding from page-inner
      const computedStyles = window.getComputedStyle(pageInner);
      const savedPaddingTop = computedStyles.paddingTop;
      const savedPaddingBottom = computedStyles.paddingBottom;
      const padTop = parseFloat(savedPaddingTop) || 0;
      const padBot = parseFloat(savedPaddingBottom) || 0;

      // Remove top/bottom padding during measurement so element bounding rects
      // are relative to the content area top (not shifted by padding).
      pageInner.style.setProperty('padding-top', '0px', 'important');
      pageInner.style.setProperty('padding-bottom', '0px', 'important');

      // USABLE_H = the pixel height of one A4 page minus top & bottom margin
      const USABLE_H = A4_H - padTop - padBot;

      // Find atomic layout elements (leaves of the DOM tree)
      const allElements = Array.from(pageInner.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, tr, td, th, .skill-item, .skill-tag, img, svg, div, span, strong'));
      const elements = allElements.filter(el => {
        const hasBlockChildren = el.querySelector('p, div, section, ul, ol, h1, h2, h3, h4, h5, h6, tr, table');
        return !hasBlockChildren;
      });

      const pageInnerRect = pageInner.getBoundingClientRect();
      const scale = pageInnerRect.width / (pageInner.offsetWidth || 794) || 1;

      const relativeRects = elements.map(el => {
        const r = el.getBoundingClientRect();
        const top = (r.top - pageInnerRect.top) / scale;
        const bottom = (r.bottom - pageInnerRect.top) / scale;
        const height = r.height / scale;
        return { top, bottom, height, el };
      });

      // ── 3. Calculate page break offsets (in content-coordinate space) ─────────
      // All offsets are in the "no-padding" coordinate space of pageInner.
      const offsets = [0];
      let currentOffset = 0;

      while (currentOffset < totalH - 5) {
        let idealEnd = currentOffset + USABLE_H;
        if (idealEnd >= totalH) break;

        let adjustedEnd = idealEnd;

        // Find elements that are sliced by idealEnd
        const cutItems = relativeRects.filter(
          item => item.top + 2 < idealEnd && item.bottom - 2 > idealEnd
        );

        if (cutItems.length > 0) {
          let candidateBreaks = [];
          for (const item of cutItems) {
            if (item.height <= USABLE_H && item.top > currentOffset + 30) {
              let breakAt = item.top;
              // Try breaking before the parent wrapper for a cleaner split
              const parent = item.el.parentElement;
              if (parent && parent !== pageInner) {
                const pr = parent.getBoundingClientRect();
                const pTop = (pr.top - pageInnerRect.top) / scale;
                if (pTop > currentOffset + 30 && pTop < breakAt && (idealEnd - pTop) < 300) {
                  breakAt = pTop;
                }
              }
              candidateBreaks.push(breakAt);
            }
          }
          if (candidateBreaks.length > 0) {
            const minBreak = Math.min(...candidateBreaks);
            if (minBreak > currentOffset + 30) adjustedEnd = minBreak;
          }
        }

        // Heading keep-with-next: don't orphan a heading at the very bottom
        for (const item of relativeRects) {
          const isHeading = ['H1','H2','H3','H4','H5','H6'].includes(item.el.tagName)
            || (item.el.classList && item.el.classList.contains('section-title'));
          if (isHeading && item.bottom <= adjustedEnd && (adjustedEnd - item.bottom) < 60) {
            if (item.top > currentOffset + 30) adjustedEnd = item.top;
          }
        }

        // Safety: guarantee forward progress
        if (adjustedEnd <= currentOffset + 30) adjustedEnd = idealEnd;

        offsets.push(adjustedEnd);
        currentOffset = adjustedEnd;
      }

      // ── 4. Render Pages ──────────────────────────────────────────────────────
      // Key coordinate model:
      //
      //  Page 1  clone: top=0, padding-top restored → content starts at padTop px
      //                 The break point (offsets[1]) is in content-coordinates.
      //                 In rendered coordinates the break sits at padTop + offsets[1].
      //                 viewport height must be padTop + offsets[1] to show everything.
      //
      //  Page N  clone: top = -(offsets[i]) px, padding-top = 0
      //                 Content for this page starts at content-coord offsets[i].
      //                 After the shift, that maps to rendered coord 0 inside the clone.
      //                 Viewport top = padTop (margin), height = rawVisibleH (content slice).
      //                 The outer page div (overflow:hidden, height:A4_H) clips the rest.

      container.innerHTML = '';

      for (let i = 0; i < offsets.length; i++) {
        const startY    = offsets[i];
        const isLastPage = (i + 1 >= offsets.length);
        const endY       = isLastPage ? totalH : offsets[i + 1];
        const rawVisibleH = Math.ceil(endY - startY);   // height of content slice in px

        // ── Outer A4 page shell ──
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.style.width           = A4_W + 'px';
        pageDiv.style.height          = A4_H + 'px';
        pageDiv.style.position        = 'relative';
        pageDiv.style.overflow        = 'hidden';   // ← this is the final clip boundary
        pageDiv.style.backgroundColor = '#ffffff';
        pageDiv.style.flexShrink      = '0';

        // ── Viewport strip (clips to the content slice for this page) ──
        const viewport = document.createElement('div');
        viewport.className      = 'page-viewport';
        viewport.style.position = 'absolute';
        viewport.style.left     = '0';
        viewport.style.width    = '100%';
        viewport.style.overflow = 'hidden';

        // ── Clone of page-inner with content shifted to show this slice ──
        const clone = document.createElement('div');
        clone.innerHTML = pageInner.innerHTML;
        clone.className = pageInner.className;
        clone.setAttribute('style', pageInner.getAttribute('style') || '');
        clone.style.position = 'absolute';
        clone.style.left     = '0';
        clone.style.width    = '100%';
        clone.style.height   = 'auto';
        clone.style.overflow = 'visible';

        if (i === 0) {
          // Page 1:
          //   • Clone starts at top:0 with padding restored.
          //     Content area begins at padTop px inside the clone.
          //   • Break point in rendered coords = padTop + rawVisibleH
          //   • Viewport height = padTop + rawVisibleH (+ padBot if only page)
          //     capped at A4_H so it never exceeds the page shell.
          const vpH = Math.min(padTop + rawVisibleH + (isLastPage ? padBot : 0), A4_H);
          viewport.style.top    = '0px';
          viewport.style.height = vpH + 'px';
          clone.style.top = '0px';
          clone.style.setProperty('padding-top',    savedPaddingTop,    'important');
          clone.style.setProperty('padding-bottom', savedPaddingBottom, 'important');
        } else {
          // Pages 2+:
          //   • Clone is shifted up by startY so the right content lands at top:0.
          //   • We add back padTop as the viewport's top offset (page margin).
          //   • Viewport height = rawVisibleH (content slice) + padBot on last page,
          //     capped at USABLE_H so nothing overflows the page shell below.
          const vpH = Math.min(rawVisibleH + (isLastPage ? padBot : 0), USABLE_H);
          viewport.style.top    = padTop + 'px';
          viewport.style.height = vpH + 'px';
          clone.style.top = '-' + startY + 'px';
          clone.style.setProperty('padding-top',    '0px',              'important');
          clone.style.setProperty('padding-bottom', savedPaddingBottom, 'important');
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
    // Do NOT re-run on window.load — fonts.ready is sufficient and prevents double-pagination
    window.addEventListener('resize', () => { originalHtml = null; paginate(); });
  </script>
</body>
</html>`;
}

function generatePreviewHtml(resumeData, design, templateHtml, templateCss) {
  return buildHtml(resumeData, design, templateHtml, templateCss);
}

module.exports = { generatePreviewHtml, buildHtml, normalizeResumeData };
