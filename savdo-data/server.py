"""Savdo boti uchun narx xizmati (Render). Bot o'zi MyXvest'da ishlaydi, bu xizmat faqat Yahoo'dan narx olib beradi.

So'rov kelmasa Render uni uxlatadi — bepul soatlar faqat ishlagan paytda sarflanadi.
Kirish: X-Data-Key sarlavhasi; uning sha256 i DATA_KEY_HASH muhit o'zgaruvchisiga teng bo'lishi kerak.
  POST /daily     {"tickers": [...], "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}  -> {tk: {d,o,h,l,c,v}}  (auto_adjust)
  POST /intraday  {"tickers": [...], "period": "20d", "interval": "5m"}          -> {tk: {"Y-m-d H:M:S": {Open,...}}}
  POST /scan      {"min_gain": 20, "min_price": 0.5}                                -> [tickerlar]
"""
import gzip
import hashlib
import hmac
import json
import os
import threading
import time
import traceback
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pandas as pd

import data

warnings.filterwarnings("ignore")
KEY_HASH = os.environ.get("DATA_KEY_HASH", "")
yf_lock = threading.Lock()   # yfinance bir vaqtda bitta yuklash (Yahoo cheklamasligi uchun)


def daily(q):
    import yfinance as yf
    tickers = list(dict.fromkeys(q["tickers"]))
    s = q["start"]
    e = (pd.Timestamp(q["end"]) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    out = {}
    for i in range(0, len(tickers), data.CHUNK):
        part = tickers[i:i + data.CHUNK]
        for attempt in range(3):
            try:
                df = yf.download(part, start=s, end=e, group_by="ticker", auto_adjust=True, threads=True, progress=False)
                got = data._split(df, part)
                if got:
                    out.update(got)
                    break
            except Exception as ex:
                print("yuklash xatosi:", ex, flush=True)
            time.sleep(5 * (attempt + 1))
    return {tk: {"d": [d.strftime("%Y-%m-%d") for d in df.index], "o": df["Open"].tolist(), "h": df["High"].tolist(),
                 "l": df["Low"].tolist(), "c": df["Close"].tolist(),
                 "v": (df["Volume"] if "Volume" in df else df["Close"] * 0).fillna(0).tolist()} for tk, df in out.items()}


def intraday(q):
    res = data.load_intraday(q["tickers"], period=q.get("period", "20d"), interval=q.get("interval", "5m"))
    return {tk: {ts.strftime("%Y-%m-%d %H:%M:%S"): {k: float(v) for k, v in row.items()} for ts, row in g.to_dict("index").items()}
            for tk, g in res.items()}


def scan(q):
    return data.scan_gainers(min_gain=float(q.get("min_gain", 10)), min_price=float(q.get("min_price", 0.5)))


ROUTES = {"/daily": daily, "/intraday": intraday, "/scan": scan}


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, separators=(",", ":")).encode()
        gz = "gzip" in (self.headers.get("Accept-Encoding") or "")
        if gz:
            body = gzip.compress(body, 5)
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200, {"ok": True})

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        key = self.headers.get("X-Data-Key") or ""
        if not KEY_HASH or not hmac.compare_digest(hashlib.sha256(key.encode()).hexdigest(), KEY_HASH):
            return self._send(403, {"ok": False})
        fn = ROUTES.get(self.path.split("?")[0])
        if not fn:
            return self._send(404, {"ok": False})
        try:
            q = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            t = time.time()
            with yf_lock:
                res = fn(q)
            print(f"{self.path}: {len(q.get('tickers', []))} ta so'raldi, {len(res)} ta keldi, {time.time() - t:.1f}s", flush=True)
            self._send(200, {"ok": True, "data": res})
        except Exception as ex:
            traceback.print_exc()
            self._send(500, {"ok": False, "error": str(ex)[:300]})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "10000"))), H).serve_forever()
