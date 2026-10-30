# Loyiha: AQSh aksiyalari bo'yicha demo savdo boti

## Mening maqsadim
Men (Sherzod) AQSh fond birjasida aksiyalar savdosini **haqiqiy pul yo'qotmasdan** o'rganmoqchiman.
Strategiyani avval virtual (demo) pul bilan sinab, natijalarini kunlik, haftalik va oylik hisobotlardan kuzataman.
Agar 2–3 oy demo natijalar barqaror ijobiy bo'lsa (`/baho`), kichik real pul bilan boshlashni o'ylayman.
Kafolatli foyda yo'qligini bilaman — maqsad: qaysi yondashuv ishlashini ma'lumotga asoslanib bilish.

Uch narx guruhi alohida sinaladi: 💎 Qimmat 50$+ • 🔷 O'rtacha 10–50$ • 🔹 Arzon 5–10$.

## Dastur qanday ishlaydi
**Texnologiya:** Python, Telegram bot (long polling), narxlar Yahoo Finance'dan (`yfinance`, bepul).
**Joylashuv:** Render (bepul web service), GitHub `SherzodSafar/Factfoodbot`, `savdo-bot` branch.
**Faqat egasi ishlata oladi:** `OWNER_CHAT_ID` muhit o'zgaruvchisi bo'yicha.
**Boshqaruv:** `/menyu` — inline tugmali menyu (holat, hisobot, bozor, tahlil, baho, sozlamalar, yordam).

### Aksiyalar (`universe.py`)
~250 likvid AQSh aksiyasi bugungi narxiga qarab 3 guruhga bo'linadi. Har guruhga savdo hajmi yetarli
(qimmat ≥200 mln$, o'rtacha ≥50 mln$, arzon ≥15 mln$ kuniga) **barcha** aksiyalar kiradi; ro'yxat har oy yangilanadi.

### Strategiya (`engine.py`) — kunlik grafik, faqat xarid
Hammasi faqat ko'tarilish trendida (narx > EMA200, EMA50 > EMA200) va SPY 200 kunlik o'rtachadan yuqori bo'lsa.
- **Momentum (standart):** har juma guruhda 6 oyda eng kuchli o'sgan 5 ta aksiya → dushanba ochilishda xarid.
- **Breakout:** narx 50 kunlik eng yuqori narxdan oshib yopilsa.  **Kombinatsiya:** ikkalasi.
- **Pullback (eski):** RSI 40 ni kesib o'tsa; stop 2 ATR, take 3 ATR, 20 kun.
- Chiqish (trend strategiyalari): take-profit yo'q; trailing stop narx ortidan 4 ATR.
- Hajm: stop tegsa guruh kapitalining 1% i yo'qotiladi (`/xavf`), bitta aksiyaga ≤20%, ≤8 ta savdo.
- Komissiya 0.05%, sirpanish: qimmat 0.05%, o'rtacha 0.1%, arzon 0.2%. Standart — faqat butun aksiya (`/kasr on`).

### Tarixiy sinov (`research/lab.py`, GitHub Actions'da)
2014–2026, real narxlar, guruh a'zoligi har oy o'sha paytdagi ma'lumotdan:
| | Yillik | Eng katta tushish | Eng yomon yil |
|---|---|---|---|
| Momentum 💎 / 🔷 / 🔹 | +8.7% / +9.8% / +9.2% | −17% / −17.5% / −19% | −6.6% / −4% / −6.4% |
| Eski pullback | ~0% | | |
| SPY ushlab turish | +13.8% | −34% | −18% |

Cheklov: ro'yxat bugungi aksiyalardan (yo'qolib ketganlar yo'q) — real natija pastroq bo'lishi mumkin.
"Har 6 oyda eng yaxshi sozlamaga o'tish" barqaror sozlamadan yaxshi chiqmadi, shuning uchun bot sozlamani tez-tez o'zgartirmaydi.

### Demo (`paper.py`)
- `/demo_boshlash 3000` — umumiy summa guruhlarga teng bo'linadi (`/demo_boshlash 2000 orta arzon` — tanlangan guruhlar).
- Holat `demo_state.json`; bot uni Telegram chatga yuborib **mahkamlaydi (pin)** va qayta ishga tushganda tiklaydi.
- Hisobotda SPY ni ushlab turish bilan taqqoslash.

### Avtomatik ish (Toshkent vaqti)
- Seshanba–shanba 03:00 dan keyin: yangi kunlar → kunlik hisobot (server uxlagan bo'lsa — uyg'ongach).
- Shanba: haftalik hisobot + tahlil + `/baho`.  Yangi oy: oylik hisobot + aksiyalarni qayta tanlash.
- Haftalik tahlil sozlamalarni oxirgi 2 yilda 70/30 bo'lib tekshiradi; yangisi tekshirish qismida ham sezilarli yaxshi va
  savdolar yetarli bo'lsagina taklif qilinadi (`/qabul`), `/avto on` bo'lsa o'zi qo'llaydi (28 kunda ko'pi bilan bir marta).

### Real pulga o'tish mezonlari (`/baho`)
≥3 oy demo, ≥30 yopilgan savdo, profit factor ≥1.3, natija ijobiy, SPY dan yaxshi, har guruhda tushish <10%.

### Kun ichi savdo
Qo'shilmadi: bepul kun ichi ma'lumot qisqa va kechikadi, xarajatlar foydani yeydi, kichik hisoblarda cheklovlar bor.

### Fayllar
`bot.py` (Telegram, jadval, zaxira), `menu.py` (inline tugmalar), `commands.py` (buyruqlar, yordam matnlari),
`engine.py` (strategiyalar, backtest, statistika, optimallash), `paper.py` (demo holat), `universe.py` (aksiyalar),
`data.py` (narx yuklash), `cli.py` (Telegram'siz sinash), `research/lab.py` (tarixiy tadqiqot).
