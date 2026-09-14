import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper: the app takes a plain Employee ID from the person, but Supabase
// Auth needs an email - this is the one place that mapping happens.
export function emailForEmpId(empId) {
  return `${empId.trim().toLowerCase()}@manipalfintech.internal`;
}
