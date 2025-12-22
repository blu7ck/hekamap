import { Router, Response } from 'express';
import { requireAuth, requireOwnerOrAdmin, AuthenticatedRequest } from '../middleware/roleAuth.js';
import { ViewerService } from '../services/viewerService.js';
import { EmailService } from '../services/emailService.js';

export const workspaceRouter = Router();

// All workspace routes require authentication
workspaceRouter.use(requireAuth);

/**
 * POST /api/workspace/projects/:projectId/viewers
 * Create viewer access for a project or asset
 */
workspaceRouter.post(
  '/projects/:projectId/viewers',
  requireOwnerOrAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = req.params.projectId;
      const { assetId, email, pin } = req.body;

      if (!email || !pin) {
        return res.status(400).json({ error: 'email and pin are required' });
      }

      // Validate PIN format (4 digits)
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
      }

      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await ViewerService.createViewerAccess(req.userId, {
        projectId,
        assetId,
        email,
        pin,
      });

      // Send email with access link and PIN
      try {
        const { getSupabaseClient } = await import('../lib/supabase.js');
        const supabase = getSupabaseClient();

        // Get project name
        const { data: project } = await supabase
          .from('projects')
          .select('name')
          .eq('id', projectId)
          .single();

        // Get asset name if assetId provided
        let assetName: string | undefined;
        if (assetId) {
          const { data: asset } = await supabase
            .from('project_assets')
            .select('name')
            .eq('id', assetId)
            .single();
          assetName = asset?.name;
        }

        // Build access URL
        const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000';
        const accessUrl = `${appUrl}/viewer/${projectId}?token=${result.accessToken}`;

        // Send email
        const emailResult = await EmailService.sendViewerAccessEmail({
          email: result.email,
          accessToken: result.accessToken,
          pin,
          projectName: project?.name,
          assetName,
          accessUrl,
        });

        if (!emailResult.ok) {
          console.warn('Failed to send viewer access email:', emailResult.error);
          // Don't fail the request if email fails, just log it
        }
      } catch (emailError: any) {
        console.error('Error sending viewer access email:', emailError);
        // Don't fail the request if email fails
      }

      res.json(result);
    } catch (error: any) {
      console.error('POST /api/workspace/projects/:projectId/viewers error:', error);
      
      if (error.message.includes('Only owner or admin')) {
        return res.status(403).json({ error: error.message });
      }
      
      if (error.message.includes('not found') || error.message.includes('permission')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

/**
 * POST /api/workspace/viewers/verify-pin
 * Verify PIN and get access information
 */
workspaceRouter.post(
  '/viewers/verify-pin',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { accessToken, pin } = req.body;

      if (!accessToken || !pin) {
        return res.status(400).json({ error: 'accessToken and pin are required' });
      }

      const result = await ViewerService.verifyPin(accessToken, pin);

      if (!result.valid) {
        return res.status(401).json({ error: 'Invalid PIN or access token' });
      }

      res.json(result.accessInfo);
    } catch (error: any) {
      console.error('POST /api/workspace/viewers/verify-pin error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

/**
 * GET /api/workspace/projects/:projectId/viewers
 * List all viewer access for a project (optionally filtered by asset)
 */
workspaceRouter.get(
  '/projects/:projectId/viewers',
  requireOwnerOrAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = req.params.projectId;
      const assetId = req.query.assetId as string | undefined;

      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await ViewerService.listViewerAccess(req.userId, projectId, assetId);
      res.json(result);
    } catch (error: any) {
      console.error('GET /api/workspace/projects/:projectId/viewers error:', error);
      
      if (error.message.includes('Only owner or admin')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/workspace/viewers/:accessId
 * Delete viewer access
 */
workspaceRouter.delete(
  '/viewers/:accessId',
  requireOwnerOrAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const accessId = req.params.accessId;

      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await ViewerService.deleteViewerAccess(req.userId, accessId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('DELETE /api/workspace/viewers/:accessId error:', error);
      
      if (error.message.includes('Only owner or admin')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

