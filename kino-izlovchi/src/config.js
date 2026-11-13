import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} o'rnatilmagan. .env faylini to'ldiring (.env.example'ga qarang).`);
    process.exit(1);
  }
  return value;
}

// Bepul tarifda model band (503) yoki limit tugagan (429) bo'lsa, navbatdagisiga o'tiladi.
// Tartib: avval barqaror ishlaganlar, keyin yangi (ko'pincha band) modellar, oxirida tez "lite" modellar.
const DEFAULT_MODELS = [
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
];

export const config = {
  botToken: required('BOT_TOKEN'),
  geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  models: (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  tmdbKey: process.env.TMDB_API_KEY || '',
  // Webhook rejimi (Render va h.k.). Bo'sh bo'lsa — polling.
  webhookDomain: process.env.WEBHOOK_DOMAIN || process.env.RENDER_EXTERNAL_URL || '',
  port: Number(process.env.PORT || 3000),
  // Bir foydalanuvchi uchun kunlik limit (0 = cheksiz)
  dailyLimit: Number(process.env.DAILY_LIMIT || 30),
  // ffmpeg va yt-dlp yo'llari (Docker'da tizimdagi binarlar ishlatiladi)
  ffmpegPath: process.env.FFMPEG_PATH || '',
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  // Ixtiyoriy: Instagram/YouTube uchun cookies.txt (Netscape formati) matni
  ytdlpCookies: process.env.YTDLP_COOKIES || '',
};
if (!config.models.length) config.models = DEFAULT_MODELS;

/** Gemini kaliti bormi? Yo'q bo'lsa bot ishlaydi, lekin kinoni aniqlay olmaydi. */
export const aiReady = () => Boolean(config.geminiKey);
