/**
 * Chipta Radar — asosiy ishga tushirish fayli.
 *
 * Bitta Node.js jarayoni quyidagilarni bajaradi:
 *   1) Express API serveri (Mini App + Admin Panel uchun)
 *   2) Telegram bot (bulutda webhook, localhost'da polling)
 *   3) Kuzatuv xizmati — joylar paydo bo'lishini kuzatib, xabar yuboradi
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import cors from 'cors';

import config, { missingConfig, resolveBotMode } from './config/default.js';
import prisma, { connectDatabase, disconnectDatabase, isDatabaseReady } from './database/connection.js';
import clientRoutes from './routes/client.routes.js';
import adminRoutes from './routes/admin.routes.js';
import appRoutes from './routes/app.routes.js';
import registerBotRoutes from './routes/bot.routes.js';
import { getBot, syncBotProfile } from './core/bot.js';
import { loadUserLangs } from './i18n/index.js';
import { searchTrains, getTrainDetail, getRailwayStatus } from './core/railway.js';
import { searchKtzTrains } from './core/ktz.js';
import { KTZ_STATIONS } from './services/foreignStations.js';
import { startExchangeRates } from './services/exchangeRates.js';
import { isKnownCarType } from './services/carTypes.js';
import { loadSettings } from './services/settings.js';
import { refreshStations } from './services/stations.js';
import { startWatcher, stopWatcher, getWatcherStatus, flushWatcher } from './services/watcher.js';
import { startKeepAlive } from './services/keepAlive.js';
import { startRoutePrices } from './services/routePrices.js';
import { todayISO, addDays } from './utils/dates.js';

const app = express();
app.set('trust proxy', 1);

/* --------------------------- Middleware --------------------------- */

app.use(cors({ origin: true }));
app.use(express.json({ limit: '200kb' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api') && req.query.source !== 'keepalive') {
    const started = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl.split('?')[0]} → ${res.statusCode} (${Date.now() - started}ms)`);
    });
  }
  next();
});

/* ------------------------------ API ------------------------------- */

app.get('/api/health', async (req, res) => {
  let database = config.database.url ? 'error' : 'not-configured';
  // "Uyg'oq saqlash" so'rovi bazani uyg'otmasligi kerak (Neon soatlarini tejash)
  if (isDatabaseReady() && req.query.source === 'keepalive') {
    database = 'ok';
  } else if (isDatabaseReady()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch {
      database = 'error';
    }
  }
  const railway = getRailwayStatus();
  const watcher = getWatcherStatus();
  res.json({
    ok: true,
    service: `${config.appName} API`,
    database,
    bot: getBot() ? (getBot().botInfo?.username ? `@${getBot().botInfo.username}` : 'starting') : 'not-configured',
    webAppUrl: config.bot.webAppUrl || null,
    railway: {
      state: railway.state,
      lastSuccessAt: railway.lastSuccessAt,
      lastError: railway.lastError,
      avgMs: railway.avgMs,
    },
    watcher: { state: watcher.state, lastCycle: watcher.lastCycle },
    time: new Date().toISOString(),
  });
});

app.use('/api/client', clientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/app', appRoutes);

// Android ilova (GitHub Actions yig'ib, public/app ga yozadi)
app.get('/download/chipta-radar.apk', (req, res) => {
  const file = path.join(process.cwd(), 'public', 'app', 'chipta-radar.apk');
  if (!fs.existsSync(file)) return res.status(404).send('Ilova hali tayyor emas');
  res.type('application/vnd.android.package-archive');
  res.download(file, 'chipta-radar.apk');
});

/** Telegram webhook manzili (bulutda bot shu yo'l orqali xabarlarni qabul qiladi) */
export const WEBHOOK_PATH = '/api/bot/webhook';
let webhookHandler = null;

app.post(WEBHOOK_PATH, (req, res, next) => {
  if (!webhookHandler) return res.status(503).json({ ok: false, error: 'Bot tayyor emas' });
  return webhookHandler(req, res, next);
});

/* ------------- "Akkaunt va ma'lumotlar" Web App sahifasi ------------ */

// Bot "Akkaunt" tugmasi shu sahifani ochadi (Telegram WebApp). Backendning o'zi beradi.
const { webappDir, miniappDist } = config.frontend;
if (fs.existsSync(webappDir)) {
  app.use('/app', express.static(webappDir, { extensions: ['html'] }));
  app.get('/app', (req, res) => res.sendFile(path.join(webappDir, 'account.html')));
}

/* --------------------- Tayyor Mini App (ixtiyoriy) ------------------ */

if (fs.existsSync(miniappDist)) app.use(express.static(miniappDist));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ ok: false, error: 'Bunday API yo\'li yo\'q' });
  if (fs.existsSync(path.join(miniappDist, 'index.html'))) return res.sendFile(path.join(miniappDist, 'index.html'));
  return res
    .status(200)
    .type('html')
    .send(
      `<!doctype html><meta charset="utf-8"><title>${config.appName} API</title>
       <div style="font-family:system-ui;max-width:620px;margin:80px auto;padding:0 20px;line-height:1.7">
         <h1 style="font-size:24px">🚆 ${config.appName} API ishlayapti</h1>
         <p>Bu — backend server. Foydalanuvchilar uchun ilova va admin panel alohida manzillarda.</p>
         <p><a href="/api/health">/api/health</a> — server holati</p>
       </div>`,
    );
});

/* ------------------------ Xatolarni ushlash ----------------------- */

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Noto\'g\'ri so\'rov' });
  console.error('[api] Xatolik:', error);
  return res.status(500).json({
    ok: false,
    error: config.env === 'development' ? error.message : 'Serverda xatolik yuz berdi',
  });
});

/* -------------------------- Ishga tushirish ----------------------- */

/** Baza tayyor bo'lganda: sozlamalar, stansiyalar, kuzatuv xizmati */
async function onDatabaseReady() {
  await loadSettings();
  await refreshStations();
  await loadUserLangs().catch((error) => console.warn('[til]', error.message));
  console.log('✅ Ma\'lumotlar bazasi: ulandi');
  startWatcher();
  startKeepAlive();
  startRoutePrices().catch((error) => console.error('[narxlar]', error.message));
}

async function connectWithRetry() {
  if (!config.database.url) return;
  try {
    await connectDatabase();
    await prisma.station.count();
    await onDatabaseReady();
  } catch (error) {
    const hint = error.code === 'P2021' || /does not exist/i.test(error.message)
      ? 'Bazada jadvallar yo\'q — "npm run setup" ni bajaring'
      : error.message.split('\n').slice(-1)[0];
    console.error(`❌ Bazaga ulanib bo'lmadi: ${hint}. 30 soniyadan so'ng qayta urinaman.`);
    setTimeout(connectWithRetry, 30_000).unref?.();
  }
}

/**
 * Ishga tushganda eticket.railway.uz bilan aloqani bir marta tekshirish:
 * poyezdlar ro'yxati va bitta poyezdning vagonlari (aniq joy raqamlari bilan).
 */
async function railwaySelfTest() {
  const date = addDays(todayISO(), 1);
  const query = { from: '2900000', to: '2900700', date };
  try {
    const { trains } = await searchTrains(query, { priority: 'low' });
    const withSeats = trains.filter((train) => train.totalFree > 0);
    console.log(
      `✅ eticket.railway.uz: Toshkent → Samarqand (${date}) — ${trains.length} ta poyezd, ${withSeats.length} tasida joy bor` +
        (trains[0] ? ` (masalan ${trains[0].number} ${trains[0].title} ${trains[0].depTime})` : ''),
    );

    // Saytdagi vagon turlari yozuvlari qaysi kalitga tushayotgani (noma'lumlari ⚠️ bilan)
    const labels = new Map();
    for (const train of trains) for (const car of train.cars) labels.set(car.rawLabel || car.label, car.type);
    const summary = [...labels].map(([raw, type]) => `${raw}→${type}${isKnownCarType(type) ? '' : ' ⚠️'}`).join(', ');
    if (summary) console.log(`   Vagon turlari: ${summary}`);

    // Vagonlar va aniq joy raqamlari (turli vagon turlari bo'lgan poyezd afzal)
    const sample = [...withSeats].sort((a, b) => b.cars.length - a.cars.length)[0];
    if (sample) {
      const { cars } = await getTrainDetail({ ...query, trainNumber: sample.number, trainId: sample.id }, { priority: 'low' });
      const brief = cars
        .slice(0, 6)
        .map((car) => `${car.number}-vagon ${car.label}(${car.type}): ${car.places.length} joy [${car.places.slice(0, 8).join(',')}${car.places.length > 8 ? '…' : ''}]`)
        .join('; ');
      console.log(`✅ ${sample.number} vagonlari: ${cars.length} ta — ${brief}`);
    }
  } catch (error) {
    console.error(`❌ eticket.railway.uz tekshiruvi: [${error.code || 'ERROR'}] ${error.message}`);
    const sample = getRailwayStatus().lastSample;
    if (sample) console.error(`   Javob namunasi: ${sample.slice(0, 300)}`);
  }
}

/** Ishga tushganda KTZ (bilet.railways.kz) bilan aloqa: xorijiy bekatlardan Toshkentga poyezdlar */
async function ktzSelfTest() {
  const date = addDays(todayISO(), 14);
  const parts = [];
  for (const station of KTZ_STATIONS) {
    try {
      const { trains } = await searchKtzTrains({ from: station.code, to: '2900000', date });
      parts.push(`${station.nameUz}→Toshkent ${trains.length} (${trains.map((train) => `${train.number} ${train.depTime} ${train.title} ${train.cars.map((car) => `${car.type}:${car.free}`).join('/')}`).join(', ') || '—'})`);
    } catch (error) {
      parts.push(`${station.nameUz}: ❌ ${error.message}`);
    }
  }
  console.log(`✅ KTZ (${date}): ${parts.join('; ')}`);
}

async function startBot() {
  const bot = await registerBotRoutes();
  if (!bot) return;

  const mode = resolveBotMode();
  try {
    if (mode === 'webhook') {
      const domain = config.bot.publicUrl;
      if (!domain.startsWith('https://')) throw new Error('Webhook uchun PUBLIC_URL (https) kerak');
      webhookHandler = await bot.createWebhook({
        domain,
        path: WEBHOOK_PATH,
        drop_pending_updates: false,
        allowed_updates: ['message', 'callback_query'],
        // Maxfiy kalit: shu manzilga ulanib qolgan boshqa (eski) bot yangilanishlari qabul qilinmaydi
        secret_token: config.bot.webhookSecret || crypto.createHash('sha256').update(`webhook:${config.bot.token}`).digest('hex').slice(0, 48),
      });
      bot.botInfo = await bot.telegram.getMe();
      console.log(`✅ Bot (webhook): @${bot.botInfo.username} → ${domain}${WEBHOOK_PATH}`);
    } else {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
      bot
        .launch({ dropPendingUpdates: true }, () => console.log(`✅ Bot (polling): @${bot.botInfo?.username || '...'}`))
        .catch((error) => console.error('❌ Bot ishga tushmadi:', error.message));
    }
    await syncBotProfile();
  } catch (error) {
    console.error('❌ Bot ishga tushmadi:', error.message);
    console.error('   BOT_TOKEN to\'g\'riligini tekshiring.');
  }
}

async function bootstrap() {
  console.log(`\n🚆  ${config.appName} ishga tushmoqda...\n`);

  const problems = missingConfig();
  if (problems.length) {
    console.warn('⚠️  Sozlamalar to\'liq emas:');
    problems.forEach((problem) => console.warn(`   • ${problem}`));
    console.warn('');
  }

  await connectWithRetry();

  const server = app.listen(config.port, () => {
    console.log(`✅ API server: ${config.bot.publicUrl || `http://localhost:${config.port}`}`);
    if (config.bot.webAppUrl) console.log(`✅ Mini App:   ${config.bot.webAppUrl}`);
  });

  await startBot();
  railwaySelfTest();
  startExchangeRates().catch(() => {});
  setTimeout(() => ktzSelfTest().catch(() => {}), 15_000).unref?.();

  if (process.env.RAILWAY_INSPECT === '1') {
    // Diagnostika: saytning ochiq JS fayllaridan API yo'llarini topish (scripts/railway-inspect.js)
    setTimeout(() => {
      import('../scripts/railway-inspect.js')
        .then(({ inspectRailwaySite }) => inspectRailwaySite())
        .catch((error) => console.error('[inspect] xato:', error.message));
    }, 15_000);
  }

  const shutdown = async (signal) => {
    console.log(`\n${signal} — to'xtatilmoqda...`);
    stopWatcher();
    // Kuzatuvlarning saqlanmagan "oxirgi tekshiruv" ma'lumotlari (ko'pi bilan 5 soniya kutiladi)
    await Promise.race([flushWatcher().catch(() => 0), new Promise((resolve) => setTimeout(resolve, 5_000))]);
    try {
      getBot()?.stop(signal);
    } catch {
      /* bot webhook rejimida — to'xtatish shart emas */
    }
    server.close();
    await disconnectDatabase().catch(() => {});
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('❌ Kutilmagan xatolik:', error);
  process.exit(1);
});

export default app;
