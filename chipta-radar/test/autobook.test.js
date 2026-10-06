/**
 * Avto-bron testi (kontrakt: docs/uzrailpass-booking-api.md) — baza modellari
 * xotiradagi soxta nusxalar bilan, eticket so'rovlari mock serverga. Shifrlash haqiqiy.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startMockRailway } from './mock-railway.js';

let mock;
let accountService;
let eticket;
const db = { account: null, watches: [], bookings: [], seq: 1 };

before(async () => {
  mock = await startMockRailway();
  process.env.RAILWAY_BASE_URL = mock.url;
  process.env.ETICKET_ACCOUNT_BASE_URL = mock.url;
  process.env.RAILWAY_MIN_INTERVAL_MS = '50';
  process.env.ADMIN_SECRET = 'autobook-test-secret-abcdefghijklmnop';

  const RailwayAccountModel = (await import('../src/models/RailwayAccount.js')).default;
  const WatchModel = (await import('../src/models/Watch.js')).default;
  const BookingModel = (await import('../src/models/Booking.js')).default;

  RailwayAccountModel.findByUser = async () => db.account;
  RailwayAccountModel.upsert = async (userId, data) => { db.account = { userId, ...db.account, ...data }; return db.account; };
  RailwayAccountModel.update = async (userId, data) => { db.account = { ...db.account, ...data }; return db.account; };
  RailwayAccountModel.remove = async () => { db.account = null; };

  WatchModel.findOwned = async (id, uid) => db.watches.find((w) => w.id === Number(id) && w.userId === uid) || null;
  WatchModel.update = async (id, data) => { const w = db.watches.find((x) => x.id === Number(id)); Object.assign(w, data); return w; };

  BookingModel.create = async (data) => { const row = { id: db.seq++, ...data }; db.bookings.push(row); return row; };
  BookingModel.update = async (id, data) => { const b = db.bookings.find((x) => x.id === Number(id)); if (b) Object.assign(b, data); return b; };

  accountService = (await import('../src/services/accountService.js')).default;
  eticket = await import('../src/core/eticketAccount.js');
});

beforeEach(() => {
  db.account = null; db.watches = []; db.bookings = []; db.seq = 1;
  accountService.forgetSession(1);
  mock.state.orderId = 'UO-AUTO-1';
  mock.state.friends = undefined;
  mock.state.reserveFail = false;
  mock.state.lastReserve = null;
});

after(async () => { await mock.close(); });

test('reserve so\'rovi kontrakt ko\'rinishida tuziladi', async () => {
  const session = eticket.createSession();
  await eticket.login({ login: '998901234567', password: 'secret' }, session);
  const friends = await eticket.getFriends(session, '777');
  assert.equal(friends.length, 1);
  assert.equal(friends[0].lastName, 'Ismoilov');
  assert.equal(friends[0].gender, 'MALE');
  assert.equal(friends[0].birthDate, '1990-10-03');

  const trains = await eticket.searchTrainsForBooking(session, { from: '2900000', to: '2900700', date: '2030-01-10' });
  const train = trains.find((t) => t.number === '054Ф');
  assert.ok(train, 'poyezd topildi');
  const cars = await eticket.getSeatPlaces(session, { from: '2900000', to: '2900700', date: '2030-01-10', trainNumber: '054Ф' });
  assert.ok(cars.some((c) => c.places.length), 'joylar bor');

  const res = await eticket.reserve(session, {
    train,
    car: { number: cars[0].number, carType: cars[0].carType, serviceClass: cars[0].serviceClass },
    seats: [cars[0].places[0]],
    passengers: friends,
    webCustomer: { id: '777', username: 'saparboev@gmail.com' },
  });
  assert.equal(res.orderId, 'UO-AUTO-1');

  const sent = mock.state.lastReserve;
  assert.equal(sent.channel, 'WEB');
  assert.equal(sent.providerType, 'EXPRESS');
  assert.equal(sent.webCustomer.username, 'saparboev@gmail.com');
  const ticket = sent.subItems[0].tickets[0];
  assert.equal(ticket.passengerInfo.fullName, 'Ismoilov=Anvar=Akbar o\'g\'li');
  assert.equal(ticket.passengerInfo.gender, 'MALE');
  assert.equal(ticket.passengerInfo.birthday, '1990-10-03');
  assert.equal(ticket.hasPatronymics, true);
  assert.match(sent.subItems[0].reserveSeatRequirements.seatsRange, /^\d+-\d+$/);
});

test('reserve xato javobida — RESERVE_FAILED', async () => {
  const session = eticket.createSession();
  await eticket.login({ login: '998901234567', password: 'secret' }, session);
  mock.state.reserveFail = true;
  await assert.rejects(
    eticket.reserve(session, { train: { number: '054Ф' }, car: { number: '07' }, seats: [9], passengers: [{ firstName: 'A', lastName: 'B' }], webCustomer: {} }),
    (error) => error.code === 'RESERVE_FAILED',
  );
});

test('setAutoBook: ulanmagan bo\'lsa — xato; friends bo\'lsa — yoqiladi', async () => {
  db.watches.push({ id: 10, userId: 1, quantity: 1, fromCode: '2900000', toCode: '2900700', date: '2030-01-10', fromName: 'A', toName: 'B', carTypes: [], autoBook: false });
  await assert.rejects(accountService.setAutoBook(1, 10, { enabled: true }), /akkaunt/i);

  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  const updated = await accountService.setAutoBook(1, 10, { enabled: true });
  assert.equal(updated.autoBook, true);
  assert.deepEqual(updated.lastKeys, []);
});

test('setAutoBook: eticketda yo\'lovchi yo\'q bo\'lsa — xato', async () => {
  db.watches.push({ id: 11, userId: 1, quantity: 1, fromCode: '2900000', toCode: '2900700', date: '2030-01-10', fromName: 'A', toName: 'B', carTypes: [], autoBook: false });
  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  mock.state.friends = []; // bo'sh
  await assert.rejects(accountService.setAutoBook(1, 11, { enabled: true }), /yo'lovchi/i);
});

test('autoBookOnFound: joy band qilinadi (reserve), to\'lovsiz', async () => {
  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  const watch = { id: 20, userId: 1, quantity: 1, fromCode: '2900000', toCode: '2900700', date: '2030-01-10', fromName: 'A', toName: 'B', carTypes: ['platskart'], section: 'any', berth: 'any', together: 'any' };
  db.watches.push(watch);

  const outcome = await accountService.autoBookOnFound(1, watch, { number: '054Ф', id: null });
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(outcome.orderId, 'UO-AUTO-1');
  assert.ok(outcome.seats.length === 1);
  assert.ok(outcome.carNumber);
  assert.equal(db.bookings.length, 1);
  assert.equal(db.bookings[0].status, 'RESERVED');
  // reserve payloadida yo'lovchi va joy bor
  assert.ok(mock.state.lastReserve.subItems[0].tickets.length === 1);
});

test('autoBookOnFound: eticketda yo\'lovchi yo\'q — reason passengers', async () => {
  await accountService.connectAccount(1, { login: '998901234567', password: 'secret', consent: true });
  mock.state.friends = [];
  const watch = { id: 21, userId: 1, quantity: 1, fromCode: '2900000', toCode: '2900700', date: '2030-01-10', fromName: 'A', toName: 'B', carTypes: ['platskart'], section: 'any', berth: 'any', together: 'any' };
  db.watches.push(watch);
  const outcome = await accountService.autoBookOnFound(1, watch, { number: '054Ф', id: null });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'passengers');
  assert.equal(db.bookings.length, 0);
});
