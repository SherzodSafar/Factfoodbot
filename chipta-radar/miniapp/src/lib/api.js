/**
 * Backend bilan aloqa. Har bir so'rovga Telegram initData qo'shiladi.
 *
 * Backend manzili:
 *  - ishlab chiqishda (npm run dev) — bo'sh: so'rovlar Vite proxy orqali localhost:3000 ga ketadi
 *  - bulutda — VITE_API_URL (Render'dagi backend)
 */
import { getInitData } from './telegram.js';

const PRODUCTION_API = 'https://chipta-radar-api.onrender.com';
const BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : PRODUCTION_API)).replace(/\/+$/, '');

async function request(path, { method = 'GET', body, timeoutMs = 45_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${BASE}/api/client${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': getInitData(),
      },
    });
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'Server javob bermadi. Internetni tekshirib, qayta urinib ko\'ring.'
      : 'Serverga ulanib bo\'lmadi. Internetni tekshiring.';
    throw Object.assign(new Error(message), { network: true });
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(response.status >= 500 ? 'Server vaqtincha ishlamayapti' : 'Serverdan noto\'g\'ri javob keldi');
  }

  if (!response.ok || data.ok === false) {
    throw Object.assign(new Error(data.error || 'Xatolik yuz berdi'), { status: response.status, code: data.code });
  }
  return data;
}

const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const api = {
  // Birinchi ochilishda server uyg'onishi mumkin (bepul tarif) — kutish vaqti uzunroq
  bootstrap: () => request('/bootstrap', { timeoutMs: 90_000 }),
  search: (params) => request(`/search?${qs(params)}`),
  train: (params) => request(`/train?${qs(params)}`),
  watches: () => request('/watches'),
  watch: (id) => request(`/watches/${id}`),
  createWatch: (body) => request('/watches', { method: 'POST', body, timeoutMs: 90_000 }),
  updateWatch: (id, body) => request(`/watches/${id}`, { method: 'PATCH', body }),
  deleteWatch: (id) => request(`/watches/${id}`, { method: 'DELETE' }),
  checkWatch: (id) => request(`/watches/${id}/check`, { method: 'POST', timeoutMs: 60_000 }),
  profile: () => request('/profile'),
  updateProfile: (body) => request('/profile', { method: 'PATCH', body }),
};

export default api;
