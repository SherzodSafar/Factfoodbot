import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeSeat, summarizeCar, buildSeatMap, seatFits, bayCapacity, findSeatGroups, matchCars, normalizePrefs,
} from '../src/services/seats.js';

const prefs = (input = {}, type) => normalizePrefs({ quantity: 1, ...input }, type);

test('plaskart: to\'rttalik va bokovoy joylar to\'g\'ri aniqlanadi', () => {
  assert.deepEqual(describeSeat('platskart', 1), { number: 1, bay: 1, section: 'compartment', berth: 'lower' });
  assert.deepEqual(describeSeat('platskart', 4), { number: 4, bay: 1, section: 'compartment', berth: 'upper' });
  assert.deepEqual(describeSeat('platskart', 36), { number: 36, bay: 9, section: 'compartment', berth: 'upper' });
  assert.deepEqual(describeSeat('platskart', 53), { number: 53, bay: 1, section: 'side', berth: 'lower' });
  assert.deepEqual(describeSeat('platskart', 54), { number: 54, bay: 1, section: 'side', berth: 'upper' });
  assert.deepEqual(describeSeat('platskart', 37), { number: 37, bay: 9, section: 'side', berth: 'lower' });
  assert.deepEqual(describeSeat('platskart', 38), { number: 38, bay: 9, section: 'side', berth: 'upper' });
  assert.equal(describeSeat('platskart', 45).bay, 5);
});

test('kupe va SV sxemasi', () => {
  assert.deepEqual(describeSeat('kupe', 7), { number: 7, bay: 2, section: 'compartment', berth: 'lower' });
  assert.deepEqual(describeSeat('kupe', 8), { number: 8, bay: 2, section: 'compartment', berth: 'upper' });
  assert.deepEqual(describeSeat('sv', 3), { number: 3, bay: 2, section: 'compartment', berth: 'lower' });
  assert.equal(describeSeat('kupe', 40).bay, null);
  assert.equal(describeSeat('sitting', 12).section, 'seat');
});

test('vagon statistikasi', () => {
  assert.deepEqual(summarizeCar('platskart', [1, 2, 3, 37, 38, 54]), {
    total: 6, lower: 2, upper: 1, sideLower: 1, sideUpper: 2,
  });
  assert.deepEqual(summarizeCar('sitting', [1, 2, 3]), { total: 3, lower: 0, upper: 0, sideLower: 0, sideUpper: 0 });
});

test('xarita: 9 ta bo\'lim, bokovoy raqamlar teskari tartibda', () => {
  const map = buildSeatMap('platskart', [1]);
  assert.equal(map.bays.length, 9);
  assert.deepEqual(map.bays[0], { bay: 1, main: [1, 2, 3, 4], side: [53, 54] });
  assert.deepEqual(map.bays[8], { bay: 9, main: [33, 34, 35, 36], side: [37, 38] });
  assert.equal(buildSeatMap('kupe', [1]).bays[0].side.length, 0);
  assert.equal(buildSeatMap('sitting', [1]), null);
  // Sig'imdan katta raqamlar — xarita chizilmaydi (boshqa sxemadagi vagon)
  assert.equal(buildSeatMap('kupe', [1, 50]), null);
});

test('talablar: bokovoy/to\'rttalik, pastki/yuqori, hojatxona yonidagisiz', () => {
  const side = prefs({ section: 'side' }, 'platskart');
  assert.equal(seatFits('platskart', 45, side), true);
  assert.equal(seatFits('platskart', 5, side), false);

  const lowerMain = prefs({ section: 'compartment', berth: 'lower' }, 'platskart');
  assert.equal(seatFits('platskart', 5, lowerMain), true);
  assert.equal(seatFits('platskart', 6, lowerMain), false);
  assert.equal(seatFits('platskart', 45, lowerMain), false);

  const noToilet = prefs({ noToilet: true }, 'platskart');
  assert.equal(seatFits('platskart', 2, noToilet), false); // 1-bo'lim
  assert.equal(seatFits('platskart', 35, noToilet), false); // 9-bo'lim
  assert.equal(seatFits('platskart', 37, noToilet), false); // 9-bo'lim bokovoyi
  assert.equal(seatFits('platskart', 20, noToilet), true);
});

test('normalizePrefs vagon turiga moslashadi', () => {
  assert.equal(normalizePrefs({ section: 'side' }, 'kupe').section, 'any');
  assert.equal(normalizePrefs({ berth: 'upper' }, 'sv').berth, 'any');
  assert.equal(normalizePrefs({ berth: 'lower', section: 'side' }, 'sitting').berth, 'any');
  assert.equal(normalizePrefs({ quantity: 99 }).quantity, 10);
  assert.equal(normalizePrefs({ quantity: 0 }).quantity, 1);
});

test('bitta bo\'limdagi sig\'im', () => {
  assert.equal(bayCapacity('platskart', prefs({})), 6);
  assert.equal(bayCapacity('platskart', prefs({ section: 'compartment' })), 4);
  assert.equal(bayCapacity('platskart', prefs({ section: 'side', berth: 'lower' })), 1);
  assert.equal(bayCapacity('kupe', prefs({ berth: 'lower' }, 'kupe')), 2);
});

test('hammasi bitta joyda: bitta bo\'limdan topadi', () => {
  // 3-bo'lim: 9, 10, 11, 12 ; 5-bo'lim: 17
  const car = { number: '07', type: 'platskart', places: [9, 11, 12, 17] };
  const p = prefs({ quantity: 3, together: 'compartment', section: 'compartment' }, 'platskart');
  const { groups } = findSeatGroups(car, p);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].seats, [9, 11, 12]);
  assert.deepEqual(groups[0].bays, [3]);
});

test('hammasi bitta joyda: tarqoq joylar mos kelmaydi', () => {
  const car = { number: '07', type: 'platskart', places: [1, 9, 17, 25] }; // har biri boshqa bo'limda
  const p = prefs({ quantity: 2, together: 'compartment' }, 'platskart');
  assert.equal(findSeatGroups(car, p).groups.length, 0);
  // Tarqoq bo'lsa ham rozi — topiladi
  const any = prefs({ quantity: 2, together: 'any' }, 'platskart');
  assert.equal(matchCars([car], any).ok, true);
});

test('4 kishi pastki o\'rinlarda — yonma-yon 2 ta bo\'lim', () => {
  // 2-bo'lim pastki: 5, 7 ; 3-bo'lim pastki: 9, 11
  const car = { number: '03', type: 'kupe', places: [5, 7, 9, 11, 20] };
  const p = prefs({ quantity: 4, together: 'compartment', berth: 'lower' }, 'kupe');
  const { groups } = findSeatGroups(car, p);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].seats, [5, 7, 9, 11]);
  assert.deepEqual(groups[0].bays, [2, 3]);
});

test('bokovoy juftlik (pastki+yuqori) bitta bo\'limda', () => {
  const car = { number: '09', type: 'platskart', places: [45, 46, 50] };
  const p = prefs({ quantity: 2, together: 'compartment', section: 'side' }, 'platskart');
  const { groups } = findSeatGroups(car, p);
  assert.deepEqual(groups[0].seats, [45, 46]);
});

test('o\'rindiqli vagon: ketma-ket raqamlar', () => {
  const car = { number: '02', type: 'sitting', places: [3, 7, 8, 9, 15] };
  const p = prefs({ quantity: 3, together: 'compartment' }, 'sitting');
  assert.deepEqual(findSeatGroups(car, p).groups[0].seats, [7, 8, 9]);
});

test('bitta vagonda yetmasa, tarqoq rejimda bir nechta vagondan yig\'iladi', () => {
  const cars = [
    { number: '01', type: 'platskart', places: [1, 3] },
    { number: '02', type: 'platskart', places: [5] },
  ];
  const result = matchCars(cars, prefs({ quantity: 3, together: 'any' }, 'platskart'));
  assert.equal(result.ok, true);
  assert.equal(result.suggestions[0].parts.length, 2);
  assert.equal(result.suggestions[0].parts.reduce((sum, part) => sum + part.seats.length, 0), 3);

  const sameCar = matchCars(cars, prefs({ quantity: 3, together: 'car' }, 'platskart'));
  assert.equal(sameCar.ok, false);
});

test('afzallik: avval pastki va to\'rttalik joylar tanlanadi', () => {
  const car = { number: '07', type: 'platskart', places: [2, 3, 38, 41] };
  const result = matchCars([car], prefs({ quantity: 1, together: 'any' }, 'platskart'));
  assert.deepEqual(result.suggestions[0].parts[0].seats, [3]);
});
