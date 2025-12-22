import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from '../../../verify-token';
import { getSupabaseAdmin } from '../../../supabase-admin';

type Env = BaseEnv;

// Helper to check if user is owner
async function checkIsOwner(env: Env, userId: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin(env);
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single();
  
  if (error || !data) return false;
  return data.role === 'owner';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
  }

  const token = getBearerToken(context.request);
  if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  const verified = await verifySupabaseToken(token, context.env);
  if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;
  const callerId = verified.payload.sub as string;

  // Only owner can change roles
  const isOwner = await checkIsOwner(context.env, callerId);
  if (!isOwner) {
    return new Response('Forbidden: Only owner can change user roles', { status: 403 }) as unknown as CfResponse;
  }

  // Extract userId from path parameter
  const userId = context.params.userId as string;
  if (!userId) {
    return new Response('User ID is required', { status: 400 }) as unknown as CfResponse;
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const { newRole, reason } = body || {};
  if (!newRole) {
    return new Response('newRole is required', { status: 400 }) as unknown as CfResponse;
  }

  const validRoles = ['owner', 'admin', 'moderator', 'user', 'viewer'];
  if (!validRoles.includes(newRole)) {
    return new Response('Invalid role', { status: 400 }) as unknown as CfResponse;
  }

  const supabaseAdmin = getSupabaseAdmin(context.env);

  // Get target user's current role
  const { data: targetUser, error: fetchError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role')
    .eq('id', userId)
    .single();

  if (fetchError || !targetUser) {
    return new Response('Target user not found', { status: 404 }) as unknown as CfResponse;
  }

  const previousRole = targetUser.role;

  // Owner count check (only one owner allowed)
  if (newRole === 'owner') {
    const { count } = await supabaseAdmin
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'owner')
      .neq('id', userId);

    if ((count || 0) > 0) {
      return new Response('There can only be one owner', { status: 400 }) as unknown as CfResponse;
    }
  }

  // If same role, return success without change
  if (previousRole === newRole) {
    return new Response(
      JSON.stringify({
        success: true,
        previousRole,
        newRole: previousRole,
        changedAt: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    ) as unknown as CfResponse;
  }

  // Update role using Supabase RPC
  const { error: updateError } = await supabaseAdmin.rpc('set_user_role', {
    target_user: userId,
    new_role: newRole,
  });

  if (updateError) {
    console.error('set_user_role error:', updateError);
    return new Response(`Failed to update role: ${updateError.message}`, { status: 500 }) as unknown as CfResponse;
  }

  // Log role change to security_events
  try {
    await supabaseAdmin.from('security_events').insert({
      event_type: 'role_change',
      user_id: userId,
      details: {
        caller_user_id: callerId,
        previous_role: previousRole,
        new_role: newRole,
        reason: reason || `Role changed to ${newRole} via admin panel`,
      },
      severity: 'medium',
      resolved: false,
    });
  } catch (logError: any) {
    console.warn('Failed to log role change:', logError);
    // Don't fail the request if logging fails
  }

  return new Response(
    JSON.stringify({
      success: true,
      previousRole,
      newRole,
      changedAt: new Date().toISOString(),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
};

