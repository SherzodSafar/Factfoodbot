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

import config, { validateConfig } from './config/default.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';
import prisma from './database/connection.js';
import clientRoutes from './routes/client.routes.js';
import adminRoutes from './routes/admin.routes.js';
import registerBotRoutes from './routes/bot.routes.js';
import { getBot } from './core/bot.js';

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

/* --------------------- Tayyor frontendlar ------------------------- */

const { miniappDist, adminDist } = config.frontend;

// Admin Panel → http://localhost:3000/admin
if (fs.existsSync(adminDist)) {
  app.use('/admin', express.static(adminDist));
  app.get('/admin/*', (req, res) => res.sendFile(path.join(adminDist, 'index.html')));
}

// Mini App → http://localhost:3000/
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
      `<!doctype html><meta charset="utf-8"><title>FactFood</title>
       <div style="font-family:system-ui;max-width:640px;margin:80px auto;padding:0 20px;line-height:1.7">
         <h1 style="font-size:24px">🍕 FactFood serveri ishlayapti</h1>
         <p>Mini App hali <b>build</b> qilinmagan.</p>
         <p>Terminalda quyidagini bajaring:</p>
         <pre style="background:#f4f4f5;padding:14px;border-radius:10px">npm run build</pre>
         <p>Yoki ishlab chiqish rejimida: <code>npm run dev:all</code> →
            Mini App <a href="http://localhost:${config.frontend.miniappPort}">localhost:${config.frontend.miniappPort}</a>,
            Admin <a href="http://localhost:${config.frontend.adminPort}">localhost:${config.frontend.adminPort}</a></p>
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
    console.log(`✅ API server:  http://localhost:${config.port}`);
    if (fs.existsSync(adminDist)) {
      console.log(`✅ Admin panel: http://localhost:${config.port}/admin`);
    }
    if (config.bot.webAppUrl) {
      console.log(`✅ Mini App:    ${config.bot.webAppUrl}`);
    } else {
      console.log('⚠️  WEBAPP_URL bo\'sh — ngrok\'ni yoqib "npm run ngrok:link" ni bajaring');
    }
  });

  // 3. Botni yoqish
  const bot = await registerBotRoutes();
  if (bot) {
    bot
      .launch({ dropPendingUpdates: true }, () => {
        console.log(`✅ Bot ishga tushdi: @${bot.botInfo?.username || '...'}\n`);
      })
      .catch((error) => {
        console.error('❌ Bot ishga tushmadi:', error.message);
        console.error('   BOT_TOKEN to\'g\'riligini tekshiring (@BotFather).\n');
      });
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
