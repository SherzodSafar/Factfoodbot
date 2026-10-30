"""Inline tugmali menyu: asosiy menyu, hisobotlar, sozlamalar va yordam bo'limlari.

Telegram'ga bog'liq emas: har bir tugma bosilganda nima qilishni qaytaradi,
bot.py esa uni Telegram'ga yuboradi (xabarni tahrirlash yoki yangi xabar)."""
from commands import HELP_SECTIONS, STRATEGY_NAMES
from universe import TIER_NAME


def kb(rows):
    return {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in row] for row in rows]}


BACK = ("⬅️ Menyu", "m:main")
CAPITALS = [500, 1000, 3000, 5000, 10000, 30000]
SHARES = [5, 10, 15, 20, 25]        # pullback: har savdoga ulush, %
RISKS = [0.5, 0.75, 1, 1.25, 1.5]   # trend strategiyalari: har savdoda xavf, %


def _money(x):
    return f"{x:,.0f}$".replace(",", " ")


class Menu:
    def __init__(self, service):
        self.svc = service
        self.paper = service.paper
        self.waiting_capital = False   # "boshqa summa" bosilgandan keyin keyingi raqamli xabar — summa

    # ---------- sahifalar ----------
    def main(self):
        if self.paper.active:
            head = "📈 Demo savdo boti\n\n" + self.svc._summary()
        else:
            head = ("📈 Demo savdo boti\n\nDemo hali boshlanmagan. «🚀 Yangi demo» ni bosib, "
                    "umumiy virtual summani tanlang.")
        return head, kb([
            [("📊 Holat", "c:holat"), ("📅 Hisobot", "m:rep")],
            [("🌍 Bozor", "c:bozor"), ("🧭 Tahlil", "c:tahlil")],
            [("🎓 Real pulga tayyorlikmi?", "c:baho")],
            [("⚙️ Sozlamalar", "m:set"), ("❓ Yordam", "m:help")],
            [("🚀 Yangi demo", "m:cap"), ("🧪 Tarixda sinash", "c:test")],
        ])

    def report(self):
        return "📅 Qaysi hisobot?", kb([
            [("Kunlik", "r:kunlik"), ("Haftalik", "r:haftalik"), ("Oylik", "r:oylik")], [BACK]])

    def settings(self):
        text = self.svc.cmd_settings()[0]
        if not self.paper.active:
            return text + "\n\nSozlamalarni o'zgartirish uchun avval demo boshlang.", kb([
                [("🚀 Yangi demo", "m:cap")], [BACK]])
        p = self.paper.params(self.paper.tiers()[0])
        st = self.paper.state
        onoff = lambda b: "✅" if b else "⬜"
        return text, kb([
            [("🧠 Strategiya", "m:strat"), ("📏 Xavf darajasi", "m:share")],
            [(f"{onoff(not p.whole_shares)} Kasr aksiya", "s:kasr"),
             (f"{onoff(p.market_filter)} Bozor filtri", "s:filter")],
            [(f"{onoff(st.get('auto_apply'))} Avto-yaxshilash", "s:auto")],
            [("💰 Kapitalni o'zgartirish", "m:cap")],
            [BACK]])

    def strategy(self):
        cur = self.paper.params(self.paper.tiers()[0]).strategy
        rows = [[(("🔘 " if k == cur else "⚪️ ") + name, f"s:strat:{k}")] for k, name in STRATEGY_NAMES.items()]
        return ("🧠 Strategiyani tanlang (barcha guruhlarga):\n\n" + HELP_SECTIONS["strat"][1],
                kb(rows + [[("⬅️ Sozlamalar", "m:set")]]))

    def share(self):
        p = self.paper.params(self.paper.tiers()[0])
        back = [("⬅️ Sozlamalar", "m:set")]
        if p.sizing == "risk":
            cur = p.risk_pct
            return (f"📏 Har savdoda xavf (hozir {cur:g}%): stop tegsa guruh kapitalining shuncha foizi yo'qotiladi.\n"
                    "Kamroq — tushish kichikroq, lekin foyda ham kamroq. Tarixiy sinovda 1% muvozanatli chiqqan.",
                    kb([[(("🔘 " if r == cur else "") + f"{r:g}%", f"s:share:{r}") for r in RISKS], back]))
        cur = p.pos_pct
        return (f"📏 Har bir savdoga guruh kapitalining necha foizi ajratilsin? (hozir {cur:g}%)",
                kb([[(("🔘 " if s_ == cur else "") + f"{s_}%", f"s:share:{s_}") for s_ in SHARES], back]))

    def capital(self):
        warn = ("\n\n⚠️ Joriy demo to'xtatilib, yangisi boshlanadi (tarix o'chadi)." if self.paper.active else "")
        rows = [[(_money(c), f"k:{c}") for c in CAPITALS[i:i + 3]] for i in (0, 3)]
        return ("💰 Umumiy virtual summani tanlang — u 3 narx guruhiga teng bo'linadi." + warn,
                kb(rows + [[("✍️ Boshqa summa", "k:other")], [BACK]]))

    def confirm_capital(self, amount):
        if not self.paper.active:
            return None
        return (f"⚠️ Joriy demo o'chadi va {_money(amount)} bilan yangisi boshlanadi. Rozimisiz?",
                kb([[(f"✅ Ha, {_money(amount)}", f"kc:{amount}"), ("❌ Yo'q", "m:main")]]))

    def help(self, section=None):
        if section in HELP_SECTIONS:
            title, body = HELP_SECTIONS[section]
            return f"{title}\n\n{body}", kb([[("⬅️ Yordam", "m:help"), BACK]])
        return "❓ Yordam — bo'limni tanlang:", kb(
            [[(HELP_SECTIONS[k][0], f"h:{k}")] for k in HELP_SECTIONS] + [[BACK]])

    PAGES = {"main": "main", "rep": "report", "set": "settings", "strat": "strategy", "share": "share",
             "cap": "capital", "help": "help"}

    # ---------- tugma bosilishi ----------
    def on_callback(self, data):
        """Qaytaradi: ("edit", matn, tugmalar) — joriy xabarni almashtirish,
        ("run", buyruq_matni) — uzoq buyruqni bajarib natijani yangi xabar qilib yuborish,
        ("ask", matn) — oddiy matnli javob."""
        kind, _, arg = data.partition(":")
        if kind == "m":
            return ("edit", *getattr(self, self.PAGES.get(arg, "main"))())
        if kind == "h":
            return ("edit", *self.help(arg))
        if kind == "c":
            return ("run", f"/{arg}")
        if kind == "r":
            return ("run", f"/hisobot {arg}")
        if kind == "k":
            if arg == "other":
                self.waiting_capital = True
                return ("ask", "✍️ Umumiy summani raqam bilan yozing (masalan: 2500)")
            conf = self.confirm_capital(int(arg))
            return ("edit", *conf) if conf else ("run", f"/demo_boshlash {arg}")
        if kind == "kc":
            return ("run", f"/demo_boshlash {arg}")
        if kind == "s":
            return self._setting(arg)
        return ("edit", *self.main())

    def _setting(self, arg):
        if not self.paper.active:
            return ("edit", *self.settings())
        p = self.paper.params(self.paper.tiers()[0])
        name, _, val = arg.partition(":")
        if name == "kasr":
            self.svc.cmd_fractional(["on" if p.whole_shares else "off"])
        elif name == "filter":
            self.svc.cmd_filter(["off" if p.market_filter else "on"])
        elif name == "auto":
            self.svc.cmd_auto(["off" if self.paper.state.get("auto_apply") else "on"])
        elif name == "share":
            self.svc.cmd_share([val])
            return ("edit", *self.share())
        elif name == "strat":
            self.svc.cmd_strategy([val])
            return ("edit", *self.strategy())
        return ("edit", *self.settings())

    def on_text(self, text):
        """Oddiy matn (buyruq emas). Kutilayotgan summa bo'lsa — qaytaradi."""
        if not self.waiting_capital:
            return None
        t = text.replace(" ", "").replace("$", "").replace(",", ".")
        try:
            amount = float(t)
        except ValueError:
            return ("ask", "Raqam yozing, masalan: 2500")
        self.waiting_capital = False
        if amount < 100:
            return ("ask", "Summa kamida 100$ bo'lsin.")
        conf = self.confirm_capital(int(amount))
        return ("edit_new", *conf) if conf else ("run", f"/demo_boshlash {int(amount)}")
