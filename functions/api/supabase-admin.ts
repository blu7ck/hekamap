import { createClient } from '@supabase/supabase-js';
import type { Env } from './verify-token';

/**
 * Create Supabase admin client with service role key (bypasses RLS)
 * Use only when necessary for administrative operations
 */
export function getSupabaseAdmin(env: Env & { SUPABASE_SERVICE_ROLE_KEY: string }) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create Supabase client with user JWT token (respects RLS)
 * This is the recommended approach for user-scoped operations
 */
export function getSupabaseUserClient(
  env: Env & { SUPABASE_ANON_KEY: string },
  userToken: string
) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Check if user is owner or admin
 * Uses RPC function for efficient role checking
 */
export async function checkIsOwnerOrAdmin(
  env: Env & { SUPABASE_SERVICE_ROLE_KEY: string },
  userId: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.rpc('is_owner_or_admin', { user_id: userId });
  if (error) {
    console.warn('[checkIsOwnerOrAdmin] RPC failed:', error.message);
    return false;
  }
  return !!data;
}

