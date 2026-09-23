/**
 * Mini App (foydalanuvchilar) uchun API yo'llari.
 * Barcha yo'llar Telegram initData orqali himoyalangan.
 */
import { Router } from 'express';
import { telegramAuth, requireDatabase, rateLimit } from '../middlewares/auth.middleware.js';
import clientController from '../controllers/clientController.js';

const router = Router();

router.use(requireDatabase);
router.use(telegramAuth);

// Saytni ortiqcha yuklamaslik uchun: bitta foydalanuvchidan daqiqasiga 40 ta qidiruv
const searchLimit = rateLimit({
  limit: 40,
  windowMs: 60_000,
  keyFn: (req) => `search:${req.user.id}`,
  message: 'Juda ko\'p qidiruv. Bir daqiqa kuting.',
});

// Ilova ochilganda kerak bo'ladigan barcha ma'lumot — bitta so'rovda
router.get('/bootstrap', clientController.bootstrap);
router.get('/stations', clientController.stations);

// 1-usul: hozir bor joylar
router.get('/search', searchLimit, clientController.search);
router.get('/train', searchLimit, clientController.train);

// 2- va 3-usul: kuzatuvlar
router.get('/watches', clientController.listWatches);
router.post('/watches', searchLimit, clientController.createWatch);
router.get('/watches/:id', clientController.getWatch);
router.patch('/watches/:id', clientController.updateWatch);
router.delete('/watches/:id', clientController.deleteWatch);
router.post('/watches/:id/check', searchLimit, clientController.checkWatch);

// Profil
router.get('/profile', clientController.profile);
router.patch('/profile', clientController.updateProfile);

export default router;
