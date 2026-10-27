import { Router } from 'express';
import authRoutes from './auth';
import companyRoutes from './company';
import desktopRoutes from './desktop';
import superAdminRoutes from './superAdmin';
import billingRoutes from './billing';
import publicRoutes from './public';

const router = Router();

router.use('/auth', authRoutes);
router.use('/company', companyRoutes);
router.use('/desktop', desktopRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/billing', billingRoutes);
router.use('/public', publicRoutes);

export default router;
