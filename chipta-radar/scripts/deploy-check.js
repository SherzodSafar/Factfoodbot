/**
 * Bulutdagi tizim holatini tekshirish:
 *   npm run deploy:check -- https://chipta-radar-api.onrender.com
 *
 * Tekshiradi: backend, baza, bot, eticket.railway.uz aloqasi, kuzatuv xizmati, Mini App.
 */
import 'dotenv/config';

const api = (process.argv[2] || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const ok = (text) => console.log(`   ✅ ${text}`);
const bad = (text) => console.log(`   ❌ ${text}`);

async function main() {
  if (!api) {
    console.error('\n❌ Backend manzilini bering:  npm run deploy:check -- https://xxx.onrender.com\n');
    process.exit(1);
  }
  console.log(`\n🔎 Tekshirilmoqda: ${api}\n`);

  try {
    const response = await fetch(`${api}/api/health`, { signal: AbortSignal.timeout(90_000) });
    const data = await response.json();
    ok(`Backend ishlayapti (${response.status})`);
    if (data.database === 'ok') ok('Ma\'lumotlar bazasi ulangan');
    else bad(`Baza: ${data.database}`);
    if (String(data.bot).startsWith('@')) ok(`Bot: ${data.bot}`);
    else bad(`Bot: ${data.bot}`);
    if (data.railway?.state === 'ok') ok(`eticket.railway.uz aloqasi bor (~${data.railway.avgMs} ms)`);
    else bad(`eticket.railway.uz: ${data.railway?.state} ${data.railway?.lastError || ''}`);
    ok(`Kuzatuv xizmati: ${data.watcher?.state}`);

    if (data.webAppUrl) {
      const page = await fetch(data.webAppUrl);
      if (page.ok) ok(`Mini App ochilyapti: ${data.webAppUrl}`);
      else bad(`Mini App javob bermadi (${page.status})`);
    } else {
      bad('WEBAPP_URL sozlanmagan');
    }
  } catch (error) {
    bad(`Backend javob bermadi: ${error.message}`);
    console.log('      (Bepul tarifda server uxlab qolgan bo\'lsa, 1 daqiqa kutib qayta urinib ko\'ring)');
  }
  console.log('');
}

main();
