"""Kun ichi demo savdoni jonli boshqarish: AQSh birjasi ochiq paytda har daqiqada tick() chaqiriladi.

- 9:36 (NY) dan keyin: oxirgi 20 kunlik 5 daqiqalik narxlar yuklanadi, bugungi ochilishda hajmi keskin
  oshgan aksiyalar tanlanadi (DayBook.select_orb) va xabar beriladi.
- Har 5 daqiqada: faqat nomzodlar va ochiq pozitsiyalar narxi yuklanib, yangi yopilgan shamlar qayta ishlanadi.
- 16:05 dan keyin: kun yopiladi (hammasi sotilgan bo'ladi) va kun yakuni yuboriladi.
Server uxlab qolsa ham, uyg'ongach o'tkazib yuborilgan shamlar ketma-ket qayta ishlanadi (natija bir xil).
Holat paper.state["day"] da saqlanadi va asosiy holat bilan birga Telegram'ga zaxiralanadi."""
import pandas as pd

from daytrade import OPEN_BAR, DayBook, DayParams, _tod, day_stats, first_bar_avgs, split_days
from fmt import dona, foiz, natija, pul, sana
from market import is_trading_day, status as market_status
from universe import UNIVERSE

# Kunlik strategiyalar: real sinovdagi eng yaxshi sozlamalari bilan
DAY_PRESETS = {
    "orb": dict(strategy="orb", rvol_min=3.0, top_n=5, spy_filter=True, target_r=2.0, target_pct=0.0, stop_pct=0.0,
                time_stop=0, slippage=0.0005, risk_pct=0.5, max_pos_pct=25.0),
    "runner": dict(strategy="runner", entry="dip", min_gain=20.0, runner_vol=5.0, dip_min=8.0, target_hod=False,
                   target_pct=10.0, stop_pct=0.0, time_stop=60, spy_filter=False, target_r=0.0, slippage=0.003,
                   risk_pct=0.5, max_pos_pct=20.0, max_trades=8, bar_minutes=5, min_dollar_vol=200000.0),
}
DAY_NAMES = {"orb": "Ochilishda hajmi oshganlar", "runner": "Tez uchayotganlar — qaytgach kirish (runner)"}

START_AFTER = pd.Timedelta(hours=9, minutes=36)
CLOSE_AFTER = pd.Timedelta(hours=16, minutes=5)
BAR = pd.Timedelta(minutes=5)


class DayService:
    def __init__(self, paper, intraday_loader, now_fn, scanner=None):
        self.scanner = scanner        # scanner(min_gain, min_price) -> [tickerlar] (runner uchun)
        self.paper = paper
        self.load = intraday_loader   # load(tickers, period=...) -> {tk: 5m DataFrame NY vaqtida}
        self.now = now_fn             # Nyu-York vaqti (tz'siz)

    # ---------- holat ----------
    @property
    def st(self):
        return (self.paper.state or {}).get("day")

    @property
    def active(self):
        return bool(self.st and self.st.get("enabled"))

    def _book(self):
        return DayBook.from_dict(self.st["book"], DayParams.from_dict(self.st["params"]))

    def _save(self, book):
        with self.paper.lock:
            self.st["book"] = book.to_dict()
            self.paper.save()

    def start(self, capital, **params):
        with self.paper.lock:
            if self.paper.state is None:
                self.paper.state = {}
            p = DayParams(**params)
            self.paper.state["day"] = dict(enabled=True, params=p.to_dict(), book=DayBook(p, capital).to_dict(),
                                           started=str(pd.Timestamp(self.now()).date()), skip=None)
            self.paper.save()

    def stop(self):
        with self.paper.lock:
            if self.st:
                self.st["enabled"] = False
                self.paper.save()

    def resume(self):
        with self.paper.lock:
            if self.st:
                self.st["enabled"] = True
                self.paper.save()

    def trades_text(self, n=15):
        if not self.st:
            return "⚡️ Kunlik savdo hali boshlanmagan."
        tr = self._book().trades[-n:][::-1]
        if not tr:
            return "📜 Kunlik savdolar\n\nHali birorta kunlik savdo bo'lmagan."
        lines = [f"📜 Kunlik savdolar (oxirgi {len(tr)} ta)"]
        for t in tr:
            lines += [f"\n{t['ticker']} — {sana(t['date'])}, {pd.Timestamp(t['entry_time']):%H:%M} → "
                      f"{pd.Timestamp(t['exit_time']):%H:%M} NY ({t['minutes']} daqiqa)",
                      f"   {t['entry']:.2f}$ → {t['exit']:.2f}$   {natija(t['pnl'], t['pnl_pct'])}",
                      f"   Sabab: {'himoya narxiga tushdi' if t['reason'] == 'stop' else 'kun oxiri'}"]
        return "\n".join(lines)

    def set_strategy(self, name):
        with self.paper.lock:
            self.st["params"] = {**self.st["params"], **DAY_PRESETS[name]}
            self.paper.save()

    def set_param(self, **kw):
        with self.paper.lock:
            self.st["params"] = {**self.st["params"], **kw}
            self.paper.save()

    # ---------- jonli ----------
    def tick(self):
        """Yuboriladigan xabarlar ro'yxatini qaytaradi."""
        if not self.active:
            return []
        now = pd.Timestamp(self.now())     # datetime ham, Timestamp ham kelishi mumkin
        if not is_trading_day(now):
            return []                      # dam olish yoki AQSh bayrami
        tod = now - now.normalize()
        today = str(now.date())
        if tod < START_AFTER or self.st.get("skip") == today:
            return []
        book = self._book()
        if book.days and book.days[-1][0] == today:
            return []                       # bugun yopilgan
        if book.p.strategy == "runner":
            return self._tick_runner(book, now, today, tod)
        msgs = []
        if book.day != today:
            data = self.load(list(UNIVERSE) + ["SPY"], period="20d")
            days = split_days(data)
            d0 = pd.Timestamp(today)
            if d0 not in days:
                if tod > pd.Timedelta(hours=10):     # bayram yoki ma'lumot yo'q
                    with self.paper.lock:
                        self.st["skip"] = today
                        self.paper.save()
                return []
            af, ab = first_bar_avgs(days, d0)
            book.new_day(today)
            frames = dict(days[d0])
            spy = frames.pop("SPY", None)
            first = {tk: g.iloc[0].to_dict() for tk, g in frames.items() if len(g) and _tod(g.index[0]) == OPEN_BAR}
            if book.p.strategy == "orb":
                spy_bar = spy.iloc[0] if spy is not None and len(spy) and _tod(spy.index[0]) == OPEN_BAR else None
                msgs += [self._wrap(e) for e in book.select_orb(first, af, spy_bar)]
            with self.paper.lock:
                self.st["avg_bar"] = {k: round(v) for k, v in ab.items()}
        else:
            tks = list(book.orders) + list(book.positions)
            if book.p.strategy == "spike":
                tks = list(UNIVERSE)
            frames = self.load(tks, period="1d") if tks else {}
            frames = {k: g[g.index.normalize() == pd.Timestamp(today)] for k, g in frames.items()}
        msgs += self._process(book, frames, now)
        if tod >= CLOSE_AFTER:
            last = {tk: float(g["Close"].iloc[-1]) for tk, g in frames.items() if len(g)}
            ev = book.end_day(last)
            msgs += [self._trade_msg(e) for e in ev] + [self._day_summary(book)]
        self._save(book)
        return msgs

    def _tick_runner(self, book, now, today, tod):
        """Runner: har 5 daqiqada skaner + yangi shamlar."""
        st = self.st
        last = st.get("last_tick")
        bm = int(book.p.bar_minutes or 5)
        bar = pd.Timedelta(minutes=bm)
        if last and now - pd.Timestamp(last) < bar - pd.Timedelta(seconds=30) and tod < CLOSE_AFTER:
            return []
        msgs = []
        if book.day != today:
            book.new_day(today)
            # kech ishga tushsa — faqat so'nggi shamlardan boshlaymiz (o'tmishdagi "uchish"ni bilib savdo qilmaslik uchun)
            start = max(now.floor(f"{bm}min") - 2 * bar, now.normalize() + OPEN_BAR)
            book.last_bar = str(start)
            with self.paper.lock:
                st.update(avg_bar={}, prev_close={}, scan=[])
        scan = []
        if tod < CLOSE_AFTER and self.scanner:
            try:
                scan = self.scanner(book.p.min_gain, book.p.runner_price)
            except Exception as ex:
                print("skaner xatosi:", ex)
        with self.paper.lock:   # kun o'rtasida strategiya almashtirilgan bo'lsa ham
            st.setdefault("prev_close", {})
            st.setdefault("avg_bar", {})
        new = [t for t in scan if t not in st["prev_close"]]
        if new:
            hist = split_days(self.load(new, period="5d" if bm == 1 else "10d", interval=f"{bm}m"))
            d0 = pd.Timestamp(today)
            prior = [d for d in hist if d < d0]
            with self.paper.lock:
                for tk in new:
                    vols = [hist[d][tk]["Volume"].mean() for d in prior if tk in hist[d]]
                    pcs = [float(hist[d][tk]["Close"].iloc[-1]) for d in prior if tk in hist[d]]
                    st["prev_close"][tk] = pcs[-1] if pcs else None
                    if len(vols) >= 3 and sum(vols) > 0:
                        st["avg_bar"][tk] = round(sum(vols) / len(vols))
        tks = sorted(set(scan) | set(book.orders) | set(book.positions))
        frames = self.load(tks, period="1d", interval=f"{bm}m") if tks else {}
        frames = {k: g[g.index.normalize() == pd.Timestamp(today)] for k, g in frames.items()}
        msgs += self._process(book, frames, now, {k: v for k, v in st["prev_close"].items() if v}, bar)
        with self.paper.lock:
            st["last_tick"] = str(now)
            if scan:
                st["scan"] = scan[:10]
        if tod >= CLOSE_AFTER:
            lastc = {tk: float(g["Close"].iloc[-1]) for tk, g in frames.items() if len(g)}
            ev = book.end_day(lastc)
            msgs += [self._trade_msg(e) for e in ev] + [self._day_summary(book)]
        self._save(book)
        return msgs

    def _process(self, book, frames, now, prev_close=None, bar=BAR):
        recs = {tk: g.to_dict("index") for tk, g in frames.items()}
        last = pd.Timestamp(book.last_bar) if book.last_bar else None
        times = sorted({ts for r in recs.values() for ts in r
                        if (last is None or ts > last) and ts + bar <= now - pd.Timedelta(seconds=40)})
        hi = {}
        msgs = []
        for ts in sorted({ts for r in recs.values() for ts in r}):
            rows = {tk: r[ts] for tk, r in recs.items() if ts in r}
            for tk, r in rows.items():
                hi[tk] = max(hi.get(tk, 0), r["High"])
            if ts not in times or _tod(ts) == OPEN_BAR:
                continue
            for e in book.on_bar(ts, rows, self.st.get("avg_bar"), hi, prev_close):
                msgs.append(self._trade_msg(e) if e.startswith(("🟢", "💰", "🔻")) else self._wrap(e))
        return msgs

    # ---------- xabarlar ----------
    @staticmethod
    def _wrap(e):
        return "⚡️ KUNLIK SAVDO\n\n" + e

    @staticmethod
    def _trade_msg(e):
        head = ("🟢 SOTIB OLINDI" if e.startswith("🟢") else "💰 SOTILDI (foyda)" if e.startswith("💰")
                else "🔻 SOTILDI (zarar)")
        body = e.split(": ", 1)[1] if ": " in e.split("\n")[0] else e
        return f"{head} — ⚡️ Kunlik savdo\n\n{body}"

    def _day_summary(self, book):
        today = [t for t in book.trades if t["date"] == book.day]
        prev = book.days[-2][1] if len(book.days) > 1 else book.capital
        v = book.value()
        lines = [f"⚡️ Kunlik savdo — {sana(book.day, kun=True)} yakuni", ""]
        if today:
            for t in today:
                lines.append(f"{'✅' if t['pnl'] > 0 else '🔴'} {t['ticker']}: {pul(t['pnl'], 2, True)} "
                             f"({foiz(t['pnl_pct'])}), {t['minutes']} daqiqa")
        else:
            lines.append("Bugun savdo bo'lmadi (shartga mos aksiya chiqmadi yoki narx kerakli darajaga yetmadi).")
        lines += ["", f"Bugungi natija: {pul(v - prev, 2, True)} ({foiz((v / prev - 1) * 100 if prev else 0, 2)})",
                  f"💰 Jami: {pul(v)} (boshida {pul(book.capital)}) → {foiz((v / book.capital - 1) * 100)}"]
        return "\n".join(lines)

    def status(self):
        if not self.st:
            return ("⚡️ Kunlik savdo (day trade) demo hali boshlanmagan.\n" + market_status() + "\n\n" + HOW +
                    "\n\nBoshlash: /menyu → ⚡️ Kunlik savdo → summani tanlang (yoki /kunlik_boshlash 1000).")
        book = self._book()
        stt = day_stats(book)
        v = book.value()
        lines = [f"⚡️ Kunlik savdo — {'✅ ishlayapti' if self.active else '⏸ to‘xtatilgan'}",
                 f"💰 {pul(v)} (boshida {pul(book.capital)}) → {pul(v - book.capital, 0, True)} "
                 f"({foiz((v / book.capital - 1) * 100)})",
                 f"Savdo kunlari: {stt['days']} • savdolar: {stt['n']} ta (✅ {stt['wins']} / 🔴 {stt['n'] - stt['wins']})"
                 + (f" • foydali kunlar: {stt['green_days']}" if stt["days"] else ""),
                 f"🧠 Strategiya: {DAY_NAMES.get(book.p.strategy, book.p.strategy)}"]
        if not book.day:
            lines.append("\nBot bugungi kunni boshlamoqda — bir necha daqiqada nomzodlar haqida xabar keladi."
                         if market_status().startswith("🟢") else
                         "\nHali savdo kuni bo'lmagan. Birja ochilgach (ochilishdan 6 daqiqa keyin) bot nomzodlarni "
                         "tanlaydi va xabar beradi.")
        if book.day:
            lines.append(f"\n📆 {sana(book.day, kun=True)}")
            if book.watch:
                lines.append("👀 Nomzodlar: " + ", ".join(book.watch))
            if self.st.get("scan") and book.p.strategy == "runner":
                lines.append("🔭 Skanerda (bugun eng ko'p o'sganlar): " + ", ".join(self.st["scan"]))
            for tk, pos in book.positions.items():
                lines.append(f"🟢 Ochiq: {tk} — {dona(pos['qty'])} dona × {pos['entry']:.2f}$, "
                             f"{pd.Timestamp(pos['time']):%H:%M} NY da olingan, himoya {pos['stop']:.2f}$")
            if book.orders:
                lines.append("⏳ Kutilmoqda (narx oshsa olinadi): " + ", ".join(
                    f"{tk} > {o['level']:.2f}$" for tk, o in book.orders.items()))
            for t in [t for t in book.trades if t["date"] == book.day]:
                lines.append(f"{'✅' if t['pnl'] > 0 else '🔴'} {t['ticker']}: {pd.Timestamp(t['entry_time']):%H:%M} → "
                             f"{pd.Timestamp(t['exit_time']):%H:%M}, {natija(t['pnl'], t['pnl_pct'])}")
        if len(book.days) > 1:
            lines.append("\nOxirgi kunlar:")
            prev = [book.capital] + [x for _, x in book.days[:-1]]
            for (d, x), pv in list(zip(book.days, prev))[-7:]:
                lines.append(f"  {sana(d, kun=True)}: {pul(x - pv, 2, True)}")
        lines.append("\n" + market_status())
        return "\n".join(lines)


RUNNER_HOW = """🚀 Tez uchayotganlar (runner) — qanday ishlaydi:
• Har 5 daqiqada Yahoo skaneridan bugun kamida +20% o'sgan aksiyalar olinadi (narx cheklovi yo'q, 0.5$ dan qimmat).
• 5 daqiqalik hajm odatdagidan ≥5 baravar oshsa — "🚀 uchmoqda" xabari (cho'qqida KIRMAYDI).
• Narx kunning cho'qqisidan kamida 8% pastga qaytib, kunlik o'rtacha narx (VWAP) ustida qolsa va yashil sham
  bilan qayta ko'tarila boshlasa — "🎯" xabari; narx shu shamning yuqorisidan oshsa sotib oladi.
• Maqsad +10% — yetsa foydani olib sotadi. Himoya — qaytishdagi eng past narx.
  60 daqiqada maqsadga yetmasa — sotadi. Kun oxirida qolganlari sotiladi.

📊 Real sinov (1 000+ aksiya, 60 kun, xarajat 0.3%): +0.8%, savdolarning 58% i foydali, pasayish −1.9%.
Cho'qqida yorib kirish esa aniq zarar bergan (−3% … −35%).
⚠️ Natija nolga yaqin — bu usulda hozircha ishonchli foyda topilmadi. Faqat kuzatish va o'rganish uchun."""

HOW = """Qanday ishlaydi:
• AQSh birjasi ochilgach (Toshkentda ~19:30) birinchi 5 daqiqada savdo hajmi odatdagidan kamida 3 baravar
  oshgan va narxi o'sgan aksiyalardan eng kuchli 5 tasi tanlanadi.
• Agar umumiy bozor (SPY) ochilishda pasaygan bo'lsa — o'sha kuni savdo qilinmaydi (himoya).
• Narx birinchi 5 daqiqaning eng yuqori nuqtasidan oshsa — bot sotib oladi.
• Himoya narxi — shu 5 daqiqaning eng past nuqtasi: narx shunga tushsa, darhol sotadi.
• Foyda maqsadi — xavfning 2 baravari: narx shunga yetsa, foydani olib sotadi.
• Kun oxirida (Toshkentda ~02:00) qolganlari sotiladi — kechaga hech narsa qolmaydi.
• Har savdoda pulning ko'pi bilan ~0.5% i xavf ostida, kuniga ko'pi bilan 6 ta savdo.
• Har bir xarid va sotuv haqida darhol xabar keladi.

⚠️ Tajriba: oxirgi 45 kunlik real sinovda eng yaxshi variant ham atigi +1.5% bergan, ko'p variantlar
zararda bo'lgan. Kunlik savdo foyda kafolat bermaydi — natijani demoda kuzating."""
