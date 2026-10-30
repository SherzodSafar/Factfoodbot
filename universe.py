"""Aksiyalarni avtomatik tanlash: 3 ta narx guruhi.

Ro'yxatdagi likvid (ko'p savdo qilinadigan) AQSh aksiyalari bugungi narxiga qarab guruhlarga bo'linadi,
so'ng har guruhdan trendi kuchli va savdo hajmi katta bo'lganlari tanlanadi.
"""
import pandas as pd

# (kalit, nom, min narx, max narx, 20 kunlik o'rtacha kunlik savdo hajmi, $)
TIERS = [
    ("qimmat", "💎 Qimmat (50$+)", 50, 1e9, 200e6),
    ("orta", "🔷 O'rtacha (10–50$)", 10, 50, 50e6),
    ("arzon", "🔹 Arzon (5–10$)", 5, 10, 15e6),
]
# Har guruh uchun taxminiy sirpanish+spred (bir tomonga). Arzon aksiyalarda spred kengroq.
SLIPPAGE = {"qimmat": 0.0005, "orta": 0.001, "arzon": 0.002}
TIER_NAME = {k: n for k, n, *_ in TIERS}
TIER_ICON = {k: n.split()[0] for k, n, *_ in TIERS}

UNIVERSE = sorted(set("""
AAPL MSFT NVDA GOOGL AMZN META AVGO TSLA JPM V MA UNH HD COST LLY ORCL CRM AMD NFLX ADBE QCOM TXN AMAT
CAT GS MS WMT XOM CVX ABBV MRK PEP KO MCD DIS IBM NOW INTU ISRG BKNG PANW CRWD UBER SHOP PLTR MU LRCX
KLAC ANET DE GE HON LOW TGT SBUX NKE AXP C WFC SCHW BX COIN HOOD DASH ABNB SNOW DDOG NET ZS MRVL ARM
SMCI DELL HPQ PYPL SQ XYZ TMUS TJX LULU CMG CVS GILD AMGN BMY PFE JNJ ABT MDT TMO DHR UPS FDX BA RTX LMT
GM F STLA RIVN LCID NIO XPEV LI BAC T VZ CMCSA INTC CSCO KHC KDP MO PM WBD SNAP PINS HPE KMI WMB OXY
DVN HAL SLB EQT CTRA APA MRO CCL NCLH RCL AAL DAL UAL LUV JBLU SOFI NU GRAB SE BABA JD PDD BIDU TME
VALE ITUB BBD ABEV PBR GOLD NEM KGC AU AG HL CDE PAAS BTG IAG EXK FCX CLF X AA MP
RIOT MARA CLSK HUT BITF IREN WULF CIFR CORZ HIVE
PLUG FCEL CHPT BLNK RUN ENPH SEDG QS
ACHR JOBY RKLB ASTS LUNR IONQ RGTI QBTS SOUN BBAI AI PATH U RBLX DKNG
OPEN RKT UWMC LMND AFRM UPST LC
NOK ERIC LUMN SIRI PARA AMC GME BB PTON LYFT CHWY ETSY W
CPNG TAL EDU YMM BEKE IQ HBM SID GGB CX TEVA RIG VAL NE DO KOS SWN AR RRC
TOST HIMS CELH ELF ROKU SPOT TTD ZM DOCU OKTA TWLO
""".split()))


def select(loader, asof: pd.Timestamp, n=None, show=8):
    """Har guruhga narx oralig'i va savdo hajmi shartiga mos BARCHA aksiyalar kiradi (n berilsa — eng ko'pi n ta).
    Strategiya ulardan kuchli trenddagilarni o'zi tanlaydi. Qaytaradi: {guruh: [tickerlar]}, izoh qatorlari."""
    data = loader(UNIVERSE, asof - pd.Timedelta(days=60), asof)
    rows = []
    for tk, df in data.items():
        df = df[df.index <= asof]
        if len(df) < 260 or "Volume" not in df:
            continue
        c = df["Close"]
        price = float(c.iloc[-1])
        dv = float((c * df["Volume"]).tail(20).mean())
        e50 = float(c.ewm(span=50, adjust=False).mean().iloc[-1])
        e200 = float(c.ewm(span=200, adjust=False).mean().iloc[-1])
        mom = float(c.iloc[-1] / c.iloc[-127] - 1)
        rows.append(dict(tk=tk, price=price, dv=dv, up=price > e200 and e50 > e200, mom=mom))
    sel, notes = {}, []
    for key, name, lo, hi, min_dv in TIERS:
        cand = [r for r in rows if lo <= r["price"] < hi and r["dv"] >= min_dv]
        cand.sort(key=lambda r: (r["up"], r["mom"]), reverse=True)
        pick = cand[:n] if n else cand
        sel[key] = [r["tk"] for r in pick]
        ups = sum(r["up"] for r in pick)
        notes.append(f"{name}: {len(pick)} ta aksiya kuzatiladi, {ups} tasi ko'tarilish trendida. Eng kuchlilari:")
        notes += [f"  • {r['tk']} {r['price']:.2f}$ | 6 oyda {r['mom'] * 100:+.0f}% | "
                  f"{'📈 trend' if r['up'] else '↔️ trendsiz'}" for r in pick[:show]]
    notes.append(f"\nKo'rib chiqilgan aksiyalar: {len(rows)} ta.")
    return sel, notes
