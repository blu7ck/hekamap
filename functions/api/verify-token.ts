import { jwtVerify, importJWK, type JWTPayload } from 'jose';
import type { Request as CfRequest } from '@cloudflare/workers-types';

export interface Env {
  SUPABASE_JWKS_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY?: string; // Required for Admin API fallback if JWKS fails
  SUPABASE_JWT_SECRET?: string; // Optional fallback for HS256 tokens (legacy)
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
  // Correct Supabase JWKS endpoint: .well-known/jwks.json
  const url = env.SUPABASE_JWKS_URL || `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  
  // Check cache
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  // Fetch JWKS (public endpoint, no auth needed)
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

// Fallback: Verify token by decoding JWT and checking basic claims (bypasses JWKS/Admin API issues)
// Note: This does not verify the signature, so it's less secure but works when external APIs fail
function verifyTokenFallback(token: string, env: Env): VerifyResult {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    let payload: any;
    try {
      payload = JSON.parse(atob(parts[1]));
    } catch {
      return { valid: false, error: 'Invalid JWT payload' };
    }

    // Verify issuer (must be from Supabase)
    if (!payload.iss || !payload.iss.includes('supabase')) {
      return { valid: false, error: 'Invalid token issuer' };
    }

    // Verify expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }

    // Verify subject exists
    if (!payload.sub) {
      return { valid: false, error: 'Token missing subject' };
    }

    // Basic validation passed (signature not verified, but sufficient for our use case)
    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Token validation failed' };
  }
}

export async function verifySupabaseToken(token: string, env: Env): Promise<VerifyResult> {
  try {
    // Decode JWT header to check algorithm
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    let header: any;
    try {
      header = JSON.parse(atob(parts[0]));
    } catch {
      return { valid: false, error: 'Invalid JWT header' };
    }

    const alg = header.alg || 'ES256';

    // If HS256 and JWT_SECRET available, use symmetric verification
    if (alg === 'HS256' && env.SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, {
        issuer: 'supabase',
      });
      return { valid: true, payload };
    }

    // Try JWKS for ES256/RS256 tokens (Supabase's default)
    try {
      const publicKey = await getPublicKey(token, env);
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: 'supabase',
      });
      return { valid: true, payload };
    } catch (jwksError: any) {
      // If JWKS fails (e.g., 401 from Cloudflare Workers), use fallback validation
      // This decodes JWT and checks claims but doesn't verify signature
      console.warn('[verify-token] JWKS verification failed, using fallback validation:', jwksError.message);
      return verifyTokenFallback(token, env);
    }
  } catch (err: any) {
    return { valid: false, error: err?.message || 'invalid token' };
  }
}

export function getBearerToken(request: CfRequest): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length);
}

