# Loyiha: AQSh aksiyalari bo'yicha demo savdo boti

## Mening maqsadim
Men (Sherzod) AQSh fond birjasida aksiyalar savdosini **haqiqiy pul yo'qotmasdan** o'rganmoqchiman.
Buning uchun strategiyani avval virtual (demo) pul bilan sinab, natijalarini kunlik, haftalik va oylik hisobotlardan kuzatib boraman.
Bot strategiyaning xato va kamchiliklarini tahlil qilib, uni asta-sekin yaxshilab borishi kerak.
Agar 2–3 oy davomida demo natijalar barqaror ijobiy bo'lsa, kichik real pul bilan boshlashni o'ylayman.
Kafolatli foyda yo'qligini bilaman — maqsad: qaysi yondashuv ishlashini ma'lumotga asoslanib bilish.

Uch xil narxdagi aksiyalarda alohida sinab, qaysi biri yaxshiroq ishlashini solishtirmoqchiman:
- 💎 Qimmat: 50$ dan yuqori
- 🔷 O'rtacha: 10–50$
- 🔹 Arzon: 5–10$

## Dastur qanday ishlaydi
**Texnologiya:** Python, Telegram bot (long polling), narxlar Yahoo Finance'dan (`yfinance`, bepul).
**Joylashuv:** Render (bepul web service), GitHub repo `SherzodSafar/Factfoodbot`, `savdo-bot` branch.
**Faqat egasi ishlata oladi:** `OWNER_CHAT_ID` muhit o'zgaruvchisi bo'yicha.

### Aksiyalarni tanlash (`universe.py`)
- ~250 ta likvid AQSh aksiyasi ro'yxati bugungi narxiga qarab 3 guruhga bo'linadi.
- Har guruhdan 6 tadan tanlanadi. Shartlar: kunlik savdo hajmi yetarli (qimmat ≥200 mln$, o'rtacha ≥50 mln$, arzon ≥15 mln$), ko'tarilish trendi (narx > EMA200, EMA50 > EMA200), oxirgi 6 oydagi o'sish eng kuchli.
- Ro'yxat har oyning 1-kuni avtomatik yangilanadi (ochiq savdosi bor aksiyalar yopilguncha qoladi).

### Strategiya (`engine.py`) — kunlik grafik, faqat xarid (long)
- **Kirish:** ko'tarilish trendida RSI(14) 40 ni pastdan yuqoriga kesib o'tsa → ertasi kuni ochilishda xarid.
- **Chiqish:** stop-loss = 2×ATR(14) pastda; take-profit = 3×ATR yuqorida; narx EMA200 dan pastga tushsa; 20 kundan keyin.
- Har savdoga guruh kapitalining 10%, komissiya 0.05%.
- Odatda savdo 3–20 kun davom etadi.

### Demo savdo (`paper.py`)
- Har narx guruhiga alohida virtual kapital (masalan 10 000$).
- Holat `demo_state.json` faylida. Bepul Render'da disk doimiy emas, shuning uchun bot bu faylni Telegram chatga yuborib **mahkamlab (pin)** qo'yadi va qayta ishga tushganda shundan tiklaydi.

### Avtomatik ish (Toshkent vaqti)
- Seshanba–shanba 03:00: AQSh birjasi yopilgandan keyin yangi kunlarni qayta ishlaydi → kunlik hisobot.
- Shanba: haftalik hisobot + tahlil (xato/ustunliklar) + sozlamalarni yaxshilash.
- Oyning 1-kuni: oylik hisobot + aksiyalarni qayta tanlash.

### Yaxshilash (walk-forward)
- Oxirgi 2 yil 70% (o'rganish) va 30% (tekshirish) qismga bo'linadi.
- RSI chegarasi, stop, take va muddat kombinatsiyalari o'rganish qismida sinaladi.
- Eng yaxshisi ko'rilmagan tekshirish qismida ham joriydan yaxshi bo'lsagina taklif qilinadi (`/qabul`) yoki `/avto on` bo'lsa o'zi qo'llanadi.

### Buyruqlar
`/demo_boshlash 10000`, `/holat`, `/hisobot kunlik|haftalik|oylik`, `/bozor`, `/tahlil`, `/qabul [guruh]`,
`/avto on|off`, `/tanlash`, `/sozlamalar`, `/test [AKSIYALAR] [BOSHLANISH] [TUGASH] [KAPITAL]`, `/tavsiya`, `/yangilash`.

### Fayllar
`bot.py` (Telegram + jadval + zaxira), `commands.py` (buyruqlar), `engine.py` (strategiya, backtest, statistika, optimallash),
`paper.py` (demo holat), `universe.py` (aksiya tanlash), `data.py` (narx yuklash), `cli.py` (Telegram'siz sinash).

### Ma'lum cheklovlar
- Yahoo Finance ba'zan server IP'larini cheklashi mumkin — unda bot "ma'lumot yuklab bo'lmadi" deydi, keyinroq qayta urinadi.
- Bepul Render oyiga 750 soat beradi (bitta hisobdagi barcha bepul servislarga umumiy).
- Demo natija real savdoni to'liq aks ettirmaydi (sirpanish, spred).
