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
import WatchModel from '../models/Watch.js';
import vault from './vault.js';
import * as eticket from '../core/eticketAccount.js';
import { getTrainDetail } from '../core/railway.js';
import { getSettings } from './settings.js';
import { ValidationError } from '../utils/errors.js';
import { findSeatGroups } from './seats.js';
import { prefsOfWatch } from './matcher.js';
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

  // Qayta ulanganda oldingi to'lov usulini (provider/telefon) saqlab qolamiz
  let priorPay = {};
  const existing = await RailwayAccountModel.findByUser(userId);
  if (existing) {
    try {
      const old = vault.decrypt(existing.secret, accountCtx(userId));
      priorPay = { payProvider: old.payProvider, payPhone: old.payPhone };
    } catch {
      /* eski kalit — e'tiborsiz */
    }
  }
  const payPhone = priorPay.payPhone || normalizePhone(login) || '';
  const secret = { login: normalizedLogin, token: result.token, accountId: result.accountId, payPhone, payProvider: priorPay.payProvider };
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

/* ------------------------------------------------------------------ */
/*  Default to'lov usuli (avto-bron va tezkor to'lov uchun)             */
/* ------------------------------------------------------------------ */

/** Akkauntdagi saqlangan to'lov usuli (provider + telefon) */
export async function getPaymentMethod(userId, knownSecret = null) {
  let secret = knownSecret;
  if (!secret) {
    const record = await RailwayAccountModel.findByUser(userId);
    if (!record) return { provider: null, phone: null, phoneMasked: null };
    try {
      secret = vault.decrypt(record.secret, accountCtx(userId));
    } catch {
      return { provider: null, phone: null, phoneMasked: null };
    }
  }
  return {
    provider: secret.payProvider || null,
    phone: secret.payPhone || null,
    phoneMasked: secret.payPhone ? maskLogin(secret.payPhone) : null,
  };
}

/** To'lov usulini saqlash (Payme/Click + telefon) — akkaunt secret ichida */
export async function setPaymentMethod(userId, { provider, phone }) {
  ensureAccountEnabled();
  const record = await RailwayAccountModel.findByUser(userId);
  if (!record) throw new ValidationError('Avval eticket akkauntingizni ulang.');
  if (provider && !['payme', 'click'].includes(provider)) throw new ValidationError('To\'lov turini tanlang (Payme yoki Click).');

  let secret;
  try {
    secret = vault.decrypt(record.secret, accountCtx(userId));
  } catch {
    throw new ValidationError('Akkaunt ma\'lumotini ochib bo\'lmadi. Qaytadan ulang.');
  }
  if (provider) secret.payProvider = provider;
  if (phone !== undefined && phone !== null && phone !== '') {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new ValidationError('Telefon raqami noto\'g\'ri. Masalan: 90 123 45 67');
    secret.payPhone = normalized;
  }
  await RailwayAccountModel.update(userId, { secret: vault.encrypt(secret, accountCtx(userId)) });
  const live = liveSessions.get(userId);
  if (live) live.secret = secret;
  return getPaymentMethod(userId, secret);
}

/* ------------------------------------------------------------------ */
/*  Avto-bron (joy chiqsa — bot o'zi bron qilib, to'lov so'rovini yuboradi) */
/* ------------------------------------------------------------------ */

/** Bitta vagonda talablarga mos `quantity` ta joy topish */
function pickCarSeats(cars, prefs) {
  for (const car of cars) {
    const { groups } = findSeatGroups(car, { ...prefs, together: 'car' }, 1);
    if (groups.length && groups[0].seats.length >= prefs.quantity) {
      return { carNumber: car.number, carType: car.type, seats: groups[0].seats.slice(0, prefs.quantity) };
    }
  }
  return null;
}

/** Avto-bron uchun yo'lovchilar (tanlanganlar, yetmasa saqlanganlardan to'ldiriladi) */
async function resolveAutoBookPassengers(userId, watch) {
  const ids = Array.isArray(watch.autoBookPassengers) ? watch.autoBookPassengers : [];
  const out = [];
  for (const id of ids) {
    try {
      out.push(await getPassengerSecret(userId, id));
    } catch {
      /* o'chirilgan bo'lishi mumkin */
    }
  }
  if (out.length < watch.quantity) {
    const rows = await PassengerModel.findByUser(userId);
    for (const row of rows) {
      if (out.length >= watch.quantity) break;
      if (ids.includes(row.id)) continue;
      try {
        out.push(vault.decrypt(row.secret, passengerCtx(userId)));
      } catch {
        /* kalit mos emas */
      }
    }
  }
  return out.slice(0, watch.quantity);
}

/** Kuzatuvga avto-bronni yoqish/o'chirish va yo'lovchilarni belgilash */
export async function setAutoBook(userId, watchId, { enabled, passengerIds } = {}) {
  const watch = await WatchModel.findOwned(watchId, userId);
  if (!watch) throw new ValidationError('Kuzatuv topilmadi.');

  if (enabled) {
    ensureAccountEnabled();
    if (!getSettings().bookingEnabled) throw new ValidationError('Avto-bron hozircha o\'chirilgan. Administrator yoqishi kerak.');
    const status = await getAccountStatus(userId);
    if (!status.connected) throw new ValidationError('Avval eticket akkauntingizni ulang.');
    const method = await getPaymentMethod(userId);
    if (!method.provider || !method.phone) throw new ValidationError('Avval to\'lov usulini (Payme/Click) va telefonni sozlang.');
    const passengersCount = await PassengerModel.countByUser(userId);
    if (passengersCount < watch.quantity) {
      throw new ValidationError(`Avto-bron uchun kamida ${watch.quantity} ta saqlangan yo'lovchi kerak.`);
    }
  }

  const data = { autoBook: Boolean(enabled) };
  if (Array.isArray(passengerIds)) data.autoBookPassengers = passengerIds.map(Number).filter(Boolean);
  if (enabled) {
    data.autoBookStatus = 'PENDING';
    data.lastKeys = []; // hozir mavjud joylar ham "yangi" sifatida ko'rilib, avto-bron ishlashi uchun
  }
  return WatchModel.update(watch.id, data);
}

/**
 * Joy topilganda avtomatik bron qilib, to'lov so'rovini yuborish.
 * Reserve amalga oshmasa — pul harakati bo'lmaydi (to'lov so'rovi faqat muvaffaqiyatli
 * reserve'dan keyin yuboriladi). Foydalanuvchi to'lovni o'z ilovasida tasdiqlaydi.
 * @param matchedTrain brief train ({number, id})
 * @returns {Promise<{ok:boolean, reason?:string, orderId?:string, amount?:number, provider?:string, phoneMasked?:string, seats?:number[], carNumber?:string, paymentRequested?:boolean}>}
 */
export async function autoBookOnFound(userId, watch, matchedTrain) {
  if (!getSettings().bookingEnabled) return { ok: false, reason: 'disabled' };
  if (!matchedTrain?.number) return { ok: false, reason: 'no-train' };

  const method = await getPaymentMethod(userId);
  if (!method.provider || !method.phone) return { ok: false, reason: 'method' };

  const passengers = await resolveAutoBookPassengers(userId, watch);
  if (passengers.length < (watch.quantity || 1)) return { ok: false, reason: 'passengers' };

  return withAccount(userId, async ({ session }) => {
    const query = { from: watch.fromCode, to: watch.toCode, date: watch.date };
    const { cars } = await getTrainDetail(
      { ...query, trainNumber: matchedTrain.number, trainId: matchedTrain.id ?? null },
      { priority: 'high', maxAgeMs: 5000 },
    );
    const prefs = prefsOfWatch(watch);
    const allowed = (cars || []).filter(
      (car) => (!watch.carTypes?.length || watch.carTypes.includes(car.type))
        && car.places?.length
        && (!watch.maxPrice || !car.price || car.price <= watch.maxPrice),
    );
    const pick = pickCarSeats(allowed, prefs);
    if (!pick) return { ok: false, reason: 'no-seats' };

    const order = {
      trainNumber: matchedTrain.number, from: watch.fromCode, to: watch.toCode, date: watch.date,
      trainId: matchedTrain.id ?? null, carNumber: pick.carNumber, carType: pick.carType, seats: pick.seats,
    };

    const reserved = await eticket.reserveSeats(session, { order, passengers });

    const booking = await BookingModel.create({
      userId, watchId: watch.id, orderId: reserved.orderId,
      trainNumber: order.trainNumber, fromCode: order.from, toCode: order.to, date: order.date,
      carNumber: String(order.carNumber), carType: order.carType, seats: order.seats.map(String),
      passengers: passengers.length, amount: reserved.amount, status: 'RESERVED',
      expiresAt: reserved.expiresAt ? new Date(reserved.expiresAt) : null, payProvider: method.provider,
    });

    let paymentRequested = false;
    try {
      const pay = await eticket.createPaymentInvoice(session, { orderId: reserved.orderId, provider: method.provider, phone: method.phone });
      paymentRequested = pay.ok;
      await BookingModel.update(booking.id, {
        status: pay.ok ? 'PAID_REQUESTED' : 'RESERVED',
        payProvider: method.provider,
        payRequestedAt: new Date(),
      });
    } catch (error) {
      // Reserve bo'ldi, lekin to'lov so'rovini yuborib bo'lmadi — foydalanuvchi o'zi to'laydi
      await BookingModel.update(booking.id, { lastError: error.message?.slice(0, 300) || 'payment request failed' }).catch(() => {});
    }

    return {
      ok: true, orderId: reserved.orderId, amount: reserved.amount, provider: method.provider,
      phoneMasked: method.phoneMasked, seats: pick.seats, carNumber: pick.carNumber,
      paymentRequested, expiresAt: reserved.expiresAt,
    };
  });
}

/** Foydalanuvchi bloklanganda yoki hisobini uzganda keshdagi sessiyani tozalash */
export function forgetSession(userId) {
  liveSessions.delete(userId);
}

export default {
  featureStatus, getAccountStatus, connectAccount, disconnectAccount,
  listPassengers, addPassenger, removePassenger, getPassengerSecret,
  listOrders, getActiveOrderCount, requestPayment, bookSeats, listBookings, forgetSession,
  getPaymentMethod, setPaymentMethod, setAutoBook, autoBookOnFound,
};
