import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Validates that an ID is a proper UUID (v4) before using it in Supabase queries.
 * Firebase UIDs are base62 strings (e.g. "QGDx5maWCTTXYTCNdr6VEtnpQC2") — NOT UUIDs.
 * Passing a Firebase UID to a Supabase UUID column causes 400 "invalid input syntax for type uuid".
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidSupabaseId(id: string | null | undefined): id is string {
  if (!id) return false;
  return UUID_REGEX.test(id);
}
