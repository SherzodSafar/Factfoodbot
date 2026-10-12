import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, localizePayload, NO_I18N, keepButton } from '../src/i18n/index.js';
import { toCyrillic } from '../src/i18n/translit.js';
import { TEXTS } from '../src/i18n/texts.js';
import ui from '../src/services/botUi.js';

test('o\'zbekcha matn o\'zgarmaydi', () => {
  assert.equal(translate('Kuzatuv qo\'shildi!', 'uz'), 'Kuzatuv qo\'shildi!');
});

test('kirill: so\'zlar, oy nomlari, havola va buyruqlar', () => {
  assert.equal(toCyrillic('Qayerdan jo\'naysiz?'), 'Қаердан жўнайсиз?');
  assert.equal(toCyrillic('Buxoro, 14-oktabr'), 'Бухоро, 14-октябрь');
  assert.equal(toCyrillic('tanlang'), 'танланг');
  assert.equal(toCyrillic('<b>Sana</b> eticket.railway.uz /watches'), '<b>Сана</b> eticket.railway.uz /watches');
});

test('ruscha va inglizcha: iboralar, bekatlar, sanoq, pul, sana', () => {
  const text = '📍 <b>Toshkent → Samarqand</b>\n📅 14-oktabr, chorshanba (ertaga)\n🔎 Plaskartli · 2 ta chipta · 500 000 so\'m gacha';
  assert.equal(translate(text, 'ru', { html: true }), '📍 <b>Ташкент → Самарканд</b>\n📅 14 октября, среда (завтра)\n🔎 Плацкарт · 2 билета · до 500 000 сум');
  assert.equal(translate(text, 'en', { html: true }), '📍 <b>Tashkent → Samarkand</b>\n📅 14 October, Wednesday (tomorrow)\n🔎 Platskart · 2 tickets · up to 500 000 UZS');
  assert.equal(translate('Hozircha mos joy yo\'q', 'ru'), 'Пока подходящих мест нет');
  assert.equal(translate('5 marta tekshirildi', 'en'), 'Checked 5 times');
  assert.equal(translate('12 000 tenge dan', 'ru'), 'от 12 000 тенге');
});

test('uzun matnlar to\'liq tarjimadan olinadi', () => {
  assert.equal(translate(TEXTS.help.uz, 'en', { html: true }), TEXTS.help.en);
  assert.equal(translate(`${TEXTS.appHead.uz} <code>123456</code> ${TEXTS.appTail.uz}`, 'ru', { html: true }), `${TEXTS.appHead.ru} <code>123456</code> ${TEXTS.appTail.ru}`);
});

test('payload: matn va tugmalar tarjima qilinadi, himoyalanganlari — yo\'q', () => {
  const menu = ui.mainMenu();
  const out = localizePayload({ chat_id: 1, text: 'Asosiy menyu', reply_markup: menu.reply_markup }, 'ru');
  assert.equal(out.text, 'Главное меню');
  const texts = out.reply_markup.inline_keyboard.flat().map((button) => button.text);
  assert.ok(texts.includes('➕ Добавить отслеживание'));
  assert.ok(texts.includes('🌐 Til · Язык · Language'));
  const raw = { chat_id: 1, text: 'Assalomu alaykum', [NO_I18N]: true };
  assert.equal(localizePayload(raw, 'en'), raw);
  const kept = keepButton({ text: 'O\'zbekcha', callback_data: 'lang:uz' });
  assert.equal(localizePayload({ reply_markup: { inline_keyboard: [[kept]] } }, 'uzc').reply_markup.inline_keyboard[0][0].text, 'O\'zbekcha');
});
