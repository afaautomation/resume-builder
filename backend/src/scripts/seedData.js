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
        <header>
          <h1>{{contact.name}}</h1>
          <div class="contact-bar">
            <span>{{contact.email}}</span> | <span>{{contact.phone}}</span> | <span>{{contact.location}}</span>
            {{#if contact.linkedin}} | <span>LinkedIn: {{contact.linkedin}}</span>{{/if}}
            {{#if contact.github}} | <span>GitHub: {{contact.github}}</span>{{/if}}
          </div>
        </header>
        {{#if summary}}<section><h2>Summary</h2><p>{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section><h2>Experience</h2>{{#each experience}}<div class="item"><div class="item-header"><h3>{{title}} @ {{company}}</h3><span class="date">{{startDate}} - {{endDate}}</span></div><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section><h2>Education</h2>{{#each education}}<div class="item"><div class="item-header"><h3>{{degree}}</h3><span class="date">{{endDate}}</span></div><p>{{institution}}</p></div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section><h2>Projects</h2>{{#each projects}}<div class="item"><div class="item-header"><h3>{{name}}</h3>{{#if link}}<a href="{{link}}">{{link}}</a>{{/if}}</div><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section><h2>Certifications</h2>{{#each certifications}}<div class="item"><div class="item-header"><h3>{{name}}</h3><span class="date">{{date}}</span></div><p>{{issuer}}</p></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section><h2>Skills</h2><div class="skills-grid">{{#each skills}}<span class="skill-tag">{{this}}</span>{{/each}}</div></section>{{/if}}
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
      body { font-family: var(--font-family); color: #1e293b; line-height: 1.4; }
      h1 { font-size: 24pt; color: var(--primary); margin-bottom: 2px; }
      h2 { font-size: 13pt; border-bottom: 1.5px solid var(--primary); padding-bottom: 2px; margin-top: 12px; margin-bottom: 8px; color: var(--primary); text-transform: uppercase; }
      .contact-bar { font-size: 9pt; color: #64748b; margin-bottom: 15px; }
      .item { margin-bottom: 10px; }
      .item-header { display: flex; justify-content: space-between; align-items: baseline; }
      .item-header h3 { font-size: 11pt; font-weight: 600; margin: 0; }
      .date { font-size: 9pt; color: #64748b; }
      .skills-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .skill-tag { background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-size: 8.5pt; border: 1px solid #e2e8f0; }
      p { margin: 0; font-size: 10pt; }
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
          <h1 style="font-size:24pt; text-transform:uppercase; letter-spacing:2px;">{{contact.name}}</h1>
          <div style="font-size:10pt;">
            {{contact.email}} &bull; {{contact.phone}} &bull; {{contact.location}}
            {{#if contact.linkedin}} &bull; LI: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} &bull; GH: {{contact.github}}{{/if}}
          </div>
        </header>
        {{#if summary}}<section class="sec"><h2>Summary</h2><p>{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section class="sec"><h2>Experience</h2>{{#each experience}}<div class="item"><h3>{{title}} | {{company}}</h3><div class="date">{{startDate}} - {{endDate}}</div><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section class="sec"><h2>Education</h2>{{#each education}}<div class="item"><h3>{{degree}}</h3><div class="date">{{endDate}}</div><p>{{institution}}</p></div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section class="sec"><h2>Projects</h2>{{#each projects}}<div class="item"><h3>{{name}}</h3><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
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
      body { font-family: var(--font-family); color: #000; line-height: 1.3; }
      h2 { font-size: 12pt; text-transform: uppercase; border-bottom: 1px solid #000; margin-top: 12px; margin-bottom: 5px; font-weight: bold; }
      .item { margin-bottom: 8px; }
      .item h3 { font-size: 11pt; margin: 0; font-weight: bold; }
      .date { font-style: italic; font-size: 9.5pt; margin-bottom: 2px; }
      p { font-size: 10pt; margin: 0; }
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
      <div style="display:flex; min-height:297mm;">
        <aside style="width:35%; background:#f0fdf4; padding:30px; border-right:1px solid #dcfce7;">
          <h1 style="font-size:22pt; color:#166534; line-height:1.1; margin-bottom:20px;">{{contact.name}}</h1>
          <div style="margin-bottom:30px;">
            <h2 style="font-size:11pt; color:#166534; text-transform:uppercase; border-bottom:1px solid #bbf7d0; padding-bottom:5px;">Contact</h2>
            <p style="font-size:9pt; margin:5px 0;">{{contact.email}}</p>
            <p style="font-size:9pt; margin:5px 0;">{{contact.phone}}</p>
            <p style="font-size:9pt; margin:5px 0;">{{contact.location}}</p>
            {{#if contact.linkedin}}<p style="font-size:9pt; margin:5px 0;">LI: {{contact.linkedin}}</p>{{/if}}
            {{#if contact.github}}<p style="font-size:9pt; margin:5px 0;">GH: {{contact.github}}</p>{{/if}}
          </div>
          {{#if skills.length}}
          <div style="margin-bottom:30px;">
            <h2 style="font-size:11pt; color:#166534; text-transform:uppercase; border-bottom:1px solid #bbf7d0; padding-bottom:5px;">Skills</h2>
            <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:10px;">
              {{#each skills}}<span style="background:#dcfce7; padding:2px 8px; border-radius:4px; font-size:8.5pt; font-weight:600;">{{this}}</span>{{/each}}
            </div>
          </div>
          {{/if}}
          {{#if education.length}}
          <div>
            <h2 style="font-size:11pt; color:#166534; text-transform:uppercase; border-bottom:1px solid #bbf7d0; padding-bottom:5px;">Education</h2>
            {{#each education}}<div style="margin-top:10px;"><strong style="font-size:9pt;">{{degree}}</strong><p style="font-size:8.5pt; margin:2px 0;">{{institution}}</p></div>{{/each}}
          </div>
          {{/if}}
        </aside>
        <main style="width:65%; padding:40px;">
          {{#if summary}}<section style="margin-bottom:30px;"><h2>Profile</h2><p>{{nl2br summary}}</p></section>{{/if}}
          {{#if experience.length}}<section style="margin-bottom:30px;"><h2>Experience</h2>{{#each experience}}<div style="margin-bottom:20px;"><h3>{{title}}</h3><div style="color:#16a34a; font-weight:600; font-size:9pt;">{{company}} | {{startDate}} - {{endDate}}</div><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          {{#if projects.length}}<section style="margin-bottom:30px;"><h2>Projects</h2>{{#each projects}}<div style="margin-bottom:15px;"><h3>{{name}}</h3>{{#if link}}<a href="{{link}}" style="font-size:9pt; color:#16a34a;">{{link}}</a>{{/if}}<p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          {{#if certifications.length}}<section><h2>Certifications</h2>{{#each certifications}}<div style="margin-bottom:15px;"><h3>{{name}}</h3><div style="color:#16a34a; font-weight:600; font-size:9pt;">{{issuer}} | {{date}}</div></div>{{/each}}</section>{{/if}}
          {{#if additional.length}}<section><h2>Additional</h2>{{#each additional}}<div style="margin-bottom:10px;"><strong>{{title}}:</strong><p style="font-size:9.5pt; margin-top:2px;">{{value}}</p></div>{{/each}}</section>{{/if}}
          {{#if languages.length}}<section><h2>Languages</h2><div style="display:flex; flex-wrap:wrap; gap:10px;">{{#each languages}}<div style="background:#f0fdf4; padding:4px 10px; border-radius:4px; font-size:9pt;"><strong>{{name}}</strong>: {{level}}</div>{{/each}}</div></section>{{/if}}
          {{#if references.length}}<section><h2>References</h2>{{#each references}}<div style="margin-bottom:10px;"><strong>{{name}}</strong><div style="font-size:8.5pt;">{{title}} | {{contact}}</div></div>{{/each}}</section>{{/if}}
        </main>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#166534{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Source Sans Pro', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); color: #1e293b; margin: 0; }
      h2 { font-size: 15pt; color: #166534; border-bottom: 2px solid #f0fdf4; padding-bottom: 5px; margin-bottom: 15px; }
      h3 { font-size: 13pt; margin-bottom: 4px; }
      p { font-size: 10pt; margin: 0; }
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
        <header style="background:#0f172a; color:#fff; padding:30px; margin: calc(var(--margin-top) * -1) calc(var(--margin-right) * -1) 20px calc(var(--margin-left) * -1);">
          <h1 style="font-size:28pt; margin:0; text-align:center;">{{contact.name}}</h1>
          <div style="opacity:0.8; font-size:9.5pt; margin-top:8px; text-align:center;">
            {{contact.email}} | {{contact.phone}} | {{contact.location}}
            {{#if contact.linkedin}} | LI: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} | GH: {{contact.github}}{{/if}}
          </div>
        </header>
        <div style="padding:0;">
          {{#if summary}}<section><h2>Professional Summary</h2><p>{{nl2br summary}}</p></section>{{/if}}
          {{#if experience.length}}<section><h2>Experience</h2>{{#each experience}}<div class="item"><h3>{{title}} @ {{company}}</h3><span class="date">{{startDate}} - {{endDate}}</span><p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          {{#if education.length}}<section><h2>Education</h2>{{#each education}}<div class="item"><h3>{{degree}}</h3><span class="date">{{endDate}}</span><p>{{institution}}</p></div>{{/each}}</section>{{/if}}
          {{#if projects.length}}<section><h2>Projects</h2>{{#each projects}}<div class="item"><h3>{{name}}</h3>{{#if link}}<a href="{{link}}" style="color:#fff; opacity:0.8; font-size:9pt;">{{link}}</a>{{/if}}<p>{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
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
      body { font-family: var(--font-family); color: #1e293b; line-height: 1.4; }
      h2 { color: #0f172a; font-size: 13pt; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #0f172a; padding-bottom: 3px; margin-top: 15px; }
      h3 { font-size: 11.5pt; margin: 0; font-weight: 700; }
      .date { font-size: 9pt; color: #64748b; font-weight: 500; }
      .skills-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .skill-tag { background: #0f172a; color: #fff; padding: 3px 10px; border-radius: 20px; font-size: 8.5pt; }
      p { font-size: 10pt; margin: 0; }
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
          <h1 style="font-size:24pt; font-weight:300; letter-spacing:-0.5px; margin:0;">{{contact.name}}</h1>
          <div style="font-size:9.5pt; color:#64748b; margin-top:4px;">
            {{contact.email}} &bull; {{contact.phone}} &bull; {{contact.location}}
            {{#if contact.linkedin}} &bull; LinkedIn: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} &bull; GitHub: {{contact.github}}{{/if}}
          </div>
        </header>
        {{#if summary}}<section style="margin-bottom:25px;">{{#if summary}}<p style="font-size:11pt; line-height:1.6; color:#334155;">{{nl2br summary}}</p>{{/if}}</section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:25px;"><h2 style="font-size:12pt; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Experience</h2>{{#each experience}}<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{title}} @ {{company}}</strong><span style="font-size:9pt; color:#94a3b8;">{{startDate}} - {{endDate}}</span></div><p style="font-size:10pt; color:#475569; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:25px;"><h2 style="font-size:12pt; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Education</h2>{{#each education}}<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{degree}}</strong><span style="font-size:9pt; color:#94a3b8;">{{endDate}}</span></div><p style="font-size:10pt; color:#475569;">{{institution}}</p></div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section style="margin-bottom:25px;"><h2 style="font-size:12pt; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Projects</h2>{{#each projects}}<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{name}}</strong>{{#if link}}<a href="{{link}}" style="font-size:9pt; color:#6366f1;">{{link}}</a>{{/if}}</div><p style="font-size:10pt; color:#475569; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section style="margin-bottom:25px;"><h2 style="font-size:12pt; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Certifications</h2>{{#each certifications}}<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{name}}</strong><span style="font-size:9pt; color:#94a3b8;">{{date}}</span></div><p style="font-size:10pt; color:#475569;">{{issuer}}</p></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section><h2 style="font-size:12pt; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Skills</h2><p style="font-size:10pt; color:#475569;">{{join skills ", "}}</p></section>{{/if}}
        {{#if additional.length}}<section style="margin-top:20px;"><h2 style="font-size:12pt; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Additional</h2>{{#each additional}}<div style="margin-bottom:8px;"><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        {{#if languages.length}}<section style="margin-top:20px;"><h2 style="font-size:12pt; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">Languages</h2>{{#each languages}}<strong>{{name}}</strong>: {{level}}{{#unless @last}} &bull; {{/unless}}{{/each}}</section>{{/if}}
        {{#if references.length}}<section style="margin-top:20px;"><h2 style="font-size:12pt; text-transform:uppercase; letter-spacing:1px; color:#1e293b; margin-bottom:15px; border-left:3px solid #6366f1; padding-left:10px;">References</h2>{{#each references}}<div style="margin-bottom:8px;"><strong>{{name}}</strong> ({{title}}) - {{contact}}</div>{{/each}}</section>{{/if}}
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#6366f1{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); background: #fff; color: #1e293b; }
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
            <h1 style="font-size:26pt; color:#1e293b; margin:0;">{{contact.name}}</h1>
            <p style="color:#4f46e5; font-weight:600; font-size:10.5pt; margin:2px 0;">Professional Software Engineer</p>
          </div>
          <div style="text-align:right; font-size:9pt; color:#64748b;">
            <div>{{contact.email}}</div>
            <div>{{contact.phone}}</div>
            <div>{{contact.location}}</div>
            {{#if contact.linkedin}}<div>LI: {{contact.linkedin}}</div>{{/if}}
            {{#if contact.github}}<div>GH: {{contact.github}}</div>{{/if}}
          </div>
        </header>
        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:30px;">
          <div>
            {{#if summary}}<section style="margin-bottom:25px;"><h3>About Me</h3><p style="font-size:10pt;">{{nl2br summary}}</p></section>{{/if}}
            {{#if experience.length}}<section style="margin-bottom:25px;"><h3>Work Experience</h3>{{#each experience}}<div style="margin-bottom:15px;"><strong>{{title}}</strong> | <span style="color:#4f46e5;">{{company}}</span><div style="font-size:8.5pt; color:#94a3b8; margin-bottom:5px;">{{startDate}} - {{endDate}}</div><p style="font-size:9.5pt;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
            {{#if projects.length}}<section style="margin-bottom:25px;"><h3>Projects</h3>{{#each projects}}<div style="margin-bottom:15px;"><strong>{{name}}</strong>{{#if link}} | <a href="{{link}}" style="font-size:9pt; color:#4f46e5;">Link</a>{{/if}}<p style="font-size:9.5pt; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
          </div>
          <div>
            {{#if skills.length}}<section style="margin-bottom:25px;"><h3>Tech Stack</h3><div style="display:flex; flex-wrap:wrap; gap:5px;">{{#each skills}}<span style="background:#eef2ff; color:#4338ca; padding:4px 8px; border-radius:4px; font-size:8.5pt; font-family:monospace;">{{this}}</span>{{/each}}</div></section>{{/if}}
            {{#if education.length}}<section style="margin-bottom:25px;"><h3>Education</h3>{{#each education}}<div style="margin-bottom:10px;"><strong>{{degree}}</strong><div style="font-size:8.5pt; color:#64748b;">{{institution}}</div></div>{{/each}}</section>{{/if}}
            {{#if certifications.length}}<section style="margin-bottom:25px;"><h3>Certifications</h3>{{#each certifications}}<div style="margin-bottom:10px;"><strong>{{name}}</strong><div style="font-size:8.5pt; color:#64748b;">{{issuer}} | {{date}}</div></div>{{/each}}</section>{{/if}}
            {{#if additional.length}}<section><h3>Extra Info</h3>{{#each additional}}<div style="margin-bottom:8px;"><strong style="font-size:9pt;">{{title}}</strong><p style="font-size:8.5pt; color:#475569;">{{value}}</p></div>{{/each}}</section>{{/if}}
            {{#if languages.length}}<section><h3>Languages</h3>{{#each languages}}<div><strong>{{name}}</strong>: {{level}}</div>{{/each}}</section>{{/if}}
            {{#if references.length}}<section><h3>References</h3>{{#each references}}<div style="margin-bottom:10px;"><strong>{{name}}</strong><div style="font-size:8.5pt;">{{title}}</div><div style="font-size:8pt; color:#64748b;">{{contact}}</div></div>{{/each}}</section>{{/if}}
          </div>
        </div>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#4f46e5{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); color: #1e293b; }
      h3 { font-size: 11pt; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 15px; }
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
      <div style="line-height:1.3;">
        <header style="text-align:center; margin-bottom:15px;">
          <h1 style="font-size:18pt; margin:0; text-transform:uppercase;">{{contact.name}}</h1>
          <p style="font-size:10pt; margin:5px 0;">
            {{contact.email}} | {{contact.phone}} | {{contact.location}}
            {{#if contact.linkedin}} | LI: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} | GH: {{contact.github}}{{/if}}
          </p>
        </header>
        {{#if summary}}<section style="margin-bottom:20px;"><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">PROFESSIONAL SUMMARY</h2><p style="font-size:10pt;">{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:20px;"><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">EXPERIENCE</h2>{{#each experience}}<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><strong>{{company}}</strong><span>{{startDate}} - {{endDate}}</span></div><div style="font-style:italic; font-size:10pt;">{{title}}</div><p style="font-size:10pt; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:20px;"><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">EDUCATION</h2>{{#each education}}<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between;"><strong>{{institution}}</strong><span>{{endDate}}</span></div><div style="font-size:10pt;">{{degree}}</div></div>{{/each}}</section>{{/if}}
        {{#if projects.length}}<section style="margin-bottom:20px;"><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">PROJECTS</h2>{{#each projects}}<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><strong>{{name}}</strong></div><p style="font-size:10pt; margin-top:4px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section style="margin-bottom:20px;"><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">CERTIFICATIONS</h2>{{#each certifications}}<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between;"><strong>{{name}}</strong><span>{{date}}</span></div><div style="font-size:10pt;">{{issuer}}</div></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">SKILLS</h2><p style="font-size:10pt;">{{join skills ", "}}</p></section>{{/if}}
        {{#if additional.length}}<section style="margin-top:15px;"><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">ADDITIONAL INFORMATION</h2>{{#each additional}}<div style="margin-bottom:4px;"><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        {{#if languages.length}}<section style="margin-top:15px;"><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">LANGUAGES</h2><p>{{#each languages}}{{name}} ({{level}}){{#unless @last}}, {{/unless}}{{/each}}</p></section>{{/if}}
        {{#if references.length}}<section style="margin-top:15px;"><h2 style="font-size:12pt; border-bottom:1px solid #000; margin-bottom:8px;">REFERENCES</h2>{{#each references}}<div style="margin-bottom:8px;"><strong>{{name}}</strong><br>{{title}} | {{contact}}</div>{{/each}}</section>{{/if}}
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#000000{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Times New Roman', serif{{/if}};
      }
      body { font-family: var(--font-family); color: #000; line-height: 1.3; }
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
          <h1 style="font-size:26pt; margin:0; font-family:'Playfair Display', serif;">{{contact.name}}</h1>
          <p style="font-size:10pt; margin-top:5px; color:#4a5568;">
            {{contact.email}} | {{contact.phone}} | {{contact.location}}
            {{#if contact.linkedin}} | LinkedIn: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} | GitHub: {{contact.github}}{{/if}}
          </p>
        </header>
        {{#if summary}}<section style="margin-bottom:25px;"><h2 style="font-size:14pt; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Research Profile</h2><p style="font-size:10.5pt; line-height:1.6;">{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:25px;"><h2 style="font-size:14pt; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Academic Experience</h2>{{#each experience}}<div style="margin-bottom:15px;"><strong>{{title}}</strong>, <span style="font-style:italic;">{{company}}</span><br><span style="font-size:9pt; color:#718096;">{{startDate}} - {{endDate}}</span><p style="font-size:10pt; margin-top:5px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:25px;"><h2 style="font-size:14pt; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Education</h2>{{#each education}}<div style="margin-bottom:12px;"><strong>{{degree}}</strong><br>{{institution}} | <span style="font-size:9pt; color:#718096;">Graduated {{endDate}}</span></div>{{/each}}</section>{{/if}}
        {{#if certifications.length}}<section style="margin-bottom:25px;"><h2 style="font-size:14pt; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Certifications</h2>{{#each certifications}}<div style="margin-bottom:8px;"><strong>{{name}}</strong> ({{issuer}}, {{date}})</div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section style="margin-bottom:25px;"><h2 style="font-size:14pt; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Technical Skills</h2><p style="font-size:10pt;">{{join skills ", "}}</p></section>{{/if}}
        {{#if additional.length}}<section style="margin-bottom:25px;"><h2 style="font-size:14pt; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Additional Details</h2>{{#each additional}}<div><strong>{{title}}:</strong> {{value}}</div>{{/each}}</section>{{/if}}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
          {{#if languages.length}}<section><h2 style="font-size:14pt; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">Languages</h2>{{#each languages}}<div><strong>{{name}}</strong> ({{level}})</div>{{/each}}</section>{{/if}}
          {{#if references.length}}<section><h2 style="font-size:14pt; color:#2d3748; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:10px;">References</h2>{{#each references}}<div style="margin-bottom:10px; font-size:9.5pt;"><strong>{{name}}</strong><br>{{title}}<br>{{contact}}</div>{{/each}}</section>{{/if}}
        </div>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#2d3748{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Crimson Pro', serif{{/if}};
      }
      body { font-family: var(--font-family); line-height: 1.5; }
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
      <div style="border-left:12px solid #1e293b; padding:40px; min-height:297mm;">
        <header style="margin-bottom:30px;">
          <h1 style="font-size:32pt; font-weight:800; color:#1e293b; margin:0; text-transform:uppercase; letter-spacing:-1px;">{{contact.name}}</h1>
          <p style="font-size:10pt; color:#64748b; margin-top:5px; font-weight:500;">
            {{contact.email}} &bull; {{contact.phone}} &bull; {{contact.location}}
            {{#if contact.linkedin}} &bull; LI: {{contact.linkedin}}{{/if}}
            {{#if contact.github}} &bull; GH: {{contact.github}}{{/if}}
          </p>
        </header>
        {{#if summary}}<section style="margin-bottom:25px;"><h2 style="font-size:11pt; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">About Me</h2><p style="font-size:10.5pt; color:#475569;">{{nl2br summary}}</p></section>{{/if}}
        {{#if experience.length}}<section style="margin-bottom:25px;"><h2 style="font-size:11pt; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Professional History</h2>{{#each experience}}<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:baseline;"><strong>{{title}}</strong><span style="font-size:9pt; color:#94a3b8;">{{startDate}} - {{endDate}}</span></div><div style="color:#6366f1; font-weight:600; font-size:9.5pt;">{{company}}</div><p style="font-size:10pt; color:#475569; margin-top:5px;">{{nl2br description}}</p></div>{{/each}}</section>{{/if}}
        {{#if education.length}}<section style="margin-bottom:25px;"><h2 style="font-size:11pt; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Education</h2>{{#each education}}<div><strong>{{degree}}</strong><br><span style="color:#64748b; font-size:9.5pt;">{{institution}} | Graduated {{endDate}}</span></div>{{/each}}</section>{{/if}}
        {{#if skills.length}}<section style="margin-bottom:25px;"><h2 style="font-size:11pt; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Core Expertise</h2><div style="display:flex; flex-wrap:wrap; gap:8px;">{{#each skills}}<span style="background:#f8fafc; border:1px solid #e2e8f0; padding:4px 12px; border-radius:4px; font-size:9pt;">{{this}}</span>{{/each}}</div></section>{{/if}}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
          {{#if languages.length}}<section><h2 style="font-size:11pt; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Languages</h2>{{#each languages}}<div><strong>{{name}}</strong>: {{level}}</div>{{/each}}</section>{{/if}}
          {{#if references.length}}<section><h2 style="font-size:11pt; color:#1e293b; text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">References</h2>{{#each references}}<div style="margin-bottom:8px; font-size:9.5pt;"><strong>{{name}}</strong> &bull; {{contact}}</div>{{/each}}</section>{{/if}}
        </div>
      </div>
    `,
    css_content: `
      :root {
        --primary: {{#if design.primaryColor}}{{design.primaryColor}}{{else}}#1e293b{{/if}};
        --font-family: {{#if design.fontFamily}}{{{design.fontFamily}}}{{else}}'Inter', sans-serif{{/if}};
      }
      body { font-family: var(--font-family); line-height: 1.4; }
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

module.exports = { templates, writingTips };
