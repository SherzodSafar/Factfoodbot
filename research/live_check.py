"""Botning o'zini real narxlarda tekshirish (Telegram'siz): demo 30-oktabrdan boshlangandek har kunni o'tkazadi
va barcha buyruqlarni bajaradi. Xatolar, vaqt va xotira logga chiqadi. GitHub Actions'da ishlaydi."""
import os
import resource
import sys
import tempfile
import time
import traceback

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import data  # noqa: E402
from commands import Service  # noqa: E402
from paper import Paper  # noqa: E402

START = pd.Timestamp(os.environ.get("CHECK_START", "2026-10-30"))
CAPITAL = os.environ.get("CHECK_CAPITAL", "3000")
CUT = [START]
cache = {}


def loader(tks, start, end=None):
    """Bir marta yuklab, keyin keshdan beradi (kesish sanasidan keyingi kunlarni yashiradi)."""
    need = [t for t in tks if t not in cache]
    if need:
        cache.update(data.load(need, pd.Timestamp("2023-01-01")))
        for t in need:
            cache.setdefault(t, None)
    s = pd.Timestamp(start) - pd.Timedelta(days=data.WARMUP_DAYS)
    e = pd.Timestamp(end) if end is not None else CUT[0]
    return {t: df[(df.index >= s) & (df.index <= e)] for t in tks
            if (df := cache.get(t)) is not None and len(df[(df.index >= s) & (df.index <= e)])}


def run(svc, cmd, limit=2500):
    t0 = time.time()
    print(f"\n>>> {cmd}  (kesish {CUT[0].date()})")
    try:
        for m in svc.handle(cmd):
            print(m[:limit])
            print("--")
    except Exception:
        print("❌ XATO:")
        traceback.print_exc(file=sys.stdout)
    print(f"[{time.time() - t0:.1f}s, xotira {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024:.0f} MB]")


def main():
    svc = Service(Paper(os.path.join(tempfile.mkdtemp(), "st.json")), loader, lambda: CUT[0])
    last = data.last_complete_us_day()
    run(svc, f"/demo_boshlash {CAPITAL}")
    run(svc, "/kasr on")
    for d in pd.bdate_range(START + pd.Timedelta(days=1), last):
        CUT[0] = d
        run(svc, "/yangilash", 1500)
    for cmd in ("/aksiyalar", "/savdolar", "/hisobot kunlik", "/hisobot haftalik", "/bozor", "/sozlamalar", "/baho", "/tahlil",
                f"/test {CAPITAL}"):
        run(svc, cmd)
    # holat faylida mantiqiy tekshiruvlar
    st = svc.paper.state
    print("\n===== Tekshiruvlar =====")
    for tier in svc.paper.tiers():
        pf = svc.paper.portfolio(tier)
        inv = sum(p["qty"] * pf.last_close.get(t, p["entry"]) for t, p in pf.positions.items())
        print(f"{tier}: aksiya {len(svc.paper.book(tier)['tickers'])}, naqd {pf.cash:.2f}, pozitsiyada {inv:.2f}, "
              f"ochiq {len(pf.positions)}, kutilmoqda {len(pf.pending)}, yopilgan {len(pf.trades)}, "
              f"oxirgi kun {pf.last_date}")
        if pf.cash < -0.01:
            print("  ❌ naqd manfiy!")
        for t, p in pf.positions.items():
            if p["stop"] >= pf.last_close.get(t, p["entry"]):
                print(f"  ⚠️ {t}: stop narxdan yuqori")
    print("bench:", st.get("bench"))
    print("Yuklab bo'lmagan aksiyalar:", sorted(t for t, v in cache.items() if v is None))


if __name__ == "__main__":
    main()
