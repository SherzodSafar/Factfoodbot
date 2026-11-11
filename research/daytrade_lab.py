"""Kun ichi strategiyalarini oxirgi ~60 kunlik real 5 daqiqalik narxlarda sinash (GitHub Actions'da)."""
import os
import sys
import time

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from daytrade import DayBook, DayParams, day_stats, first_bar_avgs, run_day, split_days  # noqa: E402
from universe import UNIVERSE  # noqa: E402

CAPITAL = 1000.0


def download():
    import yfinance as yf
    tks = sorted(set(UNIVERSE) | {"SPY"})
    out = {}
    for i in range(0, len(tks), 60):
        part = tks[i:i + 60]
        df = yf.download(part, period="60d", interval="5m", group_by="ticker", auto_adjust=False,
                         prepost=False, threads=True, progress=False)
        for tk in part:
            try:
                g = df[tk][["Open", "High", "Low", "Close", "Volume"]].dropna()
            except KeyError:
                continue
            if g.empty:
                continue
            idx = g.index.tz_convert("America/New_York").tz_localize(None) if g.index.tz is not None else g.index
            g.index = idx
            tod = g.index - g.index.normalize()
            g = g[(tod >= pd.Timedelta(hours=9, minutes=30)) & (tod <= pd.Timedelta(hours=15, minutes=55))]
            out[tk] = g.astype(float)
    return out


def run(days, p, start_i=15):
    book = DayBook(p, CAPITAL)
    keys = list(days)
    daily = []
    for d in keys[start_i:]:
        af, ab = first_bar_avgs(days, d)
        frames = {k: v for k, v in days[d].items() if k != "SPY"}
        before = book.value()
        run_day(book, d, frames, af, ab)
        daily.append((d, book.value() / before - 1))
    return book, daily


def main():
    t0 = time.time()
    df5 = download()
    days = split_days(df5)
    keys = list(days)
    print(f"Yuklandi: {len(df5)} aksiya, {len(keys)} kun ({keys[0].date()} — {keys[-1].date()}), {time.time() - t0:.0f}s")
    test = keys[15:]
    spy = df5.get("SPY")
    if spy is not None:
        s = spy[spy.index.normalize() >= test[0]]
        bh = s["Close"].iloc[-1] / s["Open"].iloc[0] - 1
        intra = (s.groupby(s.index.normalize()).apply(lambda g: g["Close"].iloc[-1] / g["Open"].iloc[0]) ).prod() - 1
        print(f"Sinov davri: {len(test)} kun. SPY ushlab turish: {bh * 100:+.2f}%, SPY har kuni ochilishda olib "
              f"yopilishda sotish: {intra * 100:+.2f}%")
    variants = {
        "ORB hajm≥2x top10": DayParams(strategy="orb", rvol_min=2, top_n=10),
        "ORB hajm≥3x top5": DayParams(strategy="orb", rvol_min=3, top_n=5),
        "ORB hajm≥1.5x top20": DayParams(strategy="orb", rvol_min=1.5, top_n=20, max_trades=10),
        "ORB hajm≥2x top10 r0.5": DayParams(strategy="orb", rvol_min=2, top_n=10, risk_pct=0.5),
        "ORB hajm≥5x top5": DayParams(strategy="orb", rvol_min=5, top_n=5),
        "SPIKE hajm≥5x": DayParams(strategy="spike", spike_mult=5),
        "SPIKE hajm≥8x": DayParams(strategy="spike", spike_mult=8),
        "SPIKE hajm≥3x": DayParams(strategy="spike", spike_mult=3),
    }
    for name, p in variants.items():
        book, daily = run(days, p)
        st = day_stats(book)
        tr = pd.DataFrame(book.trades)
        extra = ""
        if len(tr):
            extra = (f" | kirish→chiqish: himoya {int((tr['reason'] == 'stop').sum())}, kun oxiri "
                     f"{int((tr['reason'] == 'eod').sum())} | o'rt. {tr['minutes'].mean():.0f} daq")
        print(f"{name:<24} {CAPITAL:.0f}$ → {book.value():.0f}$ ({st['ret']:+.2f}%)  savdo {st['n']:3d}  "
              f"yutuq {st['win_rate']:4.1f}%  PF {st['pf']}  o'rt/savdo {st['avg']:+.3f}%  "
              f"pasayish {st['dd']:.1f}%  yashil kun {st['green_days']}/{st['days']}" + extra)
        if len(tr):
            wk = pd.Series([r for _, r in daily], index=[d for d, _ in daily])
            w = (1 + wk).groupby(wk.index.to_period("W")).prod() - 1
            print("   haftalar: " + " ".join(f"{x * 100:+.1f}" for x in w))
            best = tr.sort_values("pnl").iloc[[0, -1]]
            print("   eng yomon/yaxshi: " + "; ".join(f"{r.ticker} {r.date} {r.pnl:+.1f}$" for r in best.itertuples()))
    print(f"\nJami vaqt {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
