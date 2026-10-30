"""Strategiyalar laboratoriyasi: real tarixiy narxlarda bir nechta yondashuvni solishtiradi.
GitHub Actions'da ishlaydi (Yahoo ochiq). Natija logga chiqadi.
Har oy guruh a'zoligi va tanlov faqat o'sha paytgacha bo'lgan ma'lumotdan (kelajakka qaramasdan)."""
import sys, os, time
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from universe import UNIVERSE, TIERS, SLIPPAGE

START = os.environ.get("LAB_START", "2012-01-01")
TEST_FROM = pd.Timestamp(os.environ.get("LAB_TEST_FROM", "2014-01-01"))
COMM = 0.0005


def download():
    import yfinance as yf
    tks = sorted(set(UNIVERSE) | {"SPY"})
    df = yf.download(tks, start=START, auto_adjust=True, group_by="column", threads=True, progress=False)
    f = {k: df[k].sort_index() for k in ["Open", "High", "Low", "Close", "Volume"]}
    good = [t for t in f["Close"].columns if f["Close"][t].notna().sum() > 300]
    idx = f["Close"]["SPY"].dropna().index
    return {k: v.reindex(idx)[good] for k, v in f.items()}


def ema(x, n): return x.ewm(span=n, adjust=False, ignore_na=True).mean()


def rsi(c, n):
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, ignore_na=True).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False, ignore_na=True).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def indicators(f):
    O, H, L, C, V = (f[k] for k in ["Open", "High", "Low", "Close", "Volume"])
    pc = C.shift()
    tr = np.maximum(np.maximum(H - L, (H - pc).abs()), (L - pc).abs())
    I = dict(O=O, H=H, L=L, C=C,
             e20=ema(C, 20), e50=ema(C, 50), e200=ema(C, 200), sma200=C.rolling(200).mean(),
             rsi14=rsi(C, 14), rsi2=rsi(C, 2), atr=tr.ewm(alpha=1 / 14, adjust=False, ignore_na=True).mean(),
             mom126=C / C.shift(126) - 1, mom252=C / C.shift(252) - 1, mom21=C / C.shift(21) - 1,
             hh50=H.rolling(50).max().shift(), hh100=H.rolling(100).max().shift(), hh20=H.rolling(20).max().shift(), ll10=L.rolling(10).min().shift(),
             dv=(C * V).rolling(20).mean(), cnt=C.notna().cumsum(), vol20=C.pct_change().rolling(20).std())
    return I


def tier_membership(I, lo, hi, min_dv):
    C = I["C"]
    el = (C >= lo) & (C < hi) & (I["dv"] >= min_dv) & (I["cnt"] >= 260)
    me = el.groupby(el.index.to_period("M")).transform("last")  # oy oxiridagi holat
    # keyingi oyga qo'llanadi
    m = el.resample("ME").last()
    m.index = m.index + pd.offsets.Day(1)
    return m.reindex(C.index, method="ffill").fillna(False).astype(bool)


def top_pick(I, member, n=6):
    """Joriy bot tanlovi: har oy a'zolardan (trend, 6 oylik o'sish) bo'yicha eng yaxshi 6 tasi."""
    C = I["C"]
    up = (C > I["e200"]) & (I["e50"] > I["e200"])
    score = (up.astype(float) * 10 + I["mom126"].fillna(-9)).where(member)
    ms = score.resample("ME").last()
    rank = ms.rank(axis=1, ascending=False)
    pick = rank <= n
    pick.index = pick.index + pd.offsets.Day(1)
    return pick.reindex(C.index, method="ffill").fillna(False).astype(bool) & member


# ---------------- universal swing simulyatori ----------------
def run_swing(I, pool, mkt, slip, cfg, capital=10000.0):
    C, O, H, L = I["C"].values, I["O"].values, I["H"].values, I["L"].values
    atr, e200, e50 = I["atr"].values, I["e200"].values, I["e50"].values
    T, N = C.shape
    pool = pool.values
    up = (C > e200) & (e50 > e200)
    kind = cfg["entry"]
    if kind == "rsi40":
        r = I["rsi14"].values; rp = I["rsi14"].shift().values
        sig = up & (r > cfg.get("rsi", 40)) & (rp <= cfg.get("rsi", 40))
    elif kind == "rsi2":
        sig = up & (I["rsi2"].values < cfg.get("rsi2", 10))
    elif kind == "breakout":
        sig = up & (C > I[cfg.get("hh", "hh50")].values) & (I["mom126"].values > 0)
    elif kind == "momtop":
        sc = I["mom126"].where(pd.DataFrame(up & pool, index=I["C"].index, columns=I["C"].columns))
        rk = sc.rank(axis=1, ascending=False).values
        idx = I["C"].index
        wk = idx.isocalendar().week.values
        last_day = np.r_[wk[1:] != wk[:-1], True]
        sig = (rk <= cfg.get("K", 5)) & last_day[:, None] & (np.nan_to_num(sc.values, nan=-1) > 0)
    rank = np.nan_to_num(I["mom126"].values, nan=-9)
    rsi2 = I["rsi2"].values
    cash = capital; pos = {}; pend = []; eq = np.empty(T); trades = []
    mk = mkt.values
    peak = capital
    for t in range(T):
        # kirish
        if pend:
            val = cash + sum(p["q"] * np.nan_to_num(C[t - 1, j]) for j, p in pos.items())
            for j, a in pend:
                if j in pos or np.isnan(O[t, j]) or len(pos) >= cfg["max_pos"]:
                    continue
                buy = O[t, j] * (1 + slip)
                stop = buy - cfg["sl"] * a
                if cfg.get("sizing") == "risk":
                    rk_ = cfg["risk"] * (0.5 if cfg.get("brake") and val / peak - 1 < -cfg["brake"] else 1.0)
                    q = val * rk_ / 100 / max(buy - stop, 1e-9)
                    q = min(q, val * cfg["cap"] / 100 / buy)
                else:
                    q = val * cfg["pct"] / 100 / buy
                q = min(q, cash / (buy * (1 + COMM)))
                if q * buy < 1:
                    continue
                cash -= q * buy * (1 + COMM)
                pos[j] = dict(q=q, e=buy, stop=stop, take=buy + cfg["tp"] * a if cfg.get("tp") else np.inf,
                              d=0, hi=buy)
            pend = []
        # chiqish
        for j in list(pos):
            p = pos[j]
            if np.isnan(C[t, j]):
                continue
            p["d"] += 1
            px = None
            if L[t, j] <= p["stop"]:
                px = min(O[t, j], p["stop"])
            elif H[t, j] >= p["take"]:
                px = max(O[t, j], p["take"])
            elif cfg.get("trend_exit", True) and C[t, j] < e200[t, j]:
                px = C[t, j]
            elif cfg.get("max_days") and p["d"] >= cfg["max_days"]:
                px = C[t, j]
            elif cfg.get("rsi2_exit") and rsi2[t, j] > cfg["rsi2_exit"]:
                px = C[t, j]
            elif cfg.get("e20_exit") and C[t, j] < I["e20"].values[t, j]:
                px = C[t, j]
            if px is not None:
                sell = px * (1 - slip)
                cash += p["q"] * sell * (1 - COMM)
                trades.append(sell * (1 - COMM) / (p["e"] * (1 + COMM)) - 1)
                del pos[j]
            elif cfg.get("trail"):
                p["stop"] = max(p["stop"], C[t, j] - cfg["trail"] * atr[t, j])
        # signal
        if t < T - 1 and (mk[t] or not cfg.get("mfilter", True)):
            free = cfg["max_pos"] - len(pos)
            if free > 0:
                js = np.where(sig[t] & pool[t] & ~np.isnan(atr[t]))[0]
                js = [j for j in js if j not in pos]
                js.sort(key=lambda j: -rank[t, j])
                pend = [(j, atr[t, j]) for j in js[:free]]
        eq[t] = cash + sum(p["q"] * C[t, j] for j, p in pos.items() if not np.isnan(C[t, j])) + \
            sum(p["q"] * C[t - 1, j] for j, p in pos.items() if np.isnan(C[t, j]) and t > 0 and not np.isnan(C[t - 1, j]))
        peak = max(peak, eq[t])
    return pd.Series(eq, index=I["C"].index), trades


# ---------------- momentum aylanishi ----------------
def run_mom(I, pool, mkt, slip, K=5, freq="M", look="mom126", buffer=2.0, capital=10000.0, daily_mkt_exit=True,
            invvol=False):
    C, O = I["C"].values, I["O"].values
    T, N = C.shape
    up = (I["C"] > I["e200"]).values
    sc = np.nan_to_num(I[look].values, nan=-9)
    if look == "mom126":  # oxirgi oyni chiqarib tashlash (qisqa muddatli qaytish effekti)
        sc = np.nan_to_num((I["C"].shift(21) / I["C"].shift(126) - 1).values, nan=-9)
    vol = np.nan_to_num(I["vol20"].values, nan=1)
    pool = pool.values; mk = mkt.values
    idx = I["C"].index
    if freq == "M":
        reb = np.r_[True, idx.month[1:] != idx.month[:-1]]
    else:
        reb = np.r_[True, idx.isocalendar().week.values[1:] != idx.isocalendar().week.values[:-1]]
    reb_sig = np.r_[reb[1:], False]  # rebalans kunidan oldingi yopilishda signal
    cash = capital; pos = {}; eq = np.empty(T); target = None; trades = []; ent = {}
    for t in range(T):
        if target is not None:
            # sotish
            for j in list(pos):
                if j not in target and not np.isnan(O[t, j]):
                    sell = O[t, j] * (1 - slip)
                    cash += pos[j] * sell * (1 - COMM)
                    trades.append(sell * (1 - COMM) / ent[j] - 1)
                    del pos[j]
            val = cash + sum(q * np.nan_to_num(O[t, j]) for j, q in pos.items())
            new = [j for j in target if j not in pos and not np.isnan(O[t, j])]
            if new:
                w = {j: (1 / vol[t - 1, j] if invvol else 1.0) for j in target}
                tot = sum(w.values())
                for j in new:
                    buy = O[t, j] * (1 + slip)
                    amt = min(val * w[j] / tot, cash / (1 + COMM))
                    if amt > 1:
                        pos[j] = amt / buy
                        ent[j] = buy * (1 + COMM)
                        cash -= amt * (1 + COMM)
            target = None
        if t < T - 1:
            if not mk[t] and daily_mkt_exit and pos:
                target = []
            elif reb_sig[t]:
                if not mk[t]:
                    target = []
                else:
                    ok = np.where(pool[t] & up[t] & (sc[t] > 0))[0]
                    order = ok[np.argsort(-sc[t, ok])]
                    keep = [j for j in pos if j in set(order[:int(K * buffer)])]
                    fill = [j for j in order if j not in keep][:max(K - len(keep), 0)]
                    target = keep + fill
        eq[t] = cash + sum(q * (C[t, j] if not np.isnan(C[t, j]) else C[t - 1, j]) for j, q in pos.items())
    return pd.Series(eq, index=idx), trades


def metrics(eq, trades=None):
    eq = eq[eq.index >= TEST_FROM]
    eq = eq / eq.iloc[0]
    r = eq.pct_change().dropna()
    yrs = len(r) / 252
    cagr = eq.iloc[-1] ** (1 / yrs) - 1
    dd = (eq / eq.cummax() - 1).min()
    sh = r.mean() / r.std() * np.sqrt(252) if r.std() > 0 else 0
    yearly = eq.resample("YE").last().pct_change()
    yearly.iloc[0] = eq.resample("YE").last().iloc[0] - 1
    mon = eq.resample("ME").last().pct_change().dropna()
    out = dict(cagr=cagr * 100, dd=dd * 100, sharpe=sh, worst_y=yearly.min() * 100, pos_m=(mon > 0).mean() * 100,
               yearly=yearly)
    if trades is not None:
        tr = np.array(trades)
        out.update(n=len(tr), win=(tr > 0).mean() * 100 if len(tr) else 0,
                   pf=tr[tr > 0].sum() / -tr[tr <= 0].sum() if (tr <= 0).any() else 0)
    return out


def metrics_part(eq, a, b):
    e = eq[(eq.index >= pd.Timestamp(a)) & (eq.index <= pd.Timestamp(b))]
    if len(e) < 50:
        return 0.0
    return ((e.iloc[-1] / e.iloc[0]) ** (252 / len(e)) - 1) * 100


def line(name, m):
    s = f"{name:<26} CAGR {m['cagr']:6.1f}%  DD {m['dd']:6.1f}%  Sharpe {m['sharpe']:4.2f}  yomon yil {m['worst_y']:6.1f}%  +oy {m['pos_m']:3.0f}%"
    if "n" in m:
        s += f"  savdo {m['n']:4d} yutuq {m['win']:3.0f}% PF {m['pf']:.2f}"
    return s


def yline(m):
    return "   yillar: " + " ".join(f"{d.year % 100:02d}:{v * 100:+.0f}" for d, v in m["yearly"].items())


def main():
    t0 = time.time()
    f = download()
    print(f"Yuklandi: {f['Close'].shape[1]} aksiya, {len(f['Close'])} kun, {time.time() - t0:.0f}s")
    I = indicators(f)
    spy = I["C"]["SPY"]
    mkt = spy > spy.rolling(200).mean()
    spy_eq = spy / spy.iloc[0]
    print(line("SPY ushlab turish", metrics(spy_eq)))
    print(yline(metrics(spy_eq)))
    spy_f = (1 + spy.pct_change().fillna(0) * mkt.shift().fillna(False)).cumprod()
    print(line("SPY + 200 filtr", metrics(spy_f)))
    B = dict(entry="breakout", sl=3, tp=None, trail=3, trend_exit=False, sizing="risk", risk=1, cap=20, max_pos=8)
    V = lambda **k: ("swing", "all", {**B, **k})
    strategies = {
        "brk50 t3 r1 p8 (asos)": V(),
        "brk50 filtrsiz": V(mfilter=False),
        "brk100 t3": V(hh="hh100"),
        "brk50 t4": V(sl=4, trail=4),
        "brk50 t2.5": V(sl=2.5, trail=2.5),
        "brk50 r0.5": V(risk=0.5),
        "brk50 r1.5": V(risk=1.5),
        "brk50 p12 r0.75": V(max_pos=12, risk=0.75, cap=15),
        "brk50 p5 cap25": V(max_pos=5, cap=25),
        "brk50 tormoz10": V(brake=0.10),
        "brk50 +e200 chiqish": V(trend_exit=True),
        "momtop K5 + trail3": V(entry="momtop", K=5),
        "momtop K5 + trail4": V(entry="momtop", K=5, sl=4, trail=4),
    }
    for key, name, lo, hi, min_dv in TIERS:
        member = tier_membership(I, lo, hi, min_dv)
        print(f"\n===== {name} =====")
        curves = {}
        for sname, (kind, pk, cfg) in strategies.items():
            eq, tr = run_swing(I, member, mkt, SLIPPAGE[key], cfg)
            curves[sname] = eq
            m = metrics(eq, tr)
            a, b = metrics_part(eq, "2014-01-01", "2019-12-31"), metrics_part(eq, "2020-01-01", "2026-12-31")
            print(line(sname, m) + f"  | 14-19: {a:+.1f}%/y 20-26: {b:+.1f}%/y")
            print(yline(m))
        # walk-forward: har 6 oyda oxirgi 2 yil Sharpe bo'yicha eng yaxshi sozlamani tanlash
        R = pd.DataFrame({k: v.pct_change() for k, v in curves.items() if k.startswith("brk")}).fillna(0)
        half = R.index.year * 2 + (R.index.month > 6)
        out = pd.Series(0.0, index=R.index)
        picks = []
        for h in sorted(set(half)):
            msk = half == h
            st = R.index[msk][0]
            hist = R[(R.index < st) & (R.index >= st - pd.DateOffset(years=2))]
            if len(hist) < 400:
                out[msk] = R.loc[msk, "brk50 t3 r1 p8 (asos)"]; continue
            sh = hist.mean() / hist.std()
            k = sh.idxmax(); picks.append(k)
            out[msk] = R.loc[msk, k]
        m = metrics((1 + out).cumprod())
        print(line("WALK-FORWARD (6oy, 2y)", m)); print(yline(m))
        print("   tanlovlar:", pd.Series(picks).value_counts().to_dict())
    print(f"\nJami vaqt {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
