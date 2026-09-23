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

      if (req.url === '/api/v1/auth/login') {
        return send(200, { token: 'header.eyJleHAiOjQxMDI0NDQ4MDB9.sig' });
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
