import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockRailway } from './mock-railway.js';

let mock;
let railway;
let matcher;

before(async () => {
  mock = await startMockRailway();
  process.env.RAILWAY_BASE_URL = mock.url;
  process.env.RAILWAY_MIN_INTERVAL_MS = '300';
  process.env.RAILWAY_CACHE_TTL_MS = '60000';
  railway = await import('../src/core/railway.js');
  matcher = await import('../src/services/matcher.js');
  railway.setMinInterval(300);
});

after(async () => {
  await mock.close();
});

test('CSRF cookie olinadi va so\'rovga qo\'shiladi', async () => {
  const { trains, cached } = await railway.searchTrains({ from: '2900000', to: '2900700', date: '2030-01-10' });
  assert.equal(trains.length, 3);
  assert.equal(cached, false);

  const listRequest = mock.state.requests.find((item) => item.url === '/api/v3/handbook/trains/list');
  assert.equal(listRequest.xsrf, 'mock-xsrf-123');
  assert.match(listRequest.cookie, /SESSION=abc/);
  assert.deepEqual(JSON.parse(listRequest.body), {
    directions: { forward: { date: '2030-01-10', depStationCode: '2900000', arvStationCode: '2900700' } },
  });
});

test('kesh: bir xil qidiruv qayta so\'ralmaydi, bir vaqtdagilari birlashadi', async () => {
  const before = mock.state.requests.length;
  const [a, b] = await Promise.all([
    railway.searchTrains({ from: '2900000', to: '2900800', date: '2030-01-11' }),
    railway.searchTrains({ from: '2900000', to: '2900800', date: '2030-01-11' }),
  ]);
  assert.equal(a.trains.length, b.trains.length);
  const again = await railway.searchTrains({ from: '2900000', to: '2900800', date: '2030-01-11' });
  assert.equal(again.cached, true);
  const listCalls = mock.state.requests.slice(before).filter((item) => item.url.includes('trains/list'));
  assert.equal(listCalls.length, 1);
});

test('server xatoligida qayta urinadi', async () => {
  mock.state.failNext = 1;
  const { trains } = await railway.searchTrains({ from: '2900000', to: '2900172', date: '2030-01-12' });
  assert.equal(trains.length, 3);
});

test('vagonlar tafsiloti va aniq joy kuzatuvi', async () => {
  const query = { from: '2900000', to: '2900700', date: '2030-01-10' };
  const { trains } = await railway.searchTrains(query);
  const loadDetail = (train) => railway.getTrainDetail({ ...query, trainNumber: train.number, trainId: train.id });

  // Plaskart, 2 ta pastki, hammasi bitta bo'limda: 07-vagon 9 va 11 (3-bo'lim)
  const watch = {
    mode: 'EXACT', carTypes: ['platskart'], trainNumbers: [], quantity: 2,
    section: 'compartment', berth: 'lower', together: 'compartment', noToilet: false,
  };
  const result = await matcher.evaluateWatch(watch, trains, loadDetail, Date.UTC(2030, 0, 1));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].train.number, '054Ф');
  assert.deepEqual(result.items[0].suggestions[0].parts[0].seats, [9, 11]);
  assert.deepEqual(result.keys, ['054Ф|07']);

  // Bokovoy yuqori 2 ta bitta joyda — yo'q (faqat 38, 44 — turli bo'limlarda)
  const side = { ...watch, section: 'side', berth: 'upper' };
  const none = await matcher.evaluateWatch(side, trains, loadDetail, Date.UTC(2030, 0, 1));
  assert.equal(none.items.length, 0);
});

test('istalgan joy kuzatuvi (ANY) — faqat ro\'yxat bo\'yicha', async () => {
  const query = { from: '2900000', to: '2900700', date: '2030-01-10' };
  const { trains } = await railway.searchTrains(query);
  const watch = { mode: 'ANY', carTypes: ['kupe'], trainNumbers: [], quantity: 3 };
  const result = await matcher.evaluateWatch(watch, trains, null, Date.UTC(2030, 0, 1));
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.keys, ['054Ф|kupe']);

  const tooMany = await matcher.evaluateWatch({ ...watch, quantity: 4 }, trains, null, Date.UTC(2030, 0, 1));
  assert.equal(tooMany.items.length, 0);

  // Jo'nash vaqti oralig'i va narx
  const evening = await matcher.evaluateWatch(
    { mode: 'ANY', carTypes: [], trainNumbers: [], quantity: 1, timeFrom: '18:00' },
    trains, null, Date.UTC(2030, 0, 1),
  );
  assert.equal(evening.items.length, 0);
  const cheap = await matcher.evaluateWatch(
    { mode: 'ANY', carTypes: [], trainNumbers: [], quantity: 1, maxPrice: 150000 },
    trains, null, Date.UTC(2030, 0, 1),
  );
  assert.deepEqual(cheap.keys, ['054Ф|platskart']);
});

test('jo\'nab ketgan poyezdlar hisobga olinmaydi', async () => {
  const query = { from: '2900000', to: '2900700', date: '2030-01-10' };
  const { trains } = await railway.searchTrains(query);
  // 2030-01-10 08:20 Toshkent — 764Ф (07:28) ketgan, 054Ф (08:30) ga 10 daqiqa qolgan
  const now = Date.UTC(2030, 0, 10, 3, 20);
  const result = await matcher.evaluateWatch({ mode: 'ANY', carTypes: [], trainNumbers: [], quantity: 1 }, trains, null, now);
  assert.deepEqual(result.items.map((item) => item.train.number), []);
});

test('holat statistikasi', () => {
  const status = railway.getRailwayStatus();
  assert.equal(status.state, 'ok');
  assert.ok(status.success >= 3);
  assert.ok(status.cacheHits >= 1);
});
