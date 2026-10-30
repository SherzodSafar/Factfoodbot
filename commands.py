"""Bot buyruqlari: matnli javoblar tayyorlaydi (Telegram'ga bog'liq emas, sinash oson)."""
import re

import pandas as pd

from engine import (Params, backtest, stats, period_table, diagnose, buy_hold_pct, optimize, prepare,
                    market_ok)
from universe import TIERS, TIER_NAME, TIER_ICON, SLIPPAGE, select

DEFAULT_CAPITAL = 30000.0   # umumiy (guruhlarga teng bo'linadi)
AUTO_COOLDOWN_DAYS = 28     # avtomatik sozlash o'zgarishlari orasidagi eng kam muddat
PER_TIER = 6

HELP = """📈 Demo savdo boti — buyruqlar

/demo_boshlash 3000 — UMUMIY 3000$ virtual pul 3 guruhga teng bo'linadi (har biriga 1000$)
   /demo_boshlash 2000 orta arzon — faqat tanlangan guruhlar (har biriga 1000$)
/holat — har guruhdagi portfel va ochiq savdolar
/hisobot kunlik | haftalik | oylik — guruhlarni taqqoslab
/tanlash — aksiyalarni hozir qayta tanlash
/bozor — tanlangan aksiyalar holati (trend, RSI)
/tahlil — xato va ustunliklar, sozlamani yaxshilash taklifi
/qabul — taklifni qo'llash (/qabul arzon — faqat bitta guruhga)
/avto on | off — haftalik yaxshilashni avtomatik qo'llash
/sozlamalar — joriy sozlamalar
/ulush 15 — har savdoga guruh kapitalining necha % i (standart 10)
/kasr on | off — kasr aksiya (brokeringiz ruxsat bersa); off — faqat butun aksiya
/baho — real pulga o'tishga tayyorlik mezonlari
/test — o'tgan davrda sinash:
   /test → har guruh uchun hozir tanlangan aksiyalar, oxirgi 2 yil
   /test AAPL,F 2024-01-01 2025-12-31 3000 → o'zingiz tanlagan aksiyalar (3000$ umumiy)
/tavsiya — strategiya qanday ishlaydi
/yangilash — ma'lumotni hozir yangilash

Avtomatik: har kuni 03:00 (Toshkent) kunlik hisobot; shanba — haftalik hisobot + tahlil;
oyning 1-kuni — oylik hisobot + aksiyalarni qayta tanlash.
⚠️ Bu demo. Natijalar kelajakdagi foydani kafolatlamaydi."""

ADVICE = """🎯 Aksiyalar qanday tanlanadi
Bot ~250 ta likvid AQSh aksiyasini ko'rib chiqadi va bugungi narxiga qarab 3 guruhga ajratadi:
💎 Qimmat (50$+) • 🔷 O'rtacha (10–50$) • 🔹 Arzon (5–10$)
Har guruhdan 6 tadan: kunlik savdo hajmi katta, ko'tarilish trendida va oxirgi 6 oyda eng kuchli o'sganlari.
5$ dan arzon aksiyalar olinmaydi — ular juda xavfli. Ro'yxat har oy yangilanadi.

⏱ Savdo qancha davom etadi
• Kunlik (1D) grafik. Signal kun yopilganda, xarid ertasi kuni ochilishda.
• Odatda 3–20 kun. Stop-loss (2 ATR) yoki take-profit (3 ATR) tegsa — oldinroq yopiladi.
• 20 kunda natija bo'lmasa yoki trend buzilsa — chiqiladi.
• Umumiy bozor (SPY) EMA200 dan pastda bo'lsa — yangi xarid qilinmaydi.
• Hisobda komissiya, sirpanish (spred) va butun aksiya cheklovi bor — real savdoga yaqinroq.

📋 Maqsad
Siz kiritgan umumiy virtual pul guruhlarga teng bo'linadi — qaysi narx guruhida strategiya yaxshiroq ishlashini ko'rasiz.
Kamida 2–3 oy demo. Real pulga o'tishdan oldin /baho dagi barcha mezonlar bajarilsin."""


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
            msgs.append(fmt_stats(st, f"{name}\nAksiyalar: {', '.join(td)}") + "\n" + fmt_diagnose(dg)
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
        budget = per * p.pos_pct / 100
        if not p.whole_shares or budget >= 300:
            return ""
        return (f"\n\n⚠️ Har savdoga ~{_money(budget)} ajratiladi va faqat butun aksiya olinadi — "
                f"narxi {budget:.0f}$ dan qimmat aksiyalarni sotib ololmaydi. Yechim: kattaroq summa, "
                f"/ulush 20 yoki brokeringiz kasr aksiyaga ruxsat bersa /kasr on.")

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
                                 f"stop {pos['stop']:.2f}, take {pos['take']:.2f}, {pos['bars']} kun")
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
            lines.append("SPY (umumiy bozor): " + ("📈 EMA200 dan yuqori — xarid ruxsat" if ok else
                                                   "📉 EMA200 dan past — yangi xarid to'xtatilgan"))
        for tier, tks in groups.items():
            lines.append(f"\n{TIER_NAME[tier]}")
            p = self._params_for(tier)
            up = 0
            for tk in tks:
                if tk not in data:
                    continue
                r = prepare(data[tk], p).iloc[-1]
                is_up = r["Close"] > r["ema_s"] and r["ema_f"] > r["ema_s"]
                up += is_up
                trend = "📈" if is_up else ("📉" if r["Close"] < r["ema_s"] else "↔️")
                lines.append(f"• {tk}: {r['Close']:.2f} {trend} RSI {r['rsi']:.0f}" + (" 🔔 SIGNAL" if r["signal"] else ""))
            lines.append(f"Trendda: {up}/{len(tks)}")
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
        for t in tiers:
            p = self.paper.params(t)
            cap = f", kapital {_money(self.paper.book(t)['portfolio']['capital'])}" if t else ""
            lines.append(f"{TIER_NAME.get(t, 'Standart')}{cap}: RSI chegara {p.rsi_buy}, stop {p.sl_atr} ATR, "
                         f"take {p.tp_atr} ATR, max {p.max_days} kun, har savdoga {p.pos_pct}%, "
                         f"sirpanish {p.slippage * 100:.2f}%, {'kasr aksiya' if not p.whole_shares else 'butun aksiya'}, "
                         f"bozor filtri {'yoqilgan' if p.market_filter else 'o‘chirilgan'}")
        if self.paper.active:
            lines.insert(1, f"Umumiy virtual kapital: {_money(self.paper.total_capital)}")
        lines.append(f"Avtomatik yaxshilash: {'yoqilgan' if (self.paper.state or {}).get('auto_apply') else 'o‘chirilgan'}")
        return ["\n".join(lines)]

    def cmd_share(self, args):
        if r := self._need_demo():
            return r
        _, _, nums, _ = parse_args(args)
        if not nums or not 1 <= nums[0] <= 50:
            return ["Masalan: /ulush 15 — har savdoga guruh kapitalining 15% i (1–50 oralig'ida)"]
        self.paper.set_all_params("ulush o'zgartirildi", pos_pct=nums[0])
        return [f"✅ Har savdoga endi guruh kapitalining {nums[0]:g}% i ajratiladi."]

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
            "/ulush": lambda: self.cmd_share(args), "/kasr": lambda: self.cmd_fractional(args),
            "/baho": self.cmd_grade,
        }
        fn = table.get(cmd)
        return fn() if fn else ["Noma'lum buyruq. /yordam"]
