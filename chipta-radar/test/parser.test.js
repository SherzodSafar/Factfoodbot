import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, parseDateFromText } from '../src/services/queryParser.js';
import { searchStations } from '../src/services/stations.js';
import { formatDateUz, parseLocalDateTime, localToEpoch, todayISO } from '../src/utils/dates.js';

// 2026-09-23 10:00 Toshkent vaqti
const NOW = Date.UTC(2026, 8, 23, 5, 0);

test('sana: nisbiy so\'zlar', () => {
  assert.equal(parseDateFromText('ertaga', NOW), '2026-09-24');
  assert.equal(parseDateFromText('Завтра', NOW), '2026-09-24');
  assert.equal(parseDateFromText('indinga', NOW), '2026-09-25');
  assert.equal(parseDateFromText('bugun', NOW), '2026-09-23');
});

test('sana: raqamli va oy nomi bilan', () => {
  assert.equal(parseDateFromText('25.09', NOW), '2026-09-25');
  assert.equal(parseDateFromText('5.10.2026', NOW), '2026-10-05');
  assert.equal(parseDateFromText('25/12', NOW), '2026-12-25');
  assert.equal(parseDateFromText('3 noyabr', NOW), '2026-11-03');
  assert.equal(parseDateFromText('3 ноября', NOW), '2026-11-03');
  assert.equal(parseDateFromText('25-sentabr', NOW), '2026-09-25');
  // O'tib ketgan sana — keyingi yil
  assert.equal(parseDateFromText('10.01', NOW), '2027-01-10');
  assert.equal(parseDateFromText('20.09', NOW), '2027-09-20');
  assert.equal(parseDateFromText('hech narsa', NOW), null);
});

test('sana: "2 ta" chiptalar soni sana deb o\'qilmaydi', () => {
  assert.equal(parseDateFromText('Toshkent Samarqand 2 ta', NOW), null);
  assert.equal(parseDateFromText('Toshkent Samarqand 28', NOW), '2026-09-28');
});

test('to\'liq so\'rov: lotin, kirill va ruscha', () => {
  let query = parseQuery('Toshkent Samarqand 25.09', NOW);
  assert.equal(query.ok, true);
  assert.equal(query.from.code, '2900000');
  assert.equal(query.to.code, '2900700');
  assert.equal(query.date, '2026-09-25');

  query = parseQuery('Ташкент - Бухара завтра', NOW);
  assert.equal(query.from.code, '2900000');
  assert.equal(query.to.code, '2900800');
  assert.equal(query.date, '2026-09-24');

  query = parseQuery('buxoro toshkent', NOW);
  assert.equal(query.from.code, '2900800');
  assert.equal(query.to.code, '2900000');
  assert.equal(query.dateGiven, false);

  query = parseQuery('Тошкент Андижон 1 октябр', NOW);
  assert.equal(query.to.code, '2900680');
  assert.equal(query.date, '2026-10-01');

  query = parseQuery('Tashkent Samarkand', NOW);
  assert.equal(query.from.code, '2900000');
  assert.equal(query.to.code, '2900700');

  query = parseQuery('Qo\'qon Toshkent', NOW);
  assert.equal(query.from.code, '2900880');
});

test('bitta stansiya yoki umuman stansiyasiz matn', () => {
  assert.equal(parseQuery('Samarqand', NOW).reason, 'one-station');
  assert.equal(parseQuery('salom', NOW).reason, 'no-station');
});

test('stansiya qidiruvi', () => {
  assert.equal(searchStations('tosh')[0].code, '2900000');
  assert.equal(searchStations('Самар')[0].code, '2900700');
  assert.equal(searchStations('bukhara')[0].code, '2900800');
  assert.equal(searchStations('karshi')[0].code, '2900750');
  assert.equal(searchStations('xiv')[0].code, '2900172');
  assert.equal(searchStations('').length, 0);
});

test('sana formatlari (Toshkent vaqti)', () => {
  assert.equal(formatDateUz('2026-09-25'), '25-sentabr, juma');
  assert.equal(parseLocalDateTime('2026-09-25T07:28:00'), '2026-09-25T07:28');
  assert.equal(parseLocalDateTime('25.09.2026 7:05'), '2026-09-25T07:05');
  assert.equal(localToEpoch('2026-09-23T10:00'), NOW);
  assert.equal(todayISO(Date.UTC(2026, 8, 23, 19, 30)), '2026-09-24'); // 00:30 Toshkent
});
