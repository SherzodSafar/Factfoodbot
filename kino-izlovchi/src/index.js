import http from 'node:http';
import crypto from 'node:crypto';
import { Telegraf, Markup } from 'telegraf';
import { config } from './config.js';
import { download, extractFrames } from './frames.js';
import { identifyMovie, translateToUzbek } from './identify.js';
import { findDetails, getDetails, getWatchProviders, tmdbEnabled } from './tmdb.js';

const bot = new Telegraf(config.botToken, { handlerTimeout: 180_000 });

const MAX_FILE_BYTES = 20 * 1024 * 1024; // Bot API getFile chegarasi

// ---------- Yordamchi holatlar (xotirada) ----------
const busy = new Set(); // hozir qidirilayotgan foydalanuvchilar
const usage = new Map(); // userId -> { day, count }
const cache = new Map(); // TMDB'siz rejim uchun: key -> natija

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

function remember(value) {
  const key = crypto.randomBytes(6).toString('base64url');
  cache.set(key, value);
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return key;
}

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const searchLinks = (title, year) => {
  const q = encodeURIComponent(`${title}${year ? ' ' + year : ''}`);
  const uz = encodeURIComponent(`${title} uzbek tilida`);
  return {
    trailer: `https://www.youtube.com/results?search_query=${q}+trailer`,
    uzbek: `https://www.youtube.com/results?search_query=${uz}`,
    google: `https://www.google.com/search?q=${q}+смотреть+онлайн`,
  };
};

// ---------- Kartochka ----------
function buildCard(guess, details) {
  const isTv = (details?.kind || guess.kind) === 'tv';
  const title = details?.title || guess.title_ru || guess.title_original;
  const original = details?.originalTitle || guess.title_original;
  const year = details?.year || guess.year;
  const genres = details?.genres?.length ? details.genres : guess.genres;

  const lines = [`✅ ${isTv ? 'Serial' : 'Kino'}`, `<b>${esc(title)}</b>`];
  if (original && original !== title) lines.push(`Asl nomi: ${esc(original)}`);
  const meta = [genres?.slice(0, 4).join(', '), year].filter(Boolean).join(' • ');
  if (meta) lines.push(`<i>${esc(meta)}</i>`);
  if (isTv && guess.season) {
    lines.push(`📺 ${guess.season}-fasl${guess.episode ? `, ${guess.episode}-qism` : ''} (taxminan)`);
  }
  if (details?.rating) lines.push(`⭐ ${details.rating} • 🗳 ${details.votes.toLocaleString('ru-RU')} ovoz`);

  const overview = details?.overview || guess.overview_uz;
  if (overview) lines.push('', esc(cut(overview, 500)));
  if (guess.confidence < 0.7) lines.push('', '🤔 <i>Aniqligi o\'rtacha — tekshirib ko\'ring.</i>');
  return lines.join('\n');
}

function buildKeyboard(guess, details) {
  const ref = details ? `${details.kind === 'tv' ? 't' : 'm'}${details.id}` : `c${remember(guess)}`;
  return Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Qayerda ko'rish", `w:${ref}`)],
    [Markup.button.callback("🇺🇿 O'zbekchaga o'girish", `u:${ref}`)],
  ]);
}

async function resolveRef(ref) {
  if (ref.startsWith('c')) {
    const guess = cache.get(ref.slice(1));
    return guess ? { guess, details: null } : null;
  }
  const kind = ref[0] === 't' ? 'tv' : 'movie';
  const details = await getDetails(kind, Number(ref.slice(1)));
  return { guess: null, details };
}

// ---------- Asosiy oqim ----------
async function handleSearch(ctx, getInput) {
  const userId = ctx.from.id;
  if (busy.has(userId)) {
    return ctx.reply('⏳ Oldingi parcha hali qidirilyapti, biroz kuting.');
  }
  if (!underLimit(userId)) {
    return ctx.reply(`Bugungi limit (${config.dailyLimit} ta) tugadi. Ertaga yana urinib ko'ring 🙂`);
  }

  busy.add(userId);
  const status = await ctx.reply('🔎 Qidiryapman..', {
    reply_parameters: { message_id: ctx.message.message_id },
  });
  const typing = setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 4000);

  try {
    const input = await getInput();
    const guess = await identifyMovie(input);
    if (!guess) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, status.message_id, undefined,
        "😕 Afsus, bu parchadan kinoni aniqlay olmadim.\n\n" +
          "Boshqa — yuzlar yoki muhim sahna ko'rinadigan parcha yuboring, " +
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

    const caption = buildCard(guess, details);
    const keyboard = buildKeyboard(guess, details);
    await ctx.telegram.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});

    const replyOpts = {
      parse_mode: 'HTML',
      reply_parameters: { message_id: ctx.message.message_id },
      ...keyboard,
    };
    if (details?.poster) {
      await ctx.replyWithPhoto(details.poster, { caption, ...replyOpts });
    } else {
      await ctx.reply(caption, replyOpts);
    }
  } catch (err) {
    console.error('Qidiruv xatosi:', err);
    await ctx.telegram
      .editMessageText(ctx.chat.id, status.message_id, undefined,
        "⚠️ Xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.")
      .catch(() => {});
  } finally {
    clearInterval(typing);
    busy.delete(userId);
  }
}

function videoInput(ctx, file, duration) {
  return async () => {
    const link = await ctx.telegram.getFileLink(file.file_id);
    const buffer = await download(link.href);
    const frames = await extractFrames(buffer, duration);
    if (!frames.length) throw new Error("Videodan kadr ajratib bo'lmadi");
    return { frames, text: ctx.message.caption || '' };
  };
}

function tooBig(ctx, file) {
  if (file.file_size && file.file_size > MAX_FILE_BYTES) {
    ctx.reply('📦 Fayl juda katta. Iltimos, 20 MB dan kichik qisqa parcha yuboring (10–60 soniya yetarli).');
    return true;
  }
  return false;
}

// ---------- Buyruqlar ----------
const WELCOME =
  "🎬 <b>Kino Izlovchi</b>ga xush kelibsiz!\n\n" +
  "Kinodan yoki serialdan <b>parcha tashlang — nomini aytaman.</b>\n\n" +
  "📹 Video, 🖼 skrinshot yoki ✍️ sahna tavsifini yuborishingiz mumkin.\n" +
  "⚡️ Odatda yarim daqiqada topib beraman.\n\n" +
  "<i>Hech qanday kanalga a'zo bo'lish shart emas.</i>";

bot.start((ctx) => ctx.reply(WELCOME, { parse_mode: 'HTML' }));
bot.help((ctx) => ctx.reply(WELCOME, { parse_mode: 'HTML' }));

// ---------- Kontent turlari ----------
bot.on('video', (ctx) => {
  const v = ctx.message.video;
  if (tooBig(ctx, v)) return;
  return handleSearch(ctx, videoInput(ctx, v, v.duration));
});

bot.on('video_note', (ctx) => {
  const v = ctx.message.video_note;
  if (tooBig(ctx, v)) return;
  return handleSearch(ctx, videoInput(ctx, v, v.duration));
});

bot.on('animation', (ctx) => {
  const v = ctx.message.animation;
  if (tooBig(ctx, v)) return;
  return handleSearch(ctx, videoInput(ctx, v, v.duration));
});

bot.on('document', (ctx) => {
  const d = ctx.message.document;
  const mime = d.mime_type || '';
  if (mime.startsWith('video/')) {
    if (tooBig(ctx, d)) return;
    return handleSearch(ctx, videoInput(ctx, d, 0));
  }
  if (mime.startsWith('image/')) {
    if (tooBig(ctx, d)) return;
    return handleSearch(ctx, async () => {
      const link = await ctx.telegram.getFileLink(d.file_id);
      const buf = await download(link.href);
      return { frames: [buf.toString('base64')], text: ctx.message.caption || '' };
    });
  }
  return ctx.reply('Iltimos, video, rasm yoki matn yuboring.');
});

bot.on('photo', (ctx) => {
  const photo = ctx.message.photo.at(-1); // eng katta o'lcham
  return handleSearch(ctx, async () => {
    const link = await ctx.telegram.getFileLink(photo.file_id);
    const buf = await download(link.href);
    return { frames: [buf.toString('base64')], text: ctx.message.caption || '' };
  });
});

bot.on('text', (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;
  if (text.length < 3) return ctx.reply("Biroz batafsilroq yozing yoki kinodan parcha yuboring 🎬");
  return handleSearch(ctx, async () => ({ text }));
});

// ---------- Tugmalar ----------
bot.action(/^w:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const r = await resolveRef(ctx.match[1]);
    if (!r) return ctx.reply("Ma'lumot eskirgan — parchani qayta yuboring.");
    const { guess, details } = r;
    const title = details?.originalTitle || guess.title_original;
    const year = details?.year || guess.year;
    const links = searchLinks(title, year);

    const lines = [`▶️ <b>${esc(details?.title || guess.title_ru || title)}</b> — qayerda ko'rish mumkin:`];
    const providers = details ? await getWatchProviders(details.kind, details.id).catch(() => null) : null;
    if (providers) {
      lines.push('', `📺 Rasmiy platformalar (${providers.region}):`);
      for (const p of providers.providers) lines.push(`• ${esc(p)}`);
    } else {
      lines.push('', "Rasmiy platformalar ro'yxati topilmadi — quyidagi havolalardan qidirib ko'ring.");
    }

    const buttons = [[Markup.button.url('🎞 Treyler (YouTube)', links.trailer)]];
    if (providers?.link) buttons.push([Markup.button.url("📺 Barcha platformalar", providers.link)]);
    if (details?.imdbId) buttons.push([Markup.button.url('IMDb', `https://www.imdb.com/title/${details.imdbId}/`)]);
    buttons.push([Markup.button.url('🔍 Google orqali qidirish', links.google)]);

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  } catch (err) {
    console.error('Qayerda ko\'rish xatosi:', err);
    await ctx.reply("⚠️ Ma'lumot olib bo'lmadi, keyinroq urinib ko'ring.");
  }
});

bot.action(/^u:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery("O'girilmoqda…");
  try {
    const r = await resolveRef(ctx.match[1]);
    if (!r) return ctx.reply("Ma'lumot eskirgan — parchani qayta yuboring.");
    const { guess, details } = r;
    const title = details?.originalTitle || guess.title_original;
    const links = searchLinks(title);

    let overviewUz = guess?.overview_uz || '';
    if (details?.overview) overviewUz = (await translateToUzbek(details.overview)) || '';

    const lines = [`🇺🇿 <b>${esc(details?.title || guess.title_ru || title)}</b>`];
    if (overviewUz) lines.push('', esc(cut(overviewUz, 3000)));
    else lines.push('', "Bu kino uchun tavsif topilmadi.");
    lines.push('', "🎧 O'zbek tilidagi tarjimasini qidirish uchun pastdagi tugmani bosing.");

    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.url("🔎 O'zbek tilida qidirish", links.uzbek)]]),
    });
  } catch (err) {
    console.error('Tarjima xatosi:', err);
    await ctx.reply("⚠️ Tarjima qilib bo'lmadi, keyinroq urinib ko'ring.");
  }
});

bot.catch((err, ctx) => console.error(`Update ${ctx.updateType} xatosi:`, err));

// ---------- Ishga tushirish ----------
async function main() {
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Botni boshlash' },
    { command: 'help', description: 'Qanday foydalaniladi' },
  ]);
  if (!tmdbEnabled()) {
    console.warn("ℹ️ TMDB_API_KEY yo'q — poster, reyting va platformalar ko'rsatilmaydi.");
  }

  if (config.webhookDomain) {
    const secretPath = `/tg/${crypto.createHash('sha256').update(config.botToken).digest('hex').slice(0, 24)}`;
    const handler = await bot.createWebhook({ domain: config.webhookDomain, path: secretPath });
    http
      .createServer((req, res) => {
        if (req.url === secretPath) return handler(req, res);
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('Kino Izlovchi ishlayapti ✅');
      })
      .listen(config.port, () => console.log(`🌐 Webhook rejimi: port ${config.port}`));
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

const stop = (sig) => { try { bot.stop(sig); } catch {} process.exit(0); };
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
