"""Xabarlar uchun oddiy, tushunarli formatlar: sana, pul, foiz, dona, chiqish sababi."""
import pandas as pd

OY = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]
HAFTA = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"]

# Chiqish sabablari (engine'dagi kodlar) — oddiy tilda
SABAB = {
    "stop-loss": "narx tushib, himoya narxiga tegdi — zarar cheklandi",
    "trailing stop": "narx cho'qqidan qaytdi — foyda saqlab qolindi",
    "take-profit": "maqsad narxga yetdi",
    "trend buzildi": "o'sish to'xtadi",
    "muddat tugadi": "ushlab turish muddati tugadi",
}


def sana(d, kun=False):
    d = pd.Timestamp(d)
    s = f"{d.day}-{OY[d.month - 1]}"
    return s + (f" ({HAFTA[d.weekday()]})" if kun else "")


def oraliq(a, b):
    """Hafta oralig'i: '2–6 noyabr' yoki '29 oktabr – 2 noyabr'."""
    a, b = pd.Timestamp(a), pd.Timestamp(b)
    if a.month == b.month:
        return f"{a.day}–{b.day} {OY[b.month - 1]}"
    return f"{a.day} {OY[a.month - 1]} – {b.day} {OY[b.month - 1]}"


def pul(x, dec=0, sign=False):
    s = f"{abs(x):,.{dec}f}".replace(",", " ") + "$"
    if sign:
        return ("+" if x >= 0 else "−") + s
    return ("−" if x < 0 else "") + s


def foiz(x, dec=1):
    return ("+" if x >= 0 else "−") + f"{abs(x):.{dec}f}%"


def dona(q):
    return f"{q:.0f}" if abs(q - round(q)) < 1e-9 else f"{q:.3f}".rstrip("0").rstrip(".")


def natija(pnl, pct):
    """'✅ +12$ (+5.1%)' yoki '🔴 −3$ (−1.2%)'."""
    return f"{'✅' if pnl > 0 else ('🔴' if pnl < 0 else '⚪️')} {pul(pnl, 2, True)} ({foiz(pct)})"


def necha_kun(d, bugun):
    n = (pd.Timestamp(bugun) - pd.Timestamp(d)).days
    return "bugun" if n <= 0 else f"{n} kun oldin"
