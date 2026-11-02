# Kvadrat Studio

Square League YouTube kanali uchun video zavodi: har kuni serverda 1 ta uzun video va 2 ta Shorts yozadi
(sarlavha, tavsif, teglar, tarjimalar, muqovalar bilan) va Telegram bot + mini app orqali beradi.

## Render (Docker)
- Root/Docker context: `kvadrat-studio`, Dockerfile: `kvadrat-studio/Dockerfile`
- Instance: video yozish uchun kamida **Standard (1 CPU, 2 GB)**

## Muhit o'zgaruvchilari
| Nomi | Vazifasi |
|---|---|
| `BOT_TOKEN` | Telegram bot tokeni (majburiy) |
| `GEMINI_API_KEY` | Sarlavha/tavsif va tarjimalar uchun (ixtiyoriy, bo'lmasa shablon) |
| `LEAGUE_NAME` | Liga nomi (standart: `SQUARE LEAGUE`) |
| `DAILY_UTC_HOUR` | Kunlik tayyorlash soati, UTC (standart: 1 = 06:00 Toshkent) |
| `OWNER_CHAT_ID` | Egasi (bo'lmasa botga birinchi yozgan odam) |
| `DATA_DIR` | Ma'lumotlar papkasi (doimiy disk ulansa, uning yo'li) |
