/**
 * Admin Panel uchun backend bilan aloqa.
 * Token localStorage'da saqlanadi va har so'rovga qo'shiladi.
 */
/**
 * Backend manzili (Mini App bilan bir xil mantiq).
 */
const PRODUCTION_API = 'https://factfood-api.onrender.com';
const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : PRODUCTION_API);
const TOKEN_KEY = 'factfood_admin_token';

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

async function request(path, options = {}) {
  const response = await fetch(`${BASE}/api/admin${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Serverdan noto\'g\'ri javob keldi');
  }

  if (response.status === 401) {
    setToken('');
    const error = new Error(data.error || 'Sessiya tugadi');
    error.unauthorized = true;
    throw error;
  }

  if (!response.ok || data.ok === false) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}

export const api = {
  login: (password) =>
    request('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  me: () => request('/me'),
  stats: () => request('/stats'),

  orders: (status) => request(`/orders${status ? `?status=${status}` : ''}`),
  setOrderStatus: (id, status) =>
    request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteOrder: (id) => request(`/orders/${id}`, { method: 'DELETE' }),

  products: () => request('/products'),
  createProduct: (payload) => request('/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id, payload) =>
    request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
};

export default api;
