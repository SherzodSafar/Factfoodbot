# 🌳 Shajara iBot — Telegram Mini App

Oila shajarasini qurish, ko'rish va avlodlarga yetkazish uchun bot: [@Shajara_iBot](https://t.me/Shajara_iBot)

## Imkoniyatlar

| | |
|---|---|
| ✨ **Tanishtiruv** | Birinchi kirishda 4 ta slayd (bir marta ko'rsatiladi) |
| 🔑 **Kirish kodi** | Shajarani faqat ko'rish (daraxt + ro'yxat) |
| ✏️ **Tahrir kodi** | Alohida maxfiy kod — odam qo'shish, surat, o'zgartirish, sozlamalar |
| 🌱 **Yangi shajara** | Istalgan foydalanuvchi o'z shajarasini yaratadi va kodlarini o'zi belgilaydi |
| 🌳 **Jonli daraxt** | Surish, barmoq bilan kattalashtirish, shoxlarni yig'ish, qidirib topish, nasl yo'lini yoritish |
| 👥 **Ro'yxat** | Avlodlar bo'yicha, qidiruv va filtrlar (qon qarindosh, kelin-kuyov, hayot, marhum…) |
| 📸 **Suratlar** | Har bir inson uchun — avtomatik kvadrat kesiladi va siqiladi |
| 🪪 **Inson kartasi** | Sana, yosh, nasl yo'li, ota-ona, juft, farzand, aka-uka, nevaralar, hayot yo'li |
| 📊 **Tahlil** | Statistika, avlodlar grafigi, yaqin tug'ilgan kunlar, xotira kunlari, oqsoqollar |
| 🔗 **Kim kimga kim?** | Ikki insonni tanlang — amaki, xolavachcha, kelin, qaynona… |
| 🔔 **Eslatmalar** | Har kuni 09:00 da tug'ilgan kun va xotira kunlari haqida Telegram xabari |
| 💾 **Zaxira nusxa** | Butun shajara JSON faylda chatga yuboriladi |
| 📜 **Hikmatlar** | Qondoshlik, silai rahm haqidagi maqol va hadislar (`/hikmat`) |

## Qanday ishlaydi

```
Telegram ──webhook──► Vercel Function (api/index.js) ──► Vercel Blob (maxfiy)
                             ▲                              ├─ trees/<id>.json   — shajara
     Mini App (public/) ─────┘                              ├─ codes/<hash>.json — kod → shajara
                                                            └─ photos/<id>/…     — suratlar
```

* Kodlar ochiq saqlanmaydi — faqat HMAC xeshi.
* Kod o'zgartirilsa, barcha eski kirishlar bekor bo'ladi.
* Bir vaqtda ikki kishi tahrirlasa ham ma'lumot yo'qolmaydi (ETag qulfi).

## Sozlamalar (Vercel → Settings → Environment Variables)

| O'zgaruvchi | Vazifasi |
|---|---|
| `BOT_TOKEN` | @BotFather tokeni |
| `APP_SECRET` | Kodlar va sessiyalarni imzolash uchun tasodifiy satr (o'zgartirilsa hamma qayta kiradi) |
| `ADMIN_KEY` | `/api/setup` va `/api/admin/import` uchun |
| `CRON_SECRET` | Kunlik eslatmalar cron'i uchun |
| `PUBLIC_URL` | Mini App manzili, masalan `https://shajara-ibot.vercel.app` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob ulanganda avtomatik qo'shiladi |

## Buyruqlar

```bash
npm install
npm run dev                                   # http://localhost:3100 (ma'lumotlar .data/ ga yoziladi)
ADMIN_KEY=... node scripts/import.js shajara.json <kirish_kodi> <tahrir_kodi> https://…  # JSON yuklash
ADMIN_KEY=... node scripts/setup-bot.js https://…                                       # webhook + menyu
```
