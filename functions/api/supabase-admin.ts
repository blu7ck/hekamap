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
  
  // Check if user is the project owner
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .limit(1)
    .maybeSingle();

  if (projectError) {
    console.warn('[checkProjectAccess] Project check failed:', projectError.message);
    return false;
  }

  if (!project) {
    console.warn('[checkProjectAccess] Project not found:', projectId);
    return false;
  }

  // User is the owner
  if (project.owner_id === userId) {
    return true;
  }

  // TODO: Check project_access table by email if needed
  // For now, only owner access is supported
  console.warn('[checkProjectAccess] User is not project owner:', { userId, projectId, ownerId: project.owner_id });
  return false;
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

