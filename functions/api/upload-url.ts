import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getR2Client } from './r2-client';
import { checkProjectAccess } from './supabase-admin';

type Env = BaseEnv & {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_PRIVATE_BUCKET: string;
  R2_ALLOWED_UPLOAD_MIME_TYPES?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

const parseAllowlist = (list?: string) =>
  (list || '').split(',').map((s) => s.trim()).filter(Boolean);

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

  const { project_id, file_name, mime_type } = body || {};
  if (!project_id || !file_name || !mime_type) {
    return new Response('project_id, file_name, mime_type required', { status: 400 }) as unknown as CfResponse;
  }

  const allowlist = parseAllowlist(context.env.R2_ALLOWED_UPLOAD_MIME_TYPES);
  if (allowlist.length && !allowlist.includes(mime_type)) {
    return new Response('MIME not allowed', { status: 415 }) as unknown as CfResponse;
  }

  const allowed = await checkProjectAccess(context.env, userId, project_id);
  if (!allowed) return new Response('Forbidden', { status: 403 }) as unknown as CfResponse;

  const key = `projects/${project_id}/${userId}/${Date.now()}-${file_name}`;
  const s3 = getR2Client(context.env);

  const command = new PutObjectCommand({
    Bucket: context.env.R2_PRIVATE_BUCKET,
    Key: key,
    ContentType: mime_type,
  });

  const signed_url = await getSignedUrl(s3, command, { expiresIn: 300 });

  return new Response(
    JSON.stringify({
      upload_url: signed_url,
      key,
      headers: {
        'Content-Type': mime_type,
        'Content-Disposition': 'inline',
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
};

