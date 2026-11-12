# 🎬 Kino Izlovchi — "Parcha tashlang — nomini aytaman"

Telegram bot: foydalanuvchi kino yoki serialdan **video parcha**, **skrinshot**
yoki **sahna tavsifini** yuboradi — bot kino nomini topib beradi.

- 🔎 Videodan 6 ta kadr ajratiladi va Claude (vision) kinoni aniqlaydi
- 🎞 TMDB'dan poster, asl nomi, janrlar, yil, reyting va tavsif olinadi
- ▶️ **Qayerda ko'rish** — rasmiy platformalar (JustWatch/TMDB), treyler, IMDb
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

## Bulutga joylash (Render)

1. Render → **New → Web Service** → shu ombor, **Root Directory:** `kino-izlovchi`
2. Build: `npm install`, Start: `npm start`
3. Environment: `BOT_TOKEN`, `ANTHROPIC_API_KEY`, `TMDB_API_KEY`,
   `WEBHOOK_DOMAIN=https://<xizmat-nomi>.onrender.com`
4. Deploy — bot webhook'ni o'zi o'rnatadi.

## Tuzilishi

| Fayl | Vazifasi |
|------|----------|
| `src/index.js` | Bot, xabarlar va tugmalar, polling/webhook |
| `src/frames.js` | Faylni yuklash, ffmpeg bilan kadr ajratish |
| `src/identify.js` | Claude orqali kinoni aniqlash va tarjima |
| `src/tmdb.js` | TMDB: qidiruv, tafsilotlar, platformalar |

## Cheklovlar

- Telegram Bot API orqali yuklab olinadigan fayl hajmi **20 MB gacha** — qisqa parcha (10–60 s) yetarli.
- Aniqlik kadrlarga bog'liq: aktyorlar yuzi yoki taniqli sahna ko'rinsa yaxshi topadi.
- Ovoz (dialog) tahlil qilinmaydi — faqat tasvir va foydalanuvchi izohi.
