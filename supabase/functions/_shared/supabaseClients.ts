import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

import { requiredEnv } from './http.ts';

function configuredSecretKey() {
  const direct = Deno.env.get('SUPABASE_SECRET_KEY')?.trim()
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (direct) return direct;

  const named = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (named) {
    const parsed = JSON.parse(named) as Record<string, unknown>;
    const defaultKey = typeof parsed.default === 'string' ? parsed.default.trim() : '';
    if (defaultKey) return defaultKey;
  }
  throw new Error('Missing Supabase server secret.');
}

function configuredPublishableKey() {
  const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim()
    ?? Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (direct) return direct;

  const named = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (named) {
    const parsed = JSON.parse(named) as Record<string, unknown>;
    const defaultKey = typeof parsed.default === 'string' ? parsed.default.trim() : '';
    if (defaultKey) return defaultKey;
  }
  throw new Error('Missing Supabase publishable key.');
}

export function supabaseAdmin() {
  return createClient(requiredEnv('SUPABASE_URL'), configuredSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseForRequest(req: Request) {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication required.');
  return createClient(requiredEnv('SUPABASE_URL'), configuredPublishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
