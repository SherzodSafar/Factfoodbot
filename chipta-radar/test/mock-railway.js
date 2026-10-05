/**
 * Sinov uchun soxta eticket.railway.uz serveri (faqat lokal testlar uchun).
 * Haqiqiy sayt kabi XSRF-TOKEN cookie talab qiladi.
 *
 * Qo'lda ishga tushirish:  node test/mock-railway.js   (port 4010)
 * So'ng .env ga:  RAILWAY_BASE_URL=http://localhost:4010
 */
import http from 'node:http';
import { trainListResponse, trainDetailResponse } from './fixtures.js';

export function startMockRailway({ port = 0 } = {}) {
  const state = {
    requests: [],
    free: {},
    places: {},
    requireAuth: false,
    failNext: 0,
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const cookie = req.headers.cookie || '';
      const xsrf = req.headers['x-xsrf-token'];
      state.requests.push({ method: req.method, url: req.url, xsrf, cookie, body });

      const send = (status, data, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(data));
      };

      // Sinov davomida holatni o'zgartirish: POST /mock/state {"free": {...}, "places": {...}}
      if (req.url === '/mock/state' && req.method === 'POST') {
        try {
          Object.assign(state, JSON.parse(body || '{}'));
        } catch {
          return send(400, { message: 'bad json' });
        }
        return send(200, { ok: true, free: state.free, places: state.places });
      }

      if (req.url === '/api/v1/csrf-token') {
        return send(200, {}, { 'Set-Cookie': ['XSRF-TOKEN=mock-xsrf-123; Path=/', 'SESSION=abc; Path=/; HttpOnly'] });
      }

      if (state.failNext > 0) {
        state.failNext -= 1;
        return send(500, { error: 'boom' });
      }

      if (!cookie.includes('XSRF-TOKEN=mock-xsrf-123') || xsrf !== 'mock-xsrf-123') {
        return send(403, { message: 'Invalid CSRF token' });
      }
      if (state.requireAuth && !req.headers.authorization) {
        return send(401, { message: 'Unauthorized' });
      }

      let payload = {};
      try {
        payload = JSON.parse(body || '{}');
      } catch {
        return send(400, { message: 'bad json' });
      }

      if (req.url === '/api/v3/handbook/trains/list') {
        const date = payload?.directions?.forward?.date;
        if (!date) return send(400, { message: 'date required' });
        return send(200, trainListResponse(date, state.free));
      }

      if (req.url === '/api/v1/handbook/trains') {
        return send(200, trainDetailResponse(state.places));
      }

      if (req.url === '/api/v1/auth/login' || req.url === '/api/v3/auth/login') {
        if (state.requireCaptcha && !req.headers['captcha-response']) {
          return send(403, { message: 'captcha required' });
        }
        if (payload.username === 'bad' || payload.password === 'bad') {
          return send(401, { message: 'invalid credentials' });
        }
        // id=777, exp=4102444800 (2100-yil) — base64url JWT (imzosiz, test uchun)
        const body = Buffer.from(JSON.stringify({ id: 777, sub: payload.username, exp: 4102444800 })).toString('base64url');
        return send(200, { token: `header.${body}.sig` });
      }

      if (req.url === '/api/v1/users/get') {
        if (!req.headers.authorization) return send(401, { message: 'Unauthorized' });
        return send(200, { data: { firstname: 'Anvar', lastname: 'Ismoilov', phone: '998901234567' } });
      }

      if (req.url === '/api/v1/query/orders/active/tickets/count') {
        return send(200, { data: state.orderCount ?? 2 });
      }

      if (req.url === '/api/v1/query/railway/orders/active/tickets/list') {
        const orders = state.orders ?? [
          { orderId: 'ORD-1', status: 'RESERVED', amount: 270000, trainNumber: '764Ф', depStationName: 'Toshkent', arvStationName: 'Samarqand', depDate: '2030-01-10' },
          { orderId: 'ORD-2', status: 'PAID', amount: 130000, trainNumber: '054Ф' },
        ];
        return send(200, { data: { orders } });
      }

      if (req.url === '/api/v1/payme/create-invoice' || req.url === '/api/v1/clickMerchant/create-invoice') {
        if (!req.headers.authorization) return send(401, { message: 'Unauthorized' });
        if (!payload.orderId) return send(400, { message: 'orderId required' });
        return send(200, { data: { invoiceId: `INV-${payload.orderId}`, status: 'created' } });
      }

      // Bron oqimi (hold → yo'lovchi → reserve)
      if (req.url === '/api/v3/universal-orders/hold') {
        if (!req.headers.authorization) return send(401, { message: 'Unauthorized' });
        state.lastHold = payload;
        return send(200, { data: { orderId: state.orderId || 'ORD-AUTO' } });
      }
      if (req.url === '/api/v3/universal-orders/add-passenger-info') {
        state.passengerInfos = (state.passengerInfos || []).concat([payload]);
        return send(200, { data: { ok: true } });
      }
      if (req.url === '/api/v3/universal-orders/reserve') {
        return send(200, { data: { orderId: payload.orderId, amount: state.reserveAmount ?? 270000, expireAt: '2030-01-10T09:00:00' } });
      }

      return send(404, { message: 'not found' });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({ url: `http://127.0.0.1:${actual}`, state, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('mock-railway.js')) {
  startMockRailway({ port: Number(process.env.MOCK_PORT || 4010) }).then(({ url }) => {
    console.log(`🧪 Soxta eticket serveri: ${url}`);
  });
}
