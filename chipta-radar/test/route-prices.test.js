import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRouteData, knownDestinations, knownOrigins } from '../src/services/routePrices.js';
import { searchReply } from '../src/services/format.js';
import ui from '../src/services/botUi.js';

test('poyezd qatnaydigan bekatlar: faqat poyezd ko\'rilgan juftliklar (ikki tomonga)', () => {
  assert.equal(knownDestinations('2900001'), null); // to'liq tekshiruv bo'lmagan — hammasi ko'rsatiladi
  loadRouteData({
    version: 2, day: '2026-10-11', fullDay: '2026-10-11',
    routes: {
      '2900002-2900790': { t: { platskart: 177990 }, n: { '056Ч': { platskart: 177990 } } },
      '2900001-2900700': { t: {}, n: { '764Ф': {} } }, // joy qolmagan poyezd ham hisoblanadi
      '2900001-2900790': { t: { platskart: 177990 }, n: {} }, // faqat aks yo'nalishdan to'ldirilgan narx
    },
  });
  const markaziy = knownDestinations('2900001');
  assert.ok(markaziy.has('2900700'));
  assert.ok(!markaziy.has('2900790'));
  assert.ok(knownDestinations('2900790').has('2900002')); // qarama-qarshi yo'nalish
  assert.equal(knownDestinations('2900172'), null); // bu bekatdan ma'lumot yo'q — hammasi
  const origins = knownOrigins();
  assert.ok(origins.has('2900002') && origins.has('2900700') && !origins.has('2900172'));

  const kb = ui.stationGrid('wz:t', { only: markaziy }).reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(kb.includes('wz:t:2900700') && !kb.includes('wz:t:2900790') && kb.includes('wz:ta'));
});

test('qidiruv javobi ixcham ko\'rinishda', () => {
  const trains = [
    { number: '054Ф', title: 'Tezyurar', depTime: '16:00', arrTime: '23:15', totalFree: 18,
      cars: [{ type: 'platskart', label: 'Plaskartli', free: 18, minPrice: 177990, maxPrice: 177990 }] },
    { number: '772Ф', title: 'Afrosiyob', depTime: '19:48', arrTime: '00:01', totalFree: 0, cars: [] },
  ];
  const text = searchReply({ from: 'Toshkent', to: 'Buxoro', date: '2026-10-11', trains,
    pricesOf: () => ({ prices: { sitting: 270000 }, exact: true }) });
  assert.match(text, /^🚆 <b>Toshkent → Buxoro<\/b> — 11\.10\.2026/);
  assert.match(text, /🚆 <b>054Ф · Tezyurar<\/b>\n {2}🕐 16:00 → 23:15\n {2}💺 Plaskartli: 18 joy · 177 990 so'm\n/);
  assert.match(text, /🚆 <b>772Ф · Afrosiyob<\/b>\n {2}🕐 19:48 → 00:01\n {2}❌ Joylar tugagan\n {2}💰 O'rindiqli 270 000 so'm/);
  assert.match(text, /🔔 Joy chiqishini kuzatish/);
});
