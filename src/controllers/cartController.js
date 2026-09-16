/**
 * Mijozlar (Mini App) uchun API logikasi:
 * mahsulotlar, savatcha, buyurtma yaratish va buyurtmalar tarixi.
 */
import ProductModel from '../models/Product.js';
import OrderModel from '../models/Order.js';
import UserModel from '../models/User.js';
import config from '../config/default.js';
import { sendMessage } from '../core/bot.js';

/** Narxni chiroyli ko'rinishga keltirish: 45000 -> "45 000 so'm" */
const money = (value) => `${Number(value || 0).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;

/** Mijoz ma'lumoti + mahsulotlar + kategoriyalar — bitta so'rovda */
export async function bootstrap(req, res, next) {
  try {
    const [products, categories, orders] = await Promise.all([
      ProductModel.findActive(),
      ProductModel.categories(),
      OrderModel.findByUser(req.user.id),
    ]);

    res.json({
      ok: true,
      user: req.user,
      products,
      categories,
      ordersCount: orders.length,
      isDev: Boolean(req.isDev),
    });
  } catch (error) {
    next(error);
  }
}

/** Barcha faol mahsulotlar */
export async function getProducts(req, res, next) {
  try {
    const products = await ProductModel.findActive();
    res.json({ ok: true, products });
  } catch (error) {
    next(error);
  }
}

/** Kategoriyalar ro'yxati (filtr teglari uchun) */
export async function getCategories(req, res, next) {
  try {
    const categories = await ProductModel.categories();
    res.json({ ok: true, categories });
  } catch (error) {
    next(error);
  }
}

/** Bitta mahsulot */
export async function getProduct(req, res, next) {
  try {
    const product = await ProductModel.findById(req.params.id);
    if (!product || !product.isActive) {
      return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    }
    res.json({ ok: true, product });
  } catch (error) {
    next(error);
  }
}

/**
 * Yangi buyurtma yaratish.
 * Narxlar mijozdan emas, BAZADAN olinadi — bu xavfsizlik uchun muhim.
 */
export async function createOrder(req, res, next) {
  try {
    const { items, location, latitude, longitude, phone, comment } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Savatcha bo\'sh' });
    }

    // Mijoz yuborgan ID'lar bo'yicha haqiqiy mahsulotlarni olamiz
    const ids = [...new Set(items.map((item) => Number(item.productId)).filter(Boolean))];
    const products = await ProductModel.findManyByIds(ids);

    if (products.length === 0) {
      return res.status(400).json({ ok: false, error: 'Mahsulotlar topilmadi' });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const orderItems = [];
    let total = 0;

    for (const item of items) {
      const product = productMap.get(Number(item.productId));
      if (!product) continue;

      const quantity = Math.min(50, Math.max(1, Math.round(Number(item.quantity) || 1)));
      const subtotal = product.newPrice * quantity;
      total += subtotal;

      orderItems.push({
        productId: product.id,
        name: product.name,
        price: product.newPrice,
        quantity,
        subtotal,
        imageUrl: product.imageUrl,
      });
    }

    if (orderItems.length === 0) {
      return res.status(400).json({ ok: false, error: 'Savatchadagi mahsulotlar mavjud emas' });
    }

    const cleanPhone = phone ? String(phone).trim().slice(0, 30) : req.user.phone || null;

    // Telefon raqam yangi bo'lsa — profilga saqlab qo'yamiz
    if (cleanPhone && cleanPhone !== req.user.phone) {
      await UserModel.updatePhone(req.user.id, cleanPhone);
    }

    const order = await OrderModel.create({
      userId: req.user.id,
      items: orderItems,
      total,
      location: String(location || '').trim().slice(0, 500),
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      phone: cleanPhone,
      comment: comment ? String(comment).trim().slice(0, 500) : null,
    });

    // --- Mijozga botdan tasdiq xabari ---
    const lines = orderItems
      .map((item) => `• ${item.name} × ${item.quantity} — ${money(item.subtotal)}`)
      .join('\n');

    const text =
      `${config.messages.orderAccepted}\n\n` +
      `<b>Buyurtma #${order.id}</b>\n` +
      `${lines}\n\n` +
      `<b>Jami: ${money(total)}</b>\n` +
      (order.location ? `📍 Manzil: ${order.location}\n` : '') +
      (cleanPhone ? `📞 Telefon: ${cleanPhone}` : '');

    // Xabar yuborilmasa ham buyurtma bazada qoladi
    sendMessage(req.user.telegramId, text).catch(() => {});

    res.status(201).json({ ok: true, order });
  } catch (error) {
    next(error);
  }
}

/** Mijozning buyurtmalari tarixi */
export async function getMyOrders(req, res, next) {
  try {
    const orders = await OrderModel.findByUser(req.user.id);
    res.json({ ok: true, orders });
  } catch (error) {
    next(error);
  }
}

/** Profil ma'lumotini yangilash (telefon raqam) */
export async function updateProfile(req, res, next) {
  try {
    const { phone } = req.body || {};
    const data = {};
    if (phone !== undefined) data.phone = String(phone).trim().slice(0, 30) || null;

    const user = Object.keys(data).length ? await UserModel.update(req.user.id, data) : req.user;
    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
}

export default { bootstrap, getProducts, getCategories, getProduct, createOrder, getMyOrders, updateProfile };
