# BSB tahlil

O'qituvchilar uchun bob bo'yicha summativ baholash (BSB) tahlil jadvalini tayyorlovchi web dastur.

- `index.html`, `style.css`, `app.js` — interfeys (ma'lumotlar brauzerda saqlanadi)
- `xlsx.js` — Excel (.xlsx) fayl yaratuvchi (formulalar va diagrammalar bilan), tashqi kutubxonasiz
- `api/auth.js` — parol tekshiruvi
- `api/read.js` — daftar rasmidan ballarni Gemini orqali o'qish

Vercel muhit o'zgaruvchilari:
- `APP_PASSWORD` — kirish paroli
- `GEMINI_API_KEY` — Gemini API kaliti (ixtiyoriy; bo'lmasa dastur sozlamalarida kiritiladi)
- `GEMINI_MODEL` — ixtiyoriy, standart: `gemini-flash-latest`

Yangi baholash turi (masalan, ChSB) qo'shish: `app.js` dagi `TEMPLATES` obyektiga mezonlar maksimal ballari bilan yangi yozuv qo'shiladi.
