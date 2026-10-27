import { Router } from 'express';
import {
  getCompanyOverview,
  listEmployees,
  inviteEmployee,
  updateEmployeeStatus,
  removeEmployee,
  listDevices,
  revokeDevice,
  getPolicy,
  updatePolicy,
  listSecurityEvents,
  getAnalytics,
  getAuditLogs,
} from '../controllers/companyController';
import { authenticateToken } from '../middleware/auth';
import { requireRoles } from '../middleware/roles';
import { enforceTenantIsolation } from '../middleware/tenant';
import { validateBody } from '../middleware/validate';
import {
  InviteEmployeeSchema,
  UpdateEmployeeStatusSchema,
  UpdatePolicySchema,
} from '@krypton/shared';

const router = Router();

router.use(authenticateToken);
router.use(requireRoles('company_admin', 'super_admin'));
router.use(enforceTenantIsolation);

router.get('/overview', getCompanyOverview);
router.get('/employees', listEmployees);
router.post('/employees/invite', validateBody(InviteEmployeeSchema), inviteEmployee);
router.patch('/employees/:id', validateBody(UpdateEmployeeStatusSchema), updateEmployeeStatus);
router.delete('/employees/:id', removeEmployee);

router.get('/devices', listDevices);
router.delete('/devices/:id', revokeDevice);

router.get('/policy', getPolicy);
router.put('/policy', validateBody(UpdatePolicySchema), updatePolicy);

router.get('/events', listSecurityEvents);
router.get('/analytics', getAnalytics);
router.get('/audit-logs', getAuditLogs);

export default router;
