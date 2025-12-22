import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getR2Client } from './r2-client';
import { getSupabaseUserClient } from './supabase-admin';

type Env = BaseEnv & {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_PRIVATE_BUCKET: string;
};

/**
 * Proxy asset requests through Cloudflare Function to add CORS headers
 * GET /api/proxy-asset?project_id=...&asset_key=...
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
  }

  // Get token from Authorization header or query param (for Cesium fetch requests)
  let token = getBearerToken(context.request);
  if (!token) {
    const url = new URL(context.request.url);
    token = url.searchParams.get('token') || null;
  }
  if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  const verified = await verifySupabaseToken(token, context.env);
  if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  const url = new URL(context.request.url);
  const projectId = url.searchParams.get('project_id');
  const assetKey = url.searchParams.get('asset_key');

  if (!projectId || !assetKey) {
    return new Response('project_id and asset_key are required', { status: 400 }) as unknown as CfResponse;
  }

  // Verify access
  const supabaseUser = getSupabaseUserClient(context.env, token);
  const { data: asset, error: assetError } = await supabaseUser
    .from('project_assets')
    .select('id, project_id, mime_type')
    .eq('asset_key', assetKey)
    .eq('project_id', projectId)
    .eq('processing_status', 'completed')
    .maybeSingle();

  if (assetError || !asset) {
    if (assetError?.code === '42501' || assetError?.message?.includes('permission denied') || assetError?.message?.includes('RLS')) {
      return new Response('Forbidden: No access to this asset', { status: 403 }) as unknown as CfResponse;
    }
    return new Response('Asset not found', { status: 404 }) as unknown as CfResponse;
  }

  // Fetch from R2
  const s3 = getR2Client(context.env);
  const command = new GetObjectCommand({
    Bucket: context.env.R2_PRIVATE_BUCKET,
    Key: assetKey,
  });

  try {
    const response = await s3.send(command);
    
    if (!response.Body) {
      return new Response('Asset not found in storage', { status: 404 }) as unknown as CfResponse;
    }

    // AWS SDK v3 Body in Cloudflare Workers is typically a ReadableStream
    // Convert to array buffer for consistent handling
    let bodyData: ArrayBuffer;
    
    if (response.Body instanceof ReadableStream) {
      const reader = response.Body.getReader();
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      bodyData = result.buffer;
    } else {
      // Fallback: try to convert to array buffer
      // @ts-expect-error - Body might have arrayBuffer method
      bodyData = await response.Body.arrayBuffer();
    }

    // Determine content type
    const contentType = asset.mime_type || response.ContentType || 'application/octet-stream';

    // Return with CORS headers
    return new Response(bodyData, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Cache-Control': 'public, max-age=3600',
      },
    }) as unknown as CfResponse;
  } catch (error: any) {
    console.error('R2 fetch error:', error);
    return new Response(`Failed to fetch asset: ${error.message || 'Unknown error'}`, { status: 500 }) as unknown as CfResponse;
  }
};

