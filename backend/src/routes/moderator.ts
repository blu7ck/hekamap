import { Router, Response } from 'express';
import { requireAuth, requireModerator, AuthenticatedRequest } from '../middleware/roleAuth.js';
import { getSupabaseClient } from '../lib/supabase.js';

export const moderatorRouter = Router();

moderatorRouter.use(requireAuth);
moderatorRouter.use(requireModerator);

/**
 * GET /api/moderator/reports
 * Bekleyen raporları listeler
 */
moderatorRouter.get('/reports', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const status = (req.query.status as string) || 'pending';

    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({ reports: data || [] });
  } catch (error: any) {
    console.error('GET /api/moderator/reports error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/moderator/reports/:reportId/resolve
 * Raporu çözer
 */
moderatorRouter.post('/reports/:reportId/resolve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = req.params.reportId;
    const { action, notes } = req.body; // action: 'resolved', 'dismissed'

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!action || !['resolved', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'action must be "resolved" or "dismiss"' });
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('reports')
      .update({
        status: action === 'dismiss' ? 'dismissed' : 'resolved',
        reviewed_by: req.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    if (error) {
      throw error;
    }

    res.json({ success: true, reportId });
  } catch (error: any) {
    console.error('POST /api/moderator/reports/:reportId/resolve error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

