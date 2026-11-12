"""Kun ichi (day trade) demo dvigateli — 5 daqiqalik shamlar, faqat xarid, kechaga pozitsiya qolmaydi.

Strategiyalar:
  orb   — "Hajmi oshgan aksiyalar ochilishda yorib chiqishi" (Opening Range Breakout, stocks in play):
          9:30–9:35 shamida hajm odatdagidan ≥ rvol_min baravar katta va sham yashil bo'lsa, eng kuchli
          top_n tasi tanlanadi. Narx shu shamning eng yuqori nuqtasidan oshsa — xarid; himoya narxi —
          shamning eng past nuqtasi. Kun oxirida (15:55) hammasi sotiladi.
  spike — "Kun davomida hajm portlashi": 10:00 dan keyin 5 daqiqalik hajm shu aksiyaning odatdagi
          5 daqiqalik hajmidan ≥ spike_mult baravar katta, sham yashil va kunning eng yuqori narxida
          yopilsa — keyingi shamda xarid; himoya — shamning eng past nuqtasi; kun oxirida sotiladi.

Bitta funksiya (DayBook.on_bar) ham tarixiy sinovda, ham botda ishlatiladi — natija bir xil hisoblanadi.

Real sinov (research/daytrade_lab.py, 2026-sentabr — noyabr, 45 kun, 242 aksiya): ko'p variantlar zararda.
Eng barqarori (standart sozlama): orb, hajm ≥3x, top 5, SPY filtri, maqsad 2R — +1.5%, pasayish −5.9%.
Bu "nolga yaqin" natija: kunlik savdo bu yerda TAJRIBA sifatida, foyda kafolati yo'q.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import pandas as pd

from fmt import dona, natija, pul


@dataclass
class DayParams:
    strategy: str = "orb"
    rvol_min: float = 3.0      # birinchi sham hajmi o'rtachadan necha baravar katta bo'lsin
    top_n: int = 5             # kuniga eng ko'pi bilan nechta nomzod
    spike_mult: float = 5.0    # spike: 5 daqiqalik hajm odatdagidan necha baravar
    risk_pct: float = 0.5      # himoya narxida sotilsa kapitalning necha % i yo'qotiladi
    max_pos_pct: float = 25.0  # bitta aksiyaga kapitalning ko'pi bilan necha % i
    max_trades: int = 6        # kuniga eng ko'p savdo
    min_price: float = 5.0
    commission: float = 0.0005
    slippage: float = 0.0005
    whole_shares: bool = False
    target_r: float = 2.0      # foyda maqsadi: xavfning necha baravari (0 — kun oxirigacha ushlash)
    spy_filter: bool = True    # SPY ning o'zi ochilishda o'smasa, bugun savdo qilinmaydi
    # runner — "tez uchayotgan aksiyalar" (narx cheklovi yo'q, faqat runner_price dan qimmat)
    min_gain: float = 10.0       # bugun kamida necha % o'sgan bo'lsin
    runner_vol: float = 5.0      # 5 daqiqalik hajm odatdagidan necha baravar
    min_dollar_vol: float = 200000.0  # signal shamidagi savdo summasi ($) — likvidlik uchun
    runner_price: float = 0.5    # bundan arzon aksiyalar olinmaydi (ma'lumot ishonchsiz)
    target_pct: float = 0.0      # foyda maqsadi, % (0 — target_r ishlatiladi)
    stop_pct: float = 0.0        # himoya: kirishdan necha % pastda (0 — signal shamining pasti)
    time_stop: int = 0           # necha daqiqada maqsadga yetmasa — sotiladi (0 — cheklovsiz)
    max_open: int = 3            # bir vaqtda eng ko'p ochiq savdo

    @classmethod
    def from_dict(cls, d):
        return cls(**{k: v for k, v in (d or {}).items() if k in cls.__dataclass_fields__})

    def to_dict(self):
        return asdict(self)


OPEN_BAR = pd.Timedelta(hours=9, minutes=30)
RUNNER_UNTIL = pd.Timedelta(hours=15)            # runner: 15:00 dan keyin yangi kirish yo'q
ORDER_TTL = pd.Timedelta(minutes=15)             # runner buyurtmasi shuncha vaqt amal qiladi
LAST_BAR = pd.Timedelta(hours=15, minutes=55)   # shu shamning yopilishida hammasi sotiladi
SPIKE_FROM = pd.Timedelta(hours=10)


def _tod(ts):
    ts = pd.Timestamp(ts)
    return ts - ts.normalize()


class DayBook:
    """Bitta kunlik hisob. Holat JSON'ga saqlanadi (to_dict/from_dict)."""

    def __init__(self, p: DayParams, capital: float):
        self.p = p
        self.capital = float(capital)
        self.cash = float(capital)
        self.positions = {}    # tk -> dict(qty, entry, stop, time)
        self.orders = {}       # tk -> dict(level, stop)  — narx level dan oshsa xarid
        self.trades = []
        self.days = []         # [[sana, kun oxiri qiymati], ...]
        self.day = None        # joriy sana (str)
        self.done = 0          # bugun ochilgan savdolar soni
        self.last_bar = None   # oxirgi qayta ishlangan sham vaqti (str)
        self.watch = []        # bugungi nomzodlar (xabar uchun)
        self.traded = []       # bugun signal bergan aksiyalar (runner: kuniga bir marta)

    def to_dict(self):
        return dict(capital=self.capital, cash=self.cash, positions=self.positions, orders=self.orders,
                    trades=self.trades, days=self.days, day=self.day, done=self.done, last_bar=self.last_bar,
                    watch=self.watch, traded=self.traded)

    @classmethod
    def from_dict(cls, d, p):
        b = cls(p, d["capital"])
        for k in ("cash", "positions", "orders", "trades", "days", "day", "done", "last_bar", "watch", "traded"):
            setattr(b, k, d.get(k, getattr(b, k)))
        return b

    def value(self, last=None):
        last = last or {}
        return self.cash + sum(pos["qty"] * last.get(tk, pos["entry"]) for tk, pos in self.positions.items())

    # ---------- ichki ----------
    def _buy(self, tk, px, stop, ts):
        p = self.p
        buy = px * (1 + p.slippage)
        if p.stop_pct > 0:
            stop = max(stop, buy * (1 - p.stop_pct / 100))
        if buy - stop <= 0 or self.done >= p.max_trades or len(self.positions) >= p.max_open:
            return None
        eq = self.value()
        budget = min(eq * p.risk_pct / 100 / (buy - stop) * buy, eq * p.max_pos_pct / 100, self.cash / (1 + p.commission))
        qty = budget / buy
        if p.whole_shares:
            qty = math.floor(qty)
        if qty <= 0 or qty * buy < 1:
            return f"⚠️ {tk}: pul yetmadi (1 dona {buy:.2f}$)"
        self.cash -= qty * buy * (1 + p.commission)
        tgt = (buy * (1 + p.target_pct / 100) if p.target_pct > 0 else
               buy + p.target_r * (buy - stop) if p.target_r > 0 else None)
        self.positions[tk] = dict(qty=qty, entry=buy, stop=stop, target=tgt, time=str(ts))
        self.done += 1
        return (f"🟢 Sotib olindi: {tk} — {dona(qty)} dona × {buy:.2f}$ = {pul(qty * buy, 2)} "
                f"({pd.Timestamp(ts):%H:%M} NY)\n     🛡 Himoya narxi {stop:.2f}$ ({(stop / buy - 1) * 100:+.1f}%)"
                + (f"\n     🎯 Maqsad {tgt:.2f}$ ({(tgt / buy - 1) * 100:+.1f}%) — yetsa foydani olib sotadi" if tgt else "")
                + (f"\n     ⏱ {p.time_stop} daqiqada maqsadga yetmasa — sotadi" if p.time_stop else "")
                + "\n     Kun oxirida (15:55) albatta sotiladi")

    def _sell(self, tk, px, ts, reason):
        p = self.p
        pos = self.positions.pop(tk)
        sell = px * (1 - p.slippage)
        proceeds = pos["qty"] * sell * (1 - p.commission)
        cost = pos["qty"] * pos["entry"] * (1 + p.commission)
        self.cash += proceeds
        mins = int((pd.Timestamp(ts) - pd.Timestamp(pos["time"])).total_seconds() // 60) + 5
        t = dict(ticker=tk, date=self.day, entry_time=pos["time"], exit_time=str(ts), entry=round(pos["entry"], 4),
                 exit=round(sell, 4), qty=pos["qty"], reason=reason, minutes=mins,
                 pnl=round(proceeds - cost, 2), pnl_pct=round((proceeds / cost - 1) * 100, 2))
        self.trades.append(t)
        why = {"stop": "narx himoya narxiga tushdi — zarar cheklandi", "eod": "kun oxiri — kunlik savdo yopildi",
               "target": "maqsad narxga yetdi — foyda olindi",
               "time": "belgilangan vaqtda maqsadga yetmadi — chiqildi"}[reason]
        return (f"{'💰' if t['pnl'] > 0 else '🔻'} Sotildi: {tk} — {t['entry']:.2f}$ → {sell:.2f}$, "
                f"{natija(t['pnl'], t['pnl_pct'])}, {mins} daqiqa ({pd.Timestamp(ts):%H:%M} NY)\n     Sabab: {why}")

    # ---------- asosiy ----------
    def new_day(self, day):
        self.day = str(pd.Timestamp(day).date())
        self.orders, self.watch, self.done, self.last_bar, self.traded = {}, [], 0, None, []

    def select_orb(self, first_bars: dict, avg_first_vol: dict, spy_bar=None):
        """first_bars: {tk: 9:30 shami (Open/High/Low/Close/Volume)}. Nomzodlarni tanlab, buyurtma qo'yadi."""
        p = self.p
        if p.spy_filter and spy_bar is not None and spy_bar["Close"] <= spy_bar["Open"]:
            return ["🌍 Bugun umumiy bozor (SPY) ochilishda pasaydi — himoya uchun kunlik savdo qilinmaydi."]
        cand = []
        for tk, r in first_bars.items():
            av = avg_first_vol.get(tk)
            if not av or r["Close"] < p.min_price or r["Close"] <= r["Open"] or r["High"] <= r["Low"]:
                continue
            rv = r["Volume"] / av
            if rv >= p.rvol_min:
                cand.append((rv, tk, r))
        cand.sort(reverse=True)
        for rv, tk, r in cand[:p.top_n]:
            self.orders[tk] = dict(level=float(r["High"]), stop=float(r["Low"]), rvol=round(rv, 1))
            self.watch.append(f"{tk} (hajm ×{rv:.1f})")
        return (["👀 Bugungi nomzodlar (ochilishda hajmi odatdagidan ko'p, narxi o'sgan): " + ", ".join(self.watch)
                 + "\n     Narx birinchi 5 daqiqaning eng yuqori nuqtasidan oshsa — bot sotib oladi."]
                if self.watch else ["👀 Bugun ochilishda hajmi keskin oshgan aksiya topilmadi — savdo bo'lmasligi mumkin."])

    def on_bar(self, ts, rows: dict, avg_bar_vol: dict | None = None, day_high: dict | None = None,
               prev_close: dict | None = None):
        """Bitta 5 daqiqalik sham (barcha kuzatilayotgan aksiyalar uchun). Hodisalar ro'yxatini qaytaradi."""
        p = self.p
        tod = _tod(ts)
        ev = []
        # 1) ochiq pozitsiyalar: himoya narxi
        for tk in list(self.positions):
            r = rows.get(tk)
            if r is None:
                continue
            pos = self.positions[tk]
            if r["Low"] <= pos["stop"]:
                ev.append(self._sell(tk, min(r["Open"], pos["stop"]), ts, "stop"))
            elif pos.get("target") and r["High"] >= pos["target"]:
                ev.append(self._sell(tk, max(r["Open"], pos["target"]), ts, "target"))
            elif p.time_stop and pd.Timestamp(ts) - pd.Timestamp(pos["time"]) >= pd.Timedelta(minutes=p.time_stop - 5):
                ev.append(self._sell(tk, r["Close"], ts, "time"))
        # 2) kutilayotgan buyurtmalar: narx darajadan oshsa xarid (shu shamning o'zida himoya ham tekshiriladi)
        if tod < LAST_BAR:
            for tk in list(self.orders):
                r = rows.get(tk)
                o = self.orders[tk]
                if o.get("expires") and pd.Timestamp(ts) > pd.Timestamp(o["expires"]):
                    self.orders.pop(tk)
                    continue
                if r is None or tk in self.positions or r["High"] < o["level"]:
                    continue
                self.orders.pop(tk)
                msg = self._buy(tk, max(r["Open"], o["level"]), o["stop"], ts)
                if msg:
                    ev.append(msg)
                    if tk in self.positions and r["Low"] <= o["stop"]:
                        ev.append(self._sell(tk, o["stop"], ts, "stop"))
        # 3) spike: hajm portlashi — keyingi shamda kirish uchun buyurtma
        if p.strategy == "spike" and avg_bar_vol and SPIKE_FROM <= tod < LAST_BAR - pd.Timedelta(minutes=30):
            for tk, r in rows.items():
                av = avg_bar_vol.get(tk)
                if (not av or tk in self.positions or tk in self.orders or r["Close"] < p.min_price
                        or r["Close"] <= r["Open"]):
                    continue
                if r["Volume"] >= p.spike_mult * av and day_high and r["Close"] >= day_high.get(tk, 1e18) * 0.999:
                    self.orders[tk] = dict(level=float(r["High"]), stop=float(r["Low"]), rvol=round(r["Volume"] / av, 1))
                    ev.append(f"⚡️ {tk}: 5 daqiqada hajm odatdagidan ×{r['Volume'] / av:.0f} — "
                              f"narx {r['High']:.2f}$ dan oshsa sotib olinadi")
        # 3b) runner: bugun kuchli o'sgan + hajm portlashi + sham yuqorida yopilgan
        if (p.strategy == "runner" and avg_bar_vol and prev_close
                and OPEN_BAR + pd.Timedelta(minutes=5) <= tod < RUNNER_UNTIL):
            for tk, r in rows.items():
                av, pc = avg_bar_vol.get(tk), prev_close.get(tk)
                if (not av or not pc or tk in self.traded or tk in self.positions or tk in self.orders
                        or r["Close"] < p.runner_price or r["Close"] <= r["Open"]):
                    continue
                gain = (r["Close"] / pc - 1) * 100
                rng = r["High"] - r["Low"]
                if (gain >= p.min_gain and r["Volume"] >= p.runner_vol * av
                        and r["Close"] * r["Volume"] >= p.min_dollar_vol and rng > 0
                        and r["Close"] >= r["High"] - 0.25 * rng):
                    self.traded.append(tk)
                    self.orders[tk] = dict(level=float(r["High"]), stop=float(r["Low"]), rvol=round(r["Volume"] / av, 1),
                                           expires=str(pd.Timestamp(ts) + ORDER_TTL))
                    ev.append(f"🚀 {tk} uchmoqda: bugun {gain:+.0f}%, 5 daqiqada hajm odatdagidan ×{r['Volume'] / av:.0f} "
                              f"({r['Close']:.2f}$). Narx {r['High']:.2f}$ dan oshsa — sotib olinadi.")
        # 4) kun oxiri: hammasi sotiladi
        if tod >= LAST_BAR:
            for tk in list(self.positions):
                r = rows.get(tk)
                if r is not None:
                    ev.append(self._sell(tk, r["Close"], ts, "eod"))
            self.orders = {}
        self.last_bar = str(ts)
        return [e for e in ev if e]

    def end_day(self, last_close: dict):
        """Kun yakuni: ochiq qolgan bo'lsa (ma'lumot yetmagan) — oxirgi narxda sotiladi."""
        ev = [self._sell(tk, last_close.get(tk, pos["entry"]), self.last_bar or self.day, "eod")
              for tk, pos in list(self.positions.items())]
        self.orders = {}
        self.days.append([self.day, round(self.value(), 2)])
        return ev


def day_stats(book: DayBook):
    tr = book.trades
    wins = [t for t in tr if t["pnl"] > 0]
    gw = sum(t["pnl"] for t in wins)
    gl = -sum(t["pnl"] for t in tr if t["pnl"] <= 0)
    vals = [v for _, v in book.days] or [book.capital]
    peak, dd = book.capital, 0.0
    for v in vals:
        peak = max(peak, v)
        dd = min(dd, v / peak - 1)
    prev = [book.capital] + vals[:-1]
    green = sum(v > pv for v, pv in zip(vals, prev))
    return dict(n=len(tr), wins=len(wins), win_rate=round(len(wins) / len(tr) * 100, 1) if tr else 0.0,
                pf=round(gw / gl, 2) if gl > 0 else (float("inf") if gw > 0 else 0.0),
                ret=round((book.value() / book.capital - 1) * 100, 2), dd=round(dd * 100, 2),
                days=len(book.days), green_days=green,
                avg=round(sum(t["pnl_pct"] for t in tr) / len(tr), 3) if tr else 0.0)


def split_days(df5: dict):
    """{tk: 5m DataFrame (NY vaqti)} -> {sana: {tk: kunlik DataFrame}}."""
    out = {}
    for tk, df in df5.items():
        for d, g in df.groupby(df.index.normalize()):
            out.setdefault(d, {})[tk] = g
    return dict(sorted(out.items()))


def first_bar_avgs(days: dict, upto, n=14):
    """Har aksiya uchun oxirgi n kundagi birinchi (9:30) sham hajmining o'rtachasi va 5 daqiqalik o'rtacha hajm."""
    keys = [d for d in days if d < upto][-n:]
    fv, bv = {}, {}
    for d in keys:
        for tk, g in days[d].items():
            if len(g) and _tod(g.index[0]) == OPEN_BAR:
                fv.setdefault(tk, []).append(float(g["Volume"].iloc[0]))
            bv.setdefault(tk, []).append(float(g["Volume"].mean()))
    avg = lambda d_: {k: sum(v) / len(v) for k, v in d_.items() if len(v) >= max(3, n // 2) and sum(v) > 0}
    return avg(fv), avg(bv)


def run_day(book: DayBook, day, frames: dict, avg_first: dict, avg_bar: dict, spy=None, prev_close=None):
    """Butun bir kunni sham-ba-sham o'tkazadi (tarixiy sinov va botning "yetib olish" rejimi uchun)."""
    book.new_day(day)
    ev = []
    recs = {tk: g.to_dict("index") for tk, g in frames.items()}
    times = sorted({ts for r in recs.values() for ts in r})
    first = {tk: r[min(r)] for tk, r in recs.items() if r and _tod(min(r)) == OPEN_BAR}
    hi = {}
    for ts in times:
        rows = {tk: r[ts] for tk, r in recs.items() if ts in r}
        for tk, r in rows.items():
            hi[tk] = max(hi.get(tk, 0), r["High"])
        if _tod(ts) == OPEN_BAR:
            if book.p.strategy == "orb":
                ev += book.select_orb(first, avg_first, spy.iloc[0] if spy is not None and len(spy) else None)
            continue   # birinchi sham — faqat tanlash uchun
        ev += book.on_bar(ts, rows, avg_bar, hi, prev_close)
    last = {tk: float(g["Close"].iloc[-1]) for tk, g in frames.items() if len(g)}
    ev += book.end_day(last)
    return ev
