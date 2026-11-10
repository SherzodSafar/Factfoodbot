# Taklifnoma — "yaltiroq + parda" uslubidagi to'y taklifnomasi

Bitta faylli (`index.html`) web-taklifnoma. Hech qanday build kerak emas.

## Qanday ishlaydi
1. **Yaltiroq ekran** — qizil yaltiroq zarrachalar. Mehmon telefonga **puflaydi** (mikrofon) yoki **bosadi**;
   barmoq bilan surilsa, yaltiroq tozalanadi.
2. **Qizil baxmal parda** ochiladi — sahna, yorug'lik nuri, tutun va uchayotgan uchqunlar.
3. Ismlar, sana va manzil birin-ketin paydo bo'ladi.
4. Pastda: murojaat matni, teskari sanoq (+ kalendarga qo'shish `.ics`), dastur, xarita, dress-kod, RSVP forma.

## Sozlash
`index.html` ichidagi `CONFIG` obyektini o'zgartiring: ismlar, sana (`date`), to'yxona, manzil,
koordinatalar (`lat`, `lng`), dastur, ranglar va barcha matnlar.

- `photo: "couple.jpg"` — sahnada monogramma o'rniga juftlik surati chiqadi.
- `music: "music.mp3"` — ochilganda fon musiqasi yoqiladi (pastki o'ng burchakda tugma).
- `rsvpWhatsApp: "998901234567"` — RSVP javobi tayyor matn bilan WhatsApp'da ochiladi.

Fayllarni shu papkaga qo'ying.

## Joylash
Har qanday statik hostingga yuklash mumkin (Vercel, Netlify, GitHub Pages).
Mikrofon faqat **HTTPS** orqali ishlaydi; mikrofonga ruxsat berilmasa, bosish orqali ochiladi.
