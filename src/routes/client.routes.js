/**
 * Mini App (mijozlar) uchun API yo'llari.
 * Barcha yo'llar Telegram initData orqali himoyalangan.
 */
import { Router } from 'express';
import { telegramAuth } from '../middlewares/auth.middleware.js';
import cartController from '../controllers/cartController.js';

const router = Router();

router.use(telegramAuth);

// Ilova ochilganda kerak bo'ladigan barcha ma'lumot — bitta so'rovda
router.get('/bootstrap', cartController.bootstrap);

router.get('/products', cartController.getProducts);
router.get('/products/:id', cartController.getProduct);
router.get('/categories', cartController.getCategories);

router.post('/orders', cartController.createOrder);
router.get('/orders', cartController.getMyOrders);

router.patch('/profile', cartController.updateProfile);

export default router;
