import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} o'rnatilmagan. .env faylini to'ldiring (.env.example'ga qarang).`);
    process.exit(1);
  }
  return value;
}

export const config = {
  botToken: required('BOT_TOKEN'),
  // ANTHROPIC_API_KEY'ni SDK o'zi muhitdan o'qiydi — shu yerda faqat borligini tekshiramiz.
  anthropicKey: required('ANTHROPIC_API_KEY'),
  model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  tmdbKey: process.env.TMDB_API_KEY || '',
  // Qayerda ko'rish ro'yxati uchun mamlakat (TMDB watch providers)
  watchRegion: process.env.WATCH_REGION || 'RU',
  // Webhook rejimi (Render va h.k.). Bo'sh bo'lsa — polling.
  webhookDomain: process.env.WEBHOOK_DOMAIN || '',
  port: Number(process.env.PORT || 3000),
  // Bir foydalanuvchi uchun kunlik limit (0 = cheksiz)
  dailyLimit: Number(process.env.DAILY_LIMIT || 30),
};
