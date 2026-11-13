import http from 'node:http';
import crypto from 'node:crypto';
import { Telegraf, Markup } from 'telegraf';
import { aiReady, config } from './config.js';
import { download, extractFrames, toJpeg } from './frames.js';
import { findWhereToWatch, identifyMovie, translateToUzbek } from './identify.js';
import { findVideoLink, fromLink, platformName } from './links.js';
import { findDetails, getDetails, getWatchProviders, tmdbEnabled } from './tmdb.js';

const bot = new Telegraf(config.botToken, { handlerTimeout: 300_000 });

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

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const searchLinks = (title, year) => {
  const q = encodeURIComponent(`${title}${year ? ' ' + year : ''}`);
  const uz = encodeURIComponent(`${title} uzbek tilida`);
  return {
    trailer: `https://www.youtube.com/results?search_query=${q}+trailer`,
    uzbek: `https://www.youtube.com/results?search_query=${uz}`,
    google: `https://www.google.com/search?q=${q}+watch+online+legally`,
  };
};

const NOT_READY =
  "🛠 Bot hozircha sozlanmoqda: kinoni aniqlovchi sun'iy intellekt kaliti hali qo'shilmagan.\n" +
  "Tez orada ishga tushadi — keyinroq qayta urinib ko'ring.";

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
  if (guess.confidence < 0.7) lines.push('', "🤔 <i>Aniqligi o'rtacha — tekshirib ko'ring.</i>");
  return lines.join('\n');
}

function buildKeyboard(guess, details) {
  const ref = details ? `${details.kind === 'tv' ? 't' : 'm'}${details.id}` : `c${remember(guess)}`;
  return Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Qayerda ko'rish (bepul bo'lsa)", `w:${ref}`)],
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
/**
 * @param getInput async (setStatus) => ({ frames, text })
 */
async function handleSearch(ctx, getInput, firstStatus = '🔎 Qidiryapman..') {
  const userId = ctx.from.id;
  if (!aiReady()) return ctx.reply(NOT_READY);
  if (busy.has(userId)) return ctx.reply('⏳ Oldingi so‘rov hali qidirilyapti, biroz kuting.');
  if (!underLimit(userId)) {
    return ctx.reply(`Bugungi limit (${config.dailyLimit} ta) tugadi. Ertaga yana urinib ko'ring 🙂`);
  }

  busy.add(userId);
  const status = await ctx.reply(firstStatus, { reply_parameters: { message_id: ctx.message.message_id } });
  const setStatus = (text) =>
    ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, text).catch(() => {});
  const typing = setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 4000);

  try {
    const input = await getInput(setStatus);
    if (!input.frames?.length && !input.text) {
      await setStatus("😕 Videoni olib bo'lmadi. Videoning o'zini yoki skrinshotini yuboring.");
      return;
    }
    await setStatus('🔎 Qidiryapman..');
    const guess = await identifyMovie(input);
    if (!guess) {
      await setStatus(
        "😕 Afsus, bundan kinoni aniqlay olmadim.\n\n" +
          "Aktyorlar yuzi yoki muhim sahna ko'rinadigan boshqa parcha/skrinshot yuboring, " +
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
    if (details?.poster) await ctx.replyWithPhoto(details.poster, { caption, ...replyOpts });
    else await ctx.reply(caption, replyOpts);
  } catch (err) {
    console.error('Qidiruv xatosi:', err);
    await setStatus("⚠️ Xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.");
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
      await setStatus('📥 Videoning o‘zini olib bo‘lmadi, muqovasi bo‘yicha qidiryapman..');
    }
    return { frames: res.frames, text: [res.text, extraText].filter(Boolean).join('\n') };
  };
}

function tooBig(ctx, file) {
  if (file.file_size && file.file_size > MAX_FILE_BYTES) {
    ctx.reply(
      "📦 Fayl juda katta (Telegram botlar 20 MB gacha qabul qiladi).\n" +
        "Qisqa parcha (10–60 s), skrinshot yoki video havolasini yuboring.",
    );
    return true;
  }
  return false;
}

// ---------- Buyruqlar ----------
const WELCOME =
  "🎬 <b>Kino Izlovchi</b>ga xush kelibsiz!\n\n" +
  "Menga yuboring — qaysi kino ekanini aytaman:\n" +
  "🔗 Instagram, YouTube yoki TikTok video <b>havolasi</b>\n" +
  "📹 Kinodan <b>video parcha</b>\n" +
  "🖼 Kinodan <b>skrinshot</b>\n" +
  "✍️ yoki sahnani so'z bilan tasvirlang\n\n" +
  "Topgach, kinoni <b>qonuniy</b> ravishda onlayn qayerda ko'rish mumkinligini " +
  "(iloji bo'lsa <b>bepul</b>) havolalari bilan beraman.\n\n" +
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
    return ctx.reply("Bu havolani qo'llab-quvvatlamayman. Instagram, YouTube yoki TikTok havolasini, yoki videoning o'zini yuboring.");
  }
  if (text.length < 3) return ctx.reply("Biroz batafsilroq yozing yoki kinodan parcha yuboring 🎬");
  return handleSearch(ctx, async () => ({ text }));
});

// ---------- Tugmalar ----------
bot.action(/^w:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Qidiryapman…');
  const wait = await ctx.reply("🔎 Qonuniy va bepul ko'rish joylarini qidiryapman..");
  try {
    if (!aiReady()) throw new Error('AI kaliti yo‘q');
    const r = await resolveRef(ctx.match[1]);
    if (!r) {
      await ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, undefined, "Ma'lumot eskirgan — parchani qayta yuboring.");
      return;
    }
    const { guess, details } = r;
    const info = {
      title: details?.title || guess.title_ru || guess.title_original,
      originalTitle: details?.originalTitle || guess.title_original,
      year: details?.year || guess.year,
      kind: details?.kind || guess.kind,
    };
    const links = searchLinks(info.originalTitle, info.year);

    const [providers, found] = await Promise.all([
      details ? getWatchProviders(details.kind, details.id).catch(() => null) : null,
      findWhereToWatch(info).catch((err) => {
        console.error('Veb-qidiruv xatosi:', err.message);
        return null;
      }),
    ]);

    const lines = [`▶️ ${info.title}${info.year ? ` (${info.year})` : ''} — qayerda ko'rish mumkin:`, ''];
    if (found) lines.push(found);
    else lines.push("Aniq havolalarni topa olmadim — pastdagi tugmalar orqali qidirib ko'ring.");
    if (providers) lines.push('', `📺 Rasmiy platformalar (${providers.region}): ${providers.providers.join(', ')}`);
    lines.push('', "ℹ️ Faqat qonuniy manbalar ko'rsatiladi. To'liq kinoni fayl qilib yubora olmayman — bu mualliflik huquqini buzadi.");

    const buttons = [[Markup.button.url('🎞 Treyler (YouTube)', links.trailer)]];
    if (providers?.link) buttons.push([Markup.button.url('📺 Barcha platformalar', providers.link)]);
    if (details?.imdbId) buttons.push([Markup.button.url('IMDb', `https://www.imdb.com/title/${details.imdbId}/`)]);
    buttons.push([Markup.button.url('🔍 Google orqali qidirish', links.google)]);

    await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
    await ctx.reply(cut(lines.join('\n'), 4000), {
      link_preview_options: { is_disabled: true },
      ...Markup.inlineKeyboard(buttons),
    });
  } catch (err) {
    console.error("Qayerda ko'rish xatosi:", err);
    await ctx.telegram
      .editMessageText(ctx.chat.id, wait.message_id, undefined, "⚠️ Ma'lumot olib bo'lmadi, keyinroq urinib ko'ring.")
      .catch(() => {});
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
    if (details?.overview && aiReady()) overviewUz = (await translateToUzbek(details.overview)) || '';

    const lines = [`🇺🇿 <b>${esc(details?.title || guess.title_ru || title)}</b>`];
    lines.push('', overviewUz ? esc(cut(overviewUz, 3000)) : 'Bu kino uchun tavsif topilmadi.');
    lines.push('', "🎧 O'zbek tilidagi versiyasini qidirish uchun pastdagi tugmani bosing.");

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
    drop_pending_updates: false,
  });
  console.log('✅ Webhook o‘rnatildi:', config.webhookDomain);
}

async function main() {
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Botni boshlash' },
    { command: 'help', description: 'Qanday foydalaniladi' },
  ]);
  if (!aiReady()) console.warn("⚠️ ANTHROPIC_API_KEY yo'q — bot javob beradi, lekin kinoni aniqlay olmaydi.");
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
