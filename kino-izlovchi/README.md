# 🎬 Kino Izlovchi — "Parcha tashlang — nomini aytaman"

Telegram bot: foydalanuvchi **Instagram / YouTube / TikTok havolasi**, kinodan
**video parcha**, **skrinshot** yoki **sahna tavsifini** yuboradi — bot kino nomini
topib, uni **qonuniy** ravishda (iloji bo'lsa **bepul**) qayerda ko'rish mumkinligini
havolalari bilan beradi.

- 🔗 Havoladagi video yt-dlp bilan yuklanadi (bloklansa — muqova rasmi va sarlavha olinadi)
- 🔎 Videodan 6 ta kadr ajratiladi va Claude (vision) kinoni aniqlaydi
- 🎞 TMDB'dan poster, asl nomi, janrlar, yil, reyting va tavsif olinadi
- ▶️ **Qayerda ko'rish** — Claude internetdan qonuniy manbalarni qidiradi (avval bepullari: Tubi, Pluto TV, rasmiy YouTube va h.k.), TMDB platformalari, treyler, IMDb
- 🚫 To'liq kinoni fayl qilib yubormaydi va pirat saytlarni ko'rsatmaydi (mualliflik huquqi)
- 🇺🇿 **O'zbekchaga o'girish** — tavsif o'zbekchaga tarjima qilinadi + o'zbek tilidagi versiyani qidirish
- 🚫 Majburiy kanalga a'zolik yo'q
- 🛡 Har bir foydalanuvchi uchun navbat (bir vaqtda 1 ta) va kunlik limit

## Ishga tushirish (kompyuterda)

```bash
cd kino-izlovchi
npm install
cp .env.example .env   # BOT_TOKEN, ANTHROPIC_API_KEY, TMDB_API_KEY ni to'ldiring
npm start
```

Node.js 20+ kerak. `ffmpeg` alohida o'rnatilishi shart emas — `ffmpeg-static` paketi bilan keladi.

## Bulutga joylash (Render, Docker)

1. Render → **New → Web Service** → shu ombor, Runtime: **Docker**,
   Dockerfile: `kino-izlovchi/Dockerfile`, Docker context: `kino-izlovchi`
2. Environment: `BOT_TOKEN`, `ANTHROPIC_API_KEY`, `TMDB_API_KEY` (ixtiyoriy).
   Webhook manzili Render'ning `RENDER_EXTERNAL_URL` o'zgaruvchisidan avtomatik olinadi.
3. Deploy — bot webhook'ni o'zi o'rnatadi.

Instagram ko'pincha login talab qiladi. Kerak bo'lsa, `YTDLP_COOKIES` o'zgaruvchisiga
cookies.txt (Netscape formati) matnini qo'ying — **alohida, yangi ochilgan** akkauntdan.

## Tuzilishi

| Fayl | Vazifasi |
|------|----------|
| `src/index.js` | Bot, xabarlar va tugmalar, polling/webhook |
| `src/frames.js` | Faylni yuklash, ffmpeg bilan kadr ajratish |
| `src/links.js` | Instagram/YouTube/TikTok havolalaridan video olish |
| `src/identify.js` | Claude orqali kinoni aniqlash va tarjima |
| `src/tmdb.js` | TMDB: qidiruv, tafsilotlar, platformalar |

## Cheklovlar

- Render kabi bulut serverlaridan YouTube va Instagram ba'zan yuklab olishni bloklaydi — shunda bot muqova va sarlavha bo'yicha qidiradi.
- Telegram Bot API orqali yuklab olinadigan fayl hajmi **20 MB gacha** — qisqa parcha (10–60 s) yetarli.
- Aniqlik kadrlarga bog'liq: aktyorlar yuzi yoki taniqli sahna ko'rinsa yaxshi topadi.
- Ovoz (dialog) tahlil qilinmaydi — faqat tasvir va foydalanuvchi izohi.
