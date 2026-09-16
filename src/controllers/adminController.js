/**
 * Admin Panel uchun API logikasi:
 * kirish (login), buyurtmalar va mahsulotlar CRUD, statistika.
 */
import config from '../config/default.js';
import ProductModel from '../models/Product.js';
import OrderModel, { ORDER_STATUSES } from '../models/Order.js';
import { createAdminToken } from '../middlewares/auth.middleware.js';
import { sendMessage } from '../core/bot.js';

/* ----------------------------- Kirish ----------------------------- */

export function login(req, res) {
  const { password } = req.body || {};

  if (!password || String(password) !== String(config.admin.password)) {
    return res.status(401).json({ ok: false, error: 'Parol noto\'g\'ri' });
  }

  res.json({ ok: true, token: createAdminToken() });
}

/** Token hali ham amal qiladimi (sahifa yangilanganda tekshiriladi) */
export function me(req, res) {
  res.json({ ok: true, role: 'admin' });
}

/* --------------------------- Statistika --------------------------- */

export async function stats(req, res, next) {
  try {
    const data = await OrderModel.stats();
    const products = await ProductModel.count();
    res.json({ ok: true, stats: { ...data, totalProducts: products } });
  } catch (error) {
    next(error);
  }
}

/* -------------------------- Buyurtmalar --------------------------- */

export async function listOrders(req, res, next) {
  try {
    const orders = await OrderModel.findAll({ status: req.query.status });
    res.json({ ok: true, orders });
  } catch (error) {
    next(error);
  }
}

export async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, error: 'Holat noto\'g\'ri' });
    }

    const order = await OrderModel.updateStatus(req.params.id, status);

    // Holat o'zgarsa mijozga xabar beramiz
    const texts = {
      DELIVERED: `Buyurtmangiz #${order.id} yetkazib berildi. Yoqimli ishtaha! 🍕`,
      CANCELLED: `Afsuski buyurtmangiz #${order.id} bekor qilindi. Savollar bo'lsa biz bilan bog'laning.`,
    };
    if (texts[status] && order.user?.telegramId) {
      sendMessage(order.user.telegramId, texts[status]).catch(() => {});
    }

    res.json({ ok: true, order });
  } catch (error) {
    next(error);
  }
}

export async function deleteOrder(req, res, next) {
  try {
    await OrderModel.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/* -------------------------- Mahsulotlar --------------------------- */

export async function listProducts(req, res, next) {
  try {
    const products = await ProductModel.findAll();
    res.json({ ok: true, products });
  } catch (error) {
    next(error);
  }
}

export async function createProduct(req, res, next) {
  try {
    const { name, newPrice } = req.body || {};
    if (!String(name || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Mahsulot nomini kiriting' });
    }
    if (!Number(newPrice)) {
      return res.status(400).json({ ok: false, error: 'Narxni kiriting' });
    }

    const product = await ProductModel.create(req.body);
    res.status(201).json({ ok: true, product });
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const product = await ProductModel.update(req.params.id, req.body);
    res.json({ ok: true, product });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    }
    next(error);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    await ProductModel.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    }
    next(error);
  }
}

export default {
  login, me, stats,
  listOrders, updateOrderStatus, deleteOrder,
  listProducts, createProduct, updateProduct, deleteProduct,
};
