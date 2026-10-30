# Demo savdo boti (AQSh aksiyalari)

Telegram bot: strategiyani o'tgan davrda sinaydi, virtual pul bilan demo savdo qiladi,
kunlik / haftalik / oylik hisobot yuboradi va har hafta xatolarni tahlil qilib, sozlamalarni yaxshilashni taklif qiladi.
**Haqiqiy pul ishlatilmaydi.**

## Fayllar
- `engine.py` — strategiya, backtest, statistika, avtomatik yaxshilash
- `paper.py` — demo savdo holati (`demo_state.json` faylida saqlanadi)
- `commands.py` — bot buyruqlari
- `bot.py` — Telegram bot + jadval (03:00 Toshkent vaqti)
- `cli.py` — Telegram'siz kompyuterda sinash: `python cli.py /test SPY 2024-01-01 2025-12-31`

## 1. Bot yaratish
1. Telegram'da @BotFather → `/newbot` → token oling.

## 2. Render'ga joylash
1. Fayllarni GitHub repoga yuklang.
2. Render → **New → Web Service** → repo'ni tanlang.
3. Build command: `pip install -r requirements.txt`
4. Start command: `python bot.py`
5. Environment: `BOT_TOKEN` = BotFather bergan token.
6. Deploy bo'lgach botga `/start` yozing — siz egasi bo'lasiz (boshqalar foydalana olmaydi).

### Muhim (bepul Render tarifi)
- Bepul web service 15 daqiqa so'rov bo'lmasa uxlaydi. Uni uyg'oq tutish uchun UptimeRobot kabi xizmat bilan servis manzilini har 5 daqiqada tekshirtiring.
- Bepul tarifda disk doimiy emas: qayta deploy qilinganda `demo_state.json` o'chadi va demo savdo qaytadan boshlanadi.
  Doimiy saqlash uchun pullik tarifda **Persistent Disk** qo'shing va `DATA_DIR=/var/data` qilib bering.
- Muqobil: botni o'z kompyuteringizda ishga tushiring: `pip install -r requirements.txt`, so'ng `BOT_TOKEN=... python bot.py`.

## Buyruqlar
`/yordam` — barcha buyruqlar ro'yxati, `/tavsiya` — qaysi aksiyalar va necha kunlik savdo.
