/**
 * ResumePro Frontend Logic
 * Refactored for Anonymous Flow: Home -> Templates -> Editor
 */

// In production the site and API share one origin: Cloudflare forwards
// kompetenzen.in/api/* to the Cloud Run backend, so logins are shared too.
const PRODUCTION_API_URL = '/api';

const hostname = window.location.hostname || 'localhost';
const isLocalDev = hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.');

// Determine API_BASE dynamically to support the live site and local development
let API_BASE = PRODUCTION_API_URL;

const urlParams = new URLSearchParams(window.location.search);
const queryApi = urlParams.get('api');

// Overrides are for local development only. On the live site a link such as
// ?api=https://other.site would otherwise send the visitor's login token there.
if (isLocalDev && queryApi) {
    API_BASE = queryApi.replace(/\/$/, '');
} else if (isLocalDev && window.RESUME_API_BASE) {
    API_BASE = window.RESUME_API_BASE.replace(/\/$/, '');
} else if (isLocalDev && localStorage.getItem('RESUME_API_BASE')) {
    API_BASE = localStorage.getItem('RESUME_API_BASE').replace(/\/$/, '');
} else if (isLocalDev && window.location.port === '5000') {
    // When served by local backend on port 5000
    API_BASE = '/api';
} else if (isLocalDev) {
    // Local testing (VS Code Live Server on :5500, node server.js on :3000):
    // talk to the backend running on this machine, not the live API.
    API_BASE = 'http://localhost:5000/api';
} else {
    // Live site (kompetenzen.in) or standalone frontend dev
    API_BASE = PRODUCTION_API_URL;
}

console.log('[ResumePro] Active API endpoint:', API_BASE);


// --- State Management ---
const state = {
    resumes: [],
    currentResume: null,
    activeView: 'landing', // 'landing', 'dashboard', 'templates', 'editor'
    isSaving: false,
    // Save bookkeeping. isDirty means "the in-memory resume is ahead of the
    // database"; autosaveEnabled mirrors the toggle in the editor nav.
    isDirty: false,
    lastSavedAt: null,
    autosaveEnabled: true
};

// --- API Helpers ---

/**
 * Builds request headers carrying the Supabase access token.
 *
 * The preview and AI endpoints used to be called with a bare fetch and no
 * Authorization header, because the backend did not require one. Both are now
 * authenticated, so every call needs this.
 */
async function authedHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
        try {
            const token = await supabaseGetAccessToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch (e) { /* leave unauthenticated; the server will reject it */ }
    }
    return headers;
}

async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Auth is now a real Supabase session shared with the rest of the site —
    // the backend verifies this same access token instead of a locally-issued JWT.
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
        try {
            const token = await supabaseGetAccessToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch (e) { /* proceed unauthenticated */ }
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 401) {
                try {
                    localStorage.removeItem('token');
                    localStorage.removeItem('access_token');
                } catch (e) {}
            }
            const err = new Error(data.message || 'API Error');
            // Carry the status through so callers can tell "not signed in" apart.
            err.status = response.status;
            throw err;
        }
        return data;
    } catch (err) {
        if (!options.silent) {
            if (err.status === 401) {
                console.warn('[ResumePro] 401 Unauthorized for', endpoint);
            } else {
                showToast(err.message || 'API Error', 'error');
            }
        }
        throw err;
    }
}

// --- Navigation & View Logic ---
function switchView(viewName) {
    // Never walk away from the editor with unsaved autosaved work in memory.
    if (state.activeView === 'editor' && viewName !== 'editor') flushPendingSave();

    const isDashboard = viewName === 'dashboard';
    if (isDashboard) {
        viewName = 'templates';
    }

    state.activeView = viewName;
    updateViewUrl();
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.remove('hidden');
        if (isDashboard) {
            setTimeout(() => {
                const el = document.getElementById('saved-resumes-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 120);
        } else {
            window.scrollTo(0, 0);
        }
    }

    if (viewName === 'templates') {
        fetchTemplatesForPicker();
        loadSavedResumes();
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
window.switchView = switchView;

async function getResumeUser() {
    try {
        if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
            const sbUser = await supabaseGetSessionUser();
            if (sbUser && (sbUser.name || sbUser.email)) {
                return sbUser;
            }
        }
    } catch (e) {}

    try {
        const raw = localStorage.getItem('kompetenzen_google_user') ||
                    localStorage.getItem('kompetenzen_user') ||
                    localStorage.getItem('user');
        if (raw) {
            const u = JSON.parse(raw);
            if (u && (u.name || u.email)) {
                return {
                    id: u.id || u.email || '',
                    name: u.name || (u.email ? u.email.split('@')[0] : 'Candidate'),
                    email: u.email || '',
                    phone: u.phone || ''
                };
            }
        }
    } catch (e) {}

    return null;
}

function getUserResumeCacheKey(user) {
    if (!user) return null;
    const identifier = user.id || user.email;
    if (!identifier) return null;
    return 'resumepro_cached_resumes_' + String(identifier).trim().toLowerCase();
}

// Clean up legacy global cache to prevent old guest resumes from displaying
try {
    localStorage.removeItem('resumepro_cached_resumes');
} catch (e) {}


async function syncNavUserProfile() {
    const user = await getResumeUser();
    const badges = document.querySelectorAll('.nav-user-badge');
    const loginBtns = document.querySelectorAll('.nav-signin-btn');

    if (user && (user.name || user.email)) {
        const displayName = user.name || (user.email ? user.email.split('@')[0] : 'Candidate');
        const displayInitial = (displayName || 'C')[0].toUpperCase();
        const displayEmail = user.email || '';

        badges.forEach(badge => {
            badge.style.display = 'inline-block';
            const nameEl = badge.querySelector('.nav-user-name');
            const avatarEl = badge.querySelector('.nav-user-avatar');
            const menuNameEl = badge.querySelector('.nav-user-menu-name');
            const menuEmailEl = badge.querySelector('.nav-user-menu-email');

            if (nameEl) nameEl.textContent = displayName;
            if (avatarEl) avatarEl.textContent = displayInitial;
            if (menuNameEl) menuNameEl.textContent = displayName;
            if (menuEmailEl) menuEmailEl.textContent = displayEmail;
        });

        loginBtns.forEach(btn => {
            btn.style.display = 'none';
        });
    } else {
        badges.forEach(badge => {
            badge.style.display = 'none';
            badge.classList.remove('open');
        });
        loginBtns.forEach(btn => {
            btn.style.display = 'inline-flex';
        });
    }
}
window.syncNavUserProfile = syncNavUserProfile;

window.toggleNavUserDropdown = function (e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const target = e && e.currentTarget ? e.currentTarget : null;
    const badge = target ? target.closest('.nav-user-badge') : document.querySelector('.nav-user-badge');
    if (badge) {
        const wasOpen = badge.classList.contains('open');
        document.querySelectorAll('.nav-user-badge.open').forEach(b => b.classList.remove('open'));
        if (!wasOpen) {
            badge.classList.add('open');
        }
    }
};

window.openAuthModal = function (mode = 'choice') {
    if (typeof clearAuthInputs === 'function') clearAuthInputs();
    if (mode === 'direct-email' || mode === 'signup') {
        if (typeof window.showAuthStep === 'function') window.showAuthStep('email', 'signup');
    } else if (mode === 'login' || mode === 'direct-login') {
        if (typeof window.showAuthStep === 'function') window.showAuthStep('email', 'login');
    } else {
        if (typeof window.showAuthStep === 'function') window.showAuthStep('choice');
    }
    const modal = document.getElementById('otp-auth-modal');
    if (modal) modal.classList.remove('hidden');
};

window.openAuthModalForNav = function () {
    window.openAuthModal('choice');
};

window.handleSignOut = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof window.logout === 'function') {
        await window.logout();
    }
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-user-badge')) {
        document.querySelectorAll('.nav-user-badge.open').forEach(b => b.classList.remove('open'));
    }
});

async function updateLogoutButtons() {
    const isAuth = typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()
        ? !!(await supabaseGetSessionUser())
        : false;

    const templatesLogout = document.getElementById('logout-btn-templates');
    const editorLogout = document.getElementById('logout-btn-editor');
    const dashboardLogout = document.getElementById('logout-btn-dashboard');

    if (templatesLogout) templatesLogout.style.display = isAuth ? 'inline-flex' : 'none';
    if (editorLogout) editorLogout.style.display = isAuth ? 'inline-flex' : 'none';
    if (dashboardLogout) dashboardLogout.style.display = isAuth ? 'inline-flex' : 'none';

    await syncNavUserProfile();
}

window.logout = async () => {
    if (typeof supabaseSignOut === 'function') await supabaseSignOut();
    if (typeof clearAuthInputs === 'function') clearAuthInputs();
    // Everything that could show this person's details to the next user of a
    // shared computer (matches PER_USER_KEYS in the main site's js/auth-modal.js).
    ['token', 'access_token', 'kompetenzen_user', 'user', 'kompetenzen_google_user', 'kompetenzen_candidate_profile',
     'kompetenzen_last_auth_email', 'kompetenzen_applied_jobs', 'kompetenzen_career_pass', 'kompetenzen_user_resume_name',
     'kompetenzen_registered_users', 'kompetenzen_enrollments', 'resumepro_cached_resumes'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
    });
    state.resumes = [];
    state.currentResume = null;
    const section = document.getElementById('saved-resumes-section');
    if (section) section.style.display = 'none';
    showToast('Logged out successfully', 'success');
    await syncNavUserProfile();
    updateLogoutButtons();
    loadSavedResumes();
    switchView('landing');
};

// --- Template Picker Logic ---

// Helper: converts a relative thumbnail path from the API into a working URL.
// Assets live in frontend/assets/ relative to the site root.
function resolveThumb(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // If already prefixed with frontend/ leave it alone
    if (url.startsWith('frontend/')) return url + '?v=7';
    // Bare path like "assets/classic_serif.png" → prepend frontend/
    return 'frontend/' + url + '?v=7';
}

async function fetchTemplatesForPicker() {
    const grid = document.getElementById('template-picker-grid');
    if (!grid) return;

    // Card badges, keyed by template name. Template ids are database UUIDs,
    // so they cannot be hard-coded here.
    const metaMap = {
        'Classic Serif': {
            badge: 'Corporate & Legal',
            badgeIcon: 'briefcase',
            ats: 'ATS 99%',
            cta: 'Use Classic Serif'
        },
        'Minimalist Executive': {
            badge: 'Modern & Tech',
            badgeIcon: 'laptop',
            ats: 'ATS 100%',
            cta: 'Use Minimalist'
        },
        'Academic Professional': {
            badge: 'Academic & Research',
            badgeIcon: 'graduation-cap',
            ats: 'ATS 98%',
            cta: 'Use Academic Pro'
        }
    };

    // The server decides which templates are offered (see seedTemplates.js).
    // This used to filter by the old SQLite ids ('tmpl_classic_1'…), which no
    // Supabase template has, so the picker rendered nothing.
    const renderTemplates = (templates) => {
        const validTemplates = templates || [];
        grid.innerHTML = validTemplates.map(t => {
            const meta = metaMap[t.name] || {
                badge: 'ATS-Friendly',
                badgeIcon: 'file-text',
                ats: 'ATS 99%',
                cta: 'Use Template'
            };
            const isFeatured = !!meta.featured;
            return `
            <div class="template-card ${isFeatured ? 'featured-template' : ''}" onclick="startBuildingWithTemplate('${t.id}')">
                <div class="template-thumb">
                    <div class="thumb-header-chips">
                        <span class="chip-category"><i data-lucide="${meta.badgeIcon}"></i> ${meta.badge}</span>
                        <span class="chip-ats"><i data-lucide="shield-check"></i> ${meta.ats}</span>
                    </div>
                    <div class="paper-preview-container">
                        ${t.thumbnail_url ? `<img src="${resolveThumb(t.thumbnail_url)}" alt="${t.name}" loading="lazy">` : ''}
                    </div>
                    <div class="template-card-hover-overlay">
                        <button type="button" class="quick-select-btn">
                            <i data-lucide="sparkles"></i>
                            <span>Select Design</span>
                        </button>
                    </div>
                </div>
                <div class="template-info">
                    <div class="template-text-group">
                        <h3 class="template-title">${t.name}</h3>
                        <p class="template-description">${t.description || 'Professional & ATS-friendly layout'}</p>
                    </div>
                    <div class="template-action-btn">
                        <span>${meta.cta}</span>
                        <i data-lucide="arrow-right"></i>
                    </div>
                </div>
            </div>
            `;
        }).join('');
        lucide.createIcons();
    };

    // 1. Immediately render client templates (built-in or cached) so the UI is NEVER blank or broken
    const clientTemplates = (window.ResumeRenderer && window.ResumeRenderer.getClientTemplates()) || [];
    if (clientTemplates.length) {
        renderTemplates(clientTemplates);
    } else {
        grid.innerHTML = '<div style="text-align: center; width: 100%; grid-column: 1 / -1; padding: 2rem; color: #64748b;">Loading templates…</div>';
    }

    // 2. Sync from Supabase in the background
    if (window.ResumeRenderer && window.ResumeRenderer.syncTemplatesFromSupabase) {
        window.ResumeRenderer.syncTemplatesFromSupabase().then(sbTemplates => {
            if (Array.isArray(sbTemplates) && sbTemplates.length) {
                renderTemplates(sbTemplates);
            }
        }).catch(err => {
            console.warn('[ResumePro] Supabase template fetch note:', err);
        });
    }

    // 3. Optional local backend API check (silent if offline)
    try {
        const data = await apiFetch('/templates', { silent: true });
        if (data && data.templates && data.templates.length) {
            if (window.ResumeRenderer) window.ResumeRenderer.cacheTemplates(data.templates);
            renderTemplates(data.templates);
        }
    } catch (err) {
        // Silently ignored — built-in templates are already displayed
    }
}

let pendingTemplateId = null;

function clearAuthInputs() {
    const sForm = document.getElementById('signup-form');
    if (sForm) sForm.reset();
    const lForm = document.getElementById('login-form');
    if (lForm) lForm.reset();
    const oldForm = document.getElementById('auth-form');
    if (oldForm) oldForm.reset();
    ['signup-name', 'signup-email', 'signup-phone', 'signup-password', 'login-email', 'login-password', 'auth-name', 'auth-phone', 'auth-email', 'auth-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const inlineMsg = document.getElementById('auth-inline-msg');
    if (inlineMsg) inlineMsg.style.display = 'none';
}
window.clearAuthInputs = clearAuthInputs;

function createDefaultResumeData(templateId, user) {
    const userName = (user && user.name && user.name.trim()) || '';
    const userEmail = (user && user.email && user.email.trim()) || '';
    const userPhone = (user && user.phone && user.phone.trim()) || '';
    return {
        id: 'res_' + Date.now(),
        title: userName ? `${userName}'s Resume` : 'My Resume',
        template_id: templateId || 'tmpl_classic_1',
        isLocal: true,
        design: {
            primaryColor: '#2563eb',
            fontFamily: 'Inter, sans-serif',
            fontSize: 10,
            lineHeight: 1.4,
            margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 }
        },
        sectionOrder: ['contact', 'summary', 'experience', 'education', 'skills', 'projects'],
        content: {
            contact: {
                name: userName,
                title: '',
                email: userEmail,
                phone: userPhone,
                location: '',
                linkedin: '',
                github: '',
                website: ''
            },
            summary: '',
            experience: [],
            education: [],
            skills: [],
            projects: [],
            certifications: [],
            additional: [],
            languages: []
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}


// Populate the editor before rendering; both API and direct-save paths use this content.
async function autofillResumeFromProfile(resume, user, isNew = false) {
    if (!user?.id || resume.user_id !== user.id || typeof ProfileResumeSync === 'undefined' || typeof supabaseClient === 'undefined') return false;
    try {
        const profile = await ProfileResumeSync.readProfile(supabaseClient, user.id);
        if (!profile) return false;
        const original = JSON.stringify(resume.content || {});
        const source = isNew ? { ...resume.content, contact: {} } : resume.content;
        const merged = ProfileResumeSync.profileToResume(source, profile);
        if (isNew) {
            for (const key of ['name','email','phone']) if (!merged.contact[key]) merged.contact[key] = resume.content.contact?.[key] || '';
        }
        resume.content = merged;
        return JSON.stringify(merged) !== original;
    } catch (error) {
        console.warn('Profile autofill unavailable. Existing resume kept.');
        showToast('Your profile details could not be loaded. You can still edit your resume.', 'info');
        return false;
    }
}

async function startBuildingWithTemplate(templateId) {
    // Check if user is signed in
    const user = await getResumeUser();
    if (!user) {
        pendingTemplateId = templateId;
        if (typeof clearAuthInputs === 'function') clearAuthInputs();
        window.openAuthModal('choice');
        showToast('Please sign in to continue.', 'info');
        return;
    }
    pendingTemplateId = null;

    try {
        // Immediately blank the preview so old content never shows
        const iframe = document.getElementById('resume-preview-iframe');
        if (iframe) iframe.src = 'about:blank';
        state.currentResume = null;

        showToast('Preparing your editor...', 'info');

        const initialData = createDefaultResumeData(templateId, user);
        initialData.user_id = user.id || user.email;
        await autofillResumeFromProfile(initialData, user, true);
        // Generate valid UUID for Supabase compatibility
        const newUuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        initialData.id = newUuid;

        let createdResume = null;

        // 1. Direct Supabase insert if authenticated
        if (user.id && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data: sbCreated, error: sbCreateErr } = await supabaseClient
                    .from('resumes')
                    .insert({
                        id: newUuid,
                        user_id: user.id,
                        template_id: templateId || null,
                        title: initialData.title,
                        content: initialData.content,
                        design: initialData.design,
                        section_order: initialData.sectionOrder,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select('*')
                    .single();
                if (!sbCreateErr && sbCreated) {
                    createdResume = {
                        ...sbCreated,
                        content: sbCreated.content || initialData.content,
                        design: sbCreated.design || initialData.design,
                        sectionOrder: sbCreated.section_order || initialData.sectionOrder
                    };
                }
            } catch (sbErr) {
                console.warn('Direct Supabase resume creation error:', sbErr);
            }
        }

        // 2. Secondary API call attempt
        if (!createdResume) {
            try {
                const data = await apiFetch('/resumes', {
                    method: 'POST',
                    body: JSON.stringify({
                        title: initialData.title,
                        templateId: templateId,
                        content: initialData.content,
                        design: initialData.design,
                        sectionOrder: initialData.sectionOrder
                    }),
                    silent: true
                });
                if (data && data.resume && data.resume.id) {
                    createdResume = data.resume;
                    createdResume.user_id = user.id || user.email;
                }
            } catch (apiErr) {
                console.warn('Backend API /resumes call failed, using local/Supabase resume:', apiErr);
            }
        }

        const finalResume = createdResume || initialData;
        finalResume.user_id = user.id || user.email;

        // Add to state and save to user-scoped private cache
        state.resumes = [finalResume, ...(state.resumes || [])];
        const cacheKey = getUserResumeCacheKey(user);
        if (cacheKey) {
            try { localStorage.setItem(cacheKey, JSON.stringify(state.resumes)); } catch (e) {}
        }

        await openEditor(finalResume.id, finalResume);
    } catch (err) {
        console.error('Failed to open template:', err);
        showToast('Failed to open template. Please try again.', 'error');
    }
}

window.startBuildingWithTemplate = startBuildingWithTemplate;

/**
 * AI Write and AI Deep Scan are free, but need a signed-in student (the API
 * rejects anonymous calls to protect the AI quota).
 */
async function requireAiAccess() {
    const user = await getResumeUser();
    if (user) return true;
    if (typeof clearAuthInputs === 'function') clearAuthInputs();
    if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('choice');
    }
    showToast('Please sign in to use AI writing features.', 'info');
    return false;
}
window.requireAiAccess = requireAiAccess;

/**
 * Keeps the open view consistent with the visitor's current access.
 */
async function enforceBuilderAccess() {
    const user = await getResumeUser();
    const signedIn = !!user;

    if (!signedIn && state.activeView === 'editor') {
        state.currentResume = null;
        const iframe = document.getElementById('resume-preview-iframe');
        if (iframe) {
            iframe.removeAttribute('srcdoc');
            iframe.src = 'about:blank';
        }
        switchView('landing');
    }
    updateLogoutButtons();
}
window.enforceBuilderAccess = enforceBuilderAccess;



// --- NextRaise-Style 2-Step Auth Logic (Matching Job Listings) ---
let isSignupMode = true; // Default mode for the form

window.showAuthStep = function (step, mode = 'signup') {
    const stepChoice = document.getElementById('auth-step-choice');
    const stepEmail = document.getElementById('auth-step-email');
    const inlineMsg = document.getElementById('auth-inline-msg');
    if (inlineMsg) inlineMsg.style.display = 'none';

    if (step === 'email') {
        if (stepChoice) stepChoice.style.display = 'none';
        if (stepEmail) stepEmail.style.display = 'block';
        window.switchAuthTab(mode);
    } else {
        if (stepChoice) stepChoice.style.display = 'block';
        if (stepEmail) stepEmail.style.display = 'none';
    }
};

window.switchAuthTab = function (mode) {
    const signupBtn = document.getElementById('tab-signup-btn');
    const loginBtn = document.getElementById('tab-login-btn');
    const signupForm = document.getElementById('signup-form');
    const loginForm = document.getElementById('login-form');
    const titleEl = document.getElementById('auth-modal-title');
    const subtitleEl = document.getElementById('auth-modal-subtitle');
    const inlineMsg = document.getElementById('auth-inline-msg');

    if (inlineMsg) inlineMsg.style.display = 'none';

    if (mode === 'login') {
        isSignupMode = false;
        if (signupBtn) {
            signupBtn.style.background = 'transparent';
            signupBtn.style.color = '#64748b';
            signupBtn.style.boxShadow = 'none';
        }
        if (loginBtn) {
            loginBtn.style.background = '#1947FF';
            loginBtn.style.color = '#ffffff';
            loginBtn.style.boxShadow = '0 2px 6px rgba(25,71,255,0.25)';
        }
        if (signupForm) signupForm.style.display = 'none';
        if (loginForm) loginForm.style.display = 'flex';
        if (titleEl) titleEl.textContent = 'Welcome Back';
        if (subtitleEl) subtitleEl.textContent = 'Log in to access and edit your resumes';
        const loginEmail = document.getElementById('login-email');
        if (loginEmail) loginEmail.focus();
    } else {
        isSignupMode = true;
        if (signupBtn) {
            signupBtn.style.background = '#1947FF';
            signupBtn.style.color = '#ffffff';
            signupBtn.style.boxShadow = '0 2px 6px rgba(25,71,255,0.25)';
        }
        if (loginBtn) {
            loginBtn.style.background = 'transparent';
            loginBtn.style.color = '#64748b';
            loginBtn.style.boxShadow = 'none';
        }
        if (signupForm) signupForm.style.display = 'flex';
        if (loginForm) loginForm.style.display = 'none';
        if (titleEl) titleEl.textContent = 'Create Your Account';
        if (subtitleEl) subtitleEl.textContent = 'Enter your details to create and download your resume';
        const signupName = document.getElementById('signup-name');
        if (signupName) signupName.focus();
    }
};

window.toggleAuthPasswordVisibility = function (inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
};
window.togglePasswordVisibility = window.toggleAuthPasswordVisibility;

window.showAuthMessage = function (msg, isError = false) {
    const msgEl = document.getElementById('auth-inline-msg');
    if (!msgEl) return;
    msgEl.textContent = msg;
    msgEl.style.display = 'block';
    if (isError) {
        msgEl.style.background = '#FEE2E2';
        msgEl.style.color = '#B91C1C';
        msgEl.style.border = '1px solid #FECACA';
    } else {
        msgEl.style.background = '#DCFCE7';
        msgEl.style.color = '#15803D';
        msgEl.style.border = '1px solid #BBF7D0';
    }
};

window.closeAuthModal = function () {
    const modal = document.getElementById('otp-auth-modal');
    if (modal) modal.classList.add('hidden');
    if (typeof clearAuthInputs === 'function') clearAuthInputs();
    window.showAuthStep('choice');
};

function setAuthMode(signup) {
    window.switchAuthTab(signup ? 'signup' : 'login');
}
window.setAuthMode = setAuthMode;

window.toggleAuthMode = function () {
    window.switchAuthTab(isSignupMode ? 'login' : 'signup');
};

window.handleForgotPassword = function () {
    showToast('Password reset is not available yet. Please contact support if you are locked out.', 'info');
};

// Google sign-in redirect via Supabase
window.continueWithGoogle = async function () {
    if (!(typeof isSupabaseConfigured === 'function' && isSupabaseConfigured())) {
        window.showAuthMessage('Google sign-in is temporarily unavailable. Please try again shortly.', true);
        showToast('Google sign-in is temporarily unavailable. Please try again shortly.', 'error');
        return;
    }

    const btn = document.getElementById('lead-google-btn') || document.getElementById('google-auth-btn');
    const textEl = document.getElementById('lead-google-btn-text');
    const originalContent = textEl ? textEl.textContent : (btn ? btn.innerHTML : '');

    if (textEl) {
        textEl.textContent = 'Connecting with Google...';
    } else if (btn) {
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Connecting to Google...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    if (btn) btn.disabled = true;

    try {
        if (pendingTemplateId) {
            localStorage.setItem('resumepro_pending_template', pendingTemplateId);
        }
        await supabaseSignInWithGoogle(window.location.href);
        // Browser is now navigating to Google OAuth
    } catch (err) {
        const msg = (err && err.message) || 'Google sign-in failed. Please try again.';
        window.showAuthMessage(msg, true);
        showToast(msg, 'error');
        if (textEl) {
            textEl.textContent = originalContent;
        } else if (btn) {
            btn.innerHTML = originalContent;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        if (btn) btn.disabled = false;
    }
};

// Picks an auth session back up (e.g. after a Google OAuth redirect bounces back to this
// page), updates profile UI, and resumes building whichever template the user selected before signing in.
async function resumeAuthSessionIfAny() {
    try {
        const user = await getResumeUser();
        if (!user) return;
        document.getElementById('otp-auth-modal')?.classList.add('hidden');
        if (typeof clearAuthInputs === 'function') clearAuthInputs();
        if (typeof syncNavUserProfile === 'function') await syncNavUserProfile();
        updateLogoutButtons();

        // Clean up OAuth hash parameters so URL remains clean and stable
        if (window.location.hash && window.location.hash.includes('access_token=')) {
            try {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            } catch (e) {}
        }

        const pendingId = localStorage.getItem('resumepro_pending_template');
        if (pendingId) {
            localStorage.removeItem('resumepro_pending_template');
            startBuildingWithTemplate(pendingId);
        }
    } catch (e) { /* no session yet, nothing to resume */ }
}


function initAppAuth() {
    updateLogoutButtons();
    resumeAuthSessionIfAny();
    window.showAuthStep('choice');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppAuth);
} else {
    initAppAuth();
}

window.submitAuth = async function (mode) {
    if (!mode) mode = isSignupMode ? 'signup' : 'login';
    const isSignup = mode === 'signup';

    const inlineMsg = document.getElementById('auth-inline-msg');
    if (inlineMsg) inlineMsg.style.display = 'none';

    let name = '';
    let email = '';
    let phone = '';
    let password = '';
    let btn = null;

    if (isSignup) {
        name = (document.getElementById('signup-name')?.value || '').trim();
        email = (document.getElementById('signup-email')?.value || '').trim().toLowerCase();
        phone = (document.getElementById('signup-phone')?.value || '').trim();
        password = document.getElementById('signup-password')?.value || '';
        btn = document.getElementById('signup-submit-btn');

        if (!name) return window.showAuthMessage('Please enter your full name', true);
        if (!email) return window.showAuthMessage('Please enter your email address', true);
        if (!phone) return window.showAuthMessage('Please enter your mobile number', true);
        if (!password || password.length < 6) return window.showAuthMessage('Please enter a password with at least 6 characters', true);
    } else {
        email = (document.getElementById('login-email')?.value || '').trim().toLowerCase();
        password = document.getElementById('login-password')?.value || '';
        btn = document.getElementById('login-submit-btn');

        if (!email) return window.showAuthMessage('Please enter your email address', true);
        if (!password) return window.showAuthMessage('Please enter your password', true);
    }

    if (!(typeof isSupabaseConfigured === 'function' && isSupabaseConfigured())) {
        window.showAuthMessage('Authentication is temporarily unavailable. Please try again shortly.', true);
        return;
    }

    const origText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Processing...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
        let authResult = null;
        if (isSignup) {
            authResult = await supabaseSignUp(name, email, phone, password);
        } else {
            authResult = await supabaseSignIn(email, password);
        }

        // Get the real Supabase user UUID so Supabase saves work correctly
        let supabaseUserId = '';
        let supabaseAccessToken = '';
        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const { data: sessionData } = await supabaseClient.auth.getSession();
                if (sessionData && sessionData.session) {
                    supabaseUserId = sessionData.session.user.id || '';
                    supabaseAccessToken = sessionData.session.access_token || '';
                }
            }
        } catch (e) {}

        const userObj = {
            id: supabaseUserId,  // CRITICAL: real Supabase UUID for RLS to work
            name: (authResult && authResult.name) || name || (email.split('@')[0]) || 'Student',
            email: email,
            phone: phone || (authResult && authResult.phone) || '',
            authType: isSignup ? 'Direct Signup' : 'Direct Login',
            loginTime: new Date().toISOString()
        };
        try {
            localStorage.setItem('kompetenzen_user', JSON.stringify(userObj));
            localStorage.setItem('user', JSON.stringify(userObj));
            localStorage.setItem('kompetenzen_google_user', JSON.stringify(userObj));
            localStorage.setItem('kompetenzen_last_auth_email', email);
            if (supabaseAccessToken) {
                localStorage.setItem('token', supabaseAccessToken);
                localStorage.setItem('access_token', supabaseAccessToken);
            }
        } catch (e) {}

        if (isSignup && authResult && authResult.needsConfirmation) {
            window.showAuthMessage(`✉️ Confirmation email sent! Please check ${email} and click the link to activate your account.`, false);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Email Sent — Check Inbox';
            }
            return;
        }

        window.showAuthMessage(isSignup ? '✓ Account created successfully!' : '✓ Logged in successfully!', false);

        setTimeout(async () => {
            window.closeAuthModal();
            showToast('Authentication successful!', 'success');
            if (typeof syncNavUserProfile === 'function') await syncNavUserProfile();
            updateLogoutButtons();

            if (pendingTemplateId) {
                const id = pendingTemplateId;
                pendingTemplateId = null;
                startBuildingWithTemplate(id);
            } else {
                switchView('templates');
            }
        }, 400);

    } catch (err) {
        const msg = (err && err.message) || 'Authentication failed. Please check your credentials.';
        if (isSignup && /already registered|already exists/i.test(msg)) {
            window.switchAuthTab('login');
            const loginEmail = document.getElementById('login-email');
            if (loginEmail) loginEmail.value = email;
            const pwdInput = document.getElementById('login-password');
            if (pwdInput) {
                pwdInput.value = '';
                pwdInput.focus();
            }
            window.showAuthMessage('This email is already registered. Please log in.', true);
        } else {
            window.showAuthMessage(msg, true);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origText;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
};

// --- Editor Logic ---
async function openEditor(id, preloadedResume = null) {
    try {
        // Blank the iframe immediately before fetching — prevents ANY stale content flash
        const iframe = document.getElementById('resume-preview-iframe');
        if (iframe) {
            iframe.removeAttribute('srcdoc');
            iframe.src = 'about:blank';
        }

        if (preloadedResume) {
            state.currentResume = preloadedResume;
        } else {
            const user = await getResumeUser();
            const cacheKey = getUserResumeCacheKey(user);
            let draft = null;
            try {
                const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
                draft = cached.find(r => r.id === id && r._needsSync);
            } catch (e) {}
            let loaded = draft;
            try {
                const data = loaded ? null : await apiFetch(`/resumes/${id}`, { silent: true });
                if (data && data.resume) loaded = data.resume;
            } catch (fetchErr) {
                console.warn('API resume fetch failed, checking Supabase/local cache:', fetchErr);
            }

            if (!loaded && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && typeof supabaseClient !== 'undefined' && supabaseClient) {
                try {
                    const { data: sbResume, error: sbErr } = await supabaseClient
                        .from('resumes')
                        .select('*')
                        .eq('id', id)
                        .maybeSingle();
                    if (!sbErr && sbResume) {
                        loaded = {
                            ...sbResume,
                            sectionOrder: Array.isArray(sbResume.section_order) ? sbResume.section_order : (typeof sbResume.section_order === 'string' ? JSON.parse(sbResume.section_order || '[]') : []),
                            atsFeedback: Array.isArray(sbResume.ats_feedback) ? sbResume.ats_feedback : (typeof sbResume.ats_feedback === 'string' ? JSON.parse(sbResume.ats_feedback || '[]') : []),
                            isPublic: Boolean(sbResume.is_public),
                            content: typeof sbResume.content === 'string' ? JSON.parse(sbResume.content || '{}') : (sbResume.content || {}),
                            design: typeof sbResume.design === 'string' ? JSON.parse(sbResume.design || '{}') : (sbResume.design || {})
                        };
                    }
                } catch (sbE) {}
            }

            if (!loaded) {
                const local = (state.resumes || []).find(r => r.id === id);
                if (local) loaded = local;
            }

            if (!loaded) {
                const user = await getResumeUser();
                const cacheKey = getUserResumeCacheKey(user);
                if (cacheKey) {
                    try {
                        const raw = localStorage.getItem(cacheKey);
                        if (raw) {
                            const list = JSON.parse(raw);
                            const found = list.find(r => r.id === id);
                            if (found) loaded = found;
                        }
                    } catch (e) {}
                }
            }

            if (loaded) {
                state.currentResume = loaded;
            } else {
                throw new Error('Resume not found');
            }
        }

        const editorUser = await getResumeUser();
        const profileAutofilled = await autofillResumeFromProfile(state.currentResume, editorUser);

        // Use 'editor' view directly, not templates, so my cleanup code in switchView doesn't wipe state
        state.activeView = 'editor';
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const editorView = document.getElementById('editor-view');
        if (editorView) editorView.classList.remove('hidden');
        window.scrollTo(0, 0);
        if (window.updateBackgroundView) window.updateBackgroundView('editor');
        updateViewUrl();

        setupEditor();

        // Autofilled details and recovered drafts need to be saved.
        state.isDirty = Boolean(profileAutofilled || state.currentResume._needsSync || state.currentResume.isLocal);
        if (profileAutofilled) {
            state.currentResume._needsSync = true;
            cacheResumeDraft(state.currentResume);
            if (state.autosaveEnabled) scheduleAutosave();
            showToast('Missing details filled from your profile. Review them before exporting.', 'info');
        }
        state.lastSavedAt = (state.currentResume && state.currentResume.updated_at) ? new Date(state.currentResume.updated_at) : null;
        syncAutosaveToggle();
        setSaveStatus(state.isDirty ? 'dirty' : 'saved');

        updatePreview();
    } catch (err) {
        console.error(err);
        showToast('Failed to load editor. Please try again.', 'error');
    }
}

function setupEditor() {
    const r = state.currentResume;
    const contactName = (r.content && r.content.contact && r.content.contact.name ? r.content.contact.name : '').trim();
    const isDefaultTitle = !r.title ||
        r.title.toLowerCase() === 'my new resume' ||
        r.title.toLowerCase() === 'untitled resume';

    if (isDefaultTitle && contactName) {
        r.title = contactName;
        r._autoNamed = true;
    }

    const titleInput = document.getElementById('resume-title-input');
    if (titleInput) {
        titleInput.value = r.title;
    }

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

    // Restore the section order this resume was saved with; anything the saved
    // order does not mention keeps its default position at the end.
    const savedOrder = Array.isArray(r.sectionOrder) ? r.sectionOrder : [];
    const orderedSections = [
        ...savedOrder.map(key => sections.find(s => s.key === key)).filter(Boolean),
        ...sections.filter(s => !savedOrder.includes(s.key))
    ];

    // Renaming the resume is an edit like any other, so it has to mark the
    // resume dirty — otherwise a title-only change never reached the database.
    if (titleInput && !titleInput.dataset.dirtyBound) {
        titleInput.dataset.dirtyBound = 'true';
        titleInput.addEventListener('input', () => {
            if (state.currentResume) {
                state.currentResume._autoNamed = false;
                state.currentResume.title = titleInput.value;
            }
            markDirty();
        });
    }

    const sectionContainer = document.getElementById('editor-sections');
    sectionContainer.innerHTML = orderedSections.map(s => `
        <button class="section-nav-btn" data-section="${s.key}" draggable="${!['contact', 'design'].includes(s.key)}">
            <i data-lucide="${s.icon}" class="drag-handle"></i>
            <span>${s.label}</span>
        </button>
    `).join('');
    lucide.createIcons();

    sectionContainer.querySelectorAll('.section-nav-btn').forEach(btn => {
        btn.onclick = () => {
            state.lastActiveSection = btn.dataset.section;
            if (typeof returnToResumeEditor === 'function') {
                returnToResumeEditor(btn.dataset.section);
            } else {
                renderSectionForm(btn.dataset.section);
            }
        };

        btn.addEventListener('dragstart', (e) => {
            btn.classList.add('dragging');
            e.dataTransfer.setData('text/plain', btn.dataset.section);
        });

        btn.addEventListener('dragend', () => {
            btn.classList.remove('dragging');
            updateSectionsOrder();
        });
    });

    sectionContainer.ondragover = (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(sectionContainer, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (!dragging) return;
        if (afterElement == null) {
            sectionContainer.insertBefore(dragging, sectionContainer.querySelector('[data-section="design"]'));
        } else {
            sectionContainer.insertBefore(dragging, afterElement);
        }
    };

    renderSectionForm('contact');
    setupPreviewStudioToolbar();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.section-nav-btn[draggable="true"]:not(.dragging)')];
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
    state.currentResume.sectionOrder = ['contact', ...newOrder.filter(key => key !== 'contact' && key !== 'design')];

    // Save order
    markDirty();

    // Update preview (templates will need to support this)
    updatePreview();
}


function setupPreviewStudioToolbar() {
    let zoomLevel = 1;
    const container = document.getElementById('preview-frame-container');
    const zoomLabel = document.getElementById('preview-zoom-label');
    const updateZoom = (z) => {
        zoomLevel = Math.min(Math.max(z, 0.45), 1.6);
        if (container) {
            container.style.transform = `scale(${zoomLevel})`;
            container.style.transformOrigin = 'top center';
        }
        if (zoomLabel) zoomLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
    };

    const btnIn = document.getElementById('preview-zoom-in');
    if (btnIn && !btnIn.dataset.bound) {
        btnIn.dataset.bound = 'true';
        btnIn.onclick = () => updateZoom(zoomLevel + 0.1);
    }
    const btnOut = document.getElementById('preview-zoom-out');
    if (btnOut && !btnOut.dataset.bound) {
        btnOut.dataset.bound = 'true';
        btnOut.onclick = () => updateZoom(zoomLevel - 0.1);
    }
    const btnFit = document.getElementById('preview-zoom-fit');
    if (btnFit && !btnFit.dataset.bound) {
        btnFit.dataset.bound = 'true';
        btnFit.onclick = () => {
            const previewArea = document.querySelector('.editor-preview');
            if (previewArea && container) {
                const availableWidth = previewArea.clientWidth - 56;
                const fit = Math.min(availableWidth / 820, 1);
                updateZoom(Math.max(fit, 0.5));
            } else {
                updateZoom(1);
            }
        };
    }
    const btnTmpl = document.getElementById('preview-change-template-btn');
    if (btnTmpl && !btnTmpl.dataset.bound) {
        btnTmpl.dataset.bound = 'true';
        btnTmpl.onclick = () => {
            renderSectionForm('design');
        };
    }
}

async function requestAiSuggestion(type, context, onChunk) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    let reader;
    try {
        const response = await fetch(`${API_BASE}/ai/suggest`, {
            method: 'POST',
            headers: await authedHeaders(),
            body: JSON.stringify({ type, context, stream: true }),
            signal: controller.signal
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const error = new Error(response.status === 401
                ? 'Please sign in again to use AI writing.'
                : data.message || `AI writing is unavailable (error ${response.status}). Please try again.`);
            error.status = response.status;
            throw error;
        }
        if (!response.body) throw new Error('AI returned an empty response. Please try again.');

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullText = '', complete = false;
        const readLine = line => {
            if (!line.startsWith('data:')) return;
            const value = line.slice(5).trim();
            if (!value) return;
            if (value === '[DONE]') { complete = true; return; }
            const data = JSON.parse(value);
            if (data.error) throw new Error(data.error);
            if (typeof data.chunk === 'string') {
                fullText += data.chunk;
                if (onChunk) onChunk(fullText);
            }
        };
        while (!complete) {
            const { done, value } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) { readLine(line); if (complete) break; }
            if (done) { if (buffer && !complete) readLine(buffer); break; }
        }
        if (!complete) throw new Error('The AI response was interrupted. Your previous text is unchanged. Please try again.');
        if (!fullText.trim()) throw new Error('AI returned no suggestion. Please try again.');
        return fullText;
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('AI request timed out. Please try again.');
        if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
            const localApi = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(API_BASE)
                || (API_BASE.startsWith('/') && isLocalDev);
            throw new Error(localApi
                ? 'Cannot reach the local resume server. Start the backend, then try again.'
                : 'Cannot reach the resume server. Check your connection and try again.');
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
        if (reader) {
            try { await reader.cancel(); } catch (e) {}
            reader.releaseLock();
        }
    }
}

function renderSectionForm(sectionKey) {
    state.currentMode = 'content';
    state.lastActiveSection = sectionKey;
    const formContainer = document.getElementById('active-section-form');
    const content = state.currentResume.content;

    // Ensure content panel & tab in sidebar are active
    if (typeof document.querySelector === 'function') {
        const contentTab = document.querySelector('.sidebar-tab-btn[data-panel="content-panel"]');
        if (contentTab && !contentTab.classList.contains('active')) {
            if (typeof document.querySelectorAll === 'function') {
                document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.remove('active'));
            }
            contentTab.classList.add('active');
            if (typeof document.querySelectorAll === 'function') {
                document.querySelectorAll('.sidebar-panels .panel').forEach(p => p.classList.remove('active'));
            }
            const cp = document.getElementById('content-panel');
            if (cp) cp.classList.add('active');
        }
    }

    if (typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('.section-nav-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.section === sectionKey);
        });
    }

    if (sectionKey === 'contact') {
        formContainer.innerHTML = `
            <div class="section-header-banner">
                <div class="section-header-text">
                    <h2>Contact Information</h2>
                    <p class="section-header-sub">Provide your personal contact details and social links so recruiters can reach you.</p>
                </div>
            </div>
            <div class="form-grid">
                <div class="input-group">
                    <label>Full Name</label>
                    <input type="text" data-path="contact.name" placeholder="e.g. Alex Morgan" value="${escapeHtml(content.contact?.name || '')}">
                </div>
                <div class="input-group">
                    <label>Job Title</label>
                    <input type="text" data-path="contact.title" placeholder="e.g. Senior Software Engineer" value="${escapeHtml(content.contact?.title || '')}">
                </div>
                <div class="input-group">
                    <label>Email Address</label>
                    <input type="email" data-path="contact.email" placeholder="e.g. alex.morgan@example.com" value="${escapeHtml(content.contact?.email || '')}">
                </div>
                <div class="input-group">
                    <label>Phone Number</label>
                    <input type="text" data-path="contact.phone" placeholder="e.g. +1 (555) 019-2834" value="${escapeHtml(content.contact?.phone || '')}">
                </div>
                <div class="input-group">
                    <label>Location</label>
                    <input type="text" data-path="contact.location" placeholder="e.g. San Francisco, CA" value="${escapeHtml(content.contact?.location || '')}">
                </div>
                <div class="input-group">
                    <label>LinkedIn ID / URL</label>
                    <input type="text" data-path="contact.linkedin" placeholder="e.g. linkedin.com/in/alexmorgan" value="${escapeHtml(content.contact?.linkedin || '')}">
                </div>
                <div class="input-group full">
                    <label>GitHub ID / URL</label>
                    <input type="text" data-path="contact.github" placeholder="e.g. github.com/alexmorgan" value="${escapeHtml(content.contact?.github || '')}">
                </div>
            </div>
        `;
    } else if (sectionKey === 'summary') {
        formContainer.innerHTML = `
            <div class="section-header-banner">
                <div class="section-header-text">
                    <h2>Professional Summary</h2>
                    <p class="section-header-sub">Craft a compelling overview of your career, core competencies, and career goals.</p>
                </div>
                <button type="button" class="secondary-btn sm ai-suggest-btn" data-type="summary" title="AI Write"><i data-lucide="sparkles"></i> <span>AI Write</span></button>
            </div>
            <div class="input-group full">
                <textarea id="summary-textarea" data-path="summary" rows="9" placeholder="Briefly describe your professional background, top achievements, and unique strengths...">${escapeHtml(content.summary || '')}</textarea>
            </div>
        `;
    } else if (['experience', 'education', 'projects', 'certifications', 'additional', 'languages', 'references'].includes(sectionKey)) {
        const items = Array.isArray(content[sectionKey]) ? content[sectionKey] : [];
        const sectionMeta = {
            experience: { title: 'Work Experience', sub: 'Detail your previous roles, accomplishments, and quantifiable impact.', btn: 'Add Position' },
            education: { title: 'Education', sub: 'List your degrees, college or university background, and academic honors.', btn: 'Add Degree' },
            projects: { title: 'Projects', sub: 'Showcase personal, academic, or open-source projects demonstrating your abilities.', btn: 'Add Project' },
            certifications: { title: 'Certifications', sub: 'Include verified industry credentials, licenses, or professional badges.', btn: 'Add Certificate' },
            additional: { title: 'Additional Information', sub: 'Add custom sections, awards, volunteer experience, or activities.', btn: 'Add Entry' },
            languages: { title: 'Languages', sub: 'Specify languages you speak and your proficiency level.', btn: 'Add Language' },
            references: { title: 'References', sub: 'Provide professional or academic references who can vouch for your work.', btn: 'Add Reference' }
        };
        const meta = sectionMeta[sectionKey] || { title: sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1), sub: '', btn: 'Add Entry' };
        formContainer.innerHTML = `
            <div class="section-header-banner">
                <div class="section-header-text">
                    <h2>${meta.title}</h2>
                    <p class="section-header-sub">${meta.sub}</p>
                </div>
                <button class="primary-btn sm" id="add-item-btn"><i data-lucide="plus"></i> ${meta.btn}</button>
            </div>
            <div id="list-container" class="list-editor-container" style="display:flex; flex-direction:column; gap:1.25rem;">
                ${items.map((item, idx) => renderListItem(sectionKey, item, idx)).join('')}
            </div>
            ${items.length === 0 ? `
                <div style="text-align:center; padding:3rem 1.5rem; border:2px dashed #E2E8F0; border-radius:14px; background:#F8FAFC;">
                    <p style="color:#64748B; margin-bottom:1rem; font-weight:500;">No ${meta.title.toLowerCase()} added yet.</p>
                    <button class="primary-btn sm" onclick="addListItem('${sectionKey}')"><i data-lucide="plus"></i> ${meta.btn}</button>
                </div>
            ` : ''}
        `;
        const addBtn = document.getElementById('add-item-btn');
        if (addBtn) addBtn.onclick = () => addListItem(sectionKey);
    } else if (sectionKey === 'skills') {
        const KNOWN_SOFT_SKILLS = new Set([
            'communication', 'verbal communication', 'written communication', 'leadership',
            'teamwork', 'collaboration', 'problem solving', 'critical thinking', 'time management',
            'adaptability', 'interpersonal skills', 'interpersonal', 'active listening',
            'negotiation', 'conflict resolution', 'presentation', 'public speaking', 'creativity',
            'empathy', 'work ethic', 'mentoring', 'decision making', 'multitasking', 'organization',
            'strategic thinking', 'attention to detail', 'emotional intelligence', 'flexibility'
        ]);

        const KNOWN_TOOLS = new Set([
            'git', 'github', 'gitlab', 'bitbucket', 'docker', 'kubernetes', 'aws', 'azure', 'gcp',
            'google cloud', 'figma', 'jira', 'trello', 'confluence', 'postman', 'n8n', 'zapier',
            'notion', 'slack', 'linux', 'bash', 'powershell', 'vscode', 'vs code', 'visual studio',
            'intellij', 'jenkins', 'ci/cd', 'webpack', 'vite', 'grafana', 'prometheus', 'redis',
            'kafka', 'rabbitmq', 'vercel', 'netlify', 'heroku', 'npm', 'yarn', 'pnpm'
        ]);

        function classifySkill(skill) {
            const s = String(skill || '').trim().toLowerCase();
            if (KNOWN_SOFT_SKILLS.has(s)) return 'soft';
            for (const kw of ['communication', 'leadership', 'teamwork', 'problem solving', 'time management', 'adaptability']) {
                if (s.includes(kw)) return 'soft';
            }
            if (KNOWN_TOOLS.has(s)) return 'tools';
            return 'technical';
        }

        function smartDistributeSkills(skillsList) {
            const unique = [...new Set((skillsList || []).map(s => String(s || '').trim()).filter(Boolean))];
            const tech = [];
            const soft = [];
            const tools = [];
            unique.forEach(s => {
                const type = classifySkill(s);
                if (type === 'soft') soft.push(s);
                else if (type === 'tools') tools.push(s);
                else tech.push(s);
            });
            return [
                { category: 'Technical Skills', items: tech },
                { category: 'Soft Skills', items: soft },
                { category: 'Tools & Platforms', items: tools }
            ];
        }

        // Migrate old flat skills[] to skillCategories if needed
        if (!Array.isArray(content.skillCategories) || content.skillCategories.length === 0) {
            const flat = Array.isArray(content.skills) ? content.skills.filter(s => s && s.trim()) : [];
            content.skillCategories = smartDistributeSkills(flat);
            state.currentResume.content.skillCategories = content.skillCategories;
        } else {
            // If only Technical Skills has items, but contains soft skills or tools, re-distribute
            const populated = content.skillCategories.filter(c => Array.isArray(c.items) && c.items.length > 0);
            if (populated.length === 1 && populated[0].category.toLowerCase().includes('technical')) {
                const items = populated[0].items;
                const hasMisplaced = items.some(s => classifySkill(s) !== 'technical');
                if (hasMisplaced) {
                    content.skillCategories = smartDistributeSkills(items);
                    state.currentResume.content.skillCategories = content.skillCategories;
                }
            }
        }
        const cats = content.skillCategories;

        const renderCategories = () => cats.map((cat, ci) => `
            <div class="list-item-card" style="padding:1.25rem 1.5rem; margin-bottom:0;" id="skill-cat-${ci}">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                    <div style="display:flex; align-items:center; gap:0.75rem; flex:1;">
                        <i data-lucide="tag" style="width:16px;height:16px;color:var(--primary);flex-shrink:0;"></i>
                        <input type="text"
                            id="cat-label-${ci}"
                            value="${escapeHtml(cat.category)}"
                            placeholder="Category name"
                            data-cat-index="${ci}"
                            class="cat-label-input"
                            style="font-size:0.95rem; font-weight:700; color:#0F172A; background:transparent; border:none; outline:none; font-family:inherit; flex:1;">
                    </div>
                    <button type="button" class="card-delete-btn" onclick="removeSkillCategory(${ci})" title="Remove category" style="flex-shrink:0;">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                    </button>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;" id="skill-tags-${ci}">
                    ${cat.items.map((skill, si) => `
                        <div style="display:inline-flex; align-items:center; gap:0.35rem; background:#F0F4FF; border:1.5px solid #C7D7FD; border-radius:20px; padding:0.3rem 0.6rem 0.3rem 0.85rem; font-size:0.85rem; color:#1E3A8A; font-weight:500;">
                            <span>${escapeHtml(skill)}</span>
                            <button type="button" onclick="removeSkillItem(${ci},${si})" style="background:none;border:none;cursor:pointer;padding:0;line-height:1;color:#6B7280;" title="Remove"><i data-lucide="x" style="width:12px;height:12px;"></i></button>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <input type="text"
                        id="skill-input-${ci}"
                        placeholder="Type a skill and press Enter…"
                        class="skill-tag-input"
                        data-cat-index="${ci}"
                        style="flex:1; padding:0.5rem 0.75rem; border:1.5px solid #E2E8F0; border-radius:8px; font-size:0.88rem; color:#0F172A; background:#FAFBFF; font-family:inherit; outline:none; transition:border-color 0.15s;"
                        onfocus="this.style.borderColor='var(--primary)'"
                        onblur="this.style.borderColor='#E2E8F0'">
                    <button type="button" class="primary-btn sm" onclick="addSkillItem(${ci})" style="flex-shrink:0; white-space:nowrap;">
                        <i data-lucide="plus"></i> Add
                    </button>
                </div>
            </div>
        `).join('');

        formContainer.innerHTML = `
            <div class="section-header-banner">
                <div class="section-header-text">
                    <h2>Skills & Expertise</h2>
                    <p class="section-header-sub">Organise your skills by category — Technical, Soft Skills, Tools & Platforms, or custom groups.</p>
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <button class="secondary-btn sm" id="auto-sort-skills-btn" title="Intelligently categorize skills into Technical, Soft Skills, and Tools"><i data-lucide="sparkles"></i> Auto-Organise</button>
                    <button class="primary-btn sm" id="add-cat-btn"><i data-lucide="plus"></i> Add Category</button>
                </div>
            </div>
            <div id="skill-categories-container" style="display:flex; flex-direction:column; gap:1rem;">
                ${renderCategories()}
            </div>
        `;

        lucide.createIcons();

        // Auto-Organise button
        const autoSortBtn = document.getElementById('auto-sort-skills-btn');
        if (autoSortBtn) {
            autoSortBtn.onclick = () => {
                const allSkills = (state.currentResume.content.skillCategories || []).flatMap(c => c.items || []);
                state.currentResume.content.skillCategories = smartDistributeSkills(allSkills);
                syncSkillsFlat();
                markDirty();
                renderSectionForm('skills');
                showToast('Skills organised by category!', 'success');
            };
        }

        // Enter key adds skill
        formContainer.querySelectorAll('.skill-tag-input').forEach(input => {
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); addSkillItem(parseInt(input.dataset.catIndex)); }
            });
        });

        // Live-edit category label
        formContainer.querySelectorAll('.cat-label-input').forEach(input => {
            input.addEventListener('input', () => {
                const ci = parseInt(input.dataset.catIndex);
                state.currentResume.content.skillCategories[ci].category = input.value;
                syncSkillsFlat();
                markDirty();
            });
        });

        document.getElementById('add-cat-btn').onclick = () => {
            if (!state.currentResume.content.skillCategories) state.currentResume.content.skillCategories = [];
            state.currentResume.content.skillCategories.push({ category: 'Custom Skills', items: [] });
            renderSectionForm('skills');
            markDirty();
        };

    } else if (sectionKey === 'design') {
        const design = state.currentResume.design || {};
        formContainer.innerHTML = `
            <div class="section-header-banner">
                <div class="section-header-text">
                    <h2>Design & Formatting</h2>
                    <p class="section-header-sub">Fine-tune the typography, accent colors, and layout of your resume.</p>
                </div>
            </div>
            <div style="background:#FFFFFF; border:1.5px solid #E2E8F0; border-radius:14px; padding:1.75rem; margin-bottom:2rem; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                <h3 style="margin:0 0 1.25rem 0; color:#0F172A; font-size:1.05rem; font-weight:700;">Styling Preferences</h3>
                <div class="form-grid" style="margin-top:0;">
                    <div class="input-group">
                        <label>Primary Theme Color</label>
                        <div style="display:flex; gap:0.75rem; align-items:center;">
                            <input type="color" data-path="design.primaryColor" value="${escapeHtml(design.primaryColor || '#2563EB')}" style="width:44px; height:44px; padding:0; border-radius:10px; border:1.5px solid #E2E8F0; cursor:pointer;">
                            <span style="color:#64748B; font-size:0.88rem; font-weight:500;">Choose header & accent color</span>
                        </div>
                    </div>
                    <div class="input-group">
                        <label>Font Family</label>
                        <select data-path="design.fontFamily">
                            <option value="Inter, sans-serif" ${design.fontFamily === 'Inter, sans-serif' ? 'selected' : ''}>Inter (Modern Sans)</option>
                            <option value="Merriweather, serif" ${design.fontFamily === 'Merriweather, serif' ? 'selected' : ''}>Merriweather (Classic Serif)</option>
                            <option value="Roboto, sans-serif" ${design.fontFamily === 'Roboto, sans-serif' ? 'selected' : ''}>Roboto (Clean Sans)</option>
                            <option value="Playfair Display, serif" ${design.fontFamily === 'Playfair Display, serif' ? 'selected' : ''}>Playfair Display (Editorial)</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Font Size (pt)</label>
                        <input type="number" data-path="design.fontSize" value="${escapeHtml(design.fontSize || 10)}" min="8" max="14" step="0.5">
                    </div>
                    <div class="input-group">
                        <label>Line Spacing</label>
                        <input type="number" data-path="design.lineHeight" value="${escapeHtml(design.lineHeight || 1.4)}" min="1" max="2" step="0.1">
                    </div>
                    <div class="input-group full">
                        <label>Page Margin (mm)</label>
                        <input type="number" id="margin-input" value="${escapeHtml(design.margins?.top || 12.7)}" min="5" max="30" step="1">
                    </div>
                </div>
            </div>
            <h3 style="margin:0 0 1rem 0; color:#0F172A; font-size:1.05rem; font-weight:700;">Switch Template</h3>
            <div id="template-editor-list" class="template-grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
                <!-- Internal template switcher -->
            </div>
        `;

        fetchTemplatesForEditor();
    }

    // Attach AI Suggestion handlers
    formContainer.querySelectorAll('.ai-suggest-btn').forEach(btn => {
        btn.onclick = async (e) => {
            if (e && e.preventDefault) e.preventDefault();

            const hasAccess = await requireAiAccess();
            if (!hasAccess) return;

            const type = btn.dataset.type;
            const section = btn.dataset.section;
            const index = btn.dataset.index;
            const editedResume = state.currentResume;
            let context;

            if (type === 'description' && section && index !== undefined) {
                // Send only the single item — already lean
                context = editedResume.content[section][parseInt(index)];
            } else if (type === 'summary') {
                // Send only the fields the summary AI needs, not the entire content
                const c = editedResume.content || {};
                context = {
                    contact: { name: c.contact?.name || '', title: c.contact?.title || '' },
                    skills: (c.skills || []).slice(0, 10),
                    experience: (c.experience || []).slice(0, 3).map(e => ({
                        title: e.title, company: e.company,
                        startDate: e.startDate, endDate: e.endDate
                    })),
                    education: (c.education || []).slice(0, 2).map(e => ({
                        degree: e.degree, institution: e.institution
                    }))
                };
            } else {
                context = editedResume.content;
            }

            const targetId = type === 'summary' ? 'summary-textarea' : `${section}-desc-${index}`;
            const textarea = document.getElementById(targetId);
            const previousText = textarea ? textarea.value : '';
            const wasReadOnly = textarea ? textarea.readOnly : false;
            if (textarea) textarea.readOnly = true;

            showToast('Generating AI suggestion...', 'info');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader"></i>';
            btn.disabled = true;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                const fullText = await requestAiSuggestion(type, context, text => {
                    if (textarea && state.currentResume === editedResume) {
                        textarea.value = text;
                        textarea.scrollTop = textarea.scrollHeight;
                    }
                });
                if (state.currentResume !== editedResume) return;

                if (type === 'summary') {
                    editedResume.content.summary = fullText;
                } else if (type === 'description') {
                    context.description = fullText;
                }

                updatePreview();
                markDirty();
                showToast('AI suggestion applied!', 'success');

            } catch (err) {
                console.error('AI Suggestion Error:', err);
                if (textarea) textarea.value = previousText;
                if (err.status === 401 && typeof window.openAuthModal === 'function') {
                    window.openAuthModal('choice');
                }
                showToast(err.message, 'error');
            } finally {
                if (textarea) textarea.readOnly = wasReadOnly;
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        };
    });

    // Attach live preview update on every input change & trigger debounced save
    formContainer.querySelectorAll('input, textarea, select').forEach(input => {
        const editedResume = state.currentResume;
        const handler = () => {
            if (state.currentResume !== editedResume) return;
            const path = input.dataset.path;
            const value = input.value;
            const index = input.dataset.index;
            const section = input.dataset.section;

            if (input.id === 'margin-input') {
                const m = parseFloat(value);
                if (!Number.isFinite(m)) return;
                state.currentResume.design.margins = { top: m, right: m, bottom: m, left: m };
            } else if (section === 'skills' && index !== undefined) {
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

                    if (path === 'contact.name') {
                        const trimmedName = (value || '').trim();
                        const titleEl = document.getElementById('resume-title-input');
                        const currentTitle = ((titleEl ? titleEl.value : state.currentResume.title) || '').trim();
                        const isDefault = !currentTitle ||
                            currentTitle.toLowerCase() === 'my new resume' ||
                            currentTitle.toLowerCase() === 'untitled resume';
                        if (trimmedName && (isDefault || state.currentResume._autoNamed)) {
                            state.currentResume.title = trimmedName;
                            state.currentResume._autoNamed = true;
                            if (titleEl) titleEl.value = trimmedName;
                        }
                    }
                } else {
                    state.currentResume.content[path] = value;
                }
            }

            updatePreviewDebounced();
            markDirty();
        };

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
            <div class="list-item-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <span class="card-item-tag">Experience #${index + 1}</span>
                    <button type="button" class="card-delete-btn" onclick="removeListItem('experience', ${index})" title="Delete entry"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                </div>
                <div class="form-grid" style="margin-top:0;">
                    <div class="input-group"><label>Company / Organization</label><input type="text" data-section="experience" data-index="${index}" data-path="company" placeholder="e.g. Google" value="${escapeHtml(item.company || '')}"></div>
                    <div class="input-group"><label>Job Title</label><input type="text" data-section="experience" data-index="${index}" data-path="title" placeholder="e.g. Senior Software Engineer" value="${escapeHtml(item.title || '')}"></div>
                    <div class="input-group"><label>Start Date</label><input type="text" data-section="experience" data-index="${index}" data-path="startDate" placeholder="e.g. 2021" value="${escapeHtml(item.startDate || '')}"></div>
                    <div class="input-group"><label>End Date</label><input type="text" data-section="experience" data-index="${index}" data-path="endDate" placeholder="e.g. Present" value="${escapeHtml(item.endDate || '')}"></div>
                    <div class="input-group full">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <label style="margin-bottom:0;">Key Accomplishments & Responsibilities</label>
                            <button type="button" class="secondary-btn sm ai-suggest-btn" data-type="description" data-section="experience" data-index="${index}" title="AI Write"><i data-lucide="sparkles"></i> <span>AI Write</span></button>
                        </div>
                        <textarea id="experience-desc-${index}" data-section="experience" data-index="${index}" data-path="description" rows="4" placeholder="• Led development of microservices...&#10;• Increased performance by 30%...">${escapeHtml(item.description || '')}</textarea>
                    </div>
                </div>
            </div>
        `;
    } else if (section === 'education') {
        return `
            <div class="list-item-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <span class="card-item-tag">Education #${index + 1}</span>
                    <button type="button" class="card-delete-btn" onclick="removeListItem('education', ${index})" title="Delete entry"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                </div>
                <div class="form-grid" style="margin-top:0;">
                    <div class="input-group"><label>Institution / University</label><input type="text" data-section="education" data-index="${index}" data-path="institution" placeholder="e.g. UC Berkeley" value="${escapeHtml(item.institution || '')}"></div>
                    <div class="input-group"><label>Degree / Major</label><input type="text" data-section="education" data-index="${index}" data-path="degree" placeholder="e.g. B.S. in Computer Science" value="${escapeHtml(item.degree || '')}"></div>
                    <div class="input-group full"><label>Graduation Year / Duration</label><input type="text" data-section="education" data-index="${index}" data-path="endDate" placeholder="e.g. 2020" value="${escapeHtml(item.endDate || '')}"></div>
                </div>
            </div>
        `;
    } else if (section === 'projects') {
        return `
            <div class="list-item-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <span class="card-item-tag">Project #${index + 1}</span>
                    <button type="button" class="card-delete-btn" onclick="removeListItem('projects', ${index})" title="Delete entry"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                </div>
                <div class="form-grid" style="margin-top:0;">
                    <div class="input-group full"><label>Project Name</label><input type="text" data-section="projects" data-index="${index}" data-path="name" placeholder="e.g. E-Commerce Microservices" value="${escapeHtml(item.name || '')}"></div>
                    <div class="input-group full">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <label style="margin-bottom:0;">Project Overview</label>
                            <button type="button" class="secondary-btn sm ai-suggest-btn" data-type="description" data-section="projects" data-index="${index}" title="AI Write"><i data-lucide="sparkles"></i> <span>AI Write</span></button>
                        </div>
                        <textarea id="projects-desc-${index}" data-section="projects" data-index="${index}" data-path="description" rows="4" placeholder="Built an end-to-end cloud platform with real-time streaming...">${escapeHtml(item.description || '')}</textarea>
                    </div>
                    <div class="input-group full"><label>Project Link / Demo URL (Optional)</label><input type="text" data-section="projects" data-index="${index}" data-path="link" placeholder="e.g. https://github.com/alex/project" value="${escapeHtml(item.link || '')}"></div>
                </div>
            </div>
        `;
    } else if (section === 'certifications') {
        return `
            <div class="list-item-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <span class="card-item-tag">Certification #${index + 1}</span>
                    <button type="button" class="card-delete-btn" onclick="removeListItem('certifications', ${index})" title="Delete entry"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                </div>
                <div class="form-grid" style="margin-top:0;">
                    <div class="input-group full"><label>Certification Name</label><input type="text" data-section="certifications" data-index="${index}" data-path="name" placeholder="e.g. AWS Certified Solutions Architect" value="${escapeHtml(item.name || '')}"></div>
                    <div class="input-group"><label>Issuing Organization</label><input type="text" data-section="certifications" data-index="${index}" data-path="issuer" placeholder="e.g. Amazon Web Services" value="${escapeHtml(item.issuer || '')}"></div>
                    <div class="input-group"><label>Issue Date</label><input type="text" data-section="certifications" data-index="${index}" data-path="date" placeholder="e.g. 2023" value="${escapeHtml(item.date || '')}"></div>
                </div>
            </div>
        `;
    } else if (section === 'additional') {
        return `
            <div class="list-item-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <span class="card-item-tag">Entry #${index + 1}</span>
                    <button type="button" class="card-delete-btn" onclick="removeListItem('additional', ${index})" title="Delete entry"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                </div>
                <div class="form-grid" style="margin-top:0;">
                    <div class="input-group full"><label>Section Title (e.g. Volunteer Work, Awards)</label><input type="text" data-section="additional" data-index="${index}" data-path="title" placeholder="e.g. Awards & Honors" value="${escapeHtml(item.title || '')}"></div>
                    <div class="input-group full"><label>Description / Details</label><textarea data-section="additional" data-index="${index}" data-path="value" rows="3" placeholder="Details of this achievement or activity...">${escapeHtml(item.value || '')}</textarea></div>
                </div>
            </div>
        `;
    } else if (section === 'languages') {
        return `
            <div class="list-item-card" style="display:flex; gap:1rem; align-items:center; padding:1.1rem 1.5rem !important;">
                <input type="text" data-section="languages" data-index="${index}" data-path="name" placeholder="Language (e.g. English)" value="${escapeHtml(item.name || '')}" style="flex:1;">
                <select data-section="languages" data-index="${index}" data-path="level" style="width:160px;">
                    <option value="Native" ${item.level === 'Native' ? 'selected' : ''}>Native</option>
                    <option value="Fluent" ${item.level === 'Fluent' ? 'selected' : ''}>Fluent</option>
                    <option value="Professional" ${item.level === 'Professional' ? 'selected' : ''}>Professional</option>
                    <option value="Intermediate" ${item.level === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                    <option value="Basic" ${item.level === 'Basic' ? 'selected' : ''}>Basic</option>
                </select>
                <button type="button" class="card-delete-btn" onclick="removeListItem('languages', ${index})" title="Delete language"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
            </div>
        `;
    } else if (section === 'references') {
        return `
            <div class="list-item-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <span class="card-item-tag">Reference #${index + 1}</span>
                    <button type="button" class="card-delete-btn" onclick="removeListItem('references', ${index})" title="Delete reference"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                </div>
                <div class="form-grid" style="margin-top:0;">
                    <div class="input-group"><label>Reference Name</label><input type="text" data-section="references" data-index="${index}" data-path="name" placeholder="e.g. Jane Smith" value="${escapeHtml(item.name || '')}"></div>
                    <div class="input-group"><label>Position / Company</label><input type="text" data-section="references" data-index="${index}" data-path="title" placeholder="e.g. VP of Engineering at TechCorp" value="${escapeHtml(item.title || '')}"></div>
                    <div class="input-group full"><label>Contact Information (Email / Phone)</label><input type="text" data-section="references" data-index="${index}" data-path="contact" placeholder="e.g. jane.smith@example.com" value="${escapeHtml(item.contact || '')}"></div>
                </div>
            </div>
        `;
    }
    return '';
}

function addListItem(section) {
    if (!Array.isArray(state.currentResume.content[section])) state.currentResume.content[section] = [];
    state.currentResume.content[section].push({});
    renderSectionForm(section);
    updatePreview();
    markDirty();
}

window.removeListItem = (section, index) => {
    state.currentResume.content[section].splice(index, 1);
    renderSectionForm(section);
    updatePreview();
    markDirty();
};

/** Sync the legacy flat skills[] from skillCategories so templates render correctly */
function syncSkillsFlat() {
    const cats = state.currentResume.content.skillCategories;
    if (!Array.isArray(cats)) return;
    state.currentResume.content.skills = cats.flatMap(c => c.items || []).filter(s => s && s.trim());
    updatePreviewDebounced();
}

window.removeSkill = (index) => {
    state.currentResume.content.skills.splice(index, 1);
    renderSectionForm('skills');
    updatePreview();
    markDirty();
};

window.addSkillItem = (catIndex) => {
    const input = document.getElementById(`skill-input-${catIndex}`);
    const val = input ? input.value.trim() : '';
    if (!val) return;
    const cats = state.currentResume.content.skillCategories;
    if (!cats || !cats[catIndex]) return;
    if (!Array.isArray(cats[catIndex].items)) cats[catIndex].items = [];
    // Avoid duplicates within the same category
    if (!cats[catIndex].items.includes(val)) {
        cats[catIndex].items.push(val);
    }
    syncSkillsFlat();
    markDirty();
    renderSectionForm('skills');
    // Focus the input of the same category after re-render
    setTimeout(() => {
        const newInput = document.getElementById(`skill-input-${catIndex}`);
        if (newInput) newInput.focus();
    }, 0);
};

window.removeSkillItem = (catIndex, skillIndex) => {
    const cats = state.currentResume.content.skillCategories;
    if (!cats || !cats[catIndex]) return;
    cats[catIndex].items.splice(skillIndex, 1);
    syncSkillsFlat();
    markDirty();
    renderSectionForm('skills');
};

window.removeSkillCategory = (catIndex) => {
    const cats = state.currentResume.content.skillCategories;
    if (!cats) return;
    cats.splice(catIndex, 1);
    syncSkillsFlat();
    markDirty();
    renderSectionForm('skills');
};


async function fetchTemplatesForEditor() {
    const list = document.getElementById('template-editor-list');
    if (!list) return;

    const renderTemplates = (templates) => {
        const validTemplates = templates || [];
        list.innerHTML = validTemplates.map(t => `
            <div class="template-card ${state.currentResume.template_id === t.id ? 'selected' : ''}"
                 onclick="switchTemplate('${t.id}')"
                 style="cursor:pointer; overflow:hidden; border:1px solid ${state.currentResume.template_id === t.id ? 'var(--primary)' : 'var(--border)'};">
                <div class="template-thumb" style="height:120px; background:var(--bg-main); overflow:hidden;">
                    ${t.thumbnail_url ? `<img src="${resolveThumb(t.thumbnail_url)}" style="width:100%; height:100%; object-fit:cover;" alt="${t.name}" loading="lazy">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;"><i data-lucide="file-text"></i></div>'}
                </div>
                <div class="template-info" style="padding:0.5rem;">
                    <h4 style="font-size:0.85rem; margin:0;">${t.name}</h4>
                </div>
            </div>
        `).join('');
    };

    // 1. Immediately render client templates
    const clientTemplates = (window.ResumeRenderer && window.ResumeRenderer.getClientTemplates()) || [];
    if (clientTemplates.length) {
        renderTemplates(clientTemplates);
    } else {
        list.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem;"><i data-lucide="loader" style="animation: spin 1s linear infinite;"></i></div>';
        lucide.createIcons();
    }

    // 2. Background sync from Supabase
    if (window.ResumeRenderer && window.ResumeRenderer.syncTemplatesFromSupabase) {
        window.ResumeRenderer.syncTemplatesFromSupabase().then(sbTemplates => {
            if (Array.isArray(sbTemplates) && sbTemplates.length) {
                renderTemplates(sbTemplates);
            }
        }).catch(() => {});
    }

    // 3. Optional local backend check
    try {
        const data = await apiFetch('/templates', { silent: true });
        if (data && data.templates && data.templates.length) {
            if (window.ResumeRenderer) window.ResumeRenderer.cacheTemplates(data.templates);
            renderTemplates(data.templates);
        }
    } catch (err) {
        // Silently ignored
    }
}

window.switchTemplate = async (templateId) => {
    try {
        // Update local state and trigger debounced save
        state.currentResume.template_id = templateId;
        renderSectionForm('design');
        updatePreview();
        markDirty();
        showToast('Template switched!');
    } catch (err) { }
};

let previewAbortController = null;
const updatePreviewDebounced = debounce(updatePreview, 300);

// updatePreview: renders resume using client renderer (Handlebars) or falls back to backend
function updatePreview() {
    if (!state.currentResume) return;
    const iframe = document.getElementById('resume-preview-iframe');
    if (!iframe) return;

    // A previous server render must not overwrite a newer client preview.
    if (previewAbortController) previewAbortController.abort();
    previewAbortController = null;

    // 1. Instant client-side preview rendering (works offline and on static hosts!)
    if (window.ResumeRenderer && typeof window.ResumeRenderer.buildClientPreviewHtml === 'function') {
        try {
            const template = window.ResumeRenderer.getTemplateById(state.currentResume.template_id);
            const html = template && window.ResumeRenderer.buildClientPreviewHtml(
                state.currentResume.content,
                state.currentResume.design,
                template,
                state.currentResume.sectionOrder
            );
            if (html) {
                const onLoad = () => {
                    setTimeout(() => resizeIframeToContent(iframe), 200);
                };
                iframe.removeEventListener('load', iframe._previewLoadHandler);
                iframe._previewLoadHandler = onLoad;
                iframe.addEventListener('load', onLoad, { once: true });
                iframe.srcdoc = html;
                setTimeout(() => resizeIframeToContent(iframe), 250);
                return;
            }
        } catch (clientErr) {
            console.warn('[ResumePro] Client-side render failed, attempting backend preview:', clientErr);
        }
    } else if (!window._rendererRetryBound) {
        window._rendererRetryBound = true;
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(updatePreview, 80);
        });
    }

    const body = JSON.stringify({
        content: state.currentResume.content,
        design: state.currentResume.design,
        templateId: state.currentResume.template_id,
        sectionOrder: state.currentResume.sectionOrder
    });

    // Cancel previous pending request to avoid race conditions
    const controller = new AbortController();
    previewAbortController = controller;

    authedHeaders().then(headers => fetch(`${API_BASE}/export/preview`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
    }))
        .then(async r => {
            // A rate-limit or server error must not replace the resume with its
            // JSON body; keep showing the last good preview instead.
            if (!r.ok) {
                const data = await r.json().catch(() => ({}));
                const err = new Error(data.message || `Preview failed (${r.status})`);
                err.status = r.status;
                throw err;
            }
            return r.text();
        })
        .then(html => {
            if (controller.signal.aborted) return;
            // Remove previous load listener and set new srcdoc
            const onLoad = () => {
                // Wait for in-iframe pagination script to complete
                setTimeout(() => resizeIframeToContent(iframe), 500);
            };
            iframe.removeEventListener('load', iframe._previewLoadHandler);
            iframe._previewLoadHandler = onLoad;
            iframe.addEventListener('load', onLoad, { once: true });
            iframe.srcdoc = html;
        })
        .catch(err => {
            if (err.name === 'AbortError') return;
            console.error('Preview error:', err);
            // Busy server: try once more shortly with whatever is current then.
            if (err.status === 429) {
                clearTimeout(window._previewRetryTimer);
                window._previewRetryTimer = setTimeout(updatePreview, 5000);
            }
        });
}

// --- Mobile Zoom & Fit Handlers ---
let modalZoomMode = '100'; // '100' or 'fit'

function resizeIframeToContent(iframe) {
    // Phones scale the preview down; sizing it here at full height would leave
    // a tall blank gap under the scaled page.
    if (window.innerWidth <= 992) {
        autoFitMobilePreview();
        return;
    }
    const container = document.querySelector('.preview-frame-container');
    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc && iframeDoc.body) {
            const h = Math.max(
                iframeDoc.documentElement.scrollHeight,
                iframeDoc.body.scrollHeight,
                1200
            );
            iframe.style.height = h + 'px';
            if (container) {
                container.style.minHeight = h + 'px';
                container.style.height = h + 'px';
            }
        }
    } catch (e) {
        iframe.style.height = '1200px';
        if (container) container.style.height = '1200px';
    }
}

function autoFitMobilePreview() {
    const iframe = document.getElementById('resume-preview-iframe');
    const container = document.querySelector('.preview-frame-container');

    if (window.innerWidth > 992) {
        // Desktop: Reset transforms and resize iframe to full content height
        if (iframe) {
            iframe.style.transform = '';
            iframe.style.width = '100%';
            iframe.style.position = '';
            iframe.style.top = '';
            iframe.style.left = '';
            iframe.style.marginLeft = '';
            iframe.style.transformOrigin = '';
            resizeIframeToContent(iframe);
        }
        return;
    }

    if (!iframe || !container) return;

    const containerWidth = container.clientWidth;
    if (containerWidth === 0) return; // Hidden or not layouted yet

    const baseWidth = 800;
    iframe.style.width = `${baseWidth}px`;

    // Measure the real content so page 2+ of a long resume is not cut off.
    let baseHeight = 1130;
    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc && doc.body) {
            iframe.style.height = `${baseHeight}px`;
            baseHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, baseHeight);
        }
    } catch (e) { }
    const scale = containerWidth / baseWidth;

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
    const iframe = document.getElementById('modal-preview-iframe');
    if (!wrapper || !container || !iframe) return;

    let actualHeight = 1130;
    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
            actualHeight = iframeDoc.documentElement.scrollHeight || iframeDoc.body.scrollHeight || 1130;
        }
    } catch (e) {
        console.error('Error measuring modal iframe height:', e);
    }

    iframe.style.height = `${actualHeight}px`;

    const baseWidth = 800;
    const baseHeight = actualHeight;

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
                // Delay to allow in-iframe pagination script to run first
                setTimeout(autoFitMobilePreview, 500);
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

    // Never leave the builder open to a signed-out visitor, including after a
    // sign-out in another tab or an expired refresh token.
    enforceBuilderAccess();
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        supabaseClient.auth.onAuthStateChange(() => { enforceBuilderAccess(); });
    }

    // Restore the user's autosave choice before the editor can open.
    loadAutosavePref();
    syncAutosaveToggle();

    // After a refresh: reopen the resume that was open.
    restoreViewFromUrl();

    const bindClick = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.onclick = handler;
    };

    // Nav Actions — enter template selection seamlessly
    bindClick('start-building-btn', startBuilderEntry);
    bindClick('hero-cta-btn', startBuilderEntry);
    bindClick('back-to-home', () => switchView('landing'));
    // Back out of the editor into templates (which shows templates at top, saved resumes below).
    bindClick('back-to-templates', () => leaveEditor('templates'));

    bindClick('my-resumes-btn', openDashboard);
    bindClick('my-resumes-btn-templates', async () => {
        const user = await getResumeUser();
        if (!user) {
            if (typeof clearAuthInputs === 'function') clearAuthInputs();
            window.openAuthModal('choice');
            showToast('Please sign in to view your saved resumes.', 'info');
            return;
        }
        const el = document.getElementById('saved-resumes-section');
        if (el) {
            el.style.display = 'block';
            el.scrollIntoView({ behavior: 'smooth' });
        } else {
            openDashboard();
        }
    });
    bindClick('back-to-home-dashboard', () => switchView('landing'));
    bindClick('new-resume-btn', () => switchView('templates'));

    // Explicit save, and the autosave switch beside it.
    bindClick('save-resume-btn', () => saveResumeNow({}));

    const autosaveToggle = document.getElementById('autosave-toggle');
    if (autosaveToggle) {
        autosaveToggle.addEventListener('change', () => setAutosaveEnabled(autosaveToggle.checked));
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            if (state.activeView !== 'editor' || !state.currentResume) return;
            e.preventDefault();
            saveResumeNow({});
        }
    });

    // Unsaved work must not vanish with the tab, or when it goes to the background.
    window.addEventListener('beforeunload', (e) => {
        if (!state.currentResume || !state.isDirty) return;
        e.preventDefault();
        e.returnValue = '';
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPendingSave();
    });

    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.classList.add('hidden');
                if (modal.id === 'otp-auth-modal' && typeof clearAuthInputs === 'function') clearAuthInputs();
            }
        });
    });

    // Close on backdrop click
    const authModal = document.getElementById('otp-auth-modal');
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) {
                if (typeof window.closeAuthModal === 'function') {
                    window.closeAuthModal();
                } else {
                    authModal.classList.add('hidden');
                    if (typeof clearAuthInputs === 'function') clearAuthInputs();
                }
            }
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const m = document.getElementById('otp-auth-modal');
            if (m && !m.classList.contains('hidden')) {
                if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
            }
        }
    });

    // Editor Actions — download PDF
    // Downloads are free; /export/download only needs a signed-in student.
    document.getElementById('download-pdf-btn').onclick = () => generateClientPdf();

    const mobileBottomBtn = document.getElementById('mobile-bottom-download-btn');
    if (mobileBottomBtn) {
        mobileBottomBtn.onclick = () => generateClientPdf();
    }


    // --- ATS Optimization Center State ---
    let currentAtsData = null;
    let targetJobTitleCache = '';
    let targetJdCache = '';

    function calculateLocalAtsScore(resumeData) {
        const data = resumeData || {};
        const feedback = [];
        let score = 0;

        // 1. Contact Information (15 pts)
        const contact = data.contact || {};
        const contactChecks = [
            { id: 'email', label: 'Email Address', passed: !!(contact.email && contact.email.trim()), detail: contact.email ? 'Professional email address provided.' : 'Missing email address.' },
            { id: 'phone', label: 'Phone Number', passed: !!(contact.phone && contact.phone.trim()), detail: contact.phone ? 'Direct contact number provided.' : 'Missing phone number.' },
            { id: 'linkedin', label: 'LinkedIn Profile', passed: !!(contact.linkedin && contact.linkedin.trim()), detail: contact.linkedin ? 'LinkedIn profile linked for recruiters.' : 'Missing LinkedIn profile link.' }
        ];
        contactChecks.forEach(c => {
            feedback.push(c);
            if (c.passed) score += 5;
        });

        // 2. Structural Sections (30 pts)
        const sections = [
            { id: 'summary', label: 'Professional Summary', passed: !!(data.summary && data.summary.trim().length > 40), detail: data.summary ? 'Professional summary highlights key qualifications.' : 'Add a concise summary highlighting your strengths.' },
            { id: 'experience', label: 'Work Experience', passed: Array.isArray(data.experience) && data.experience.length > 0, detail: Array.isArray(data.experience) && data.experience.length > 0 ? `${data.experience.length} work experience entries included.` : 'Add work experience or project roles.' },
            { id: 'skills', label: 'Skills Section', passed: (Array.isArray(data.skills) && data.skills.length >= 3) || (Array.isArray(data.skillCategories) && data.skillCategories.some(c => c.items && c.items.length > 0)), detail: 'Technical and professional skills listed.' },
            { id: 'education', label: 'Education Section', passed: Array.isArray(data.education) && data.education.length > 0, detail: Array.isArray(data.education) && data.education.length > 0 ? 'Educational credentials provided.' : 'Add your degree or academic background.' },
            { id: 'projects', label: 'Projects Section', passed: Array.isArray(data.projects) && data.projects.length > 0, detail: Array.isArray(data.projects) && data.projects.length > 0 ? `${data.projects.length} project portfolio items listed.` : 'Add notable projects demonstrating applied skills.' },
            { id: 'certifications', label: 'Certifications', passed: Array.isArray(data.certifications) && data.certifications.length > 0, detail: Array.isArray(data.certifications) && data.certifications.length > 0 ? 'Industry credentials or certifications added.' : 'Certifications enhance recruiter confidence.' }
        ];
        sections.forEach(s => {
            feedback.push(s);
            if (s.passed) score += 5;
        });

        // 3. Content Impact & Action Verbs (25 pts)
        const HIGH_IMPACT_KEYWORDS = [
            'leadership', 'management', 'coordinated', 'developed', 'implemented',
            'growth', 'revenue', 'optimized', 'scaled', 'architected',
            'strategic', 'mentored', 'collaborated', 'delivered', 'automated',
            'engineered', 'built', 'spearheaded', 'designed', 'resolved', 'analyzed'
        ];
        const COMMON_SKILLS = [
            'javascript', 'python', 'java', 'react', 'node', 'aws', 'docker',
            'sql', 'nosql', 'agile', 'scrum', 'project management', 'communication',
            'typescript', 'go', 'rust', 'cloud', 'kubernetes', 'git', 'c++', 'html', 'css'
        ];

        const allText = JSON.stringify(data).toLowerCase();
        const foundImpactWords = HIGH_IMPACT_KEYWORDS.filter(word => allText.includes(word));
        const impactScore = Math.min(foundImpactWords.length * 4, 25);
        score += impactScore;
        feedback.push({
            id: 'impact_words',
            label: 'Action Verbs',
            passed: foundImpactWords.length >= 3,
            detail: `Found ${foundImpactWords.length} strong action verbs (${foundImpactWords.slice(0, 4).join(', ') || 'none yet'}).`,
            suggestion: foundImpactWords.length < 3 ? 'Use more quantifiable action verbs like "engineered", "optimized", "spearheaded", or "automated".' : null
        });

        // 4. Skills Density (15 pts)
        const foundSkills = COMMON_SKILLS.filter(skill => allText.includes(skill));
        const skillScore = Math.min(foundSkills.length * 3, 15);
        score += skillScore;
        feedback.push({
            id: 'skill_density',
            label: 'Skill Density',
            passed: foundSkills.length >= 4,
            detail: `Detected ${foundSkills.length} industry-standard technical skills.`,
            suggestion: foundSkills.length < 4 ? 'Include specific in-demand tools and frameworks matching job requirements.' : null
        });

        // 5. Length & Formatting (15 pts)
        const wordCount = allText.split(/\s+/).filter(Boolean).length;
        const lengthPassed = wordCount >= 180 && wordCount <= 1200;
        feedback.push({
            id: 'length',
            label: 'Resume Length',
            passed: lengthPassed,
            detail: `Resume content is approximately ${wordCount} words (${wordCount > 600 ? '2 pages' : '1 page'}).`,
            suggestion: wordCount < 180 ? 'Resume is too brief. Elaborate on project outcomes and key responsibilities.' : (wordCount > 1200 ? 'Resume is lengthy. Strive for concise bullet points.' : null)
        });
        if (lengthPassed) score += 15;

        score = Math.min(100, Math.max(0, score));

        let grade = 'F';
        if (score >= 90) grade = 'A';
        else if (score >= 80) grade = 'B';
        else if (score >= 70) grade = 'C';
        else if (score >= 60) grade = 'D';

        const topImprovements = feedback
            .filter(f => !f.passed)
            .map(f => f.suggestion || `Enhance your ${f.label}`)
            .slice(0, 3);

        return {
            score,
            grade,
            feedback,
            topImprovements: topImprovements.length > 0 ? topImprovements : ['Your resume meets core ATS requirements! Run AI Deep Scan for tailored role-matching advice.']
        };
    }

    function formatInlineMarkdown(text) {
        if (!text) return '';
        let escaped = escapeHtml(text);
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/'([^']+)'/g, '<span class="ats-keyword-highlight">$1</span>');
        return escaped;
    }

    function formatRecommendationItem(text) {
        if (!text) return '';
        let clean = text.replace(/^[\s💡✨*•\-]+/, '').trim();

        const boldMatch = clean.match(/^\*\*([^*]+)\*\*[:\s-]*(.*)$/s);
        if (boldMatch) {
            const title = boldMatch[1].replace(/[:\-]$/, '').trim();
            const body = boldMatch[2].trim();
            return `
                <div class="ats-recommendation-card">
                    <div class="ats-rec-icon"><i data-lucide="sparkles"></i></div>
                    <div class="ats-rec-content">
                        <h4 class="ats-rec-title">${escapeHtml(title)}</h4>
                        <p class="ats-rec-body">${formatInlineMarkdown(body)}</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="ats-recommendation-card">
                <div class="ats-rec-icon"><i data-lucide="lightbulb"></i></div>
                <div class="ats-rec-content">
                    <p class="ats-rec-body">${formatInlineMarkdown(clean)}</p>
                </div>
            </div>
        `;
    }

    function renderAtsDashboard(atsData) {
        const formContainer = document.getElementById('active-section-form');
        if (!formContainer) return;

        const data = atsData || calculateLocalAtsScore(state.currentResume ? state.currentResume.content : {});
        const score = data.score !== undefined ? data.score : 75;
        const grade = data.grade || (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D');

        let gradeClass = 'good';
        let gradeLabel = `Grade ${grade} • ATS Ready`;
        let headline = 'Your resume is in solid shape for ATS systems!';
        let description = 'Applicant Tracking Systems will parse your experience and credentials smoothly. Review the suggestions below to reach a 95%+ score.';
        let ringClass = 'good';
        let scoreIcon = 'check-circle-2';

        if (score >= 85) {
            gradeClass = 'excellent';
            ringClass = 'excellent';
            gradeLabel = `Grade ${grade} • Highly Optimized`;
            headline = 'Outstanding ATS Readiness & Keyword Match!';
            description = 'Your resume demonstrates high keyword strength, balanced structure, and quantifiable accomplishments that recruiters love.';
            scoreIcon = 'shield-check';
        } else if (score >= 70) {
            gradeClass = 'good';
            ringClass = 'good';
            gradeLabel = `Grade ${grade} • ATS Ready`;
            headline = 'Solid Foundation with Room for High Impact';
            description = 'Core sections are properly formatted. Adding more action verbs and project outcomes will elevate you to the top tier.';
            scoreIcon = 'check-circle';
        } else if (score >= 55) {
            gradeClass = 'warning';
            ringClass = 'warning';
            gradeLabel = `Grade ${grade} • Optimization Needed`;
            headline = 'Key Sections Need Further Detail';
            description = 'Some essential sections or industry keywords are missing or brief. Address the checklist below to boost your visibility.';
            scoreIcon = 'alert-triangle';
        } else {
            gradeClass = 'poor';
            ringClass = 'poor';
            gradeLabel = `Grade ${grade} • Critical Revisions`;
            headline = 'Resume Requires Structural Updates';
            description = 'ATS parsers may miss critical details due to incomplete contact info, brief experience, or missing skills.';
            scoreIcon = 'alert-circle';
        }

        const strokeDash = Math.max(0, Math.min(314, 314 - (314 * score) / 100));

        const content = (state.currentResume && state.currentResume.content) || {};
        const textStr = JSON.stringify(content).toLowerCase();
        const wordCount = textStr.split(/\s+/).filter(Boolean).length;
        const skillsCount = (Array.isArray(content.skills) ? content.skills.length : 0) +
            ((content.skillCategories || []).flatMap(c => c.items || []).length);

        const verbCheck = (data.feedback || []).find(f => f.id === 'impact_words');
        const verbPassed = verbCheck ? verbCheck.passed : score >= 70;
        const verbDetail = verbCheck ? verbCheck.detail : 'Action verbs analyzed';

        const secCheck = (data.feedback || []).filter(f => ['summary', 'experience', 'skills', 'education'].includes(f.id));
        const secPassedCount = secCheck.filter(f => f.passed).length;

        const improvements = (data.topImprovements && data.topImprovements.length > 0)
            ? data.topImprovements
            : ['Your resume is well structured and ready for submission!'];

        const checklistItems = (data.feedback || []).filter(f => !['impact_words', 'skill_density', 'length'].includes(f.id));

        formContainer.innerHTML = `
            <div class="ats-dashboard-view">
                <!-- Header Banner -->
                <div class="section-header-banner ats-header-banner">
                    <div class="section-header-text">
                        <div class="ats-badge-pill"><i data-lucide="shield-check"></i> ATS Intelligence Center</div>
                        <h2>ATS Resume Score & Analysis</h2>
                        <p class="section-header-sub">Live Applicant Tracking System audit, keyword density, and role-specific recommendations.</p>
                    </div>
                    <div class="ats-header-actions">
                        <button type="button" class="secondary-btn sm" id="ats-refresh-btn"><i data-lucide="refresh-cw"></i> Re-Scan</button>
                        <button type="button" class="primary-btn sm" id="ats-edit-resume-btn"><i data-lucide="pen-tool"></i> Edit Resume</button>
                    </div>
                </div>

                <!-- Hero Score Box -->
                <div class="ats-hero-card">
                    <div class="ats-score-dial-wrap">
                        <svg class="ats-score-ring" viewBox="0 0 120 120">
                            <circle class="ats-ring-bg" cx="60" cy="60" r="50"></circle>
                            <circle class="ats-ring-fill ${ringClass}" cx="60" cy="60" r="50" style="stroke-dashoffset: ${strokeDash};"></circle>
                        </svg>
                        <div class="ats-score-dial-inner">
                            <span class="ats-score-number">${score}%</span>
                            <span class="ats-score-label">ATS Score</span>
                        </div>
                    </div>
                    <div class="ats-score-summary">
                        <div class="ats-grade-badge ${gradeClass}">
                            <i data-lucide="${scoreIcon}"></i> ${gradeLabel}
                        </div>
                        <h3 class="ats-score-headline">${headline}</h3>
                        <p class="ats-score-description">${description}</p>
                        <div class="ats-hero-action-row">
                            <button type="button" class="primary-btn sm" id="center-ai-scan-btn"><i data-lucide="sparkles"></i> Run AI Deep Scan</button>
                            <button type="button" class="secondary-btn sm" id="center-refresh-scan-btn"><i data-lucide="refresh-cw"></i> Quick Audit</button>
                        </div>
                    </div>
                </div>

                <!-- 4 Key Metrics Cards -->
                <div class="ats-metrics-grid">
                    <div class="ats-metric-card">
                        <div class="ats-metric-top">
                            <div class="ats-metric-icon"><i data-lucide="zap"></i></div>
                            <span class="ats-metric-status ${verbPassed ? 'pass' : 'warn'}">${verbPassed ? 'Strong' : 'Needs Boost'}</span>
                        </div>
                        <div class="ats-metric-val">${verbPassed ? 'High Impact' : 'Moderate'}</div>
                        <div class="ats-metric-lbl">${verbDetail}</div>
                    </div>

                    <div class="ats-metric-card">
                        <div class="ats-metric-top">
                            <div class="ats-metric-icon"><i data-lucide="layout-grid"></i></div>
                            <span class="ats-metric-status ${secPassedCount >= 3 ? 'pass' : 'warn'}">${secPassedCount}/4 Core</span>
                        </div>
                        <div class="ats-metric-val">${secPassedCount === 4 ? 'All Complete' : `${secPassedCount} Complete`}</div>
                        <div class="ats-metric-lbl">Contact, Summary, Exp, Skills</div>
                    </div>

                    <div class="ats-metric-card">
                        <div class="ats-metric-top">
                            <div class="ats-metric-icon"><i data-lucide="cpu"></i></div>
                            <span class="ats-metric-status ${skillsCount >= 5 ? 'pass' : 'warn'}">${skillsCount >= 5 ? 'Optimal' : 'Add More'}</span>
                        </div>
                        <div class="ats-metric-val">${skillsCount} Skills</div>
                        <div class="ats-metric-lbl">Technical & soft skills detected</div>
                    </div>

                    <div class="ats-metric-card">
                        <div class="ats-metric-top">
                            <div class="ats-metric-icon"><i data-lucide="file-text"></i></div>
                            <span class="ats-metric-status ${wordCount >= 180 ? 'pass' : 'warn'}">${wordCount >= 180 ? 'Ideal' : 'Short'}</span>
                        </div>
                        <div class="ats-metric-val">~${wordCount} Words</div>
                        <div class="ats-metric-lbl">${wordCount > 600 ? '2 Page Standard' : '1 Page Standard'}</div>
                    </div>
                </div>

                <!-- Tailor for Specific Job Posting -->
                <div class="ats-targeting-card">
                    <div class="ats-card-header">
                        <h3 class="ats-card-title"><i data-lucide="target"></i> Target a Specific Job Opportunity</h3>
                        <p class="ats-card-sub">Paste the job description and title to compare keywords and generate tailored AI recommendations.</p>
                    </div>
                    <div class="ats-targeting-grid">
                        <div class="ats-targeting-field">
                            <label for="center-ats-job-title">Target Job Title (Optional)</label>
                            <input type="text" id="center-ats-job-title" placeholder="e.g. Senior Software Engineer, Data Scientist, Product Manager..." value="${escapeHtml(targetJobTitleCache)}">
                        </div>
                        <div class="ats-targeting-field">
                            <label for="center-ats-jd">Company Job Description / Requirements (Optional)</label>
                            <textarea id="center-ats-jd" rows="4" placeholder="Paste the full job description or responsibilities here to discover missing keywords and custom suggestions...">${escapeHtml(targetJdCache)}</textarea>
                        </div>
                    </div>
                    <div class="ats-targeting-footer">
                        <button type="button" class="primary-btn sm" id="center-run-targeting-btn"><i data-lucide="sparkles"></i> Analyze Match with Job Description</button>
                    </div>
                </div>

                <!-- Actionable Recommendations -->
                <div class="ats-recommendations-section">
                    <div class="ats-card-header" style="margin-bottom:0.75rem;">
                        <h3 class="ats-card-title"><i data-lucide="lightbulb"></i> Actionable AI & ATS Recommendations</h3>
                        <p class="ats-card-sub">High-priority suggestions to maximize your chances of getting recruiter callbacks.</p>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:0.85rem;">
                        ${improvements.map(imp => formatRecommendationItem(imp)).join('')}
                    </div>
                </div>

                <!-- Detailed Structural Checklist -->
                <div class="ats-checklist-section">
                    <div class="ats-card-header" style="margin-bottom:0.75rem;">
                        <h3 class="ats-card-title"><i data-lucide="check-square"></i> Structural & Section Audit</h3>
                        <p class="ats-card-sub">Verification checklist of all core resume components expected by ATS scanners.</p>
                    </div>
                    <div class="ats-checklist-grid">
                        ${checklistItems.map(item => `
                            <div class="ats-checklist-item">
                                <div class="ats-check-left">
                                    <div class="ats-check-icon ${item.passed ? 'pass' : 'warn'}">
                                        <i data-lucide="${item.passed ? 'check' : 'alert-circle'}"></i>
                                    </div>
                                    <div class="ats-check-text">
                                        <strong>${escapeHtml(item.label)}</strong>
                                        <span>${escapeHtml(item.detail)}</span>
                                    </div>
                                </div>
                                <span class="ats-check-badge ${item.passed ? 'pass' : 'warn'}">${item.passed ? 'Passed' : 'Needs Attention'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Footer Return Action -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:1.5rem 1.75rem; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:14px; margin-top:0.5rem; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <h4 style="margin:0 0 4px 0; color:#0F172A; font-size:1rem; font-weight:700;">Ready to apply these improvements?</h4>
                        <p style="margin:0; font-size:0.86rem; color:#64748B;">Head back to the resume editor to refine your content and bullet points.</p>
                    </div>
                    <button type="button" class="primary-btn" id="ats-footer-edit-btn"><i data-lucide="pen-tool"></i> Return to Resume Editor</button>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Wire up buttons
        const refreshBtn = document.getElementById('ats-refresh-btn');
        if (refreshBtn) refreshBtn.onclick = () => openAtsDashboard(true);

        const quickAuditBtn = document.getElementById('center-refresh-scan-btn');
        if (quickAuditBtn) quickAuditBtn.onclick = () => openAtsDashboard(true);

        const editBtn = document.getElementById('ats-edit-resume-btn');
        if (editBtn) editBtn.onclick = () => returnToResumeEditor();

        const footerEditBtn = document.getElementById('ats-footer-edit-btn');
        if (footerEditBtn) footerEditBtn.onclick = () => returnToResumeEditor();

        const aiScanBtn = document.getElementById('center-ai-scan-btn');
        if (aiScanBtn) aiScanBtn.onclick = () => runAiScanFromCenter();

        const targetingBtn = document.getElementById('center-run-targeting-btn');
        if (targetingBtn) targetingBtn.onclick = () => runAiScanFromCenter();

        const jobTitleInput = document.getElementById('center-ats-job-title');
        if (jobTitleInput) {
            jobTitleInput.oninput = () => {
                targetJobTitleCache = jobTitleInput.value;
                const sideJob = document.getElementById('ats-job-title-input');
                if (sideJob) sideJob.value = targetJobTitleCache;
            };
        }

        const jdTextarea = document.getElementById('center-ats-jd');
        if (jdTextarea) {
            jdTextarea.oninput = () => {
                targetJdCache = jdTextarea.value;
                const sideJd = document.getElementById('ats-jd-input');
                if (sideJd) sideJd.value = targetJdCache;
            };
        }
    }

    async function openAtsDashboard(forceRefresh = false) {
        if (!state.currentResume) return;
        state.currentMode = 'ats';

        // 1. Activate ATS Tab in Sidebar
        document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.panel === 'analysis-panel');
        });
        document.querySelectorAll('.sidebar-panels .panel').forEach(p => {
            p.classList.toggle('active', p.id === 'analysis-panel');
        });
        document.querySelectorAll('.section-nav-btn').forEach(b => b.classList.remove('active'));

        // 2. Immediate instant render using local analysis or cached data
        if (!currentAtsData || forceRefresh) {
            currentAtsData = calculateLocalAtsScore(state.currentResume.content);
        }
        renderAtsDashboard(currentAtsData);

        const sidebarScoreEl = document.getElementById('sidebar-ats-percentage');
        if (sidebarScoreEl) sidebarScoreEl.innerText = `${currentAtsData.score}%`;

        // 3. Fetch from backend /api/resumes/:id/ats if available
        if (state.currentResume.id && (forceRefresh || !currentAtsData._fromServer)) {
            try {
                const data = await apiFetch(`/resumes/${state.currentResume.id}/ats`);
                if (data && data.ats) {
                    const srv = data.ats;
                    currentAtsData = {
                        score: srv.score !== undefined ? srv.score : currentAtsData.score,
                        grade: srv.grade || currentAtsData.grade,
                        feedback: srv.feedback && srv.feedback.length ? srv.feedback : currentAtsData.feedback,
                        topImprovements: srv.topImprovements && srv.topImprovements.length ? srv.topImprovements : currentAtsData.topImprovements,
                        aiFeedback: srv.aiFeedback,
                        _fromServer: true
                    };
                    renderAtsDashboard(currentAtsData);
                    if (sidebarScoreEl) sidebarScoreEl.innerText = `${currentAtsData.score}%`;
                }
            } catch (err) {
                console.warn('[ResumePro] Server ATS fetch skipped, using instant local analysis:', err);
            }
        }
    }

    function returnToResumeEditor(sectionKey) {
        state.currentMode = 'content';
        const targetSection = sectionKey || state.lastActiveSection || 'contact';

        document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.panel === 'content-panel');
        });
        document.querySelectorAll('.sidebar-panels .panel').forEach(p => {
            p.classList.toggle('active', p.id === 'content-panel');
        });

        renderSectionForm(targetSection);
    }
    window.returnToResumeEditor = returnToResumeEditor;
    window.openAtsDashboard = openAtsDashboard;

    async function runAiScanFromCenter() {
        const hasAccess = await requireAiAccess();
        if (!hasAccess) return;

        const jobTitleInput = document.getElementById('center-ats-job-title');
        const jdInput = document.getElementById('center-ats-jd');
        const targetJob = jobTitleInput ? jobTitleInput.value.trim() : targetJobTitleCache;
        const jobDescription = jdInput ? jdInput.value.trim() : targetJdCache;

        targetJobTitleCache = targetJob;
        targetJdCache = jobDescription;

        const scanBtn = document.getElementById('center-ai-scan-btn');
        const jdScanBtn = document.getElementById('center-run-targeting-btn');
        const sideScanBtn = document.getElementById('sidebar-ai-scan-btn');
        const origScanHtml = scanBtn ? scanBtn.innerHTML : '';
        const origJdHtml = jdScanBtn ? jdScanBtn.innerHTML : '';
        const origSideHtml = sideScanBtn ? sideScanBtn.innerHTML : '';

        if (scanBtn) scanBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Analyzing...';
        if (jdScanBtn) jdScanBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Analyzing with AI...';
        if (sideScanBtn) sideScanBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Scanning...';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        showToast('Running AI Deep Scan...', 'info');

        try {
            const result = await apiFetch('/ai/scan', {
                method: 'POST',
                body: JSON.stringify({
                    resumeData: state.currentResume.content,
                    useAi: true,
                    jobDescription: jobDescription,
                    targetJob: targetJob
                })
            });

            if (result && result.data) {
                const d = result.data;
                const newScore = d.aiScore || d.score || (currentAtsData ? currentAtsData.score : 80);
                currentAtsData = {
                    score: newScore,
                    grade: d.aiGrade || d.grade || (currentAtsData ? currentAtsData.grade : 'B'),
                    feedback: d.feedback || (currentAtsData ? currentAtsData.feedback : []),
                    topImprovements: d.topImprovements || (currentAtsData ? currentAtsData.topImprovements : []),
                    aiFeedback: d.aiFeedback,
                    _fromServer: true,
                    _aiScanned: true
                };

                renderAtsDashboard(currentAtsData);

                const sidebarScoreEl = document.getElementById('sidebar-ats-percentage');
                if (sidebarScoreEl) sidebarScoreEl.innerText = `${newScore}%`;

                showToast('AI Deep Scan completed successfully!', 'success');
            }
        } catch (err) {
            showToast('AI Deep Scan failed: ' + (err.message || 'Please try again.'), 'error');
        } finally {
            if (scanBtn) scanBtn.innerHTML = origScanHtml;
            if (jdScanBtn) jdScanBtn.innerHTML = origJdHtml;
            if (sideScanBtn) sideScanBtn.innerHTML = origSideHtml;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // --- Wire Up Top Navbar & Sidebar ATS Triggers ---
    const atsCheckBtn = document.getElementById('ats-check-btn');
    if (atsCheckBtn) {
        atsCheckBtn.onclick = () => openAtsDashboard();
    }

    // Sidebar Tabs Logic
    document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const panel = btn.dataset.panel;
            if (panel === 'analysis-panel') {
                openAtsDashboard();
            } else {
                returnToResumeEditor(state.lastActiveSection || 'contact');
            }
        };
    });

    // Sidebar ATS Panel Buttons
    const sideOpenCenterBtn = document.getElementById('sidebar-open-center-ats-btn');
    if (sideOpenCenterBtn) {
        sideOpenCenterBtn.onclick = () => openAtsDashboard();
    }
    const sideBackToContentBtn = document.getElementById('sidebar-back-to-content-btn');
    if (sideBackToContentBtn) {
        sideBackToContentBtn.onclick = () => returnToResumeEditor(state.lastActiveSection || 'contact');
    }

    const sideAiScanBtn = document.getElementById('sidebar-ai-scan-btn');
    if (sideAiScanBtn) {
        sideAiScanBtn.onclick = async () => {
            await openAtsDashboard();
            await runAiScanFromCenter();
        };
    }

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
    const originalText = btn ? btn.innerHTML : '';
    const originalMobileText = mobileBtn ? mobileBtn.innerHTML : '';

    if (btn) btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Generating PDF...';
    if (mobileBtn) mobileBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Generating...';
    lucide.createIcons();

    let printFrame = null;
    try {
        // ── Step 1: Obtain clean, downloadable HTML (client-side or backend) ──
        let htmlText = '';
        if (window.ResumeRenderer && typeof window.ResumeRenderer.buildClientPreviewHtml === 'function') {
            try {
                const template = window.ResumeRenderer.getTemplateById(state.currentResume.template_id);
                htmlText = template && window.ResumeRenderer.buildClientPreviewHtml(
                    state.currentResume.content,
                    state.currentResume.design,
                    template,
                    state.currentResume.sectionOrder
                );
            } catch (err) {
                console.warn('[ResumePro] Client HTML build failed, falling back to backend:', err);
            }
        }

        if (!htmlText) {
            const previewResponse = await fetch(`${API_BASE}/export/download`, {
                method: 'POST',
                headers: await authedHeaders(),
                body: JSON.stringify({
                    content: state.currentResume.content,
                    templateId: state.currentResume.template_id,
                    design: state.currentResume.design,
                    sectionOrder: state.currentResume.sectionOrder
                })
            });

            if (previewResponse.status === 401) {
                throw new Error('Please sign in again to download your resume.');
            }
            if (!previewResponse.ok) {
                throw new Error('Could not prepare your resume for download.');
            }

            htmlText = await previewResponse.text();
        }

        // ── Step 2: Render into a hidden iframe at exact A4 width ─────────────
        printFrame = document.createElement('iframe');
        printFrame.style.cssText = [
            'position:fixed', 'left:0', 'top:0',
            'width:794px', 'height:1123px',
            'border:none', 'opacity:0.01',
            'z-index:-9999', 'pointer-events:none'
        ].join(';');
        document.body.appendChild(printFrame);

        await new Promise(resolve => {
            printFrame.onload = resolve;
            printFrame.contentDocument.open();
            printFrame.contentDocument.write(htmlText);
            printFrame.contentDocument.close();
        });

        // Wait for fonts to be fully loaded inside the iframe
        if (printFrame.contentWindow && printFrame.contentWindow.document && printFrame.contentWindow.document.fonts) {
            try {
                await printFrame.contentWindow.document.fonts.ready;
            } catch (e) {
                console.warn('Iframe fonts loading failed or timed out:', e);
            }
        }

        // Wait a short buffer for the paginator script to fully settle after fonts are loaded
        await new Promise(r => setTimeout(r, 600));

        const iframeDoc = printFrame.contentDocument;

        // ── Step 3: Collect only pages that have actual content ────────────────
        const previewContent = iframeDoc.getElementById('preview-content');
        const allPageEls = previewContent
            ? Array.from(previewContent.querySelectorAll('.page'))
            : [];

        // Every page holds a full copy of the resume shifted under a clipping
        // viewport, so page.textContent is identical on all of them — blankness
        // has to be judged by what actually falls inside the page box.
        const NodeFilterRef = (printFrame.contentWindow && printFrame.contentWindow.NodeFilter) || NodeFilter;

        const pageHasVisibleContent = (page) => {
            const pageRect = page.getBoundingClientRect();
            if (pageRect.height <= 0) return false;

            const showsInsidePage = (rect) => {
                if (!rect || rect.width <= 1 || rect.height <= 1) return false;
                const top = Math.max(rect.top, pageRect.top);
                const bottom = Math.min(rect.bottom, pageRect.bottom);
                return bottom - top > 2;
            };

            const walker = iframeDoc.createTreeWalker(page, NodeFilterRef.SHOW_TEXT, null, false);
            const range = iframeDoc.createRange();
            let node;
            while ((node = walker.nextNode())) {
                if (!node.nodeValue || !node.nodeValue.trim()) continue;
                range.selectNodeContents(node);
                const rects = range.getClientRects();
                for (let i = 0; i < rects.length; i++) {
                    if (showsInsidePage(rects[i])) return true;
                }
            }

            return Array.from(page.querySelectorAll('img, svg, canvas, video'))
                .some(el => showsInsidePage(el.getBoundingClientRect()));
        };

        let contentPages = allPageEls.filter(pageHasVisibleContent);

        // A resume with nothing typed in it still exports as the one page the
        // user is looking at, rather than failing outright.
        if (contentPages.length === 0) contentPages = allPageEls.slice(0, 1);

        if (contentPages.length === 0) {
            throw new Error('No resume content found to export.');
        }

        // ── Step 4: Prepare each page element for clean capture ───────────────
        const A4_PX = 1123;
        const A4_W  = 794;

        // Strip preview-only chrome from the wrapper
        if (previewContent) {
            previewContent.style.cssText =
                'display:block!important;width:794px!important;padding:0!important;' +
                'gap:0!important;background:#fff!important;margin:0!important;';
        }
        iframeDoc.body.style.cssText =
            'margin:0!important;padding:0!important;background:#fff!important;' +
            'overflow:hidden!important;display:block!important;';

        contentPages.forEach(pg => {
            pg.style.cssText =
                `display:block!important;width:${A4_W}px!important;` +
                `height:${A4_PX}px!important;overflow:hidden!important;` +
                'margin:0!important;box-shadow:none!important;' +
                'border-radius:0!important;background:#fff!important;';
        });

        // ── Step 5: Capture each page with html2canvas, stitch into one PDF ───
        // Direct jsPDF + html2canvas — no html2pdf wrapper, so zero blank pages.
        const jsPDFLib = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : window.jsPDF;
        if (!jsPDFLib) throw new Error('jsPDF library not loaded.');
        if (typeof html2canvas === 'undefined') throw new Error('html2canvas library not loaded.');

        const pdf = new jsPDFLib({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        const A4_MM_W = 210;
        const A4_MM_H = 297;

        // Collect iframe styles once to inject into each canvas clone
        const iframeStyles = Array.from(iframeDoc.head.querySelectorAll('style,link'))
            .map(el => el.outerHTML).join('\n');

        for (let i = 0; i < contentPages.length; i++) {
            const pg = contentPages[i];

            const canvas = await html2canvas(pg, {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                letterRendering: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth:  A4_W,
                windowHeight: A4_PX,
                width:  A4_W,
                height: A4_PX,
                x: 0, y: 0,
                logging: false,
                imageTimeout: 15000,
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    // Inject iframe styles so fonts/colours render correctly
                    clonedDoc.head.insertAdjacentHTML('beforeend', iframeStyles);
                    clonedDoc.body.style.cssText =
                        'background:#fff;margin:0;padding:0;display:block;overflow:hidden;';
                    // Style the cloned page element itself
                    const clonedPg = clonedDoc.querySelector('.page');
                    if (clonedPg) {
                        clonedPg.style.cssText =
                            `display:block!important;width:${A4_W}px!important;` +
                            `height:${A4_PX}px!important;overflow:hidden!important;` +
                            'margin:0!important;box-shadow:none!important;' +
                            'border-radius:0!important;background:#fff!important;';
                    }
                }
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.98);

            // Each content page → exactly one PDF page, no gaps
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, A4_MM_W, A4_MM_H, '', 'FAST');
        }

        // Determine the export filename based on the candidate's name entered on the resume:
        const candidateName = (
            (state.currentResume && state.currentResume.content && state.currentResume.content.contact && state.currentResume.content.contact.name) ||
            (document.querySelector('input[data-path="contact.name"]') && document.querySelector('input[data-path="contact.name"]').value) ||
            ''
        ).trim();

        const titleVal = (document.getElementById('resume-title-input') ? document.getElementById('resume-title-input').value : '').trim();
        const isDefault = !titleVal ||
            titleVal.toLowerCase() === 'my new resume' ||
            titleVal.toLowerCase() === 'untitled resume';

        // Prefer candidate's name entered on the resume; if missing, use custom title or fallback to 'Resume'
        let baseFilename = candidateName || (!isDefault ? titleVal : 'Resume');
        baseFilename = baseFilename.replace(/[/\\?%*:|"<>]/g, '').trim() || 'Resume';

        const filename = `${baseFilename}.pdf`;
        console.log('Generating PDF with filename:', filename);

        // Generate blob and trigger standard download to ensure extension and name are set correctly
        const blob = pdf.output('blob');
        console.log('PDF blob created, size bytes:', blob.size);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showToast('PDF downloaded successfully!', 'success');

    } catch (err) {
        console.error('PDF Generation Error:', err);
        showToast(err && err.message ? err.message : 'Failed to generate PDF. Please try again.', 'error');
    } finally {
        if (printFrame && printFrame.parentNode) document.body.removeChild(printFrame);
        if (btn) btn.innerHTML = originalText;
        if (mobileBtn) mobileBtn.innerHTML = originalMobileText;
        lucide.createIcons();
    }
}

async function updateDesignSetting(key, value) {
    if (!state.currentResume) return;
    if (!state.currentResume.design) state.currentResume.design = {};
    state.currentResume.design[key] = value;
    updatePreview();
    markDirty();
}

// --- Saving ---------------------------------------------------------------
//
// Every edit funnels through markDirty(). With autosave on that schedules a
// debounced PATCH to /resumes/:id; with it off the resume simply stays dirty
// until the user presses Save (or Ctrl+S), and leaving the page warns first.
// Either way the resume lives in the database, so signing back in later brings
// it straight back through the My Resumes view.

const AUTOSAVE_PREF_KEY = 'resumepro_autosave_enabled';
const AUTOSAVE_DELAY = 1500;

function loadAutosavePref() {
    try {
        const stored = localStorage.getItem(AUTOSAVE_PREF_KEY);
        state.autosaveEnabled = stored === null ? true : stored === 'true';
    } catch (e) {
        state.autosaveEnabled = true;
    }
    return state.autosaveEnabled;
}

function syncAutosaveToggle() {
    const toggle = document.getElementById('autosave-toggle');
    if (toggle) toggle.checked = state.autosaveEnabled;
}

function setAutosaveEnabled(enabled) {
    state.autosaveEnabled = !!enabled;
    try { localStorage.setItem(AUTOSAVE_PREF_KEY, String(state.autosaveEnabled)); } catch (e) { }
    syncAutosaveToggle();

    if (state.autosaveEnabled) {
        showToast('Autosave is on - your changes save themselves.', 'success');
        if (state.isDirty) scheduleAutosave();
    } else {
        showToast('Autosave is off - remember to press Save.', 'info');
        if (state.isDirty) setSaveStatus('dirty');
    }
}
window.setAutosaveEnabled = setAutosaveEnabled;

function setSaveStatus(kind) {
    const statusEl = document.querySelector('.save-status');
    if (!statusEl) return;

    // Typing marks the resume dirty repeatedly; re-rendering the pill (and with
    // it every Lucide icon on the page) each time is wasted work.
    if (statusEl.dataset.statusKind === kind && kind !== 'saved') return;
    statusEl.dataset.statusKind = kind;

    const presets = {
        saved: { icon: 'check', text: 'Saved' },
        saving: { icon: 'loader', text: 'Saving...' },
        dirty: { icon: 'circle-dot', text: 'Unsaved changes' },
        failed: { icon: 'alert-triangle', text: 'Save failed' }
    };
    const preset = presets[kind] || presets.saved;
    const spin = kind === 'saving'
        ? ' class="spin" style="animation: spin 1.5s linear infinite; display: inline-block;"'
        : '';

    statusEl.className = `save-status ${kind}`;
    statusEl.innerHTML = `<i data-lucide="${preset.icon}"${spin}></i> ${preset.text}`;

    if (kind === 'saved' && state.lastSavedAt) {
        statusEl.title = `Last saved ${state.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (kind === 'dirty') {
        statusEl.title = state.autosaveEnabled ? 'Saving shortly...' : 'Press Save (Ctrl+S) to store these changes';
    } else {
        statusEl.title = '';
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/** Records that the in-memory resume is ahead of the database. */
function markDirty() {
    if (!state.currentResume) return;
    state.isDirty = true;
    state.currentResume._needsSync = true;
    cacheResumeDraft(state.currentResume);
    setSaveStatus('dirty');
    if (state.autosaveEnabled) scheduleAutosave();
}

// Kept as an alias so any older call site still routes through markDirty().
const saveResumeDebounced = markDirty;

const scheduleAutosave = debounce(() => {
    if (!state.autosaveEnabled || !state.isDirty) return;
    saveResumeNow({ silent: true });
}, AUTOSAVE_DELAY);

/**
 * Writes the current resume to the database.
 *
 * `silent` keeps autosave quiet; a manual Save reports success or failure with
 * a toast. Returns true only when the row was actually updated.
 */
// One save path ensures that every confirmed cloud edit also creates history.
let activeSavePromise = null;

function resumeSavePayload(resume) {
    return {
        title: resume.title || 'Untitled Resume',
        templateId: resume.template_id || null,
        content: resume.content || {},
        design: resume.design || {},
        sectionOrder: resume.sectionOrder || [],
    };
}

function cacheResumeDraft(resume) {
    const index = state.resumes.findIndex(r => r.id === resume.id);
    if (index < 0) state.resumes.unshift(resume);
    else state.resumes[index] = resume;
    const key = getUserResumeCacheKey({ id: resume.user_id });
    if (!key) return false;
    try {
        localStorage.setItem(key, JSON.stringify(state.resumes));
        return true;
    } catch (err) {
        return false;
    }
}

async function saveResumeNow(options = {}) {
    const { silent = false } = options;
    const resume = state.currentResume;
    if (!resume) return false;

    // Callers (including Back) wait for the same save instead of leaving early.
    if (activeSavePromise) {
        const saved = await activeSavePromise;
        if (!saved || state.currentResume !== resume) return false;
        return state.isDirty ? saveResumeNow(options) : true;
    }

    state.isSaving = true;
    const saveTask = (async () => {
        try {
            const user = await getResumeUser();
            if (!user || (resume.user_id && resume.user_id !== user.id && resume.user_id !== user.email)) {
                throw new Error('Please sign in to the account that owns this resume.');
            }
            resume.user_id = user.id || user.email;
            let hasNewerChanges;
            do {
                if (state.currentResume === resume) setSaveStatus('saving');
                // Serialize before the request: later typing cannot mutate this save.
                const snapshot = JSON.stringify(resumeSavePayload(resume));
                const isNew = resume.isLocal || String(resume.id).startsWith('res_');
                const payload = JSON.parse(snapshot);
                if (isNew && !String(resume.id).startsWith('res_')) payload.id = resume.id;
                let savedId = null;
                let updatedAt = null;

                // 1. Primary: Try API call (handles server-side versioning and history)
                try {
                    const data = await apiFetch(isNew ? '/resumes' : '/resumes/' + resume.id, {
                        method: isNew ? 'POST' : 'PATCH',
                        body: JSON.stringify(payload),
                        silent: true
                    });
                    if (data && data.resume && data.resume.id) {
                        savedId = data.resume.id;
                        updatedAt = data.resume.updated_at || new Date().toISOString();
                    }
                } catch (apiErr) {
                    console.warn('[ResumePro] API save attempt failed, trying direct Supabase fallback...', apiErr);
                }

                // 2. Direct Supabase cloud save fallback if API failed or offline
                if (!savedId && user && user.id && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && typeof supabaseClient !== 'undefined' && supabaseClient) {
                    try {
                        const sbPayload = {
                            title: payload.title || 'Untitled Resume',
                            template_id: payload.templateId || null,
                            content: payload.content || {},
                            design: payload.design || {},
                            section_order: payload.sectionOrder || [],
                            updated_at: new Date().toISOString()
                        };

                        if (isNew) {
                            const newId = (!String(resume.id).startsWith('res_') && resume.id) ? resume.id : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null);
                            const insertData = { ...sbPayload, user_id: user.id };
                            if (newId) insertData.id = newId;

                            const { data: sbCreated, error: sbInsertErr } = await supabaseClient
                                .from('resumes')
                                .insert(insertData)
                                .select('id, updated_at')
                                .single();

                            if (!sbInsertErr && sbCreated) {
                                savedId = sbCreated.id;
                                updatedAt = sbCreated.updated_at;
                            } else if (sbInsertErr) {
                                console.warn('[ResumePro] Supabase direct insert failed:', sbInsertErr);
                            }
                        } else {
                            const { data: sbUpdated, error: sbUpdateErr } = await supabaseClient
                                .from('resumes')
                                .update(sbPayload)
                                .eq('id', resume.id)
                                .eq('user_id', user.id)
                                .select('id, updated_at')
                                .single();

                            if (!sbUpdateErr && sbUpdated) {
                                savedId = sbUpdated.id;
                                updatedAt = sbUpdated.updated_at;
                            } else if (sbUpdateErr) {
                                console.warn('[ResumePro] Supabase direct update failed:', sbUpdateErr);
                            }
                        }
                    } catch (sbErr) {
                        console.warn('[ResumePro] Direct Supabase save error:', sbErr);
                    }
                }

                if (!savedId) throw new Error('Save was not confirmed.');
                const finalUpdatedAt = updatedAt || new Date().toISOString();

                resume.id = savedId;
                resume.isLocal = false;
                resume.updated_at = finalUpdatedAt;
                hasNewerChanges = JSON.stringify(resumeSavePayload(resume)) !== snapshot;
                resume._needsSync = hasNewerChanges;
                cacheResumeDraft(resume);
                if (state.currentResume === resume) {
                    state.isDirty = hasNewerChanges;
                    state.lastSavedAt = new Date(updatedAt || Date.now());
                    setSaveStatus(hasNewerChanges ? 'dirty' : 'saved');
                    updateViewUrl();
                }
            } while (hasNewerChanges && state.currentResume === resume);
            if (!silent && !hasNewerChanges) showToast('Resume saved to your account', 'success');
            return !hasNewerChanges;
        } catch (err) {
            resume._needsSync = true;
            const cached = cacheResumeDraft(resume);
            if (state.currentResume === resume) {
                state.isDirty = true;
                setSaveStatus('failed');
            }
            if (!silent) showToast(cached
                ? 'Cloud save failed. Your draft is kept on this device. Please retry.'
                : 'Save failed. Keep this page open and retry to avoid losing changes.', 'error');
            return false;
        }
    })();
    activeSavePromise = saveTask.finally(() => {
        state.isSaving = false;
        activeSavePromise = null;
    });
    return activeSavePromise;
}
window.saveResumeNow = saveResumeNow;

/** Best-effort write of pending autosaved work (tab hidden, view change). */
function flushPendingSave() {
    if (!state.currentResume || !state.isDirty || !state.autosaveEnabled) return;
    saveResumeNow({ silent: true });
}

/**
 * Keeps the address bar in step with the open view, so a refresh lands on
 * the same screen:
 *   editor    -> resume.html?resume=<id>
 *   templates -> resume.html?view=templates
 *   landing   -> resume.html
 * replaceState, not pushState: switching views does not add history entries.
 */
function updateViewUrl() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('resume');
        url.searchParams.delete('view');
        if (state.activeView === 'editor' && state.currentResume && state.currentResume.id) {
            url.searchParams.set('resume', state.currentResume.id);
        } else if (state.activeView === 'templates') {
            url.searchParams.set('view', 'templates');
        }
        const next = url.pathname + url.search;
        if (next !== window.location.pathname + window.location.search || window.location.hash) {
            window.history.replaceState(null, '', next);
        }
    } catch (e) { /* address bar sync is a convenience only */ }
}

/** On load (refresh): reopen the view in the address bar. */
async function restoreViewFromUrl() {
    const resumeId = urlParams.get('resume');
    const view = urlParams.get('view');
    if (!resumeId && view !== 'templates') return;
    try {
        const user = await getResumeUser();
        if (!user) return;
        if (resumeId) {
            try {
                await openEditor(resumeId);
            } catch (e) {
                switchView('templates');
            }
        } else {
            switchView('templates');
        }
    } finally {
        // Lift the loading screen set in resume.html's <head>.
        document.documentElement.classList.remove('kp-restoring', 'kp-restoring-resume', 'kp-restoring-templates');
    }
}

/** Drops the editor's in-memory resume once the user has left it behind. */
function clearEditorState() {
    state.currentResume = null;
    state.isDirty = false;
    const iframe = document.getElementById('resume-preview-iframe');
    if (iframe) {
        iframe.removeAttribute('srcdoc');
        iframe.src = 'about:blank';
    }
}

/**
 * Leaves the editor for another view, without silently dropping work:
 * autosave flushes, and with autosave off the user is asked first.
 */
async function leaveEditor(targetView) {
    if (state.currentResume && state.isDirty) {
        if (state.autosaveEnabled) {
            const saved = await saveResumeNow({ silent: true });
            if (!saved) {
                showToast('Your changes are not saved to your account yet. Please retry before leaving.', 'error');
                return;
            }
        } else if (window.confirm('You have unsaved changes. Save them before leaving?')) {
            const saved = await saveResumeNow({});
            if (!saved) return; // stay put so the work is not lost
        }
    }
    switchView(targetView);
}
window.leaveEditor = leaveEditor;


// --- My Resumes (saved resumes) -------------------------------------------

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatSavedDate(value) {
    if (!value) return 'just now';
    const d = new Date(value);
    if (isNaN(d.getTime())) return 'recently';

    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

async function fetchSavedResumes(currentUser) {
    const user = currentUser || await getResumeUser();
    if (!user) {
        return [];
    }

    const userId = user.id;
    const userEmail = (user.email || '').trim().toLowerCase();
    const cacheKey = getUserResumeCacheKey(user);

    let list = [];
    let fetchedFromRemote = false;

    // 1. Direct Supabase fetch if active session (only if user.id is a real Supabase UUID)
    const uuidRegexFetch = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (user.id && uuidRegexFetch.test(user.id) && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            console.log('[ResumePro] Fetching resumes from Supabase for user:', user.id);
            const { data: sbResumes, error: sbErr } = await supabaseClient
                .from('resumes')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false });

            if (sbErr) {
                console.error('[ResumePro] Supabase fetch error:', sbErr.code, sbErr.message);
            } else if (Array.isArray(sbResumes)) {
                console.log('[ResumePro] Supabase returned', sbResumes.length, 'resumes');
                list = sbResumes.map(r => {
                    const content = typeof r.content === 'string' ? JSON.parse(r.content || '{}') : (r.content || {});
                    // Restore template_id from content._template_id (stored there to avoid UUID type mismatch)
                    const templateId = content._template_id || r.template_id || 'tmpl_classic_1';
                    // Remove _template_id from content to keep it clean
                    const { _template_id, ...cleanContent } = content;
                    return {
                        ...r,
                        template_id: templateId,
                        user_id: r.user_id,
                        sectionOrder: Array.isArray(r.section_order) ? r.section_order : (typeof r.section_order === 'string' ? JSON.parse(r.section_order || '[]') : []),
                        atsFeedback: Array.isArray(r.ats_feedback) ? r.ats_feedback : (typeof r.ats_feedback === 'string' ? JSON.parse(r.ats_feedback || '[]') : []),
                        isPublic: Boolean(r.is_public),
                        content: cleanContent,
                        design: typeof r.design === 'string' ? JSON.parse(r.design || '{}') : (r.design || {})
                    };
                });
                fetchedFromRemote = true;
            }
        } catch (sbErr) {
            console.error('[ResumePro] Supabase fetch exception:', sbErr);
        }
    } else if (user.id && !uuidRegexFetch.test(user.id)) {
        console.warn('[ResumePro] Skipping Supabase fetch: user.id is not a UUID:', user.id);
    }

    // 2. Fallback to API endpoint if not already loaded from Supabase
    if (!fetchedFromRemote) {
        try {
            const data = await apiFetch('/resumes');
            if (data && Array.isArray(data.resumes)) {
                // STRICT PRIVACY FILTER: Only accept resumes that belong to THIS user!
                // Never accept guest_user or other users' resumes.
                const validServerResumes = data.resumes.filter(r => {
                    if (!r) return false;
                    if (r.user_id === 'guest_user') return false;
                    if (userId && r.user_id === userId) return true;
                    if (userEmail && r.content && r.content.contact && r.content.contact.email) {
                        return r.content.contact.email.trim().toLowerCase() === userEmail;
                    }
                    return false;
                });
                list = validServerResumes;
                fetchedFromRemote = true;
            }
        } catch (err) {
            console.warn('API /resumes failed or restricted:', err);
        }
    }

    // 3. Merge with user-scoped private local cache
    try {
        if (cacheKey) {
            const cachedRaw = localStorage.getItem(cacheKey);
            if (cachedRaw) {
                const cachedList = JSON.parse(cachedRaw);
                if (Array.isArray(cachedList) && cachedList.length) {
                    const ids = new Set(list.map(r => r.id));
                    for (const r of cachedList) {
                        const isMatch = (userId && r.user_id === userId) ||
                                        (userEmail && r.content && r.content.contact && r.content.contact.email && r.content.contact.email.trim().toLowerCase() === userEmail) ||
                                        (!r.user_id && !r.isGuest);
                        if (isMatch && r._needsSync && ids.has(r.id)) {
                            list[list.findIndex(remote => remote.id === r.id)] = r;
                        }
                        if (isMatch && !ids.has(r.id) && r.user_id !== 'guest_user') {
                            list.push(r);
                            ids.add(r.id);
                        }
                    }
                }
            }
        }
    } catch (e) {}

    // Persist to user-scoped private cache
    try {
        if (cacheKey) {
            localStorage.setItem(cacheKey, JSON.stringify(list));
        }
    } catch (e) {}

    return list;
}

function renderSavedResumes(list) {
    const grid = document.getElementById('saved-resumes-grid');
    if (!grid) return;

    if (!list.length) {
        grid.innerHTML = `
            <div class="saved-resume-empty">
                <i data-lucide="file-plus-2"></i>
                <h3>No saved resumes yet</h3>
                <p>Choose any template above to build your first resume — it will be saved to your account automatically.</p>
                <button class="primary-btn" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })"><i data-lucide="arrow-up"></i> Choose a template above</button>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    grid.innerHTML = list.map(r => {
        const score = Number(r.ats_score || 0);
        const scoreClass = score >= 75 ? 'good' : 'low';
        return `
        <article class="saved-resume-card">
            <div class="resume-card-top">
                <h3>${escapeHtml(r.title || 'Untitled Resume')}</h3>
                ${score > 0 ? `<span class="resume-ats-chip ${scoreClass}"><i data-lucide="shield-check"></i> ATS ${score}%</span>` : ''}
            </div>
            <div class="resume-card-meta">
                <span><i data-lucide="clock"></i> Edited ${escapeHtml(formatSavedDate(r.updated_at))}</span>
                <span><i data-lucide="layout-template"></i> ${escapeHtml(r.template_name || 'Custom layout')}</span>
            </div>
            <div class="resume-card-actions">
                <button class="primary-btn" onclick="openSavedResume('${r.id}')"><i data-lucide="pencil"></i> Edit</button>
                <button class="icon-btn" title="Rename" onclick="renameSavedResume('${r.id}')"><i data-lucide="type"></i></button>
                <button class="icon-btn" title="Duplicate" onclick="duplicateSavedResume('${r.id}')"><i data-lucide="copy"></i></button>
                <button class="icon-btn danger" title="Delete" onclick="deleteSavedResume('${r.id}')"><i data-lucide="trash-2"></i></button>
            </div>
        </article>`;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/** Paints whatever is already known, then refreshes from the server. */
async function loadSavedResumes() {
    const section = document.getElementById('saved-resumes-section');
    const grid = document.getElementById('saved-resumes-grid');

    const user = await getResumeUser();

    // IF NOT LOGGED IN: COMPLETELY HIDE THE SAVED RESUMES SECTION!
    if (!user) {
        state.resumes = [];
        if (section) section.style.display = 'none';
        if (grid) grid.innerHTML = '';
        try {
            localStorage.removeItem('resumepro_cached_resumes');
        } catch (e) {}
        return [];
    }

    // USER IS LOGGED IN: REVEAL THE SAVED RESUMES SECTION
    if (section) section.style.display = 'block';
    if (!grid) return [];

    if (state.resumes.length) {
        renderSavedResumes(state.resumes);
    } else {
        grid.innerHTML = '<div class="saved-resume-empty"><i data-lucide="loader" style="animation: spin 1s linear infinite;"></i><p>Loading your saved resumes...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
        const list = await fetchSavedResumes(user);
        state.resumes = list;
        renderSavedResumes(list);
        return list;
    } catch (err) {
        console.error('Failed to load saved resumes', err);
        if (!state.resumes.length) {
            grid.innerHTML = `
                <div class="saved-resume-empty">
                    <i data-lucide="alert-triangle"></i>
                    <h3>We could not load your resumes</h3>
                    <p>Please check your connection and try again.</p>
                    <button class="primary-btn" onclick="loadSavedResumes()"><i data-lucide="refresh-cw"></i> Retry</button>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        return [];
    }
}
window.loadSavedResumes = loadSavedResumes;

async function openDashboard() {
    const user = await getResumeUser();
    if (!user) {
        if (typeof clearAuthInputs === 'function') clearAuthInputs();
        window.openAuthModal('choice');
        showToast('Please sign in to view your saved resumes.', 'info');
        return;
    }
    const section = document.getElementById('saved-resumes-section');
    if (section) section.style.display = 'block';
    switchView('dashboard');
}
window.openDashboard = openDashboard;

window.openSavedResume = async (id) => {
    const user = await getResumeUser();
    if (!user) {
        if (typeof clearAuthInputs === 'function') clearAuthInputs();
        window.openAuthModal('choice');
        showToast('Please sign in to access your resumes.', 'info');
        return;
    }
    openEditor(id);
};

window.renameSavedResume = async (id) => {
    const user = await getResumeUser();
    if (!user) {
        if (typeof clearAuthInputs === 'function') clearAuthInputs();
        window.openAuthModal('choice');
        showToast('Please sign in to rename this resume.', 'info');
        return;
    }
    const existing = state.resumes.find(r => r.id === id) || {};
    const next = window.prompt('Rename this resume', existing.title || 'Untitled Resume');
    if (next === null) return;

    const title = next.trim();
    if (!title || title === existing.title) return;

    try {
        existing.title = title;
        existing.updated_at = new Date().toISOString();

        // 1. Direct Supabase update
        if (user.id && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                await supabaseClient.from('resumes').update({ title, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
            } catch (sbE) {}
        }

        // 2. API fetch attempt
        try {
            await apiFetch(`/resumes/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
        } catch (apiE) {}

        if (state.currentResume && state.currentResume.id === id) {
            state.currentResume.title = title;
            const titleEl = document.getElementById('resume-title-input');
            if (titleEl) titleEl.value = title;
        }

        // 3. User cache
        const cacheKey = getUserResumeCacheKey(user);
        if (cacheKey) {
            try { localStorage.setItem(cacheKey, JSON.stringify(state.resumes)); } catch (e) {}
        }

        showToast('Resume renamed', 'success');
        renderSavedResumes(state.resumes);
    } catch (err) {
        console.error('Rename failed', err);
    }
};

window.duplicateSavedResume = async (id) => {
    const user = await getResumeUser();
    if (!user) {
        if (typeof clearAuthInputs === 'function') clearAuthInputs();
        window.openAuthModal('choice');
        showToast('Please sign in to duplicate this resume.', 'info');
        return;
    }

    const existing = state.resumes.find(r => r.id === id);
    if (!existing) return;

    const newUuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

    const duplicated = {
        ...JSON.parse(JSON.stringify(existing)),
        id: newUuid,
        user_id: user.id || user.email,
        title: `${existing.title || 'Resume'} (Copy)`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // 1. Direct Supabase insert
    if (user.id && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            await supabaseClient.from('resumes').insert({
                id: newUuid,
                user_id: user.id,
                template_id: duplicated.template_id || null,
                title: duplicated.title,
                content: duplicated.content || {},
                design: duplicated.design || {},
                section_order: duplicated.sectionOrder || ['contact', 'summary', 'experience', 'education', 'skills'],
                created_at: duplicated.created_at,
                updated_at: duplicated.updated_at
            });
        } catch (sbE) {
            console.warn('Supabase duplicate insert error:', sbE);
        }
    }

    // 2. Secondary API call
    try {
        await apiFetch(`/resumes/${id}/duplicate`, { method: 'POST' });
    } catch (apiE) {}

    state.resumes.unshift(duplicated);
    const cacheKey = getUserResumeCacheKey(user);
    if (cacheKey) {
        try { localStorage.setItem(cacheKey, JSON.stringify(state.resumes)); } catch (e) {}
    }

    showToast('A copy has been created', 'success');
    renderSavedResumes(state.resumes);
};

let pendingDeleteResumeId = null;

function openDeleteModal(id) {
    pendingDeleteResumeId = id;
    const existing = state.resumes.find(r => r.id === id) || {};
    const textEl = document.getElementById('delete-confirm-text');
    if (textEl) {
        const safeTitle = escapeHtml(existing.title || 'this resume');
        textEl.innerHTML = `Are you sure you want to delete <strong>${safeTitle}</strong>?<br><span style="font-size:0.82rem; color:#94a3b8; display:block; margin-top:0.35rem;">This action cannot be undone.</span>`;
    }
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
        modal.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}
window.openDeleteModal = openDeleteModal;

function closeDeleteModal() {
    pendingDeleteResumeId = null;
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) modal.classList.add('hidden');
    const btn = document.getElementById('confirm-delete-action-btn');
    if (btn) btn.innerHTML = 'Delete';
}
window.closeDeleteModal = closeDeleteModal;

async function executeDeleteResume() {
    const id = pendingDeleteResumeId;
    if (!id) return closeDeleteModal();

    const user = await getResumeUser();
    const btn = document.getElementById('confirm-delete-action-btn');
    if (btn) btn.innerHTML = '<i data-lucide="loader" style="animation: spin 1s linear infinite;"></i> Deleting...';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        let deleted = false;
        try {
            const res = await apiFetch(`/resumes/${id}`, { method: 'DELETE' });
            if (res && res.success !== false) deleted = true;
        } catch (apiErr) {
            console.warn('API delete returned error, checking Supabase fallback:', apiErr);
        }

        // Direct Supabase delete if configured
        if (user && user.id && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                await supabaseClient.from('resumes').delete().eq('id', id).eq('user_id', user.id);
                deleted = true;
            } catch (sbErr) {
                console.warn('Supabase direct delete error:', sbErr);
            }
        }

        // Update local state immediately
        state.resumes = state.resumes.filter(r => r.id !== id);
        if (state.currentResume && state.currentResume.id === id) clearEditorState();

        const cacheKey = getUserResumeCacheKey(user);
        if (cacheKey) {
            try { localStorage.setItem(cacheKey, JSON.stringify(state.resumes)); } catch (e) {}
        }

        closeDeleteModal();
        showToast('Resume deleted successfully', 'success');

        // Instant UI update
        renderSavedResumes(state.resumes);
    } catch (err) {
        console.error('Delete failed:', err);
        showToast((err && err.message) || 'Failed to delete resume. Please try again.', 'error');
        closeDeleteModal();
    }
}
window.executeDeleteResume = executeDeleteResume;

window.deleteSavedResume = (id) => {
    openDeleteModal(id);
};

/**
 * Entry point behind "Start Building" / "Create My Resume".
 *
 * Shows templates at the top and saved resumes underneath.
 */
function startBuilderEntry() {
    switchView('templates');
}
window.startBuilderEntry = startBuilderEntry;
