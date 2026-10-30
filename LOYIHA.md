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
- Har savdoga guruh kapitalining 10% (`/ulush` bilan o'zgaradi), komissiya 0.05%,
  sirpanish/spred: qimmat 0.05%, o'rtacha 0.1%, arzon 0.2% (har tomonga).
- Standart bo'yicha faqat butun aksiya olinadi (`/kasr on` — kasr aksiya). Pul yetmasa bot "pul yetmadi" deb yozadi.
- Bozor filtri: SPY EMA200 dan past bo'lsa yangi xarid qilinmaydi.
- Stop va take haqiqiy xarid narxidan (ertasi kungi ochilish) hisoblanadi.
- Odatda savdo 3–20 kun davom etadi.

### Demo savdo (`paper.py`)
- Foydalanuvchi **umumiy** summani kiritadi: `/demo_boshlash 3000` → har guruhga 1000$.
  `/demo_boshlash 2000 orta arzon` — faqat tanlangan guruhlar.
- Hisobotlarda SPY ni shunchaki ushlab turish bilan taqqoslash ko'rsatiladi.
- Holat `demo_state.json` faylida. Bepul Render'da disk doimiy emas, shuning uchun bot bu faylni Telegram chatga yuborib **mahkamlab (pin)** qo'yadi va qayta ishga tushganda shundan tiklaydi.

### Avtomatik ish (Toshkent vaqti)
- Seshanba–shanba 03:00 dan keyin: AQSh birjasi yopilgandan keyin yangi kunlarni qayta ishlaydi → kunlik hisobot.
  (Server shu paytda uxlagan bo'lsa — uyg'ongach bajaradi.)
- Shanba: haftalik hisobot + tahlil + sozlamalarni yaxshilash + `/baho` (real pulga tayyorlik).
- Yangi oy: oylik hisobot + aksiyalarni qayta tanlash.

### Yaxshilash (walk-forward)
- Oxirgi 2 yil 70% (o'rganish) va 30% (tekshirish) qismga bo'linadi.
- RSI chegarasi, stop, take va muddat kombinatsiyalari o'rganish qismida sinaladi.
- Eng yaxshisi ko'rilmagan tekshirish qismida ham joriydan sezilarli yaxshi bo'lsa (o'rganishda ≥10, tekshirishda ≥10 savdo)
  taklif qilinadi (`/qabul`) yoki `/avto on` bo'lsa o'zi qo'llanadi — lekin 28 kunda ko'pi bilan bir marta.

### Real pulga o'tish mezonlari (`/baho`)
≥3 oy demo, ≥30 yopilgan savdo, profit factor ≥1.3, umumiy natija ijobiy, SPY ni ushlab turishdan yaxshi,
har guruhda eng katta tushish 10% dan kam. Hammasi bajarilmaguncha real pul tavsiya etilmaydi.

### Buyruqlar
`/demo_boshlash 3000` (umumiy summa), `/holat`, `/hisobot kunlik|haftalik|oylik`, `/bozor`, `/tahlil`, `/qabul [guruh]`,
`/avto on|off`, `/tanlash`, `/sozlamalar`, `/test [AKSIYALAR] [BOSHLANISH] [TUGASH] [KAPITAL]`, `/tavsiya`, `/yangilash`, `/ulush 15`, `/kasr on|off`, `/baho`.

### Fayllar
`bot.py` (Telegram + jadval + zaxira), `commands.py` (buyruqlar), `engine.py` (strategiya, backtest, statistika, optimallash),
`paper.py` (demo holat), `universe.py` (aksiya tanlash), `data.py` (narx yuklash), `cli.py` (Telegram'siz sinash).

### Ma'lum cheklovlar
- Yahoo Finance ba'zan server IP'larini cheklashi mumkin — unda bot "ma'lumot yuklab bo'lmadi" deydi, keyinroq qayta urinadi.
- Bepul Render oyiga 750 soat beradi (bitta hisobdagi barcha bepul servislarga umumiy).
- Demo natija real savdoni to'liq aks ettirmaydi (sirpanish, spred).
