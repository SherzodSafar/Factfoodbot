"""Telegram'siz kompyuterda sinash uchun:
    python cli.py /test SPY,AAPL 2024-01-01 2025-12-31
    python cli.py /tahlil
"""
import sys

import data
from commands import Service
from paper import Paper

svc = Service(Paper("demo_state.json"), data.load, data.last_complete_us_day)
for m in svc.handle(" ".join(sys.argv[1:]) or "/yordam"):
    print(m, end="\n\n")
