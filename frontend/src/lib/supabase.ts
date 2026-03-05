import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const isHostedMode = !!import.meta.env.VITE_SUPABASE_URL;

if (import.meta.env.VITE_SUPABASE_SERVICE_KEY || import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'CRITICAL: Supabase service_role key detected in frontend env vars! ' +
    'This key must NEVER be exposed to the browser. ' +
    'Remove VITE_SUPABASE_SERVICE_KEY / VITE_SUPABASE_SERVICE_ROLE_KEY from your build environment immediately.',
  );
}

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase env vars not set. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
  }
  _client = createClient(url, key);
  return _client;
}

export async function getAccessToken(): Promise<string | null> {
  if (!isHostedMode) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export function authHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
