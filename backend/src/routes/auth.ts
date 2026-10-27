import { Router } from 'express';
import {
  login,
  refreshToken,
  getCurrentUser,
  acceptInvitation,
} from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { LoginSchema, RefreshTokenSchema } from '@krypton/shared';

const router = Router();

router.post('/login', validateBody(LoginSchema), login);
router.post('/refresh', validateBody(RefreshTokenSchema), refreshToken);
router.get('/me', authenticateToken, getCurrentUser);
router.post('/accept-invitation', acceptInvitation);

export default router;
