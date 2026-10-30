"""Telegram bot: buyruqlarni qabul qiladi, jadval bo'yicha hisobot yuboradi.

Muhit o'zgaruvchilari:
  BOT_TOKEN      — @BotFather bergan token (majburiy)
  OWNER_CHAT_ID  — faqat shu Telegram ID egasi botdan foydalana oladi (majburiy)
  DATA_DIR       — holat fayli papkasi (standart: joriy papka)
  PORT, RENDER_EXTERNAL_URL — Render o'zi beradi (sahifa va o'zini uyg'oq tutish uchun)

Holat (demo_state.json) har o'zgarishdan keyin egasining chatiga fayl sifatida yuborilib, mahkamlanadi (pin).
Server qayta ishga tushsa, bot holatni shu mahkamlangan fayldan tiklaydi.
"""
import hashlib
import json
import os
import threading
import time
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from zoneinfo import ZoneInfo

import requests

import data
from commands import HELP, Service
from menu import Menu
from paper import Paper

TOKEN = os.environ["BOT_TOKEN"]
OWNER = int(os.environ["OWNER_CHAT_ID"])
API = f"https://api.telegram.org/bot{TOKEN}"
DATA_DIR = os.environ.get("DATA_DIR", ".")
os.makedirs(DATA_DIR, exist_ok=True)
STATE_FILE = os.path.join(DATA_DIR, "demo_state.json")
TZ = ZoneInfo("Asia/Tashkent")

busy = threading.Lock()
backup_info = {"msg_id": None, "hash": None}


def tg(method, **kw):
    r = requests.post(f"{API}/{method}", timeout=60, **kw)
    return r.json()


def send(chat_id, text, markup=None):
    parts = [text[i:i + 3900] for i in range(0, len(text), 3900)] or [""]
    for n, part in enumerate(parts):
        body = {"chat_id": chat_id, "text": part}
        if markup and n == len(parts) - 1:
            body["reply_markup"] = markup
        try:
            tg("sendMessage", json=body)
        except Exception:
            traceback.print_exc()


def edit(chat_id, message_id, text, markup=None):
    body = {"chat_id": chat_id, "message_id": message_id, "text": text[:3900]}
    if markup:
        body["reply_markup"] = markup
    try:
        r = tg("editMessageText", json=body)
        if not r.get("ok") and "not modified" not in str(r.get("description", "")):
            send(chat_id, text, markup)
    except Exception:
        traceback.print_exc()


# ---------------- Holatni Telegram'da saqlash ----------------
def restore_state():
    try:
        chat = tg("getChat", json={"chat_id": OWNER}).get("result", {})
        pm = chat.get("pinned_message") or {}
        doc = pm.get("document") or {}
        if doc.get("file_name") != "demo_state.json":
            return False
        backup_info["msg_id"] = pm["message_id"]
        if os.path.exists(STATE_FILE):
            return True
        path = tg("getFile", json={"file_id": doc["file_id"]})["result"]["file_path"]
        content = requests.get(f"https://api.telegram.org/file/bot{TOKEN}/{path}", timeout=60).content
        json.loads(content)  # tekshiruv
        with open(STATE_FILE, "wb") as f:
            f.write(content)
        backup_info["hash"] = hashlib.md5(content).hexdigest()
        print("Holat Telegram'dan tiklandi")
        return True
    except Exception:
        traceback.print_exc()
        return False


def backup_state():
    try:
        if not os.path.exists(STATE_FILE):
            return
        with open(STATE_FILE, "rb") as f:
            content = f.read()
        h = hashlib.md5(content).hexdigest()
        if h == backup_info["hash"]:
            return
        files = {"f": ("demo_state.json", content, "application/json")}
        caption = "💾 Bot holati (o'chirmang, mahkamlangan holda qolsin)"
        if backup_info["msg_id"]:
            r = tg("editMessageMedia", data={"chat_id": OWNER, "message_id": backup_info["msg_id"],
                                             "media": json.dumps({"type": "document", "media": "attach://f",
                                                                  "caption": caption})}, files=files)
            if r.get("ok") or "not modified" in str(r.get("description", "")):
                backup_info["hash"] = h
                return
        r = tg("sendDocument", data={"chat_id": OWNER, "caption": caption, "disable_notification": True},
               files={"document": files["f"]})
        if r.get("ok"):
            backup_info["msg_id"] = r["result"]["message_id"]
            tg("pinChatMessage", json={"chat_id": OWNER, "message_id": backup_info["msg_id"],
                                       "disable_notification": True})
            backup_info["hash"] = h
    except Exception:
        traceback.print_exc()


paper = None
service = None
menu = None
MENU_BTN = {"inline_keyboard": [[{"text": "📋 Menyu", "callback_data": "m:main"}]]}


def run_and_send(chat_id, fn, with_menu=False):
    with busy:
        try:
            msgs = fn()
            for i, m in enumerate(msgs):
                send(chat_id, m, MENU_BTN if with_menu and i == len(msgs) - 1 else None)
        except Exception as e:
            traceback.print_exc()
            send(chat_id, f"⚠️ Xatolik: {e}")
        finally:
            backup_state()


# ---------------- Jadval ----------------
def scheduler():
    """03:00 (Toshkent) dan keyin bajariladi. Server shu paytda uxlab/qayta ishga tushayotgan bo'lsa,
    uyg'ongach o'sha kunning o'zida bajaradi (o'tkazib yubormaydi)."""
    while True:
        try:
            now = datetime.now(TZ)
            if paper.active and now.hour >= 3:
                sent = paper.state.setdefault("sent", {})
                today = now.strftime("%Y-%m-%d")
                month = now.strftime("%Y-%m")
                # Seshanba–shanba = AQShda dushanba–juma yopilgandan keyin
                if now.weekday() in (1, 2, 3, 4, 5) and sent.get("daily") != today:
                    sent["daily"] = today
                    paper.save()
                    run_and_send(OWNER, lambda: service.cmd_update() + service.cmd_report(["kunlik"]))
                if now.weekday() == 5 and sent.get("weekly") != today:
                    sent["weekly"] = today
                    paper.save()
                    run_and_send(OWNER, lambda: service.cmd_report(["haftalik"])[:1] + service.cmd_analyze(auto=True)
                                 + service.cmd_grade())
                # Yangi oy: oylik hisobot + aksiyalarni qayta tanlash (demo shu oy boshlangan bo'lsa — kerak emas)
                if (sent.get("monthly") or "")[:7] != month:
                    first = "monthly" not in sent and paper.state.get("selected_at", "")[:7] == month
                    sent["monthly"] = month
                    paper.save()
                    if not first:
                        run_and_send(OWNER, lambda: service.cmd_report(["oylik"])[:1] + service.cmd_select())
        except Exception:
            traceback.print_exc()
        time.sleep(60)


def keep_awake():
    """Bepul Render 15 daqiqa so'rovsiz qolsa uxlaydi — o'zimizni har 10 daqiqada chaqiramiz."""
    url = os.environ.get("RENDER_EXTERNAL_URL")
    if not url:
        return
    while True:
        time.sleep(600)
        try:
            requests.get(url, timeout=30)
        except Exception:
            pass


class Health(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, *a):
        pass


COMMANDS = [("menyu", "Menyu va sozlamalar (tugmalar)"), ("holat", "Portfel holati"), ("hisobot", "Hisobot: kunlik/haftalik/oylik"),
            ("bozor", "Bozor holati"), ("tahlil", "Tahlil va yaxshilash"), ("test", "O'tgan davrda sinash"),
            ("tanlash", "Aksiyalarni qayta tanlash"), ("demo_boshlash", "Boshlash: umumiy summa, masalan 3000"),
            ("baho", "Real pulga tayyorlik"), ("sozlamalar", "Sozlamalar"), ("yordam", "Yordam")]


def show_menu(chat_id, page="main"):
    with paper.lock:
        text, markup = getattr(menu, Menu.PAGES[page])()
    send(chat_id, text, markup)


def on_callback(cq):
    chat_id = cq["message"]["chat"]["id"]
    mid = cq["message"]["message_id"]
    try:
        tg("answerCallbackQuery", json={"callback_query_id": cq["id"]})
    except Exception:
        pass
    if cq.get("from", {}).get("id") != OWNER:
        return
    if busy.locked() and not cq["data"].startswith(("m:", "h:")):
        send(chat_id, "⏳ Oldingi buyruq bajarilmoqda, biroz kuting...")
        return
    with paper.lock:
        act = menu.on_callback(cq["data"])
    handle_action(chat_id, act, mid)


def handle_action(chat_id, act, mid=None):
    kind = act[0]
    if kind == "edit" and mid:
        edit(chat_id, mid, act[1], act[2])
        backup_state()
    elif kind in ("edit", "edit_new"):
        send(chat_id, act[1], act[2])
    elif kind == "ask":
        send(chat_id, act[1])
    elif kind == "run":
        cmd = act[1]
        if cmd.split()[0] in Service.LONG:
            send(chat_id, "⏳ Bajarilmoqda, 1–3 daqiqa kuting...")
        threading.Thread(target=run_and_send, args=(chat_id, lambda: service.handle(cmd), True), daemon=True).start()


def on_message(msg):
    chat_id = msg.get("chat", {}).get("id")
    text = (msg.get("text") or "").strip()
    if not chat_id or not text:
        return
    if chat_id != OWNER:
        send(chat_id, "Bu shaxsiy bot.")
        return
    if not text.startswith("/"):
        act = menu.on_text(text)
        if act:
            handle_action(chat_id, act)
        else:
            show_menu(chat_id)
        return
    cmd = text.split()[0].split("@")[0].lower()
    if cmd in ("/start", "/menyu", "/menu"):
        show_menu(chat_id)
        return
    if cmd in ("/yordam", "/help"):
        send(chat_id, HELP)
        show_menu(chat_id, "help")
        return
    if busy.locked():
        send(chat_id, "⏳ Oldingi buyruq bajarilmoqda, tugashi bilan bu ham bajariladi...")
    elif cmd in Service.LONG:
        send(chat_id, "⏳ Bajarilmoqda, 1–3 daqiqa kuting...")
    threading.Thread(target=run_and_send, args=(chat_id, lambda: service.handle(text), True), daemon=True).start()


def main():
    global paper, service, menu
    if os.environ.get("PORT"):
        srv = HTTPServer(("0.0.0.0", int(os.environ["PORT"])), Health)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
    restore_state()
    paper = Paper(STATE_FILE)
    service = Service(paper, data.load, data.last_complete_us_day)
    menu = Menu(service)
    try:
        tg("deleteWebhook", json={})
        tg("setMyCommands", json={"commands": [{"command": c, "description": d} for c, d in COMMANDS]})
    except Exception:
        traceback.print_exc()
    threading.Thread(target=scheduler, daemon=True).start()
    threading.Thread(target=keep_awake, daemon=True).start()
    print("Bot ishga tushdi")
    offset = None
    while True:
        try:
            r = requests.get(f"{API}/getUpdates", params={"timeout": 50, "offset": offset}, timeout=60).json()
            for u in r.get("result", []):
                offset = u["update_id"] + 1
                try:
                    if "callback_query" in u:
                        on_callback(u["callback_query"])
                        continue
                    on_message(u.get("message") or {})
                except Exception:
                    traceback.print_exc()
        except Exception:
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    main()
