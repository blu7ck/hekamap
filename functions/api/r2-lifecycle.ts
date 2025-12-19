import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { checkIsOwner } from './supabase-admin';

type Env = BaseEnv & {
  R2_ACCOUNT_ID: string;
  R2_PRIVATE_BUCKET: string;
  CLOUDFLARE_API_TOKEN: string; // must have R2:Edit permissions
};

interface LifecycleRule {
  ID: string;
  Status: 'Enabled' | 'Disabled';
  Prefix?: string;
  Expiration?: { Days: number };
}

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
    return new Response('Forbidden', { status: 403 }) as unknown as CfResponse;
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const days = Number(body?.days);
  if (!Number.isFinite(days) || days <= 0) {
    return new Response('days must be a positive number', { status: 400 }) as unknown as CfResponse;
  }

  // Lifecycle rule: expire everything under raw/ after {days}
  const rules: LifecycleRule[] = [
    {
      ID: 'raw-expiration',
      Status: 'Enabled',
      Prefix: 'raw/',
      Expiration: { Days: Math.floor(days) },
    },
  ];

  const accountId = context.env.R2_ACCOUNT_ID;
  const bucket = context.env.R2_PRIVATE_BUCKET;
  const apiToken = context.env.CLOUDFLARE_API_TOKEN;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ rules }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('R2 lifecycle update failed', data);
    return new Response(data?.errors ? JSON.stringify(data.errors) : 'Lifecycle update failed', {
      status: 500,
    }) as unknown as CfResponse;
  }

  return new Response(JSON.stringify({ ok: true, rules: data?.result ?? rules }), {
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as CfResponse;
};


