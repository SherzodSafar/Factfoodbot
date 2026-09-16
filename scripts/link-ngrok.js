/**
 * ngrok'ni botga avtomatik ulash.
 *
 * Nima qiladi:
 *   1) Ishlab turgan ngrok'dan https manzilni oladi
 *   2) .env fayldagi WEBAPP_URL ni yangilaydi
 *   3) Telegram botning "Menu" tugmasini shu manzilga bog'laydi
 *
 * Ishga tushirish (ngrok yonib turganda):  npm run ngrok:link
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');
const NGROK_API = process.env.NGROK_API || 'http://127.0.0.1:4040/api/tunnels';
const token = process.env.BOT_TOKEN;

/** ngrok'ning lokal API'sidan ochiq https manzilni topish */
async function getNgrokUrl() {
  // Manzilni qo'lda ham berish mumkin:  npm run ngrok:link -- https://abc.ngrok-free.app
  const manual = process.argv[2];
  if (manual?.startsWith('https://')) return manual.replace(/\/+$/, '');

  const response = await fetch(NGROK_API).catch(() => null);
  if (!response?.ok) {
    throw new Error(
      'ngrok topilmadi. Avval boshqa terminalda "ngrok http 5173" ni ishga tushiring.\n' +
        '   Yoki manzilni qo\'lda bering:  npm run ngrok:link -- https://xxxx.ngrok-free.app',
    );
  }

  const data = await response.json();
  const tunnel = (data.tunnels || []).find((item) => item.public_url?.startsWith('https://'));
  if (!tunnel) throw new Error('ngrok https manzili topilmadi.');

  return tunnel.public_url.replace(/\/+$/, '');
}

/** .env faylidagi bitta qiymatni yangilash */
function updateEnv(key, value) {
  let content = fs.readFileSync(ENV_PATH, 'utf8');
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, content);
}

/** Telegram API chaqiruvi */
async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

async function main() {
  if (!token) throw new Error('.env faylida BOT_TOKEN yo\'q.');

  const url = await getNgrokUrl();
  console.log(`\n🔗 ngrok manzili topildi: ${url}`);

  updateEnv('WEBAPP_URL', url);
  console.log('✅ .env fayli yangilandi (WEBAPP_URL)');

  const me = await telegram('getMe');
  console.log(`✅ Bot: @${me.username}`);

  await telegram('setChatMenuButton', {
    menu_button: { type: 'web_app', text: '🍕 Menyu', web_app: { url } },
  });
  console.log('✅ Telegram "Menu" tugmasi Mini App\'ga bog\'landi');

  await telegram('setMyCommands', {
    commands: [
      { command: 'start', description: 'Botni ishga tushirish' },
      { command: 'menu', description: 'Menyuni ochish' },
      { command: 'myorders', description: 'Mening buyurtmalarim' },
      { command: 'help', description: 'Yordam' },
    ],
  });
  console.log('✅ Bot buyruqlari sozlandi');

  console.log(
    `\n🎉 Tayyor! Endi Telegram'da @${me.username} ni oching va "/start" deb yozing.\n` +
      '   (Backend .env o\'zgarganini o\'zi sezadi va avtomatik qayta yonadi.)\n',
  );
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}\n`);
  process.exit(1);
});
