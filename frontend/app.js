/**
 * ResumePro Frontend Logic
 * Refactored for Anonymous Flow: Home -> Templates -> Editor
 */

const hostname = window.location.hostname || 'localhost';
const isLocalDev = hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.');

// Determine API_BASE dynamically to support both local development and hosted deployments
let API_BASE = '/api';
if (isLocalDev) {
    const port = window.location.port;
    if (port && port !== '5000') {
        API_BASE = `http://${hostname}:5000/api`;
    }
}


// --- State Management ---
const state = {
    resumes: [],
    currentResume: null,
    activeView: 'landing', // 'landing', 'templates', 'editor'
    isSaving: false
};

// --- API Helpers ---
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        const data = await response.json();

        if (!response.ok) throw new Error(data.message || 'API Error');
        return data;
    } catch (err) {
        showToast(err.message, 'error');
        throw err;
    }
}

// --- Navigation & View Logic ---
function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.remove('hidden');
        window.scrollTo(0, 0);
    }

    if (viewName === 'templates') {
        fetchTemplatesForPicker();
        // Clear ALL editor state to prevent old resume data bleeding into the next template
        state.currentResume = null;
        const formContainer = document.getElementById('active-section-form');
        if (formContainer) formContainer.innerHTML = '';
        const titleInput = document.getElementById('resume-title-input');
        if (titleInput) titleInput.value = 'Untitled Resume';
        // Blank the preview iframe so old content is never visible
        const iframe = document.getElementById('resume-preview-iframe');
        if (iframe) {
            iframe.removeAttribute('srcdoc');
            iframe.src = 'about:blank';
        }
    }

    // Update background state if it exists
    if (window.updateBackgroundView) {
        window.updateBackgroundView(viewName);
    }

    updateLogoutButtons();
}

function updateLogoutButtons() {
    const token = localStorage.getItem('token');
    const isAuth = !!token;

    const templatesLogout = document.getElementById('logout-btn-templates');
    const editorLogout = document.getElementById('logout-btn-editor');

    if (templatesLogout) templatesLogout.style.display = isAuth ? 'inline-flex' : 'none';
    if (editorLogout) editorLogout.style.display = isAuth ? 'inline-flex' : 'none';
}

window.logout = () => {
    localStorage.removeItem('token');
    showToast('Logged out successfully', 'success');
    updateLogoutButtons();
    switchView('landing');
};

// --- Template Picker Logic ---
async function fetchTemplatesForPicker() {
    const grid = document.getElementById('template-picker-grid');
    if (!grid) return;

    const renderTemplates = (templates) => {
        grid.innerHTML = templates.map(t => `
            <div class="template-card" onclick="startBuildingWithTemplate('${t.id}')">
                <div class="template-thumb">
                    ${t.thumbnail_url ? `<img src="${t.thumbnail_url}" alt="${t.name}">` : '<!-- Placeholder -->'}
                </div>
                <div class="template-info">
                    <h4>${t.name}</h4>
                    <p>${t.description || 'Professional & ATS-friendly'}</p>
                </div>
            </div>
        `).join('');
        lucide.createIcons();
    };

    // Load from cache first for instant UI
    const cached = localStorage.getItem('cached_templates');
    if (cached) {
        try { renderTemplates(JSON.parse(cached)); } catch (e) { }
    } else {
        grid.innerHTML = '<div style="text-align: center; width: 100%; grid-column: 1 / -1; padding: 4rem;"><i data-lucide="loader" style="animation: spin 1s linear infinite; margin-bottom: 1rem;"></i><p style="color: var(--text-muted);">Waking up the server... Please wait a few seconds!</p></div>';
        lucide.createIcons();
    }

    try {
        const data = await apiFetch('/templates');
        if (data && data.templates) {
            localStorage.setItem('cached_templates', JSON.stringify(data.templates));
            renderTemplates(data.templates);
        }
    } catch (err) {
        console.error('Failed to load templates', err);
        if (!cached) {
            grid.innerHTML = '<div style="text-align: center; width: 100%; grid-column: 1 / -1; padding: 2rem; color: #ef4444;">Failed to load templates. Please refresh and try again.</div>';
        }
    }
}

let pendingTemplateId = null;

async function startBuildingWithTemplate(templateId) {
    // Show login modal if user is not authenticated
    if (!localStorage.getItem('token')) {
        pendingTemplateId = templateId;
        document.getElementById('otp-auth-modal').classList.remove('hidden');
        return;
    }

    try {
        // Immediately blank the preview so old content never shows
        const iframe = document.getElementById('resume-preview-iframe');
        if (iframe) iframe.src = 'about:blank';
        state.currentResume = null;

        showToast('Preparing your editor...', 'info');
        const data = await apiFetch('/resumes', {
            method: 'POST',
            body: JSON.stringify({
                title: 'My New Resume',
                templateId: templateId
            })
        });
        openEditor(data.resume.id);
    } catch (err) {
        console.error(err);
        // If token expired, clear it and prompt login again
        if (err.message && (err.message.includes('Token') || err.message.includes('auth') || err.message.includes('unauthorized'))) {
            localStorage.removeItem('token');
            pendingTemplateId = templateId;
            document.getElementById('otp-auth-modal').classList.remove('hidden');
        } else {
            showToast('Failed to open template. Please try again.', 'error');
        }
    }
}

window.startBuildingWithTemplate = startBuildingWithTemplate;


// --- OTP Auth Logic ---
let isSignupMode = true;

document.addEventListener('DOMContentLoaded', () => {
    const tabSignup = document.getElementById('tab-signup');
    const tabLogin = document.getElementById('tab-login');
    const signupFields = document.getElementById('signup-fields');

    if (tabSignup && tabLogin) {
        tabSignup.onclick = () => {
            isSignupMode = true;
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            signupFields.style.display = 'block';
            document.getElementById('auth-name').required = true;
            document.getElementById('auth-email').required = true;
        };
        tabLogin.onclick = () => {
            isSignupMode = false;
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            signupFields.style.display = 'none';
            document.getElementById('auth-name').required = false;
            document.getElementById('auth-email').required = false;
        };
    }
});

window.submitAuth = async function () {
    const phone = document.getElementById('auth-phone').value.trim();
    const name = document.getElementById('auth-name').value.trim();
    const email = document.getElementById('auth-email').value.trim();
    const btn = document.getElementById('submit-auth-btn');

    if (!phone) return showToast('Please enter mobile number', 'error');
    if (isSignupMode && (!name || !email)) return showToast('Please enter name and email', 'error');

    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Processing...';
    lucide.createIcons();

    try {
        const payload = { phone };
        if (isSignupMode) {
            payload.name = name;
            payload.email = email;
        }

        const res = await fetch(`${API_BASE}/auth/login-phone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) {
            if (res.status === 404 && data.message.includes('Sign Up')) {
                const tabSignup = document.getElementById('tab-signup');
                if (tabSignup) tabSignup.click();
                throw new Error('Mobile number not found. Please enter your name and email to sign up.');
            }
            if (res.status === 409 && data.message.includes('Log In')) {
                const tabLogin = document.getElementById('tab-login');
                if (tabLogin) tabLogin.click();
                throw new Error('This mobile number is already registered. Please Log In.');
            }
            throw new Error(data.message || 'Authentication failed');
        }

        // Success
        localStorage.setItem('token', data.tokens.access);
        document.getElementById('otp-auth-modal').classList.add('hidden');
        showToast('Authentication successful!', 'success');

        if (pendingTemplateId) {
            startBuildingWithTemplate(pendingTemplateId);
            pendingTemplateId = null;
        }

    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.innerHTML = 'Continue';
    }
};

// --- Editor Logic ---
async function openEditor(id) {
    try {
        // Blank the iframe immediately before fetching — prevents ANY stale content flash
        const iframe = document.getElementById('resume-preview-iframe');
        if (iframe) {
            iframe.removeAttribute('srcdoc');
            iframe.src = 'about:blank';
        }

        const data = await apiFetch(`/resumes/${id}`);
        state.currentResume = data.resume;

        // Use 'editor' view directly, not templates, so my cleanup code in switchView doesn't wipe state
        state.activeView = 'editor';
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const editorView = document.getElementById('editor-view');
        if (editorView) editorView.classList.remove('hidden');
        window.scrollTo(0, 0);
        if (window.updateBackgroundView) window.updateBackgroundView('editor');

        setupEditor();



        updatePreview();
    } catch (err) {
        console.error(err);
        showToast('Failed to load editor. Please try again.', 'error');
    }
}

function setupEditor() {
    const r = state.currentResume;
    document.getElementById('resume-title-input').value = r.title;

    const sections = [
        { key: 'contact', label: 'Contact Info', icon: 'user' },
        { key: 'summary', label: 'Summary', icon: 'align-left' },
        { key: 'experience', label: 'Experience', icon: 'briefcase' },
        { key: 'education', label: 'Education', icon: 'graduation-cap' },
        { key: 'skills', label: 'Skills', icon: 'code' },
        { key: 'projects', label: 'Projects', icon: 'folder' },
        { key: 'certifications', label: 'Certifications', icon: 'award' },
        { key: 'additional', label: 'Additional Info', icon: 'info' },
        { key: 'languages', label: 'Languages', icon: 'languages' },
        { key: 'references', label: 'References', icon: 'users' },
        { key: 'design', label: 'Design', icon: 'palette' }
    ];

    const sectionContainer = document.getElementById('editor-sections');
    sectionContainer.innerHTML = sections.map(s => `
        <button class="section-nav-btn" data-section="${s.key}" draggable="true">
            <i data-lucide="${s.icon}" class="drag-handle"></i>
            <span>${s.label}</span>
        </button>
    `).join('');
    lucide.createIcons();

    sectionContainer.querySelectorAll('.section-nav-btn').forEach(btn => {
        btn.onclick = () => renderSectionForm(btn.dataset.section);

        btn.addEventListener('dragstart', (e) => {
            btn.classList.add('dragging');
            e.dataTransfer.setData('text/plain', btn.dataset.section);
        });

        btn.addEventListener('dragend', () => {
            btn.classList.remove('dragging');
            updateSectionsOrder();
        });
    });

    sectionContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(sectionContainer, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (afterElement == null) {
            sectionContainer.appendChild(dragging);
        } else {
            sectionContainer.insertBefore(dragging, afterElement);
        }
    });

    renderSectionForm('contact');
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.section-nav-btn:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function updateSectionsOrder() {
    const newOrder = [...document.querySelectorAll('.section-nav-btn')].map(btn => btn.dataset.section);
    state.currentResume.layout = { sections: newOrder };

    // Save order
    saveResumeDebounced();

    // Update preview (templates will need to support this)
    updatePreview();
}

function renderSectionForm(sectionKey) {
    const formContainer = document.getElementById('active-section-form');
    const content = state.currentResume.content;

    document.querySelectorAll('.section-nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.section === sectionKey);
    });

    if (sectionKey === 'contact') {
        formContainer.innerHTML = `
            <h2>Contact Information</h2>
            <div class="form-grid">
                <div class="input-group">
                    <label>Full Name</label>
                    <input type="text" data-path="contact.name" value="${content.contact?.name || ''}">
                </div>
                <div class="input-group">
                    <label>Job Title</label>
                    <input type="text" data-path="contact.title" value="${content.contact?.title || ''}">
                </div>
                <div class="input-group">
                    <label>Email</label>
                    <input type="email" data-path="contact.email" value="${content.contact?.email || ''}">
                </div>
                <div class="input-group">
                    <label>Phone</label>
                    <input type="text" data-path="contact.phone" value="${content.contact?.phone || ''}">
                </div>
                <div class="input-group">
                    <label>Location</label>
                    <input type="text" data-path="contact.location" value="${content.contact?.location || ''}">
                </div>
                <div class="input-group">
                    <label>LinkedIn ID / URL</label>
                    <input type="text" data-path="contact.linkedin" value="${content.contact?.linkedin || ''}">
                </div>
                <div class="input-group">
                    <label>GitHub ID / URL</label>
                    <input type="text" data-path="contact.github" value="${content.contact?.github || ''}">
                </div>
            </div>
        `;
    } else if (sectionKey === 'summary') {
        formContainer.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2rem;">
                <h2 style="margin-bottom:0;">Professional Summary</h2>
                <button class="secondary-btn sm ai-suggest-btn" data-type="summary"><i data-lucide="sparkles"></i> AI Write</button>
            </div>
            <div class="input-group full">
                <textarea id="summary-textarea" data-path="summary" rows="12" placeholder="Briefly describe your professional background and key achievements...">${content.summary || ''}</textarea>
            </div>
        `;
    } else if (['experience', 'education', 'projects', 'certifications', 'additional', 'languages', 'references'].includes(sectionKey)) {
        const items = content[sectionKey] || [];
        formContainer.innerHTML = `
            <div class="section-header-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h2>${sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1)}</h2>
                <button class="primary-btn sm" id="add-item-btn"><i data-lucide="plus"></i> Add Entry</button>
            </div>
            <div id="list-container" class="list-editor-container" style="display:flex; flex-direction:column; gap:1.5rem;">
                ${items.map((item, idx) => renderListItem(sectionKey, item, idx)).join('')}
            </div>
        `;
        document.getElementById('add-item-btn').onclick = () => addListItem(sectionKey);
    } else if (sectionKey === 'skills') {
        const skills = content.skills || [];
        formContainer.innerHTML = `
            <div class="section-header-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h2>Skills & Expertise</h2>
                <button class="primary-btn sm" id="add-skill-btn"><i data-lucide="plus"></i> Add Skill</button>
            </div>
            <div id="skills-container" style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                ${skills.map((skill, idx) => `
                    <div class="skill-item" style="display:flex; gap:0.5rem; background:var(--bg-main); padding:0.5rem; border-radius:var(--radius-sm); border:1px solid var(--border);">
                        <input type="text" data-section="skills" data-index="${idx}" value="${skill}" style="flex:1; background:transparent; border:none; color:inherit; outline:none; font-family:inherit;">
                        <button class="icon-btn sm" onclick="removeSkill(${idx})"><i data-lucide="x"></i></button>
                    </div>
                `).join('')}
            </div>
        `;
        document.getElementById('add-skill-btn').onclick = () => {
            if (!state.currentResume.content.skills) state.currentResume.content.skills = [];
            state.currentResume.content.skills.push('');
            renderSectionForm('skills');
            updatePreview();
            saveResumeDebounced();
        };

        // Special handling for skill inputs
        formContainer.querySelectorAll('input').forEach(input => {
            input.oninput = debounce(() => {
                const idx = parseInt(input.dataset.index);
                state.currentResume.content.skills[idx] = input.value;
                updatePreview();
                saveResumeDebounced();
            }, 500);
        });
    } else if (sectionKey === 'design') {
        const design = state.currentResume.design || {};
        formContainer.innerHTML = `
            <h2>Design & Templates</h2>
            <div style="margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1rem; color: var(--text-muted); font-size: 1rem;">Customization</h3>
                <div class="form-grid">
                    <div class="input-group">
                        <label>Primary Color</label>
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            <input type="color" data-path="design.primaryColor" value="${design.primaryColor || '#2563eb'}" style="width: 40px; height: 40px; padding: 0; background: none; border: none; cursor: pointer;">
                            <span style="color:var(--text-muted); font-size:0.9rem;">Choose theme color</span>
                        </div>
                    </div>
                    <div class="input-group">
                        <label>Font Family</label>
                        <select data-path="design.fontFamily" style="background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.75rem; color: var(--text-main);">
                            <option value="Inter, sans-serif" ${design.fontFamily === 'Inter, sans-serif' ? 'selected' : ''}>Inter (Modern Sans)</option>
                            <option value="Merriweather, serif" ${design.fontFamily === 'Merriweather, serif' ? 'selected' : ''}>Merriweather (Classic Serif)</option>
                            <option value="Roboto, sans-serif" ${design.fontFamily === 'Roboto, sans-serif' ? 'selected' : ''}>Roboto (Clean Sans)</option>
                            <option value="Playfair Display, serif" ${design.fontFamily === 'Playfair Display, serif' ? 'selected' : ''}>Playfair Display (Elegant)</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Font Size (pt)</label>
                        <input type="number" data-path="design.fontSize" value="${design.fontSize || 10}" min="8" max="14" step="0.5">
                    </div>
                    <div class="input-group">
                        <label>Line Height</label>
                        <input type="number" data-path="design.lineHeight" value="${design.lineHeight || 1.4}" min="1" max="2" step="0.1">
                    </div>
                    <div class="input-group">
                        <label>Page Margin (mm)</label>
                        <input type="number" id="margin-input" value="${design.margins?.top || 12.7}" min="5" max="30" step="1">
                    </div>
                </div>
            </div>
            <h3 style="margin-bottom: 1rem; color: var(--text-muted); font-size: 1rem;">Change Template</h3>
            <div id="template-editor-list" class="template-grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
                <!-- Internal template switcher -->
            </div>
        `;

        const marginInput = document.getElementById('margin-input');
        if (marginInput) {
            marginInput.oninput = debounce(() => {
                const m = parseFloat(marginInput.value);
                state.currentResume.design.margins = { top: m, right: m, bottom: m, left: m };
                updatePreview();
                saveResumeDebounced();
            }, 500);
        }

        fetchTemplatesForEditor();
    }

    // Attach AI Suggestion handlers
    formContainer.querySelectorAll('.ai-suggest-btn').forEach(btn => {
        btn.onclick = async () => {
            const type = btn.dataset.type;
            const section = btn.dataset.section;
            const index = btn.dataset.index;
            let context = state.currentResume.content;

            if (type === 'description' && section && index !== undefined) {
                context = state.currentResume.content[section][parseInt(index)];
            }

            showToast('Generating AI suggestion...', 'info');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader"></i>';
            btn.disabled = true;
            lucide.createIcons();

            const targetId = type === 'summary' ? 'summary-textarea' : `${section}-desc-${index}`;
            const textarea = document.getElementById(targetId);
            if (textarea) textarea.value = '';

            let fullText = '';

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(`${API_BASE}/ai/suggest`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, context, stream: true }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    let errMsg = `Server error (${response.status})`;
                    try {
                        const errData = await response.json();
                        errMsg = errData.message || errMsg;
                    } catch(e) {}
                    throw new Error(errMsg);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.replace(/^data: /, '').trim();
                            if (dataStr === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(dataStr);
                                if (parsed.error) throw new Error(parsed.error);
                                if (parsed.chunk) {
                                    fullText += parsed.chunk;
                                    if (textarea) {
                                        textarea.value = fullText;
                                        textarea.scrollTop = textarea.scrollHeight;
                                    }
                                }
                            } catch (e) {
                                if (e.message && !e.message.includes('JSON')) throw e;
                            }
                        }
                    }
                }

                if (!fullText) throw new Error('AI returned no content. API keys may be exhausted or unavailable.');

                // Save to state
                if (type === 'summary') {
                    state.currentResume.content.summary = fullText;
                } else if (type === 'description') {
                    state.currentResume.content[section][parseInt(index)].description = fullText;
                }

                updatePreview();
                saveResumeDebounced();
                showToast('AI suggestion applied!', 'success');

            } catch (err) {
                console.error('AI Suggestion Error:', err);
                if (err.name === 'AbortError') {
                    showToast('AI request timed out. Please try again.', 'error');
                } else {
                    showToast(`AI Error: ${err.message}`, 'error');
                }
                // Restore textarea if empty
                if (textarea && !textarea.value) textarea.value = '';
            } finally {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                lucide.createIcons();
            }
        };
    });


    // Attach live preview update on every input change & trigger debounced save
    formContainer.querySelectorAll('input, textarea, select').forEach(input => {
        const handler = debounce(() => {
            const path = input.dataset.path;
            const value = input.value;
            const index = input.dataset.index;
            const section = input.dataset.section;

            if (section === 'skills' && index !== undefined) {
                state.currentResume.content.skills[parseInt(index)] = value;
            } else if (index !== undefined) {
                state.currentResume.content[section][parseInt(index)][path] = value;
            } else if (path) {
                if (path.startsWith('design.')) {
                    const key = path.split('.')[1];
                    if (!state.currentResume.design) state.currentResume.design = {};
                    state.currentResume.design[key] = input.type === 'number' ? parseFloat(value) : value;
                } else if (path.includes('.')) {
                    const [obj, key] = path.split('.');
                    if (!state.currentResume.content[obj]) state.currentResume.content[obj] = {};
                    state.currentResume.content[obj][key] = value;
                } else {
                    state.currentResume.content[path] = value;
                }
            }

            updatePreview();
            saveResumeDebounced();
        }, 500);

        input.oninput = handler;
        if (input.tagName.toLowerCase() === 'select') {
            input.onchange = handler;
        }
    });


    lucide.createIcons();
}

function renderListItem(section, item, index) {
    if (section === 'experience') {
        return `
            <div class="list-item-card" style="background:var(--bg-main); padding:1.5rem; border-radius:var(--radius-md); border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <span style="color:var(--primary); font-weight:600;">Experience #${index + 1}</span>
                    <button class="icon-btn" onclick="removeListItem('experience', ${index})"><i data-lucide="trash-2"></i></button>
                </div>
                <div class="form-grid">
                    <div class="input-group"><label>Company</label><input type="text" data-section="experience" data-index="${index}" data-path="company" value="${item.company || ''}"></div>
                    <div class="input-group"><label>Title</label><input type="text" data-section="experience" data-index="${index}" data-path="title" value="${item.title || ''}"></div>
                    <div class="input-group"><label>Start Date</label><input type="text" data-section="experience" data-index="${index}" data-path="startDate" value="${item.startDate || ''}"></div>
                    <div class="input-group"><label>End Date</label><input type="text" data-section="experience" data-index="${index}" data-path="endDate" value="${item.endDate || ''}"></div>
                    <div class="input-group full">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <label>Description</label>
                            <button type="button" class="icon-btn ai-suggest-btn sm" data-type="description" data-section="experience" data-index="${index}" title="AI Suggestion"><i data-lucide="sparkles" style="width:16px; height:16px; color:var(--primary);"></i></button>
                        </div>
                        <textarea id="experience-desc-${index}" data-section="experience" data-index="${index}" data-path="description" rows="4">${item.description || ''}</textarea>
                    </div>
                </div>
            </div>
        `;
    } else if (section === 'education') {
        return `
            <div class="list-item-card" style="background:var(--bg-main); padding:1.5rem; border-radius:var(--radius-md); border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <span style="color:var(--primary); font-weight:600;">Education #${index + 1}</span>
                    <button class="icon-btn" onclick="removeListItem('education', ${index})"><i data-lucide="trash-2"></i></button>
                </div>
                <div class="form-grid">
                    <div class="input-group"><label>Institution</label><input type="text" data-section="education" data-index="${index}" data-path="institution" value="${item.institution || ''}"></div>
                    <div class="input-group"><label>Degree</label><input type="text" data-section="education" data-index="${index}" data-path="degree" value="${item.degree || ''}"></div>
                    <div class="input-group full"><label>End Date / Year</label><input type="text" data-section="education" data-index="${index}" data-path="endDate" value="${item.endDate || ''}"></div>
                </div>
            </div>
        `;
    } else if (section === 'projects') {
        return `
            <div class="list-item-card" style="background:var(--bg-main); padding:1.5rem; border-radius:var(--radius-md); border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <span style="color:var(--primary); font-weight:600;">Project #${index + 1}</span>
                    <button class="icon-btn" onclick="removeListItem('projects', ${index})"><i data-lucide="trash-2"></i></button>
                </div>
                <div class="form-grid">
                    <div class="input-group full"><label>Project Name</label><input type="text" data-section="projects" data-index="${index}" data-path="name" value="${item.name || ''}"></div>
                    <div class="input-group full">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <label>Description</label>
                            <button type="button" class="icon-btn ai-suggest-btn sm" data-type="description" data-section="projects" data-index="${index}" title="AI Suggestion"><i data-lucide="sparkles" style="width:16px; height:16px; color:var(--primary);"></i></button>
                        </div>
                        <textarea id="projects-desc-${index}" data-section="projects" data-index="${index}" data-path="description" rows="4">${item.description || ''}</textarea>
                    </div>
                    <div class="input-group full"><label>Link (Optional)</label><input type="text" data-section="projects" data-index="${index}" data-path="link" value="${item.link || ''}"></div>
                </div>
            </div>
        `;
    } else if (section === 'certifications') {
        return `
            <div class="list-item-card" style="background:var(--bg-main); padding:1.5rem; border-radius:var(--radius-md); border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <span style="color:var(--primary); font-weight:600;">Certification #${index + 1}</span>
                    <button class="icon-btn" onclick="removeListItem('certifications', ${index})"><i data-lucide="trash-2"></i></button>
                </div>
                <div class="form-grid">
                    <div class="input-group full"><label>Name</label><input type="text" data-section="certifications" data-index="${index}" data-path="name" value="${item.name || ''}"></div>
                    <div class="input-group"><label>Issuer</label><input type="text" data-section="certifications" data-index="${index}" data-path="issuer" value="${item.issuer || ''}"></div>
                    <div class="input-group"><label>Date</label><input type="text" data-section="certifications" data-index="${index}" data-path="date" value="${item.date || ''}"></div>
                </div>
            </div>
        `;
    } else if (section === 'additional') {
        return `
            <div class="list-item-card" style="background:var(--bg-main); padding:1.5rem; border-radius:var(--radius-md); border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <span style="color:var(--primary); font-weight:600;">Entry #${index + 1}</span>
                    <button class="icon-btn" onclick="removeListItem('additional', ${index})"><i data-lucide="trash-2"></i></button>
                </div>
                <div class="form-grid">
                    <div class="input-group full"><label>Title (e.g. Languages)</label><input type="text" data-section="additional" data-index="${index}" data-path="title" value="${item.title || ''}"></div>
                    <div class="input-group full"><label>Description / Details</label><textarea data-section="additional" data-index="${index}" data-path="value" rows="2">${item.value || ''}</textarea></div>
                </div>
            </div>
        `;
    } else if (section === 'languages') {
        return `
            <div class="list-item-card" style="background:var(--bg-main); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border); display:flex; gap:1rem; align-items:center;">
                <input type="text" data-section="languages" data-index="${index}" data-path="name" placeholder="Language (e.g. English)" value="${item.name || ''}" style="flex:1;">
                <select data-section="languages" data-index="${index}" data-path="level" style="width:150px;">
                    <option value="Native" ${item.level === 'Native' ? 'selected' : ''}>Native</option>
                    <option value="Fluent" ${item.level === 'Fluent' ? 'selected' : ''}>Fluent</option>
                    <option value="Professional" ${item.level === 'Professional' ? 'selected' : ''}>Professional</option>
                    <option value="Intermediate" ${item.level === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                    <option value="Basic" ${item.level === 'Basic' ? 'selected' : ''}>Basic</option>
                </select>
                <button class="icon-btn" onclick="removeListItem('languages', ${index})"><i data-lucide="trash-2"></i></button>
            </div>
        `;
    } else if (section === 'references') {
        return `
            <div class="list-item-card" style="background:var(--bg-main); padding:1.5rem; border-radius:var(--radius-md); border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <span style="color:var(--primary); font-weight:600;">Reference #${index + 1}</span>
                    <button class="icon-btn" onclick="removeListItem('references', ${index})"><i data-lucide="trash-2"></i></button>
                </div>
                <div class="form-grid">
                    <div class="input-group"><label>Name</label><input type="text" data-section="references" data-index="${index}" data-path="name" value="${item.name || ''}"></div>
                    <div class="input-group"><label>Position/Company</label><input type="text" data-section="references" data-index="${index}" data-path="title" value="${item.title || ''}"></div>
                    <div class="input-group full"><label>Contact Info (Email/Phone)</label><input type="text" data-section="references" data-index="${index}" data-path="contact" value="${item.contact || ''}"></div>
                </div>
            </div>
        `;
    }
    return '';
}

function addListItem(section) {
    if (!state.currentResume.content[section]) state.currentResume.content[section] = [];
    state.currentResume.content[section].push({});
    renderSectionForm(section);
    updatePreview();
    saveResumeDebounced();
}

window.removeListItem = (section, index) => {
    state.currentResume.content[section].splice(index, 1);
    renderSectionForm(section);
    updatePreview();
    saveResumeDebounced();
};

window.removeSkill = (index) => {
    state.currentResume.content.skills.splice(index, 1);
    renderSectionForm('skills');
    updatePreview();
    saveResumeDebounced();
};

async function fetchTemplatesForEditor() {
    const list = document.getElementById('template-editor-list');
    if (!list) return;

    const renderTemplates = (templates) => {
        list.innerHTML = templates.map(t => `
            <div class="template-card ${state.currentResume.template_id === t.id ? 'selected' : ''}" 
                 onclick="switchTemplate('${t.id}')"
                 style="cursor:pointer; overflow:hidden; border:1px solid ${state.currentResume.template_id === t.id ? 'var(--primary)' : 'var(--border)'};">
                <div class="template-thumb" style="height:120px; background:var(--bg-main); overflow:hidden;">
                    ${t.thumbnail_url ? `<img src="${t.thumbnail_url}" style="width:100%; height:100%; object-fit:cover;">` : ''}
                </div>
                <div class="template-info" style="padding:0.5rem;">
                    <h4 style="font-size:0.85rem; margin:0;">${t.name}</h4>
                </div>
            </div>
        `).join('');
    };

    const cached = localStorage.getItem('cached_templates');
    if (cached) {
        try { renderTemplates(JSON.parse(cached)); } catch (e) { }
    } else {
        list.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem;"><i data-lucide="loader" style="animation: spin 1s linear infinite;"></i></div>';
        lucide.createIcons();
    }

    try {
        const data = await apiFetch('/templates');
        if (data && data.templates) {
            localStorage.setItem('cached_templates', JSON.stringify(data.templates));
            renderTemplates(data.templates);
        }
    } catch (err) {
        console.error('Failed to load templates for editor', err);
    }
}

window.switchTemplate = async (templateId) => {
    try {
        // Update local state and trigger debounced save
        state.currentResume.template_id = templateId;
        renderSectionForm('design');
        updatePreview();
        saveResumeDebounced();
        showToast('Template switched!');
    } catch (err) { }
};

// saveResume: only updates in-memory state + refreshes preview. No DB write.
function saveResume() {
    const statusEl = document.querySelector('.save-status');
    if (statusEl) {
        statusEl.className = 'save-status info';
        statusEl.innerHTML = '<i data-lucide="eye"></i> Preview updated';
    }
    updatePreview();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

let previewAbortController = null;

// updatePreview: POSTs current in-memory content+design to the server for a stateless render.
function updatePreview() {
    if (!state.currentResume) return;
    const iframe = document.getElementById('resume-preview-iframe');
    if (!iframe) return;

    const body = JSON.stringify({
        content: state.currentResume.content,
        design: state.currentResume.design,
        templateId: state.currentResume.template_id
    });

    // Cancel previous pending request to avoid race conditions
    if (previewAbortController) {
        previewAbortController.abort();
    }
    previewAbortController = new AbortController();

    fetch(`${API_BASE}/export/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: previewAbortController.signal
    })
        .then(r => r.text())
        .then(html => {
            // Use srcdoc instead of document.write to prevent browser blocking/flashing
            iframe.srcdoc = html;
            setTimeout(() => {
                autoFitMobilePreview();
            }, 100);
        })
        .catch(err => {
            if (err.name === 'AbortError') return;
            console.error('Preview error:', err);
        });
}

// --- Mobile Zoom & Fit Handlers ---
let modalZoomMode = '100'; // '100' or 'fit'

function autoFitMobilePreview() {
    const iframe = document.getElementById('resume-preview-iframe');
    const container = document.querySelector('.preview-frame-container');
    
    if (window.innerWidth > 992) {
        // Desktop: Reset inline styles
        if (iframe) {
            iframe.style.transform = '';
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.position = '';
            iframe.style.top = '';
            iframe.style.left = '';
            iframe.style.marginLeft = '';
            iframe.style.transformOrigin = '';
        }
        if (container) {
            container.style.height = '100%';
        }
        return;
    }

    if (!iframe || !container) return;

    const containerWidth = container.clientWidth;
    if (containerWidth === 0) return; // Hidden or not layouted yet

    const baseWidth = 800;
    const baseHeight = 1130;
    const scale = containerWidth / baseWidth;

    iframe.style.width = `${baseWidth}px`;
    iframe.style.height = `${baseHeight}px`;
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top center';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '50%';
    iframe.style.marginLeft = `-${baseWidth / 2}px`;

    container.style.height = `${baseHeight * scale}px`;
}

function updateModalZoom() {
    const wrapper = document.getElementById('modal-iframe-wrapper');
    const container = document.querySelector('#zoom-check-modal .modal-body');
    if (!wrapper || !container) return;

    const baseWidth = 800;
    const baseHeight = 1130;

    if (modalZoomMode === 'fit') {
        const padding = 32;
        const availableWidth = container.clientWidth - padding;
        const scale = Math.min(1.0, availableWidth / baseWidth);
        
        wrapper.style.transform = `scale(${scale})`;
        wrapper.style.width = `${baseWidth * scale}px`;
        wrapper.style.height = `${baseHeight * scale}px`;
    } else {
        // 100% Size
        wrapper.style.transform = 'scale(1)';
        wrapper.style.width = `${baseWidth}px`;
        wrapper.style.height = `${baseHeight}px`;
    }
}

function setupMobileZoom() {
    const triggerBtn = document.getElementById('zoom-check-trigger-btn');
    const modal = document.getElementById('zoom-check-modal');
    const modalIframe = document.getElementById('modal-preview-iframe');
    const mainIframe = document.getElementById('resume-preview-iframe');

    if (triggerBtn && modal && modalIframe) {
        triggerBtn.onclick = () => {
            if (mainIframe) {
                modalIframe.srcdoc = mainIframe.srcdoc;
                modal.classList.remove('hidden');
                lucide.createIcons();
                
                // Allow modal to display and obtain layout size
                setTimeout(() => {
                    modalZoomMode = '100'; // Default to 100% check size
                    updateModalZoom();
                }, 100);
            }
        };

        const fitBtn = document.getElementById('modal-zoom-fit');
        const zoom100Btn = document.getElementById('modal-zoom-100');

        if (fitBtn) {
            fitBtn.onclick = () => {
                modalZoomMode = 'fit';
                updateModalZoom();
            };
        }

        if (zoom100Btn) {
            zoom100Btn.onclick = () => {
                modalZoomMode = '100';
                updateModalZoom();
            };
        }
    }

    // Bind window resize event
    window.addEventListener('resize', () => {
        if (state.activeView === 'editor') {
            autoFitMobilePreview();
            if (modal && !modal.classList.contains('hidden')) {
                updateModalZoom();
            }
        }
    });

    // Make sure we auto-fit when we load the main preview
    if (mainIframe) {
        mainIframe.addEventListener('load', () => {
            if (state.activeView === 'editor') {
                autoFitMobilePreview();
            }
        });
    }
}

// --- Utils ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Eagerly wake up the backend to prevent cold start delays
    fetch(`${API_BASE}/templates`).catch(() => { });

    lucide.createIcons();

    // Nav Actions — no auth required, go directly to templates
    document.getElementById('start-building-btn').onclick = () => switchView('templates');
    document.getElementById('hero-cta-btn').onclick = () => switchView('templates');
    document.getElementById('back-to-home').onclick = () => switchView('landing');
    document.getElementById('back-to-templates').onclick = () => switchView('templates');

    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.add('hidden');
        });
    });

    // Editor Actions — save to DB right before PDF generation
    document.getElementById('download-pdf-btn').onclick = async () => {
        generateClientPdf();
    };

    const mobileBottomBtn = document.getElementById('mobile-bottom-download-btn');
    if (mobileBottomBtn) {
        mobileBottomBtn.onclick = async () => {
            generateClientPdf();
        };
    }


    document.getElementById('ats-check-btn').onclick = async () => {
        // Open sidebar ATS tab
        document.querySelector('[data-panel="analysis-panel"]').click();

        const data = await apiFetch(`/resumes/${state.currentResume.id}/ats`);

        // Update Sidebar
        document.getElementById('sidebar-ats-percentage').innerText = `${data.ats.score}%`;
        const sidebarFeedback = document.getElementById('sidebar-ats-feedback');
        sidebarFeedback.innerHTML = data.ats.topImprovements.map(imp => `<p>💡 ${imp}</p>`).join('');

        showToast('ATS analysis updated in sidebar!', 'success');
    };

    // Sidebar Tabs Logic
    document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const panel = btn.dataset.panel;
            document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.sidebar-panels .panel').forEach(p => p.classList.remove('active'));
            document.getElementById(panel).classList.add('active');
        };
    });

    // Sidebar AI Scan
    document.getElementById('sidebar-ai-scan-btn').onclick = async () => {
        const btn = document.getElementById('sidebar-ai-scan-btn');
        const jdInput = document.getElementById('ats-jd-input').value.trim();
        const jobTitleInput = document.getElementById('ats-job-title-input').value.trim();
        btn.innerHTML = '<i data-lucide="loader"></i> Analysis...';
        lucide.createIcons();
        try {
            const result = await apiFetch('/ai/scan', {
                method: 'POST',
                body: JSON.stringify({ resumeData: state.currentResume.content, useAi: true, jobDescription: jdInput, targetJob: jobTitleInput })
            });
            document.getElementById('sidebar-ats-percentage').innerText = `${result.data.aiScore || result.data.score}%`;
            const sidebarFeedback = document.getElementById('sidebar-ats-feedback');
            sidebarFeedback.innerHTML = (result.data.topImprovements || []).map(imp => `<p>✨ ${imp}</p>`).join('');
            showToast('AI Deep Scan completed!', 'success');
        } catch (err) {
            showToast('AI Scan failed.', 'error');
        } finally {
            btn.innerHTML = '<i data-lucide="sparkles"></i> AI Deep Scan';
            lucide.createIcons();
        }
    };

    // Design Customizer Actions
    const primaryColorInput = document.getElementById('design-primary-color');
    const fontFamilySelect = document.getElementById('design-font-family');

    if (primaryColorInput) {
        primaryColorInput.oninput = () => updateDesignSetting('primaryColor', primaryColorInput.value);
    }
    if (fontFamilySelect) {
        fontFamilySelect.onchange = () => updateDesignSetting('fontFamily', fontFamilySelect.value);
    }

    // Initialize Mobile Zoom & Fit controls
    setupMobileZoom();
});

async function generateClientPdf() {
    if (!state.currentResume) return;

    const btn = document.getElementById('download-pdf-btn');
    const mobileBtn = document.getElementById('mobile-bottom-download-btn');
    const originalText = btn.innerHTML;
    const originalMobileText = mobileBtn ? mobileBtn.innerHTML : '';

    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Generating PDF...';
    if (mobileBtn) mobileBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Generating...';
    lucide.createIcons();

    let printFrame = null;
    try {
        // Fetch the full rendered HTML from the backend
        const htmlText = await fetch(`${API_BASE}/export/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: state.currentResume.content,
                templateId: state.currentResume.template_id,
                design: state.currentResume.design
            })
        }).then(r => r.text());

        // Create a hidden iframe — width must be exactly 794px (A4 @ 96dpi)
        // Keep it in viewport but transparent to avoid html2canvas offset and visibility bugs
        printFrame = document.createElement('iframe');
        printFrame.style.cssText = [
            'position:fixed',
            'left:0',
            'top:0',
            'width:794px',
            'height:1123px',
            'border:none',
            'opacity:0.01',
            'z-index:-9999',
            'pointer-events:none'
        ].join(';');
        document.body.appendChild(printFrame);

        // Write HTML and wait for the load event
        await new Promise(resolve => {
            printFrame.onload = resolve;
            printFrame.contentDocument.open();
            printFrame.contentDocument.write(htmlText);
            printFrame.contentDocument.close();
        });

        // Let fonts + images fully render inside the iframe
        await new Promise(r => setTimeout(r, 1200));

        const iframeDoc = printFrame.contentDocument;
        const iframeWin = printFrame.contentWindow;

        // Make sure the body and html have no extra scroll offset
        iframeDoc.documentElement.style.overflow = 'hidden';
        iframeDoc.body.style.overflow = 'hidden';
        iframeDoc.body.style.margin = '0';

        const element = iframeDoc.getElementById('pdf-content');
        if (!element) throw new Error('pdf-content element not found in rendered HTML');

        // Lock dimensions so html2canvas measures correctly
        element.style.cssText += ';width:794px !important;max-width:794px !important;margin:0 !important;';

        const opt = {
            margin: 0,
            filename: `${document.getElementById('resume-title-input').value || 'Resume'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                letterRendering: true,
                window: iframeWin, // Render within iframe context to preserve styles, fonts, and borders
                scrollX: 0,
                scrollY: 0,
                windowWidth: 794,
                windowHeight: 1123,
                width: 794,
                height: element.scrollHeight || 1123,
                x: 0,
                y: 0,
                logging: false,
                foreignObjectRendering: false,
                imageTimeout: 15000,
                onclone: (clonedDoc) => {
                    // Copy stylesheets and fonts from iframeDoc to clonedDoc so margins, padding, and fonts are preserved
                    const iframeHead = iframeDoc.head;
                    const targetContainer = clonedDoc.head || clonedDoc.body || clonedDoc.documentElement;
                    if (iframeHead && targetContainer) {
                        Array.from(iframeHead.querySelectorAll('style, link')).forEach(styleEl => {
                            targetContainer.appendChild(styleEl.cloneNode(true));
                        });
                    }

                    // Ensure cloned doc also has no scroll offsets
                    const clonedEl = clonedDoc.getElementById('pdf-content');
                    if (clonedEl) {
                        clonedEl.style.cssText += ';width:794px !important;max-width:794px !important;margin:0 !important;';
                    }
                }
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait',
                compress: true
            }
        };
        const pdfBlob = await html2pdf().set(opt).from(element).output('blob');
        const url = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = opt.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showToast('PDF downloaded successfully!', 'success');

    } catch (err) {
        console.error('PDF Generation Error:', err);
        showToast('Failed to generate PDF. Please try again.', 'error');
    } finally {
        if (printFrame && printFrame.parentNode) {
            document.body.removeChild(printFrame);
        }
        btn.innerHTML = originalText;
        if (mobileBtn) mobileBtn.innerHTML = originalMobileText;
        lucide.createIcons();
    }

    // Background save to sync DB
    try {
        await apiFetch(`/resumes/${state.currentResume.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                content: state.currentResume.content,
                design: state.currentResume.design,
                title: document.getElementById('resume-title-input').value
            })
        });
    } catch (e) { }
}

async function updateDesignSetting(key, value) {
    if (!state.currentResume) return;
    if (!state.currentResume.design) state.currentResume.design = {};
    state.currentResume.design[key] = value;
    updatePreview();
    saveResumeDebounced();
}

// saveResumeDebounced: performs a debounced PATCH to save the current state to the DB.
const saveResumeDebounced = debounce(async () => {
    if (!state.currentResume) return;
    const statusEl = document.querySelector('.save-status');
    if (statusEl) {
        statusEl.className = 'save-status saving';
        statusEl.innerHTML = '<i data-lucide="loader" class="spin" style="animation: spin 1.5s linear infinite; display: inline-block;"></i> Saving...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
        const titleEl = document.getElementById('resume-title-input');
        const titleVal = titleEl ? titleEl.value : (state.currentResume.title || 'Untitled Resume');

        await apiFetch(`/resumes/${state.currentResume.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                content: state.currentResume.content,
                design: state.currentResume.design,
                title: titleVal
            })
        });

        if (statusEl) {
            statusEl.className = 'save-status saved';
            statusEl.innerHTML = '<i data-lucide="check"></i> Saved';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } catch (err) {
        console.error('Failed to auto-save:', err);
        if (statusEl) {
            statusEl.className = 'save-status failed';
            statusEl.innerHTML = '<i data-lucide="alert-triangle"></i> Save failed';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}, 1500);
