import { test } from 'node:test';
import assert from 'node:assert/strict';
import ui from '../src/services/botUi.js';
import wizard from '../src/services/botWizard.js';
import { todayISO } from '../src/utils/dates.js';

/** Inline klaviaturadagi barcha callback_data larni yig'ish */
function datas(keyboard) {
  return keyboard.reply_markup.inline_keyboard.flat().map((btn) => btn.callback_data).filter(Boolean);
}
function urls(keyboard) {
  return keyboard.reply_markup.inline_keyboard.flat().map((btn) => btn.url).filter(Boolean);
}

test('asosiy menyu — barcha bo\'limlar inline', () => {
  const d = datas(ui.mainMenu());
  for (const key of ['m:add', 'm:prices', 'm:watches', 'm:ref', 'm:help']) assert.ok(d.includes(key), key);
});

test('stansiya to\'ri: tanlash va bekor qilish callback\'lari', () => {
  const d = datas(ui.stationGrid('wz:f'));
  assert.ok(d.some((x) => x.startsWith('wz:f:29')), 'stansiya kodli tugma');
  assert.ok(d.includes('m:home'), 'bekor qilish');
  // "qayerga" bosqichida jo'nash stansiyasi chiqarilmaydi
  const to = datas(ui.stationGrid('wz:t', { excludeCode: '2900000' }));
  assert.ok(!to.includes('wz:t:2900000'), 'jo\'nash stansiyasi chiqmaydi');
});

test('sana to\'ri: bugundan boshlanadi, varaqlanadi', () => {
  const d = datas(ui.dateGrid(0, 60));
  assert.ok(d.includes(`wz:d:${todayISO()}`), 'bugungi sana');
  assert.ok(d.some((x) => x.startsWith('wz:dp:')), 'keyingi sahifa');
  assert.ok(d.includes('m:home'));
});

test('vagon turi va aniq joy tugmalari', () => {
  assert.deepEqual(
    datas(ui.carKeyboard()).filter((x) => x.startsWith('wz:c:')).sort(),
    ['wz:c:any', 'wz:c:general', 'wz:c:kupe', 'wz:c:platskart', 'wz:c:sitting', 'wz:c:sv'].sort(),
  );
  assert.deepEqual(datas(ui.sectionKeyboard()).filter((x) => x.startsWith('wz:sec:')), ['wz:sec:compartment', 'wz:sec:side', 'wz:sec:any']);
  assert.deepEqual(datas(ui.berthKeyboard()).filter((x) => x.startsWith('wz:brt:')), ['wz:brt:lower', 'wz:brt:upper', 'wz:brt:any']);
  assert.deepEqual(datas(ui.qtyKeyboard()).filter((x) => x.startsWith('wz:q:')), ['wz:q:1', 'wz:q:2', 'wz:q:3', 'wz:q:4']);
});

test('kuzatuvni boshqarish tugmalari', () => {
  const d = datas(ui.manageKeyboard({ id: 7, status: 'ACTIVE' }));
  for (const key of ['g:pause:7', 'g:check:7', 'g:got:7', 'g:del:7', 'm:watches', 'm:home']) assert.ok(d.includes(key), key);
  const paused = datas(ui.manageKeyboard({ id: 7, status: 'PAUSED' }));
  assert.ok(paused.includes('g:resume:7'));
});

test('topilgan chipta xabari: rasmiy sayt havolasi + inline amallar', () => {
  const kb = ui.foundKeyboard({ id: 3 }, 'https://eticket.railway.uz/uz/home');
  assert.ok(urls(kb).some((u) => u.includes('eticket.railway.uz')), 'sotib olish havolasi');
  const d = datas(kb);
  assert.ok(d.includes('g:got:3') && d.includes('g:pause:3'));
});

test('asosiy menyuda Akkaunt va Bronlarim bor', () => {
  const d = datas(ui.mainMenu());
  assert.ok(d.includes('m:account'), 'akkaunt');
  assert.ok(d.includes('m:orders'), 'bronlarim');
});

/** web_app tugmalaridagi url larni yig'ish */
function webApps(keyboard) {
  return keyboard.reply_markup.inline_keyboard.flat().map((btn) => btn.web_app?.url).filter(Boolean);
}

test('akkaunt klaviaturasi: ulangan holatda Web App, uzish va bronlarim', () => {
  const url = 'https://chipta-radar-api.onrender.com/app/account';
  const connected = ui.accountKeyboard({ connected: true }, url);
  assert.ok(webApps(connected).includes(url), 'Web App tugmasi');
  const d = datas(connected);
  assert.ok(d.includes('acc:disc'), 'uzish');
  assert.ok(d.includes('m:orders'), 'bronlarim');

  // Ulanmagan: faqat Web App (ulash) + menyu, uzish yo'q
  const guest = ui.accountKeyboard({ connected: false }, url);
  assert.ok(!datas(guest).includes('acc:disc'));

  // Web App manzili yo'q (https emas) — faqat callback tugmalar
  const noUrl = ui.accountKeyboard({ connected: false }, '');
  assert.equal(webApps(noUrl).length, 0);
});

test('bronlarim klaviaturasi: ulangan/ulanmagan', () => {
  const url = 'https://x.onrender.com/app/account';
  const connected = ui.ordersKeyboard({ connected: true }, url);
  assert.ok(webApps(connected).includes(url));
  assert.ok(datas(connected).includes('m:orders'), 'yangilash');
  const guest = ui.ordersKeyboard({ connected: false }, url);
  assert.ok(webApps(guest).includes(url), 'ulash tugmasi');
});

test('akkauntni uzishni tasdiqlash tugmalari', () => {
  const d = datas(ui.disconnectConfirmKeyboard());
  assert.ok(d.includes('acc:disc:yes'), 'tasdiq');
  assert.ok(d.includes('m:account'), 'orqaga');
});

test('topilgan chipta: akkaunt ulangan bo\'lsa bron/to\'lov Web App tugmasi', () => {
  const kb = ui.foundKeyboard({ id: 9 }, 'https://eticket.railway.uz/uz/home', { accountUrl: 'https://x.onrender.com/app/account' });
  assert.ok(webApps(kb).some((u) => u.includes('/app/account')), 'bron/to\'lov tugmasi');
});

test('shortDate — "DD-oy, kun" ko\'rinishida', () => {
  assert.match(ui.shortDate('2026-10-05'), /^5-okt, \S+$/);
});

test('sehrgar bosqichlari vagon turiga qarab o\'zgaradi', () => {
  assert.deepEqual(wizard.stepOrder({ carType: 'platskart' }), ['from', 'to', 'date', 'car', 'section', 'berth', 'qty', 'confirm']);
  assert.deepEqual(wizard.stepOrder({ carType: 'kupe' }), ['from', 'to', 'date', 'car', 'berth', 'qty', 'confirm']);
  assert.deepEqual(wizard.stepOrder({ carType: 'sv' }), ['from', 'to', 'date', 'car', 'qty', 'confirm']);
  // aniq joy + 1 dan ko'p chipta → "together" bosqichi qo'shiladi
  assert.ok(wizard.stepOrder({ carType: 'kupe', berth: 'lower', quantity: 2 }).includes('together'));
});

test('aniq joy (EXACT) aniqlanishi', () => {
  assert.equal(wizard.isExact({ section: 'any', berth: 'any' }), false);
  assert.equal(wizard.isExact({ section: 'compartment', berth: 'any' }), true);
  assert.equal(wizard.isExact({ section: 'any', berth: 'upper' }), true);
});

test('orqaga qaytish: joriy tanlovni tozalab, oldingi bosqichga qaytadi', () => {
  const id = 'test-user-1';
  wizard.clearSession(id);
  wizard.patchSession(id, { fromCode: '2900000', toCode: '2900700', step: 'date' });
  const back = wizard.goBack(id);
  assert.equal(back.step, 'to');
  assert.equal(back.toCode, undefined, 'borish stansiyasi tozalandi');
  assert.equal(back.fromCode, '2900000', 'jo\'nash stansiyasi saqlanadi');
  wizard.clearSession(id);
});
