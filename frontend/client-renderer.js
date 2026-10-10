/**
 * ResumePro Client-Side Template & Preview Renderer
 * Provides standalone, zero-network Handlebars compilation, A4 pagination,
 * and Supabase template loading for 100% offline & static-hosting compatibility.
 */

(function () {
    // 1. Built-in Templates (mirrored from database seed)
    const BUILTIN_TEMPLATES = [
        {
            id: 'd8ab5600-a6de-4059-988a-72e4df7b2bc4',
            name: 'Classic Serif',
            description: 'Traditional 100% ATS-friendly single-column layout for students & professionals.',
            category: 'classic',
            layout: 'single',
            thumbnail_url: 'assets/classic_serif.png',
            html_content: `
      <div class="resume-container-classic">
        <header style="text-align:center; padding-top:0; margin-top:0; padding-bottom:4px; margin-bottom:10px;">
          <h1 style="font-size:2.2em; text-transform:uppercase; letter-spacing:1.5px; margin-top:0; margin-bottom:4px; font-weight:700;">{{contact.name}}</h1>
          {{#if contact.title}}<div style="font-size:1.05em; text-transform:uppercase; letter-spacing:0.8px; font-weight:600; margin-bottom:6px; color:#374151;">{{contact.title}}</div>{{/if}}
          <div style="font-size:0.95em; color:#111827;">
            {{contactLine contact}}
          </div>
          <div style="border-bottom: 2px solid #000; margin-top: 10px; margin-bottom: 12px;"></div>
        </header>
        {{#if summary}}<section class="sec" data-resume-section="summary"><h2>Summary</h2><p>{{nl2br summary}}</p></section>{{/if}}
        {{#if education.length}}<section class="sec" data-resume-section="education"><h2>Education</h2>{{#each education}}<div class="item"><div style="display:flex; justify-content:space-between; align-items:baseline;"><h3 style="font-size:1.05em; font-weight:700;">{{institution}}</h3><span class="date" style="font-weight:600; font-size:0.95em;">{{endDate}}</span></div><div style="font-style:italic; font-size:0.98em; margin-top:1px;">{{degree}}</div></div>{{/each}}</section>{{/if}}
        {{#if experience.length}}<section class="sec" data-resume-section="experience"><h2>Experience</h2>{{#each experience}}<div class="item"><div style="display:flex; justify-content:space-between; align-items:baseline;"><h3 style="font-size:1.05em; font-weight:700;">{{title}}{{#if company}} | {{company}}{{/if}}</h3><span class="date" style="font-weight:600; font-size:0.95em;">{{startDate}}{{#if endDate}} - {{endDate}}{{/if}}</span></div>{{nl2li description}}</div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section class="sec" data-resume-section="projects"><h2>Projects</h2>{{#each projects}}<div class="item"><div style="display:flex; justify-content:space-between; align-items:baseline;"><h3 style="font-size:1.05em; font-weight:700;">{{name}}</h3>{{#if link}}<a href="{{link}}" style="font-size:0.92em; color:#000; text-decoration:underline;">{{link}}</a>{{/if}}</div>{{nl2li description}}</div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section class="sec" data-resume-section="skills"><h2>Skills & Expertise</h2>
          {{#if skillCategories.length}}
            {{#each skillCategories}}{{#if items.length}}<div class="item" style="margin-bottom:8px;"><h3 style="font-size:1em; font-weight:700; margin:0 0 2px 0; color:#000000;">{{category}}</h3><p style="font-weight:400; font-size:0.95em; color:#000000; margin:0; line-height:1.45;">{{join items ", "}}</p></div>{{/if}}{{/each}}
          {{else}}<p style="font-weight:400; font-size:0.95em; color:#000000;">{{join skills ", "}}</p>{{/if}}
        </section>{{/if}}
        {{#if certifications.length}}<section class="sec" data-resume-section="certifications"><h2>Certifications</h2>{{#each certifications}}<div class="item"><div style="display:flex; justify-content:space-between; align-items:baseline;"><h3 style="font-size:1.02em; font-weight:700;">{{name}}</h3><span class="date" style="font-size:0.95em;">{{date}}</span></div>{{#if issuer}}<p style="margin:0;">{{issuer}}</p>{{/if}}</div>{{/each}}</section>{{/if}}
        {{#if additional.length}}<section class="sec" data-resume-section="additional"><h2>Additional Information</h2>{{#each additional}}<p><strong>{{title}}:</strong> {{value}}</p>{{/each}}</section>{{/if}}
        {{#if languages.length}}<section class="sec" data-resume-section="languages"><h2>Languages</h2><p>{{#each languages}}<strong>{{name}}</strong> ({{level}}){{#unless @last}}, {{/unless}}{{/each}}</p></section>{{/if}}
        {{#if references.length}}<section class="sec" data-resume-section="references"><h2>References</h2>{{#each references}}<div class="item"><strong>{{name}}</strong> - {{title}} ({{contact}})</div>{{/each}}</section>{{/if}}
      </div>
    `,
            css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#000000{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Merriweather', 'Times New Roman', serif{{/if}};
      }
      body { font-family: var(--font-family); color: #000; line-height: var(--line-height, 1.35); }
      h2 { font-size: 1.15em; text-transform: uppercase; border-bottom: 1.5px solid #000; margin-top: 12px; margin-bottom: 6px; padding-bottom: 2px; font-weight: 700; letter-spacing: 0.8px; }
      .item { margin-bottom: 8px; }
      .item h3 { font-size: 1.05em; margin: 0; font-weight: 700; }
      .date { font-weight: 600; font-size: 0.95em; color: #111; }
      p { font-size: 1em; margin: 0; }
      ul.bullet-list { margin: 3px 0 6px 18px; padding: 0; list-style-type: disc; }
      ul.bullet-list li { margin-bottom: 2px; font-size: 0.95em; line-height: 1.4; color: #111; }
    `,
            is_ats_safe: true,
            is_premium: false,
            tags: ['classic', 'serif', 'ats', 'student']
        },
        {
            id: '84fcf118-8a75-42ae-9f58-6f416e278c2e',
            name: 'Minimalist Executive',
            description: 'High-impact modern ATS design for tech students and graduates.',
            category: 'modern',
            layout: 'single',
            thumbnail_url: 'assets/minimal_executive.png',
            html_content: `
      <div style="max-width:800px; margin:0 auto; padding:40px;">
        <header style="text-align:center; margin-bottom:18px; border-bottom:2px solid var(--primary, #1e3a8a); padding-bottom:14px;">
          <h1 style="font-size:2.3em; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; margin:0 0 4px 0; color:#000000; text-align:center;">{{contact.name}}</h1>
          {{#if contact.title}}<div style="font-size:1.1em; color:#1e293b; font-weight:600; margin-top:3px; margin-bottom:6px; text-align:center;">{{contact.title}}</div>{{/if}}
          <div style="font-size:0.95em; color:#334155; line-height:1.5; margin-top:4px; text-align:center;">
            {{contactLine contact}}
          </div>
        </header>
        {{#if summary}}<section style="margin-bottom:22px;" data-resume-section="summary"><p style="font-size:1em; line-height: var(--line-height, 1.5); color:#1e293b;">{{nl2br summary}}</p></section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:22px;" data-resume-section="education"><h2 style="font-size:1.15em; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0f172a; margin-top:16px; margin-bottom:12px; border-left:3.5px solid var(--primary, #1e3a8a); padding-left:8px;">Education</h2>{{#each education}}<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{institution}}</strong><span style="font-size:0.9em; font-weight:600; color:#475569;">{{endDate}}</span></div><div style="font-style:italic; font-size:0.95em; color:#334155;">{{degree}}</div></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section style="margin-bottom:22px;" data-resume-section="skills"><h2 style="font-size:1.15em; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0f172a; margin-top:16px; margin-bottom:12px; border-left:3.5px solid var(--primary, #1e3a8a); padding-left:8px;">Technical Skills</h2>
          {{#if skillCategories.length}}
            {{#each skillCategories}}{{#if items.length}}<div style="margin-bottom:10px;"><h4 style="font-size:0.95em; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#0f172a; margin:0 0 3px 0;">{{category}}</h4><p style="font-size:0.95em; font-weight:400; color:#0f172a; margin:0; line-height:1.45;">{{join items ", "}}</p></div>{{/if}}{{/each}}
          {{else}}<p style="font-size:0.95em; font-weight:400; color:#0f172a; margin:0;">{{join skills ", "}}</p>{{/if}}
        </section>{{/if}}
        {{#if projects.length}}<section style="margin-bottom:22px;" data-resume-section="projects"><h2 style="font-size:1.15em; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0f172a; margin-top:16px; margin-bottom:12px; border-left:3.5px solid var(--primary, #1e3a8a); padding-left:8px;">Projects</h2>{{#each projects}}<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{name}}</strong>{{#if link}}<a href="{{link}}" style="font-size:0.9em; color:var(--primary, #1e3a8a);">{{link}}</a>{{/if}}</div>{{nl2li description}}</div>{{/each}}</section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:22px;" data-resume-section="experience"><h2 style="font-size:1.15em; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0f172a; margin-top:16px; margin-bottom:12px; border-left:3.5px solid var(--primary, #1e3a8a); padding-left:8px;">Experience</h2>{{#each experience}}<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{title}} @ {{company}}</strong><span style="font-size:0.9em; font-weight:600; color:#475569;">{{startDate}} - {{endDate}}</span></div>{{nl2li description}}</div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section style="margin-bottom:22px;" data-resume-section="certifications"><h2 style="font-size:1.15em; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0f172a; margin-top:16px; margin-bottom:12px; border-left:3.5px solid var(--primary, #1e3a8a); padding-left:8px;">Certifications</h2>{{#each certifications}}<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{name}}</strong><span style="font-size:0.9em; color:#64748b;">{{date}}</span></div><p style="font-size:0.95em; color:#475569; margin:0;">{{issuer}}</p></div>{{/each}}</section>{{/if}}
        {{#if additional.length}}<section style="margin-top:20px;" data-resume-section="additional"><h2 style="font-size:1.15em; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0f172a; margin-top:16px; margin-bottom:12px; border-left:3.5px solid var(--primary, #1e3a8a); padding-left:8px;">Additional</h2>{{#each additional}}<div style="margin-bottom:8px;"><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        {{#if languages.length}}<section style="margin-top:20px;" data-resume-section="languages"><h2 style="font-size:1.15em; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0f172a; margin-top:16px; margin-bottom:12px; border-left:3.5px solid var(--primary, #1e3a8a); padding-left:8px;">Languages</h2>{{#each languages}}<strong>{{name}}</strong>: {{level}}{{#unless @last}} &bull; {{/unless}}{{/each}}</section>{{/if}}
        {{#if references.length}}<section style="margin-top:20px;" data-resume-section="references"><h2 style="font-size:1.15em; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0f172a; margin-top:16px; margin-bottom:12px; border-left:3.5px solid var(--primary, #1e3a8a); padding-left:8px;">References</h2>{{#each references}}<div style="margin-bottom:8px;"><strong>{{name}}</strong> ({{title}}) - {{contact}}</div>{{/each}}</section>{{/if}}
      </div>
    `,
            css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#1e3a8a{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); background: #fff; color: #0f172a; line-height: var(--line-height, 1.4); }
      h2 { border-bottom: none !important; }
      ul.bullet-list { margin: 3px 0 6px 18px; padding: 0; list-style-type: disc; }
      ul.bullet-list li { margin-bottom: 2px; font-size: 0.95em; line-height: 1.4; color: #0f172a; }
    `,
            is_ats_safe: true,
            is_premium: true,
            tags: ['minimal', 'modern', 'clean', 'student']
        },
        {
            id: '2ca1bc3a-abaa-4555-a673-1aff92236873',
            name: 'Academic Professional',
            description: 'Clean, detailed ATS layout optimized for academic & student research roles.',
            category: 'classic',
            layout: 'single',
            thumbnail_url: 'assets/academic_pro.png',
            html_content: `
      <div style="color:#1a202c;">
        <header style="border-bottom:2px solid #1a202c; padding-bottom:10px; margin-bottom:18px;">
          <h1 style="font-size:2.4em; margin:0; font-family:'Playfair Display', serif; font-weight:700;">{{contact.name}}</h1>
          {{#if contact.title}}<div style="font-size:1.1em; color:#374151; font-style:italic; margin-top:4px; font-family:'Playfair Display', serif;">{{contact.title}}</div>{{/if}}
          <p style="font-size:0.95em; margin-top:5px; color:#1a202c;">
            {{contactLine contact " | "}}
          </p>
        </header>
        {{#if summary}}<section style="margin-bottom:22px;" data-resume-section="summary"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">Academic Profile</h2><p style="font-size:1em; line-height:1.5;">{{nl2br summary}}</p></section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:22px;" data-resume-section="education"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">Education</h2>{{#each education}}<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{institution}}</strong><span style="font-size:0.9em; font-weight:600; color:#475569;">{{endDate}}</span></div><div style="font-style:italic; font-size:0.98em;">{{degree}}</div></div>{{/each}}</section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:22px;" data-resume-section="experience"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">Research & Work Experience</h2>{{#each experience}}<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{title}}</strong>, <span style="font-style:italic;">{{company}}</span><span style="font-size:0.9em; font-weight:600; color:#475569;">{{startDate}} - {{endDate}}</span></div>{{nl2li description}}</div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section style="margin-bottom:22px;" data-resume-section="projects"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">Projects & Publications</h2>{{#each projects}}<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{name}}</strong>{{#if link}}<a href="{{link}}" style="font-size:0.9em; color:var(--primary, #1a202c);">{{link}}</a>{{/if}}</div>{{nl2li description}}</div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section style="margin-bottom:22px;" data-resume-section="skills"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">Skills & Competencies</h2>
          {{#if skillCategories.length}}
            {{#each skillCategories}}{{#if items.length}}<div style="margin-bottom:10px;"><h3 style="font-size:1em; font-weight:700; color:#0f172a; margin:0 0 3px 0;">{{category}}</h3><p style="font-size:0.98em; font-weight:400; color:#0f172a; margin:0; line-height:1.45;">{{join items ", "}}</p></div>{{/if}}{{/each}}
          {{else}}<p style="font-size:0.98em; font-weight:400; color:#0f172a; margin:0;">{{join skills ", "}}</p>{{/if}}
        </section>{{/if}}
        {{#if certifications.length}}<section style="margin-bottom:22px;" data-resume-section="certifications"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">Certifications & Honors</h2>{{#each certifications}}<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{name}}</strong><span style="font-size:0.9em; color:#475569;">{{date}}</span></div>{{#if issuer}}<p style="margin:0; font-size:0.95em;">{{issuer}}</p>{{/if}}</div>{{/each}}</section>{{/if}}
        {{#if additional.length}}<section style="margin-bottom:22px;" data-resume-section="additional"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">Additional Details</h2>{{#each additional}}<div><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
          {{#if languages.length}}<section data-resume-section="languages"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">Languages</h2>{{#each languages}}<div><strong>{{name}}</strong> ({{level}})</div>{{/each}}</section>{{/if}}
          {{#if references.length}}<section data-resume-section="references"><h2 style="font-size:1.3em; color:#1a202c; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin-bottom:10px;">References</h2>{{#each references}}<div style="margin-bottom:10px; font-size:0.95em;"><strong>{{name}}</strong><br>{{title}}<br>{{contact}}</div>{{/each}}</section>{{/if}}
        </div>
      </div>
    `,
            css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#1a202c{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Crimson Pro', serif{{/if}};
      }
      body { font-family: var(--font-family); color: #1a202c; line-height: var(--line-height, 1.45); }
      ul.bullet-list { margin: 3px 0 6px 18px; padding: 0; list-style-type: disc; }
      ul.bullet-list li { margin-bottom: 2px; font-size: 0.95em; line-height: 1.4; color: #1a202c; }
    `,
            is_ats_safe: true,
            is_premium: false,
            tags: ['academic', 'professional', 'detailed', 'student']
        }
    ];

    let cachedTemplates = BUILTIN_TEMPLATES;

    // 2. Handlebars Setup
    function setupHandlebars() {
        if (typeof Handlebars === 'undefined') return false;

        Handlebars.registerHelper('or', function () {
            const args = Array.prototype.slice.call(arguments, 0, -1);
            return args.some(Boolean);
        });

        Handlebars.registerHelper('contactLine', function (contact, sep) {
            if (!contact) return '';
            const delimiter = typeof sep === 'string' ? sep : ' &bull; ';
            const parts = [];
            if (contact.email) parts.push(Handlebars.escapeExpression(contact.email));
            if (contact.phone) parts.push(Handlebars.escapeExpression(contact.phone));
            if (contact.location) parts.push(Handlebars.escapeExpression(contact.location));
            if (contact.linkedin) parts.push('LI: ' + Handlebars.escapeExpression(contact.linkedin));
            if (contact.github) parts.push('GH: ' + Handlebars.escapeExpression(contact.github));
            if (contact.website) parts.push(Handlebars.escapeExpression(contact.website));
            return new Handlebars.SafeString(parts.join(delimiter));
        });

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
                Handlebars.escapeExpression(text == null ? '' : String(text)).replace(/\n/g, '<br>')
            )
        );

        Handlebars.registerHelper('nl2li', (text) => {
            if (!text) return '';
            const items = String(text).split('\n').map(line => line.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean);
            if (!items.length) return '';
            const listItems = items.map(item => '<li>' + Handlebars.escapeExpression(item) + '</li>').join('');
            return new Handlebars.SafeString('<ul class="bullet-list">' + listItems + '</ul>');
        });

        return true;
    }

    // Initialize Handlebars immediately or on load
    if (typeof Handlebars !== 'undefined') setupHandlebars();
    else window.addEventListener('DOMContentLoaded', setupHandlebars);

    // 3. Normalization Helpers
    function normalizeResumeData(resumeData) {
        const normalized = { ...resumeData };
        const arrayFields = ['experience', 'education', 'skills', 'certifications', 'projects', 'languages', 'awards', 'customSections', 'references', 'additional'];
        for (const field of arrayFields) {
            if (!Array.isArray(normalized[field])) {
                if (typeof normalized[field] === 'string' && normalized[field].trim()) {
                    try { normalized[field] = JSON.parse(normalized[field]); } catch { normalized[field] = []; }
                } else {
                    normalized[field] = [];
                }
            }
            if (!Array.isArray(normalized[field])) normalized[field] = [];
        }

        for (const field of ['certifications', 'languages', 'awards']) {
            normalized[field] = normalized[field].map(item => typeof item === 'string' ? { name: item } : item);
        }

        const listFields = ['experience', 'education', 'certifications', 'projects', 'languages', 'awards', 'references'];
        for (const field of listFields) {
            normalized[field] = normalized[field].filter(item =>
                item && typeof item === 'object' && Object.values(item).some(v => v !== '' && v !== null && v !== undefined)
            );
        }

        if (Array.isArray(normalized.skills)) {
            normalized.skills = normalized.skills.filter(s => typeof s === 'string' && s.trim());
        }

        // If skillCategories present, keep it and also rebuild the flat skills[] for templates
        if (Array.isArray(normalized.skillCategories) && normalized.skillCategories.length) {
            normalized.skillCategories = normalized.skillCategories
                .map(c => ({ category: String(c.category || ''), items: (c.items || []).filter(s => typeof s === 'string' && s.trim()) }))
                .filter(c => c.category || c.items.length);
            // Flatten all items into skills[] so legacy template `{{join skills ", "}}` still works
            const allItems = normalized.skillCategories.flatMap(c => c.items);
            if (allItems.length) normalized.skills = allItems;
        } else if (Array.isArray(normalized.skills) && normalized.skills.length) {
            // Build a default skillCategories from the flat list for templates that use it
            normalized.skillCategories = [{ category: '', items: normalized.skills }];
        } else {
            normalized.skillCategories = [];
        }

        if (Array.isArray(normalized.education)) {
            normalized.education = normalized.education.map((item) => ({
                ...item,
                institution: item.institution || item.school || '',
                endDate: item.endDate || item.year || '',
            }));
        }

        if (!normalized.contact || typeof normalized.contact !== 'object') {
            normalized.contact = {};
        }
        normalized.projects = normalized.projects.map(item => ({
            ...item, name: item.name || item.title || '', link: safeUrl(item.link)
        }));
        normalized.contact = { ...normalized.contact };
        for (const field of ['website', 'linkedin', 'github']) {
            normalized.contact[field] = safeUrl(normalized.contact[field]);
        }

        return normalized;
    }

    function safeUrl(value) {
        const url = String(value || '').trim();
        if (!url) return '';
        const candidate = /^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}`;
        try {
            const parsed = new URL(candidate);
            return ['https:', 'http:'].includes(parsed.protocol) ? candidate : '';
        } catch { return ''; }
    }

    function safeDesign(input = {}) {
        input = input || {};
        const number = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== null
            ? Math.min(max, Math.max(min, Number(value))) : fallback;
        const color = (value, fallback) => /^#[0-9a-f]{3,8}$/i.test(value || '') ? value : fallback;
        const margins = input.margins || {};
        return {
            primaryColor: color(input.primaryColor, '#2563EB'),
            secondaryColor: color(input.secondaryColor, '#1e293b'),
            fontFamily: typeof input.fontFamily === 'string' && /^[a-z\s,'"-]+$/i.test(input.fontFamily)
                ? input.fontFamily : 'Inter, sans-serif',
            fontSize: number(input.fontSize, 11, 8, 20),
            lineHeight: number(input.lineHeight, 1.5, 1, 3),
            margins: Object.fromEntries(['top', 'right', 'bottom', 'left'].map(key =>
                [key, number(margins[key], 12.7, 5, 40)])),
        };
    }

    function mmToPx(mm) {
        return Math.round((mm / 25.4) * 96);
    }

    const SECTION_KEYS = new Set([
        'summary', 'experience', 'education', 'skills', 'projects',
        'certifications', 'additional', 'languages', 'references', 'awards', 'customSections'
    ]);

    function tagTemplateSections(template) {
        return template.replace(/(\{\{#if\s+(\w+)(?:\.length)?\s*\}\}\s*<section)(\s[^>]*|)>/g,
            (match, opening, key, attrs) => SECTION_KEYS.has(key) && !attrs.includes('data-resume-section')
                ? `${opening} data-resume-section="${key}"${attrs}>` : match);
    }

    function orderSections(html, sectionOrder) {
        if (!Array.isArray(sectionOrder) || !sectionOrder.length) return html;
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
            const container = doc.body.firstElementChild;
            if (!container) return html;

            const sections = Array.from(container.querySelectorAll('[data-resume-section]'))
                .filter(section => SECTION_KEYS.has(section.getAttribute('data-resume-section')) &&
                    !section.parentElement.closest('[data-resume-section]'));
            if (!sections.length) return html;

            const keys = [...new Set(sectionOrder.filter(key => SECTION_KEYS.has(key)))];
            const ranks = new Map(keys.map((key, index) => [key, index]));
            const ordered = [...sections].sort((a, b) =>
                (ranks.get(a.getAttribute('data-resume-section')) ?? keys.length) -
                (ranks.get(b.getAttribute('data-resume-section')) ?? keys.length));
            // Swap sections between existing positions, including columns,
            // while retaining the template's wrappers and contact header.
            const slots = sections.map(section => {
                const slot = doc.createComment('resume-section');
                section.parentNode.replaceChild(slot, section);
                return slot;
            });
            ordered.forEach((section, index) => slots[index].parentNode.replaceChild(section, slots[index]));

            return container.innerHTML;
        } catch (e) {
            return html;
        }
    }

    // 4. Generate standalone preview HTML
    function buildClientPreviewHtml(resumeData, design, template, sectionOrder) {
        if (typeof Handlebars === 'undefined') {
            setupHandlebars();
        }
        if (typeof Handlebars === 'undefined') {
            return '<div style="padding:2rem;text-align:center;color:#ef4444;">Handlebars rendering engine not loaded.</div>';
        }

        const safeDes = safeDesign(design);
        const normResume = normalizeResumeData(resumeData || {});
        const tmpl = template || BUILTIN_TEMPLATES[0];

        const {
            primaryColor = '#2563EB',
            secondaryColor = '#1e293b',
            fontFamily = 'Inter, sans-serif',
            fontSize = 11,
            lineHeight = 1.5,
            margins = { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 }
        } = safeDes;

        const defaultMargin = 12.7;
        const mTop = mmToPx(margins.top ?? defaultMargin);
        const mRight = mmToPx(margins.right ?? margins.left ?? defaultMargin);
        const mBottom = mmToPx(margins.bottom ?? margins.right ?? margins.top ?? defaultMargin);
        const mLeft = mmToPx(margins.left ?? margins.right ?? defaultMargin);

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
      
      * { box-sizing: border-box !important; }
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
          background: transparent !important;
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
          background: transparent;
        }
        .page {
          background: #fff;
          box-shadow: 0 12px 32px -14px rgba(15,23,42,0.28), 0 0 0 1px rgba(15,23,42,0.06);
          border-radius: 2px;
          flex-shrink: 0;
        }
      }
      @media print {
        @page { size: A4 portrait; margin: 0; }
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
        .page:not(:last-child) { page-break-after: always !important; break-after: page !important; }
        .page:last-child { page-break-after: avoid !important; break-after: avoid !important; }
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
      header { margin-top: 0 !important; padding-top: 0 !important; }
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

        let body = '';
        try {
            const compiled = Handlebars.compile(tagTemplateSections(tmpl.html_content || ''));
            const rendered = compiled({ ...normResume, design: safeDes });
            body = orderSections(rendered, sectionOrder);
        } catch (err) {
            console.error('[ResumePro Client Renderer] Error rendering Handlebars template:', err);
            body = '<p style="color:red;">Error rendering resume content.</p>';
        }

        let compiledCss = tmpl.css_content || '';
        try {
            if (tmpl.css_content) {
                const compileCss = Handlebars.compile(tmpl.css_content);
                compiledCss = compileCss({ ...normResume, design: safeDes });
            }
        } catch (err) {
            console.error('[ResumePro Client Renderer] Error compiling template CSS:', err);
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Resume Preview</title>
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

      let originalPage = document.getElementById('original-page');
      if (!originalTemplateMarkup && originalPage) {
        originalTemplateMarkup = originalPage.innerHTML;
      }
      if (!originalTemplateMarkup && !originalPage) return;

      // Only re-create original-page if it was previously removed during multi-page pagination
      if (!originalPage && originalTemplateMarkup) {
        container.innerHTML = '<div class="page" id="original-page" style="width:' + A4_W + 'px; height:auto; min-height:' + A4_H + 'px; overflow:visible; position:relative;">' + originalTemplateMarkup + '</div>';
        originalPage = document.getElementById('original-page');
      }

      const pageInner = originalPage ? originalPage.querySelector('.page-inner') : null;
      if (!pageInner) return;

      pageInner.style.height = 'auto';
      pageInner.style.overflow = 'visible';
      originalPage.style.minHeight = '0px';

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

      if (totalH <= (A4_H - padBot)) {
        originalPage.style.width = A4_W + 'px';
        originalPage.style.height = A4_H + 'px';
        originalPage.style.overflow = 'hidden';
        originalPage.style.display = 'block';
        return;
      }

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

      const offsets = [0];
      let currentOffset = 0;

      while (currentOffset < totalH - 10) {
        const usableHeightOnThisPage = (currentOffset === 0)
          ? (A4_H - padBot)
          : (A4_H - padTop - padBot);

        const idealEnd = currentOffset + usableHeightOnThisPage;
        if (idealEnd >= totalH) break;

        let breakY = idealEnd;
        const cutLines = lineBoxes.filter(l => l.top + 2 < breakY && l.bottom - 2 > breakY);
        if (cutLines.length > 0) {
          const earliestCutLineTop = Math.min(...cutLines.map(l => l.top));
          if (earliestCutLineTop > currentOffset + 40) {
            breakY = earliestCutLineTop - 2;
          }
        }

        for (const b of blockBoxes) {
          if (b.isHeading && b.bottom <= breakY && (breakY - b.bottom) < 80) {
            if (b.top > currentOffset + 40) breakY = b.top - 2;
          } else if (b.isHeading && b.top + 2 < breakY && b.bottom - 2 > breakY) {
            if (b.top > currentOffset + 40) breakY = b.top - 2;
          }
        }

        for (const b of blockBoxes) {
          if (b.isItem && b.top + 2 < breakY && b.bottom - 2 > breakY) {
            if (b.top > currentOffset + 40 && (breakY - b.top) < 140) {
              breakY = b.top - 2;
            }
          }
        }

        const finalCutLines = lineBoxes.filter(l => l.top + 2 < breakY && l.bottom - 2 > breakY);
        if (finalCutLines.length > 0) {
          const minL = Math.min(...finalCutLines.map(l => l.top));
          if (minL > currentOffset + 40) breakY = minL - 2;
        }

        if (breakY <= currentOffset + 40) breakY = idealEnd;

        offsets.push(breakY);
        currentOffset = breakY;
      }

      const mediaBoxes = blockBoxes.filter(b => b.tag === 'IMG' || b.tag === 'SVG');
      while (offsets.length > 1) {
        const lastStart = offsets[offsets.length - 1];
        const reachesLastPage = lineBoxes.some(l => l.bottom > lastStart + 2)
          || mediaBoxes.some(b => b.bottom > lastStart + 2);
        if (reachesLastPage) break;
        offsets.pop();
      }

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

        clone.style.paddingTop = padTop + 'px';
        clone.style.paddingBottom = padBot + 'px';
        clone.style.paddingLeft = padLeft;
        clone.style.paddingRight = padRight;

        if (i === 0) {
          const maxVpH = A4_H - padBot;
          const vpH = Math.min(sliceH, maxVpH);
          viewport.style.top = '0px';
          viewport.style.height = vpH + 'px';
          clone.style.top = '0px';
        } else {
          const maxVpH = A4_H - padTop - padBot;
          const vpH = Math.min(sliceH, maxVpH);
          viewport.style.top = padTop + 'px';
          viewport.style.height = vpH + 'px';
          clone.style.top = '-' + startY + 'px';
        }

        viewport.appendChild(clone);
        pageDiv.appendChild(viewport);
        container.appendChild(pageDiv);
      }
    }

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
    window.addEventListener('resize', () => { paginate(); });
  </script>
</body>
</html>`;
    }

    const TEMPLATE_CACHE_VERSION = 'v6_minimalist_executive_centered_header';

    // 5. Template Registry & Supabase Sync
    function cacheTemplates(templates, persist = true) {
        const known = [...cachedTemplates, ...BUILTIN_TEMPLATES];
        cachedTemplates = templates.map(template => {
            const builtin = BUILTIN_TEMPLATES.find(b => b.id === template.id || b.name === template.name);
            if (builtin) {
                return { ...template, html_content: builtin.html_content, css_content: builtin.css_content };
            }
            if (template.html_content) return template;
            const full = known.find(item => item.id === template.id && item.html_content)
                || known.find(item => item.name === template.name && item.html_content);
            return full ? { ...full, ...template, html_content: full.html_content, css_content: full.css_content } : template;
        });
        if (persist) {
            try {
                localStorage.setItem('cached_templates', JSON.stringify(cachedTemplates));
                localStorage.setItem('cached_templates_version', TEMPLATE_CACHE_VERSION);
            } catch (e) {}
        }
        return cachedTemplates;
    }

    function getClientTemplates() {
        try {
            const cachedVer = localStorage.getItem('cached_templates_version');
            if (cachedVer !== TEMPLATE_CACHE_VERSION) {
                localStorage.removeItem('cached_templates');
                localStorage.setItem('cached_templates_version', TEMPLATE_CACHE_VERSION);
                cachedTemplates = BUILTIN_TEMPLATES;
                return BUILTIN_TEMPLATES;
            }
            const raw = localStorage.getItem('cached_templates');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) {
                    return cacheTemplates(parsed, false);
                }
            }
        } catch (e) {}
        return cachedTemplates || BUILTIN_TEMPLATES;
    }

    function getTemplateById(templateId) {
        const list = getClientTemplates();
        if (!templateId) return list.find(template => template.html_content) || BUILTIN_TEMPLATES[0];

        const match = list.find(t => t.id === templateId) || BUILTIN_TEMPLATES.find(t => t.id === templateId);
        if (match) return match.html_content ? match : null;

        const legacyMap = {
            'tmpl_classic_1': 'Classic Serif',
            'tmpl_modern_1': 'Minimalist Executive',
            'tmpl_minimal_1': 'Minimalist Executive',
            'tmpl_exec_1': 'Minimalist Executive',
            'tmpl_academic_1': 'Academic Professional'
        };
        const mappedName = legacyMap[templateId];
        if (mappedName) {
            const byName = list.find(t => t.name === mappedName) || BUILTIN_TEMPLATES.find(t => t.name === mappedName);
            if (byName) return byName.html_content ? byName : null;
        }

        const lower = String(templateId).toLowerCase();
        if (lower.includes('classic') || lower.includes('serif')) return BUILTIN_TEMPLATES[0];
        if (lower.includes('minimal') || lower.includes('modern') || lower.includes('exec')) return BUILTIN_TEMPLATES[1];
        if (lower.includes('academic') || lower.includes('research')) return BUILTIN_TEMPLATES[2];

        // Let the backend load an unavailable template instead of rendering a
        // blank resume or silently replacing the user's selected layout.
        return null;
    }

    async function syncTemplatesFromSupabase() {
        if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data, error } = await supabaseClient.from('resume_templates').select('*');
                if (!error && Array.isArray(data) && data.length) {
                    return cacheTemplates(data);
                }
            } catch (err) {
                console.warn('[ResumePro] Supabase template sync note:', err);
            }
        }
        return getClientTemplates();
    }

    // Export globally for app.js
    window.ResumeRenderer = {
        BUILTIN_TEMPLATES,
        getClientTemplates,
        cacheTemplates,
        getTemplateById,
        syncTemplatesFromSupabase,
        buildClientPreviewHtml,
        normalizeResumeData,
        safeDesign
    };
})();
