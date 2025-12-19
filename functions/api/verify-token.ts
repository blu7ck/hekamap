import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { JWTPayload } from 'jose';
import type { Request as CfRequest } from '@cloudflare/workers-types';

export interface Env {
  SUPABASE_JWKS_URL: string;
  SUPABASE_URL: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(env: Env) {
  const url = env.SUPABASE_JWKS_URL || `${env.SUPABASE_URL}/auth/v1/jwks`;
  if (!jwksCache.has(url)) {
    jwksCache.set(url, createRemoteJWKSet(new URL(url)));
  }
  return jwksCache.get(url)!;
}

export type VerifyResult =
  | { valid: true; payload: JWTPayload }
  | { valid: false; error: string };

export async function verifySupabaseToken(token: string, env: Env): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, getJwks(env), {
      issuer: 'supabase',
    });
    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'invalid token' };
  }
}

export function getBearerToken(request: CfRequest): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length);
}

