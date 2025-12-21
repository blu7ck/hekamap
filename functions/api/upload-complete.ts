import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getSupabaseAdmin, getSupabaseUserClient } from './supabase-admin';

type Env = BaseEnv & {
  SUPABASE_SERVICE_ROLE_KEY: string; // Required for processing_jobs insert (admin operation)
  HETZNER_BACKEND_API_URL?: string;
  HETZNER_API_SECRET_KEY?: string;
};

type JobType = 'normalize' | 'tileset' | 'pointcloud';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
  }

  const token = getBearerToken(context.request);
  if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  const verified = await verifySupabaseToken(token, context.env);
  if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;
  const userId = verified.payload.sub as string;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const { project_id, asset_id, asset_category } = body || {};
  if (!project_id || !asset_id || !asset_category) {
    return new Response('project_id, asset_id, asset_category required', { status: 400 }) as unknown as CfResponse;
  }
  if (!['single_model', 'large_area'].includes(asset_category)) {
    return new Response('asset_category must be single_model or large_area', { status: 400 }) as unknown as CfResponse;
  }

  // Verify access by fetching asset with user-scoped client (RLS enforces access control)
  const supabaseUser = getSupabaseUserClient(context.env, token);
  const { data: asset, error: assetError } = await supabaseUser
    .from('project_assets')
    .select('id, project_id, asset_key, source_format, processing_status')
    .eq('id', asset_id)
    .single();

  if (assetError || !asset) {
    // RLS will return error if user doesn't have access, or asset doesn't exist
    if (assetError?.code === '42501' || assetError?.message?.includes('permission denied') || assetError?.message?.includes('RLS')) {
      return new Response('Forbidden: No access to this asset', { status: 403 }) as unknown as CfResponse;
    }
    return new Response('Asset not found', { status: 404 }) as unknown as CfResponse;
  }
  if (asset.project_id !== project_id) {
    return new Response('Asset/project mismatch', { status: 400 }) as unknown as CfResponse;
  }

  // Use admin client for processing_jobs (system operation, not user-scoped)
  const supabaseAdmin = getSupabaseAdmin(context.env);

  // Determine job type based on category and source format
  let jobType: JobType;
  if (asset_category === 'single_model') {
    jobType = 'normalize';
  } else {
    // large_area
    if (asset.source_format === 'las' || asset.source_format === 'laz') {
      jobType = 'pointcloud';
    } else {
      jobType = 'tileset';
    }
  }

  // Insert job
  const { data: job, error: jobError } = await supabaseAdmin
    .from('processing_jobs')
    .insert({
      asset_id,
      job_type: jobType,
      status: 'queued',
      raw_file_key: asset.asset_key,
    })
    .select('id')
    .single();

  if (jobError || !job) {
    console.error('processing_jobs insert error', jobError);
    return new Response('Failed to enqueue job', { status: 500 }) as unknown as CfResponse;
  }

  // Update asset status
  const { error: updateError } = await supabaseAdmin
    .from('project_assets')
    .update({
      processing_status: 'queued',
      processing_job_id: job.id,
    })
    .eq('id', asset_id);

  if (updateError) {
    console.error('project_assets update error', updateError);
    return new Response('Failed to update asset status', { status: 500 }) as unknown as CfResponse;
  }

  // Optionally notify Hetzner Backend API (if configured)
  // This is optional - the backend can also poll Supabase directly
  if (context.env.HETZNER_BACKEND_API_URL && context.env.HETZNER_API_SECRET_KEY) {
    try {
      const backendRes = await fetch(`${context.env.HETZNER_BACKEND_API_URL}/api/jobs/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': context.env.HETZNER_API_SECRET_KEY,
        },
        body: JSON.stringify({
          project_id,
          asset_id,
          asset_category,
        }),
      });

      if (!backendRes.ok) {
        console.warn('Hetzner backend notification failed, but job is queued in Supabase');
      }
    } catch (err) {
      console.warn('Failed to notify Hetzner backend, but job is queued in Supabase:', err);
      // Don't fail the request - job is already in Supabase
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      job_id: job.id,
      asset_id,
      project_id,
      job_type: jobType,
      status: 'queued',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
};


