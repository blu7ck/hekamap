import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getR2Client } from './r2-client';
import { checkProjectAccess } from './supabase-admin';

type Env = BaseEnv & {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_PRIVATE_BUCKET: string;
  R2_SIGNED_URL_TTL_SECONDS?: string | number;
  R2_SIGNED_URL_CONTENT_DISPOSITION?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
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

  const allowed = await checkProjectAccess(context.env, userId, project_id);
  if (!allowed) return new Response('Forbidden', { status: 403 }) as unknown as CfResponse;

  const s3 = getR2Client(context.env);
  const disposition = context.env.R2_SIGNED_URL_CONTENT_DISPOSITION || 'inline';
  const command = new GetObjectCommand({
    Bucket: context.env.R2_PRIVATE_BUCKET,
    Key: asset_key,
    ResponseContentDisposition: `${disposition}; filename="${filename || asset_key.split('/').pop() || 'asset'}"`,
  });

  const ttl = Number(context.env.R2_SIGNED_URL_TTL_SECONDS || 900);
  const signed_url = await getSignedUrl(s3, command, { expiresIn: ttl });

  return new Response(JSON.stringify({ signed_url }), {
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as CfResponse;
};

