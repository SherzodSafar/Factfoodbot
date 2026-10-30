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
from commands import Service
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


def send(chat_id, text):
    for i in range(0, len(text), 3900):
        try:
            tg("sendMessage", json={"chat_id": chat_id, "text": text[i:i + 3900]})
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


def run_and_send(chat_id, fn):
    with busy:
        try:
            for m in fn():
                send(chat_id, m)
        except Exception as e:
            traceback.print_exc()
            send(chat_id, f"⚠️ Xatolik: {e}")
        finally:
            backup_state()


# ---------------- Jadval ----------------
def scheduler():
    while True:
        try:
            now = datetime.now(TZ)
            if paper.active and now.hour == 3:
                sent = paper.state.setdefault("sent", {})
                today = now.strftime("%Y-%m-%d")
                # Seshanba–shanba 03:00 = AQShda dushanba–juma yopilgandan keyin
                if now.weekday() in (1, 2, 3, 4, 5) and sent.get("daily") != today:
                    sent["daily"] = today
                    paper.save()
                    run_and_send(OWNER, lambda: service.cmd_update() + service.cmd_report(["kunlik"]))
                if now.weekday() == 5 and now.minute >= 10 and sent.get("weekly") != today:
                    sent["weekly"] = today
                    paper.save()
                    run_and_send(OWNER, lambda: service.cmd_report(["haftalik"])[:1] + service.cmd_analyze(auto=True))
                if now.day == 1 and now.minute >= 20 and sent.get("monthly") != today:
                    sent["monthly"] = today
                    paper.save()
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


COMMANDS = [("holat", "Portfel holati"), ("hisobot", "Hisobot: kunlik/haftalik/oylik"),
            ("bozor", "Bozor holati"), ("tahlil", "Tahlil va yaxshilash"), ("test", "O'tgan davrda sinash"),
            ("tanlash", "Aksiyalarni qayta tanlash"), ("demo_boshlash", "Demo savdoni boshlash"),
            ("sozlamalar", "Sozlamalar"), ("yordam", "Buyruqlar")]


def main():
    global paper, service
    if os.environ.get("PORT"):
        srv = HTTPServer(("0.0.0.0", int(os.environ["PORT"])), Health)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
    restore_state()
    paper = Paper(STATE_FILE)
    service = Service(paper, data.load, data.last_complete_us_day)
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
                msg = u.get("message") or {}
                chat_id = msg.get("chat", {}).get("id")
                text = msg.get("text", "")
                if not chat_id or not text.startswith("/"):
                    continue
                if chat_id != OWNER:
                    send(chat_id, "Bu shaxsiy bot.")
                    continue
                if busy.locked():
                    send(chat_id, "⏳ Oldingi buyruq bajarilmoqda, tugashi bilan bu ham bajariladi...")
                elif text.split()[0].split("@")[0] in Service.LONG:
                    send(chat_id, "⏳ Bajarilmoqda, 1–3 daqiqa kuting...")
                threading.Thread(target=run_and_send, args=(chat_id, lambda t=text: service.handle(t)),
                                 daemon=True).start()
        except Exception:
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    main()
