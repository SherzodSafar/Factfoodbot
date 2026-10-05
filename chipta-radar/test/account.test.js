import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockRailway } from './mock-railway.js';

let mock;
let account;

before(async () => {
  mock = await startMockRailway();
  process.env.RAILWAY_BASE_URL = mock.url;
  process.env.RAILWAY_MIN_INTERVAL_MS = '50';
  account = await import('../src/core/eticketAccount.js');
});

after(async () => {
  await mock.close();
});

test('login: token olinadi, muddati va accountId JWT dan o\'qiladi', async () => {
  const session = account.createSession();
  const result = await account.login({ login: '998901234567', password: 'secret' }, session);
  assert.match(result.token, /^header\./);
  assert.equal(result.accountId, '777');
  assert.ok(result.tokenExp > Date.now(), 'token muddati kelajakda');
  assert.ok(account.tokenValid(session));

  const loginRequest = mock.state.requests.findLast((item) => item.url === '/api/v1/auth/login');
  assert.equal(loginRequest.xsrf, 'mock-xsrf-123', 'CSRF qo\'shilgan');
  assert.deepEqual(JSON.parse(loginRequest.body), { username: '998901234567', password: 'secret' });
});

test('login: noto\'g\'ri parol — tushunarli xato', async () => {
  await assert.rejects(
    account.login({ login: 'bad', password: 'bad' }),
    (error) => error.code === 'LOGIN_FAILED' && error.status === 401,
  );
});

test('login: captcha talab qilinsa — CAPTCHA_REQUIRED', async () => {
  mock.state.requireCaptcha = true;
  await assert.rejects(
    account.login({ login: '998901234567', password: 'secret' }),
    (error) => error.code === 'CAPTCHA_REQUIRED',
  );
  // captcha tokeni berilsa — o'tadi
  const session = account.createSession();
  const ok = await account.login({ login: '998901234567', password: 'secret', captcha: 'tok' }, session);
  assert.ok(ok.token);
  const req = mock.state.requests.findLast((item) => item.url === '/api/v1/auth/login');
  assert.ok(req, 'login so\'rovi yuborildi');
  mock.state.requireCaptcha = false;
});

test('profil va buyurtmalar token bilan olinadi', async () => {
  const session = account.createSession();
  await account.login({ login: '998901234567', password: 'secret' }, session);

  const profile = await account.getProfile(session);
  assert.equal(profile.firstName, 'Anvar');
  assert.equal(profile.phone, '998901234567');

  const orders = await account.getOrders(session);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].orderId, 'ORD-1');
  assert.equal(orders[0].payable, true, 'RESERVED — to\'lanishi mumkin');
  assert.equal(orders[1].payable, false, 'PAID — to\'langan');
});

test('to\'lov so\'rovi (Payme/Click) invoice qaytaradi', async () => {
  const session = account.createSession();
  await account.login({ login: '998901234567', password: 'secret' }, session);

  const payme = await account.createPaymentInvoice(session, { orderId: 'ORD-1', provider: 'payme', phone: '998901234567' });
  assert.equal(payme.ok, true);
  assert.equal(payme.invoiceId, 'INV-ORD-1');

  const click = await account.createPaymentInvoice(session, { orderId: 'ORD-1', provider: 'click', phone: '998901234567' });
  assert.equal(click.ok, true);

  await assert.rejects(
    account.createPaymentInvoice(session, { orderId: 'ORD-1', provider: 'visa', phone: '1' }),
    (error) => error.code === 'INPUT',
  );
});

test('token yaroqsiz bo\'lsa — reserve rad etadi', async () => {
  await assert.rejects(
    account.reserveSeats(account.createSession(), { order: { seats: [1] }, passengers: [{}] }),
    (error) => error.code === 'AUTH_REQUIRED',
  );
});
