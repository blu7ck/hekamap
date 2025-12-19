import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getR2Client } from './r2-client';
import { checkProjectAccess, getSupabaseAdmin } from './supabase-admin';

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

const detectSourceFormat = (fileName: string, mimeType: string): string => {
  const lower = fileName.toLowerCase();
  const ext = lower.split('.').pop() || '';
  if (ext === 'glb') return 'glb';
  if (ext === 'obj') return 'obj';
  if (ext === 'fbx') return 'fbx';
  if (ext === 'las') return 'las';
  if (ext === 'laz') return 'laz';
  if (ext === 'ifc') return 'ifc';
  if (ext === 'zip') return 'zip';
  if (ext === 'geojson' || ext === 'json') return 'geojson';
  if (ext === 'kml' || ext === 'kmz') return 'kml';
  // fallback by mime
  if (mimeType.includes('gltf')) return 'glb';
  if (mimeType.includes('geo+json')) return 'geojson';
  return 'other';
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

  const {
    project_id,
    file_name,
    mime_type,
    asset_category,
    raw_file_retention_days,
    file_size_bytes,
  } = body || {};

  if (!project_id || !file_name || !mime_type || !asset_category) {
    return new Response('project_id, file_name, mime_type, asset_category required', { status: 400 }) as unknown as CfResponse;
  }

  if (!['single_model', 'large_area'].includes(asset_category)) {
    return new Response('asset_category must be single_model or large_area', { status: 400 }) as unknown as CfResponse;
  }

  const allowlist = parseAllowlist(context.env.R2_ALLOWED_UPLOAD_MIME_TYPES);
  if (allowlist.length && !allowlist.includes(mime_type)) {
    return new Response('MIME not allowed', { status: 415 }) as unknown as CfResponse;
  }

  const allowed = await checkProjectAccess(context.env, userId, project_id);
  if (!allowed) return new Response('Forbidden', { status: 403 }) as unknown as CfResponse;

  const key = `raw/${project_id}/${userId}/${Date.now()}-${file_name}`;
  const s3 = getR2Client(context.env);

  const command = new PutObjectCommand({
    Bucket: context.env.R2_PRIVATE_BUCKET,
    Key: key,
    ContentType: mime_type,
  });

  const signed_url = await getSignedUrl(s3, command, { expiresIn: 300 });

  // Insert metadata into project_assets (pending processing)
  try {
    const supabaseAdmin = getSupabaseAdmin(context.env);
    const source_format = detectSourceFormat(file_name, mime_type);
    const retentionDays =
      typeof raw_file_retention_days === 'number' && raw_file_retention_days > 0
        ? Math.floor(raw_file_retention_days)
        : null;

    const { data, error } = await supabaseAdmin
      .from('project_assets')
      .insert({
        project_id,
        asset_key: key,
        name: file_name,
        mime_type,
        source_format,
        asset_category,
        processing_status: 'pending',
        raw_file_size_bytes: typeof file_size_bytes === 'number' ? file_size_bytes : null,
        raw_file_retention_days: retentionDays,
        uploaded_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('project_assets insert error', error);
      return new Response('Failed to create asset record', { status: 500 }) as unknown as CfResponse;
    }

    return new Response(
      JSON.stringify({
        upload_url: signed_url,
        key,
        asset_id: data?.id,
        headers: {
          'Content-Type': mime_type,
          'Content-Disposition': 'inline',
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    ) as unknown as CfResponse;
  } catch (err: any) {
    console.error('project_assets insert exception', err);
    return new Response('Failed to create asset record', { status: 500 }) as unknown as CfResponse;
  }
};

