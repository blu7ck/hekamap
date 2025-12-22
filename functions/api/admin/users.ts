import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from '../verify-token';
import { getSupabaseUserClient, getSupabaseAdmin } from '../supabase-admin';

type Env = BaseEnv;

// Helper to check if user is owner
async function checkIsOwner(env: Env, userId: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin(env);
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single();
  
  if (error || !data) return false;
  return data.role === 'owner';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const method = context.request.method;
  const url = new URL(context.request.url);
  
  // GET /api/admin/users - List users (paginated)
  if (method === 'GET') {
    const token = getBearerToken(context.request);
    if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

    const verified = await verifySupabaseToken(token, context.env);
    if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;
    const userId = verified.payload.sub as string;

    // Only owner can list users
    const isOwner = await checkIsOwner(context.env, userId);
    if (!isOwner) {
      return new Response('Forbidden: Only owner can list users', { status: 403 }) as unknown as CfResponse;
    }

    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const roleFilter = url.searchParams.get('role');

    const supabaseAdmin = getSupabaseAdmin(context.env);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('user_profiles')
      .select('id, email, role, username, full_name, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (roleFilter) {
      query = query.eq('role', roleFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('listUsers error:', error);
      return new Response(`Failed to fetch users: ${error.message}`, { status: 500 }) as unknown as CfResponse;
    }

    return new Response(
      JSON.stringify({
        users: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    ) as unknown as CfResponse;
  }

  return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
};

