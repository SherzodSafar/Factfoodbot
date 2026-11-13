"""Yahoo jonli narx oqimi (WebSocket) sinovi: bir necha aksiyaga 60 soniya obuna bo'lib, kelgan xabarlarni sanaydi."""
import os
import sys
import threading
import time

import yfinance as yf

TICKERS = os.environ.get("WS_TICKERS", "ONFO,FCUV,SLSN,SPY").split(",")
SECONDS = int(os.environ.get("WS_SECONDS", "60"))
got, first = {}, {}
t0 = time.time()


def on_msg(m):
    tk = m.get("id")
    got[tk] = got.get(tk, 0) + 1
    if got[tk] <= 3:
        lag = time.time() - int(m.get("time", 0)) / 1000 if m.get("time") else None
        print(f"{time.time() - t0:5.1f}s {tk}: narx {m.get('price')} o'zgarish {m.get('change_percent', 0):+.1f}% "
              f"hajm {m.get('day_volume')} kechikish {lag:.1f}s" if lag is not None else f"{tk}: {m}", flush=True)


ws = yf.WebSocket(verbose=False)
ws.subscribe(TICKERS)
th = threading.Thread(target=lambda: ws.listen(on_msg), daemon=True)
th.start()
time.sleep(SECONDS)
ws.close()
print(f"\n{SECONDS} soniyada kelgan narx yangilanishlari:", got, flush=True)
