import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getR2Client } from './r2-client';
import { getSupabaseUserClient } from './supabase-admin';

type Env = BaseEnv & {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_PRIVATE_BUCKET: string;
  R2_SIGNED_URL_TTL_SECONDS?: string | number;
  R2_SIGNED_URL_CONTENT_DISPOSITION?: string;
};

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

  const { project_id, asset_key, filename } = body || {};
  if (!project_id || !asset_key) {
    return new Response('project_id and asset_key required', { status: 400 }) as unknown as CfResponse;
  }

  // Verify access by querying asset with user-scoped client (RLS enforces access control)
  // Query by asset_key to verify user has access to this asset
  const supabaseUser = getSupabaseUserClient(context.env, token);
  const { data: asset, error: assetError } = await supabaseUser
    .from('project_assets')
    .select('id, project_id')
    .eq('asset_key', asset_key)
    .eq('project_id', project_id)
    .maybeSingle();

  if (assetError || !asset) {
    // RLS will return error if user doesn't have access, or asset doesn't exist
    if (assetError?.code === '42501' || assetError?.message?.includes('permission denied') || assetError?.message?.includes('RLS')) {
      return new Response('Forbidden: No access to this asset', { status: 403 }) as unknown as CfResponse;
    }
    return new Response('Asset not found', { status: 404 }) as unknown as CfResponse;
  }

  const s3 = getR2Client(context.env);
  const disposition = context.env.R2_SIGNED_URL_CONTENT_DISPOSITION || 'inline';
  const command = new GetObjectCommand({
    Bucket: context.env.R2_PRIVATE_BUCKET,
    Key: asset_key,
    ResponseContentDisposition: `${disposition}; filename="${filename || asset_key.split('/').pop() || 'asset'}"`,
    // Add CORS headers to signed URL
    ResponseCacheControl: 'public, max-age=3600',
  });

  const ttl = Number(context.env.R2_SIGNED_URL_TTL_SECONDS || 900);
  const signed_url = await getSignedUrl(s3, command, { expiresIn: ttl });
  
  // Note: CORS headers must be configured on the R2 bucket itself
  // The signed URL will work, but CORS must be set via R2 dashboard or r2-cors API

  return new Response(JSON.stringify({ signed_url }), {
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as CfResponse;
};

