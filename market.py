"""AQSh birjasi (NYSE/Nasdaq) ish kunlari va soatlari — Toshkent vaqtida ko'rsatish uchun."""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

NY = ZoneInfo("America/New_York")
TASH = ZoneInfo("Asia/Tashkent")
OPEN, CLOSE = time(9, 30), time(16, 0)

# Birja yopiq bo'ladigan bayramlar (NYSE)
HOLIDAYS = {
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
    "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05",
    "2027-09-06", "2027-11-25", "2027-12-24",
}
# Qisqa kunlar: birja 13:00 da (NY) yopiladi
HALF_DAYS = {"2026-11-27", "2026-12-24", "2027-11-26"}

KUN = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"]
OY = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]


def is_trading_day(d) -> bool:
    d = pd.Timestamp(d)
    return d.weekday() < 5 and d.strftime("%Y-%m-%d") not in HOLIDAYS


def _session(d):
    """(ochilish, yopilish) — Nyu-York vaqti bilan, tz bilan."""
    d = pd.Timestamp(d).date()
    close = time(13, 0) if d.isoformat() in HALF_DAYS else CLOSE
    return datetime.combine(d, OPEN, NY), datetime.combine(d, close, NY)


def _fmt(dt):
    t = dt.astimezone(TASH)
    return f"{KUN[t.weekday()]} {t.day}-{OY[t.month - 1]} {t:%H:%M}"


def _dur(td):
    m = int(td.total_seconds() // 60)
    d, h, mi = m // 1440, m % 1440 // 60, m % 60
    if d:
        return f"{d} kun {h} soat"
    return f"{h} soat {mi} daqiqa" if h else f"{mi} daqiqa"


def status(now=None) -> str:
    """Birja hozir ochiqmi, qachon ochiladi/yopiladi — Toshkent vaqtida."""
    now = now or datetime.now(NY)
    day = now.astimezone(NY).date()
    if is_trading_day(day):
        o, c = _session(day)
        if o <= now < c:
            return (f"🟢 AQSh birjasi hozir OCHIQ — yopilishiga {_dur(c - now)} "
                    f"(Toshkentda {c.astimezone(TASH):%H:%M} da yopiladi)")
        if now < o:
            return f"🔴 Birja hozir yopiq — bugun Toshkentda {o.astimezone(TASH):%H:%M} da ochiladi ({_dur(o - now)}dan keyin)"
    d = day + timedelta(days=1)
    while not is_trading_day(d):
        d += timedelta(days=1)
    o, c = _session(d)
    why = " (bugun AQShda bayram)" if day.weekday() < 5 and not is_trading_day(day) else \
        " (dam olish kunlari)" if day.weekday() >= 5 else ""
    return f"🔴 Birja hozir yopiq{why} — keyingi ochilish: {_fmt(o)} (Toshkent), {_dur(o - now)}dan keyin"


def schedule_text() -> str:
    o, c = _session(datetime.now(NY).date())
    return (f"🕘 Savdo vaqti (Toshkent bo'yicha): dushanba–juma {o.astimezone(TASH):%H:%M} dan "
            f"{c.astimezone(TASH):%H:%M} gacha (AQShda yoz/qish vaqti o'zgarganda 1 soat siljiydi).\n"
            "AQSh bayramlarida birja yopiq. Asosiy portfel hisoboti har kuni ertalab 03:00 da keladi.")
