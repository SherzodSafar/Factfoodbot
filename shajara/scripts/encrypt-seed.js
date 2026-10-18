// Shajara JSON faylini shifrlab data/seed.enc ga yozadi (ombor ochiq bo'lsa ham ma'lumot yashirin qoladi).
//   SEED_KEY=... node scripts/encrypt-seed.js shajara.json
import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';

const [file] = process.argv.slice(2);
if (!file || !process.env.SEED_KEY) {
  console.log('Foydalanish: SEED_KEY=... node scripts/encrypt-seed.js <fayl.json>');
  process.exit(1);
}
const key = crypto.createHash('sha256').update(process.env.SEED_KEY).digest();
const iv = crypto.randomBytes(12);
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([c.update(readFileSync(file)), c.final()]);
writeFileSync('data/seed.enc', Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64'));
console.log('data/seed.enc yozildi');
