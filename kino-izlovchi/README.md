# 🎬 Kino Izlovchi — "Parcha tashlang — nomini aytaman"

Telegram bot: foydalanuvchi **Instagram / YouTube / TikTok havolasi**, kinodan
**video parcha**, **skrinshot** yoki **sahna tavsifini** yuboradi — bot kino nomini
🇺🇿 o'zbek, 🇷🇺 rus va 🇬🇧 ingliz tillarida topib beradi va har bir tilda uni
**qonuniy** ravishda (iloji bo'lsa **bepul**) qayerda ko'rish mumkinligini ko'rsatadi.

## Qanday ishlaydi

1. **Video olinadi** — havola bo'lsa `yt-dlp` bilan (bloklansa — muqova rasmi va izoh),
   Telegram'ga yuklangan bo'lsa to'g'ridan-to'g'ri. Videodan 6 ta kadr olinadi.
2. **Tahlil (Gemini)** — kadrlar va izohdan aktyorlar, kadrdagi yozuvlar, syujet kalit so'zlari
   va qidiruv so'rovlari ajratiladi.
3. **Qidiruv (Wikipedia / Wikidata, kalitsiz)** — so'rovlar bo'yicha maqolalar va tanilgan
   aktyorlarning eng so'nggi filmlari olinadi. Shu tufayli sun'iy intellekt bilimidan keyin
   chiqqan (2025–2026) kinolar ham topiladi.
4. **Tanlash (Gemini)** — dalillarga eng mos nomzod tanlanadi; nomlari uch tilda, yili,
   janri, qisqa mazmuni va posteri olinadi.
5. **Ovoz bo'yicha (zaxira yo'l)** — aniq topilmasa, videoning ovozi **subtitrga** aylantirilib,
   2–4-bosqichlar dialog bilan qaytariladi.
6. **🇺🇿 / 🇷🇺 / 🇬🇧 tugmalari** — shu tildagi rasmiy manbalar: Wikidata'dagi aniq sahifalar
   (Кинопоиск, Netflix, Apple TV, Disney+, Prime Video va h.k.), TMDB'ning
   "qayerda ko'rish" sahifasi (bepul / obuna / ijara), IMDb; o'zbekcha uchun — YouTube qidiruvi.

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
| `src/pipeline.js` | Aniqlash jarayoni: tahlil → Wikipedia qidiruvi → tanlash → (ovoz) |
| `src/identify.js` | Gemini so'rovlari: tahlil, tanlash, audioni subtitrga aylantirish |
| `src/wiki.js` | Wikipedia/Wikidata: qidiruv, aktyor filmlari, rasmiy havolalar |
| `src/card.js` | Natija kartochkasi va uni qayta o'qish |
| `src/platforms.js` | Har bir til uchun "qayerda ko'rish" havolalari |
| `src/diag.js` | `DIAG=1` bo'lsa — ishga tushganda bir martalik tekshiruv |
| `src/links.js` | Instagram/YouTube/TikTok havolalaridan video olish |
| `src/frames.js` | ffmpeg: kadrlar, audio, rasmni JPEG'ga o'girish |
| `src/tmdb.js` | Ixtiyoriy: poster va reyting |

## Cheklovlar

- Render kabi bulut serverlaridan YouTube va Instagram ba'zan yuklab olishni bloklaydi —
  shunda bot muqova va sarlavha bo'yicha qidiradi (audio bo'yicha qidirib bo'lmaydi).
- Telegram'ga yuklanadigan fayl **20 MB gacha** — qisqa parcha (10–60 s) yetarli.
- Platforma havolalari Wikidata'dan olinadi: yangi kinolarda ular hali bo'lmasligi mumkin
  (shunda Кинопоиск/JustWatch qidiruvi beriladi). Rasmiy o'zbekcha platformalar bazasi yo'q.
