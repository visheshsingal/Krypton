import { Router } from 'express';
import {
  getSuperAdminOverview,
  listCompanies,
  createLicense,
  updateLicense,
  renewLicense,
  listAuditLogs,
} from '../controllers/superAdminController';
import { authenticateToken } from '../middleware/auth';
import { requireRoles } from '../middleware/roles';
import { validateBody } from '../middleware/validate';
import { CreateLicenseSchema, UpdateLicenseSchema } from '@krypton/shared';

const router = Router();

router.use(authenticateToken);
router.use(requireRoles('super_admin'));

router.get('/overview', getSuperAdminOverview);
router.get('/companies', listCompanies);
router.post('/licenses', validateBody(CreateLicenseSchema), createLicense);
router.patch('/licenses/:id', validateBody(UpdateLicenseSchema), updateLicense);
router.post('/licenses/:id/renew', renewLicense);
router.get('/audit-logs', listAuditLogs);

export default router;
