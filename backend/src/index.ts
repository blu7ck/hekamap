import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { jobsRouter } from './routes/jobs.js';
import { healthRouter } from './routes/health.js';
import { adminRouter } from './routes/admin.js';
import { moderatorRouter } from './routes/moderator.js';
import { workspaceRouter } from './routes/workspace.js';
import { authRouter } from './routes/auth.js';
import { EmailService } from './services/emailService.js';

dotenv.config();

// Initialize email service
EmailService.initialize({
  MAILGUN_API_KEY: process.env.MAILGUN_API_KEY || '',
  MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN || '',
  MAILGUN_REGION: (process.env.MAILGUN_REGION as 'us' | 'eu') || 'us',
  APP_URL: process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000',
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/jobs', jobsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/moderator', moderatorRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/auth', authRouter);
app.use('/health', healthRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`HekaMap Backend API listening on port ${PORT}`);
});


