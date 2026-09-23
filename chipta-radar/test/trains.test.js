import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrainList, normalizeTrainDetail, parsePlaces, parsePrice, UnexpectedShapeError } from '../src/services/trains.js';
import { normalizeCarType } from '../src/services/carTypes.js';
import { trainListResponse, trainDetailResponse } from './fixtures.js';

test('vagon turlari: saytdagi barcha yozuvlar bitta kalitga keladi', () => {
  const cases = {
    'Плацкартный': 'platskart',
    Plaskartli: 'platskart',
    'Купе': 'kupe',
    Kupe: 'kupe',
    Coupe: 'kupe',
    'Сидячий': 'sitting',
    'O\'rindiqli': 'sitting',
    'Oʻrindiqli': 'sitting',
    'O‘rindiqli': 'sitting',
    Sitting: 'sitting',
    Ekonom: 'sitting',
    'Эконом': 'sitting',
    Biznes: 'business',
    'Бизнес': 'business',
    VIP: 'vip',
    SV: 'sv',
    'СВ': 'sv',
    'Люкс': 'lux',
    Lyuks: 'lux',
    Umumiy: 'general',
    'Общий': 'general',
  };
  for (const [raw, expected] of Object.entries(cases)) {
    assert.equal(normalizeCarType(raw), expected, raw);
  }
});

test('poyezdlar ro\'yxati normallashtiriladi', () => {
  const trains = normalizeTrainList(trainListResponse('2026-09-25'));
  assert.equal(trains.length, 3);

  const [afrosiyob, sharq, night] = trains;
  assert.equal(afrosiyob.number, '764Ф');
  assert.equal(afrosiyob.title, 'Afrosiyob');
  assert.equal(afrosiyob.depTime, '07:28');
  assert.equal(afrosiyob.arrTime, '09:38');
  assert.equal(afrosiyob.durationMin, 130);
  assert.equal(afrosiyob.id, 'train-764');
  assert.deepEqual(afrosiyob.cars.map((car) => car.type), ['sitting', 'business']);
  assert.equal(afrosiyob.cars[0].minPrice, 270000);
  assert.equal(afrosiyob.cars[0].maxPrice, 330000);
  assert.equal(afrosiyob.totalFree, 15);
  assert.equal(afrosiyob.minPrice, 270000);

  assert.equal(sharq.cars[0].type, 'platskart');
  assert.equal(sharq.cars[0].minPrice, 130000);
  assert.equal(night.totalFree, 0);
  assert.equal(night.title, 'Пассажирский');
  assert.equal(night.minPrice, null);
});

test('bo\'sh yo\'nalish — xatolik emas, bo\'sh ro\'yxat', () => {
  assert.deepEqual(normalizeTrainList({ data: { directions: { forward: {} } } }), []);
  assert.deepEqual(normalizeTrainList({ data: { directions: { forward: { trains: [] } } } }), []);
});

test('kutilmagan javob — aniq xatolik (noto\'g\'ri "poyezd yo\'q" o\'rniga)', () => {
  assert.throws(() => normalizeTrainList({ message: 'Internal error' }), UnexpectedShapeError);
  assert.throws(() => normalizeTrainDetail({ data: null }), UnexpectedShapeError);
});

test('vagonlar tafsiloti normallashtiriladi', () => {
  const cars = normalizeTrainDetail(trainDetailResponse());
  assert.equal(cars.length, 2);
  assert.deepEqual(cars[0], {
    number: '07', type: 'platskart', label: 'Plaskartli', cls: '3П', places: [9, 11, 38, 44, 53], free: 5, price: null,
  });
  assert.equal(cars[1].type, 'kupe');
  assert.deepEqual(cars[1].places, [3, 4, 7]);
});

test('joy raqamlari turli ko\'rinishda', () => {
  assert.deepEqual(parsePlaces([38, 44]), [38, 44]);
  assert.deepEqual(parsePlaces(['044', '038', '038']), [38, 44]);
  assert.deepEqual(parsePlaces([{ number: 5 }, { seatNumber: '7' }]), [5, 7]);
  assert.deepEqual(parsePlaces('1,2,5-7'), [1, 2, 5, 6, 7]);
  assert.deepEqual(parsePlaces('12М, 14Ж'), [12, 14]);
  assert.deepEqual(parsePlaces(null), []);
});

test('narxlar', () => {
  assert.equal(parsePrice('270 000'), 270000);
  assert.equal(parsePrice('270000.00'), 270000);
  assert.equal(parsePrice({ tariff: 1500 }), 1500);
  assert.equal(parsePrice(0), null);
  assert.equal(parsePrice(''), null);
});
