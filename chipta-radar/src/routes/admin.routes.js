/**
 * Admin Panel uchun API yo'llari.
 * /login dan tashqari barcha yo'llar token bilan himoyalangan.
 */
import { Router } from 'express';
import { adminAuth, requireDatabase, rateLimit } from '../middlewares/auth.middleware.js';
import adminController from '../controllers/adminController.js';

const router = Router();

// Parolni taxmin qilishdan himoya: bitta IP'dan 15 daqiqada 10 ta urinish
const loginLimit = rateLimit({
  limit: 10,
  windowMs: 15 * 60_000,
  keyFn: (req) => `login:${req.ip}`,
  message: 'Juda ko\'p urinish. 15 daqiqadan so\'ng qayta urinib ko\'ring.',
});

router.post('/login', loginLimit, adminController.login);

// Bundan keyingi barcha yo'llar himoyalangan
router.use(adminAuth);

router.get('/me', adminController.me);

// Tizim holati, stansiyalar ro'yxati va sinov (baza ulanmagan bo'lsa ham ishlaydi)
router.get('/stats', adminController.stats);
router.get('/stations', adminController.listStations);
router.post('/test-search', adminController.testSearch);
router.post('/railway/reset', adminController.railwayReset);

router.use(requireDatabase);

// Kuzatuvlar
router.get('/watches', adminController.listWatches);
router.patch('/watches/:id', adminController.updateWatch);
router.delete('/watches/:id', adminController.deleteWatch);
router.post('/watches/:id/check', adminController.checkWatch);
router.post('/watcher/run', adminController.runWatcherNow);

// Foydalanuvchilar
router.get('/users', adminController.listUsers);
router.patch('/users/:id', adminController.updateUser);
router.post('/users/:id/message', adminController.messageUser);

// Xabarlar tarixi
router.get('/notifications', adminController.listNotifications);

// Stansiyalar (CRUD)
router.post('/stations', adminController.createStation);
router.put('/stations/:code', adminController.updateStation);
router.delete('/stations/:code', adminController.deleteStation);

// Sozlamalar
router.get('/settings', adminController.getSettingsHandler);
router.put('/settings', adminController.updateSettingsHandler);

// E'lon
router.post('/broadcast', adminController.broadcast);
router.get('/broadcast', adminController.broadcastStatus);

export default router;
