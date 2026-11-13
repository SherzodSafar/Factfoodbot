"""Yahoo Finance'dan kunlik narxlarni yuklash (bepul, kalit kerak emas)."""
import time as _time
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

WARMUP_DAYS = 420  # EMA200 uchun oldingi tarix
CHUNK = 60


def _split(df, tickers):
    out = {}
    if df is None or df.empty:
        return out
    if not isinstance(df.columns, pd.MultiIndex):
        frames = {tickers[0]: df}
    else:
        plevel = 0 if "Close" in df.columns.get_level_values(0) else 1
        tlevel = 1 - plevel
        frames = {tk: df.xs(tk, axis=1, level=tlevel) for tk in dict.fromkeys(df.columns.get_level_values(tlevel))}
    for tk, sub in frames.items():
        cols = [c for c in ("Open", "High", "Low", "Close", "Volume") if c in sub.columns]
        if not {"Open", "High", "Low", "Close"} <= set(cols):
            continue
        sub = sub[cols].dropna(subset=["Open", "High", "Low", "Close"])
        if sub.empty:
            continue
        sub.index = pd.to_datetime(sub.index).tz_localize(None).normalize()
        out[str(tk)] = sub.astype(float)
    return out


def load(tickers, start, end=None) -> dict:
    import yfinance as yf
    tickers = list(dict.fromkeys(tickers))
    s = (pd.Timestamp(start) - pd.Timedelta(days=WARMUP_DAYS)).strftime("%Y-%m-%d")
    e = (pd.Timestamp(end) + pd.Timedelta(days=1)).strftime("%Y-%m-%d") if end is not None else None
    out = {}
    for i in range(0, len(tickers), CHUNK):
        part = tickers[i:i + CHUNK]
        for attempt in range(3):
            try:
                df = yf.download(part, start=s, end=e, group_by="ticker", auto_adjust=True,
                                 threads=True, progress=False)
                got = _split(df, part)
                if got:
                    out.update(got)
                    break
            except Exception as ex:
                print("yuklash xatosi:", ex)
            _time.sleep(5 * (attempt + 1))
    return out


def last_complete_us_day() -> pd.Timestamp:
    """AQSh birjasida to'liq yopilgan oxirgi kun (16:00 Nyu-York vaqtidan keyin)."""
    now = datetime.now(ZoneInfo("America/New_York"))
    d = now.date() if now.time() >= time(16, 30) else now.date() - timedelta(days=1)
    return pd.Timestamp(d)


NY = ZoneInfo("America/New_York")


def load_intraday(tickers, period="20d", interval="5m") -> dict:
    """5 daqiqalik shamlar, Nyu-York vaqtida (tz'siz), faqat asosiy savdo soatlari 9:30–15:55."""
    import yfinance as yf
    tickers = list(dict.fromkeys(tickers))
    out = {}
    for i in range(0, len(tickers), CHUNK):
        part = tickers[i:i + CHUNK]
        for attempt in range(3):
            try:
                df = yf.download(part, period=period, interval=interval, group_by="ticker", auto_adjust=False,
                                 prepost=False, threads=True, progress=False)
                break
            except Exception as ex:
                print("kun ichi yuklash xatosi:", ex)
                df = None
                _time.sleep(5 * (attempt + 1))
        if df is None or df.empty:
            continue
        for tk in part:
            try:
                g = (df[tk] if isinstance(df.columns, pd.MultiIndex) else df)[["Open", "High", "Low", "Close", "Volume"]]
            except KeyError:
                continue
            g = g.dropna()
            if g.empty:
                continue
            if g.index.tz is not None:
                g.index = g.index.tz_convert(NY).tz_localize(None)
            tod = g.index - g.index.normalize()
            g = g[(tod >= pd.Timedelta(hours=9, minutes=30)) & (tod <= pd.Timedelta(hours=15, minutes=55))]
            if len(g):
                out[str(tk)] = g.astype(float)
    return out


def ny_now():
    return pd.Timestamp(datetime.now(NY).replace(tzinfo=None))


def scan_gainers(min_gain=10.0, min_price=0.5, min_volume=500_000, size=100) -> list:
    """Yahoo skaneri: bugun kamida min_gain % o'sgan AQSh aksiyalari (eng ko'p o'sganlari birinchi)."""
    import yfinance as yf
    Q = yf.EquityQuery
    q = Q("and", [Q("eq", ["region", "us"]), Q("gt", ["percentchange", min_gain]),
                  Q("gt", ["dayvolume", min_volume]), Q("gt", ["intradayprice", min_price])])
    r = yf.screen(q, size=size, sortField="percentchange", sortAsc=False)
    return [x["symbol"] for x in r.get("quotes", []) if x.get("symbol", "").isalpha()]
