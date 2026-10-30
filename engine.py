"""Strategiya va demo-savdo dvigateli.

Strategiya (TradingView'dagi Pine skript bilan bir xil):
  - Faqat ko'tarilish trendida: narx > EMA200 va EMA50 > EMA200
  - RSI 40 dan pastdan yuqoriga kesib o'tganda (tushishdan keyin qaytish) -> ertasi kuni ochilishda xarid
  - Chiqish: stop-loss (2 ATR), take-profit (3 ATR), trend buzilsa yoki muddat tugasa
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd


@dataclass
class Params:
    fast: int = 50          # tez EMA
    slow: int = 200         # sekin EMA (asosiy trend)
    rsi_len: int = 14
    rsi_buy: float = 40     # RSI shu chegarani yuqoriga kesib o'tsa - signal
    atr_len: int = 14
    sl_atr: float = 2.0     # stop-loss = kirish - 2*ATR
    tp_atr: float = 3.0     # take-profit = kirish + 3*ATR
    max_days: int = 20      # savdoni eng ko'pi bilan necha kun ushlab turish
    pos_pct: float = 10.0   # har bir savdoga kapitalning necha foizi
    commission: float = 0.0005  # 0.05% komissiya
    slippage: float = 0.0005    # sirpanish/spred: xarid shuncha qimmatroq, sotuv shuncha arzonroq
    whole_shares: bool = True   # faqat butun aksiya (ko'p brokerlarda kasr aksiya yo'q)
    market_filter: bool = True  # SPY EMA200 dan past bo'lsa (umumiy bozor tushishda) yangi xarid yo'q

    @classmethod
    def from_dict(cls, d):
        d = d or {}
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

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
    enough = pd.Series(np.arange(len(out)) >= p.slow, index=out.index)  # EMA200 uchun yetarli tarix
    up = (out["Close"] > out["ema_s"]) & (out["ema_f"] > out["ema_s"])
    cross = (out["rsi"] > p.rsi_buy) & (out["rsi"].shift() <= p.rsi_buy)
    out["signal"] = up & cross & enough
    return out


def market_ok(spy: pd.DataFrame, slow=200) -> dict:
    """{sana: True/False} — umumiy bozor (SPY) EMA200 dan yuqorimi."""
    c = spy["Close"].astype(float)
    ok = (c > _ema(c, slow)) & pd.Series(np.arange(len(c)) >= slow, index=c.index)
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
        self.pending = {}     # tk -> {"atr": ...}  (ertasi kuni ochilishda kiriladi)
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

    def step(self, d, rows: dict, allow_new=True, market=None):
        """Bitta savdo kunini qayta ishlaydi. market: shu kuni SPY EMA200 dan yuqorimi (None — noma'lum).
        Qaytaradi: shu kundagi hodisalar ro'yxati."""
        p = self.p
        ds = pd.Timestamp(d).strftime("%Y-%m-%d")
        eq_prev = self.equity[-1][1] if self.equity else self.capital
        events = []
        if allow_new and p.market_filter and market is False:
            allow_new = False
        for tk, r in rows.items():
            o, h, l, c = r["Open"], r["High"], r["Low"], r["Close"]
            # 1) kecha signal bo'lgan bo'lsa - bugun ochilishda xarid
            if tk in self.pending and tk not in self.positions:
                pend = self.pending.pop(tk)
                buy = o * (1 + p.slippage)
                if isinstance(pend, dict):   # stop/take haqiqiy xarid narxidan hisoblanadi
                    stop, take = buy - p.sl_atr * pend["atr"], buy + p.tp_atr * pend["atr"]
                else:                        # eski holat fayli: [stop, take]
                    stop, take = pend
                budget = min(eq_prev * p.pos_pct / 100, self.cash / (1 + p.commission))
                qty = budget / buy if buy > 0 else 0
                if p.whole_shares:
                    qty = math.floor(qty)
                if qty > 0 and qty * buy > 1:
                    self.cash -= qty * buy * (1 + p.commission)
                    self.positions[tk] = dict(qty=qty, entry=buy, stop=stop, take=take, entry_date=ds, bars=0)
                    events.append(f"🟢 XARID {tk} {qty:g} dona @ {buy:.2f} (stop {stop:.2f}, take {take:.2f})")
                elif buy > 0:
                    events.append(f"⚠️ {tk}: pul yetmadi (1 dona {buy:.2f}$, ajratilgan {budget:.0f}$)")
            # 2) ochiq pozitsiyadan chiqish shartlari
            pos = self.positions.get(tk)
            if pos:
                pos["bars"] += 1
                px = reason = None
                if l <= pos["stop"]:          # bir kunda ikkalasi tegsa - ehtiyotkorlik uchun stop deb hisoblaymiz
                    px, reason = min(o, pos["stop"]), "stop-loss"
                elif h >= pos["take"]:
                    px, reason = max(o, pos["take"]), "take-profit"
                elif c < r["ema_s"]:
                    px, reason = c, "trend buzildi"
                elif pos["bars"] >= p.max_days:
                    px, reason = c, "muddat tugadi"
                if px is not None:
                    self._close(tk, px, ds, reason)
                    t = self.trades[-1]
                    events.append(f"{'✅' if t['pnl'] > 0 else '🔴'} SOTUV {tk} @ {px:.2f} ({reason}) "
                                  f"{t['pnl_pct']:+.2f}% / {t['pnl']:+.2f}$")
            # 3) yangi signal - ertaga kiramiz
            if (allow_new and tk not in self.positions and tk not in self.pending
                    and bool(r["signal"]) and not math.isnan(r["atr"])):
                self.pending[tk] = {"atr": float(r["atr"])}
                events.append(f"🔔 SIGNAL {tk} (yopilish {c:.2f}) - ertaga ochilishda xarid")
            self.last_close[tk] = c
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
GRID = dict(rsi_buy=[35, 40, 45], sl_atr=[1.5, 2.0, 2.5], tp_atr=[2.0, 3.0, 4.0], max_days=[10, 20, 30])


MIN_TRAIN_TRADES = 10   # o'rganish qismida kamida shuncha savdo bo'lmasa, natija tasodif
MIN_TEST_TRADES = 10
MIN_GAIN = 2.0          # tekshirishda kamida shuncha ball yaxshi bo'lsin (mayda farq — shovqin)


def _score(st, min_n=MIN_TRAIN_TRADES):
    if st["n"] < min_n:
        return -1e9
    return st["return_pct"] - 0.5 * abs(st["max_dd_pct"])   # foyda minus yarim tushish


def optimize(data: dict, p: Params, start, end, capital=10000, market=None) -> dict:
    """Davrni 70% (o'rganish) va 30% (tekshirish) ga bo'ladi.
    Eng yaxshi sozlamani o'rganish qismida topadi va uni ko'rmagan tekshirish qismida sinaydi.
    Shunday qilib 'o'tmishga moslab qo'yish' xavfi kamayadi."""
    import itertools
    base_bars = build_bars(data, p, start, end)
    dates = list(base_bars)
    if len(dates) < 100:
        return dict(ok=False, why="Ma'lumot juda kam (kamida ~100 savdo kuni kerak).")
    cut = dates[int(len(dates) * 0.7)]
    split = lambda bars: ({d: v for d, v in bars.items() if d < cut}, {d: v for d, v in bars.items() if d >= cut})

    bars_by_rsi = {}
    for rb in sorted(set(GRID["rsi_buy"]) | {p.rsi_buy}):
        q = Params.from_dict({**p.to_dict(), "rsi_buy": rb})
        bars_by_rsi[rb] = split(build_bars(data, q, start, end))

    cur_train = stats(run_bars(bars_by_rsi[p.rsi_buy][0], p, capital, market))
    cur_test = stats(run_bars(bars_by_rsi[p.rsi_buy][1], p, capital, market))

    results = []
    for rb, sl, tp, md in itertools.product(*GRID.values()):
        q = Params.from_dict({**p.to_dict(), "rsi_buy": rb, "sl_atr": sl, "tp_atr": tp, "max_days": md})
        st = stats(run_bars(bars_by_rsi[rb][0], q, capital, market))
        results.append((_score(st), q, st))
    results.sort(key=lambda x: x[0], reverse=True)
    best_score, best_p, best_train = results[0]
    best_test = stats(run_bars(bars_by_rsi[best_p.rsi_buy][1], best_p, capital, market))

    changed = {k: (getattr(p, k), getattr(best_p, k)) for k in GRID if getattr(p, k) != getattr(best_p, k)}
    better = (bool(changed) and best_test["n"] >= MIN_TEST_TRADES
              and _score(best_test, MIN_TEST_TRADES) > _score(cur_test, MIN_TEST_TRADES) + MIN_GAIN
              and _score(best_train) > _score(cur_train))
    return dict(ok=True, cut=cut.strftime("%Y-%m-%d"), current=p, best=best_p, changed=changed,
                cur_train=cur_train, cur_test=cur_test, best_train=best_train, best_test=best_test,
                recommend=better)
