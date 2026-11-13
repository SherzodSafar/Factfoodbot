# 🎬 Kino Izlovchi — "Parcha tashlang — nomini aytaman"

Telegram bot: foydalanuvchi **Instagram / YouTube / TikTok havolasi**, kinodan
**video parcha**, **skrinshot** yoki **sahna tavsifini** yuboradi — bot kino nomini
🇺🇿 o'zbek, 🇷🇺 rus va 🇬🇧 ingliz tillarida topib beradi va har bir tilda uni
**qonuniy** ravishda (iloji bo'lsa **bepul**) qayerda ko'rish mumkinligini ko'rsatadi.

## Qanday ishlaydi

1. **Video olinadi** — havola bo'lsa `yt-dlp` bilan (bloklansa — muqova rasmi va sarlavha),
   Telegram'ga yuklangan bo'lsa to'g'ridan-to'g'ri.
2. **Kadrlar bo'yicha** — videodan 6 ta kadr + video sarlavhasi/tavsifi Gemini'ga yuboriladi.
3. **Ovoz bo'yicha (zaxira yo'l)** — tasvirdan aniq topilmasa, videoning ovozi ajratiladi,
   Gemini uni **subtitrga** aylantiradi va dialog bo'yicha kino qayta qidiriladi.
4. **Kartochka** — nomi uch tilda, yili, janri, qisqa mazmuni (o'zbekcha) va
   🇺🇿 / 🇷🇺 / 🇬🇧 tugmalari.
5. **Til tugmasi** — shu tildagi rasmiy platformalar (ITV.uz, Splay, Allplay, Кинопоиск,
   Иви, Okko, JustWatch, Tubi, Pluto TV, Netflix va h.k.) bo'yicha qidiruv havolalari.
   ⭐ — sun'iy intellekt fikricha shu yerda bo'lishi ehtimoli yuqori, 🆓 — bepul (reklama bilan).

🚫 Bot to'liq kinoni fayl qilib yubormaydi va pirat saytlarni ko'rsatmaydi (mualliflik huquqi).

## Sun'iy intellekt: Google Gemini (bepul)

Kalit: https://aistudio.google.com/api-keys → `GEMINI_API_KEY`.
Bepul tarifda modellar ba'zan band bo'ladi (503) yoki daqiqalik limit tugaydi (429) —
bot bunda kutmasdan navbatdagi modelga o'tadi (`GEMINI_MODELS` bilan o'zgartirish mumkin).

## Ishga tushirish (kompyuterda)

```bash
cd kino-izlovchi
npm install
cp .env.example .env   # BOT_TOKEN va GEMINI_API_KEY ni to'ldiring
npm start
```

Node.js 20+ va `yt-dlp` kerak (`ffmpeg` — `ffmpeg-static` paketi bilan keladi).

## Bulutga joylash (Render, Docker)

1. Render → **New → Web Service** → shu ombor, Runtime: **Docker**,
   Dockerfile: `kino-izlovchi/Dockerfile`, Docker context: `kino-izlovchi`
2. Environment: `BOT_TOKEN`, `GEMINI_API_KEY`, ixtiyoriy `TMDB_API_KEY`.
   Webhook manzili Render'ning `RENDER_EXTERNAL_URL` o'zgaruvchisidan avtomatik olinadi.
3. Deploy — bot webhook'ni o'zi o'rnatadi.

Instagram ko'pincha login talab qiladi. Kerak bo'lsa, `YTDLP_COOKIES` o'zgaruvchisiga
cookies.txt (Netscape formati) matnini qo'ying — **alohida, yangi ochilgan** akkauntdan.

## Tuzilishi

| Fayl | Vazifasi |
|------|----------|
| `src/index.js` | Bot, xabarlar, til tugmalari, polling/webhook |
| `src/ai.js` | Gemini mijozi: modellar navbati, band/limit bo'lsa keyingisiga o'tish |
| `src/identify.js` | Kinoni aniqlash (kadr / matn / subtitr) va audioni subtitrga aylantirish |
| `src/card.js` | Natija kartochkasi va uni qayta o'qish |
| `src/platforms.js` | Rasmiy platformalar ro'yxati (uz / ru / en) va havolalar |
| `src/links.js` | Instagram/YouTube/TikTok havolalaridan video olish |
| `src/frames.js` | ffmpeg: kadrlar, audio, rasmni JPEG'ga o'girish |
| `src/tmdb.js` | Ixtiyoriy: poster va reyting |

## Cheklovlar

- Render kabi bulut serverlaridan YouTube va Instagram ba'zan yuklab olishni bloklaydi —
  shunda bot muqova va sarlavha bo'yicha qidiradi (audio bo'yicha qidirib bo'lmaydi).
- Telegram'ga yuklanadigan fayl **20 MB gacha** — qisqa parcha (10–60 s) yetarli.
- "Qayerda ko'rish" havolalari — rasmiy platformalardagi qidiruv; kino u yerda borligi kafolatlanmaydi.
