# 🍕 FactFood — Telegram Mini App + Admin Panel

Pizza yetkazib berish xizmati. Loyiha **internetda ishlab turibdi** —
kompyuterni yoqib qo'yish shart emas.

## 🌍 Jonli manzillar

| Qism | Manzil |
|------|--------|
| 🤖 **Telegram bot** | [@kafolatli_bot](https://t.me/kafolatli_bot) |
| 📱 **Mini App** (mijozlar) | https://factfood.onrender.com |
| 🖥 **Admin Panel** (ma'murlar) | https://factfood-admin.onrender.com |
| ⚙️ **Backend API** | https://factfood-api.onrender.com |

> Mini App havolasini oddiy brauzerda ochsangiz ishlamaydi — u faqat Telegram
> ichida ochiladi (xavfsizlik uchun Telegram imzosi tekshiriladi).

## 🧱 Qanday qurilgan

```
Telegram  ──webhook──►  Backend (Render)  ──►  PostgreSQL (Neon)
                              ▲
              Mini App ───────┤ (API)
        (Render static)       │
              Admin Panel ────┘
        (Render static)
```

| Qism | Texnologiya | Xizmat |
|------|-------------|--------|
| Backend + Bot | Node.js, Express, Telegraf, Prisma | Render Web Service (bepul) |
| Mini App | React + Vite | Render Static Site (bepul, CDN) |
| Admin Panel | React + Vite | Render Static Site (bepul, CDN) |
| Baza | PostgreSQL | Neon (bepul) |

## 🔄 Kodni yangilash

Har qanday o'zgarishni GitHub'ga yuborsangiz, uchala xizmat **o'zi qayta
quriladi va yangilanadi** (auto-deploy yoqilgan):

```bash
git add .
git commit -m "o'zgarish"
git push
```

## 🔑 Sozlamalarni o'zgartirish (parol, token va h.k.)

Bulutda `.env` fayli ishlatilmaydi — sozlamalar Render'da turadi:

**Render → factfood-api → Environment** bo'limi:

| O'zgaruvchi | Vazifasi |
|-------------|----------|
| `BOT_TOKEN` | Telegram bot tokeni |
| `DATABASE_URL` | Neon bazasi manzili |
| `WEBAPP_URL` | Mini App manzili (bot menyusi shunga ulanadi) |
| `ADMIN_PASSWORD` | Admin panel paroli |
| `ADMIN_SECRET` | Admin token imzosi uchun maxfiy kalit |
| `ALLOW_DEV_AUTH` | `false` — Telegramsiz kirishni taqiqlaydi |
| `BOT_MODE` | `webhook` (bulut) yoki `polling` (localhost) |

O'zgaruvchini saqlasangiz server avtomatik qayta yonadi.

> ⚠️ **Bepul tarif:** backend 15 daqiqa foydalanilmasa "uxlaydi". Keyingi
> murojaatda ~1 daqiqa uyg'onadi — birinchi buyurtma yoki `/start` biroz
> kechikishi mumkin. Mini App va Admin Panel esa statik CDN'da, ular
> doim tez ochiladi.

## 🩺 Tekshirish

```bash
npm run deploy:check -- https://factfood-api.onrender.com
```

Backend, baza, webhook va Mini App holatini bir zumda ko'rsatadi.

---

# 💻 Localhost'da ishga tushirish (ixtiyoriy)

Quyidagilar faqat kompyuterda ishlab, kodni o'zgartirmoqchi bo'lsangiz kerak.

---

## 📋 Talablar

Kompyuteringizda **Node.js 18+** o'rnatilgan bo'lishi kerak.

Tekshirish:

```bash
node -v
```

Agar xatolik chiqsa — https://nodejs.org saytidan **LTS** versiyasini o'rnating.

---

## 🚀 Ishga tushirish (5 qadam)

### 1-qadam. Paketlarni o'rnatish

Loyiha papkasida terminal oching va bajaring:

```bash
npm run install:all
```

> Bu buyruq backend, Mini App va Admin Panel paketlarini birdaniga o'rnatadi.

### 2-qadam. `.env` faylini yaratish

`.env.example` faylidan nusxa oling va o'z ma'lumotlaringizni yozing:

```bash
cp .env.example .env
```

Keyin `.env` faylini oching va to'ldiring:

```env
DATABASE_URL="postgresql://foydalanuvchi:parol@host.neon.tech/neondb?sslmode=require"
BOT_TOKEN="123456789:AAH..."
ADMIN_PASSWORD="admin123"
```

### 3-qadam. Bazani tayyorlash

```bash
npm run setup
```

Bu buyruq uchta ishni bajaradi:
1. Prisma clientini generatsiya qiladi
2. Bazada `users`, `products`, `orders` jadvallarini yaratadi
3. 4 ta pizza + Coca-Cola ni bazaga yozadi (seed)

### 4-qadam. Hammasini ishga tushirish

```bash
npm run dev:all
```

Terminalda uchta jarayon birdan yonadi:

```
[BACKEND] ✅ API server:  http://localhost:3000
[MINIAPP] ➜  Local:      http://localhost:5173
[ADMIN]   ➜  Local:      http://localhost:5174
```

- **Admin Panel**: brauzerda `http://localhost:5174` → parol: `.env` dagi `ADMIN_PASSWORD`
- **Mini App**: `http://localhost:5173` (brauzerda sinash uchun; Telegramda ochish uchun 5-qadam)

### 5-qadam. ngrok orqali Telegramga ulash

Telegram Mini App **faqat https** manzilni qabul qiladi. Localhost'ni https qilish uchun `ngrok` ishlatiladi.

**a) ngrok o'rnatish:** https://ngrok.com/download → ro'yxatdan o'ting → authtoken oling:

```bash
ngrok config add-authtoken SIZNING_TOKENINGIZ
```

**b) Yangi terminal oching** (`npm run dev:all` ishlab turaversin) va yozing:

```bash
ngrok http 5173
```

Natijada shunday manzil chiqadi:

```
Forwarding   https://a1b2-84-54-92-10.ngrok-free.app -> http://localhost:5173
```

**c) Uchinchi terminal** oching va botga ulang:

```bash
npm run ngrok:link
```

Bu buyruq avtomatik ravishda:
- ngrok manzilini topadi
- `.env` dagi `WEBAPP_URL` ni yangilaydi
- Telegram botning **Menu** tugmasini Mini App'ga bog'laydi
- Bot buyruqlarini (`/start`, `/menu`, ...) sozlaydi

**d)** Tayyor! Backend `.env` o'zgarganini o'zi sezadi va avtomatik qayta yonadi
(terminalda `[BACKEND] ✅ Bot ishga tushdi` deb chiqadi).

**e)** Telegramda botingizni oching va `/start` deb yozing 🎉

> **Eslatma:** ngrok bepul tarifda birinchi kirishda ogohlantirish sahifasini ko'rsatishi mumkin — **"Visit Site"** tugmasini bosing.
>
> Muqobil variant (ogohlantirishsiz): [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
> ```bash
> cloudflared tunnel --url http://localhost:5173
> npm run ngrok:link -- https://xxxx.trycloudflare.com
> ```

---

## 🗂 Loyiha tuzilishi

```
Factfoodbot/
├── src/                        # Backend (Node.js)
│   ├── config/default.js       # Sozlamalar va o'zgaruvchilar
│   ├── core/bot.js             # Bot instansiyasi
│   ├── database/connection.js  # PostgreSQL (Prisma) ulanishi
│   ├── models/                 # User.js, Product.js, Order.js
│   ├── controllers/            # botController, cartController, adminController
│   ├── routes/                 # bot.routes, client.routes, admin.routes
│   ├── middlewares/            # auth.middleware.js (validatsiya)
│   └── index.js                # Asosiy ishga tushirish fayli
├── prisma/
│   ├── schema.prisma           # Baza sxemasi
│   └── seed.js                 # Boshlang'ich mahsulotlar
├── scripts/
│   ├── setup.js                # generate + db push + seed
│   ├── link-ngrok.js           # ngrok'ni botga ulash
│   └── bot-info.js             # bot holatini tekshirish
├── miniapp/                    # React Mini App (mijozlar)
├── admin/                      # React Admin Panel (ma'murlar)
├── .env                        # Maxfiy sozlamalar (GitHub'ga tushmaydi)
└── package.json
```

---

## 🧾 Barcha buyruqlar

| Buyruq | Vazifasi |
|--------|----------|
| `npm run install:all` | Barcha paketlarni o'rnatish |
| `npm run setup` | Prisma generate + jadvallar + seed |
| `npm run dev:all` | Backend + Mini App + Admin panelni birdan yoqish |
| `npm run dev` | Faqat backend (avtomatik qayta yoqiladi) |
| `npm run build` | Mini App va Admin Panelni build qilish |
| `npm run go` | Build qilib, hammasini bitta portda (3000) yoqish |
| `npm run ngrok:link` | ngrok manzilini botga ulash |
| `npm run bot:info` | Bot va Mini App holatini tekshirish |
| `npm run db:studio` | Bazani brauzerda ko'rish (Prisma Studio) |
| `npm run db:seed` | Mahsulotlarni qayta yozish |

---

## 🎨 Mini App imkoniyatlari

- **Onboarding** — 3 ta slayd (faqat birinchi kirishda)
- **Bosh sahifa** — salomlashish, storylar, "Yangi buyurtma berish" vidjeti
- **Katalog** — kategoriya filtri, qidiruv, tezkor `+` qo'shish
- **Mahsulot oynasi** — pastdan qalqib chiquvchi, tarkibi va sticky tugma
- **Savatcha** — miqdorni o'zgartirish, Coca-Cola taklifi (switch), manzil va telefon
- **Profil** — buyurtmalar tarixi, "Yana shundan" tugmasi

## 🖥 Admin Panel imkoniyatlari

- **Statistika** — buyurtmalar, tushum, mijozlar soni
- **Buyurtmalar** — jadval ko'rinishida, har 10 soniyada avtomatik yangilanadi, holatni o'zgartirish
- **Mahsulotlar (CRUD)** — qo'shish, tahrirlash, o'chirish, yashirish

---

## ❓ Muammolar va yechimlar

**`npm run setup` da "Can't reach database server"**
→ `.env` dagi `DATABASE_URL` noto'g'ri yoki Neon bazasi uxlab qolgan. Neon sahifasini bir marta oching.

**Bot javob bermayapti**
→ `npm run bot:info` ni bajaring. Token noto'g'ri bo'lsa, @BotFather → `/mybots` → bot → *API Token*.

**Telegramda "Menu" tugmasi yo'q**
→ `npm run ngrok:link` ni bajaring, keyin botni `/start` orqali qayta oching.

**Mini App oq ekran ko'rsatyapti**
→ `npm run dev:all` ishlab turganini va ngrok o'sha portga (5173) ulanganini tekshiring.

**Rasm ko'rinmayapti**
→ Admin Panel → Mahsulotlar → Tahrirlash → boshqa rasm URL'ini qo'ying.

**Port band ("EADDRINUSE")**
→ `.env` dagi `PORT` ni boshqa raqamga o'zgartiring (masalan 3001).
