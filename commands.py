"""Bot buyruqlari: matnli javoblar tayyorlaydi (Telegram'ga bog'liq emas, sinash oson)."""
import re

import pandas as pd

from engine import (Params, backtest, stats, period_table, diagnose, buy_hold_pct, optimize, prepare,
                    market_ok)
from universe import TIERS, TIER_NAME, TIER_ICON, SLIPPAGE, select

DEFAULT_CAPITAL = 30000.0   # umumiy (guruhlarga teng bo'linadi)
AUTO_COOLDOWN_DAYS = 28     # avtomatik sozlash o'zgarishlari orasidagi eng kam muddat
PER_TIER = None   # har guruhga shartga mos barcha aksiyalar

HELP = """📈 Demo savdo boti

Eng qulayi — /menyu: barcha amallar va sozlamalar tugmalarda.

Buyruqlar (xohlasangiz yozib ham ishlatsa bo'ladi):
/demo_boshlash 3000 — UMUMIY 3000$ virtual pul 3 guruhga teng bo'linadi
   /demo_boshlash 2000 orta arzon — faqat tanlangan guruhlar
/holat — portfel va ochiq savdolar
/hisobot kunlik | haftalik | oylik
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
    "strat": ("🧠 Strategiyalar", """Hammasi faqat ko'tarilish trendida xarid qiladi (narx > EMA200, EMA50 > EMA200)
va umumiy bozor (SPY) 200 kunlik o'rtachadan yuqori bo'lsa.

• Momentum (tavsiya) — har juma guruhda oxirgi 6 oyda eng kuchli o'sgan 5 ta aksiya olinadi.
• Breakout — narx oxirgi 50 kunlik eng yuqori narxdan oshib yopilsa olinadi.
• Kombinatsiya — ikkalasi birga (ko'proq savdo).
• Pullback — eski strategiya (RSI 40). Tarixiy sinovda foyda bermagan, faqat solishtirish uchun.

Chiqish (momentum/breakout/kombinatsiya): take-profit yo'q — foyda o'sishiga ruxsat beriladi.
Stop narx ortidan 4 ATR masofada ko'tarilib boradi (trailing stop): narx tushsa — chiqadi.
Hajm: stop tegsa guruh kapitalining ~1% i yo'qotiladi; bitta aksiyaga ko'pi bilan 20%, 8 tagacha savdo."""),
    "results": ("📊 Tarixiy sinov natijalari", """2014–2026, real narxlar, har oy o'sha paytdagi ma'lumot bilan tanlangan aksiyalar:

Momentum + trailing 4 ATR (yiliga o'rtacha / eng katta tushish / eng yomon yil):
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
• Umumiy bozor tushishga o'tsa (SPY < 200 kunlik o'rtacha) — yangi xarid to'xtaydi.
• Stop har bir aksiyaning o'z tebranishiga (ATR) qarab qo'yiladi va narx ortidan ko'tariladi.
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
≥3 oy demo, ≥30 yopilgan savdo, profit factor ≥1.3, natija ijobiy, SPY dan yaxshi, tushish <10%.
So'ng yo'qotsangiz ham qiynalmaydigan kichik summadan boshlang.
Kichik summada qimmat aksiyalarni butun dona olib bo'lmaydi — kasr aksiya beradigan broker kerak."""),
}

ADVICE = "\n\n".join(f"{t}\n{b}" for t, b in (HELP_SECTIONS[k] for k in ("how", "strat", "results")))


def _money(x):
    return f"{x:,.0f}$".replace(",", " ")


def fmt_stats(st, title="Natija"):
    pf = "∞" if st["profit_factor"] == float("inf") else st["profit_factor"]
    return (f"{title}\n"
            f"{_money(st['start_val'])} → {_money(st['end_val'])} ({st['return_pct']:+.2f}%), "
            f"eng katta tushish {st['max_dd_pct']:.1f}%\n"
            f"Savdolar: {st['n']} (✅ {st['wins']} / 🔴 {st['losses']}), yutuq {st['win_rate']}%, "
            f"o'rt. foyda {st['avg_win']:+.2f}%, o'rt. zarar {st['avg_loss']:+.2f}%\n"
            f"Profit factor: {pf}, o'rt. ushlab turish {st['avg_days']} kun, ochiq: {st['open_positions']}")


def fmt_diagnose(dg):
    if not dg["by_reason"]:
        return "🔍 Yopilgan savdolar hali yo'q."
    lines = ["🔍 Chiqish sabablari: " + "; ".join(
        f"{k} {int(v['count'])} ta ({v['sum']:+.0f}$)" for k, v in dg["by_reason"].items())]
    lines.append("🏷 " + "; ".join(f"{k} {v['pnl']:+.0f}$ ({int(v['count'])})"
                                   for k, v in sorted(dg["by_ticker"].items(), key=lambda x: -x[1]["pnl"])))
    return "\n".join(lines)


def insights(st, dg):
    out = []
    if st["n"] == 0:
        return "💡 Savdo bo'lmadi — davr qisqa yoki bozor trendsiz."
    br = dg["by_reason"]
    if st["win_rate"] >= 50:
        out.append("✅ Savdolarning yarmidan ko'pi foydali.")
    if st["profit_factor"] != float("inf") and st["profit_factor"] >= 1.3:
        out.append("✅ Foydalar zararlardan sezilarli katta.")
    if st["profit_factor"] < 1:
        out.append("❌ Zararlar foydadan ko'p.")
    sl = br.get("stop-loss", {"count": 0})["count"]
    if sl / st["n"] > 0.5:
        out.append("⚠️ Yarmidan ko'pi stop-loss bilan yopilgan — stop yaqin yoki kirish erta.")
    md = br.get("muddat tugadi", {"count": 0, "sum": 0})
    if md["count"] and md["sum"] < 0:
        out.append("⚠️ Muddati tugab yopilganlar zararda.")
    tb = br.get("trend buzildi", {"count": 0, "sum": 0})
    if tb["count"] >= 3 and tb["sum"] < 0:
        out.append("⚠️ Trend tez-tez buzilgan — bozor yon tomonga yurgan.")
    losers = [k for k, v in dg["by_ticker"].items() if v["pnl"] < 0 and v["count"] >= 3]
    if losers:
        out.append("⚠️ Doimiy zarar: " + ", ".join(losers))
    if abs(st["max_dd_pct"]) > 15:
        out.append("⚠️ Tushish 15% dan katta — xavf yuqori.")
    return "💡 " + (" ".join(out) if out else "Alohida muammo topilmadi.")


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
        msgs = [f"🧪 Sinov: {start.date()} — {end.date()}, umumiy {_money(total)}"
                + (f" (har guruhga {_money(capital)})" if len(groups) > 1 else "") + note]
        bh = buy_hold_pct(data["SPY"], start, end) if "SPY" in data else None
        if bh is not None:
            msgs[0] += f"\n📌 Shu davrda SPY ni shunchaki ushlab tursangiz: {bh:+.2f}%"
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
            mline = " ".join(f"{r['label'][2:]}:{r['change_pct']:+.1f}%" for r in months if r["trades"] or r["change"])
            msgs.append(fmt_stats(st, f"{name}\nAksiyalar: " + (', '.join(td) if len(td) <= 10 else f"{len(td)} ta")) + "\n" + fmt_diagnose(dg)
                        + "\n" + insights(st, dg) + (f"\n📅 Oylar: {mline}" if mline else ""))
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
            return ["⚠️ Aksiya ma'lumotlarini yuklab bo'lmadi. Keyinroq /demo_boshlash qiling."]
        if want:
            sel = {k: v for k, v in sel.items() if k in want}
        self.paper.start(sel, total)
        res = self.paper.update(self.loader, self.cutoff_fn())
        per = total / len(sel)
        msg = (f"🚀 Demo savdo boshlandi — umumiy {_money(total)} virtual pul, "
               f"{len(sel)} guruhga {_money(per)} dan\n\n" + "\n".join(notes)
               + "\n\nHar kuni AQSh birjasi yopilgandan keyin bot signallarni o'zi tekshiradi va savdo qiladi."
               + self._small_capital_note(per))
        ev = self._events(res)
        return [msg] + ([ev] if ev else [])

    def _small_capital_note(self, per):
        p = self.paper.params(self.paper.tiers()[0]) if self.paper.tiers() else Params()
        budget = per * (8 if p.sizing == "risk" else p.pos_pct) / 100   # odatiy bitta savdo hajmi
        if not p.whole_shares or budget >= 300:
            return ""
        return (f"\n\n⚠️ Bitta savdoga odatda ~{_money(budget)} ajratiladi va faqat butun aksiya olinadi — "
                f"narxi {budget:.0f}$ dan qimmat aksiyalarni sotib ololmaydi. Yechim: kattaroq summa yoki "
                f"brokeringiz kasr aksiyaga ruxsat bersa /kasr on (yoki /menyu → Sozlamalar).")

    def _events(self, res):
        lines = []
        for tier, (n, events) in res.items():
            if events:
                lines.append(TIER_NAME[tier])
                lines += events
        return "\n".join(lines)

    def cmd_update(self):
        if r := self._need_demo():
            return r
        res = self.paper.update(self.loader, self.cutoff_fn())
        n = max((v[0] for v in res.values()), default=0)
        ev = self._events(res)
        return [f"🔄 Yangi savdo kunlari: {n}\n" + (ev or ("Savdo harakati bo'lmadi." if n else "Yangi yopilgan kun yo'q."))]

    def _summary(self):
        lines, tot0, tot1 = [], 0, 0
        for tier in self.paper.tiers():
            pf = self.paper.portfolio(tier)
            st = stats(pf)
            tot0 += st["start_val"]
            tot1 += st["end_val"]
            lines.append(f"{TIER_NAME[tier]}: {_money(st['end_val'])} ({st['return_pct']:+.2f}%) | "
                         f"savdo {st['n']}, yutuq {st['win_rate']}% | ochiq {st['open_positions']}")
        lines.append(f"Jami: {_money(tot0)} → {_money(tot1)} ({(tot1 / tot0 - 1) * 100 if tot0 else 0:+.2f}%)")
        bh = self._bench_pct()
        if bh is not None:
            lines.append(f"📌 Taqqoslash: shu davrda SPY ni shunchaki ushlab tursangiz {bh:+.2f}%")
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
        checks = [
            (days >= 90, f"Kamida 3 oy demo: {days} kun"),
            (len(trades) >= 30, f"Kamida 30 ta yopilgan savdo (kam savdo — tasodif): {len(trades)} ta"),
            (pfac >= 1.3, f"Profit factor ≥ 1.3: {'∞' if pfac == float('inf') else round(pfac, 2)}"),
            (ret > 0, f"Umumiy natija ijobiy: {ret:+.2f}%"),
            (bh is not None and ret > bh, f"SPY ni ushlab turishdan yaxshi: {ret:+.2f}% vs "
                                          f"{'—' if bh is None else f'{bh:+.2f}%'}"),
            (dd > -10, f"Har guruhda eng katta tushish 10% dan kam: {dd:.1f}%"),
        ]
        ok = sum(c for c, _ in checks)
        lines = ["🎓 Real pulga o'tishga tayyorlik"] + [("✅ " if c else "⬜ ") + t for c, t in checks]
        lines.append("\n" + ("Barcha mezonlar bajarildi. Kichik summadan (yo'qotsangiz ham qiynalmaydigan) boshlash mumkin."
                             if ok == len(checks) else
                             f"{ok}/{len(checks)} bajarildi — hali real pul bilan boshlash erta."))
        return ["\n".join(lines)]

    def cmd_status(self):
        if r := self._need_demo():
            return r
        last = max((self.paper.portfolio(t).last_date or "" for t in self.paper.tiers()), default="")
        lines = [f"📊 Demo portfel ({last or '—'})", self._summary()]
        for tier in self.paper.tiers():
            pf = self.paper.portfolio(tier)
            if pf.positions or pf.pending:
                lines.append(f"\n{TIER_NAME[tier]}:")
                for tk, pos in pf.positions.items():
                    c = pf.last_close.get(tk, pos["entry"])
                    lines.append(f"• {tk}: {pos['entry']:.2f} → {c:.2f} ({(c / pos['entry'] - 1) * 100:+.2f}%), "
                                 f"stop {pos['stop']:.2f}" + (f", take {pos['take']:.2f}" if pos.get("take") else " (trailing)")
                                 + f", {pos['bars']} kun")
                if pf.pending:
                    lines.append("🔔 Ertaga xarid: " + ", ".join(pf.pending))
        return ["\n".join(lines)]

    def cmd_report(self, args):
        if r := self._need_demo():
            return r
        _, _, _, words = parse_args(args)
        kind = next((w for w in words if w in ("kunlik", "haftalik", "oylik")), "kunlik")
        freq, n = {"kunlik": ("D", 7), "haftalik": ("W", 8), "oylik": ("M", 12)}[kind]
        tables = {t: {r["label"]: r for r in period_table(self.paper.portfolio(t), freq, n)} for t in self.paper.tiers()}
        labels = sorted({l for tb in tables.values() for l in tb})[-n:]
        lines = [f"📅 {kind.capitalize()} hisobot  ({' | '.join(TIER_NAME[t] for t in self.paper.tiers())})"]
        for l in labels:
            cells = []
            for t in self.paper.tiers():
                r = tables[t].get(l)
                cells.append(f"{TIER_ICON[t]} {r['change_pct']:+.2f}%" + (f" ({r['trades']}s)" if r["trades"] else "")
                             if r else f"{TIER_ICON[t]} —")
            lines.append(f"{l}: " + "  ".join(cells))
        return ["\n".join(lines)] + self.cmd_status()

    def cmd_market(self):
        cutoff = self.cutoff_fn()
        if self.paper.active:
            groups = {t: self.paper.book(t)["tickers"] for t in self.paper.tiers()}
        else:
            groups, _ = self._select()
        data = self.loader(sorted({t for v in groups.values() for t in v} | {"SPY"}), cutoff, cutoff)
        lines = [f"🌍 Bozor holati ({cutoff.date()})"]
        if "SPY" in data:
            m = market_ok(data["SPY"])
            ok = m[max(m)] if m else None
            lines.append("SPY (umumiy bozor): " + ("📈 200 kunlik o'rtachadan yuqori — xarid ruxsat" if ok else
                                                   "📉 200 kunlik o'rtachadan past — yangi xarid to'xtatilgan"))
        for tier, tks in groups.items():
            p = self._params_for(tier)
            rows = []
            for tk in tks:
                if tk in data and len(data[tk]) > p.slow:
                    rows.append((tk, prepare(data[tk], p).iloc[-1]))
            up = [x for x in rows if x[1]["up"]]
            up.sort(key=lambda x: -x[1]["mom"])
            lines.append(f"\n{TIER_NAME[tier]} — trendda {len(up)}/{len(rows)}. Eng kuchlilari:")
            for tk, r in up[:6]:
                lines.append(f"• {tk}: {r['Close']:.2f}$, 6 oyda {r['mom'] * 100:+.0f}%"
                             + (" 🔔 breakout" if r["signal"] else ""))
            sig = [tk for tk, r in rows if r["signal"]]
            if sig and p.strategy in ("breakout", "combo", "pullback"):
                lines.append("🔔 Bugungi signallar: " + ", ".join(sig))
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
            t = fmt_stats(st, f"🧭 {TIER_NAME[tier]} — demo") + "\n" + fmt_diagnose(dg) + "\n" + insights(st, dg)
            res = optimize({k: data[k] for k in b["tickers"] if k in data}, p, start, end, market=market)
            if not res["ok"]:
                msgs.append(t + "\n⚠️ " + res["why"])
                continue
            t += (f"\n\n🛠 Oxirgi 2 yil sinovi (o'rganish → tekshirish {res['cut']} dan):\n"
                  f"Joriy: {res['cur_train']['return_pct']:+.1f}% ({res['cur_train']['n']}s) → "
                  f"{res['cur_test']['return_pct']:+.1f}% ({res['cur_test']['n']}s)\n"
                  f"Eng yaxshi: {res['best_train']['return_pct']:+.1f}% ({res['best_train']['n']}s) → "
                  f"{res['best_test']['return_pct']:+.1f}% ({res['best_test']['n']}s)")
            if res["changed"]:
                t += "\nO'zgarish: " + ", ".join(f"{k} {a}→{b2}" for k, (a, b2) in res["changed"].items())
            if res["recommend"]:
                b["suggested"] = res["best"].to_dict()
                self.paper.save()
                hist = b.get("history") or []
                recent = hist and (pd.Timestamp.now() - pd.Timestamp(hist[-1]["date"])).days < AUTO_COOLDOWN_DAYS
                if auto and self.paper.state.get("auto_apply") and recent:
                    t += (f"\n⏸ Yaxshiroq variant bor, lekin oxirgi o'zgarishdan {AUTO_COOLDOWN_DAYS} kun o'tmagan — "
                          f"tez-tez o'zgartirish ham xato. Qo'lda: /qabul {tier}")
                elif auto and self.paper.state.get("auto_apply"):
                    self.paper.set_params(tier, res["best"], "avtomatik haftalik yaxshilash")
                    t += "\n✅ Avtomatik qo'llandi."
                else:
                    t += f"\n✅ Yaxshiroq variant. Qo'llash: /qabul {tier}"
            else:
                t += "\n➖ Joriy sozlama qoladi."
            msgs.append(t)
        msgs.append("ℹ️ Yangi sozlama faqat ko'rilmagan (tekshirish) davrida ham sezilarli yaxshi bo'lsa va "
                    "savdolar soni yetarli bo'lsagina taklif qilinadi. (Ns) — savdolar soni.")
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
        lines = ["⚙️ Sozlamalar"]
        if self.paper.active:
            lines.append(f"Umumiy virtual kapital: {_money(self.paper.total_capital)} "
                         f"({len(self.paper.tiers())} guruhga teng)")
        p0 = self._params_for(tiers[0])
        lines.append(f"🧠 Strategiya: {STRATEGY_NAMES.get(p0.strategy, p0.strategy)}")
        if p0.sizing == "risk":
            lines.append(f"📏 Har savdoda xavf: {p0.risk_pct:g}% (stop tegsa), bitta aksiyaga ≤{p0.pos_pct:g}%, "
                         f"≤{p0.max_pos} ta savdo")
        else:
            lines.append(f"📏 Har savdoga: {p0.pos_pct:g}%")
        lines.append("🚪 Chiqish: " + (f"trailing stop {p0.trail_atr:g} ATR" if p0.trail_atr else
                                      f"stop {p0.sl_atr:g} ATR, take {p0.tp_atr:g} ATR, {p0.max_days} kun"))
        lines.append(f"🧩 {'Kasr aksiya' if not p0.whole_shares else 'Faqat butun aksiya'} • "
                     f"🛡 Bozor filtri {'yoqilgan' if p0.market_filter else 'o‘chirilgan'} • "
                     f"🤖 Avto-yaxshilash {'yoqilgan' if (self.paper.state or {}).get('auto_apply') else 'o‘chirilgan'}")
        for t in tiers:
            if t:
                p = self.paper.params(t)
                n = len(self.paper.book(t)["tickers"])
                lines.append(f"{TIER_NAME[t]}: {_money(self.paper.book(t)['portfolio']['capital'])}, {n} ta aksiya, "
                             f"sirpanish {p.slippage * 100:.2f}%")
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
            "/tanlash": self.cmd_select,
            "/yangilash": self.cmd_update, "/holat": self.cmd_status,
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
