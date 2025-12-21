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

// Fallback: Verify token via Supabase Admin API (bypasses JWKS issues)
async function verifyViaAdminAPI(token: string, env: Env): Promise<VerifyResult> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { valid: false, error: 'Service role key required for Admin API fallback' };
  }

  try {
    // Use Supabase Admin API to get user info (validates token)
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { valid: false, error: `Token verification failed: ${response.status} ${response.statusText}` };
    }

    const user = await response.json();
    
    // Decode JWT to get payload for return value
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
    
    // Verify user ID matches token subject
    if (user.id !== payload.sub) {
      return { valid: false, error: 'Token user mismatch' };
    }

    // Verify issuer
    if (payload.iss && !payload.iss.includes('supabase')) {
      return { valid: false, error: 'Invalid token issuer' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Admin API verification failed' };
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
      // If JWKS fails (e.g., 401 from Cloudflare Workers), fallback to Admin API
      console.warn('[verify-token] JWKS verification failed, using Admin API fallback:', jwksError.message);
      return await verifyViaAdminAPI(token, env);
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

