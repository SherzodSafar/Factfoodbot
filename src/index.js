/**
 * FactFood — asosiy ishga tushirish fayli.
 *
 * Bitta Node.js jarayoni quyidagilarni bajaradi:
 *   1) Express API serveri  (Mini App + Admin Panel uchun)
 *   2) Telegram bot         (long polling)
 *   3) Tayyor (build qilingan) frontendlarni tarqatish
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';

import config, { validateConfig, resolveBotMode } from './config/default.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';
import prisma from './database/connection.js';
import clientRoutes from './routes/client.routes.js';
import adminRoutes from './routes/admin.routes.js';
import registerBotRoutes from './routes/bot.routes.js';
import { getBot, syncBotProfile } from './core/bot.js';

const app = express();

/* --------------------------- Middleware --------------------------- */

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Oddiy so'rovlar jurnali
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const started = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`);
    });
  }
  next();
});

/* ------------------------------ API ------------------------------- */

app.get('/api/health', async (req, res) => {
  let database = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'error';
  }
  res.json({
    ok: true,
    service: 'FactFood API',
    database,
    webAppUrl: config.bot.webAppUrl || null,
    time: new Date().toISOString(),
  });
});

app.use('/api/client', clientRoutes);
app.use('/api/admin', adminRoutes);

/**
 * Telegram webhook manzili.
 * Bulutda (Render) bot shu yo'l orqali xabarlarni qabul qiladi.
 * Haqiqiy ishlov beruvchi bot ishga tushganda ulanadi.
 */
export const WEBHOOK_PATH = '/api/bot/webhook';
let webhookHandler = null;

app.post(WEBHOOK_PATH, (req, res, next) => {
  if (!webhookHandler) return res.status(503).json({ ok: false, error: 'Bot tayyor emas' });
  return webhookHandler(req, res, next);
});

/* --------------------- Tayyor frontendlar ------------------------- */

const { miniappDist } = config.frontend;

// Agar Mini App build qilingan bo'lsa, uni ham shu server tarqatadi (ixtiyoriy).
if (fs.existsSync(miniappDist)) {
  app.use(express.static(miniappDist));
}

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ ok: false, error: 'Bunday API yo\'li yo\'q' });
  }
  if (fs.existsSync(path.join(miniappDist, 'index.html'))) {
    return res.sendFile(path.join(miniappDist, 'index.html'));
  }
  return res
    .status(200)
    .type('html')
    .send(
      `<!doctype html><meta charset="utf-8"><title>FactFood API</title>
       <div style="font-family:system-ui;max-width:620px;margin:80px auto;padding:0 20px;line-height:1.7">
         <h1 style="font-size:24px">🍕 FactFood API ishlayapti</h1>
         <p>Bu — backend server. Mijozlar uchun ilova va admin panel alohida manzillarda.</p>
         <p><a href="/api/health">/api/health</a> — server holati</p>
         ${config.bot.webAppUrl ? `<p>Mini App: <a href="${config.bot.webAppUrl}">${config.bot.webAppUrl}</a></p>` : ''}
       </div>`,
    );
});

/* ------------------------ Xatolarni ushlash ----------------------- */

app.use((error, req, res, next) => {
  console.error('[api] Xatolik:', error);
  res.status(500).json({
    ok: false,
    error: config.env === 'development' ? error.message : 'Serverda xatolik yuz berdi',
  });
});

/* -------------------------- Ishga tushirish ----------------------- */

async function bootstrap() {
  console.log('\n🍕  FactFood ishga tushmoqda...\n');

  const problems = validateConfig();
  if (problems.length) {
    console.error('❌ Sozlamalarda xatolik:');
    problems.forEach((problem) => console.error(`   • ${problem}`));
    console.error('\n   .env faylini to\'ldiring va qaytadan urinib ko\'ring.\n');
    process.exit(1);
  }

  // 1. Bazaga ulanish
  try {
    await connectDatabase();
    await prisma.product.count();
    console.log('✅ Ma\'lumotlar bazasi: ulandi');
  } catch (error) {
    if (error.code === 'P2021' || /does not exist/i.test(error.message)) {
      console.error('\n❌ Bazada jadvallar topilmadi.\n   Quyidagini bajaring:  npm run setup\n');
    } else {
      console.error('\n❌ Bazaga ulanib bo\'lmadi:', error.message);
      console.error('   .env faylidagi DATABASE_URL to\'g\'riligini tekshiring.\n');
    }
    process.exit(1);
  }

  // 2. API serverni yoqish
  const server = app.listen(config.port, () => {
    console.log(`✅ API server:  ${config.bot.publicUrl || `http://localhost:${config.port}`}`);
    if (config.bot.webAppUrl) {
      console.log(`✅ Mini App:    ${config.bot.webAppUrl}`);
    } else {
      console.log('⚠️  WEBAPP_URL bo\'sh — Mini App manzili ulanmagan');
    }
  });

  // 3. Botni yoqish
  const bot = await registerBotRoutes();
  if (bot) {
    const mode = resolveBotMode();

    try {
      if (mode === 'webhook') {
        // --- Bulut rejimi: Telegram xabarlarni serverimizga yuboradi ---
        const domain = config.bot.publicUrl;
        if (!domain.startsWith('https://')) {
          throw new Error('Webhook uchun PUBLIC_URL (https) kerak');
        }

        webhookHandler = await bot.createWebhook({
          domain,
          path: WEBHOOK_PATH,
          dropPendingUpdates: true,
          ...(config.bot.webhookSecret ? { secretToken: config.bot.webhookSecret } : {}),
        });

        const me = await bot.telegram.getMe();
        bot.botInfo = me;
        console.log(`✅ Bot (webhook): @${me.username} → ${domain}${WEBHOOK_PATH}`);
      } else {
        // --- Localhost rejimi: bot Telegramdan xabarlarni o'zi so'rab turadi ---
        await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
        bot.launch({ dropPendingUpdates: true }, () => {
          console.log(`✅ Bot (polling): @${bot.botInfo?.username || '...'}`);
        }).catch((error) => {
          console.error('❌ Bot ishga tushmadi:', error.message);
        });
      }

      // "Menu" tugmasi va buyruqlarni avtomatik sozlash
      await syncBotProfile();
      console.log('');
    } catch (error) {
      console.error('❌ Bot ishga tushmadi:', error.message);
      console.error('   BOT_TOKEN va PUBLIC_URL to\'g\'riligini tekshiring.\n');
    }
  }

  // 4. Dasturni chiroyli to'xtatish
  const shutdown = async (signal) => {
    console.log(`\n${signal} — to'xtatilmoqda...`);
    try {
      getBot()?.stop(signal);
    } catch {
      /* bot allaqachon to'xtagan */
    }
    server.close();
    await disconnectDatabase();
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
