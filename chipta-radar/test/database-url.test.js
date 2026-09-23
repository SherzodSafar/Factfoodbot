import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSchema, directUrl, runtimeUrl, DEFAULT_SCHEMA } from '../src/database/url.js';

const NEON = 'postgresql://user:pass@ep-demo-123-pooler.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

test('jadvallar alohida sxemaga yoziladi (boshqa loyiha jadvallariga tegilmaydi)', () => {
  delete process.env.DB_SCHEMA;
  assert.equal(DEFAULT_SCHEMA, 'chipta_radar');
  assert.equal(withSchema(NEON), `${NEON}&schema=chipta_radar`);
  assert.equal(withSchema('postgresql://u:p@localhost:5432/chipta'), 'postgresql://u:p@localhost:5432/chipta?schema=chipta_radar');
  assert.equal(withSchema(NEON, 'public'), `${NEON}&schema=public`);
});

test('manzilda sxema bo\'lsa — o\'zgarmaydi; bo\'sh manzil — bo\'sh', () => {
  const custom = 'postgresql://u:p@localhost/db?schema=boshqa&sslmode=disable';
  assert.equal(withSchema(custom), custom);
  assert.equal(withSchema(''), '');
  assert.equal(withSchema(undefined), '');
});

test('DB_SCHEMA orqali sxema nomini o\'zgartirish mumkin', () => {
  process.env.DB_SCHEMA = 'test_sxema';
  try {
    assert.equal(withSchema('postgresql://u:p@h/db'), 'postgresql://u:p@h/db?schema=test_sxema');
  } finally {
    delete process.env.DB_SCHEMA;
  }
});

test('jadval yaratish uchun Neon pooler o\'rniga to\'g\'ridan-to\'g\'ri ulanish', () => {
  delete process.env.DIRECT_URL;
  assert.equal(
    directUrl(withSchema(NEON)),
    'postgresql://user:pass@ep-demo-123.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&schema=chipta_radar',
  );
  process.env.DIRECT_URL = 'postgresql://user:pass@direct.example/neondb?sslmode=require';
  try {
    assert.equal(directUrl(withSchema(NEON)), 'postgresql://user:pass@direct.example/neondb?sslmode=require&schema=chipta_radar');
  } finally {
    delete process.env.DIRECT_URL;
  }
});

test('server manzili: Neon uxlaganda uzilgan ulanishlar qayta ishlatilmaydi', () => {
  delete process.env.DB_SCHEMA;
  assert.equal(
    runtimeUrl(NEON),
    `${NEON}&schema=chipta_radar&max_idle_connection_lifetime=120&connect_timeout=15`,
  );
  // Foydalanuvchi o'zi bergan qiymatlar saqlanadi
  const custom = 'postgresql://u:p@h/db?connect_timeout=30&max_idle_connection_lifetime=60';
  assert.equal(runtimeUrl(custom), `${custom}&schema=chipta_radar`);
  assert.equal(runtimeUrl(''), '');
});
