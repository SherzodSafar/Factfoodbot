// Telegram webhook, menyu tugmasi va buyruqlarni sozlash.
//   ADMIN_KEY=... node scripts/setup-bot.js https://shajara-ibot.vercel.app
const server = (process.argv[2] || '').replace(/\/$/, '');
if (!server) {
  console.log('Foydalanish: ADMIN_KEY=... node scripts/setup-bot.js <server_url>');
  process.exit(1);
}
const r = await fetch(`${server}/api/setup?key=${encodeURIComponent(process.env.ADMIN_KEY || '')}`);
console.log(r.status, JSON.stringify(await r.json(), null, 2));
