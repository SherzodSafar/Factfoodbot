/**
 * eticket.railway.uz FOYDALANUVCHI HISOBI bilan ishlash.
 *
 * core/railway.js faqat ochiq ma'lumotni (poyezd/joy/narx) o'qiydi. Bu modul esa
 * foydalanuvchi nomidan ish ko'radi: hisobga kirish, buyurtmalar, to'lov so'rovi va bron.
 *
 * Muhim tamoyillar:
 *   • PAROL HECH QAYERDA SAQLANMAYDI — faqat kirish paytida ishlatiladi. Keyin
 *     saqlanadigan yagona narsa — kirish tokeni (JWT), u ham shifrlangan (vault.js).
 *   • Har bir foydalanuvchining alohida sessiyasi (cookie/XSRF/Bearer) — xotirada.
 *   • Barcha so'rovlar core/railway.js dagi umumiy navbatdan o'tadi (runQueued),
 *     shuning uchun saytga bir vaqtda ko'p so'rov ketmaydi va cheklov tanaffusi hisobga olinadi.
 *   • To'lovni bot O'ZI qilmaydi: Payme/Click ilovasiga so'rov yuboriladi, foydalanuvchi
 *     o'sha ilovada tasdiqlaydi. Karta ma'lumotlari botga kelmaydi.
 *
 * Sayt API hujjati yo'q — endpointlar saytning ochiq JS fayllaridan aniqlangan
 * (scripts/railway-inspect.js). Shuning uchun javoblar himoyaviy tarzda o'qiladi.
 */
import config from '../config/default.js';
import { RailwayError, runQueued, browserHeaders, startCooldown } from './railway.js';

const AUTH = {
  csrf: '/api/v1/csrf-token',
  login: '/api/v1/auth/login',
  loginV3: '/api/v3/auth/login',
  profile: '/api/v1/users/get',
  friends: '/api/v1/users/friend/list',
  activeCount: '/api/v1/query/orders/active/tickets/count',
  activeList: '/api/v1/query/railway/orders/active/tickets/list',
  ordersList: '/api/v3/query/orders/list',
  orderInfo: '/api/v1/universal-orders/get/',
  // Qidiruv va joy xaritasi (bron uchun — bron platformasida)
  trainsList: '/api/v3/handbook/trains/list',
  trainPlaces: '/api/v1/handbook/trains',
  // Bron: bitta chaqiruv order + yo'lovchi + joyni band qiladi (docs/uzrailpass-booking-api.md)
  reserve: '/api/v3/universal-orders/reserve',
  paymentEndTime: '/api/v3/universal-orders/query/get/payment-end-time/',
  cancel: '/api/v3/universal-orders/cancel',
  paymentTypes: '/api/v3/payment-type/list',
  payme: '/api/v1/payme/create-invoice',
  click: '/api/v1/clickMerchant/create-invoice',
};

// Bron/akkaunt platformasi (uzrailpass.uz). Ochiq poyezd qidiruvi (railway.uz) alohida.
const BASE_URL = config.account.baseUrl;
let BASE_HOST = 'eticket.uzrailpass.uz';
try {
  BASE_HOST = new URL(BASE_URL).host;
} catch {
  /* noto'g'ri URL — standart host */
}

const TIMEOUT_MS = config.railway.timeoutMs;
const DEFAULT_REGION_ID = config.account.defaultRegionId || '03';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/*  Yordamchilar                                                       */
/* ------------------------------------------------------------------ */

function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
    return payload?.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function jwtField(token, ...names) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
    for (const name of names) if (payload?.[name] !== undefined) return payload[name];
  } catch {
    /* noto'g'ri token */
  }
  return null;
}

/** Sessiya obyekti — xotirada, foydalanuvchiga bog'liq emas (chaqiruvchi saqlaydi) */
export function createSession({ token = '', cookies = null, xsrf = '', csrfAt = 0 } = {}) {
  return { token, cookies: cookies || new Map(), xsrf, csrfAt, tokenExp: token ? jwtExpiry(token) : 0 };
}

function cookieHeader(session) {
  return [...session.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function absorbCookies(session, response) {
  const lines = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  for (const line of lines) {
    const [pair, ...attributes] = line.split(';');
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    const expired = !value || attributes.some((item) => /^\s*max-age=0\b/i.test(item));
    if (expired) {
      session.cookies.delete(name);
      continue;
    }
    session.cookies.set(name, value);
    if (name.toUpperCase() === 'XSRF-TOKEN') {
      try {
        session.xsrf = decodeURIComponent(value);
      } catch {
        session.xsrf = value;
      }
    }
  }
}

function headersFor(session, extra = {}) {
  // browserHeaders railway.uz uchun Origin/Referer qo'yadi — bron platformasiga moslaymiz
  const headers = browserHeaders(extra);
  headers.Origin = BASE_URL;
  headers.Referer = `${BASE_URL}/${config.railway.lang}/home`;
  if (session.cookies.size) headers.Cookie = cookieHeader(session);
  if (session.xsrf) headers['X-XSRF-TOKEN'] = session.xsrf;
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  return headers;
}

async function rawFetch(path, session, { method = 'GET', body, headers, captcha } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const extra = { ...(headers || {}) };
  if (captcha) extra['captcha-response'] = captcha;
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      body,
      headers: headersFor(session, extra),
      redirect: 'manual',
      signal: controller.signal,
    });
    absorbCookies(session, response);
    const text = await response.text().catch(() => '');
    return { status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function networkError(error) {
  if (error instanceof RailwayError) return error;
  const reason = error?.name === 'AbortError' ? 'vaqt tugadi' : error?.cause?.code || error?.message || 'nomalum';
  return new RailwayError(`eticket.railway.uz bilan aloqa yo'q (${reason})`, { code: 'NETWORK', retryable: true });
}

/** HTTP holatini tushunarli xatoga aylantirish (hisob so'rovlari uchun) */
function httpError(status, data, text) {
  const serverMessage = data?.message || data?.error?.message || data?.error || null;
  if (status === 429) {
    startCooldown();
    return new RailwayError('Sayt vaqtincha so\'rovlarni chekladi. Birozdan so\'ng urinib ko\'ring.', { code: 'RATE_LIMITED', status });
  }
  if (status === 401) return new RailwayError('Hisobga kirish muddati tugagan. Akkauntni qayta ulang.', { code: 'AUTH_EXPIRED', status });
  if (status === 403) return new RailwayError(serverMessage || 'Sayt so\'rovni rad etdi. Birozdan so\'ng urinib ko\'ring.', { code: 'FORBIDDEN', status });
  if (status >= 500) return new RailwayError('eticket.railway.uz serverida nosozlik. Birozdan so\'ng urinib ko\'ring.', { code: 'SERVER_ERROR', status });
  return new RailwayError(serverMessage || `Kutilmagan javob (HTTP ${status})`, { code: 'HTTP_ERROR', status });
}

/* ------------------------------------------------------------------ */
/*  CSRF                                                               */
/* ------------------------------------------------------------------ */

const CSRF_TTL_MS = 20 * 60 * 1000;

async function ensureCsrf(session, force = false) {
  if (!force && session.xsrf && Date.now() - session.csrfAt < CSRF_TTL_MS) return;
  const { text } = await rawFetch(AUTH.csrf, session);
  if (!session.xsrf) {
    const data = parseJson(text);
    const token = data?.token ?? data?.csrfToken ?? data?.data?.token;
    if (token) session.xsrf = String(token);
  }
  session.csrfAt = Date.now();
}

/**
 * Hisob so'rovi: CSRF ta'minlanadi, umumiy navbatdan o'tadi, 403/419 da bir marta
 * sessiya yangilanib qayta urinadi.
 * @returns {Promise<{data:any, status:number, text:string}>}
 */
async function authedRequest(session, path, { method = 'GET', payload, captcha, priority = 'high' } = {}) {
  return runQueued(async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await ensureCsrf(session, attempt > 0);
        const options = { method, captcha };
        if (payload !== undefined) {
          options.body = JSON.stringify(payload);
          options.headers = { 'Content-Type': 'application/json' };
        }
        const { status, text } = await rawFetch(path, session, options);
        const data = parseJson(text);
        if (status >= 200 && status < 300) return { data, status, text };
        if ((status === 403 || status === 419) && attempt === 0) {
          lastError = httpError(status, data, text);
          continue; // sessiyani yangilab qayta urinamiz
        }
        throw httpError(status, data, text);
      } catch (error) {
        if (error instanceof RailwayError && !error.retryable) throw error;
        lastError = networkError(error);
        if (attempt === 0) await sleep(600);
      }
    }
    throw lastError || new RailwayError('So\'rov bajarilmadi', { code: 'RAILWAY_ERROR' });
  }, priority);
}

/* ------------------------------------------------------------------ */
/*  Kirish                                                             */
/* ------------------------------------------------------------------ */

function extractToken(data) {
  return (
    data?.token ?? data?.accessToken ?? data?.access_token ?? data?.data?.token ??
    data?.data?.accessToken ?? data?.data?.access_token ?? null
  );
}

/**
 * Login va parol bilan hisobga kirish. Muvaffaqiyatli bo'lsa sessiya to'ldiriladi.
 * reCAPTCHA v3 tokeni (captcha) berilishi mumkin — sayt uni login uchun talab qiladi.
 * @returns {Promise<{token:string, tokenExp:number, accountId:string|null, session:object}>}
 */
export async function login({ login: username, password, captcha = '' }, session = createSession()) {
  if (!username || !password) throw new RailwayError('Login va parolni kiriting', { code: 'INPUT' });

  let result;
  try {
    result = await authedRequest(session, AUTH.login, {
      method: 'POST',
      payload: { username, password },
      captcha: captcha || undefined,
    });
  } catch (error) {
    // Ba'zi hollarda v1 o'rniga v3 ishlaydi
    if (error instanceof RailwayError && [400, 404, 405].includes(error.status)) {
      result = await authedRequest(session, AUTH.loginV3, {
        method: 'POST',
        payload: { username, password },
        captcha: captcha || undefined,
      });
    } else if (error instanceof RailwayError && error.status === 401) {
      throw new RailwayError('Login yoki parol noto\'g\'ri. Google orqali kirgan bo\'lsangiz — saytda bir marta parol o\'rnating.', { code: 'LOGIN_FAILED', status: 401 });
    } else if (error instanceof RailwayError && (error.code === 'FORBIDDEN' || error.status === 403)) {
      throw new RailwayError('Sayt kirishni tasdiqlashni (captcha) talab qilmoqda. Hozircha bot orqali ulab bo\'lmadi — birozdan so\'ng urinib ko\'ring.', { code: 'CAPTCHA_REQUIRED', status: 403 });
    } else {
      throw error;
    }
  }

  const token = extractToken(result.data);
  if (!token) {
    throw new RailwayError('Kirish amalga oshmadi. Login/parolni tekshiring yoki saytda parol o\'rnating.', { code: 'LOGIN_FAILED' });
  }

  session.token = String(token);
  session.tokenExp = jwtExpiry(token) || Date.now() + 25 * 60_000;
  // webCustomer uchun: UUID va username (reserve so'rovida kerak)
  const accountId = jwtField(token, 'id', 'userId', 'uuid', 'user_id');
  const accountUsername = jwtField(token, 'username', 'email', 'preferred_username', 'sub') || username;
  return {
    token: session.token,
    tokenExp: session.tokenExp,
    accountId: accountId ? String(accountId) : null,
    username: accountUsername ? String(accountUsername) : null,
    session,
  };
}

/* ------------------------------------------------------------------ */
/*  Hisob amallari                                                     */
/* ------------------------------------------------------------------ */

/** Token hali yaroqlimi (60 s zaxira bilan) */
export function tokenValid(session) {
  return Boolean(session?.token) && (!session.tokenExp || session.tokenExp - Date.now() > 60_000);
}

/** Profil ma'lumoti (ism, telefon) — token bilan */
export async function getProfile(session) {
  const { data } = await authedRequest(session, AUTH.profile);
  const user = data?.data ?? data ?? {};
  return {
    firstName: user.firstname ?? user.firstName ?? '',
    lastName: user.lastname ?? user.lastName ?? '',
    phone: user.phone ?? user.phoneNumber ?? '',
    email: user.email ?? '',
  };
}

/** Faol (to'lanmagan/kutilayotgan) buyurtmalar soni */
export async function getActiveOrderCount(session) {
  try {
    const { data } = await authedRequest(session, AUTH.activeCount, { priority: 'low' });
    const count = data?.data ?? data?.count ?? data;
    return Number.isFinite(Number(count)) ? Number(count) : 0;
  } catch {
    return 0;
  }
}

const clean = (value) => (value === undefined || value === null ? '' : String(value).trim());

/** Sayt buyurtmasini loyihaning ko'rinishiga keltirish (himoyaviy) */
function normalizeOrder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const orderId = clean(raw.orderId ?? raw.id ?? raw.order_id ?? raw.orderNumber);
  if (!orderId) return null;
  const amount = Number(raw.amount ?? raw.sum ?? raw.totalSum ?? raw.price ?? 0) || null;
  const status = clean(raw.status ?? raw.state ?? raw.orderStatus).toUpperCase();
  return {
    orderId,
    status: status || 'UNKNOWN',
    amount,
    trainNumber: clean(raw.trainNumber ?? raw.train_number ?? raw.train),
    from: clean(raw.depStationName ?? raw.stationFrom ?? raw.from),
    to: clean(raw.arvStationName ?? raw.stationTo ?? raw.to),
    date: clean(raw.depDate ?? raw.departureDate ?? raw.date).slice(0, 10) || null,
    expiresAt: clean(raw.expireAt ?? raw.expiresAt ?? raw.holdEndTime) || null,
    payable: /RESERV|NOTPAYED|NOT_PAYED|HOLD|WAIT/i.test(status),
  };
}

function extractOrderArray(data) {
  const candidates = [data?.data?.orders, data?.data?.list, data?.data?.items, data?.orders, data?.list, data?.data, data];
  for (const list of candidates) if (Array.isArray(list)) return list;
  return [];
}

/** Foydalanuvchining buyurtmalari (faol/to'lanmaganlar birinchi) */
export async function getOrders(session, { page = 0, limit = 20 } = {}) {
  let data;
  try {
    ({ data } = await authedRequest(session, AUTH.activeList, {
      method: 'POST',
      payload: { page, limit },
      priority: 'high',
    }));
  } catch (error) {
    if (error instanceof RailwayError && error.status === 404) {
      ({ data } = await authedRequest(session, AUTH.ordersList, { method: 'POST', payload: { page, length: limit } }));
    } else {
      throw error;
    }
  }
  return extractOrderArray(data).map(normalizeOrder).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  To'lov so'rovi (Payme / Click)                                     */
/* ------------------------------------------------------------------ */

export const PAY_PROVIDERS = { payme: AUTH.payme, click: AUTH.click };

/**
 * Mavjud buyurtma uchun to'lov so'rovi yaratish.
 * Bot karta ma'lumotini olmaydi — Payme/Click ilovasiga invoice yuboriladi,
 * foydalanuvchi o'sha ilovada tasdiqlaydi.
 * @returns {Promise<{ok:boolean, provider:string, invoiceId:string|null, raw:any}>}
 */
export async function createPaymentInvoice(session, { orderId, provider, phone }) {
  const path = PAY_PROVIDERS[provider];
  if (!path) throw new RailwayError('To\'lov turi noto\'g\'ri', { code: 'INPUT' });
  if (!orderId) throw new RailwayError('Buyurtma raqami ko\'rsatilmagan', { code: 'INPUT' });

  const payload = { orderId: String(orderId), phone: String(phone || ''), phoneNumber: String(phone || '') };
  const { data } = await authedRequest(session, path, { method: 'POST', payload });
  const body = data?.data ?? data ?? {};
  const invoiceId = clean(body.invoiceId ?? body.invoice_id ?? body.id ?? body.transactionId) || null;
  const failed = data?.error || body?.error || /fail|error/i.test(clean(body.status));
  return { ok: !failed, provider, invoiceId, raw: body };
}

/* ------------------------------------------------------------------ */
/*  Saqlangan yo'lovchilar (eticket "friends")                          */
/* ------------------------------------------------------------------ */

/** "09.10.2026 08:37" → { date:"2026-10-09", time:"08:37:00" } */
function splitSiteDateTime(value) {
  const text = clean(value);
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T]?(\d{2}):(\d{2})/);
  if (m) return { date: `${m[3]}-${m[2]}-${m[1]}`, time: `${m[4]}:${m[5]}:00` };
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}):(\d{2})/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time: `${iso[4]}:${iso[5]}:00` };
  return { date: null, time: null };
}

/** "03.10.1999" → "1999-10-03" */
function birthToIso(value) {
  const m = clean(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : clean(value);
}

const GENDER_MAP = { M: 'MALE', F: 'FEMALE', MALE: 'MALE', FEMALE: 'FEMALE', male: 'MALE', female: 'FEMALE' };

/**
 * eticketda saqlangan yo'lovchilar (reserve uchun — barcha kerakli maydonlar tayyor:
 * familiya/ism/sharif, pasport, tug'ilgan sana, jins, fuqarolik, regionId).
 * @returns {Promise<Array>} friend obyektlari
 */
export async function getFriends(session, accountId) {
  const { data } = await authedRequest(session, AUTH.friends, {
    method: 'POST',
    payload: { userId: accountId || jwtField(session.token, 'id', 'userId', 'uuid') || '' },
  });
  const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
  return list.map((f) => ({
    friendId: clean(f.friendId),
    firstName: clean(f.firstname ?? f.firstName),
    lastName: clean(f.lastname ?? f.lastName),
    middleName: clean(f.midname ?? f.middleName),
    gender: GENDER_MAP[clean(f.sex ?? f.gender)] || 'MALE',
    birthDate: birthToIso(f.birthDay ?? f.birthday),
    docType: clean(f.docType) || 'ПУ',
    docNumber: clean(f.doc ?? f.documentId),
    citizenship: clean(f.citizenship) || 'UZB',
    regionId: clean(f.regionId),
    self: Boolean(f.yourSelf),
  })).filter((f) => f.firstName && f.lastName && f.docNumber);
}

/* ------------------------------------------------------------------ */
/*  Qidiruv va joy xaritasi (bron platformasida)                        */
/* ------------------------------------------------------------------ */

/**
 * Bron platformasida poyezd qidirish (reserve uchun kerakli maydonlar bilan:
 * providerType, brand, jo'nash/yetib borish kodi/nomi/sana/vaqti).
 */
export async function searchTrainsForBooking(session, { from, to, date }) {
  const { data } = await authedRequest(session, AUTH.trainsList, {
    method: 'POST',
    payload: { directions: { forward: { date, depStationCode: from, arvStationCode: to } }, routeType: 'INTERCITY' },
  });
  const trains = data?.data?.directions?.forward?.trains ?? data?.directions?.forward?.trains ?? [];
  return (Array.isArray(trains) ? trains : []).map((t) => {
    const dep = splitSiteDateTime(t.departureDate ?? t.departure);
    const arr = splitSiteDateTime(t.arrivalDate ?? t.arrival);
    const sub = t.subRoute ?? {};
    return {
      number: clean(t.number ?? t.trainNumber),
      brand: clean(t.brand),
      providerType: clean(t.providerType) || 'EXPRESS',
      departure: { code: clean(sub.depStationCode) || String(from), name: clean(sub.depStationName), date: dep.date || date, time: dep.time },
      arrival: { code: clean(sub.arvStationCode) || String(to), name: clean(sub.arvStationName), date: arr.date || date, time: arr.time },
      cars: Array.isArray(t.cars) ? t.cars : [],
    };
  });
}

/**
 * Joy xaritasi: har bir vagon — raqami, (kirill) turi, xizmat klassi va bo'sh joylar.
 * reserve trainInfo.carNumber / carType / serviceClass shu yerdan olinadi.
 */
export async function getSeatPlaces(session, { from, to, date, trainNumber, trainId = null }) {
  const { data } = await authedRequest(session, AUTH.trainPlaces, {
    method: 'POST',
    payload: { depDate: date, depStationCode: from, arvStationCode: to, trainNumber, trainId },
  });
  const train = data?.data?.train ?? data?.train ?? data?.data ?? {};
  const groups = train?.carGroup ?? train?.carGroups ?? train?.cars ?? [];
  const cars = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    const carType = clean(group?.type ?? group?.typeShow);
    const serviceClass = clean(group?.services?.type ?? group?.classService ?? group?.serviceClass);
    const list = Array.isArray(group?.cars) ? group.cars : [group];
    for (const car of list) {
      const places = parsePlaceNumbers(car?.places ?? car?.seats ?? car?.freePlaces ?? car?.placeList);
      const number = clean(car?.number ?? car?.carNumber ?? car?.num);
      if (!number && !places.length) continue;
      cars.push({ number: number || '?', carType, serviceClass: serviceClass || clean(car?.classService), places });
    }
  }
  return cars;
}

/** Joy raqamlarini o'qish ([9,11] | ["09","11"] | "9,11" | [{number:9}]) */
function parsePlaceNumbers(value) {
  const out = new Set();
  const walk = (item) => {
    if (item === null || item === undefined) return;
    if (typeof item === 'number') { if (Number.isInteger(item) && item > 0) out.add(item); }
    else if (typeof item === 'string') item.split(/[,;\s]+/).filter(Boolean).forEach((tok) => { const n = Number.parseInt(tok, 10); if (n > 0) out.add(n); });
    else if (Array.isArray(item)) item.forEach(walk);
    else if (typeof item === 'object') walk(item.number ?? item.seatNumber ?? item.place ?? item.placeNumber ?? item.seat);
  };
  walk(value);
  return [...out].filter((n) => n > 0 && n < 1000).sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/*  BRON — bitta so'rov (order + yo'lovchi + joy)                       */
/*  Kontrakt: docs/uzrailpass-booking-api.md                           */
/* ------------------------------------------------------------------ */

/** "Lastname=Firstname=Patronymic" (sharif bo'lmasa — ikki qismli) */
function buildFullName(p) {
  const parts = [p.lastName, p.firstName];
  if (p.middleName) parts.push(p.middleName);
  return parts.filter(Boolean).join('=');
}

/**
 * Joy band qilish — bitta POST /api/v3/universal-orders/reserve.
 * @param train {number, brand, providerType, departure:{code,name,date,time}, arrival:{...}}
 * @param car   {number, carType, serviceClass}
 * @param seats [n,...] tanlangan joy raqamlari
 * @param passengers [{firstName,lastName,middleName,gender,birthDate,docType,docNumber,citizenship,regionId}]
 * @param webCustomer {id, username}
 * @returns {Promise<{orderId:string, raw:any}>}
 */
export async function reserve(session, { train, car, seats, passengers, webCustomer }) {
  if (!tokenValid(session)) throw new RailwayError('Avval akkauntni ulang', { code: 'AUTH_REQUIRED' });
  if (!train?.number || !car?.number) throw new RailwayError('Poyezd/vagon ma\'lumoti to\'liq emas', { code: 'INPUT' });
  if (!seats?.length) throw new RailwayError('Joylar tanlanmagan', { code: 'INPUT' });
  if (!passengers?.length) throw new RailwayError('Yo\'lovchi tanlanmagan', { code: 'INPUT' });

  const sorted = [...seats].sort((a, b) => a - b);
  const seatsRange = `${sorted[0]}-${sorted[sorted.length - 1]}`;

  const tickets = passengers.map((p) => ({
    passengerInfo: {
      fullName: buildFullName(p),
      documentId: p.docNumber,
      documentType: p.docType || 'ПУ',
      gender: GENDER_MAP[p.gender] || p.gender || 'MALE',
      citizenship: p.citizenship || 'UZB',
      birthday: birthToIso(p.birthDate),
      // Sayt bo'sh regionId'ni rad etadi ("must not be blank") — bo'sh bo'lsa standart qiymat
      regionId: clean(p.regionId) || DEFAULT_REGION_ID,
      discountType: 'REGULAR',
      referenceDocument: null,
      prefix: null,
      tariffCode: null,
      child: null,
    },
    pricingMode: 'FULL',
    hasPatronymics: Boolean(p.middleName),
  }));

  const payload = {
    channel: 'WEB',
    orderKind: 'RETAIL',
    paymentMode: 'CARD',
    groupType: 'INDIVIDUALS',
    orderType: 'INDIVIDUAL',
    providerType: train.providerType || 'EXPRESS',
    documentMode: 'NAMED',
    subItems: [
      {
        trainInfo: {
          trainNumber: train.number,
          carNumber: car.number,
          carType: car.carType,
          serviceClass: car.serviceClass,
          directionSequence: 1,
          brand: train.brand,
        },
        departure: train.departure,
        arrival: train.arrival,
        hasInsurance: false,
        hasCateringOrder: null,
        hasGreenTicket: false,
        reserveSeatRequirements: { seatsRange },
        tickets,
      },
    ],
    webCustomer: { id: webCustomer?.id || '', username: webCustomer?.username || '', ip: BASE_HOST },
  };

  const { data } = await authedRequest(session, AUTH.reserve, { method: 'POST', payload });
  const level = clean(data?.messageLevel).toUpperCase();
  const orderId = clean(data?.response ?? data?.data?.response ?? data?.orderNumber ?? data?.data?.orderNumber);
  if (!orderId || (level && level !== 'OK') || (data?.code && Number(data.code) >= 400)) {
    const message = clean(data?.message) || 'Joyni band qilib bo\'lmadi';
    throw new RailwayError(message, { code: 'RESERVE_FAILED' });
  }
  return { orderId, raw: data };
}

/** Bron muddati (to'lov qachongacha) */
export async function getPaymentEndTime(session, orderId) {
  try {
    const { data } = await authedRequest(session, `${AUTH.paymentEndTime}${encodeURIComponent(orderId)}`, { method: 'GET' });
    return clean(data?.data ?? data?.response ?? data) || null;
  } catch {
    return null;
  }
}

/** Bron bekor qilish (to'lanmagan bo'lsa) */
export async function cancelOrder(session, orderId) {
  const { data } = await authedRequest(session, AUTH.cancel, { method: 'POST', payload: { orderId: String(orderId) } });
  return { ok: !data?.error };
}

export default {
  createSession, login, tokenValid, getProfile, getOrders, getActiveOrderCount,
  createPaymentInvoice, getFriends, searchTrainsForBooking, getSeatPlaces, reserve,
  getPaymentEndTime, cancelOrder, PAY_PROVIDERS, BASE_URL, BASE_HOST,
};
