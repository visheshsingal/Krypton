import { Router } from 'express';
import {
  activateDesktop,
  heartbeat,
  reportSecurityEvent,
  getClientPolicy,
} from '../controllers/desktopController';
import { authenticateToken } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  DesktopActivationSchema,
  HeartbeatSchema,
  SubmitSecurityEventSchema,
} from '@krypton/shared';

const router = Router();

// Activation does not require prior JWT token; it verifies licenseKey + employee credentials
router.post('/activate', validateBody(DesktopActivationSchema), activateDesktop);

// Authenticated desktop endpoints
router.post('/heartbeat', authenticateToken, validateBody(HeartbeatSchema), heartbeat);
router.post('/events', authenticateToken, validateBody(SubmitSecurityEventSchema), reportSecurityEvent);
router.get('/policy', authenticateToken, getClientPolicy);

export default router;
