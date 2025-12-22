import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getSupabaseUserClient } from './supabase-admin';
import { sendMailgunEmail } from './mailgun';

type Env = BaseEnv & {
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
  MAILGUN_REGION?: 'us' | 'eu';
  VITE_APP_URL?: string;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const method = context.request.method;

  // POST /api/viewer-access - Create viewer access
  if (method === 'POST') {
  const token = getBearerToken(context.request);
  if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  const verified = await verifySupabaseToken(token, context.env);
  if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const { project_id, asset_id, email, pin } = body || {};
  if (!project_id || !email || !pin) {
    return new Response('project_id, email, and pin are required', { status: 400 }) as unknown as CfResponse;
  }

  // Validate PIN format
  if (!/^\d{4}$/.test(pin)) {
    return new Response('PIN must be exactly 4 digits', { status: 400 }) as unknown as CfResponse;
  }

  const supabaseUser = getSupabaseUserClient(context.env, token);

  // Create viewer access using Supabase RPC
  const { data: access, error: accessError } = await supabaseUser.rpc('create_viewer_access', {
    p_project_id: project_id,
    p_email: email.trim().toLowerCase(),
    p_pin: pin,
    p_asset_id: asset_id || null,
  });

  if (accessError || !access || access.length === 0) {
    console.error('create_viewer_access error:', accessError);
    if (accessError?.message?.includes('Only owner or admin')) {
      return new Response('Forbidden: Only owner or admin can create viewer access', { status: 403 }) as unknown as CfResponse;
    }
    if (accessError?.message?.includes('permission')) {
      return new Response('Forbidden: No permission', { status: 403 }) as unknown as CfResponse;
    }
    return new Response(`Failed to create viewer access: ${accessError?.message || 'Unknown error'}`, { status: 500 }) as unknown as CfResponse;
  }

  const accessData = access[0];

  // Get project and asset names for email
  const { data: project } = await supabaseUser
    .from('projects')
    .select('name')
    .eq('id', project_id)
    .single();

  let assetName: string | undefined;
  if (asset_id) {
    const { data: asset } = await supabaseUser
      .from('project_assets')
      .select('name')
      .eq('id', asset_id)
      .single();
    assetName = asset?.name;
  }

  // Build access URL
  const appUrl = context.env.VITE_APP_URL || 'https://hekamap.com';
  const accessUrl = `${appUrl}/viewer/${project_id}?token=${accessData.access_token}`;

  // Send email
  try {
    const emailResult = await sendMailgunEmail(context.env, {
      to: accessData.email,
      from: 'auth@notify.hekamap.com',
      subject: assetName ? `Viewer Access to ${assetName}` : `Viewer Access to ${project?.name || 'Project'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">HekaMap Viewer Access</h2>
          <p>Merhaba,</p>
          <p>You have been granted viewer access to ${assetName || project?.name || 'a project'}:</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Project:</strong> ${project?.name || 'N/A'}</p>
            ${assetName ? `<p style="margin: 8px 0 0 0;"><strong>Asset:</strong> ${assetName}</p>` : ''}
            <p style="margin: 8px 0 0 0;"><strong>PIN:</strong> <code style="background: white; padding: 4px 8px; border-radius: 4px; font-size: 18px; font-weight: bold;">${pin}</code></p>
          </div>
          <p><strong>Access Link:</strong> <a href="${accessUrl}">${accessUrl}</a></p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            To access the viewer, click the link above and enter your PIN when prompted.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">This email was automatically sent. Please do not reply.</p>
        </div>
      `,
      text: `HekaMap Viewer Access\n\nYou have been granted viewer access to ${assetName || project?.name || 'a project'}.\n\nProject: ${project?.name || 'N/A'}\n${assetName ? `Asset: ${assetName}\n` : ''}PIN: ${pin}\n\nAccess Link: ${accessUrl}\n\nTo access the viewer, click the link above and enter your PIN when prompted.`,
    });

    if (!emailResult.ok) {
      console.warn('Failed to send viewer access email:', emailResult.error);
      // Don't fail the request if email fails
    }
  } catch (emailError: any) {
    console.error('Error sending viewer access email:', emailError);
    // Don't fail the request if email fails
  }

  return new Response(
    JSON.stringify({
      ok: true,
      id: accessData.id,
      access_token: accessData.access_token,
      email: accessData.email,
      project_id: accessData.project_id,
      asset_id: accessData.asset_id,
      created_at: accessData.created_at,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
  }

  // GET /api/viewer-access - List viewer access
  if (method === 'GET') {
    const token = getBearerToken(context.request);
    if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

    const verified = await verifySupabaseToken(token, context.env);
    if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

    const url = new URL(context.request.url);
    const projectId = url.searchParams.get('project_id');
    const assetId = url.searchParams.get('asset_id');

  if (!projectId) {
    return new Response('project_id is required', { status: 400 }) as unknown as CfResponse;
  }

  const supabaseUser = getSupabaseUserClient(context.env, token);

  // List viewer access using Supabase RPC
  const { data: viewers, error: viewersError } = await supabaseUser.rpc('list_viewer_access', {
    p_project_id: projectId,
    p_asset_id: assetId || null,
  });

  if (viewersError) {
    console.error('list_viewer_access error:', viewersError);
    if (viewersError?.message?.includes('Only owner or admin')) {
      return new Response('Forbidden: Only owner or admin can list viewer access', { status: 403 }) as unknown as CfResponse;
    }
    if (viewersError?.message?.includes('permission')) {
      return new Response('Forbidden: No permission', { status: 403 }) as unknown as CfResponse;
    }
    return new Response(`Failed to list viewer access: ${viewersError.message || 'Unknown error'}`, { status: 500 }) as unknown as CfResponse;
  }

  return new Response(
    JSON.stringify({
      viewers: viewers || [],
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
  }

  // DELETE /api/viewer-access - Delete viewer access
  if (method === 'DELETE') {
    const token = getBearerToken(context.request);
    if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

    const verified = await verifySupabaseToken(token, context.env);
    if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

    const url = new URL(context.request.url);
    const accessId = url.searchParams.get('access_id');

  if (!accessId) {
    return new Response('access_id is required', { status: 400 }) as unknown as CfResponse;
  }

  const supabaseUser = getSupabaseUserClient(context.env, token);

  // Delete viewer access using Supabase RPC
  const { error: deleteError } = await supabaseUser.rpc('delete_viewer_access', {
    p_access_id: accessId,
  });

  if (deleteError) {
    console.error('delete_viewer_access error:', deleteError);
    if (deleteError?.message?.includes('Only owner or admin')) {
      return new Response('Forbidden: Only owner or admin can delete viewer access', { status: 403 }) as unknown as CfResponse;
    }
    if (deleteError?.message?.includes('permission')) {
      return new Response('Forbidden: No permission', { status: 403 }) as unknown as CfResponse;
    }
    if (deleteError?.message?.includes('not found')) {
      return new Response('Viewer access not found', { status: 404 }) as unknown as CfResponse;
    }
    return new Response(`Failed to delete viewer access: ${deleteError.message || 'Unknown error'}`, { status: 500 }) as unknown as CfResponse;
  }

  return new Response(
    JSON.stringify({
      ok: true,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
  }

  return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
};

