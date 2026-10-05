import { test } from 'node:test';
import assert from 'node:assert/strict';
import flow from '../src/services/botFlow.js';

test('botFlow: boshlash, bosqich va data yangilash, tozalash', () => {
  const id = 'flow-user-1';
  flow.clearFlow(id);
  assert.equal(flow.getFlow(id), null);

  flow.startFlow(id, 'acc', 'login', {});
  let f = flow.getFlow(id);
  assert.equal(f.type, 'acc');
  assert.equal(f.step, 'login');

  flow.patchFlow(id, { step: 'password', data: { login: '998901234567' } });
  f = flow.getFlow(id);
  assert.equal(f.step, 'password');
  assert.equal(f.data.login, '998901234567');

  // data yig'iladi (almashmaydi)
  flow.patchFlow(id, { data: { password: 'x' } });
  f = flow.getFlow(id);
  assert.equal(f.data.login, '998901234567');
  assert.equal(f.data.password, 'x');

  flow.clearFlow(id);
  assert.equal(flow.getFlow(id), null);
});

test('botFlow: foydalanuvchilar bir-biriga xalal bermaydi', () => {
  flow.startFlow('a', 'pass', 'first', { firstName: 'Ali' });
  flow.startFlow('b', 'payphone', 'phone', {});
  assert.equal(flow.getFlow('a').type, 'pass');
  assert.equal(flow.getFlow('b').type, 'payphone');
  flow.clearFlow('a');
  assert.equal(flow.getFlow('a'), null);
  assert.equal(flow.getFlow('b').type, 'payphone');
  flow.clearFlow('b');
});
