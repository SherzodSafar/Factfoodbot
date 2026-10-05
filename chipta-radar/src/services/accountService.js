/**
 * Akkaunt va shaxsiy ma'lumotlar xizmati — bot ham, Web App ham shu yerdan foydalanadi.
 *
 * Vazifalari:
 *   • eticket hisobini ulash/uzish (parol saqlanmaydi, token shifrlanadi);
 *   • saqlangan yo'lovchilar (shifrlangan) CRUD;
 *   • foydalanuvchining buyurtmalari va ularga to'lov so'rovi (Payme/Click);
 *   • (ixtiyoriy) joy band qilish — admin yoqsa.
 *
 * Har bir foydalanuvchining jonli sessiyasi (cookie/XSRF/token) xotirada keshlanadi,
 * token esa bazada shifrlangan holda saqlanadi — server qayta yonsa ham qayta ishlatiladi.
 */
import config from '../config/default.js';
import RailwayAccountModel from '../models/RailwayAccount.js';
import PassengerModel from '../models/Passenger.js';
import BookingModel from '../models/Booking.js';
import vault from './vault.js';
import * as eticket from '../core/eticketAccount.js';
import { getSettings } from './settings.js';
import { ValidationError } from '../utils/errors.js';
import {
  validatePassengerInput, maskName, maskDoc, maskLogin, normalizeLogin, normalizePhone, publicPassenger,
} from './personal.js';
import { todayISO } from '../utils/dates.js';

/** Foydalanuvchi id → jonli sessiya (xotirada, server yonganda yo'qoladi — tokendan tiklanadi) */
const liveSessions = new Map();

const accountCtx = (userId) => `account:${userId}`;
const passengerCtx = (userId) => `passenger:${userId}`;

/* ------------------------------------------------------------------ */
/*  Yoqilganlik tekshiruvi                                             */
/* ------------------------------------------------------------------ */

export function featureStatus() {
  const settings = getSettings();
  return {
    vaultReady: vault.isVaultReady(),
    // Shifrlashsiz shaxsiy ma'lumot saqlamaymiz
    accountEnabled: settings.accountEnabled && vault.isVaultReady(),
    paymentEnabled: settings.paymentEnabled && settings.accountEnabled && vault.isVaultReady(),
    bookingEnabled: settings.bookingEnabled && settings.accountEnabled && vault.isVaultReady(),
    passengersEnabled: vault.isVaultReady(),
    maxPassengers: settings.maxPassengersPerUser,
  };
}

function ensureVault() {
  if (!vault.isVaultReady()) {
    throw new ValidationError('Server shifrlash kaliti sozlanmagan. Administrator DATA_ENCRYPTION_KEY ni kiritishi kerak.');
  }
}

function ensureAccountEnabled() {
  ensureVault();
  if (!getSettings().accountEnabled) throw new ValidationError('Akkaunt ulash xizmati vaqtincha o\'chirilgan.');
}

/* ------------------------------------------------------------------ */
/*  Jonli sessiya (token keshdan yoki bazadan)                          */
/* ------------------------------------------------------------------ */

/** Bazadagi shifrlangan tokendan jonli sessiya tiklash */
function sessionFromRecord(record) {
  const secret = vault.decrypt(record.secret, accountCtx(record.userId));
  const session = eticket.createSession({ token: secret.token });
  return { session, secret };
}

/** Foydalanuvchi uchun yaroqli sessiya (keshdan yoki bazadan). Yo'q/eskirgan bo'lsa null */
async function getLiveSession(userId) {
  const cached = liveSessions.get(userId);
  if (cached && eticket.tokenValid(cached.session)) return cached;

  const record = await RailwayAccountModel.findByUser(userId);
  if (!record) return null;
  let session;
  let secret;
  try {
    ({ session, secret } = sessionFromRecord(record));
  } catch {
    return null; // kalit mos emas yoki yozuv buzilgan
  }
  if (!eticket.tokenValid(session)) {
    if (record.status !== 'EXPIRED') await RailwayAccountModel.update(userId, { status: 'EXPIRED', lastError: 'Token muddati tugagan' }).catch(() => {});
    return null;
  }
  const entry = { session, secret, record };
  liveSessions.set(userId, entry);
  return entry;
}

/* ------------------------------------------------------------------ */
/*  Hisob holati                                                       */
/* ------------------------------------------------------------------ */

export async function getAccountStatus(userId) {
  const features = featureStatus();
  const record = await RailwayAccountModel.findByUser(userId);
  if (!record) return { connected: false, features };
  return {
    connected: record.status === 'ACTIVE',
    status: record.status,
    loginMasked: record.loginMasked,
    tokenExpiresAt: record.tokenExpiresAt,
    lastError: record.status === 'ACTIVE' ? null : record.lastError,
    lastUsedAt: record.lastUsedAt,
    createdAt: record.createdAt,
    features,
  };
}

/* ------------------------------------------------------------------ */
/*  Ulash / uzish                                                      */
/* ------------------------------------------------------------------ */

/**
 * eticket hisobini ulash. Parol faqat shu yerda ishlatiladi va saqlanmaydi.
 * @returns {Promise<{connected:true, loginMasked:string}>}
 */
export async function connectAccount(userId, { login, password, consent, captcha = '' }) {
  ensureAccountEnabled();
  if (!consent) throw new ValidationError('Davom etish uchun roziligingizni belgilang.');

  const normalizedLogin = normalizeLogin(login);
  if (!normalizedLogin) throw new ValidationError('Telefon raqami yoki emailni kiriting.');
  if (!password || String(password).length < 3) throw new ValidationError('Parolni kiriting.');

  let result;
  try {
    result = await eticket.login({ login: normalizedLogin, password, captcha });
  } catch (error) {
    // Parolni eslab qolmaymiz — xatolik bo'lsa ham
    const message = error?.code === 'CAPTCHA_REQUIRED'
      ? error.message
      : (error?.code === 'LOGIN_FAILED' ? error.message : (error?.message || 'Hisobga kirib bo\'lmadi.'));
    throw new ValidationError(message);
  }

  const payPhone = normalizePhone(login) || '';
  const secret = { login: normalizedLogin, token: result.token, accountId: result.accountId, payPhone };
  const encrypted = vault.encrypt(secret, accountCtx(userId));

  const record = await RailwayAccountModel.upsert(userId, {
    loginMasked: maskLogin(login),
    secret: encrypted,
    status: 'ACTIVE',
    tokenExpiresAt: result.tokenExp ? new Date(result.tokenExp) : null,
    lastError: null,
    consentAt: new Date(),
    lastUsedAt: new Date(),
  });

  liveSessions.set(userId, { session: result.session, secret, record });
  return { connected: true, loginMasked: record.loginMasked };
}

/** Hisobni uzish — token va (ixtiyoriy) yo'lovchilar o'chiriladi */
export async function disconnectAccount(userId, { wipePassengers = false } = {}) {
  liveSessions.delete(userId);
  await RailwayAccountModel.remove(userId);
  if (wipePassengers) await PassengerModel.removeAllForUser(userId);
  return { connected: false };
}

/* ------------------------------------------------------------------ */
/*  Yo'lovchilar                                                        */
/* ------------------------------------------------------------------ */

export async function listPassengers(userId) {
  const rows = await PassengerModel.findByUser(userId);
  const today = todayISO();
  return rows.map((row) => {
    let secret = null;
    try {
      secret = vault.decrypt(row.secret, passengerCtx(userId));
    } catch {
      secret = null; // kalit mos emas — faqat niqob ko'rsatiladi
    }
    return publicPassenger(row, secret, today);
  });
}

export async function addPassenger(userId, input) {
  ensureVault();
  const settings = getSettings();
  const count = await PassengerModel.countByUser(userId);
  if (count >= settings.maxPassengersPerUser) {
    throw new ValidationError(`Ko'pi bilan ${settings.maxPassengersPerUser} ta yo'lovchi saqlash mumkin.`);
  }
  if (!input?.consent) throw new ValidationError('Shifrlab saqlashga roziligingizni belgilang.');

  const data = validatePassengerInput(input);
  const secret = {
    firstName: data.firstName, lastName: data.lastName, docNumber: data.docNumber,
    birthDate: data.birthDate, gender: data.gender, citizenship: data.citizenship,
  };
  const row = await PassengerModel.create({
    userId,
    label: data.label,
    nameMasked: maskName(data.firstName, data.lastName),
    docMasked: maskDoc(data.docNumber),
    secret: vault.encrypt(secret, passengerCtx(userId)),
    consentAt: new Date(),
  });
  return publicPassenger(row, secret, todayISO());
}

export async function removePassenger(userId, id) {
  const row = await PassengerModel.findOwned(id, userId);
  if (!row) throw new ValidationError('Yo\'lovchi topilmadi.');
  await PassengerModel.remove(row.id);
  return { ok: true };
}

/** Bron uchun yo'lovchining ochilgan (shifrlanmagan) ma'lumoti */
export async function getPassengerSecret(userId, id) {
  const row = await PassengerModel.findOwned(id, userId);
  if (!row) throw new ValidationError('Yo\'lovchi topilmadi.');
  try {
    return vault.decrypt(row.secret, passengerCtx(userId));
  } catch {
    throw new ValidationError('Yo\'lovchi ma\'lumotini ochib bo\'lmadi (shifrlash kaliti o\'zgargan).');
  }
}

/* ------------------------------------------------------------------ */
/*  Buyurtmalar va to'lov                                              */
/* ------------------------------------------------------------------ */

async function withAccount(userId, action) {
  const live = await getLiveSession(userId);
  if (!live) {
    const error = new ValidationError('Akkaunt ulanmagan yoki muddati tugagan. Qaytadan ulang.');
    error.code = 'ACCOUNT_REQUIRED';
    throw error;
  }
  try {
    const result = await action(live);
    await RailwayAccountModel.update(userId, { lastUsedAt: new Date(), lastError: null }).catch(() => {});
    return result;
  } catch (error) {
    if (error?.code === 'AUTH_EXPIRED') {
      liveSessions.delete(userId);
      await RailwayAccountModel.update(userId, { status: 'EXPIRED', lastError: 'Token muddati tugagan' }).catch(() => {});
      const wrapped = new ValidationError('Hisobga kirish muddati tugagan. Akkauntni qaytadan ulang.');
      wrapped.code = 'ACCOUNT_REQUIRED';
      throw wrapped;
    }
    throw error;
  }
}

export async function listOrders(userId) {
  return withAccount(userId, ({ session }) => eticket.getOrders(session));
}

export async function getActiveOrderCount(userId) {
  const live = await getLiveSession(userId).catch(() => null);
  if (!live) return 0;
  return eticket.getActiveOrderCount(live.session);
}

/**
 * Mavjud buyurtma uchun to'lov so'rovi (Payme/Click). Bot karta ma'lumotini olmaydi.
 */
export async function requestPayment(userId, { orderId, provider, phone, consent }) {
  ensureAccountEnabled();
  if (!getSettings().paymentEnabled) throw new ValidationError('Bot ichida to\'lov vaqtincha o\'chirilgan.');
  if (!consent) throw new ValidationError('To\'lov so\'rovi yuborilishiga roziligingizni belgilang.');
  if (!orderId) throw new ValidationError('Buyurtma raqamini tanlang.');
  if (!['payme', 'click'].includes(provider)) throw new ValidationError('To\'lov turini tanlang (Payme yoki Click).');

  return withAccount(userId, async ({ session, secret }) => {
    const payPhone = normalizePhone(phone) || secret.payPhone || '';
    if (!payPhone) throw new ValidationError('Payme/Click\'ga bog\'langan telefon raqamini kiriting.');
    const result = await eticket.createPaymentInvoice(session, { orderId, provider, phone: payPhone });
    if (!result.ok) throw new ValidationError('To\'lov so\'rovini yuborib bo\'lmadi. Buyurtma raqamini tekshiring.');
    return { ok: true, provider, invoiceId: result.invoiceId };
  });
}

/* ------------------------------------------------------------------ */
/*  Bron (ixtiyoriy)                                                    */
/* ------------------------------------------------------------------ */

/**
 * Joy band qilish (admin yoqsa). order — tanlangan poyezd/vagon/joylar,
 * passengerIds — saqlangan yo'lovchilar.
 */
export async function bookSeats(userId, { order, passengerIds, watchId = null }) {
  ensureAccountEnabled();
  if (!getSettings().bookingEnabled) throw new ValidationError('Botdan to\'g\'ridan-to\'g\'ri bron vaqtincha o\'chirilgan. Saytda bron qiling.');
  if (!Array.isArray(passengerIds) || !passengerIds.length) throw new ValidationError('Kamida bitta yo\'lovchini tanlang.');
  if (!order?.seats?.length) throw new ValidationError('Joy tanlanmagan.');
  if (passengerIds.length !== order.seats.length) throw new ValidationError('Yo\'lovchilar soni joylar soniga teng bo\'lishi kerak.');

  const passengers = [];
  for (const id of passengerIds) passengers.push(await getPassengerSecret(userId, id));

  return withAccount(userId, async ({ session }) => {
    const reserved = await eticket.reserveSeats(session, { order, passengers });
    const booking = await BookingModel.create({
      userId,
      watchId,
      orderId: reserved.orderId,
      trainNumber: order.trainNumber,
      fromCode: order.from,
      toCode: order.to,
      date: order.date,
      carNumber: order.carNumber ? String(order.carNumber) : null,
      carType: order.carType || null,
      seats: order.seats.map(String),
      passengers: passengers.length,
      amount: reserved.amount,
      status: 'RESERVED',
      expiresAt: reserved.expiresAt ? new Date(reserved.expiresAt) : null,
    });
    return { booking, reserved };
  });
}

export async function listBookings(userId) {
  const rows = await BookingModel.findByUser(userId);
  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    trainNumber: row.trainNumber,
    date: row.date,
    seats: row.seats,
    passengers: row.passengers,
    amount: row.amount,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }));
}

/** Foydalanuvchi bloklanganda yoki hisobini uzganda keshdagi sessiyani tozalash */
export function forgetSession(userId) {
  liveSessions.delete(userId);
}

export default {
  featureStatus, getAccountStatus, connectAccount, disconnectAccount,
  listPassengers, addPassenger, removePassenger, getPassengerSecret,
  listOrders, getActiveOrderCount, requestPayment, bookSeats, listBookings, forgetSession,
};
