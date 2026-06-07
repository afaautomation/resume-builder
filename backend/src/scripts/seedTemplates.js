require('dotenv').config();
const { getDb } = require('../config/database');
const logger = require('../config/logger');

const templates = [
  {
    id: 'tmpl_modern_1',
    name: 'Modern Blue',
    description: 'Clean single-column with a professional blue touch.',
    category: 'modern',
    layout: 'single',
    thumbnail_url: 'assets/modern_blue.png',
    is_ats_safe: 1,
    is_premium: 0,
    tags: JSON.stringify(['clean', 'modern']),
    html_content: `
      <div class="resume-container">
        <header class="bleed-header">
          <div class="header-left">
            <h1>{{contact.name}}</h1>
            {{#if contact.title}}<div class="title-sub">{{contact.title}}</div>{{else}}<div class="title-sub">Marketing Manager</div>{{/if}}
          </div>
          <div class="header-right">
            {{#if contact.phone}}<div>{{contact.phone}}</div>{{/if}}
            {{#if contact.email}}<div>{{contact.email}}</div>{{/if}}
            {{#if contact.linkedin}}<div>{{contact.linkedin}}</div>{{/if}}
            {{#if contact.location}}<div>{{contact.location}}</div>{{/if}}
          </div>
        </header>
        {{#if summary}}<section><h2>Professional Summary</h2><p>{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section><h2>Professional Experience</h2>{{#each experience}}<div class="item"><div class="item-header"><div><h3>{{title}}</h3><div class="company">{{company}}</div></div><span class="date">{{startDate}} - {{endDate}}</span></div><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section><h2>Education</h2>{{#each education}}<div class="item"><div class="item-header"><div><h3>{{institution}}</h3><div class="degree">{{degree}}</div></div><span class="date">{{endDate}}</span></div></div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section><h2>Projects</h2>{{#each projects}}<div class="item"><div class="item-header"><h3>{{name}}</h3>{{#if link}}<a href="{{link}}">{{link}}</a>{{/if}}</div><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section><h2>Certifications</h2><div class="skills-list">{{#each certifications}}<div class="skill-item">{{name}}{{#if issuer}} - {{issuer}}{{/if}}</div>{{/each}}</div></section>{{/if}}
        {{#if skills.length}}<section><h2>Skills</h2><div class="skills-list">{{#each skills}}<div class="skill-item">{{this}}</div>{{/each}}</div></section>{{/if}}
        {{#if additional.length}}<section><h2>Additional Information</h2>{{#each additional}}<div class="item"><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
          {{#if languages.length}}<section><h2>Languages</h2>{{#each languages}}<div><strong>{{name}}</strong>: {{level}}</div>{{/each}}</section>{{/if}}
          {{#if references.length}}<section><h2>References</h2>{{#each references}}<div><strong>{{name}}</strong><br>{{title}} | {{contact}}</div>{{/each}}</section>{{/if}}
        </div>
      </div>
    `,
    css_content: `
      :root { 
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#2563EB{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); color: #1e293b; line-height: var(--line-height, 1.4); }
      header.bleed-header {
        background: var(--primary);
        color: #ffffff;
        padding: 24px 30px;
        margin-top: calc(-1 * var(--margin-top)) !important;
        margin-right: calc(-1 * var(--margin-right)) !important;
        margin-left: calc(-1 * var(--margin-left)) !important;
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .header-left h1 {
        font-size: 2.6em;
        color: #ffffff !important;
        margin: 0 0 4px 0;
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: -0.5px;
      }
      .title-sub {
        font-size: 1.2em;
        color: rgba(255, 255, 255, 0.85);
        text-transform: uppercase;
        letter-spacing: 1.5px;
        font-weight: 500;
      }
      .header-right {
        text-align: right;
        font-size: 0.9em;
        line-height: 1.4;
      }
      .header-right div {
        margin-bottom: 2px;
      }
      h2 {
        font-size: 1.3em;
        border-bottom: 1.5px solid var(--primary);
        padding-bottom: 3px;
        margin-top: 18px;
        margin-bottom: 10px;
        color: var(--primary);
        text-transform: uppercase;
        font-weight: 700;
      }
      .item { margin-bottom: 12px; }
      .item-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 4px;
      }
      .item-header h3 {
        font-size: 1.1em;
        font-weight: 700;
        margin: 0;
        color: #1e293b;
        text-transform: uppercase;
      }
      .company {
        font-style: italic;
        color: #475569;
        font-size: 0.95em;
        margin-top: 2px;
      }
      .degree {
        color: #475569;
        font-size: 0.95em;
        margin-top: 2px;
      }
      .date {
        font-size: 0.95em;
        color: #475569;
        font-weight: 500;
        text-align: right;
        white-space: nowrap;
      }
      .skills-list {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        margin-top: 8px;
      }
      .skill-item {
        font-size: 1em;
        color: #1e293b;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .skill-item::before {
        content: "•";
        color: var(--primary);
        font-weight: bold;
      }
      p { margin: 0; font-size: 1em; color: #334155; }
    `
  },
  {
    id: 'tmpl_classic_1',
    name: 'Classic Serif',
    description: 'Traditional serif layout for legal and corporate roles.',
    category: 'classic',
    layout: 'single',
    thumbnail_url: 'assets/classic_serif.png',
    is_ats_safe: 1,
    is_premium: 0,
    tags: JSON.stringify(['classic', 'serif']),
    html_content: `
      <div class="resume-container-classic">
        <header style="text-align:center; border-bottom:2px solid #000; padding-bottom:15px; margin-bottom:20px;">
          <h1 style="font-size:2.4em; text-transform:uppercase; letter-spacing:2px;">{{contact.name}}</h1>
          <div style="font-size:1em;">
            {{contact.email}} &bull; {{contact.phone}} &bull; {{contact.location}}
            {{#if contact.linkedin}} &bull; LI: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} &bull; GH: {{contact.github}}{{/if}}
          </div>
        </header>
        {{#if summary}}<section class="sec"><h2>Summary</h2><p>{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section class="sec"><h2>Experience</h2>{{#each experience}}<div class="item"><h3>{{title}} | {{company}}</h3><div class="date">{{startDate}} - {{endDate}}</div><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section class="sec"><h2>Education</h2>{{#each education}}<div class="item"><h3>{{degree}}</h3><div class="date">{{endDate}}</div><p>{{institution}}</p></div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section class="sec"><h2>Projects</h2>{{#each projects}}<div class="item"><h3>{{name}}</h3>{{#if link}}<div style="font-size:0.95em; font-style:italic;"><a href="{{link}}" style="color:#000;">{{link}}</a></div>{{/if}}<p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section class="sec"><h2>Certifications</h2>{{#each certifications}}<div class="item"><h3>{{name}}</h3><div class="date">{{date}}</div><p>{{issuer}}</p></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section class="sec"><h2>Skills</h2><p><strong>Expertise:</strong> {{join skills ", "}}</p></section>{{/if}}
        {{#if additional.length}}<section class="sec"><h2>Additional Information</h2>{{#each additional}}<p><strong>{{title}}:</strong> {{value}}</p>{{/each}}</section>{{/if}}
        {{#if languages.length}}<section class="sec"><h2>Languages</h2><p>{{#each languages}}<strong>{{name}}</strong> ({{level}}){{#unless @last}}, {{/unless}}{{/each}}</p></section>{{/if}}
        {{#if references.length}}<section class="sec"><h2>References</h2>{{#each references}}<div class="item"><strong>{{name}}</strong> - {{title}} ({{contact}})</div>{{/each}}</section>{{/if}}
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#000000{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Merriweather', serif{{/if}};
      }
      body { font-family: var(--font-family); color: #000; line-height: var(--line-height, 1.3); }
      h2 { font-size: 1.2em; text-transform: uppercase; border-bottom: 1px solid #000; margin-top: 12px; margin-bottom: 5px; font-weight: bold; }
      .item { margin-bottom: 8px; }
      .item h3 { font-size: 1.1em; margin: 0; font-weight: bold; }
      .date { font-style: italic; font-size: 0.95em; margin-bottom: 2px; }
      p { font-size: 1em; margin: 0; }
    `
  },
  {
    id: 'tmpl_creative_1',
    name: 'Creative Mint',
    description: 'Fresh two-column layout for creative professionals.',
    category: 'creative',
    layout: 'two-column',
    thumbnail_url: 'assets/creative_mint.png',
    is_ats_safe: 0,
    is_premium: 1,
    tags: JSON.stringify(['creative', 'mint']),
    html_content: `
      <div style="display:flex; min-height:100%;">
        <aside style="width:35%; background:#f0fdf4; padding:30px; border-right:1px solid #bbf7d0;">
          <h1 style="font-size:2.2em; color:#166534; line-height:1.1; margin-bottom:20px;">{{contact.name}}</h1>
          <div style="margin-bottom:30px;">
            <h2 style="font-size:1.1em; color:#166534; text-transform:uppercase; border-bottom:1px solid #bbf7d0; padding-bottom:5px;">Contact</h2>
            <p style="font-size:0.9em; margin:5px 0;">{{contact.email}}</p>
            <p style="font-size:0.9em; margin:5px 0;">{{contact.phone}}</p>
            <p style="font-size:0.9em; margin:5px 0;">{{contact.location}}</p>
            {{#if contact.linkedin}}<p style="font-size:0.9em; margin:5px 0;">LI: {{contact.linkedin}}</p>{{/if}}
            {{#if contact.github}}<p style="font-size:0.9em; margin:5px 0;">GH: {{contact.github}}</p>{{/if}}
          </div>
          {{#if skills.length}}
          <div style="margin-bottom:30px;">
            <h2 style="font-size:1.1em; color:#166534; text-transform:uppercase; border-bottom:1px solid #bbf7d0; padding-bottom:5px;">Skills</h2>
            <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:10px;">
              {{#each skills}}<span style="background:#dcfce7; padding:2px 8px; border-radius:4px; font-size:0.85em; font-weight:600;">{{this}}</span>{{/each}}
            </div>
          </div>
          {{/if}}
          {{#if education.length}}
          <div>
            <h2 style="font-size:1.1em; color:#166534; text-transform:uppercase; border-bottom:1px solid #bbf7d0; padding-bottom:5px;">Education</h2>
            {{#each education}}<div style="margin-top:10px;"><strong style="font-size:0.9em;">{{degree}}</strong><p style="font-size:0.85em; margin:2px 0;">{{institution}}</p></div>{{/each}}
          </div>
          {{/if}}
        </aside>
        <main style="width:65%; padding:40px;">
          {{#if summary}}<section style="margin-bottom:30px;"><h2>Profile</h2><p>{{nl2br summary}}</p></section>{{/if}}
          {{#if experience.length}}<section style="margin-bottom:30px;"><h2>Experience</h2>{{#each experience}}<div style="margin-bottom:20px;"><h3>{{title}}</h3><div style="color:#16a34a; font-weight:600; font-size:0.9em;">{{company}} | {{startDate}} - {{endDate}}</div><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          {{#if projects.length}}<section style="margin-bottom:30px;"><h2>Projects</h2>{{#each projects}}<div style="margin-bottom:15px;"><h3>{{name}}</h3>{{#if link}}<a href="{{link}}" style="font-size:0.9em; color:#16a34a;">{{link}}</a>{{/if}}<p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          {{#if certifications.length}}<section><h2>Certifications</h2>{{#each certifications}}<div style="margin-bottom:15px;"><h3>{{name}}</h3><div style="color:#16a34a; font-weight:600; font-size:0.9em;">{{issuer}} | {{date}}</div></div>{{/each}}</section>{{/if}}
          {{#if additional.length}}<section><h2>Additional</h2>{{#each additional}}<div style="margin-bottom:10px;"><strong>{{title}}:</strong><p style="font-size:0.95em; margin-top:2px;">{{value}}</p></div>{{/each}}</section>{{/if}}
          {{#if languages.length}}<section><h2>Languages</h2><div style="display:flex; flex-wrap:wrap; gap:10px;">{{#each languages}}<div style="background:#f0fdf4; padding:4px 10px; border-radius:4px; font-size:0.9em;"><strong>{{name}}</strong>: {{level}}</div>{{/each}}</div></section>{{/if}}
          {{#if references.length}}<section><h2>References</h2>{{#each references}}<div style="margin-bottom:10px;"><strong>{{name}}</strong><div style="font-size:0.85em;">{{title}} | {{contact}}</div></div>{{/each}}</section>{{/if}}
        </main>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#166534{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Source Sans Pro', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); color: #1e293b; margin: 0; line-height: var(--line-height, 1.4); }
      h2 { font-size: 1.5em; color: #166534; border-bottom: 2px solid #f0fdf4; padding-bottom: 5px; margin-bottom: 15px; }
      h3 { font-size: 1.3em; margin-bottom: 4px; }
      p { font-size: 1em; margin: 0; }
    `
  },
  {
    id: 'tmpl_dark_1',
    name: 'Midnight Professional',
    description: 'Striking dark-themed header for a bold impression.',
    category: 'modern',
    layout: 'single',
    thumbnail_url: 'assets/dark_pro.png',
    is_ats_safe: 1,
    is_premium: 1,
    tags: JSON.stringify(['dark', 'bold']),
    html_content: `
      <div class="resume-dark">
        <header class="bleed-header" style="background:#0f172a; color:#fff; padding:30px; margin-bottom: 20px;">
          <h1 style="font-size:2.8em; margin:0; text-align:center;">{{contact.name}}</h1>
          <div style="opacity:0.8; font-size:0.95em; margin-top:8px; text-align:center;">
            {{contact.email}} | {{contact.phone}} | {{contact.location}}
            {{#if contact.linkedin}} | LI: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} | GH: {{contact.github}}{{/if}}
          </div>
        </header>
        <div style="padding:0;">
          {{#if summary}}<section><h2>Professional Summary</h2><p>{{nl2br summary}}</p></section>{{/if}}
          {{#if experience.length}}<section><h2>Experience</h2>{{#each experience}}<div class="item"><h3>{{title}} @ {{company}}</h3><span class="date">{{startDate}} - {{endDate}}</span><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          {{#if education.length}}<section><h2>Education</h2>{{#each education}}<div class="item"><h3>{{degree}}</h3><span class="date">{{endDate}}</span><p>{{institution}}</p></div>{{/each}}</section>{{/if}}
          {{#if projects.length}}<section><h2>Projects</h2>{{#each projects}}<div class="item"><h3>{{name}}</h3>{{#if link}}<a href="{{link}}" style="color:var(--primary); font-size:0.9em; font-weight:500;">{{link}}</a>{{/if}}<p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          {{#if certifications.length}}<section><h2>Certifications</h2>{{#each certifications}}<div class="item"><h3>{{name}}</h3><span class="date">{{issuer}} | {{date}}</span></div>{{/each}}</section>{{/if}}
          {{#if skills.length}}<section><h2>Expertise</h2><div class="skills-grid">{{#each skills}}<span class="skill-tag">{{this}}</span>{{/each}}</div></section>{{/if}}
          {{#if additional.length}}<section><h2>Additional Info</h2>{{#each additional}}<div class="item"><h3>{{title}}</h3><p>{{value}}</p></div>{{/each}}</section>{{/if}}
          {{#if languages.length}}<section><h2>Languages</h2>{{#each languages}}<div style="margin-bottom:5px;"><strong>{{name}}</strong> &bull; {{level}}</div>{{/each}}</section>{{/if}}
          {{#if references.length}}<section><h2>References</h2>{{#each references}}<div class="item"><h3>{{name}}</h3><p>{{title}} | {{contact}}</p></div>{{/each}}</section>{{/if}}
        </div>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#0f172a{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); color: #1e293b; line-height: var(--line-height, 1.4); }
      h2 { color: #0f172a; font-size: 1.3em; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #0f172a; padding-bottom: 3px; margin-top: 15px; }
      h3 { font-size: 1.15em; margin: 0; font-weight: 700; }
      .date { font-size: 0.9em; color: #64748b; font-weight: 500; }
      .skills-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .skill-tag { background: #0f172a; color: #fff; padding: 3px 10px; border-radius: 20px; font-size: 0.85em; }
      p { font-size: 1em; margin: 0; }
    `
  },
  {
    id: 'tmpl_minimal_1',
    name: 'Minimalist Executive',
    description: 'High-impact minimalist design for senior professionals.',
    category: 'modern',
    layout: 'single',
    thumbnail_url: 'assets/minimal_executive.png',
    is_ats_safe: 1,
    is_premium: 1,
    tags: JSON.stringify(['minimal', 'executive', 'clean']),
    html_content: `
      <div style="max-width:800px; margin:0 auto; padding:40px;">
        <header style="margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
          <h1 style="font-size:2.4em; font-weight:300; letter-spacing:-0.5px; margin:0;">{{contact.name}}</h1>
          <div style="font-size:0.95em; color:#64748b; margin-top:4px;">
            {{contact.email}} &bull; {{contact.phone}} &bull; {{contact.location}}
            {{#if contact.linkedin}} &bull; LinkedIn: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} &bull; GitHub: {{contact.github}}{{/if}}
          </div>
        </header>
        {{#if summary}}<section style="margin-bottom:25px;">{{#if summary}}<p style="font-size:1.1em; line-height: var(--line-height, 1.6); color:#334155;">{{nl2br summary}}</p>{{/if}}</section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.2em; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Experience</h2>{{#each experience}}<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{title}} @ {{company}}</strong><span style="font-size:0.9em; color:#94a3b8;">{{startDate}} - {{endDate}}</span></div><p style="font-size:1em; color:#475569; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.2em; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Education</h2>{{#each education}}<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{degree}}</strong><span style="font-size:0.9em; color:#94a3b8;">{{endDate}}</span></div><p style="font-size:1em; color:#475569;">{{institution}}</p></div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.2em; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Projects</h2>{{#each projects}}<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{name}}</strong>{{#if link}}<a href="{{link}}" style="font-size:0.9em; color:#6366f1;">{{link}}</a>{{/if}}</div><p style="font-size:1em; color:#475569; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.2em; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Certifications</h2>{{#each certifications}}<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{name}}</strong><span style="font-size:0.9em; color:#94a3b8;">{{date}}</span></div><p style="font-size:1em; color:#475569;">{{issuer}}</p></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section><h2 style="font-size:1.2em; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Skills</h2><p style="font-size:1em; color:#475569;">{{join skills ", "}}</p></section>{{/if}}
        {{#if additional.length}}<section style="margin-top:20px;"><h2 style="font-size:1.2em; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Additional</h2>{{#each additional}}<div style="margin-bottom:8px;"><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        {{#if languages.length}}<section style="margin-top:20px;"><h2 style="font-size:1.2em; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Languages</h2>{{#each languages}}<strong>{{name}}</strong>: {{level}}{{#unless @last}} &bull; {{/unless}}{{/each}}</section>{{/if}}
        {{#if references.length}}<section style="margin-top:20px;"><h2 style="font-size:1.2em; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">References</h2>{{#each references}}<div style="margin-bottom:8px;"><strong>{{name}}</strong> ({{title}}) - {{contact}}</div>{{/each}}</section>{{/if}}
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#6366f1{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); background: #fff; color: #1e293b; line-height: var(--line-height, 1.4); }
      h2 { border-bottom: none !important; }
    `
  },
  {
    id: 'tmpl_tech_1',
    name: 'Tech Professional',
    description: 'Modern, skill-focused layout for developers and engineers.',
    category: 'modern',
    layout: 'single',
    thumbnail_url: 'assets/tech_pro.png',
    is_ats_safe: 1,
    is_premium: 0,
    tags: JSON.stringify(['tech', 'modern', 'skills']),
    html_content: `
      <div style="padding:40px; border-top:8px solid #4f46e5;">
        <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
          <div>
            <h1 style="font-size:2.6em; color:#1e293b; margin:0;">{{contact.name}}</h1>
            <p style="color:#4f46e5; font-weight:600; font-size:1.05em; margin:2px 0;">Professional Software Engineer</p>
          </div>
          <div style="text-align:right; font-size:0.9em; color:#64748b;">
            <div>{{contact.email}}</div>
            <div>{{contact.phone}}</div>
            <div>{{contact.location}}</div>
            {{#if contact.linkedin}}<div>LI: {{contact.linkedin}}</div>{{/if}}
            {{#if contact.github}}<div>GH: {{contact.github}}</div>{{/if}}
          </div>
        </header>
        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:30px;">
          <div>
            {{#if summary}}<section style="margin-bottom:25px;"><h3>About Me</h3><p style="font-size:1em;">{{nl2br summary}}</p></section>{{/if}}
            {{#if experience.length}}<section style="margin-bottom:25px;"><h3>Work Experience</h3>{{#each experience}}<div style="margin-bottom:15px;"><strong>{{title}}</strong> | <span style="color:#4f46e5;">{{company}}</span><div style="font-size:0.85em; color:#94a3b8; margin-bottom:5px;">{{startDate}} - {{endDate}}</div><p style="font-size:0.95em;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
            {{#if projects.length}}<section style="margin-bottom:25px;"><h3>Projects</h3>{{#each projects}}<div style="margin-bottom:15px;"><strong>{{name}}</strong>{{#if link}} | <a href="{{link}}" style="font-size:0.9em; color:#4f46e5;">Link</a>{{/if}}<p style="font-size:0.95em; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          </div>
          <div>
            {{#if skills.length}}<section style="margin-bottom:25px;"><h3>Tech Stack</h3><div style="display:flex; flex-wrap:wrap; gap:5px;">{{#each skills}}<span style="background:#eef2ff; color:#4338ca; padding:4px 8px; border-radius:4px; font-size:0.85em; font-family:monospace;">{{this}}</span>{{/each}}</div></section>{{/if}}
            {{#if education.length}}<section style="margin-bottom:25px;"><h3>Education</h3>{{#each education}}<div style="margin-bottom:10px;"><strong>{{degree}}</strong><div style="font-size:0.85em; color:#64748b;">{{institution}}</div></div>{{/each}}</section>{{/if}}
            {{#if certifications.length}}<section style="margin-bottom:25px;"><h3>Certifications</h3>{{#each certifications}}<div style="margin-bottom:10px;"><strong>{{name}}</strong><div style="font-size:0.85em; color:#64748b;">{{issuer}} | {{date}}</div></div>{{/each}}</section>{{/if}}
            {{#if additional.length}}<section><h3>Extra Info</h3>{{#each additional}}<div style="margin-bottom:8px;"><strong style="font-size:0.9em;">{{title}}</strong><p style="font-size:0.85em; color:#475569;">{{value}}</p></div>{{/each}}</section>{{/if}}
            {{#if languages.length}}<section><h3>Languages</h3>{{#each languages}}<div><strong>{{name}}</strong>: {{level}}</div>{{/each}}</section>{{/if}}
            {{#if references.length}}<section><h3>References</h3>{{#each references}}<div style="margin-bottom:10px;"><strong>{{name}}</strong><div style="font-size:0.85em;">{{title}}</div><div style="font-size:0.8em; color:#64748b;">{{contact}}</div></div>{{/each}}</section>{{/if}}
          </div>
        </div>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#4f46e5{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); color: #1e293b; line-height: var(--line-height, 1.4); }
      h3 { font-size: 1.1em; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 15px; }
    `
  },
  {
    id: 'tmpl_standard_1',
    name: 'Standard Business',
    description: 'A reliable, classic choice that passes every ATS system.',
    category: 'classic',
    layout: 'single',
    thumbnail_url: 'assets/standard_business.png',
    is_ats_safe: 1,
    is_premium: 0,
    tags: JSON.stringify(['classic', 'standard', 'ats']),
    html_content: `
      <div style="line-height: var(--line-height, 1.3);">
        <header style="text-align:center; margin-bottom:15px;">
          <h1 style="font-size:1.8em; margin:0; text-transform:uppercase;">{{contact.name}}</h1>
          <p style="font-size:1em; margin:5px 0;">
            {{contact.email}} | {{contact.phone}} | {{contact.location}}
            {{#if contact.linkedin}} | LI: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} | GH: {{contact.github}}{{/if}}
          </p>
        </header>
        {{#if summary}}<section style="margin-bottom:20px;"><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">PROFESSIONAL SUMMARY</h2><p style="font-size:1em;">{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:20px;"><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">EXPERIENCE</h2>{{#each experience}}<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><strong>{{company}}</strong><span>{{startDate}} - {{endDate}}</span></div><div style="font-style:italic; font-size:1em;">{{title}}</div><p style="font-size:1em; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:20px;"><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">EDUCATION</h2>{{#each education}}<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between;"><strong>{{institution}}</strong><span>{{endDate}}</span></div><div style="font-size:1em;">{{degree}}</div></div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section style="margin-bottom:20px;"><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">PROJECTS</h2>{{#each projects}}<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><strong>{{name}}</strong></div>{{#if link}}<div style="font-size:0.95em;"><a href="{{link}}" style="color:#000;">{{link}}</a></div>{{/if}}<p style="font-size:1em; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section style="margin-bottom:20px;"><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">CERTIFICATIONS</h2>{{#each certifications}}<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between;"><strong>{{name}}</strong><span>{{date}}</span></div><div style="font-size:1em;">{{issuer}}</div></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">SKILLS</h2><p style="font-size:1em;">{{join skills ", "}}</p></section>{{/if}}
        {{#if additional.length}}<section style="margin-top:15px;"><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">ADDITIONAL INFORMATION</h2>{{#each additional}}<div style="margin-bottom:4px;"><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        {{#if languages.length}}<section style="margin-top:15px;"><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">LANGUAGES</h2><p>{{#each languages}}{{name}} ({{level}}){{#unless @last}}, {{/unless}}{{/each}}</p></section>{{/if}}
        {{#if references.length}}<section style="margin-top:15px;"><h2 style="font-size:1.2em; border-bottom:1px solid #000; margin-bottom:8px;">REFERENCES</h2>{{#each references}}<div style="margin-bottom:8px;"><strong>{{name}}</strong><br>{{title}} | {{contact}}</div>{{/each}}</section>{{/if}}
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#000000{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Times New Roman', serif{{/if}};
      }
      body { font-family: var(--font-family); color: #000; line-height: var(--line-height, 1.3); }
    `
  },
  {
    id: 'tmpl_academic_1',
    name: 'Academic Professional',
    description: 'Clean, detailed layout optimized for research and academic roles.',
    category: 'classic',
    layout: 'single',
    thumbnail_url: 'assets/academic_pro.png',
    is_ats_safe: 1,
    is_premium: 0,
    tags: JSON.stringify(['academic', 'professional', 'detailed']),
    html_content: `
      <div style="color:#2d3748;">
        <header style="border-bottom:3px solid #2d3748; padding-bottom:10px; margin-bottom:20px;">
          <h1 style="font-size:2.6em; margin:0; font-family:'Playfair Display', serif;">{{contact.name}}</h1>
          <p style="font-size:1em; margin-top:5px; color:#4a5568;">
            {{contact.email}} | {{contact.phone}} | {{contact.location}}
            {{#if contact.linkedin}} | LinkedIn: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} | GitHub: {{contact.github}}{{/if}}
          </p>
        </header>
        {{#if summary}}<section style="margin-bottom:25px;"><h2 style="font-size:1.4em; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Research Profile</h2><p style="font-size:1.05em; line-height:1.6;">{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.4em; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Academic Experience</h2>{{#each experience}}<div style="margin-bottom:15px;"><strong>{{title}}</strong>, <span style="font-style:italic;">{{company}}</span><br><span style="font-size:0.9em; color:#718096;">{{startDate}} - {{endDate}}</span><p style="font-size:1em; margin-top:5px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.4em; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Education</h2>{{#each education}}<div style="margin-bottom:12px;"><strong>{{degree}}</strong><br>{{institution}} | <span style="font-size:0.9em; color:#718096;">Graduated {{endDate}}</span></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.4em; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Certifications</h2>{{#each certifications}}<div style="margin-bottom:8px;"><strong>{{name}}</strong> ({{issuer}}, {{date}})</div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.4em; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Technical Skills</h2><p style="font-size:1em;">{{join skills ", "}}</p></section>{{/if}}
        {{#if additional.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.4em; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Additional Details</h2>{{#each additional}}<div><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
          {{#if languages.length}}<section><h2 style="font-size:1.4em; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Languages</h2>{{#each languages}}<div><strong>{{name}}</strong> ({{level}})</div>{{/each}}</section>{{/if}}
          {{#if references.length}}<section><h2 style="font-size:1.4em; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">References</h2>{{#each references}}<div style="margin-bottom:10px; font-size:0.95em;"><strong>{{name}}</strong><br>{{title}}<br>{{contact}}</div>{{/each}}</section>{{/if}}
        </div>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#2d3748{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Crimson Pro', serif{{/if}};
      }
      body { font-family: var(--font-family); line-height: var(--line-height, 1.5); }
    `
  },
  {
    id: 'tmpl_corporate_2',
    name: 'Corporate Sleek',
    description: 'Modern corporate layout with a distinctive left border accent.',
    category: 'modern',
    layout: 'single',
    thumbnail_url: 'assets/corporate_sleek.png',
    is_ats_safe: 1,
    is_premium: 1,
    tags: JSON.stringify(['corporate', 'sleek', 'modern']),
    html_content: `
      <div style="border-left:12px solid #1e293b; padding:40px; min-height:100%;">
        <header style="margin-bottom:30px;">
          <h1 style="font-size:3.2em; font-weight:800; color:#1e293b; margin:0; text-transform:uppercase; letter-spacing:-1px;">{{contact.name}}</h1>
          <p style="font-size:1em; color:#64748b; margin-top:5px; font-weight:500;">
            {{contact.email}} &bull; {{contact.phone}} &bull; {{contact.location}}
            {{#if contact.linkedin}} &bull; LI: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} &bull; GH: {{contact.github}}{{/if}}
          </p>
        </header>
        {{#if summary}}<section style="margin-bottom:25px;"><h2 style="font-size:1.1em; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">About Me</h2><p style="font-size:1.05em; color:#475569;">{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.1em; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Professional History</h2>{{#each experience}}<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{title}}</strong><span style="font-size:0.9em; color:#94a3b8;">{{startDate}} - {{endDate}}</span></div><div style="color:#6366f1; font-weight:600; font-size:0.95em;">{{company}}</div><p style="font-size:1em; color:#475569; margin-top:5px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.1em; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Education</h2>{{#each education}}<div><strong>{{degree}}</strong><br><span style="color:#64748b; font-size:0.95em;">{{institution}} | Graduated {{endDate}}</span></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section style="margin-bottom:25px;"><h2 style="font-size:1.1em; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Core Expertise</h2><div style="display:flex; flex-wrap:wrap; gap:8px;">{{#each skills}}<span style="background:#f8fafc; border:1px solid #e2e8f0; padding:4px 12px; border-radius:4px; font-size:0.9em;">{{this}}</span>{{/each}}</div></section>{{/if}}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
          {{#if languages.length}}<section><h2 style="font-size:1.1em; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Languages</h2>{{#each languages}}<div><strong>{{name}}</strong>: {{level}}</div>{{/each}}</section>{{/if}}
          {{#if references.length}}<section><h2 style="font-size:1.1em; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">References</h2>{{#each references}}<div style="margin-bottom:8px; font-size:0.95em;"><strong>{{name}}</strong> &bull; {{contact}}</div>{{/each}}</section>{{/if}}
        </div>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#1e293b{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); line-height: var(--line-height, 1.4); }
    `
  }
];

const writingTips = [
  { id: 'tip_1', section: 'summary', tip: 'Focus on achievements, not just tasks.', example: 'Saved 20% on server costs by optimizing database queries.' },
  { id: 'tip_2', section: 'experience', tip: 'Use action verbs to start each bullet point.', example: 'Managed, Created, Developed, Improved' },
  { id: 'tip_3', section: 'experience', tip: 'Quantify your accomplishments with numbers.', example: 'Increased sales by 30%, Reduced costs by $50K' },
  { id: 'tip_4', section: 'education', tip: 'Include relevant coursework and academic projects.', example: 'Data Structures, Machine Learning, Web Development' },
  { id: 'tip_5', section: 'skills', tip: 'List both technical and soft skills.', example: 'Python, JavaScript, Leadership, Communication' }
];

async function seed() {
  try {
    const db = await getDb();
    await db.run('PRAGMA foreign_keys = OFF');
    await db.run('DELETE FROM templates');
    await db.run('DELETE FROM writing_tips');
    for (const tmpl of templates) {
      await db.run(
        `INSERT INTO templates (id, name, description, category, layout, thumbnail_url, html_content, css_content, is_ats_safe, is_premium, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        tmpl.id, tmpl.name, tmpl.description, tmpl.category, tmpl.layout, tmpl.thumbnail_url, tmpl.html_content, tmpl.css_content, tmpl.is_ats_safe, tmpl.is_premium, tmpl.tags
      );
    }
    for (const tip of writingTips) {
      await db.run('INSERT INTO writing_tips (id, section, tip, example) VALUES (?, ?, ?, ?)', tip.id, tip.section, tip.tip, tip.example);
    }
    await db.run('PRAGMA foreign_keys = ON');
    logger.info(`Seeded ${templates.length} templates successfully!`);
    process.exit(0);
  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  }
}
seed();
