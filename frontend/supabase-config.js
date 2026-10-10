/**
 * Supabase Configuration & Helper Functions — Resume Builder
 *
 * Mirrors the root site's /supabase-config.js so the Resume Builder shares the exact
 * same Supabase Auth session (same browser = same login) as the rest of the
 * Kompetenzen website. This IS the cross-site SSO now — no Google Sheets bridge.
 *
 * Requires the supabase-js CDN script to be loaded first:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */

const SUPABASE_URL = "https://xgnluardsgflfxttvgwc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OTub68LVVtzOUFHG3tt-8g_dF9X0ECf";

let supabaseClient = null;

if (typeof supabase !== 'undefined' && SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY") {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Helper to check if Supabase is active
 */
function isSupabaseConfigured() {
  return supabaseClient !== null;
}

/**
 * API base shared with the root site's scripts (e.g. ../js/auth-modal.js).
 * Without this they fall back to the production host even during local
 * development.
 */
const KOMPETENZEN_API_BASE = (function () {
  const host = window.location.hostname || '';
  const isLocalDev = host === 'localhost' || host === '127.0.0.1' ||
    host.startsWith('192.168.') || host.startsWith('10.');
  if (isLocalDev) return 'http://localhost:5000/api';
  // Production API: same origin: Cloudflare forwards kompetenzen.in/api/* to Cloud Run.
  return '/api';
})();

/** Auth headers for API calls, matching the root site's helper of the same name. */
async function kompetenzenAuthHeaders() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) return null;
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function supabaseSignUp(name, email, phone, password) {
  let redirectUrl = 'http://localhost:3000/Resume/resume.html';
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    redirectUrl = window.location.origin + window.location.pathname;
  }
  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { name: name, phone: phone },
      emailRedirectTo: redirectUrl
    }
  });
  if (error) throw error;
  return data.user
    ? {
        name: name,
        email: email,
        phone: phone,
        authType: 'Email Signup',
        needsConfirmation: !data.session,
        session: data.session
      }
    : null;
}

async function supabaseSignIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  });
  if (error) throw error;
  const meta = (data.user && data.user.user_metadata) || {};
  return {
    name: meta.name || email,
    email: data.user.email,
    phone: meta.phone || '',
    authType: 'Direct Login'
  };
}

async function supabaseSignInWithGoogle(redirectUrl) {
  try {
    if (redirectUrl) localStorage.setItem('kompetenzen_pending_auth_redirect', redirectUrl);
  } catch (e) {}
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
  if (error) throw error;
}

/**
 * Extracts access_token and refresh_token from URL hash if returning from OAuth.
 */
function extractTokenFromHash() {
  try {
    if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('access_token=')) {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      return {
        accessToken: params.get('access_token'),
        refreshToken: params.get('refresh_token')
      };
    }
  } catch (e) {}
  return null;
}

/**
 * Immediately parses and persists OAuth session from hash on script load.
 */
(function syncOAuthHashImmediately() {
  const tokens = extractTokenFromHash();
  if (tokens && tokens.accessToken) {
    try {
      localStorage.setItem('token', tokens.accessToken);
      localStorage.setItem('access_token', tokens.accessToken);
      const parts = tokens.accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const meta = payload.user_metadata || {};
        const userObj = {
          id: payload.sub || payload.id || '',
          name: meta.name || meta.full_name || (payload.email ? payload.email.split('@')[0] : 'Candidate'),
          email: payload.email || '',
          phone: meta.phone || '',
          authType: 'Google Auth',
          loginTime: new Date().toISOString()
        };
        localStorage.setItem('kompetenzen_google_user', JSON.stringify(userObj));
        localStorage.setItem('kompetenzen_user', JSON.stringify(userObj));
        localStorage.setItem('user', JSON.stringify(userObj));
      }

      if (supabaseClient && tokens.refreshToken) {
        supabaseClient.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken
        }).catch(() => {});
      }
    } catch (e) {}
  }
})();

// Listen for auth state changes from Supabase
if (typeof supabaseClient !== 'undefined' && supabaseClient) {
  try {
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) {
        const meta = session.user.user_metadata || {};
        const userObj = {
          id: session.user.id,
          name: meta.name || meta.full_name || (session.user.email ? session.user.email.split('@')[0] : 'Candidate'),
          email: session.user.email,
          phone: meta.phone || '',
          authType: (session.user.app_metadata && session.user.app_metadata.provider === 'google') ? 'Google Auth' : 'Direct Login',
          loginTime: new Date().toISOString()
        };
        try {
          localStorage.setItem('kompetenzen_user', JSON.stringify(userObj));
          localStorage.setItem('user', JSON.stringify(userObj));
          localStorage.setItem('kompetenzen_google_user', JSON.stringify(userObj));
          if (session.access_token) {
            localStorage.setItem('token', session.access_token);
            localStorage.setItem('access_token', session.access_token);
          }
        } catch (e) {}

        if (typeof window !== 'undefined') {
          if (typeof window.syncNavUserProfile === 'function') window.syncNavUserProfile();
          if (typeof window.loadSavedResumes === 'function') window.loadSavedResumes();
        }
      } else if (event === 'SIGNED_OUT') {
        if (typeof window !== 'undefined') {
          if (typeof window.syncNavUserProfile === 'function') window.syncNavUserProfile();
          if (typeof window.loadSavedResumes === 'function') window.loadSavedResumes();
        }
      }
    });
  } catch (e) {}
}

async function supabaseGetSessionUser() {
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session && data.session.user) {
        const user = data.session.user;
        const meta = user.user_metadata || {};
        return {
          id: user.id,
          name: meta.name || meta.full_name || user.email,
          email: user.email,
          phone: meta.phone || '',
          authType: (user.app_metadata && user.app_metadata.provider === 'google') ? 'Google Auth' : 'Direct Login'
        };
      }
    } catch (e) {}
  }

  // Fallback 1: Decode user from hash token
  const tokens = extractTokenFromHash();
  if (tokens && tokens.accessToken) {
    try {
      const parts = tokens.accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const meta = payload.user_metadata || {};
        return {
          id: payload.sub || payload.id || '',
          name: meta.name || meta.full_name || (payload.email ? payload.email.split('@')[0] : 'Candidate'),
          email: payload.email || '',
          phone: meta.phone || '',
          authType: 'Google Auth'
        };
      }
    } catch (e) {}
  }

  // Fallback 2: Check localStorage
  try {
    const raw = localStorage.getItem('kompetenzen_user') ||
                localStorage.getItem('kompetenzen_google_user') ||
                localStorage.getItem('user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u && (u.name || u.email)) {
        return {
          id: u.id || u.email || '',
          name: u.name || (u.email ? u.email.split('@')[0] : 'Candidate'),
          email: u.email || '',
          phone: u.phone || '',
          authType: u.authType || 'Direct Login'
        };
      }
    }
  } catch (e) {}

  return null;
}

async function supabaseGetAccessToken() {
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session) {
        const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
        if (expiresAt && expiresAt < Date.now() + 60000) {
          try {
            const { data: refreshed, error: refErr } = await supabaseClient.auth.refreshSession();
            if (!refErr && refreshed && refreshed.session && refreshed.session.access_token) {
              try {
                localStorage.setItem('token', refreshed.session.access_token);
                localStorage.setItem('access_token', refreshed.session.access_token);
              } catch (e) {}
              return refreshed.session.access_token;
            }
          } catch (rErr) {}
          if (expiresAt && expiresAt < Date.now()) {
            try {
              localStorage.removeItem('token');
              localStorage.removeItem('access_token');
            } catch (e) {}
            return null;
          }
        }
        if (data.session.access_token) {
          if (expiresAt && expiresAt < Date.now()) {
            try {
              localStorage.removeItem('token');
              localStorage.removeItem('access_token');
            } catch (e) {}
            return null;
          }
          return data.session.access_token;
        }
      }
    } catch (e) {}
  }

  // Fallback 1: Extract from URL hash
  const tokens = extractTokenFromHash();
  if (tokens && tokens.accessToken) return tokens.accessToken;

  // Fallback 2: Check localStorage direct tokens (with expiry check!)
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload && payload.exp && payload.exp * 1000 < Date.now()) {
            // Token is expired! Purge stale token so we don't send garbage to the API
            localStorage.removeItem('token');
            localStorage.removeItem('access_token');
            return null;
          }
        }
      } catch (tokenErr) {}
      return token;
    }

    // Fallback 3: Check Supabase session keys in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = localStorage.getItem(key);
        if (val) {
          const parsed = JSON.parse(val);
          const tok = parsed && (parsed.access_token || (parsed.session && parsed.session.access_token));
          if (tok) {
            try {
              const parts = tok.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                if (payload && payload.exp && payload.exp * 1000 < Date.now()) {
                  continue; // expired
                }
              }
            } catch (e) {}
            return tok;
          }
        }
      }
    }
  } catch (e) {}

  return null;
}

async function supabaseSignOut() {
  try {
    if (supabaseClient) await supabaseClient.auth.signOut();
  } catch (e) {}
  try {
    localStorage.removeItem('kompetenzen_user');
    localStorage.removeItem('kompetenzen_google_user');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
  } catch (e) {}
}

