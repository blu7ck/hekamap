import type { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../lib/supabase.js';
import type { UserRole } from '../types/roles.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

/**
 * Kullanıcı rolünü cache'den veya DB'den çeker
 */
async function getUserRole(userId: string): Promise<UserRole> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.warn(`Role not found for user ${userId}, defaulting to 'user'`);
    return 'user'; // Default role
  }

  return (data.role as UserRole) || 'user';
}

/**
 * Kullanıcının authenticated olduğunu kontrol eder
 * Supabase JWT token'ı header'dan okur
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.substring(7);
    const supabase = getSupabaseClient();
    
    // JWT token'ı verify et
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // Kullanıcı bilgisini request'e ekle
    req.userId = user.id;

    // Kullanıcı rolünü çek
    const role = await getUserRole(user.id);
    req.userRole = role;

    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * Belirli rollerden birine sahip olmayı gerektirir
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const userRole = req.userRole || await getUserRole(req.userId);
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Forbidden: Insufficient permissions',
        required: allowedRoles,
        current: userRole
      });
    }

    next();
  };
}

/**
 * Owner yetkisi gerektirir
 */
export const requireOwner = requireRole('owner');

/**
 * Owner veya Admin yetkisi gerektirir
 */
export const requireOwnerOrAdmin = requireRole('owner', 'admin');

/**
 * Moderator, Admin veya Owner yetkisi gerektirir
 */
export const requireModerator = requireRole('owner', 'admin', 'moderator');

