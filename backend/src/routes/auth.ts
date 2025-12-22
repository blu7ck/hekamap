import { Router, Response } from 'express';
import { PasswordSecurityService } from '../services/passwordSecurity.js';

export const authRouter = Router();

/**
 * POST /api/auth/validate-password
 * Validate password strength and check if it's leaked
 * This endpoint can be called from frontend before submitting signup/password change
 */
authRouter.post('/validate-password', async (req, res: Response) => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required' });
    }

    const result = await PasswordSecurityService.validatePassword(password);

    if (!result.valid) {
      return res.status(200).json({
        valid: false,
        errors: result.errors,
        isLeaked: result.isLeaked,
        leakCount: result.leakCount,
      });
    }

    res.json({
      valid: true,
      errors: [],
      isLeaked: false,
    });
  } catch (error: any) {
    console.error('POST /api/auth/validate-password error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

