import { createClient } from '@supabase/supabase-js';
import type { Env } from './verify-token';

export function getSupabaseAdmin(env: Env & { SUPABASE_SERVICE_ROLE_KEY: string }) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function checkProjectAccess(
  env: Env & { SUPABASE_SERVICE_ROLE_KEY: string },
  userId: string,
  projectId: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase
    .from('project_access')
    .select('id')
    .eq('project_id', projectId)
    .eq('granted_by', userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('Access check failed', error.message);
    return false;
  }
  return !!data;
}

export async function checkIsOwner(env: Env & { SUPABASE_SERVICE_ROLE_KEY: string }, userId: string) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.rpc('is_owner', { user_id: userId });
  if (error) {
    console.warn('is_owner check failed', error.message);
    return false;
  }
  return !!data;
}

