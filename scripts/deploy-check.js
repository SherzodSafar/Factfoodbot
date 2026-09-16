/**
 * Bulutdagi tizim holatini tekshirish:  npm run deploy:check
 *
 * Tekshiradi:
 *   1) Backend (Render) javob beryaptimi
 *   2) Baza ulanganmi
 *   3) Telegram webhook to'g'ri o'rnatilganmi
 *   4) Mini App manzili ochilyaptimi
 */
import 'dotenv/config';

const api = (process.argv[2] || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const token = process.env.BOT_TOKEN;

const ok = (text) => console.log(`   ✅ ${text}`);
const bad = (text) => console.log(`   ❌ ${text}`);

async function main() {
  if (!api) {
    console.error('\n❌ Backend manzilini bering:  npm run deploy:check -- https://xxx.onrender.com\n');
    process.exit(1);
  }

  console.log(`\n🔎 Tekshirilmoqda: ${api}\n`);

  // 1-2. Backend va baza
  try {
    const response = await fetch(`${api}/api/health`);
    const data = await response.json();
    ok(`Backend ishlayapti (${response.status})`);
    data.database === 'ok' ? ok('Ma\'lumotlar bazasi ulangan') : bad('Bazaga ulanmadi');
    if (data.webAppUrl) ok(`Mini App manzili: ${data.webAppUrl}`);
    else bad('WEBAPP_URL sozlanmagan');

    // 4. Mini App ochilyaptimi
    if (data.webAppUrl) {
      const page = await fetch(data.webAppUrl);
      page.ok ? ok(`Mini App ochilyapti (${page.status})`) : bad(`Mini App javob bermadi (${page.status})`);
    }
  } catch (error) {
    bad(`Backend javob bermadi: ${error.message}`);
    console.log('      (Render bepul tarifda uxlab qolgan bo\'lsa, 1 daqiqa kutib qayta urinib ko\'ring)');
  }

  // 3. Telegram webhook
  if (token) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const data = await response.json();
      if (data.ok && data.result.url) {
        ok(`Telegram webhook: ${data.result.url}`);
        if (data.result.last_error_message) {
          bad(`Oxirgi xatolik: ${data.result.last_error_message}`);
        }
        if (data.result.pending_update_count) {
          console.log(`   ℹ️  Kutayotgan xabarlar: ${data.result.pending_update_count}`);
        }
      } else {
        bad('Webhook o\'rnatilmagan');
      }
    } catch (error) {
      bad(`Telegram tekshiruvi: ${error.message}`);
    }
  }

  console.log('');
}

main();
