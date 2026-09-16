/**
 * Backend bilan aloqa. Har bir so'rovga Telegram initData qo'shiladi.
 */
import { getInitData } from './telegram.js';

const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const response = await fetch(`${BASE}/api/client${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': getInitData(),
      ...(options.headers || {}),
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Serverdan noto\'g\'ri javob keldi');
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Xatolik yuz berdi');
  }
  return data;
}

export const api = {
  bootstrap: () => request('/bootstrap'),
  products: () => request('/products'),
  myOrders: () => request('/orders'),
  createOrder: (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload) }),
  updateProfile: (payload) => request('/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
};

export default api;
