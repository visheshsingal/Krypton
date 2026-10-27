import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config/env';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  // Security Headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // Managed by Electron & Frontend individually
    })
  );

  // CORS configuration
  const allowedOrigins = config.isProd
    ? [config.frontendUrl]
    : [
        config.frontendUrl,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://localhost:5000',
      ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Electron desktop apps, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || (!config.isProd && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) {
          return callback(null, true);
        }
        return callback(new Error('Origin is not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-company-id', 'stripe-signature'],
    })
  );

  // Rate Limiting
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many authentication attempts. Please try again later.' },
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/desktop/activate', authLimiter);

  // JSON parser with raw body exclusion for Stripe Webhooks
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/billing/webhook') {
      next();
    } else {
      express.json({ limit: '5mb' })(req, res, next);
    }
  });

  app.use(express.urlencoded({ extended: true }));

  // Static directory for downloadable desktop installer artifacts
  const downloadsDir = path.resolve(__dirname, '../public/downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  app.use('/downloads', express.static(downloadsDir));

  // Mount API
  app.use('/api', apiRoutes);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
