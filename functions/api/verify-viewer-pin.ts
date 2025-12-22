import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getSupabaseAdmin } from './supabase-admin';
import type { Env as BaseEnv } from './verify-token';

type Env = BaseEnv;

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const { access_token, pin } = body || {};
  if (!access_token || !pin) {
    return new Response('access_token and pin are required', { status: 400 }) as unknown as CfResponse;
  }

  // Validate PIN format
  if (!/^\d{4}$/.test(pin)) {
    return new Response('PIN must be exactly 4 digits', { status: 400 }) as unknown as CfResponse;
  }

  const supabaseAdmin = getSupabaseAdmin(context.env);

  // Verify PIN using Supabase RPC
  const { data: result, error: verifyError } = await supabaseAdmin.rpc('verify_viewer_pin', {
    p_access_token: access_token,
    p_pin: pin,
  });

  if (verifyError) {
    console.error('verify_viewer_pin error:', verifyError);
    return new Response(`Failed to verify PIN: ${verifyError.message || 'Unknown error'}`, { status: 500 }) as unknown as CfResponse;
  }

  if (!result || result.length === 0 || !result[0].valid) {
    return new Response(
      JSON.stringify({
        valid: false,
        error: 'Invalid PIN or access token',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    ) as unknown as CfResponse;
  }

  const accessInfo = result[0];

  return new Response(
    JSON.stringify({
      valid: true,
      project_id: accessInfo.project_id,
      asset_id: accessInfo.asset_id,
      email: accessInfo.email,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
};

