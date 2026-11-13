"""'Tez uchayotgan aksiyalar' (runner) strategiyasini oxirgi ~60 kunlik real 5 daqiqalik narxlarda sinash.

Aksiyalar ro'yxati Yahoo skanerlaridan yig'iladi (bugun o'sayotganlar, kichik kompaniyalar, eng faollar).
⚠️ Ro'yxat BUGUNGI holatdan tuzilgan — o'tmishda "uchgan" aksiyalar ko'proq tushgan bo'lishi mumkin,
natija biroz yaxshiroq ko'rinishi mumkin. Shuni hisobga olib baholang."""
import os
import sys
import time

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from daytrade import DayBook, DayParams, day_stats, run_day, split_days  # noqa: E402

CAPITAL = 1000.0
SCREENS = ["day_gainers", "small_cap_gainers", "aggressive_small_caps", "most_actives", "most_shorted_stocks",
           "day_losers"]


def collect():
    import yfinance as yf
    names = set()
    for q in SCREENS:
        try:
            r = yf.screen(q, count=250)
            names |= {x["symbol"] for x in r.get("quotes", [])}
            print(f"  skaner {q}: {len(r.get('quotes', []))}")
        except Exception as ex:
            print("  skaner xatosi", q, ex)
    try:
        Q = yf.EquityQuery
        q = Q("and", [Q("eq", ["region", "us"]), Q("gt", ["percentchange", 5]), Q("gt", ["dayvolume", 1_000_000]),
                      Q("gt", ["intradayprice", 0.5])])
        r = yf.screen(q, size=250, sortField="percentchange", sortAsc=False)
        names |= {x["symbol"] for x in r.get("quotes", [])}
        print(f"  skaner (bugun +5%, hajm>1 mln): {len(r.get('quotes', []))}")
    except Exception as ex:
        print("  maxsus skaner xatosi", ex)
    return sorted(n for n in names if n.isalpha())


def download(tks):
    import yfinance as yf
    out = {}
    for i in range(0, len(tks), 60):
        part = tks[i:i + 60]
        try:
            df = yf.download(part, period="60d", interval="5m", group_by="ticker", auto_adjust=False,
                             prepost=False, threads=True, progress=False)
        except Exception as ex:
            print("yuklash xatosi", ex)
            continue
        for tk in part:
            try:
                g = df[tk][["Open", "High", "Low", "Close", "Volume"]].dropna()
            except KeyError:
                continue
            if g.empty:
                continue
            if g.index.tz is not None:
                g.index = g.index.tz_convert("America/New_York").tz_localize(None)
            tod = g.index - g.index.normalize()
            g = g[(tod >= pd.Timedelta(hours=9, minutes=30)) & (tod <= pd.Timedelta(hours=15, minutes=55))]
            if len(g):
                out[tk] = g.astype(float)
    return out


def run(days, p, start_i=11):
    book = DayBook(p, CAPITAL)
    keys = list(days)
    for i in range(start_i, len(keys)):
        d = keys[i]
        prev = days[keys[i - 1]]
        pc = {tk: float(g["Close"].iloc[-1]) for tk, g in prev.items() if len(g)}
        hist = [days[k] for k in keys[max(0, i - 10):i]]
        ab = {}
        for tk in days[d]:
            v = [h[tk]["Volume"].mean() for h in hist if tk in h and len(h[tk])]
            if len(v) >= 5 and sum(v) > 0:
                ab[tk] = sum(v) / len(v)
        run_day(book, d, days[d], {}, ab, None, pc)
    return book


def main():
    t0 = time.time()
    print("Aksiyalar yig'ilmoqda:")
    tks = collect()
    df5 = download(tks)
    days = split_days(df5)
    keys = list(days)
    print(f"Yuklandi: {len(df5)} aksiya (skanerlarda {len(tks)}), {len(keys)} kun ({keys[0].date()} — {keys[-1].date()}), "
          f"{time.time() - t0:.0f}s")
    px = pd.Series({tk: g["Close"].iloc[-1] for tk, g in df5.items()})
    print(f"Narxlar: <1$: {(px < 1).sum()}, 1–5$: {((px >= 1) & (px < 5)).sum()}, 5–20$: {((px >= 5) & (px < 20)).sum()}, "
          f"20$+: {(px >= 20).sum()}")
    R = lambda **k: DayParams(**{**dict(strategy="runner", slippage=0.003, risk_pct=0.5, max_pos_pct=20,
                                        max_trades=8, spy_filter=False, target_r=0), **k})
    variants = {
        "YORIB: +20%, maqsad +10%, −5%, 60d (eski eng yaxshi)": R(min_gain=20, target_pct=10, stop_pct=5, time_stop=60),
        "DIP: +20%, qaytish ≥8%, maqsad = cho'qqi": R(min_gain=20, entry="dip", dip_min=8, target_hod=True, target_pct=5),
        "DIP: +20%, qaytish ≥12%, maqsad = cho'qqi": R(min_gain=20, entry="dip", dip_min=12, target_hod=True, target_pct=5),
        "DIP: +20%, qaytish ≥8%, maqsad +10%, 60d": R(min_gain=20, entry="dip", dip_min=8, target_pct=10, time_stop=60),
        "DIP: +10%, qaytish ≥8%, maqsad = cho'qqi": R(min_gain=10, entry="dip", dip_min=8, target_hod=True, target_pct=5),
        "DIP: +30%, qaytish ≥10%, maqsad = cho'qqi": R(min_gain=30, entry="dip", dip_min=10, target_hod=True, target_pct=5),
        "VWAP: +20%, maqsad = cho'qqi": R(min_gain=20, entry="vwap", target_hod=True, target_pct=5),
        "VWAP: +20%, maqsad +10%, 60d": R(min_gain=20, entry="vwap", target_pct=10, time_stop=60),
        "VWAP: +10%, maqsad = cho'qqi": R(min_gain=10, entry="vwap", target_hod=True, target_pct=5),
        "DIP: +20%, qaytish ≥8%, cho'qqi, sirp 0.1%": R(min_gain=20, entry="dip", dip_min=8, target_hod=True, target_pct=5,
                                                       slippage=0.001),
    }
    for name, p in variants.items():
        book = run(days, p)
        st = day_stats(book)
        tr = pd.DataFrame(book.trades)
        line = (f"{name:<52} {CAPITAL:.0f}$ → {book.value():.0f}$ ({st['ret']:+.2f}%)  savdo {st['n']:3d}  "
                f"yutuq {st['win_rate']:4.1f}%  PF {st['pf']}  pasayish {st['dd']:.1f}%  yashil kun {st['green_days']}/{st['days']}")
        print(line)
        if len(tr):
            no_best = tr["pnl"].sum() - tr["pnl"].max()
            r = tr["reason"].value_counts().to_dict()
            print(f"   chiqish: {r} | o'rt. {tr['minutes'].mean():.0f} daq | o'rtacha savdo {tr['pnl_pct'].mean():+.2f}%, "
                  f"mediana {tr['pnl_pct'].median():+.2f}% | eng yaxshi savdosiz jami {no_best:+.0f}$ | "
                  f"aksiyalar {tr['ticker'].nunique()}")
            top = tr.sort_values("pnl").iloc[[0, 1, -2, -1]] if len(tr) >= 4 else tr
            print("   " + "; ".join(f"{t.ticker} {t.date} {t.pnl_pct:+.1f}%" for t in top.itertuples()))
    print(f"\nJami vaqt {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
