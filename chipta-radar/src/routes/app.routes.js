/**
 * Android ilova API: ulash (bir martalik kod) va chipta topildi hodisalari.
 */
import { Router } from 'express';
import prisma, { isDatabaseReady } from '../database/connection.js';
import { rateLimit } from '../middlewares/auth.middleware.js';
import { pairDevice, deviceUserId } from '../services/appDevices.js';
import { activeVoice, voiceFile } from '../services/appVoices.js';
import { translate, saveUserLang, normLang } from '../i18n/index.js';

const tokenOf = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

const router = Router();
const pairLimit = rateLimit({ limit: 10, windowMs: 10 * 60_000, keyFn: (req) => `pair:${req.ip}`, message: 'Juda ko\'p urinish' });
const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

router.post('/pair', pairLimit, async (req, res) => {
  if (!isDatabaseReady()) return res.status(503).json({ ok: false, error: 'Server tayyor emas' });
  const paired = await pairDevice(req.body?.code).catch(() => null);
  if (!paired) return res.status(400).json({ ok: false, error: 'Kod noto\'g\'ri yoki eskirgan. Botdan yangi kod oling.' });
  const user = await prisma.user.findUnique({ where: { id: paired.userId }, select: { firstName: true, lang: true } });
  res.json({ ok: true, token: paired.token, name: user?.firstName || '', lang: normLang(user?.lang), now: Date.now() });
});

/** since (ms) dan keyingi "chipta topildi" xabarlari */
router.get('/events', async (req, res) => {
  const userId = await deviceUserId(tokenOf(req));
  if (!userId) return res.status(401).json({ ok: false, error: 'unpaired' });
  const since = new Date(Number(req.query.since) || Date.now() - 10 * 60_000);
  const rows = await prisma.notification.findMany({
    where: { userId, kind: 'found', createdAt: { gt: since } },
    orderBy: { createdAt: 'asc' },
    take: 5,
    include: { watch: { select: { fromName: true, toName: true, date: true, fromCode: true, toCode: true } } },
  });
  const voice = await activeVoice().catch(() => null);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lang: true } });
  const lang = normLang(user?.lang); // bot tili — ilova ham shu tilga o'tadi
  res.json({
    ok: true,
    now: Date.now(),
    lang,
    voice: voice ? { id: voice.id } : null, // null — ilovadagi standart ovoz
    events: rows.map((row) => ({
      id: row.id,
      at: row.createdAt.getTime(),
      title: translate(row.watch ? `${row.watch.fromName} → ${row.watch.toName}, ${row.watch.date}` : 'Chipta paydo bo\'ldi', lang),
      text: strip(translate(row.text || '', lang, { html: true })).slice(0, 600),
      intl: Boolean(row.watch && (row.watch.fromCode.startsWith('27') || row.watch.toCode.startsWith('27'))),
    })),
  });
});

/** Ilovada til o'zgardi — botga ham qo'llanadi */
router.post('/lang', async (req, res) => {
  const userId = await deviceUserId(tokenOf(req));
  if (!userId) return res.status(401).json({ ok: false, error: 'unpaired' });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
  if (!user) return res.status(404).json({ ok: false, error: 'user' });
  const lang = await saveUserLang(user.telegramId, normLang(req.body?.lang));
  res.json({ ok: true, lang });
});

/** Faol (yoki berilgan) ovozli xabar fayli */
router.get('/voice/:id', async (req, res) => {
  if (!(await deviceUserId(tokenOf(req)))) return res.status(401).json({ ok: false, error: 'unpaired' });
  try {
    const file = await voiceFile(req.params.id);
    if (!file) return res.status(404).json({ ok: false, error: 'Ovoz topilmadi' });
    res.type(file.type).send(file.buffer);
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

export default router;
