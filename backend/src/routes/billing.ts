import { Router, raw } from 'express';
import { handleWebhook, simulateBillingUpdate } from '../controllers/billingController';
import { authenticateToken } from '../middleware/auth';
import { requireRoles } from '../middleware/roles';
import { enforceTenantIsolation } from '../middleware/tenant';
import { config } from '../config/env';

const router = Router();

// Webhook endpoint (uses raw body for signature verification)
router.post('/webhook', raw({ type: 'application/json' }), handleWebhook);

if (!config.isProd) {
  router.post(
    '/simulate',
    authenticateToken,
    requireRoles('super_admin'),
    enforceTenantIsolation,
    simulateBillingUpdate
  );
}

export default router;
