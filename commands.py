"""Bot buyruqlari: matnli javoblar tayyorlaydi (Telegram'ga bog'liq emas, sinash oson)."""
import re

import pandas as pd

from engine import (Params, backtest, stats, period_table, diagnose, buy_hold_pct, optimize, prepare,
                    market_ok)
from fmt import OY, SABAB, dona, foiz, natija, necha_kun, oraliq, pul, sana
from universe import TIERS, TIER_NAME, TIER_ICON, TIER_SHORT, SLIPPAGE, select

DEFAULT_CAPITAL = 30000.0   # umumiy (guruhlarga teng bo'linadi)
AUTO_COOLDOWN_DAYS = 28     # avtomatik sozlash o'zgarishlari orasidagi eng kam muddat
PER_TIER = None   # har guruhga shartga mos barcha aksiyalar

HELP = """📈 Demo savdo boti

Eng qulayi — /menyu: barcha amallar va sozlamalar tugmalarda.

Buyruqlar (xohlasangiz yozib ham ishlatsa bo'ladi):
/demo_boshlash 3000 — UMUMIY 3000$ virtual pul 3 guruhga teng bo'linadi
   /demo_boshlash 2000 orta arzon — faqat tanlangan guruhlar
/aksiyalar — qaysi guruhda qaysi aksiyalar, qachon va qanchaga olingan
/savdolar — sotilgan aksiyalar tarixi
/hisobot kunlik | haftalik | oylik — kunlar/haftalar/oylar bo'yicha natija
/bozor — umumiy bozor va eng kuchli aksiyalar
/tahlil — xato va ustunliklar, sozlamani tekshirish
/qabul — tahlil taklifini qo'llash (/qabul arzon — bitta guruhga)
/baho — real pulga o'tishga tayyorlik
/test — o'tgan 2 yilda sinash (/test AAPL,F 2024-01-01 2025-12-31 3000)
/strategiya momentum | breakout | combo | pullback
/xavf 1 — har savdoda kapitalning necha % i xavf ostida (0.25–2)
/kasr on | off — kasr aksiya
/avto on | off — haftalik yaxshilashni o'zi qo'llashi
/sozlamalar, /tanlash, /yangilash, /yordam

Avtomatik: har kuni 03:00 (Toshkent) kunlik hisobot; shanba — haftalik hisobot, tahlil va baho;
yangi oy — oylik hisobot va aksiyalar ro'yxatini yangilash.
⚠️ Bu demo. Natijalar kelajakdagi foydani kafolatlamaydi."""

PARAM_NAMES = {"trail_atr": "himoya masofasi", "risk_pct": "xavf %", "breakout_len": "cho'qqi davri (kun)",
               "rsi_buy": "RSI chegarasi", "sl_atr": "stop masofasi", "tp_atr": "maqsad masofasi",
               "max_days": "eng ko'p kun"}

STRATEGY_NAMES = {
    "momentum": "Momentum (tavsiya)",
    "breakout": "Breakout (yangi cho'qqi)",
    "combo": "Kombinatsiya",
    "pullback": "Pullback (eski, RSI 40)",
}

HELP_SECTIONS = {
    "how": ("⚙️ Bot qanday ishlaydi", """• Har kuni AQSh birjasi yopilgach (03:00 Toshkent) bot kunlik narxlarni oladi.
• ~250 likvid aksiya narxiga qarab 3 guruhga bo'linadi: 💎 50$+ • 🔷 10–50$ • 🔹 5–10$.
  Har guruhga savdo hajmi yetarli BARCHA aksiyalar kiradi, ro'yxat har oy yangilanadi.
• Siz kiritgan umumiy virtual pul guruhlarga teng bo'linadi — qaysi guruh yaxshi ishlashini solishtirasiz.
• Signal kun yopilganda chiqadi, xarid ertasi kuni ochilishda bo'ladi.
• Hisobda komissiya (0.05%), sirpanish/spred (0.05–0.2%) va butun aksiya cheklovi bor."""),
    "strat": ("🧠 Strategiyalar", """Bot faqat narxi uzoq vaqtdan beri o'sib kelayotgan aksiyalarni oladi
(narx oxirgi ~10 oydagi o'rtacha narxidan yuqori) va faqat umumiy bozor (S&P 500) ham o'sishda bo'lsa.

• Momentum (tavsiya) — har juma guruhda oxirgi 6 oyda eng kuchli o'sgan 5 ta aksiya olinadi.
• Breakout — narx oxirgi 50 kunlik eng yuqori narxdan oshib yopilsa olinadi.
• Kombinatsiya — ikkalasi birga (ko'proq savdo).
• Pullback — eski strategiya (RSI 40). Tarixiy sinovda foyda bermagan, faqat solishtirish uchun.

Qachon sotadi: har bir aksiyaga "himoya narxi" qo'yiladi. Aksiya o'sgan sari himoya narxi ham ko'tariladi,
pastga tushmaydi. Narx himoya narxiga tushsa — bot sotadi. Shunday qilib zarar kichik bo'ladi,
foyda esa o'sishda davom etishi mumkin (oldindan "shuncha foydada sotaman" degan chegara yo'q).
Qancha oladi: himoya narxida sotilsa guruh pulining ~1% idan ko'p yo'qotilmaydigan miqdorda;
bitta aksiyaga ko'pi bilan 20%, bir guruhda 8 tagacha aksiya."""),
    "results": ("📊 Tarixiy sinov natijalari", """2014–2026, real narxlar, har oy o'sha paytdagi ma'lumot bilan tanlangan aksiyalar:

Momentum strategiyasi (yiliga o'rtacha / eng katta pasayish / eng yomon yil):
💎 +8.7% / −17% / −6.6%
🔷 +9.8% / −17.5% / −4.0%
🔹 +9.2% / −19% / −6.4%
Eski pullback: barcha guruhlarda ~0% (ustunlik yo'q).
SPY ni shunchaki ushlab turish: +13.8% / −34% / −18%.

Xulosa: strategiya SPY dan kamroq foyda, lekin taxminan 2 baravar kichik tushish ko'rsatgan.
⚠️ Ro'yxat bugungi aksiyalardan tuzilgan (yo'qolib ketgan kompaniyalar yo'q) — real natija pastroq bo'lishi mumkin.
O'tmish kelajak kafolati emas. Shuning uchun avval demo."""),
    "adapt": ("🔄 Bozorga moslashish", """Bot bozorga quyidagicha moslashadi:
• Har juma eng kuchli o'sayotgan aksiyalarni qayta tanlaydi.
• Umumiy bozor (S&P 500) pasayishga o'tsa — yangi xarid to'xtaydi.
• Himoya narxi har bir aksiyaning o'z tebranishiga qarab qo'yiladi va narx ortidan ko'tariladi.
• Har oy aksiyalar ro'yxati yangilanadi.
• Har shanba sozlamalar oxirgi 2 yil ma'lumotida tekshiriladi.
  Yangisi faqat ko'rilmagan davrda ham sezilarli yaxshi bo'lsa taklif qilinadi.

Nega har kuni sozlamalarni o'zgartirmaydi? Sinovda "eng yaxshi sozlamaga tez-tez o'tish"
barqaror sozlamadan yaxshi natija bermadi — u o'tmishga moslashib qoladi."""),
    "daily": ("⏱ Kun ichi savdo haqida", """Kun ichi (intraday) savdo qo'shilmadi, chunki:
• Bepul narx ma'lumoti kechikadi va kun ichi tarixi juda qisqa (≈60 kun) — strategiyani ishonchli sinab bo'lmaydi.
• Spred va komissiya kichik harakatlarda foydaning katta qismini yeydi.
• Ko'p brokerlarda kichik hisobda kun ichi savdoga cheklov bor.
• Tadqiqotlarga ko'ra kun ichi savdo qiluvchilarning ko'pchiligi zarar ko'radi.
Bot kunlik grafikda ishlaydi: savdolar odatda bir necha haftadan bir necha oygacha davom etadi."""),
    "real": ("🎓 Real pulga qachon?", """/baho dagi barcha mezonlar bajarilsin:
kamida 3 oy demo, kamida 30 ta yopilgan savdo, jami foyda jami zarardan 1.3 baravar ko'p,
natija foydada, S&P 500 indeksidan yaxshi, pasayish 10% dan kam.
So'ng yo'qotsangiz ham qiynalmaydigan kichik summadan boshlang.
Kichik summada qimmat aksiyalarni butun dona olib bo'lmaydi — kasr aksiya beradigan broker kerak."""),
}

ADVICE = "\n\n".join(f"{t}\n{b}" for t, b in (HELP_SECTIONS[k] for k in ("how", "strat", "results")))


def _money(x):
    return f"{x:,.0f}$".replace(",", " ")


def fmt_stats(st, title="Natija"):
    lines = [title, f"💰 {_money(st['start_val'])} → {_money(st['end_val'])} ({foiz(st['return_pct'])})"]
    if st["n"]:
        lines.append(f"Yopilgan savdolar: {st['n']} ta — ✅ {st['wins']} foydali, 🔴 {st['losses']} zararli")
        lines.append(f"O'rtacha foyda {foiz(st['avg_win'])}, o'rtacha zarar {foiz(st['avg_loss'])}, "
                     f"o'rtacha {st['avg_days']:.0f} kun ushlangan")
    else:
        lines.append("Yopilgan savdolar hali yo'q.")
    lines.append(f"Eng katta pasayish: {foiz(st['max_dd_pct'])} • Hozir ochiq: {st['open_positions']} ta aksiya")
    return "\n".join(lines)


def fmt_diagnose(dg):
    if not dg["by_reason"]:
        return ""
    lines = ["Qanday yopilgan:"]
    for k, v in sorted(dg["by_reason"].items(), key=lambda x: -x[1]["count"]):
        lines.append(f"  • {SABAB.get(k, k)}: {int(v['count'])} ta, jami {pul(v['sum'], 0, True)}")
    tk = sorted(dg["by_ticker"].items(), key=lambda x: -x[1]["pnl"])
    best = [f"{k} {pul(v['pnl'], 0, True)}" for k, v in tk[:3] if v["pnl"] > 0]
    worst = [f"{k} {pul(v['pnl'], 0, True)}" for k, v in tk[::-1][:3] if v["pnl"] < 0]
    if best:
        lines.append("👍 Eng foydali: " + ", ".join(best))
    if worst:
        lines.append("👎 Eng zararli: " + ", ".join(worst))
    return "\n".join(lines)


def insights(st, dg):
    out = []
    if st["n"] == 0:
        return "💡 Hali yopilgan savdo yo'q — xulosa uchun erta."
    br = dg["by_reason"]
    if st["win_rate"] >= 50:
        out.append("✅ Savdolarning yarmidan ko'pi foydali.")
    if st["profit_factor"] != float("inf") and st["profit_factor"] >= 1.3:
        out.append("✅ Jami foyda jami zarardan sezilarli katta.")
    if st["profit_factor"] < 1:
        out.append("❌ Jami zarar jami foydadan ko'p.")
    sl = br.get("stop-loss", {"count": 0})["count"]
    if sl / st["n"] > 0.5 and st["n"] >= 5:
        out.append("⚠️ Yarmidan ko'pi zarar bilan yopilgan. Bu strategiyada odatiy hol: kichik zararlar ko'p, "
                   "lekin foydalilar katta bo'lishi kerak.")
    losers = [k for k, v in dg["by_ticker"].items() if v["pnl"] < 0 and v["count"] >= 3]
    if losers:
        out.append("⚠️ Doim zarar keltirgan aksiyalar: " + ", ".join(losers))
    if abs(st["max_dd_pct"]) > 15:
        out.append("⚠️ Pasayish 15% dan katta — xavf yuqori.")
    if st["n"] < 30:
        out.append(f"ℹ️ Atigi {st['n']} ta savdo — xulosa uchun kamida 30 ta kerak.")
    return "💡 " + ("\n💡 ".join(out) if out else "Alohida muammo topilmadi.")


def parse_args(args):
    tickers, dates, nums, words = None, [], [], []
    for a in args:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", a):
            dates.append(a)
        elif re.fullmatch(r"\d+(\.\d+)?", a):
            nums.append(float(a))
        elif a.lower() in TIER_NAME or a.lower() in ("hammasi", "kunlik", "haftalik", "oylik", "on", "off"):
            words.append(a.lower())
        else:
            tickers = [t.strip().upper() for t in re.split(r"[,;]", a) if t.strip()]
    return tickers, dates, nums, words


class Service:
    def __init__(self, paper, loader, cutoff_fn):
        self.paper = paper
        self.loader = loader        # loader(tickers, start, end=None) -> {tk: DataFrame}
        self.cutoff_fn = cutoff_fn  # oxirgi yopilgan savdo kuni

    def _need_demo(self):
        return None if self.paper.active else ["Demo savdo hali boshlanmagan. Umumiy summani yozing: /demo_boshlash 3000"]

    # ---------- tanlash ----------
    def _select(self):
        return select(self.loader, self.cutoff_fn(), PER_TIER)

    def cmd_select(self):
        sel, notes = self._select()
        if not any(sel.values()):
            return ["⚠️ Aksiya ma'lumotlarini yuklab bo'lmadi. Keyinroq urinib ko'ring."]
        msg = "🎯 Aksiyalar tanlandi\n" + "\n".join(notes)
        if self.paper.active:
            self.paper.set_selection(sel)
            msg += "\n\n✅ Demo savdo ro'yxati yangilandi (ochiq savdolar yopilguncha saqlanadi)."
        return [msg]

    # ---------- /test ----------
    def cmd_test(self, args):
        tickers, dates, nums, _ = parse_args(args)
        end = pd.Timestamp(dates[1]) if len(dates) > 1 else self.cutoff_fn()
        start = pd.Timestamp(dates[0]) if dates else end - pd.DateOffset(years=2)
        total = nums[0] if nums else DEFAULT_CAPITAL
        if tickers:
            groups = {"tanlangan": tickers}
            note = ""
        else:
            if self.paper.active:
                groups = {t: self.paper.book(t)["tickers"] for t in self.paper.tiers()}
            else:
                groups, _ = self._select()
            note = ("\n⚠️ Aksiyalar bugungi holatga qarab tanlangan — o'tmish sinovida natija biroz "
                    "yaxshiroq ko'rinishi mumkin (bugun kuchli bo'lganlar o'tmishda ham o'sgan).")
        all_tk = sorted({t for v in groups.values() for t in v} | {"SPY"})
        data = self.loader(all_tk, start, end)
        capital = total / len(groups)
        market = market_ok(data["SPY"]) if "SPY" in data else None
        msgs = [f"🧪 Tarixda sinash: {sana(start)} {start.year} — {sana(end)} {end.year}, umumiy {_money(total)}"
                + (f" (har guruhga {_money(capital)})" if len(groups) > 1 else "") + note]
        bh = buy_hold_pct(data["SPY"], start, end) if "SPY" in data else None
        if bh is not None:
            msgs[0] += f"\n📌 Taqqoslash: shu davrda S&P 500 indeksi (SPY) {foiz(bh)}"
        for g, tks in groups.items():
            td = {k: data[k] for k in tks if k in data}
            name = TIER_NAME.get(g, "Tanlangan aksiyalar")
            if not td:
                msgs.append(f"{name}: ma'lumot topilmadi.")
                continue
            p = self._params_for(g)
            pf = backtest(td, p, start, end, capital, market)
            st, dg = stats(pf), diagnose(pf)
            months = period_table(pf, "M", 24)
            mline = ", ".join(f"{OY[pd.Timestamp(r['date']).month - 1][:3]} {pd.Timestamp(r['date']).year % 100:02d}: "
                              f"{foiz(r['change_pct'])}" for r in months if r["trades"] or r["change"])
            msgs.append(fmt_stats(st, f"{name}\nAksiyalar: " + (', '.join(td) if len(td) <= 10 else f"{len(td)} ta")) + "\n" + fmt_diagnose(dg)
                        + "\n" + insights(st, dg) + (f"\n📅 Oylar bo'yicha: {mline}" if mline else ""))
        return msgs

    # ---------- demo ----------
    def _params_for(self, tier):
        if self.paper.active and tier in self.paper.tiers():
            return self.paper.params(tier)
        return Params(slippage=SLIPPAGE.get(tier, Params.slippage))

    def cmd_demo_start(self, args):
        _, _, nums, words = parse_args(args)
        total = nums[0] if nums else DEFAULT_CAPITAL
        if total < 100:
            return ["Umumiy summa kamida 100$ bo'lsin. Masalan: /demo_boshlash 3000"]
        want = [w for w in words if w in TIER_NAME]
        sel, notes = self._select()
        if not any(sel.values()):
            return ["⚠️ Aksiya ma'lumotlarini yuklab bo'lmadi. Keyinroq qayta urinib ko'ring."]
        if want:
            sel = {k: v for k, v in sel.items() if k in want}
        self.paper.start(sel, total)
        res = self.paper.update(self.loader, self.cutoff_fn())
        per = total / len(sel)
        msg = (f"🚀 Demo savdo boshlandi!\n\n"
               f"💰 Virtual pul: {_money(total)} — {len(sel)} guruhga {_money(per)} dan\n"
               + "\n".join(f"   {TIER_NAME[t]}: {_money(per)}" for t in sel)
               + "\n\nNima bo'ladi:\n"
               "• Har kuni ertalab 03:00 da (Toshkent) bot AQSh birjasi yopilgan narxlarni oladi.\n"
               "• Kuchli o'sayotgan aksiyalarni o'zi sotib oladi va har biriga himoya narxi qo'yadi.\n"
               "• Narx himoya narxiga tushsa — o'zi sotadi.\n"
               "• Siz har kuni qisqa hisobot olasiz. Aksiyalaringizni 💼 Aksiyalarim tugmasida ko'rasiz."
               + self._small_capital_note(per)
               + "\n\n" + "\n".join(notes))
        ev = self._events(res)
        return [msg] + ([ev] if ev else [])

    def _small_capital_note(self, per):
        p = self.paper.params(self.paper.tiers()[0]) if self.paper.tiers() else Params()
        budget = per * (8 if p.sizing == "risk" else p.pos_pct) / 100   # odatiy bitta savdo hajmi
        if not p.whole_shares or budget >= 300:
            return ""
        return (f"\n\n⚠️ Bitta xaridga ~{_money(budget)} ajratiladi va faqat butun aksiya olinadi — "
                f"{budget:.0f}$ dan qimmat aksiyalarni ololmaydi. Yechim: ⚙️ Sozlamalar → Kasr aksiya.")

    def _events(self, res, skip_trades=False):
        lines = []
        for tier, (n, events) in res.items():
            evs = [e for e in events if not (skip_trades and self._is_trade(e))]
            if skip_trades:   # sanalar faqat savdo bo'lmagan hodisa bilan birga kerak
                evs = [e for i, e in enumerate(evs) if not e.startswith("📆") or
                       (i + 1 < len(evs) and not evs[i + 1].startswith("📆"))]
            if evs:
                lines.append(f"\n{TIER_SHORT[tier]}")
                lines += ["  " + e for e in evs]
        return "\n".join(lines).strip()

    def cmd_update(self):
        if r := self._need_demo():
            return r
        res = self.paper.update(self.loader, self.cutoff_fn())
        n = max((v[0] for v in res.values()), default=0)
        ev = self._events(res)
        return [f"🔄 Yangilandi ({n} ta yangi savdo kuni)\n\n" + (ev or "Bugun xarid yoki sotuv bo'lmadi.")
                if n else "🔄 Yangi ma'lumot yo'q — birja hali yopilmagan yoki dam olish kuni."]

    def cmd_daily(self):
        """Har kungi avtomatik hisobot: yangilash + qisqa xulosa + bugungi harakatlar."""
        if r := self._need_demo():
            return r
        res = self.paper.update(self.loader, self.cutoff_fn())
        n = max((v[0] for v in res.values()), default=0)
        last = self._last_date()
        lines = [f"🌙 Kunlik hisobot — {sana(last, kun=True) if last else '—'}", "", self._summary(day=True)]
        trades = self._trade_msgs(res)
        other = self._events(res, skip_trades=True)
        lines.append("")
        lines.append(f"Bugun: {len(trades)} ta savdo (har biri alohida xabarda)." if trades else
                     "Bugun xarid yoki sotuv bo'lmadi.")
        if other:
            lines += ["", other]
        if not n:
            lines.append("ℹ️ Yangi ma'lumot kelmadi (dam olish kuni yoki narx yuklanmadi).")
        lines.append("\nBatafsil: 💼 Aksiyalarim")
        return trades + ["\n".join(lines)]

    @staticmethod
    def _is_trade(e):
        return e.startswith(("🟢", "💰", "🔻"))

    def _trade_msgs(self, res):
        """Har bir sotib olish / sotish — alohida xabar."""
        out = []
        for tier, (n, events) in res.items():
            day = None
            for e in events:
                if e.startswith("📆"):
                    day = e
                elif self._is_trade(e):
                    head = "🟢 SOTIB OLINDI" if e.startswith("🟢") else "💰 SOTILDI (foyda)" if e.startswith("💰") \
                        else "🔻 SOTILDI (zarar)"
                    body = e.split(": ", 1)[1] if ": " in e.split("\n")[0] else e
                    out.append(f"{head} — {TIER_NAME[tier]}" + (f"\n{day}" if day else "") + f"\n\n{body}")
        return out

    def _last_date(self):
        return max((self.paper.portfolio(t).last_date or "" for t in self.paper.tiers()), default="") or None

    def _summary(self, day=False):
        """Qisqa xulosa: jami va har guruh."""
        pfs = {t: self.paper.portfolio(t) for t in self.paper.tiers()}
        tot0 = sum(pf.capital for pf in pfs.values())
        tot1 = sum(pf.value() for pf in pfs.values())
        lines = [f"💰 Jami: {_money(tot1)} (boshida {_money(tot0)}) → {pul(tot1 - tot0, 0, True)} "
                 f"({foiz((tot1 / tot0 - 1) * 100 if tot0 else 0)})"]
        if day:
            prev = sum(pf.equity[-2][1] if len(pf.equity) > 1 else pf.capital for pf in pfs.values())
            lines.append(f"   Oxirgi kunda: {pul(tot1 - prev, 0, True)} ({foiz((tot1 / prev - 1) * 100 if prev else 0, 2)})")
        bh = self._bench_pct()
        if bh is not None:
            lines.append(f"📌 Taqqoslash: S&P 500 indeksi (SPY) shu davrda {foiz(bh)}")
        lines.append("")
        for t, pf in pfs.items():
            v = pf.value()
            lines.append(f"{TIER_SHORT[t]}: {_money(v)} ({foiz((v / pf.capital - 1) * 100)}) • "
                         f"{len(pf.positions)} ta aksiya")
        return "\n".join(lines)

    def _bench_pct(self):
        b = (self.paper.state or {}).get("bench") or {}
        return round((b["last"] / b["start"] - 1) * 100, 2) if b.get("start") and b.get("last") else None

    def cmd_grade(self):
        """Real pulga o'tishdan oldin bajarilishi kerak bo'lgan mezonlar."""
        if r := self._need_demo():
            return r
        pfs = [self.paper.portfolio(t) for t in self.paper.tiers()]
        trades = [t for pf in pfs for t in pf.trades]
        gw = sum(t["pnl"] for t in trades if t["pnl"] > 0)
        gl = -sum(t["pnl"] for t in trades if t["pnl"] <= 0)
        pfac = gw / gl if gl > 0 else (float("inf") if gw > 0 else 0.0)
        tot0 = sum(pf.capital for pf in pfs)
        tot1 = sum(pf.value() for pf in pfs)
        ret = (tot1 / tot0 - 1) * 100 if tot0 else 0.0
        dd = min(stats(pf)["max_dd_pct"] for pf in pfs)
        days = (pd.Timestamp.now() - pd.Timestamp(self.paper.state.get("started"))).days
        bh = self._bench_pct()
        ratio = "∞" if pfac == float("inf") else f"{pfac:.1f}"
        checks = [
            (days >= 90, f"Kamida 3 oy sinash — hozir {days} kun"),
            (len(trades) >= 30, f"Kamida 30 ta yopilgan savdo — hozir {len(trades)} ta"),
            (pfac >= 1.3, f"Jami foyda jami zarardan 1.3 baravar ko'p — hozir {ratio} baravar"),
            (ret > 0, f"Umumiy natija foydada — hozir {foiz(ret)}"),
            (bh is not None and ret > bh, f"S&P 500 indeksidan yaxshi — bot {foiz(ret)}, indeks "
                                          f"{'—' if bh is None else foiz(bh)}"),
            (dd > -10, f"Hech bir guruhda pasayish 10% dan oshmagan — eng katta {foiz(dd)}"),
        ]
        ok = sum(c for c, _ in checks)
        lines = ["🎓 Real pulga o'tishga tayyorlik", ""] + [("✅ " if c else "⬜ ") + t for c, t in checks]
        lines.append("\n" + ("🎉 Hammasi bajarildi. Yo'qotsangiz ham qiynalmaydigan kichik summadan boshlash mumkin."
                             if ok == len(checks) else
                             f"{ok} / {len(checks)} bajarildi — real pul bilan boshlashga hali erta."))
        return ["\n".join(lines)]

    def cmd_status(self):
        """💼 Aksiyalarim: har guruhda qaysi aksiyalar, qachon, nechtadan, qanchaga olingan."""
        if r := self._need_demo():
            return r
        last = self._last_date()
        msgs = [f"💼 Aksiyalarim — {sana(last) if last else '—'} holatiga\n\n" + self._summary()]
        for tier in self.paper.tiers():
            pf = self.paper.portfolio(tier)
            v = pf.value()
            inv = v - pf.cash
            lines = [f"{TIER_NAME[tier].upper()}",
                     f"Jami {_money(v)} ({foiz((v / pf.capital - 1) * 100)}) — naqd {_money(pf.cash)}, "
                     f"aksiyalarda {_money(inv)}"]
            if not pf.positions:
                lines.append("\nHozircha aksiya yo'q.")
            items = sorted(pf.positions.items(), key=lambda x: x[1]["entry_date"])
            for i, (tk, pos) in enumerate(items, 1):
                c = pf.last_close.get(tk, pos["entry"])
                cost, now = pos["qty"] * pos["entry"], pos["qty"] * c
                lines += [f"\n{i}) {tk}",
                          f"   📅 Olingan: {sana(pos['entry_date'])} ({necha_kun(pos['entry_date'], last)})",
                          f"   🛒 {dona(pos['qty'])} dona × {pos['entry']:.2f}$ = {pul(cost, 2)}",
                          f"   📈 Hozir: {c:.2f}$ → {pul(now, 2)}   {natija(now - cost, (c / pos['entry'] - 1) * 100)}",
                          f"   🛡 Himoya narxi: {pos['stop']:.2f}$ (bundan tushsa sotiladi)"]
            if pf.pending:
                lines.append("\n🔔 Keyingi savdo kuni sotib olinadi: " + ", ".join(pf.pending))
            msgs.append("\n".join(lines))
        return msgs

    def cmd_trades(self, n=15):
        """📜 Yopilgan savdolar tarixi."""
        if r := self._need_demo():
            return r
        rows = [(t, tier) for tier in self.paper.tiers() for t in self.paper.portfolio(tier).trades]
        if not rows:
            return ["📜 Savdolar tarixi\n\nHali birorta savdo yopilmagan. Aksiya sotilganda shu yerda ko'rinadi."]
        rows.sort(key=lambda x: x[0]["exit_date"], reverse=True)
        lines = [f"📜 Yopilgan savdolar (oxirgi {min(n, len(rows))} ta)"]
        for t, tier in rows[:n]:
            lines += [f"\n{TIER_ICON[tier]} {t['ticker']}: {sana(t['entry_date'])} olindi → {sana(t['exit_date'])} sotildi "
                      f"({t['days']} kun)",
                      f"   {t['entry']:.2f}$ → {t['exit']:.2f}$   {natija(t['pnl'], t['pnl_pct'])}",
                      f"   Sabab: {SABAB.get(t['reason'], t['reason'])}"]
        tr = [t for t, _ in rows]
        w = sum(t["pnl"] > 0 for t in tr)
        lines.append(f"\nJami: {len(tr)} ta savdo — ✅ {w} foydali, 🔴 {len(tr) - w} zararli, "
                     f"natija {pul(sum(t['pnl'] for t in tr), 0, True)}")
        return ["\n".join(lines)]

    def cmd_report(self, args):
        if r := self._need_demo():
            return r
        _, _, _, words = parse_args(args)
        kind = next((w for w in words if w in ("kunlik", "haftalik", "oylik")), "kunlik")
        freq, n = {"kunlik": ("D", 10), "haftalik": ("W", 8), "oylik": ("M", 12)}[kind]
        tiers = self.paper.tiers()
        tables = {t: {r["label"]: r for r in period_table(self.paper.portfolio(t), freq, n)} for t in tiers}
        labels = sorted({l for tb in tables.values() for l in tb})[-n:]
        title = {"kunlik": "Kunlar", "haftalik": "Haftalar", "oylik": "Oylar"}[kind]
        lines = [f"📅 {title} bo'yicha natija", ""]
        for l in labels:
            rows = [tables[t].get(l) for t in tiers]
            ch = sum(r["change"] for r in rows if r)
            base = sum(r["value"] - r["change"] for r in rows if r)
            tr = sum(r["trades"] for r in rows if r)
            lines.append(f"{self._label(kind, next(r for r in rows if r))}: {pul(ch, 0, True)} ({foiz(ch / base * 100 if base else 0, 2)})"
                         + (f" • {tr} ta sotuv" if tr else ""))
            lines.append("   " + "  ".join(f"{TIER_ICON[t]} {foiz(r['change_pct'], 1)}" if r else f"{TIER_ICON[t]} —"
                                           for t, r in zip(tiers, rows)))
        lines.append("\n💎 qimmat • 🔷 o'rtacha • 🔹 arzon guruh")
        return ["\n".join(lines)]

    @staticmethod
    def _label(kind, row):
        d = pd.Timestamp(row["date"])
        if kind == "kunlik":
            return sana(d, kun=True)
        if kind == "haftalik":
            return oraliq(d - pd.Timedelta(days=4), d)
        return f"{OY[d.month - 1].capitalize()} {d.year}"

    def cmd_market(self):
        cutoff = self.cutoff_fn()
        if self.paper.active:
            groups = {t: self.paper.book(t)["tickers"] for t in self.paper.tiers()}
        else:
            groups, _ = self._select()
        data = self.loader(sorted({t for v in groups.values() for t in v} | {"SPY"}), cutoff, cutoff)
        lines = [f"🌍 Bozor holati — {sana(cutoff, kun=True)}"]
        if "SPY" in data:
            m = market_ok(data["SPY"])
            ok = m[max(m)] if m else None
            filt = self._params_for(next(iter(groups), None)).market_filter
            lines.append("\nUmumiy bozor (S&P 500): " + (
                "📈 o'sishda — bot yangi aksiya sotib olishi mumkin" if ok else
                "📉 pasayishda — himoya uchun bot yangi aksiya sotib olmaydi" if filt else
                "📉 pasayishda (bozor filtri o'chirilgan — bot baribir sotib oladi)"))
        for tier, tks in groups.items():
            p = self._params_for(tier)
            rows = []
            for tk in tks:
                if tk in data and len(data[tk]) > p.slow:
                    rows.append((tk, prepare(data[tk], p).iloc[-1]))
            up = [x for x in rows if x[1]["up"]]
            up.sort(key=lambda x: -x[1]["mom"])
            lines.append(f"\n{TIER_NAME[tier]}\n{len(rows)} ta aksiyadan {len(up)} tasi o'sishda. Eng kuchlilari:")
            for tk, r in up[:6]:
                lines.append(f"  • {tk}: {r['Close']:.2f}$ — 6 oyda {foiz(r['mom'] * 100, 0)}")
        return ["\n".join(lines)]

    # ---------- tahlil va yaxshilash ----------
    def cmd_analyze(self, auto=False):
        if r := self._need_demo():
            return r
        end = self.cutoff_fn()
        start = end - pd.DateOffset(years=2)
        all_tk = sorted({t for tier in self.paper.tiers() for t in self.paper.book(tier)["tickers"]} | {"SPY"})
        data = self.loader(all_tk, start, end)
        market = market_ok(data["SPY"]) if "SPY" in data else None
        msgs = []
        for tier in self.paper.tiers():
            b = self.paper.book(tier)
            p = self.paper.params(tier)
            pf = self.paper.portfolio(tier)
            st, dg = stats(pf), diagnose(pf)
            t = fmt_stats(st, f"🧭 {TIER_NAME[tier]}")
            if d := fmt_diagnose(dg):
                t += "\n" + d
            t += "\n" + insights(st, dg)
            res = optimize({k: data[k] for k in b["tickers"] if k in data}, p, start, end, market=market)
            if not res["ok"]:
                msgs.append(t + "\n⚠️ " + res["why"])
                continue
            t += (f"\n\n🛠 Sozlamani tekshirish (oxirgi 2 yil tarixida):\n"
                  f"   Joriy sozlama: {foiz(res['cur_test']['return_pct'])}\n"
                  f"   Muqobil sozlama: {foiz(res['best_test']['return_pct'])}"
                  + (" (" + ", ".join(f"{PARAM_NAMES.get(k, k)} {a}→{b2}" for k, (a, b2) in res["changed"].items()) + ")"
                     if res["changed"] else ""))
            if res["recommend"]:
                b["suggested"] = res["best"].to_dict()
                self.paper.save()
                hist = b.get("history") or []
                recent = hist and (pd.Timestamp.now() - pd.Timestamp(hist[-1]["date"])).days < AUTO_COOLDOWN_DAYS
                if auto and self.paper.state.get("auto_apply") and recent:
                    t += (f"\n⏸ Muqobil yaxshiroq, lekin oxirgi o'zgarishdan {AUTO_COOLDOWN_DAYS} kun o'tmagan — "
                          f"tez-tez o'zgartirish ham xato. Qo'lda: /qabul {tier}")
                elif auto and self.paper.state.get("auto_apply"):
                    self.paper.set_params(tier, res["best"], "avtomatik haftalik yaxshilash")
                    t += "\n✅ Avtomatik qo'llandi."
                else:
                    t += (f"\n🔎 Muqobil yaxshiroq ko'rindi, lekin 12 yillik sinovda joriy sozlama barqarorroq chiqqan — "
                          f"qisqa davrdagi ustunlik ko'pincha tasodif. Baribir sinamoqchi bo'lsangiz: /qabul {tier}")
            else:
                t += "\n➖ Joriy sozlama qoladi."
            msgs.append(t)
        msgs.append("ℹ️ Bot sozlamani faqat tarixda ham, yangi davrda ham sezilarli yaxshi bo'lsagina taklif qiladi.")
        return msgs

    def cmd_accept(self, args):
        if r := self._need_demo():
            return r
        _, _, _, words = parse_args(args)
        tiers = [w for w in words if w in TIER_NAME] or self.paper.tiers()
        done = []
        for t in tiers:
            s = self.paper.book(t).get("suggested")
            if s:
                self.paper.set_params(t, Params.from_dict(s), "foydalanuvchi qabul qildi")
                done.append(TIER_NAME[t])
        return ["✅ Qo'llandi: " + ", ".join(done) if done else "Hozircha taklif yo'q. Avval /tahlil"]

    def cmd_auto(self, args):
        if r := self._need_demo():
            return r
        on = bool(args) and args[0].lower() in ("on", "yoq", "ha", "1")
        self.paper.state["auto_apply"] = on
        self.paper.save()
        return ["🤖 Avtomatik yaxshilash: " + ("YOQILDI" if on else "O'CHIRILDI")]

    def cmd_settings(self):
        tiers = self.paper.tiers() or [None]
        p0 = self._params_for(tiers[0])
        yes = lambda b: "✅ yoqilgan" if b else "⬜ o'chirilgan"
        lines = ["⚙️ Sozlamalar", ""]
        if self.paper.active:
            lines.append(f"💰 Virtual pul: {_money(self.paper.total_capital)} — "
                         + ", ".join(f"{TIER_ICON[t]} {_money(self.paper.book(t)['portfolio']['capital'])}"
                                     for t in self.paper.tiers()))
        lines.append(f"🧠 Strategiya: {STRATEGY_NAMES.get(p0.strategy, p0.strategy)}")
        if p0.sizing == "risk":
            lines.append(f"📏 Xavf darajasi: {p0.risk_pct:g}% — bitta aksiya himoya narxida sotilsa, guruh pulining "
                         f"ko'pi bilan {p0.risk_pct:g}% i yo'qotiladi")
            lines.append(f"📦 Bir guruhda ko'pi bilan {p0.max_pos} ta aksiya, bittasiga pulning ≤{p0.pos_pct:g}% i")
        else:
            lines.append(f"📏 Har xaridga guruh pulining {p0.pos_pct:g}% i")
        if p0.trail_atr:
            lines.append("🛡 Himoya narxi: aksiya narxi o'sgan sari ko'tariladi, tushsa — bot sotadi")
        else:
            lines.append(f"🛡 Himoya: zarar chegarasi va maqsad narx, ko'pi bilan {p0.max_days} kun")
        lines.append(f"🧩 Kasr aksiya: {yes(not p0.whole_shares)}")
        lines.append(f"🌍 Bozor filtri (bozor tushsa xarid qilmaslik): {yes(p0.market_filter)}")
        lines.append(f"🤖 Sozlamani o'zi yaxshilash: {yes((self.paper.state or {}).get('auto_apply'))}")
        if self.paper.active:
            lines.append("\nKuzatilayotgan aksiyalar: " + ", ".join(
                f"{TIER_ICON[t]} {len(self.paper.book(t)['tickers'])} ta" for t in self.paper.tiers()))
        return ["\n".join(lines)]

    def cmd_share(self, args):
        """Trend strategiyalarida — xavf foizi, pullback'da — har savdoga ulush."""
        if r := self._need_demo():
            return r
        _, _, nums, _ = parse_args(args)
        p = self.paper.params(self.paper.tiers()[0])
        if p.sizing == "risk":
            if not nums or not 0.25 <= nums[0] <= 2:
                return ["Masalan: /xavf 1 — stop tegsa guruh kapitalining 1% i yo'qotiladi (0.25–2)"]
            self.paper.set_all_params("xavf o'zgartirildi", risk_pct=nums[0])
            return [f"✅ Har savdoda xavf: {nums[0]:g}%"]
        if not nums or not 1 <= nums[0] <= 50:
            return ["Masalan: /ulush 15 — har savdoga guruh kapitalining 15% i (1–50 oralig'ida)"]
        self.paper.set_all_params("ulush o'zgartirildi", pos_pct=nums[0])
        return [f"✅ Har savdoga endi guruh kapitalining {nums[0]:g}% i ajratiladi."]

    def cmd_strategy(self, args):
        if r := self._need_demo():
            return r
        name = (args[0].lower() if args else "")
        if name not in STRATEGY_NAMES:
            return ["Strategiyalar: " + ", ".join(STRATEGY_NAMES) + "\nMasalan: /strategiya momentum"]
        for tier in self.paper.tiers():
            old = self.paper.params(tier)
            keep = dict(slippage=old.slippage, whole_shares=old.whole_shares, market_filter=old.market_filter)
            self.paper.set_params(tier, Params.preset(name, **keep), f"strategiya: {name}")
        return [f"✅ Strategiya: {STRATEGY_NAMES[name]}. Ochiq savdolar yangi qoidalar bo'yicha davom etadi."]

    def cmd_filter(self, args):
        if r := self._need_demo():
            return r
        on = not args or args[0].lower() == "on"
        self.paper.set_all_params("bozor filtri", market_filter=on)
        return ["🛡 Bozor filtri " + ("yoqildi" if on else "o'chirildi")]

    def cmd_fractional(self, args):
        if r := self._need_demo():
            return r
        if not args or args[0].lower() not in ("on", "off"):
            return ["/kasr on — kasr aksiya ruxsat; /kasr off — faqat butun aksiya"]
        on = args[0].lower() == "on"
        self.paper.set_all_params("kasr aksiya sozlamasi", whole_shares=not on)
        return ["✅ " + ("Kasr aksiya yoqildi." if on else "Endi faqat butun aksiya olinadi.")]

    # ---------- marshrutlash ----------
    LONG = ("/test", "/tahlil", "/demo_boshlash", "/yangilash", "/bozor", "/tanlash")

    def handle(self, text):
        parts = text.strip().split()
        if not parts:
            return []
        cmd, args = parts[0].split("@")[0].lower(), parts[1:]
        table = {
            "/start": lambda: [HELP], "/yordam": lambda: [HELP], "/help": lambda: [HELP],
            "/tavsiya": lambda: [ADVICE],
            "/test": lambda: self.cmd_test(args),
            "/demo_boshlash": lambda: self.cmd_demo_start(args),
            "/tanlash": self.cmd_select, "/savdolar": self.cmd_trades, "/aksiyalar": self.cmd_status,
            "/yangilash": self.cmd_daily, "/holat": self.cmd_status,
            "/hisobot": lambda: self.cmd_report(args), "/bozor": self.cmd_market,
            "/tahlil": lambda: self.cmd_analyze(), "/qabul": lambda: self.cmd_accept(args),
            "/avto": lambda: self.cmd_auto(args), "/sozlamalar": self.cmd_settings,
            "/ulush": lambda: self.cmd_share(args), "/xavf": lambda: self.cmd_share(args),
            "/kasr": lambda: self.cmd_fractional(args), "/strategiya": lambda: self.cmd_strategy(args),
            "/filtr": lambda: self.cmd_filter(args),
            "/baho": self.cmd_grade,
        }
        fn = table.get(cmd)
        return fn() if fn else ["Noma'lum buyruq. /yordam"]
