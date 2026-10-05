/**
 * Avto-bron va to'lov usuli testi — baza modellari xotiradagi soxta nusxalar bilan,
 * eticket so'rovlari mock serverga. Shifrlash haqiqiy.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startMockRailway } from './mock-railway.js';

let mock;
let accountService;
let settings;
const db = { account: null, passengers: [], watches: [], bookings: [], seq: 1 };

before(async () => {
  mock = await startMockRailway();
  process.env.RAILWAY_BASE_URL = mock.url;
  process.env.RAILWAY_MIN_INTERVAL_MS = '50';
  process.env.ADMIN_SECRET = 'autobook-test-secret-abcdefghijklmnop';

  const RailwayAccountModel = (await import('../src/models/RailwayAccount.js')).default;
  const PassengerModel = (await import('../src/models/Passenger.js')).default;
  const WatchModel = (await import('../src/models/Watch.js')).default;
  const BookingModel = (await import('../src/models/Booking.js')).default;

  RailwayAccountModel.findByUser = async () => db.account;
  RailwayAccountModel.upsert = async (userId, data) => { db.account = { userId, ...db.account, ...data }; return db.account; };
  RailwayAccountModel.update = async (userId, data) => { db.account = { ...db.account, ...data }; return db.account; };
  RailwayAccountModel.remove = async () => { db.account = null; };

  PassengerModel.findByUser = async (uid) => db.passengers.filter((p) => p.userId === uid);
  PassengerModel.countByUser = async (uid) => db.passengers.filter((p) => p.userId === uid).length;
  PassengerModel.create = async (data) => { const row = { id: db.seq++, createdAt: new Date(), ...data }; db.passengers.push(row); return row; };
  PassengerModel.findOwned = async (id, uid) => db.passengers.find((p) => p.id === Number(id) && p.userId === uid) || null;

  WatchModel.findOwned = async (id, uid) => db.watches.find((w) => w.id === Number(id) && w.userId === uid) || null;
  WatchModel.update = async (id, data) => { const w = db.watches.find((x) => x.id === Number(id)); Object.assign(w, data); return w; };

  BookingModel.create = async (data) => { const row = { id: db.seq++, ...data }; db.bookings.push(row); return row; };
  BookingModel.update = async (id, data) => { const b = db.bookings.find((x) => x.id === Number(id)); if (b) Object.assign(b, data); return b; };

  settings = await import('../src/services/settings.js');
  await settings.updateSettings?.({ bookingEnabled: true }).catch(() => {});
  accountService = (await import('../src/services/accountService.js')).default;
});

beforeEach(() => {
  db.account = null; db.passengers = []; db.watches = []; db.bookings = []; db.seq = 1;
  accountService.forgetSession(1);
  mock.state.orderId = 'ORD-AUTO';
  mock.state.passengerInfos = [];
});

after(async () => { await mock.close(); });

async function connectAndPrepare() {
  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  await accountService.setPaymentMethod(1, { provider: 'payme', phone: '998901234567' });
  await accountService.addPassenger(1, { firstName: 'Anvar', lastName: 'Ismoilov', docNumber: 'AA1234567', birthDate: '1990-05-01', gender: 'M', consent: true });
}

test('to\'lov usuli saqlanadi va niqoblanadi', async () => {
  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  const method = await accountService.setPaymentMethod(1, { provider: 'click', phone: '90 777 88 99' });
  assert.equal(method.provider, 'click');
  assert.equal(method.phone, '998907778899');
  assert.equal(method.phoneMasked, '+998 90 *** ** 99');
  // qayta o'qishda saqlanib qoladi
  const again = await accountService.getPaymentMethod(1);
  assert.equal(again.provider, 'click');
});

test('setAutoBook: shartlar bajarilmasa — xato', async () => {
  db.watches.push({ id: 10, userId: 1, quantity: 1, fromCode: '2900000', toCode: '2900700', date: '2030-01-10', fromName: 'A', toName: 'B', carTypes: [], autoBook: false });
  // akkaunt ulanmagan
  await assert.rejects(accountService.setAutoBook(1, 10, { enabled: true }), /akkaunt/i);

  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  // to'lov usuli yo'q
  await assert.rejects(accountService.setAutoBook(1, 10, { enabled: true }), /to'lov usuli/i);

  await accountService.setPaymentMethod(1, { provider: 'payme', phone: '998901234567' });
  // yo'lovchi yo'q
  await assert.rejects(accountService.setAutoBook(1, 10, { enabled: true }), /yo'lovchi/i);

  await accountService.addPassenger(1, { firstName: 'Anvar', lastName: 'Ismoilov', docNumber: 'AA1234567', birthDate: '1990-05-01', gender: 'M', consent: true });
  const updated = await accountService.setAutoBook(1, 10, { enabled: true });
  assert.equal(updated.autoBook, true);
  assert.deepEqual(updated.lastKeys, []); // hozirgi joylar ham "yangi" sifatida ko'riladi
});

test('autoBookOnFound: joy band qilib, to\'lov so\'rovi yuboriladi', async () => {
  await connectAndPrepare();
  const watch = { id: 20, userId: 1, quantity: 1, fromCode: '2900000', toCode: '2900700', date: '2030-01-10', fromName: 'A', toName: 'B', carTypes: ['platskart'], section: 'any', berth: 'any', together: 'any', autoBookPassengers: [] };
  db.watches.push(watch);

  const outcome = await accountService.autoBookOnFound(1, watch, { number: '054Ф', id: null });
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(outcome.orderId, 'ORD-AUTO');
  assert.equal(outcome.provider, 'payme');
  assert.equal(outcome.paymentRequested, true);
  assert.ok(outcome.seats.length === 1);
  // Booking yozildi
  assert.equal(db.bookings.length, 1);
  assert.equal(db.bookings[0].status, 'PAID_REQUESTED');
  // Yo'lovchi ma'lumoti saytga yuborildi
  assert.ok(mock.state.passengerInfos.length >= 1);
  assert.equal(mock.state.passengerInfos[0].lastname, 'ISMOILOV');
});

test('autoBookOnFound: to\'lov usuli yo\'q bo\'lsa — reason method', async () => {
  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  await accountService.addPassenger(1, { firstName: 'Anvar', lastName: 'Ismoilov', docNumber: 'AA1234567', birthDate: '1990-05-01', gender: 'M', consent: true });
  const watch = { id: 21, userId: 1, quantity: 1, fromCode: '2900000', toCode: '2900700', date: '2030-01-10', fromName: 'A', toName: 'B', carTypes: ['platskart'], section: 'any', berth: 'any', together: 'any', autoBookPassengers: [] };
  db.watches.push(watch);
  const outcome = await accountService.autoBookOnFound(1, watch, { number: '054Ф', id: null });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'method');
  assert.equal(db.bookings.length, 0, 'bron yaratilmaydi');
});
