/**
 * eticket.railway.uz bilan aloqa — botning yagona ma'lumot manbai.
 *
 * Saytga hurmat bilan munosabat:
 *   • barcha so'rovlar bitta navbatdan o'tadi, orasida kamida N ms tanaffus;
 *   • bir xil qidiruv qisqa vaqt keshlanadi, bir vaqtdagi bir xil so'rovlar birlashtiriladi;
 *   • sayt "juda ko'p so'rov" (429) desa — bir necha daqiqa to'xtab turiladi.
 *
 * Sessiya: sayt XSRF-TOKEN cookie talab qiladi — u avtomatik olinadi va yangilanadi.
 * Agar API hisobga kirishni talab qilsa, RAILWAY_LOGIN / RAILWAY_PASSWORD ishlatiladi.
 */
import config from '../config/default.js';
import { normalizeTrainList, normalizeTrainDetail, UnexpectedShapeError } from '../services/trains.js';

const ENDPOINTS = {
  csrf: '/api/v1/csrf-token',
  login: '/api/v1/auth/login',
  trains: '/api/v3/handbook/trains/list',
  detail: '/api/v1/handbook/trains',
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const CSRF_TTL_MS = 20 * 60 * 1000;
const COOLDOWN_STEPS_MS = [2, 5, 10, 15].map((minutes) => minutes * 60 * 1000);
const CACHE_LIMIT = 400;

export class RailwayError extends Error {
  constructor(message, { code = 'RAILWAY_ERROR', status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'RailwayError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/*  Holat va statistika                                                */
/* ------------------------------------------------------------------ */

const session = {
  cookies: new Map(),
  xsrf: '',
  csrfAt: 0,
  token: '',
  tokenExp: 0,
  useLogin: false,
};

const limits = {
  minIntervalMs: config.railway.minIntervalMs,
  lastRequestAt: 0,
  cooldownUntil: 0,
  cooldownStep: 0,
};

const stats = {
  requests: 0,
  success: 0,
  failures: 0,
  cacheHits: 0,
  avgMs: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
  lastErrorCode: null,
  lastSample: null,
  authMode: 'anonymous',
};

/** Admin Paneldan so'rovlar oralig'ini o'zgartirish */
export function setMinInterval(ms) {
  const value = Number(ms);
  if (Number.isFinite(value)) limits.minIntervalMs = Math.min(10_000, Math.max(300, Math.round(value)));
}

/* ------------------------------------------------------------------ */
/*  Navbat (ustuvorlik bilan: foydalanuvchi so'rovlari birinchi)        */
/* ------------------------------------------------------------------ */

const queue = { high: [], low: [] };
let pumping = false;

function enqueue(task, priority = 'high') {
  return new Promise((resolve, reject) => {
    (priority === 'low' ? queue.low : queue.high).push({ task, resolve, reject });
    pump();
  });
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.high.length || queue.low.length) {
      const job = queue.high.length ? queue.high.shift() : queue.low.shift();
      const wait = limits.lastRequestAt + limits.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        job.resolve(await job.task());
      } catch (error) {
        job.reject(error);
      } finally {
        limits.lastRequestAt = Date.now();
      }
    }
  } finally {
    pumping = false;
  }
}

/* ------------------------------------------------------------------ */
/*  HTTP va sessiya                                                    */
/* ------------------------------------------------------------------ */

function cookieHeader() {
  return [...session.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function absorbCookies(response) {
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

function buildHeaders(extra = {}) {
  const { baseUrl, lang } = config.railway;
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': lang,
    Origin: baseUrl,
    Referer: `${baseUrl}/${lang}/home`,
    'device-type': 'BROWSER',
    ...extra,
  };
  if (session.cookies.size) headers.Cookie = cookieHeader();
  if (session.xsrf) headers['X-XSRF-TOKEN'] = session.xsrf;
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  return headers;
}

async function http(path, { method = 'GET', body, headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.railway.timeoutMs);
  try {
    return await fetch(`${config.railway.baseUrl}${path}`, {
      method,
      body,
      headers: buildHeaders(headers),
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function networkError(error) {
  if (error instanceof RailwayError) return error;
  const reason = error?.name === 'AbortError'
    ? 'vaqt tugadi'
    : error?.cause?.code || error?.cause?.message || error?.message || 'noma\'lum';
  return new RailwayError(`eticket.railway.uz bilan aloqa yo'q (${reason})`, { code: 'NETWORK', retryable: true });
}

/** XSRF-TOKEN cookie'ni olish (20 daqiqada bir yangilanadi) */
async function ensureCsrf(force = false) {
  if (!force && session.xsrf && Date.now() - session.csrfAt < CSRF_TTL_MS) return;
  if (force) {
    session.cookies.clear();
    session.xsrf = '';
  }

  const response = await http(ENDPOINTS.csrf);
  absorbCookies(response);
  const text = await response.text().catch(() => '');

  if (!session.xsrf) {
    // Ba'zi versiyalarda token javob tanasida keladi
    try {
      const data = JSON.parse(text);
      const token = data?.token ?? data?.csrfToken ?? data?.data?.token ?? data?.data?.csrfToken;
      if (token) session.xsrf = String(token);
    } catch {
      /* JSON emas — cookie yetarli */
    }
  }
  session.csrfAt = Date.now();
}

function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
    return payload?.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Hisobga kirish (faqat sayt talab qilsa va login/parol berilgan bo'lsa) */
async function ensureLogin(force = false) {
  const { login, password } = config.railway;
  if (!login || !password) return false;
  if (!force && session.token && session.tokenExp - Date.now() > 60_000) return true;

  session.token = '';
  const response = await http(ENDPOINTS.login, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: login, password }),
  });
  absorbCookies(response);
  const text = await response.text().catch(() => '');

  if (!response.ok) {
    throw new RailwayError(`eticket hisobiga kirib bo'lmadi (HTTP ${response.status}). Login/parolni tekshiring.`, {
      code: 'LOGIN_FAILED',
      status: response.status,
    });
  }

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* bo'sh javob */
  }
  const token = data?.token ?? data?.accessToken ?? data?.access_token ?? data?.data?.token ?? data?.data?.accessToken;
  if (!token) throw new RailwayError('Login javobida token topilmadi', { code: 'LOGIN_FAILED' });

  session.token = String(token);
  session.tokenExp = jwtExpiry(token) || Date.now() + 25 * 60_000;
  stats.authMode = 'account';
  return true;
}

function startCooldown() {
  const step = Math.min(limits.cooldownStep, COOLDOWN_STEPS_MS.length - 1);
  limits.cooldownUntil = Date.now() + COOLDOWN_STEPS_MS[step];
  limits.cooldownStep = step + 1;
  console.warn(`[railway] Sayt so'rovlarni chekladi — ${Math.round(COOLDOWN_STEPS_MS[step] / 60000)} daqiqa tanaffus`);
}

function recordSuccess(ms) {
  stats.requests += 1;
  stats.success += 1;
  stats.avgMs = stats.avgMs ? Math.round(stats.avgMs * 0.8 + ms * 0.2) : ms;
  stats.lastSuccessAt = new Date().toISOString();
  limits.cooldownStep = 0;
}

function recordFailure(error, sample) {
  stats.requests += 1;
  stats.failures += 1;
  stats.lastErrorAt = new Date().toISOString();
  stats.lastError = error.message;
  stats.lastErrorCode = error.code || 'ERROR';
  if (sample) stats.lastSample = String(sample).slice(0, 600);
}

/**
 * JSON POST so'rov (navbat, qayta urinish va sessiya yangilash bilan).
 */
async function postJson(path, payload) {
  const loginConfigured = Boolean(config.railway.login && config.railway.password);
  let refreshSession = false;
  let forceLogin = false;
  let lastError = null;
  let lastSample = null;

  const fail = (error, sample) => {
    recordFailure(error, sample);
    return error;
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(1000 * attempt);
    const started = Date.now();
    let response;
    let text;

    try {
      await ensureCsrf(refreshSession);
      if (session.useLogin) await ensureLogin(forceLogin);
      response = await http(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      absorbCookies(response);
      text = await response.text().catch(() => '');
    } catch (error) {
      if (error instanceof RailwayError && !error.retryable) throw fail(error);
      lastError = networkError(error);
      continue;
    }

    refreshSession = false;
    forceLogin = false;
    lastSample = text;
    const { status } = response;

    if (status === 429) {
      startCooldown();
      throw fail(
        new RailwayError('Sayt vaqtincha so\'rovlarni chekladi. Bir necha daqiqadan so\'ng avtomatik davom etamiz.', {
          code: 'RATE_LIMITED',
          status,
        }),
        text,
      );
    }

    if (status === 401) {
      if (loginConfigured) {
        session.useLogin = true;
        forceLogin = true;
        lastError = new RailwayError('eticket hisobiga kirish talab qilindi', { code: 'AUTH', status });
        continue;
      }
      throw fail(
        new RailwayError(
          'eticket API hisobga kirishni talab qilmoqda. Serverda RAILWAY_LOGIN va RAILWAY_PASSWORD sozlamalarini kiriting.',
          { code: 'AUTH_REQUIRED', status },
        ),
        text,
      );
    }

    if (status === 403 || status === 419) {
      // Ko'pincha eskirgan XSRF — sessiyani yangilab qayta urinamiz
      refreshSession = true;
      lastError = new RailwayError(`Sayt so'rovni rad etdi (HTTP ${status})`, { code: 'FORBIDDEN', status });
      continue;
    }

    if (status >= 500) {
      lastError = new RailwayError(`eticket.railway.uz serverida nosozlik (HTTP ${status})`, { code: 'SERVER_ERROR', status });
      continue;
    }

    if (status < 200 || status >= 300) {
      throw fail(new RailwayError(`Kutilmagan javob (HTTP ${status})`, { code: 'HTTP_ERROR', status }), text);
    }

    try {
      const data = JSON.parse(text);
      recordSuccess(Date.now() - started);
      return data;
    } catch {
      throw fail(new RailwayError('Sayt JSON o\'rniga boshqa ma\'lumot qaytardi', { code: 'BAD_RESPONSE', status }), text);
    }
  }

  throw fail(lastError, lastSample);
}

function request(path, payload, priority) {
  if (Date.now() < limits.cooldownUntil) {
    const minutes = Math.ceil((limits.cooldownUntil - Date.now()) / 60000);
    return Promise.reject(
      new RailwayError(`Sayt vaqtincha cheklov qo'ydi. Taxminan ${minutes} daqiqadan so'ng qayta urinib ko'ring.`, {
        code: 'COOLDOWN',
      }),
    );
  }
  return enqueue(() => postJson(path, payload), priority);
}

/* ------------------------------------------------------------------ */
/*  Kesh                                                               */
/* ------------------------------------------------------------------ */

const cache = new Map();
const inflight = new Map();

function trimCache() {
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

async function cached(key, maxAgeMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= maxAgeMs) {
    stats.cacheHits += 1;
    return { ...hit.value, cached: true, fetchedAt: new Date(hit.at).toISOString() };
  }
  if (inflight.has(key)) return inflight.get(key);

  const promise = loader()
    .then((value) => {
      const at = Date.now();
      cache.delete(key);
      cache.set(key, { at, value });
      trimCache();
      return { ...value, cached: false, fetchedAt: new Date(at).toISOString() };
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

function shapeError(error) {
  if (error instanceof UnexpectedShapeError) {
    const wrapped = new RailwayError(error.message, { code: 'UNEXPECTED_SHAPE' });
    recordFailure(wrapped, error.sample);
    console.warn(`[railway] ${error.message}. Namuna: ${error.sample}`);
    return wrapped;
  }
  return error;
}

/* ------------------------------------------------------------------ */
/*  Ochiq funksiyalar                                                  */
/* ------------------------------------------------------------------ */

/**
 * Yo'nalish va sana bo'yicha poyezdlar (vagon turlari, bo'sh joylar soni, narxlar).
 * @param {{from:string, to:string, date:string}} query  date: "YYYY-MM-DD"
 * @param {{priority?:'high'|'low', maxAgeMs?:number}} options
 */
export async function searchTrains({ from, to, date }, { priority = 'high', maxAgeMs = config.railway.cacheTtlMs } = {}) {
  const key = `list:${from}:${to}:${date}`;
  return cached(key, maxAgeMs, async () => {
    const json = await request(
      ENDPOINTS.trains,
      { directions: { forward: { date, depStationCode: from, arvStationCode: to } } },
      priority,
    );
    try {
      return { trains: normalizeTrainList(json) };
    } catch (error) {
      throw shapeError(error);
    }
  });
}

/**
 * Bitta poyezdning vagonlari va aniq bo'sh joy raqamlari.
 */
export async function getTrainDetail(
  { from, to, date, trainNumber, trainId = null },
  { priority = 'high', maxAgeMs = config.railway.cacheTtlMs } = {},
) {
  const key = `detail:${from}:${to}:${date}:${trainNumber}`;
  return cached(key, maxAgeMs, async () => {
    const json = await request(
      ENDPOINTS.detail,
      { depDate: date, depStationCode: from, arvStationCode: to, trainNumber, trainId },
      priority,
    );
    try {
      return { cars: normalizeTrainDetail(json) };
    } catch (error) {
      throw shapeError(error);
    }
  });
}

/** Admin Panel uchun holat */
export function getRailwayStatus() {
  const now = Date.now();
  let state = 'unknown';
  if (limits.cooldownUntil > now) state = 'cooldown';
  else if (stats.lastSuccessAt && (!stats.lastErrorAt || stats.lastSuccessAt >= stats.lastErrorAt)) state = 'ok';
  else if (stats.lastErrorAt) state = 'error';

  return {
    state,
    baseUrl: config.railway.baseUrl,
    ...stats,
    minIntervalMs: limits.minIntervalMs,
    cooldownUntil: limits.cooldownUntil > now ? new Date(limits.cooldownUntil).toISOString() : null,
    queue: { high: queue.high.length, low: queue.low.length },
    cacheSize: cache.size,
    loginConfigured: Boolean(config.railway.login && config.railway.password),
    sessionAgeSec: session.csrfAt ? Math.round((now - session.csrfAt) / 1000) : null,
  };
}

/** Sessiya va keshni tozalash (Admin Panel → "Qayta ulanish") */
export function resetRailwaySession() {
  session.cookies.clear();
  session.xsrf = '';
  session.csrfAt = 0;
  session.token = '';
  session.tokenExp = 0;
  limits.cooldownUntil = 0;
  limits.cooldownStep = 0;
  cache.clear();
}

export default { searchTrains, getTrainDetail, getRailwayStatus, resetRailwaySession, setMinInterval, RailwayError };
