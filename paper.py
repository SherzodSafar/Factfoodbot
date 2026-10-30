"""Demo (virtual pul bilan) savdo. Har narx guruhi uchun alohida "hisob" (book).
Holat JSON faylda saqlanadi va bot uni Telegram'ga zaxiralaydi."""
import json
import os
import threading

import pandas as pd

from engine import Params, Portfolio, build_bars
from universe import TIERS


class Paper:
    def __init__(self, path):
        self.path = path
        self.lock = threading.RLock()
        self.state = None
        self.reload()

    def reload(self):
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                self.state = json.load(f)

    def save(self):
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False)
        os.replace(tmp, self.path)

    @property
    def active(self):
        return bool(self.state and self.state.get("books"))

    def tiers(self):
        return [k for k, *_ in TIERS if k in (self.state or {}).get("books", {})]

    def book(self, tier):
        return self.state["books"][tier]

    def params(self, tier=None) -> Params:
        if not self.active or tier is None:
            return Params()
        return Params.from_dict(self.book(tier)["params"])

    def portfolio(self, tier) -> Portfolio:
        return Portfolio.from_dict(self.book(tier)["portfolio"], self.params(tier))

    def start(self, selection: dict, capital: float):
        with self.lock:
            keep = {k: v for k, v in (self.state or {}).items() if k in ("auto_apply", "sent")}
            books = {}
            for tier, tks in selection.items():
                p = self.params(tier) if self.active and tier in self.state["books"] else Params()
                books[tier] = dict(tickers=list(tks), params=p.to_dict(),
                                   portfolio=Portfolio(p, capital).to_dict(), suggested=None, history=[])
            self.state = dict(keep, capital=capital, books=books,
                              started=pd.Timestamp.now().strftime("%Y-%m-%d"),
                              selected_at=pd.Timestamp.now().strftime("%Y-%m-%d"))
            self.save()

    def set_selection(self, selection: dict):
        """Yangi tanlov: ochiq yoki kutilayotgan savdosi bor aksiyalar ham ro'yxatda qoladi (yopilguncha)."""
        with self.lock:
            for tier, tks in selection.items():
                if tier not in self.state["books"]:
                    continue
                b = self.book(tier)
                busy = list(b["portfolio"]["positions"]) + list(b["portfolio"]["pending"])
                b["tickers"] = list(dict.fromkeys(list(tks) + busy))
            self.state["selected_at"] = pd.Timestamp.now().strftime("%Y-%m-%d")
            self.save()

    def set_params(self, tier, params: Params, note=""):
        with self.lock:
            b = self.book(tier)
            b.setdefault("history", []).append(dict(date=pd.Timestamp.now().strftime("%Y-%m-%d"),
                                                    old=b["params"], new=params.to_dict(), note=note))
            b["params"] = params.to_dict()
            b["suggested"] = None
            self.save()

    def update(self, loader, cutoff: pd.Timestamp):
        """Har bir guruh uchun oxirgi qayta ishlangan kundan keyingi yopilgan kunlarni o'tkazadi.
        Qaytaradi: {guruh: (yangi kunlar soni, hodisalar)}."""
        with self.lock:
            all_tk = sorted({t for tier in self.tiers() for t in self.book(tier)["tickers"]})
            lasts = [self.book(t)["portfolio"]["last_date"] for t in self.tiers()]
            start = min([pd.Timestamp(x) for x in lasts if x] or [cutoff])
            data = loader(all_tk, start, cutoff)
            out = {}
            for tier in self.tiers():
                b = self.book(tier)
                p = self.params(tier)
                pf = self.portfolio(tier)
                bd = {t: data[t] for t in b["tickers"] if t in data}
                if not bd:
                    out[tier] = (0, ["⚠️ narx ma'lumoti kelmadi"])
                    continue
                bars = build_bars(bd, p, end=cutoff)
                last = pd.Timestamp(pf.last_date) if pf.last_date else None
                keys = list(bars)[-1:] if last is None else [d for d in bars if d > last]
                events = []
                for d in keys:
                    events += [f"{d.strftime('%m-%d')} {e}" for e in pf.step(d, bars[d])]
                b["portfolio"] = pf.to_dict()
                out[tier] = (len(keys), events)
            self.save()
            return out
