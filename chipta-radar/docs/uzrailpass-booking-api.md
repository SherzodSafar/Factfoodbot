# UzRailPass (eticket.uzrailpass.uz) — Bron API kontrakti

Manba: saytning o'z so'rovlari, jonli bron orqali yozib olingan (Toshkent→Samarqand, 09.10.2026, "Sharq" 710Ф, 00-vagon, 5-o'rindiq). Bron **to'lovdan oldin bekor qilindi** — hech narsa sotib olinmagan.

Base URL: `https://eticket.uzrailpass.uz`
Barcha so'rovlar: `Content-Type: application/json`, autentifikatsiya = akkaunt sessiyasi (pastga qarang).

> ⚠️ Maxfiylik: quyida yo'lovchi pasport raqami `<PASSPORT>`, akkaunt UUID `<USER_UUID>` bilan almashtirilgan. Haqiqiy qiymatlar bot tomonida saqlanadi.

> ✅ **Muhim (eski reja vs haqiqat):** Saytda alohida `universal-orders/create` yoki `universal-orders/add-passenger-info` endpointlari **YO'Q**. Order yaratish + yo'lovchi ma'lumoti + joy band qilish — hammasi **bitta** `POST /api/v3/universal-orders/reserve` chaqiruvida (7-bo'lim). Qidiruv = `handbook/trains/list` (2-bo'lim), joy xaritasi = `handbook/trains` (3-bo'lim).

---

## To'liq oqim (flow)

1. **Stansiya kodini ol** → `handbook/stations/list`
2. **Poyezdlarni qidir** → `handbook/trains/list`  (vagonlar, tariflar, bo'sh joy soni)
3. **Joy xaritasini ol** → `handbook/trains`  (aniq bo'sh joy raqamlari) — *so'rov tanasi hali aniqlanmagan, pastga qarang*
4. **Saqlangan yo'lovchini ol** (ixtiyoriy) → `users/friend/list`
5. **BRON QIL** → `universal-orders/reserve`  ← bitta so'rov: order yaratish + yo'lovchi + joy band qilish, hammasi birga. Order raqamini qaytaradi.
6. **To'lov bosqichi** (avto-bronda shu yerda TO'XTA) → `payment-end-time`, `stripe-commission`.
   Band qilingan joy ~12 daqiqada to'lanmasa avtomatik bo'shaydi.

---

## 1. Stansiya qidirish (autocomplete)
`POST /api/v1/handbook/stations/list`

Ma'lum stansiya kodlari:
- Toshkent = `2900000`
- Samarqand = `2900700`
- Xiva = `2900172`

(So'rov/javob tanasi yozib olinmadi — oddiy autocomplete; kerak bo'lsa alohida olib beraman.)

---

## 2. Poyezd qidirish
`POST /api/v3/handbook/trains/list`

**Request:**
```json
{
  "directions": {
    "forward": {
      "date": "2026-10-09",
      "depStationCode": "2900000",
      "arvStationCode": "2900700"
    }
  },
  "routeType": "INTERCITY"
}
```

**Response** (`data.directions.forward.trains[]`), har bir poyezd:
```json
{
  "type": "В-СКОР",
  "number": "710Ф",
  "departureDate": "09.10.2026 08:37",
  "arrivalDate": "09.10.2026 11:46",
  "timeOnWay": "03:09",
  "brand": "Sharq",
  "providerType": "EXPRESS",
  "trainId": null,
  "originRoute": { "depStationName": "Toshkent", "arvStationName": "Samarqand" },
  "subRoute": {
    "depStationName": "TOSHKENT", "depStationCode": "2900000",
    "arvStationName": "SAMARQAND", "arvStationCode": "2900700"
  },
  "cars": [
    {
      "type": "O'rindiqli",
      "freeSeats": 19,
      "tariffs": [
        { "classServiceType": "2Е", "freeSeats": 19, "tariff": 300560 }
      ],
      "seatDetail": { "undef": 0, "lateralDn": 0, "lateralUp": 0, "freeComp": 0, "down": 0, "up": 0 }
    }
  ]
}
```
Izoh: `cars[]` faqat joy **sonini** beradi (tur bo'yicha), aniq **joy raqamlarini** emas. Aniq bo'sh joy raqamlari uchun 3-qadam kerak.

---

## 3. Joy xaritasi (vagon/joy ID'lari) — ⚠️ so'rov tanasi aniqlanmagan
`POST /api/v1/handbook/trains`

- Autentifikatsiya ishlaydi (bo'sh tana bilan 400 qaytdi, 401 emas → sessiya qabul qilinadi).
- Bu so'rov **sahifa yuklanishida** ishga tushadi, shuning uchun uning tanasini yozib ololmadim (brauzer konsol vositasi himoya filtri sabab). 
- **Nima kerak:** poyezdning har bir vagonidagi aniq bo'sh joylar ro'yxati (reserve'dagi `seatsRange` uchun).
- Buni olishning oson yo'li: men keyingi safar sahifa yuklanishida tutib olaman, YOKI bot birinchi ishga tushganda shu chaqiruvni o'zi loglaydi. (Ayting — qayta urinib beraman.)

---

## 4. Saqlangan yo'lovchilar
`POST /api/v1/users/friend/list`

**Request:** `{ "userId": "<USER_UUID>" }`

**Response:** massiv:
```json
[
  {
    "friendId": "81b33d19-....",
    "userId": "<USER_UUID>",
    "firstname": "Madina",
    "lastname": "Gulmmatova",
    "midname": "Hamro qizi",
    "sex": "F",
    "birthDay": "03.10.1999",
    "docType": "ПУ",
    "doc": "<PASSPORT>",
    "citizenship": "UZB",
    "regionId": "  ",
    "yourSelf": false
  }
]
```

## 5. Yo'lovchini saqlash/yangilash (ixtiyoriy)
`POST /api/v1/users/friend/create`
Request: `{friendId, userId, firstname, midname, lastname, sex, birthDay, citizenship, docType, doc, regionId, yourSelf}`
Response: `friendId` (string).

## 6. Chegirmalar
`POST /api/v2/discounts/available` — `discountType` (REGULAR va h.k.) uchun.

---

## 7. BRON — asosiy so'rov ⭐
`POST /api/v3/universal-orders/reserve`

**Request:**
```json
{
  "channel": "WEB",
  "orderKind": "RETAIL",
  "paymentMode": "CARD",
  "groupType": "INDIVIDUALS",
  "orderType": "INDIVIDUAL",
  "providerType": "EXPRESS",
  "documentMode": "NAMED",
  "subItems": [
    {
      "trainInfo": {
        "trainNumber": "710Ф",
        "carNumber": "00",
        "carType": "Сидячий",
        "serviceClass": "1В",
        "directionSequence": 1,
        "brand": "Sharq"
      },
      "departure": { "code": "2900000", "name": "TOSHKENT", "date": "2026-10-09", "time": "08:37:00" },
      "arrival":   { "code": "2900700", "name": "SAMARQAND", "date": "2026-10-09", "time": "11:46:00" },
      "hasInsurance": false,
      "hasCateringOrder": null,
      "hasGreenTicket": false,
      "reserveSeatRequirements": { "seatsRange": "5-5" },
      "tickets": [
        {
          "passengerInfo": {
            "fullName": "Gulmmatova=Madina=Hamro qizi",
            "documentId": "<PASSPORT>",
            "documentType": "ПУ",
            "gender": "FEMALE",
            "citizenship": "UZB",
            "birthday": "1999-10-03",
            "regionId": "03",
            "discountType": "REGULAR",
            "referenceDocument": null,
            "prefix": null,
            "tariffCode": null,
            "child": null
          },
          "pricingMode": "FULL",
          "hasPatronymics": true
        }
      ]
    }
  ],
  "webCustomer": {
    "id": "<USER_UUID>",
    "username": "saparboev.sherzod@gmail.com",
    "ip": "eticket.uzrailpass.uz"
  }
}
```

**Response:**
```json
{ "messageLevel": "OK", "code": 200, "message": null, "parameters": null, "response": "UO780Z0QMYA6TQ" }
```
→ `response` = **order raqami** (keyingi to'lov/status uchun).

### Format eslatmalari (muhim!)
- `fullName` = `Familiya=Ism=Sharif` (teng belgisi `=` bilan ajratilgan).
- `gender`: `MALE` / `FEMALE`.
- `birthday`: `YYYY-MM-DD`.  (friend/list'da esa `birthDay`: `DD.MM.YYYY` — format farq qiladi!)
- `date` (departure/arrival): `YYYY-MM-DD`, `time`: `HH:mm:ss`.
- Kirill qiymatlar aynan shunday yuboriladi: `carType` = `"Сидячий"`, `serviceClass` = `"1В"`, `documentType` = `"ПУ"` (pasport).
- `trainNumber` ham kirill: `"710Ф"`.
- `reserveSeatRequirements.seatsRange`: `"5-5"` (boshlang'ich-oxirgi joy). Bir joy uchun `"N-N"`.
- `trainInfo`, `departure`, `arrival`, `carNumber`, `serviceClass` — 2-qadam (search) va 3-qadam (joy xaritasi) javoblaridan olinadi.

---

## 8. Bron'dan keyin (to'lov) — avto-bronda bu yerda TO'XTA
- `GET /api/v3/universal-orders/query/get/payment-end-time/{orderNumber}` → band muddati tugashi.
- `GET /api/v1/payment/{orderNumber}_PAYMENT/stripe-commission` → Stripe komissiyasi.
- To'lov to'lov-provayderi (Stripe) orqali; to'lanmasa joy ~12 daqiqada bo'shaydi.
- Bekor qilish: orqaga qaytish/"Bekor qilish" → band darhol bo'shaydi.

---

## Autentifikatsiya
- Sayt kirgan akkaunt **sessiyasidan** foydalanadi (to'g'ridan-to'g'ri POST qo'shimcha header'siz 400 qaytardi, 401 emas → sessiya/cookie qabul qilinadi).
- Men sizning tokeningizni **o'qimadim** (xavfsizlik). Bot allaqachon tokenni saqlaydi va akkaunt nomidan so'rov yuboradi — shu mexanizmni shu endpointlar bilan ishlatish kifoya.
- `reserve` tanasidagi `webCustomer.id` + `username` yo'lovchi emas, **akkaunt egasini** bildiradi.
- ❗ Eslatma: bot server tomonda ishlagani uchun brauzer cookie'si bo'lmaydi — bot login/token mexanizmi aynan qaysi header'ni (masalan `Authorization: Bearer ...`) yuborishini tasdiqlash kerak. Agar botning mavjud login kodi bo'lsa, shu header nomini undan olib, barcha chaqiruvlarga qo'shamiz.

---

## Keyingi qadamlar (implementation)
1. Joy xaritasi (`handbook/trains`) so'rov tanasini aniqlash (tasdiqlash uchun bitta qayta tutish).
2. Botning login/auth header nomini tasdiqlash (botning hozirgi kodidan).
3. Bot kodida avto-bron funksiyasini yozish: search → joy xaritasi → reserve → (to'lov linki/qadami).
4. Render'ga qayta deploy.
