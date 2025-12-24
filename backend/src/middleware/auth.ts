import { Request, Response, NextFunction } from 'express';

export function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.API_SECRET_KEY;

  if (!expectedKey) {
    console.error('API_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

export function authenticateWorker(req: Request, res: Response, next: NextFunction) {
  const workerId = req.headers['x-worker-id'] as string;
  const workerSecret = req.headers['x-worker-secret'] as string;
  const expectedPrefix = process.env.WORKER_SECRET_PREFIX || 'worker-secret-';

  if (!workerId || !workerSecret) {
    return res.status(401).json({ error: 'Worker ID and secret required' });
  }

  // Simple validation: worker secret should start with expected prefix
  // In production, use a more secure method (e.g., JWT, shared secret hash)
  if (!workerSecret.startsWith(expectedPrefix)) {
    return res.status(401).json({ error: 'Invalid worker secret' });
  }

  next();
}




