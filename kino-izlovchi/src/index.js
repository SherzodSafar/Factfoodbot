import http from 'node:http';
import crypto from 'node:crypto';
import { Telegraf, Markup } from 'telegraf';
import { AiBusyError } from './ai.js';
import { aiReady, config } from './config.js';
import { download, extractAudio, extractFrames, toJpeg } from './frames.js';
import { identifyMovie, transcribe } from './identify.js';
import { findVideoLink, fromLink, platformName } from './links.js';
import { LANG, pickPlatforms } from './platforms.js';
import { buildCard, buildKeyboard, esc, parseCard } from './card.js';
import { findDetails, tmdbEnabled } from './tmdb.js';

const bot = new Telegraf(config.botToken, { handlerTimeout: 300_000 });

const MAX_FILE_BYTES = 20 * 1024 * 1024; // Bot API getFile chegarasi
const CONFIDENT = 0.65; // shundan past bo'lsa — audio (subtitr) orqali ham tekshiramiz
const MIN_CONFIDENCE = 0.35; // shundan past bo'lsa — "topilmadi"

// ---------- Yordamchi holatlar (xotirada) ----------
const busy = new Set(); // hozir qidirilayotgan foydalanuvchilar
const usage = new Map(); // userId -> { day, count }

function underLimit(userId) {
  if (!config.dailyLimit) return true;
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(userId);
  if (!u || u.day !== day) {
    usage.set(userId, { day, count: 1 });
    return true;
  }
  if (u.count >= config.dailyLimit) return false;
  u.count += 1;
  return true;
}

const NOT_READY =
  "🛠 Bot hozircha sozlanmoqda: kinoni aniqlovchi sun'iy intellekt kaliti hali qo'shilmagan.\n" +
  "Tez orada ishga tushadi — keyinroq qayta urinib ko'ring.";

// ---------- Asosiy oqim ----------
/**
 * @param getInput async (setStatus) => ({ frames, text, getAudio? })
 */
async function handleSearch(ctx, getInput, firstStatus = '🔎 Qidiryapman..') {
  const userId = ctx.from.id;
  if (!aiReady()) return ctx.reply(NOT_READY);
  if (busy.has(userId)) return ctx.reply("⏳ Oldingi so'rov hali qidirilyapti, biroz kuting.");
  if (!underLimit(userId)) {
    return ctx.reply(`Bugungi limit (${config.dailyLimit} ta) tugadi. Ertaga yana urinib ko'ring 🙂`);
  }

  busy.add(userId);
  const status = await ctx.reply(firstStatus, { reply_parameters: { message_id: ctx.message.message_id } });
  let lastStatus = firstStatus;
  const setStatus = async (text) => {
    if (text === lastStatus) return;
    lastStatus = text;
    await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, text).catch(() => {});
  };
  const typing = setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 4500);

  try {
    const input = await getInput(setStatus);
    const frames = input.frames || [];
    if (!frames.length && !input.text && !input.getAudio) {
      await setStatus("😕 Videoni olib bo'lmadi. Videoning o'zini yoki skrinshotini yuboring.");
      return;
    }

    // 1-qadam: kadrlar (+ sarlavha/tavsif) bo'yicha
    let guess = null;
    if (frames.length || input.text) {
      await setStatus('🔎 Qidiryapman..');
      guess = await identifyMovie({ frames, text: input.text });
    }

    // 2-qadam: aniq topilmasa — ovozni subtitrga aylantirib, dialog bo'yicha
    let transcript = '';
    if ((!guess || guess.confidence < CONFIDENT) && input.getAudio) {
      await setStatus("🎧 Tasvirdan aniq topilmadi — ovozini subtitrga aylantiryapman..");
      const audio = await input.getAudio();
      if (audio) transcript = await transcribe(audio);
      if (transcript) {
        await setStatus("🔎 Dialog (subtitr) bo'yicha qidiryapman..");
        const byAudio = await identifyMovie({ frames, text: input.text, transcript });
        if (byAudio && (!guess || byAudio.confidence >= guess.confidence)) guess = { ...byAudio, viaAudio: true };
      }
    }

    if (!guess || guess.confidence < MIN_CONFIDENCE) {
      await setStatus(
        "😕 Afsus, bundan kinoni aniqlay olmadim" +
          (transcript ? ' (dialog bo‘yicha ham).' : '.') +
          "\n\nAktyorlar yuzi yoki muhim sahna ko'rinadigan boshqa parcha/skrinshot yuboring, " +
          "yoki sahnani so'z bilan tasvirlab yozing.",
      );
      return;
    }

    let details = null;
    try {
      details = await findDetails(guess);
    } catch (err) {
      console.error('TMDB xatosi:', err.message);
    }

    const caption = buildCard(guess, details, transcript);
    const opts = {
      parse_mode: 'HTML',
      reply_parameters: { message_id: ctx.message.message_id },
      ...buildKeyboard(guess),
    };
    await ctx.telegram.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
    if (details?.poster) await ctx.replyWithPhoto(details.poster, { caption, ...opts });
    else await ctx.reply(caption, opts);
  } catch (err) {
    console.error('Qidiruv xatosi:', err);
    if (err instanceof AiBusyError) {
      await setStatus(
        err.quota
          ? "⏳ Sun'iy intellektning bepul limiti vaqtincha tugadi. Bir necha daqiqadan so'ng qayta urinib ko'ring."
          : "⏳ Sun'iy intellekt hozir juda band. 1–2 daqiqadan so'ng qayta urinib ko'ring.",
      );
    } else {
      await setStatus("⚠️ Xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.");
    }
  } finally {
    clearInterval(typing);
    busy.delete(userId);
  }
}

function videoInput(ctx, file, duration) {
  return async (setStatus) => {
    await setStatus('📥 Videoni olyapman..');
    const link = await ctx.telegram.getFileLink(file.file_id);
    const buffer = await download(link.href);
    const frames = await extractFrames(buffer, duration);
    return {
      frames,
      text: ctx.message.caption || '',
      getAudio: () => extractAudio(buffer, 120),
    };
  };
}

function imageInput(ctx, fileId) {
  return async () => {
    const link = await ctx.telegram.getFileLink(fileId);
    const buf = await download(link.href);
    return { frames: [await toJpeg(buf)], text: ctx.message.caption || '' };
  };
}

function linkInput(link, extraText) {
  return async (setStatus) => {
    await setStatus(`📥 ${platformName(link)} videosini yuklab olyapman..`);
    const res = await fromLink(link);
    if (!res.gotVideo && res.frames.length) {
      await setStatus("📥 Videoning o'zini olib bo'lmadi, muqovasi bo'yicha qidiryapman..");
    }
    return {
      frames: res.frames,
      text: [res.text, extraText].filter(Boolean).join('\n'),
      getAudio: res.getAudio,
    };
  };
}

function tooBig(ctx, file) {
  if (file.file_size && file.file_size > MAX_FILE_BYTES) {
    ctx.reply(
      "📦 Fayl juda katta (Telegram botlar 20 MB gacha qabul qiladi).\n" +
        'Qisqa parcha (10–60 s), skrinshot yoki video havolasini yuboring.',
    );
    return true;
  }
  return false;
}

// ---------- Buyruqlar ----------
const WELCOME =
  '🎬 <b>Kino Izlovchi</b>ga xush kelibsiz!\n\n' +
  "Menga yuboring — qaysi kino ekanini aytaman:\n" +
  '🔗 Instagram, YouTube yoki TikTok video <b>havolasi</b>\n' +
  '📹 Kinodan <b>video parcha</b>\n' +
  '🖼 Kinodan <b>skrinshot</b>\n' +
  "✍️ yoki sahnani so'z bilan tasvirlang\n\n" +
  "Tasvirdan topa olmasam, videoning <b>ovozini subtitrga</b> aylantirib, dialog bo'yicha qidiraman.\n\n" +
  "Kino nomini 🇺🇿 o'zbek, 🇷🇺 rus va 🇬🇧 ingliz tillarida beraman va har bir tilda uni " +
  "<b>qonuniy</b> ravishda (iloji bo'lsa <b>bepul</b>) qayerda ko'rish mumkinligini ko'rsataman.\n\n" +
  "<i>Hech qanday kanalga a'zo bo'lish shart emas.</i>";

bot.start((ctx) => ctx.reply(WELCOME, { parse_mode: 'HTML' }));
bot.help((ctx) => ctx.reply(WELCOME, { parse_mode: 'HTML' }));

// ---------- Kontent turlari ----------
for (const type of ['video', 'video_note', 'animation']) {
  bot.on(type, (ctx) => {
    const v = ctx.message[type];
    if (tooBig(ctx, v)) return;
    return handleSearch(ctx, videoInput(ctx, v, v.duration));
  });
}

bot.on('document', (ctx) => {
  const d = ctx.message.document;
  const mime = d.mime_type || '';
  if (!mime.startsWith('video/') && !mime.startsWith('image/')) {
    return ctx.reply('Iltimos, video, rasm, havola yoki matn yuboring.');
  }
  if (tooBig(ctx, d)) return;
  return handleSearch(ctx, mime.startsWith('video/') ? videoInput(ctx, d, 0) : imageInput(ctx, d.file_id));
});

bot.on('photo', (ctx) => handleSearch(ctx, imageInput(ctx, ctx.message.photo.at(-1).file_id)));

bot.on('text', (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;
  const link = findVideoLink(text);
  if (link) {
    const rest = text.replace(link, '').trim();
    return handleSearch(ctx, linkInput(link, rest), '📥 Havolani ochyapman..');
  }
  if (/https?:\/\//i.test(text)) {
    return ctx.reply(
      "Bu havolani qo'llab-quvvatlamayman. Instagram, YouTube yoki TikTok havolasini, yoki videoning o'zini yuboring.",
    );
  }
  if (text.length < 3) return ctx.reply('Biroz batafsilroq yozing yoki kinodan parcha yuboring 🎬');
  return handleSearch(ctx, async () => ({ text }));
});

// ---------- Til tugmalari: qayerda ko'rish ----------
bot.action(/^w:(uz|ru|en):([a-z.]*)$/, async (ctx) => {
  const [, lang, keyStr] = ctx.match;
  const msg = ctx.callbackQuery.message;
  const card = parseCard(msg?.caption ?? msg?.text ?? '');
  if (!card) {
    return ctx.answerCbQuery("Ma'lumot topilmadi — parchani qayta yuboring.", { show_alert: true });
  }
  await ctx.answerCbQuery();

  const { flag, name } = LANG[lang];
  const title = card[lang];
  const platforms = pickPlatforms(lang, keyStr.split('.').filter(Boolean));

  const lines = [
    `${flag} <b>${esc(title)}</b>${card.year ? ` (${card.year})` : ''} — ${name} tilida qonuniy ko'rish:`,
    '',
    "Pastdagi tugmalar rasmiy platformalarda shu kinoni qidiradi.",
  ];
  if (platforms.some((p) => p.suggested)) lines.push("⭐ — sun'iy intellekt fikricha shu yerda bo'lishi ehtimoli yuqori");
  if (platforms.some((p) => p.free)) lines.push("🆓 — bepul (reklama bilan) ko'rish imkoni bor platforma");
  if (lang === 'uz') lines.push('', "ℹ️ Rasmiy o'zbekcha dublyaj hamma kinoda bo'lavermaydi.");
  lines.push('', "🔒 Faqat qonuniy manbalar. To'liq kinoni fayl qilib yubormayman — bu mualliflik huquqini buzadi.");

  const rows = platforms.map((p) => [
    Markup.button.url(`${p.suggested ? '⭐ ' : ''}${p.free ? '🆓 ' : ''}${p.name}`, p.url(card)),
  ]);
  await ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_parameters: msg ? { message_id: msg.message_id, allow_sending_without_reply: true } : undefined,
    ...Markup.inlineKeyboard(rows),
  });
});

// Eski versiyadagi tugmalar
bot.on('callback_query', (ctx) =>
  ctx.answerCbQuery("Bu tugma eskirgan — parchani qayta yuboring.", { show_alert: true }).catch(() => {}),
);

bot.catch((err, ctx) => console.error(`Update ${ctx.updateType} xatosi:`, err));

// ---------- Ishga tushirish ----------
async function startWebhook() {
  const secret = crypto.createHash('sha256').update(config.botToken).digest('hex').slice(0, 32);
  const hookPath = `/tg/${secret.slice(0, 16)}`;
  const seen = new Set();

  http
    .createServer((req, res) => {
      if (req.method === 'POST' && req.url === hookPath) {
        if (req.headers['x-telegram-bot-api-secret-token'] !== secret) {
          res.writeHead(401).end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          // Telegram'ga darhol javob beramiz — uzoq qidiruv paytida qayta yuborilmasin
          res.writeHead(200).end('ok');
          let update;
          try {
            update = JSON.parse(body);
          } catch {
            return;
          }
          if (seen.has(update.update_id)) return;
          seen.add(update.update_id);
          if (seen.size > 2000) seen.delete(seen.values().next().value);
          bot.handleUpdate(update).catch((err) => console.error('handleUpdate:', err));
        });
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Kino Izlovchi ishlayapti ✅');
    })
    .listen(config.port, () => console.log(`🌐 Webhook rejimi: port ${config.port}`));

  bot.botInfo ??= await bot.telegram.getMe();
  const url = config.webhookDomain.replace(/\/$/, '') + hookPath;
  await bot.telegram.setWebhook(url, {
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  });
  console.log(`✅ Webhook o'rnatildi: ${config.webhookDomain} (@${bot.botInfo.username})`);
}

async function main() {
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Botni boshlash' },
    { command: 'help', description: 'Qanday foydalaniladi' },
  ]);
  if (!aiReady()) console.warn("⚠️ GEMINI_API_KEY yo'q — bot javob beradi, lekin kinoni aniqlay olmaydi.");
  else console.log(`🧠 Gemini modellari: ${config.models.join(' → ')}`);
  if (!tmdbEnabled()) console.warn("ℹ️ TMDB_API_KEY yo'q — poster va reyting ko'rsatilmaydi.");

  if (config.webhookDomain) {
    await startWebhook();
  } else {
    await bot.telegram.deleteWebhook();
    bot.launch();
    console.log('🤖 Kino Izlovchi ishga tushdi (polling).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const stop = (sig) => {
  try {
    bot.stop(sig);
  } catch {}
  process.exit(0);
};
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
