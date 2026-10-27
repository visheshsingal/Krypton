import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/krypton',
  mongoDbName: process.env.MONGODB_DB || 'krypton',
  jwtSecret: process.env.JWT_SECRET || 'krypton_default_dev_jwt_secret_not_for_prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'krypton_default_dev_refresh_secret',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  superAdmin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.SUPERADMIN_EMAIL || 'admin@kryptonsecurity.com',
    password: process.env.ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD || '',
    name: process.env.SUPERADMIN_NAME || 'Krypton Root Administrator',
  },
  smtp: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'noreply@kryptonsecurity.com',
    to: process.env.TO_EMAIL,
  },
  billing: {
    provider: process.env.BILLING_PROVIDER || 'stripe',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  defaults: {
    maxDevicesPerUser: parseInt(process.env.DEFAULT_MAX_DEVICES_PER_USER || '2', 10),
    offlineGraceHours: parseInt(process.env.DEFAULT_OFFLINE_GRACE_HOURS || '72', 10),
  },
};

export function validateProductionConfiguration(): void {
  if (!config.isProd) return;

  const requiredValues: Array<[string, string | undefined]> = [
    ['MONGODB_URI', process.env.MONGODB_URI],
    ['JWT_SECRET', process.env.JWT_SECRET],
    ['REFRESH_TOKEN_SECRET', process.env.REFRESH_TOKEN_SECRET],
    ['FRONTEND_URL', process.env.FRONTEND_URL],
    ['SUPERADMIN_EMAIL', process.env.SUPERADMIN_EMAIL],
    ['ADMIN_PASSWORD or SUPERADMIN_PASSWORD', process.env.ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD],
  ];

  const missing = requiredValues.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
  }

  for (const name of ['JWT_SECRET', 'REFRESH_TOKEN_SECRET'] as const) {
    const secret = process.env[name]!;
    if (secret.length < 32) {
      throw new Error(`${name} must be at least 32 characters in production.`);
    }
  }

  if (!process.env.FRONTEND_URL?.startsWith('https://')) {
    throw new Error('FRONTEND_URL must use HTTPS in production.');
  }

  const adminPassword = process.env.ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD || '';
  if (adminPassword.length < 12) {
    throw new Error('Production superadmin password must be at least 12 characters.');
  }
}
