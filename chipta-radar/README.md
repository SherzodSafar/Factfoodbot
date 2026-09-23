# 🚆 Chipta Radar — poyezd chiptalari yordamchisi

Telegram bot + Mini App + Admin Panel. O'zbekiston temir yo'llari
(**eticket.railway.uz**) chiptalarini real vaqtda ko'rsatadi va kerakli joy
paydo bo'lishi bilan darhol xabar beradi.

> Bot chipta **sotmaydi** — u joyni topadi va xabar beradi. Xarid rasmiy
> eticket.railway.uz saytida (xabardagi tugma to'g'ridan-to'g'ri o'sha yerga olib boradi).

---

## ✨ Imkoniyatlar

### 1️⃣ Hozir bor joylar
- Yo'nalish + sana → barcha poyezdlar: jo'nash/yetib borish vaqti, yo'ldagi vaqt,
  vagon turlari, **bo'sh joylar soni** va **narxlar**
- 45 kunlik sana lentasi — bir bosishda boshqa kunga o'tish
- Filtr (vagon turi, faqat joyi borlar) va saralash (vaqt, narx, tezlik)
- Poyezdni bossangiz — **har bir vagon va har bir bo'sh joy raqami**,
  vagon xaritasi: to'rttalik / bokovoy, pastki (P) / yuqori (Y)

### 2️⃣ Joy chiqsa xabar ber (kuzatuv)
- Yo'nalish, **bir nechta sana**, vagon turi(lar)i va chiptalar soni
- Qo'shimcha: aniq poyezd(lar), jo'nash vaqti oralig'i, eng ko'p narx
- Saytning **istalgan joyida** yetarli joy paydo bo'lishi bilan botda xabar

### 3️⃣ Aniq joy buyurtmasi
- **To'rttalik** yoki **bokovoy**, **pastki** yoki **yuqori**
- **Hammasi bitta joyda** (bitta kupe/bo'lim, ko'p odam bo'lsa — yonma-yon bo'limlar),
  **bitta vagonda** yoki **tarqoq**
- "Hojatxona yonidagi joylar kerak emas" (1- va 9-bo'limlar)
- Xabarda aniq joylar: *„07-vagon: 9, 11 (3-bo'lim)"*

### Qo'shimcha
- Botga oddiy matn: `Toshkent Samarqand ertaga`, `Ташкент Бухара 25.10` — tezkor javob
- Xabar ostidagi tugmalar: *Sotib olish*, *Joylarni ko'rish*, *Chipta oldim*, *To'xtatish*
- Takroriy xabarlardan himoya, tungi ovozsiz rejim, qidiruv tarixi
- Admin Panel: statistika, kuzatuvlar, foydalanuvchilar (bloklash, shaxsiy xabar),
  xabarlar tarixi, stansiyalar, sayt holati, sinov qidiruvi, sozlamalar, e'lon

---

## 🧱 Qanday qurilgan

```
Telegram ──webhook──► Backend (Render, Node.js) ──► PostgreSQL (Neon)
                          │  ▲
       eticket.railway.uz ◄┘  ├── Mini App   (Render static, React)
   (navbat + kesh + cheklov)  └── Admin Panel (Render static, React)
```

| Qism | Texnologiya |
|------|-------------|
| Backend + Bot + Kuzatuv xizmati | Node.js, Express, Telegraf, Prisma |
| Mini App | React + Vite |
| Admin Panel | React + Vite |
| Baza | PostgreSQL (Neon) |

**Saytga hurmat:** barcha so'rovlar bitta navbatdan o'tadi (orasida kamida 1.2 s),
bir xil qidiruvlar keshlanadi, bir yo'nalish+sanadagi barcha kuzatuvlar bitta so'rov
bilan tekshiriladi, sayt "juda ko'p so'rov" desa — avtomatik tanaffus.

---

## 🔑 Sozlamalar (Render → chipta-radar-api → Environment)

| O'zgaruvchi | Vazifasi |
|-------------|----------|
| `BOT_TOKEN` | Telegram bot tokeni (@BotFather) |
| `DATABASE_URL` | Neon bazasi manzili |
| `WEBAPP_URL` | Mini App manzili (bot "Menu" tugmasi) |
| `ADMIN_PASSWORD` | Admin panel paroli |
| `ADMIN_SECRET`, `WEBHOOK_SECRET` | Maxfiy kalitlar (o'zgartirmang) |
| `RAILWAY_LOGIN`, `RAILWAY_PASSWORD` | *Ixtiyoriy.* Faqat sayt API uchun hisobga kirishni talab qilsa |
| `WATCH_INTERVAL_SEC` | Kuzatuv oralig'i (standart 60, Admin Paneldan ham o'zgaradi) |

O'zgaruvchini saqlasangiz server avtomatik qayta yonadi.

---

## 🤖 Yangi bot ochish (@BotFather)

1. Telegramda **@BotFather** ni oching → `/newbot`
2. Bot nomini yozing, masalan: `Chipta Radar`
3. Username yozing (oxiri `bot` bilan tugashi shart), masalan: `chipta_radar_uz_bot`
4. BotFather bergan **token**ni (`1234567890:AA...`) nusxalang

## 🐘 Baza (Neon)

1. https://console.neon.tech → **New Project** (Region: *Europe — Frankfurt*)
2. **Connection string** ni nusxalang (`postgresql://...neon.tech/neondb?sslmode=require`)

Server ishga tushganda jadvallar va stansiyalar ro'yxati avtomatik yaratiladi.

---

## 🩺 Tekshirish

```bash
npm run deploy:check -- https://chipta-radar-api.onrender.com
npm run railway:check                      # sayt bilan aloqa (Toshkent → Samarqand, ertaga)
npm run railway:check -- 2900000 2900800 2026-10-05
```

Admin Panel → **🧪 Sinov qidiruvi** — saytdan keshsiz ma'lumot olib ko'rsatadi.

> ⚠️ **Bepul tarif haqida.** Render bepul serveri 15 daqiqa jim tursa uxlaydi.
> Faol kuzatuvlar bor ekan, server o'zini uyg'oq saqlaydi (har 9 daqiqada o'ziga so'rov).
> Bepul tarifda oyiga 750 soat beriladi va u bir hisobdagi **barcha bepul serverlar
> uchun umumiy**. Kuzatuv 24/7 ishlashi kerak bo'lsa — `chipta-radar-api` ni
> **Starter** ($7/oy) tarifiga o'tkazish tavsiya etiladi: Render → xizmat →
> *Settings* → *Instance Type*.

---

## 💻 Localhost'da ishga tushirish (ixtiyoriy)

```bash
cd chipta-radar
npm run install:all          # paketlar
cp .env.example .env         # DATABASE_URL va BOT_TOKEN ni yozing
npm run setup                # jadvallar + stansiyalar
npm run dev:all              # backend :3000, Mini App :5173, Admin :5174
npm test                     # testlar
```

Saytga ulanmasdan sinash uchun soxta server: `node test/mock-railway.js`
va `.env` ga `RAILWAY_BASE_URL=http://localhost:4010`.

---

## 🗂 Tuzilma

```
chipta-radar/
├── src/
│   ├── config/default.js         # sozlamalar
│   ├── core/bot.js               # Telegram bot
│   ├── core/railway.js           # eticket.railway.uz mijozi (navbat, kesh, sessiya)
│   ├── database/connection.js    # Prisma
│   ├── models/                   # User, Watch, Station, Notification, SearchLog
│   ├── services/
│   │   ├── trains.js             # sayt javoblarini normallashtirish
│   │   ├── seats.js              # vagon sxemasi va joy tanlash mantig'i
│   │   ├── matcher.js            # kuzatuvni poyezdlar bilan solishtirish
│   │   ├── watcher.js            # davriy tekshiruv va xabarlar
│   │   ├── queryParser.js        # "Toshkent Samarqand ertaga" ni tushunish
│   │   └── ...
│   ├── controllers/              # botController, clientController, adminController
│   ├── routes/                   # bot, client (Mini App), admin
│   ├── middlewares/              # Telegram imzosi, admin token, cheklovlar
│   └── index.js
├── prisma/                       # schema.prisma, seed.js (stansiyalar)
├── miniapp/                      # React Mini App
├── admin/                        # React Admin Panel
├── scripts/                      # setup, railway-check, bot-info, deploy-check
└── test/                         # testlar va soxta eticket serveri
```
