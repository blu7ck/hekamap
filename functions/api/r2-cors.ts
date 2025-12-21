import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getR2Client } from './r2-client';
import { checkIsOwner } from './supabase-admin';

type Env = BaseEnv & {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_PRIVATE_BUCKET: string;
  R2_ACCOUNT_ID: string;
  SUPABASE_SERVICE_ROLE_KEY: string; // Required for checkIsOwner
  CLOUDFLARE_API_TOKEN?: string; // Optional, not used for S3-compatible CORS
};

/**
 * Set CORS policy for R2 bucket using S3-compatible API
 * Only owner can configure CORS
 * 
 * POST /api/r2-cors
 * Body: { allowedOrigins: string[] }
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
  }

  const token = getBearerToken(context.request);
  if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  const verified = await verifySupabaseToken(token, context.env);
  if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;
  const userId = verified.payload.sub as string;

  const isOwner = await checkIsOwner(context.env, userId);
  if (!isOwner) {
    return new Response('Forbidden: Only owner can configure CORS', { status: 403 }) as unknown as CfResponse;
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const { allowedOrigins } = body || {};
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    return new Response('allowedOrigins must be a non-empty array', { status: 400 }) as unknown as CfResponse;
  }

  // CORS configuration for R2 bucket using S3-compatible format
  const s3 = getR2Client(context.env);
  const corsParams = {
    Bucket: context.env.R2_PRIVATE_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: allowedOrigins,
          AllowedMethods: ['PUT', 'GET', 'HEAD', 'POST', 'DELETE'],
          AllowedHeaders: ['*'], // Allow all headers (Content-Type, Content-Disposition, etc.)
          ExposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-version-id'],
          MaxAgeSeconds: 3600, // Cache preflight for 1 hour
        },
      ],
    },
  };

  try {
    const command = new PutBucketCorsCommand(corsParams);
    await s3.send(command);

    return new Response(
      JSON.stringify({
        ok: true,
        cors: corsParams.CORSConfiguration.CORSRules[0],
        message: 'CORS policy updated successfully',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    ) as unknown as CfResponse;
  } catch (err: any) {
    console.error('R2 CORS update failed', err);
    return new Response(
      JSON.stringify({ error: err.message || 'CORS update failed', details: err }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    ) as unknown as CfResponse;
  }
};
