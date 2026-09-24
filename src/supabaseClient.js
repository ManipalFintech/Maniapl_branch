import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const IS_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Every network call gets a hard time limit. On weak mobile networks a
// request can otherwise hang forever, leaving buttons stuck on "Submitting…".
const REQUEST_TIMEOUT_MS = 45000;

function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(
  SUPABASE_URL || 'https://not-configured.supabase.co',
  SUPABASE_ANON_KEY || 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    },
    global: { fetch: fetchWithTimeout }
  }
);

// Helper: the app takes a plain Employee ID from the person, but Supabase
// Auth needs an email - this is the one place that mapping happens.
export function emailForEmpId(empId) {
  return `${empId.trim().toLowerCase()}@manipalfintech.internal`;
}
