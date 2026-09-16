/**
 * Admin Panel uchun API yo'llari.
 * /login dan tashqari barcha yo'llar token bilan himoyalangan.
 */
import { Router } from 'express';
import { adminAuth } from '../middlewares/auth.middleware.js';
import adminController from '../controllers/adminController.js';

const router = Router();

// Kirish
router.post('/login', adminController.login);

// Bundan keyingi barcha yo'llar himoyalangan
router.use(adminAuth);

router.get('/me', adminController.me);
router.get('/stats', adminController.stats);

// Buyurtmalar
router.get('/orders', adminController.listOrders);
router.patch('/orders/:id/status', adminController.updateOrderStatus);
router.delete('/orders/:id', adminController.deleteOrder);

// Mahsulotlar (CRUD)
router.get('/products', adminController.listProducts);
router.post('/products', adminController.createProduct);
router.put('/products/:id', adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);

export default router;
