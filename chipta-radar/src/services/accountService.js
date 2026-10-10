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
import { getSettings } from './settings.js';
import { ValidationError } from '../utils/errors.js';
import { seatFits } from './seats.js';
import { normalizeCarType } from './carTypes.js';
import { prefsOfWatch } from './matcher.js';
import {
  validatePassengerInput, maskName, maskDoc, maskLogin, normalizeLogin, normalizePhone, normalizeDoc, publicPassenger,
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
  const secret = {
    login: normalizedLogin,
    token: result.token,
    accountId: result.accountId,
    username: result.username || normalizedLogin, // reserve webCustomer.username
    payPhone,
    payProvider: priorPay.payProvider,
  };
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
    region: data.region || '', // viloyat kodi — bronda regionId uchun
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

// Payme/Click tanlanmagan bo'lsa — standart tizim (Click), telefon esa login raqami
const DEFAULT_PAY_PROVIDER = config.account.defaultPayProvider || 'click';

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
    provider: secret.payProvider || DEFAULT_PAY_PROVIDER,
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
/*  Avto-bron — joy chiqsa bot o'zi JOYNI BAND QILADI (reserve),         */
/*  so'ng foydalanuvchi to'laydi (bron ~12 daqiqa ushlanadi).            */
/*  Kontrakt: docs/uzrailpass-booking-api.md                            */
/* ------------------------------------------------------------------ */

/** Joy xaritasidagi vagonlardan talablarga mos `quantity` ta joyni tanlash */
function pickCarSeats(cars, watch, prefs) {
  for (const car of cars) {
    const internalType = normalizeCarType(car.carType) || 'other';
    if (watch.carTypes?.length && !watch.carTypes.includes(internalType)) continue;
    const fitting = (car.places || []).filter((n) => seatFits(internalType, n, prefs)).sort((a, b) => a - b);
    if (fitting.length >= prefs.quantity) {
      return { number: car.number, carType: car.carType, serviceClass: car.serviceClass, seats: fitting.slice(0, prefs.quantity) };
    }
  }
  return null;
}

/** eticket saqlangan yo'lovchilaridan `quantity` tasini tanlash (o'zi birinchi) */
function pickFriends(friends, quantity) {
  return [...friends].sort((a, b) => (b.self ? 1 : 0) - (a.self ? 1 : 0)).slice(0, quantity);
}

/**
 * Botda saqlangan yo'lovchilardan hujjat raqami → viloyat kodi xaritasi.
 * Bron paytida eticket yo'lovchisining viloyati bo'sh bo'lsa, shu yerdan olinadi.
 * Xatolik bo'lsa bo'sh xarita (bron baribir standart kod bilan davom etadi).
 */
async function regionByDoc(userId) {
  try {
    const rows = await PassengerModel.findByUser(userId);
    const map = {};
    for (const row of rows) {
      try {
        const s = vault.decrypt(row.secret, passengerCtx(userId));
        const doc = normalizeDoc(s.docNumber);
        if (doc && s.region) map[doc] = s.region;
      } catch { /* kalit mos emas — o'tkazamiz */ }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Avto-bron oxirida to'lov so'rovini yuborish: foydalanuvchi tanlagan tizimga
 * (Payme/Click) saqlangan telefon raqamiga invoice jo'natamiz. Bu bosqich
 * muvaffaqiyatsiz bo'lsa ham BRON SAQLANADI (foydalanuvchi o'zi to'laydi),
 * shuning uchun hech qachon throw qilmaydi — natijani ob'ekt sifatida qaytaradi.
 * @returns {Promise<{requested:boolean, ok:boolean, provider:string|null, phoneMasked:string|null, invoiceId:string|null, reason?:string}>}
 */
async function requestAutoPayment(session, secret, orderId) {
  const provider = secret.payProvider || DEFAULT_PAY_PROVIDER;
  const phone = secret.payPhone || null;
  const phoneMasked = phone ? maskLogin(phone) : null;
  if (!provider || !phone) return { requested: false, ok: false, provider, phoneMasked, invoiceId: null, reason: 'no-method' };
  if (!getSettings().paymentEnabled) return { requested: false, ok: false, provider, phoneMasked, invoiceId: null, reason: 'disabled' };
  try {
    const result = await eticket.createPaymentInvoice(session, { orderId, provider, phone });
    return { requested: true, ok: Boolean(result.ok), provider, phoneMasked, invoiceId: result.invoiceId || null };
  } catch (error) {
    return { requested: true, ok: false, provider, phoneMasked, invoiceId: null, reason: error?.code || 'error' };
  }
}

/** Kuzatuvga avto-bronni yoqish/o'chirish */
export async function setAutoBook(userId, watchId, { enabled } = {}) {
  const watch = await WatchModel.findOwned(watchId, userId);
  if (!watch) throw new ValidationError('Kuzatuv topilmadi.');

  if (enabled) {
    ensureAccountEnabled();
    if (!getSettings().bookingEnabled) throw new ValidationError('Avto-bron hozircha o\'chirilgan. Administrator yoqishi kerak.');
    const live = await getLiveSession(userId);
    if (!live) throw new ValidationError('Avval eticket akkauntingizni ulang.');
    let friends = [];
    try {
      friends = await eticket.getFriends(live.session, live.secret.accountId);
    } catch {
      throw new ValidationError('eticketdan yo\'lovchilarni olib bo\'lmadi. Qaytadan ulang.');
    }
    if (friends.length < watch.quantity) {
      throw new ValidationError(`Avto-bron uchun eticketda kamida ${watch.quantity} ta saqlangan yo'lovchi kerak (hozir ${friends.length}). Ularni eticket.uzrailpass.uz da qo'shing.`);
    }
  }

  const data = { autoBook: Boolean(enabled) };
  if (enabled) {
    data.autoBookStatus = 'PENDING';
    data.lastKeys = []; // hozir mavjud joylar ham "yangi" sifatida ko'rilib, avto-bron ishlashi uchun
  }
  return WatchModel.update(watch.id, data);
}

/**
 * Joy topilganda avtomatik joyni band qilish (reserve). Pul yechilmaydi —
 * faqat joy ~12 daqiqaga band bo'ladi; foydalanuvchi o'zi to'laydi.
 * @param matchedTrain brief train ({number, id})
 * @returns {Promise<{ok:boolean, reason?:string, orderId?:string, seats?:number[], carNumber?:string, payEndsAt?:string|null}>}
 */
export async function autoBookOnFound(userId, watch, matchedTrain) {
  if (!getSettings().bookingEnabled) return { ok: false, reason: 'disabled' };
  if (!matchedTrain?.number) return { ok: false, reason: 'no-train' };

  return withAccount(userId, async ({ session, secret }) => {
    const route = { from: watch.fromCode, to: watch.toCode, date: watch.date };
    const wantNumber = String(matchedTrain.number).replace(/\s+/g, '');

    // 1) Bron platformasida qidiruv (reserve uchun poyezd ma'lumoti)
    const trains = await eticket.searchTrainsForBooking(session, route);
    const train = trains.find((t) => String(t.number).replace(/\s+/g, '') === wantNumber);
    if (!train) return { ok: false, reason: 'no-train-site' };

    // 2) Joy xaritasi → mos vagon va joylar
    const cars = await eticket.getSeatPlaces(session, { ...route, trainNumber: train.number, trainId: null });
    const prefs = prefsOfWatch(watch);
    const pick = pickCarSeats(cars, watch, prefs);
    if (!pick) return { ok: false, reason: 'no-seats' };

    // 3) Yo'lovchilar (eticket saqlangan)
    const friends = await eticket.getFriends(session, secret.accountId);
    const chosen = pickFriends(friends, watch.quantity || 1);
    if (chosen.length < (watch.quantity || 1)) return { ok: false, reason: 'passengers' };

    // 3b) Viloyat: eticket yo'lovchisida bo'sh bo'lsa — botda saqlangan
    //     yo'lovchining viloyatini (hujjat raqami bo'yicha) qo'yamiz.
    const regionMap = await regionByDoc(userId);
    const passengers = chosen.map((f) => {
      const own = String(f.regionId || '').trim();
      const mapped = regionMap[normalizeDoc(f.docNumber)] || '';
      return !own && mapped ? { ...f, regionId: mapped } : f;
    });

    // 4) BRON — bitta so'rov
    const reserved = await eticket.reserve(session, {
      train,
      car: { number: pick.number, carType: pick.carType, serviceClass: pick.serviceClass },
      seats: pick.seats,
      passengers,
      webCustomer: { id: secret.accountId, username: secret.username },
    });

    const payEndsAt = await eticket.getPaymentEndTime(session, reserved.orderId).catch(() => null);

    // 5) TO'LOV SO'ROVI — foydalanuvchi tanlagan tizimga (Payme/Click) saqlangan
    //    raqamga invoice jo'natamiz. Bu bosqich chiqmasa ham bron saqlanadi.
    const payment = await requestAutoPayment(session, secret, reserved.orderId);

    await BookingModel.create({
      userId, watchId: watch.id, orderId: reserved.orderId,
      trainNumber: train.number, fromCode: watch.fromCode, toCode: watch.toCode, date: watch.date,
      carNumber: String(pick.number), carType: pick.carType, seats: pick.seats.map(String),
      passengers: chosen.length, amount: null,
      status: payment.ok ? 'PAY_REQUESTED' : 'RESERVED',
      expiresAt: payEndsAt ? new Date(payEndsAt) : null,
    }).catch(() => {});

    return { ok: true, orderId: reserved.orderId, seats: pick.seats, carNumber: pick.number, payEndsAt, payment };
  });
}

/** Foydalanuvchi bloklanganda yoki hisobini uzganda keshdagi sessiyani tozalash */
export function forgetSession(userId) {
  liveSessions.delete(userId);
}

export default {
  featureStatus, getAccountStatus, connectAccount, disconnectAccount,
  listPassengers, addPassenger, removePassenger, getPassengerSecret,
  listOrders, getActiveOrderCount, requestPayment, listBookings, forgetSession,
  getPaymentMethod, setPaymentMethod, setAutoBook, autoBookOnFound,
};
