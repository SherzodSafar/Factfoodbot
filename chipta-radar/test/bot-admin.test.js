import { test } from 'node:test';
import assert from 'node:assert/strict';
import ui from '../src/services/botUi.js';

test('admin: ADMIN_TELEGRAM_IDS dagi foydalanuvchi admin, menyuda admin tugmasi', async () => {
  process.env.ADMIN_TELEGRAM_IDS = '111, 222';
  const { isBotAdmin } = await import('../src/controllers/botAdmin.js');
  assert.equal(await isBotAdmin(111), true);
  assert.equal(await isBotAdmin('333'), false);
  const datas = (kb) => kb.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(datas(ui.mainMenu({ admin: true })).includes('adm:menu'));
  assert.ok(!datas(ui.mainMenu()).includes('adm:menu'));
});
