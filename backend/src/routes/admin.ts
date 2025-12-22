import { Router, Response } from 'express';
import { requireAuth, requireOwner, AuthenticatedRequest } from '../middleware/roleAuth.js';
import { RoleService } from '../services/roleService.js';
import type { RoleChangeRequest } from '../types/roles.js';

export const adminRouter = Router();

// Tüm admin route'ları authentication gerektirir
adminRouter.use(requireAuth);

/**
 * GET /api/admin/users
 * Kullanıcı listesini getirir (owner only)
 */
adminRouter.get(
  '/users',
  requireOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const result = await RoleService.listUsers(page, limit);
      res.json(result);
    } catch (error: any) {
      console.error('GET /api/admin/users error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

/**
 * GET /api/admin/users/role/:role
 * Belirli rolü olan kullanıcıları getirir
 */
adminRouter.get(
  '/users/role/:role',
  requireOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.params.role;
      const validRoles = ['owner', 'admin', 'moderator', 'user', 'viewer'];
      
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const users = await RoleService.getUsersByRole(role as any);
      res.json({ users });
    } catch (error: any) {
      console.error('GET /api/admin/users/role error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

/**
 * POST /api/admin/users/:userId/role
 * Kullanıcı rolünü değiştirir (owner only)
 */
adminRouter.post(
  '/users/:userId/role',
  requireOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetUserId = req.params.userId;
      const { newRole, reason } = req.body;

      if (!newRole) {
        return res.status(400).json({ error: 'newRole is required' });
      }

      const validRoles = ['owner', 'admin', 'moderator', 'user', 'viewer'];
      if (!validRoles.includes(newRole)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const request: RoleChangeRequest = {
        targetUserId,
        newRole: newRole as any,
        reason,
      };

      const result = await RoleService.changeUserRole(req.userId, request);
      res.json(result);
    } catch (error: any) {
      console.error('POST /api/admin/users/:userId/role error:', error);
      
      if (error.message.includes('Only owner')) {
        return res.status(403).json({ error: error.message });
      }
      
      if (error.message.includes('only be one owner')) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

/**
 * GET /api/admin/users/:userId
 * Tek bir kullanıcının detaylarını getirir
 */
adminRouter.get(
  '/users/:userId',
  requireOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getSupabaseClient } = await import('../lib/supabase.js');
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role, username, full_name, created_at, updated_at, last_seen')
        .eq('id', req.params.userId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user: data });
    } catch (error: any) {
      console.error('GET /api/admin/users/:userId error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

