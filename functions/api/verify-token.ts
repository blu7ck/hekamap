import { jwtVerify, importJWK, type JWTPayload } from 'jose';
import type { Request as CfRequest } from '@cloudflare/workers-types';

export interface Env {
  SUPABASE_JWKS_URL: string;
  SUPABASE_URL: string;
}

interface JWKSResponse {
  keys: Array<{
    kty: string;
    use?: string;
    kid: string;
    alg: string;
    n?: string;
    e?: string;
    x?: string;
    y?: string;
    crv?: string;
  }>;
}

const jwksCache = new Map<string, { keys: JWKSResponse; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchJwks(env: Env): Promise<JWKSResponse> {
  const url = env.SUPABASE_JWKS_URL || `${env.SUPABASE_URL}/auth/v1/jwks`;
  
  // Check cache
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  // Fetch JWKS
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
  }

  const jwks: JWKSResponse = await response.json();
  
  // Cache for 1 hour
  jwksCache.set(url, {
    keys: jwks,
    expiresAt: Date.now() + CACHE_TTL,
  });

  return jwks;
}

async function getPublicKey(jwt: string, env: Env): Promise<CryptoKey> {
  // Decode JWT header to get kid (key ID)
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(atob(parts[0]));
  const kid = header.kid;

  if (!kid) {
    throw new Error('JWT missing kid in header');
  }

  // Fetch JWKS
  const jwks = await fetchJwks(env);
  
  // Find the key with matching kid
  const key = jwks.keys.find((k) => k.kid === kid);
  if (!key) {
    throw new Error(`No key found with kid: ${kid}`);
  }

  // Import the key
  const importedKey = await importJWK(key, header.alg || 'ES256');
  if (importedKey instanceof CryptoKey) {
    return importedKey;
  }
  throw new Error('Failed to import JWK as CryptoKey');
}

export type VerifyResult =
  | { valid: true; payload: JWTPayload }
  | { valid: false; error: string };

export async function verifySupabaseToken(token: string, env: Env): Promise<VerifyResult> {
  try {
    const publicKey = await getPublicKey(token, env);
    const { payload } = await jwtVerify(token, publicKey, {
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

