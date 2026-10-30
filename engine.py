"""Strategiya va demo-savdo dvigateli.

Strategiyalar (kunlik grafik, faqat xarid, ko'tarilish trendida: narx > EMA200 va EMA50 > EMA200):
  breakout — narx oxirgi 50 kunlik eng yuqori narxdan oshib yopilsa (6 oylik o'sish ijobiy) -> xarid.
  momentum — har juma guruhda 6 oyda eng kuchli o'sgan 5 ta aksiya -> xarid.
  combo — ikkalasi birga.  (asosiy: momentum — tarixiy sinovda eng kichik tushish)
  Chiqish: take-profit yo'q — foyda o'sishiga ruxsat; stop narx ortidan 4 ATR masofada ko'tarilib boradi.
  Hajm xavf bo'yicha: stop tegsa guruh kapitalining ~1% i yo'qotiladi; bitta aksiyaga ko'pi bilan 20%.
  pullback (eski) — trendda RSI 40 ni pastdan kesib o'tsa xarid; stop 2 ATR, take 3 ATR, 20 kun.

2014–2026 real tarixiy sinovda (research/lab.py) trend strategiyalari uchala narx guruhida ham ijobiy bo'lgan,
pullback esa ~0% atrofida qolgan. Bu kelajak kafolati emas.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd

_TREND = dict(sl_atr=4.0, tp_atr=0.0, trail_atr=4.0, max_days=0, trend_exit=False,
              sizing="risk", risk_pct=1.0, pos_pct=20.0, max_pos=8)
STRATEGIES = ("momentum", "breakout", "combo", "pullback")
PRESETS = {
    "combo": dict(strategy="combo", **_TREND),
    "breakout": dict(strategy="breakout", **_TREND),
    "momentum": dict(strategy="momentum", **_TREND),
    "pullback": dict(strategy="pullback", sl_atr=2.0, tp_atr=3.0, trail_atr=0.0, max_days=20, trend_exit=True,
                     sizing="pct", pos_pct=10.0, max_pos=8),
}


@dataclass
class Params:
    strategy: str = "momentum"
    fast: int = 50          # tez EMA
    slow: int = 200         # sekin EMA (asosiy trend)
    breakout_len: int = 50  # breakout: necha kunlik eng yuqori narx
    top_k: int = 5          # momentum: har juma 6 oyda eng kuchli o'sgan shuncha aksiya signal beradi
    rsi_len: int = 14
    rsi_buy: float = 40     # pullback: RSI shu chegarani yuqoriga kesib o'tsa - signal
    atr_len: int = 14
    sl_atr: float = 4.0     # boshlang'ich stop = kirish - sl_atr*ATR
    tp_atr: float = 0.0     # take-profit = kirish + tp_atr*ATR (0 — yo'q)
    trail_atr: float = 4.0  # trailing stop: yopilish - trail_atr*ATR dan pastga tushmaydi (0 — yo'q)
    max_days: int = 0       # eng ko'pi bilan necha kun ushlab turish (0 — cheklovsiz)
    trend_exit: bool = False  # narx EMA200 dan pastda yopilsa chiqish
    sizing: str = "risk"    # risk — stop masofasiga qarab; pct — kapitalning pos_pct foizi
    risk_pct: float = 1.0   # risk: stop tegsa guruh kapitalining necha foizi yo'qotiladi
    pos_pct: float = 20.0   # pct: har savdoga ulush; risk: bitta aksiyaga eng ko'p ulush
    max_pos: int = 8        # bir vaqtda eng ko'p ochiq savdo
    commission: float = 0.0005  # 0.05% komissiya
    slippage: float = 0.0005    # sirpanish/spred: xarid shuncha qimmatroq, sotuv shuncha arzonroq
    whole_shares: bool = True   # faqat butun aksiya (ko'p brokerlarda kasr aksiya yo'q)
    market_filter: bool = True  # SPY 200 kunlik o'rtachadan past bo'lsa yangi xarid yo'q

    @classmethod
    def from_dict(cls, d):
        d = dict(d or {})
        if "strategy" not in d:   # eski holat fayli — eski strategiya sozlamalari
            d = {**PRESETS["pullback"], **d, "strategy": "pullback"}
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    @classmethod
    def preset(cls, strategy, **kw):
        return cls(**{**PRESETS[strategy], **kw})

    def to_dict(self):
        return asdict(self)


# ---------------- Indikatorlar ----------------
def _ema(s, n):
    return s.ewm(span=n, adjust=False).mean()


def _rsi(close, n):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100.0)


def _atr(df, n):
    pc = df["Close"].shift()
    tr = pd.concat([df["High"] - df["Low"], (df["High"] - pc).abs(), (df["Low"] - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def prepare(df: pd.DataFrame, p: Params) -> pd.DataFrame:
    out = df[["Open", "High", "Low", "Close"]].astype(float).copy()
    out["ema_f"] = _ema(out["Close"], p.fast)
    out["ema_s"] = _ema(out["Close"], p.slow)
    out["rsi"] = _rsi(out["Close"], p.rsi_len)
    out["atr"] = _atr(out, p.atr_len)
    out["mom"] = out["Close"] / out["Close"].shift(126) - 1
    out["hh"] = out["High"].rolling(p.breakout_len).max().shift()
    enough = pd.Series(np.arange(len(out)) >= p.slow, index=out.index)  # EMA200 uchun yetarli tarix
    up = (out["Close"] > out["ema_s"]) & (out["ema_f"] > out["ema_s"])
    if p.strategy in ("breakout", "combo"):
        sig = (out["Close"] > out["hh"]) & (out["mom"] > 0)
    elif p.strategy == "momentum":
        sig = pd.Series(False, index=out.index)   # signal step() da, aksiyalarni solishtirib beriladi
    else:
        sig = (out["rsi"] > p.rsi_buy) & (out["rsi"].shift() <= p.rsi_buy)
    out["up"] = up & enough
    out["signal"] = up & sig & enough
    out["mom"] = out["mom"].fillna(-9.0)
    return out


def market_ok(spy: pd.DataFrame, slow=200) -> dict:
    """{sana: True/False} — umumiy bozor (SPY) 200 kunlik o'rtachadan yuqorimi."""
    c = spy["Close"].astype(float)
    ok = c > c.rolling(slow).mean()
    return {d: bool(v) for d, v in ok.items()}


def build_bars(data: dict, p: Params, start=None, end=None) -> dict:
    """{sana: {ticker: qator}} ko'rinishiga keltiradi (tez ishlashi uchun)."""
    bars = {}
    for tk, df in data.items():
        pr = prepare(df, p)
        if start is not None:
            pr = pr[pr.index >= pd.Timestamp(start)]
        if end is not None:
            pr = pr[pr.index <= pd.Timestamp(end)]
        for d, row in zip(pr.index, pr.to_dict("records")):
            bars.setdefault(d, {})[tk] = row
    return dict(sorted(bars.items()))


# ---------------- Portfel (backtest ham, demo-savdo ham shu orqali) ----------------
class Portfolio:
    def __init__(self, p: Params, capital: float):
        self.p = p
        self.capital = float(capital)
        self.cash = float(capital)
        self.positions = {}   # tk -> dict(qty, entry, stop, take, entry_date, bars)
        self.pending = {}     # tk -> {"atr": ..., "mom": ...}  (ertasi kuni ochilishda kiriladi)
        self.trades = []
        self.equity = []      # [[sana, qiymat], ...]
        self.last_close = {}
        self.last_date = None

    # --- saqlash / yuklash ---
    def to_dict(self):
        return dict(capital=self.capital, cash=self.cash, positions=self.positions, pending=self.pending,
                    trades=self.trades, equity=self.equity, last_close=self.last_close, last_date=self.last_date)

    @classmethod
    def from_dict(cls, d, p: Params):
        pf = cls(p, d["capital"])
        pf.cash = d["cash"]
        pf.positions = d["positions"]
        pf.pending = {k: (v if isinstance(v, dict) else list(v)) for k, v in d["pending"].items()}
        pf.trades = d["trades"]
        pf.equity = d["equity"]
        pf.last_close = d["last_close"]
        pf.last_date = d["last_date"]
        return pf

    def value(self):
        return self.cash + sum(pos["qty"] * self.last_close.get(tk, pos["entry"]) for tk, pos in self.positions.items())

    def _close(self, tk, px, ds, reason):
        pos = self.positions.pop(tk)
        c = self.p.commission
        px = px * (1 - self.p.slippage)
        proceeds = pos["qty"] * px * (1 - c)
        cost = pos["qty"] * pos["entry"] * (1 + c)
        self.cash += proceeds
        self.trades.append(dict(
            ticker=tk, entry_date=pos["entry_date"], entry=round(pos["entry"], 4),
            exit_date=ds, exit=round(px, 4), reason=reason, days=pos["bars"],
            pnl=round(proceeds - cost, 2), pnl_pct=round((proceeds / cost - 1) * 100, 2)))

    def _qty(self, eq, buy, stop):
        p = self.p
        if p.sizing == "risk":
            budget = min(eq * p.risk_pct / 100 / max(buy - stop, 1e-9) * buy, eq * p.pos_pct / 100)
        else:
            budget = eq * p.pos_pct / 100
        budget = min(budget, self.cash / (1 + p.commission))
        qty = budget / buy if buy > 0 else 0
        return (math.floor(qty) if p.whole_shares else qty), budget

    def step(self, d, rows: dict, allow_new=True, market=None):
        """Bitta savdo kunini qayta ishlaydi. market: shu kuni SPY 200 kunlikdan yuqorimi (None — noma'lum).
        Qaytaradi: shu kundagi hodisalar ro'yxati."""
        p = self.p
        ds = pd.Timestamp(d).strftime("%Y-%m-%d")
        eq_prev = self.equity[-1][1] if self.equity else self.capital
        events = []
        if allow_new and p.market_filter and market is False:
            allow_new = False
        # 1) kecha signal bo'lganlar — bugun ochilishda xarid (kuchliroq o'sganlari birinchi)
        order = sorted(self.pending, key=lambda t: -(self.pending[t].get("mom", 0) if isinstance(self.pending[t], dict) else 0))
        for tk in order:
            pend = self.pending.pop(tk)
            r = rows.get(tk)
            if r is None or tk in self.positions:
                continue
            if len(self.positions) >= p.max_pos:
                events.append(f"⏭ {tk}: bo'sh joy yo'q ({p.max_pos} ta ochiq savdo)")
                continue
            buy = r["Open"] * (1 + p.slippage)
            if isinstance(pend, dict):   # stop/take haqiqiy xarid narxidan hisoblanadi
                stop = buy - p.sl_atr * pend["atr"]
                take = buy + p.tp_atr * pend["atr"] if p.tp_atr > 0 else None
            else:                        # eski holat fayli: [stop, take]
                stop, take = pend
            qty, budget = self._qty(eq_prev, buy, stop)
            if qty > 0 and qty * buy > 1:
                self.cash -= qty * buy * (1 + p.commission)
                self.positions[tk] = dict(qty=qty, entry=buy, stop=stop, take=take, entry_date=ds, bars=0)
                events.append(f"🟢 XARID {tk} {qty:g} dona @ {buy:.2f} (stop {stop:.2f}"
                              + (f", take {take:.2f})" if take else ", trailing)"))
            elif buy > 0:
                events.append(f"⚠️ {tk}: pul yetmadi (1 dona {buy:.2f}$, ajratilgan {budget:.0f}$)")
        cands = []
        top = set()
        if allow_new and p.strategy in ("combo", "momentum") and pd.Timestamp(d).weekday() == 4:
            # har juma: trenddagi aksiyalar ichida 6 oyda eng kuchli o'sgan top_k tasi
            ranked = sorted(((r["mom"], tk) for tk, r in rows.items() if r.get("up") and r["mom"] > 0), reverse=True)
            top = {tk for _, tk in ranked[:p.top_k]}
        for tk, r in rows.items():
            o, h, l, c = r["Open"], r["High"], r["Low"], r["Close"]
            # 2) ochiq pozitsiyadan chiqish shartlari
            pos = self.positions.get(tk)
            if pos:
                pos["bars"] += 1
                px = reason = None
                take = pos.get("take")
                if l <= pos["stop"]:          # bir kunda ikkalasi tegsa - ehtiyotkorlik uchun stop deb hisoblaymiz
                    px, reason = min(o, pos["stop"]), ("stop-loss" if pos["stop"] < pos["entry"] else "trailing stop")
                elif take and h >= take:
                    px, reason = max(o, take), "take-profit"
                elif p.trend_exit and c < r["ema_s"]:
                    px, reason = c, "trend buzildi"
                elif p.max_days and pos["bars"] >= p.max_days:
                    px, reason = c, "muddat tugadi"
                if px is not None:
                    self._close(tk, px, ds, reason)
                    t = self.trades[-1]
                    events.append(f"{'✅' if t['pnl'] > 0 else '🔴'} SOTUV {tk} @ {t['exit']:.2f} ({reason}) "
                                  f"{t['pnl_pct']:+.2f}% / {t['pnl']:+.2f}$")
                elif p.trail_atr > 0 and not math.isnan(r["atr"]):
                    pos["stop"] = max(pos["stop"], c - p.trail_atr * r["atr"])
            # 3) yangi signal nomzodlari
            if (allow_new and tk not in self.positions and tk not in self.pending
                    and (bool(r["signal"]) or tk in top) and not math.isnan(r["atr"])):
                cands.append((r.get("mom", 0.0), tk, r))
            self.last_close[tk] = c
        free = p.max_pos - len(self.positions)
        for mom, tk, r in sorted(cands, key=lambda x: -x[0])[:max(free, 0)]:
            self.pending[tk] = {"atr": float(r["atr"]), "mom": float(mom)}
            events.append(f"🔔 SIGNAL {tk} (yopilish {r['Close']:.2f}) - ertaga ochilishda xarid")
        self.equity.append([ds, round(self.value(), 2)])
        self.last_date = ds
        return events


def run_bars(bars: dict, p: Params, capital: float, market=None) -> Portfolio:
    pf = Portfolio(p, capital)
    market = market or {}
    keys = list(bars)
    for i, d in enumerate(keys):
        pf.step(d, bars[d], allow_new=i < len(keys) - 1, market=market.get(d))
    return pf


def backtest(data: dict, p: Params, start, end, capital=10000, market=None) -> Portfolio:
    return run_bars(build_bars(data, p, start, end), p, capital, market)


# ---------------- Statistika ----------------
def stats(pf: Portfolio) -> dict:
    tr = pf.trades
    wins = [t for t in tr if t["pnl"] > 0]
    losses = [t for t in tr if t["pnl"] <= 0]
    gw = sum(t["pnl"] for t in wins)
    gl = -sum(t["pnl"] for t in losses)
    eq = pd.Series([v for _, v in pf.equity]) if pf.equity else pd.Series([pf.capital])
    dd = ((eq / eq.cummax()) - 1).min() * 100
    end_val = pf.value()
    return dict(
        n=len(tr), wins=len(wins), losses=len(losses),
        win_rate=round(len(wins) / len(tr) * 100, 1) if tr else 0.0,
        avg_win=round(np.mean([t["pnl_pct"] for t in wins]), 2) if wins else 0.0,
        avg_loss=round(np.mean([t["pnl_pct"] for t in losses]), 2) if losses else 0.0,
        profit_factor=round(gw / gl, 2) if gl > 0 else (float("inf") if gw > 0 else 0.0),
        avg_days=round(np.mean([t["days"] for t in tr]), 1) if tr else 0.0,
        start_val=pf.capital, end_val=round(end_val, 2),
        return_pct=round((end_val / pf.capital - 1) * 100, 2),
        max_dd_pct=round(float(dd), 2), open_positions=len(pf.positions))


def period_table(pf: Portfolio, freq: str, last_n=12) -> list:
    """freq: 'D' kunlik, 'W' haftalik, 'M' oylik."""
    if not pf.equity:
        return []
    rule = {"D": "D", "W": "W-FRI", "M": "ME"}[freq]
    eq = pd.Series({pd.Timestamp(d): v for d, v in pf.equity})
    per = eq.resample(rule).last().dropna()
    prev = per.shift(1)
    prev.iloc[0] = pf.capital
    tdf = pd.DataFrame(pf.trades)
    rows = []
    for d, v in per.items():
        pv = prev[d]
        if freq == "D":
            label = d.strftime("%Y-%m-%d")
            mask = lambda x: pd.Timestamp(x) == d
        elif freq == "W":
            label = (d - pd.Timedelta(days=4)).strftime("%m-%d") + "…" + d.strftime("%m-%d")
            mask = lambda x: d - pd.Timedelta(days=6) < pd.Timestamp(x) <= d
        else:
            label = d.strftime("%Y-%m")
            mask = lambda x: pd.Timestamp(x).strftime("%Y-%m") == label
        pt = tdf[tdf["exit_date"].map(mask)] if len(tdf) else tdf
        rows.append(dict(label=label, value=round(v, 2), change=round(v - pv, 2),
                         change_pct=round((v / pv - 1) * 100, 2) if pv else 0.0,
                         trades=len(pt), wins=int((pt["pnl"] > 0).sum()) if len(pt) else 0))
    return rows[-last_n:]


def diagnose(pf: Portfolio) -> dict:
    tdf = pd.DataFrame(pf.trades)
    if not len(tdf):
        return dict(by_reason={}, by_ticker={})
    by_reason = tdf.groupby("reason")["pnl"].agg(["count", "sum"]).round(2).to_dict("index")
    g = tdf.groupby("ticker")
    by_ticker = pd.DataFrame(dict(count=g["pnl"].count(), pnl=g["pnl"].sum().round(2),
                                  win_rate=(g["pnl"].apply(lambda s: (s > 0).mean() * 100)).round(0))).to_dict("index")
    return dict(by_reason=by_reason, by_ticker=by_ticker)


def buy_hold_pct(df: pd.DataFrame, start, end) -> float | None:
    s = df[(df.index >= pd.Timestamp(start)) & (df.index <= pd.Timestamp(end))]["Close"]
    if len(s) < 2:
        return None
    return round((s.iloc[-1] / s.iloc[0] - 1) * 100, 2)


# ---------------- Avtomatik yaxshilash (walk-forward) ----------------
_TGRID = dict(trail_atr=[3.0, 4.0], risk_pct=[0.75, 1.0])
GRIDS = {
    "combo": _TGRID, "breakout": dict(breakout_len=[50, 100], **_TGRID), "momentum": _TGRID,
    "pullback": dict(rsi_buy=[35, 40, 45], sl_atr=[1.5, 2.0, 2.5], tp_atr=[2.0, 3.0, 4.0], max_days=[10, 20, 30]),
}


MIN_TRAIN_TRADES = 10   # o'rganish qismida kamida shuncha savdo bo'lmasa, natija tasodif
MIN_TEST_TRADES = 10
MIN_GAIN = 2.0          # tekshirishda kamida shuncha ball yaxshi bo'lsin (mayda farq — shovqin)


def _score(st, min_n=MIN_TRAIN_TRADES):
    if st["n"] < min_n:
        return -1e9
    return st["return_pct"] - 0.5 * abs(st["max_dd_pct"])   # foyda minus yarim tushish


BAR_KEYS = ("strategy", "rsi_buy", "breakout_len")   # bular signalni o'zgartiradi — bars qayta quriladi


def optimize(data: dict, p: Params, start, end, capital=10000, market=None) -> dict:
    """Davrni 70% (o'rganish) va 30% (tekshirish) ga bo'ladi.
    Eng yaxshi sozlamani o'rganish qismida topadi va uni ko'rmagan tekshirish qismida sinaydi.
    Shunday qilib 'o'tmishga moslab qo'yish' xavfi kamayadi."""
    import itertools
    grid = GRIDS[p.strategy]
    base_bars = build_bars(data, p, start, end)
    dates = list(base_bars)
    if len(dates) < 100:
        return dict(ok=False, why="Ma'lumot juda kam (kamida ~100 savdo kuni kerak).")
    cut = dates[int(len(dates) * 0.7)]
    split = lambda bars: ({d: v for d, v in bars.items() if d < cut}, {d: v for d, v in bars.items() if d >= cut})
    cache = {}

    def bars_for(q):
        key = tuple(getattr(q, k) for k in BAR_KEYS)
        if key not in cache:
            cache[key] = split(base_bars if q.strategy == p.strategy and key == tuple(getattr(p, k) for k in BAR_KEYS)
                               else build_bars(data, q, start, end))
        return cache[key]

    cur_train = stats(run_bars(bars_for(p)[0], p, capital, market))
    cur_test = stats(run_bars(bars_for(p)[1], p, capital, market))

    results = []
    for combo in itertools.product(*grid.values()):
        q = Params.from_dict({**p.to_dict(), **dict(zip(grid, combo))})
        st = stats(run_bars(bars_for(q)[0], q, capital, market))
        results.append((_score(st), q, st))
    results.sort(key=lambda x: x[0], reverse=True)
    best_score, best_p, best_train = results[0]
    best_test = stats(run_bars(bars_for(best_p)[1], best_p, capital, market))

    changed = {k: (getattr(p, k), getattr(best_p, k)) for k in grid if getattr(p, k) != getattr(best_p, k)}
    better = (bool(changed) and best_test["n"] >= MIN_TEST_TRADES
              and _score(best_test, MIN_TEST_TRADES) > _score(cur_test, MIN_TEST_TRADES) + MIN_GAIN
              and _score(best_train) > _score(cur_train))
    return dict(ok=True, cut=cut.strftime("%Y-%m-%d"), current=p, best=best_p, changed=changed,
                cur_train=cur_train, cur_test=cur_test, best_train=best_train, best_test=best_test,
                recommend=better)
