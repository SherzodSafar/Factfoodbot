import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config/default.js';
import { accessEnabled, hasAccess, submitCode } from '../src/services/access.js';

test('kirish kodi: noto\'g\'ri, to\'g\'ri va urinishlar chegarasi', async () => {
  const saved = config.bot.accessCode;
  config.bot.accessCode = '';
  assert.equal(accessEnabled(), false);
  assert.equal(await hasAccess(1), true); // kod berilmagan — bot ochiq

  config.bot.accessCode = '4321';
  assert.equal(await hasAccess(101), false);
  assert.equal(await submitCode(101, '1111'), 'wrong');
  assert.equal(await submitCode(101, ' 4321 '), 'ok');
  assert.equal(await hasAccess(101), true);

  for (let i = 0; i < 5; i += 1) assert.equal(await submitCode(102, '0000'), 'wrong');
  assert.equal(await submitCode(102, '4321'), 'limit'); // 1 soatda 5 ta urinish

  config.bot.accessCode = '9999'; // kod o'zgardi — qayta so'raladi
  assert.equal(await hasAccess(101), false);
  config.bot.accessCode = saved;
});
