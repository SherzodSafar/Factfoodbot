import { test } from 'node:test';
import assert from 'node:assert/strict';
import vault from '../src/services/vault.js';
import personal from '../src/services/personal.js';
import { ValidationError } from '../src/utils/errors.js';

test('shifrlash: ochiladi, matn har safar boshqacha, egasiga bog\'langan', () => {
  assert.ok(vault.isVaultReady(), 'sinov muhitida kalit bor');
  const secret = { docNumber: 'AA1234567', birthDate: '1990-05-01' };
  const a = vault.encrypt(secret, 'passenger:1');
  const b = vault.encrypt(secret, 'passenger:1');
  assert.notEqual(a, b, 'har safar yangi IV');
  assert.ok(!a.includes('AA1234567'), 'ochiq matn ko\'rinmaydi');
  assert.match(a, /^v1\.[0-9a-f]{8}\./);
  assert.deepEqual(vault.decrypt(a, 'passenger:1'), secret);
  // Boshqa yozuvga ko'chirilgan matn ochilmaydi
  assert.throws(() => vault.decrypt(a, 'passenger:2'), { name: 'VaultError' });
});

test('shifrlash: o\'zgartirilgan matn rad etiladi', () => {
  const payload = vault.encrypt({ token: 'abc' }, 'account:1');
  const parts = payload.split('.');
  const data = Buffer.from(parts[4], 'base64url');
  data[0] ^= 1;
  parts[4] = data.toString('base64url');
  assert.throws(() => vault.decrypt(parts.join('.'), 'account:1'), { code: 'DECRYPT_FAILED' });
  assert.throws(() => vault.decrypt('nonsense', 'account:1'), { code: 'BAD_FORMAT' });
});

test('kalit formatlari: hex, base64 va erkin matn — 32 bayt', () => {
  const hex = 'a'.repeat(64);
  assert.equal(vault.parseKey(hex).length, 32);
  const base64 = Buffer.alloc(32, 7).toString('base64');
  assert.deepEqual(vault.parseKey(base64), Buffer.alloc(32, 7));
  assert.equal(vault.parseKey('oddiy maxfiy so\'z').length, 32);
  assert.equal(vault.parseKey(''), null);
});

test('yo\'lovchi tekshiruvi: normallashtirish va xatolar', () => {
  const ok = personal.validatePassengerInput(
    { label: " O'zim ", firstName: ' anvarjon ', lastName: 'ismoilov', docNumber: 'aa 1234567', birthDate: '1990-05-01', gender: 'm' },
    { today: '2026-10-05' },
  );
  assert.deepEqual(ok, {
    label: "O'zim", firstName: 'ANVARJON', lastName: 'ISMOILOV', docNumber: 'AA1234567',
    birthDate: '1990-05-01', gender: 'M', citizenship: 'UZB',
  });

  const base = { firstName: 'Ali', lastName: 'Valiyev', docNumber: 'AB7654321', birthDate: '2015-01-01', gender: 'F' };
  assert.throws(() => personal.validatePassengerInput({ ...base, firstName: '' }), ValidationError);
  assert.throws(() => personal.validatePassengerInput({ ...base, firstName: 'Ali7' }), ValidationError);
  assert.throws(() => personal.validatePassengerInput({ ...base, docNumber: '12' }), ValidationError);
  assert.throws(() => personal.validatePassengerInput({ ...base, birthDate: '2030-01-01' }, { today: '2026-10-05' }), ValidationError);
  assert.throws(() => personal.validatePassengerInput({ ...base, gender: 'X' }), ValidationError);
  // Kirill va tutuq belgisi
  const cyr = personal.validatePassengerInput({ ...base, firstName: "g'ayrat", lastName: 'Каримов' });
  assert.equal(cyr.firstName, "G'AYRAT");
  assert.equal(cyr.lastName, 'КАРИМОВ');
});

test('yosh toifasi: 16 yoshgacha — bola (safar kuniga qarab)', () => {
  assert.equal(personal.ageOn('2010-10-06', '2026-10-05'), 15);
  assert.equal(personal.ageOn('2010-10-05', '2026-10-05'), 16);
  assert.equal(personal.passengerCategory('2010-10-06', '2026-10-05'), 'child');
  assert.equal(personal.passengerCategory('2010-10-05', '2026-10-05'), 'adult');
  // Safar kuni 16 yosh to'lgan bo'lsa — katta
  assert.equal(personal.passengerCategory('2010-10-06', '2026-10-06'), 'adult');
});

test('niqoblash: ism, hujjat, login', () => {
  assert.equal(personal.maskName('ANVARJON', 'ISMOILOV'), 'ANVA**** I.');
  assert.equal(personal.maskName('ALI', 'VALIYEV'), 'AL* V.');
  assert.equal(personal.maskDoc('AA1234567'), 'AA*****67');
  assert.equal(personal.maskLogin('+998 90 123 45 67'), '+998 90 *** ** 67');
  assert.equal(personal.maskLogin('901234567'), '+998 90 *** ** 67');
  assert.equal(personal.maskLogin('anvar@gmail.com'), 'a***r@gmail.com');
  assert.equal(personal.normalizeLogin(' +998 (90) 123-45-67 '), '+998901234567');
  assert.equal(personal.normalizeLogin('90 123 45 67'), '998901234567');
  assert.equal(personal.normalizeLogin('Anvar@Gmail.com'), 'anvar@gmail.com');
  assert.equal(personal.normalizePhone('+998 90 123 45 67'), '998901234567');
  assert.equal(personal.normalizePhone('12345'), null);
  assert.equal(personal.formatPhone('998901234567'), '+998 90 123 45 67');
});
