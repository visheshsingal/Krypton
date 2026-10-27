import { Router } from 'express';
import { submitContact, getDownloadInfo, healthCheck } from '../controllers/publicController';
import { validateBody } from '../middleware/validate';
import { ContactDemoSchema } from '@krypton/shared';

const router = Router();

router.post('/contact', validateBody(ContactDemoSchema), submitContact);
router.get('/download-info', getDownloadInfo);
router.get('/health', healthCheck);

export default router;
