/**
 * accountService testi — baza modellari xotiradagi soxta nusxalar bilan almashtiriladi,
 * eticket so'rovlari esa mock serverga ketadi. Shifrlash haqiqiy (vault.js).
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startMockRailway } from './mock-railway.js';

let mock;
let accountService;
let RailwayAccountModel;
let PassengerModel;

// Xotiradagi soxta baza
const db = { account: null, passengers: [], seq: 1 };

before(async () => {
  mock = await startMockRailway();
  process.env.RAILWAY_BASE_URL = mock.url;
  process.env.ETICKET_ACCOUNT_BASE_URL = mock.url;
  process.env.RAILWAY_MIN_INTERVAL_MS = '50';
  process.env.ADMIN_SECRET = 'test-secret-for-vault-abcdefghijklmnop';

  RailwayAccountModel = (await import('../src/models/RailwayAccount.js')).default;
  PassengerModel = (await import('../src/models/Passenger.js')).default;

  // Model metodlarini xotiradagi nusxaga ulaymiz
  RailwayAccountModel.findByUser = async () => db.account;
  RailwayAccountModel.upsert = async (userId, data) => { db.account = { userId, ...db.account, ...data }; return db.account; };
  RailwayAccountModel.update = async (userId, data) => { db.account = { ...db.account, ...data }; return db.account; };
  RailwayAccountModel.remove = async () => { db.account = null; };

  PassengerModel.findByUser = async (userId) => db.passengers.filter((p) => p.userId === userId);
  PassengerModel.countByUser = async (userId) => db.passengers.filter((p) => p.userId === userId).length;
  PassengerModel.create = async (data) => { const row = { id: db.seq++, createdAt: new Date(), ...data }; db.passengers.push(row); return row; };
  PassengerModel.findOwned = async (id, userId) => db.passengers.find((p) => p.id === Number(id) && p.userId === userId) || null;
  PassengerModel.remove = async (id) => { db.passengers = db.passengers.filter((p) => p.id !== Number(id)); };
  PassengerModel.removeAllForUser = async (userId) => { db.passengers = db.passengers.filter((p) => p.userId !== userId); };

  accountService = (await import('../src/services/accountService.js')).default;
});

beforeEach(() => {
  db.account = null;
  db.passengers = [];
  db.seq = 1;
  accountService.forgetSession(1);
});

after(async () => {
  await mock.close();
});

test('ulash: parol saqlanmaydi, token shifrlanadi, login niqoblanadi', async () => {
  const result = await accountService.connectAccount(1, { login: '+998 90 123 45 67', password: 'secret', consent: true });
  assert.equal(result.connected, true);
  assert.equal(result.loginMasked, '+998 90 *** ** 67');

  // Bazadagi secret ichida parol ham, token ham ochiq ko'rinmaydi
  assert.ok(!db.account.secret.includes('secret'), 'parol shifrlangan matnda yo\'q');
  assert.ok(!db.account.secret.includes('header.'), 'token ochiq emas');
  assert.match(db.account.secret, /^v1\./);
  assert.equal(db.account.status, 'ACTIVE');

  const status = await accountService.getAccountStatus(1);
  assert.equal(status.connected, true);
  assert.equal(status.loginMasked, '+998 90 *** ** 67');
});

test('ulash: rozilik belgilanmasa — xato', async () => {
  await assert.rejects(
    accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: false }),
    /roziligingizni/,
  );
});

test('ulash: noto\'g\'ri parol — tushunarli xato, hisob saqlanmaydi', async () => {
  await assert.rejects(
    accountService.connectAccount(1, { login: 'bad', password: 'bad', consent: true }),
    (error) => error.name === 'ValidationError',
  );
  assert.equal(db.account, null);
});

test('yo\'lovchi: shifrlab saqlanadi, niqob va yosh toifasi qaytadi', async () => {
  const passenger = await accountService.addPassenger(1, {
    label: "O'zim", firstName: 'Anvarjon', lastName: 'Ismoilov',
    docNumber: 'AA1234567', birthDate: '1990-05-01', gender: 'M', consent: true,
  });
  assert.equal(passenger.name, 'ANVA**** I.');
  assert.equal(passenger.doc, 'AA*****67');
  assert.equal(passenger.category, 'adult');
  assert.equal(passenger.locked, false);

  // Bazada ochiq ma'lumot yo'q
  assert.ok(!db.passengers[0].secret.includes('1234567'));
  assert.ok(!db.passengers[0].secret.includes('ISMOILOV') || db.passengers[0].secret.startsWith('v1.'));

  const list = await accountService.listPassengers(1);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'ANVA**** I.');

  // Bron uchun ochilgan ma'lumot
  const secret = await accountService.getPassengerSecret(1, passenger.id);
  assert.equal(secret.docNumber, 'AA1234567');
  assert.equal(secret.firstName, 'ANVARJON');
});

test('yo\'lovchi: viloyat saqlanadi va ko\'rinishda qaytadi', async () => {
  const p = await accountService.addPassenger(1, {
    firstName: 'Anvar', lastName: 'Ismoilov', docNumber: 'AA1234567',
    birthDate: '1990-05-01', gender: 'M', region: '33', consent: true,
  });
  assert.equal(p.region, '33');
  assert.equal(p.regionName, 'Xorazm');
  // Ochilgan ma'lumotda ham viloyat bor (bronda ishlatiladi)
  const secret = await accountService.getPassengerSecret(1, p.id);
  assert.equal(secret.region, '33');
});

test('yo\'lovchi: bola yoshi tug\'ilgan sanadan aniqlanadi', async () => {
  const child = await accountService.addPassenger(1, {
    firstName: 'Ali', lastName: 'Valiyev', docNumber: 'AB7654321',
    birthDate: '2015-01-01', gender: 'M', consent: true,
  });
  assert.equal(child.category, 'child');
});

test('yo\'lovchi: rozilik yo\'q — xato', async () => {
  await assert.rejects(
    accountService.addPassenger(1, { firstName: 'Ali', lastName: 'Valiyev', docNumber: 'AB7654321', birthDate: '2015-01-01', gender: 'M', consent: false }),
    /rozilig/,
  );
});

test('buyurtmalar va to\'lov so\'rovi', async () => {
  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });

  const orders = await accountService.listOrders(1);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].orderId, 'ORD-1');

  const pay = await accountService.requestPayment(1, { orderId: 'ORD-1', provider: 'payme', phone: '998901234567', consent: true });
  assert.equal(pay.ok, true);
  assert.equal(pay.invoiceId, 'INV-ORD-1');

  await assert.rejects(
    accountService.requestPayment(1, { orderId: 'ORD-1', provider: 'payme', consent: false }),
    /rozilig/,
  );
});

test('buyurtmalar: hisob ulanmagan bo\'lsa — ACCOUNT_REQUIRED', async () => {
  await assert.rejects(
    accountService.listOrders(1),
    (error) => error.code === 'ACCOUNT_REQUIRED',
  );
});

test('uzish: token va yo\'lovchilar o\'chadi (so\'ralganda)', async () => {
  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  await accountService.addPassenger(1, { firstName: 'Ali', lastName: 'Valiyev', docNumber: 'AB7654321', birthDate: '2000-01-01', gender: 'M', consent: true });

  await accountService.disconnectAccount(1, { wipePassengers: true });
  assert.equal(db.account, null);
  assert.equal(db.passengers.length, 0);
  const status = await accountService.getAccountStatus(1);
  assert.equal(status.connected, false);
});

