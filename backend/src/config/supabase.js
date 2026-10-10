const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. ' +
    'Set them in Resume/backend/.env (see .env.example). The server will not be able to reach the database until this is fixed.'
  );
}

/**
 * Server-side Supabase client authenticated with the SERVICE ROLE key.
 * This bypasses Row Level Security, so every query in this codebase MUST
 * explicitly filter on the authenticated user's id (req.user.id) where required —
 * RLS is not protecting these queries the way it protects direct client access.
 *
 * NEVER import this client, or the service role key, into any frontend code.
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = { supabase };
