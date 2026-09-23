/**
 * Admin Panel uchun backend bilan aloqa.
 * Token localStorage'da saqlanadi va har so'rovga qo'shiladi.
 */
const PRODUCTION_API = 'https://chipta-radar-api.onrender.com';
const BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : PRODUCTION_API)).replace(/\/+$/, '');
const TOKEN_KEY = 'chipta_admin_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage o'chirilgan */
  }
};

async function request(path, { method = 'GET', body, timeoutMs = 90_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${BASE}/api/admin${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    });
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? 'Server javob bermadi (vaqt tugadi)' : 'Serverga ulanib bo\'lmadi');
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(response.status >= 500 ? 'Server vaqtincha ishlamayapti' : 'Serverdan noto\'g\'ri javob keldi');
  }

  if (response.status === 401) {
    setToken('');
    throw Object.assign(new Error(data.error || 'Sessiya tugadi'), { unauthorized: true });
  }
  if (!response.ok || data.ok === false) {
    throw Object.assign(new Error(data.error || 'Xatolik yuz berdi'), { data });
  }
  return data;
}

const qs = (params) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return query ? `?${query}` : '';
};

export const api = {
  login: (password) => request('/login', { method: 'POST', body: { password } }),
  me: () => request('/me'),
  stats: () => request('/stats'),

  watches: (params) => request(`/watches${qs(params)}`),
  updateWatch: (id, status) => request(`/watches/${id}`, { method: 'PATCH', body: { status } }),
  deleteWatch: (id) => request(`/watches/${id}`, { method: 'DELETE' }),
  checkWatch: (id) => request(`/watches/${id}/check`, { method: 'POST' }),
  runWatcher: () => request('/watcher/run', { method: 'POST' }),

  users: (params) => request(`/users${qs(params)}`),
  blockUser: (id, isBlocked) => request(`/users/${id}`, { method: 'PATCH', body: { isBlocked } }),
  messageUser: (id, text) => request(`/users/${id}/message`, { method: 'POST', body: { text } }),

  notifications: (params) => request(`/notifications${qs(params)}`),

  stations: () => request('/stations'),
  createStation: (body) => request('/stations', { method: 'POST', body }),
  updateStation: (code, body) => request(`/stations/${code}`, { method: 'PUT', body }),
  deleteStation: (code) => request(`/stations/${code}`, { method: 'DELETE' }),

  testSearch: (body) => request('/test-search', { method: 'POST', body }),
  railwayReset: () => request('/railway/reset', { method: 'POST' }),

  settings: () => request('/settings'),
  saveSettings: (body) => request('/settings', { method: 'PUT', body }),

  broadcast: (text) => request('/broadcast', { method: 'POST', body: { text } }),
  broadcastStatus: () => request('/broadcast'),
};

export default api;
