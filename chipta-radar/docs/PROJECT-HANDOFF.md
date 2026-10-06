# Chipta Radar — Project Handoff / Loyiha haqida to'liq ma'lumot

> **Maqsad / Purpose:** Bu hujjat loyihani boshqa AI (yoki dasturchi) **qolgan joyidan davom ettirishi** uchun yozilgan. Hamma muhim ma'lumot shu yerda: arxitektura, API kontrakti, baza, deploy, hal qilinmagan savollar.
> This is a complete context handoff so another AI/engineer can continue the project. Last updated: **2026-10-06**.

---

## 1. What the product is

**Chipta Radar** — a Telegram bot (**@gurlanuz_bot**) for O'zbekiston temir yo'llari (Uzbekistan Railways) train tickets. It does two things:

1. **Seat watcher (works, in production):** user creates a "watch" (from → to, date, car type, seat preferences). Every 60s the bot searches `eticket.railway.uz` and notifies the user when matching seats appear. This is the original, proven feature.
2. **Account & auto-book (newest feature, just deployed, needs live testing):** user links their railway account; the bot can store passengers and, when a seat is found, **automatically reserve it** and **send a Payme/Click payment request** to the user's saved phone. The user only confirms payment in the Payme/Click app.

UI exists in **two parallel forms** (both must keep working): a Telegram **Web App / Mini App** page, and **inline** (in-chat button) flows inside the bot itself.

---

## 2. Current status (2026-10-06)

- ✅ Deployed **live** on Render (commit `8967cbb`, service came up green: DB connected, watcher running, webhook active, search returning trains).
- ✅ Watcher + search on `railway.uz` confirmed working live.
- ✅ Account linking (login/password → encrypted token) confirmed working earlier.
- ⏳ **Auto-book + auto Payme/Click payment is deployed but NOT yet live-tested by a real booking.** The sandbox/CI this was built in **cannot reach** `railway.uz`, `uzrailpass.uz`, or `onrender.com` (outbound proxy blocks them), so the reserve + payment path was verified only against a **mock server** and unit tests. Real confirmation requires the owner to test on the live bot.
- Owner must **re-link their account** after this deploy (the account/booking client now points to `uzrailpass.uz` instead of `railway.uz` — see §6).

---

## 3. Tech stack & architecture

- **Runtime:** Node.js, ES modules (`"type": "module"`).
- **Web:** Express 4.
- **Telegram:** Telegraf 4 (webhook mode in production, polling on localhost).
- **ORM:** Prisma 6 → **Neon PostgreSQL**. All tables live in an isolated schema **`chipta_radar`** (so the DB can be shared with other projects without collision).
- **Encryption:** AES-256-GCM in `src/services/vault.js` (see §10).
- **Deploy:** Render (web service). Mini App + admin front-ends are Vite apps under `miniapp/` and `admin/` (built at deploy), plus a plain static Web App page served by the backend from `public/`.
- **No API docs for the railway sites** — endpoints were reverse-engineered from the sites' own JS and live request capture. Responses are parsed defensively.

### Request discipline
All outbound calls to the railway sites go through one shared queue (`core/railway.js` → `runQueued`) that enforces a minimum interval (`RAILWAY_MIN_INTERVAL_MS`, default 1200ms) and a cooldown on errors, so the sites are never hammered. `core/eticketAccount.js` (account/booking) reuses that same queue.

---

## 4. Repository, branches & deployment

- **GitHub repo:** `SherzodSafar/Factfoodbot`
- **Project folder in repo:** `chipta-radar/` (the Node app lives here, not at repo root)
- **Development branch:** `ccr-b950cfe7-8tk6gp` (all new work is committed here)
- **Deploy branch:** `claude/train-ticket-bot-panel-hvqwuw` — **this is the branch Render deploys from.** To ship, the dev branch is fast-forwarded into this one.

### Render
- **Workspace / owner ID:** `tea-dakqs1ff3r2c73dvtrhg`
- **Service:** `chipta-radar-api` — **service ID `srv-dapouvk9v7es739dr9mg`**, region Frankfurt, plan free.
- **Build command:** `cd chipta-radar && npm install && npm run setup`
  - `npm run setup` (scripts/setup.js) runs `prisma generate` + `prisma db push` → **the DB schema auto-migrates on every deploy** (no manual migration step).
- **Start command:** `cd chipta-radar && npm start` → `node src/index.js`
- **Public URLs:** API/webhook `https://chipta-radar-api.onrender.com`, Mini App `https://chipta-radar.onrender.com`.
- **⚠️ Auto-deploy is unreliable on this service.** Although `autoDeploy=yes/commit` is set, pushes have historically NOT triggered a deploy. **Always trigger the deploy explicitly** (Render API / MCP `trigger_deploy` on the service), then poll the deploy status until `live`.
- A production deploy is a gated action (requires the human's explicit approval in this tooling).

---

## 5. Environment variables (names only — values are in Render → Environment)

> Never commit secret values. The owner holds them; ask them if the next AI needs them.

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (schema `chipta_radar`). |
| `BOT_TOKEN` | Telegram bot token for @gurlanuz_bot. |
| `PUBLIC_URL` / `RENDER_EXTERNAL_URL` | Backend public URL (webhook base). Render sets the latter automatically. |
| `WEBAPP_URL` | Mini App https URL (bot "Menu" button). |
| `BOT_MODE` | `webhook` (cloud) or `polling` (local). Auto-chosen if empty. |
| `WEBHOOK_SECRET` | Optional Telegram webhook secret. |
| `ADMIN_PASSWORD` | Admin panel password. Default `admin123` if unset (change it!). |
| `ADMIN_SECRET` | Signs admin tokens **and** derives the data-encryption key if `DATA_ENCRYPTION_KEY` is absent. |
| `DATA_ENCRYPTION_KEY` | 32-byte key (hex/base64) for the vault. If set, used directly; else derived from `ADMIN_SECRET` via HKDF. **If this (or ADMIN_SECRET) changes, previously encrypted tokens/passengers can no longer be decrypted.** |
| `RAILWAY_BASE_URL` | Public search site. Default `https://eticket.railway.uz`. |
| `ETICKET_ACCOUNT_BASE_URL` | **Account + booking platform. Default `https://eticket.uzrailpass.uz`.** (See §6.) |
| `RAILWAY_MIN_INTERVAL_MS`, `RAILWAY_TIMEOUT_MS`, `RAILWAY_CACHE_TTL_MS`, `RAILWAY_BUY_URL`, `RAILWAY_LANG` | Search/queue tuning. |
| `WATCHER_ENABLED`, `WATCH_INTERVAL_SEC`, `MAX_WATCHES_PER_USER`, `NOTIFY_COOLDOWN_MIN`, `MAX_DAYS_AHEAD` | Watcher behaviour (also editable from Admin Panel). |
| `KEEP_ALIVE` | Self-ping so the free instance doesn't sleep while watches are active. |
| `ALLOW_DEV_AUTH` | Localhost-only browser auth bypass for the Web App. |

All config is centralised in `src/config/default.js`.

---

## 6. ⭐ CRITICAL: the two-platform distinction

UZ Railways exposes **two different domains**, and the project uses **both, for different jobs**:

| Domain | Used for | Payment | Code |
|---|---|---|---|
| **`eticket.railway.uz`** | **Read-only search** (trains, free seats, prices). Drives the watcher. Also the source of the **Payme/Click invoice** endpoints. | Payme / Click | `core/railway.js`, `RAILWAY_BASE_URL` |
| **`eticket.uzrailpass.uz`** | **Account login + the actual booking (reserve) API.** | Card / Stripe (per the captured contract) | `core/eticketAccount.js`, `ETICKET_ACCOUNT_BASE_URL` |

**Why this matters:** an earlier attempt to book on `railway.uz` returned 404 — booking is NOT available there via the documented API. The real booking contract (captured from live traffic, see `docs/uzrailpass-booking-api.md`) is on `uzrailpass.uz`. So `eticketAccount.js` was given its **own configurable base URL** and pointed at `uzrailpass.uz`, while the watcher/search stays on `railway.uz` (unchanged → existing users unaffected).

**Open tension (important):** the user wants auto-send of a **Payme/Click** payment request. But the captured `uzrailpass.uz` contract says that platform pays by **Stripe/card**, and its own doc note says "for auto-book, STOP at the payment step (seat held ~12 min)." The Payme/Click invoice endpoints (`/api/v1/payme/create-invoice`, `/api/v1/clickMerchant/create-invoice`) were discovered on `railway.uz`. **It is unverified whether those endpoints accept an order created via `uzrailpass.uz` reserve, and whether the two domains share one auth/session.** The current code attempts the Payme/Click request against `ETICKET_ACCOUNT_BASE_URL` after reserving, and **degrades gracefully** if it fails (seat stays booked, user gets a pay button). This needs a real live test to resolve — see §13.

---

## 7. The booking contract (summary)

Full detail in **`chipta-radar/docs/uzrailpass-booking-api.md`**. Key points:

Flow: `handbook/stations/list` → `POST /api/v3/handbook/trains/list` (search) → `POST /api/v1/handbook/trains` (seat map — ⚠️ request body not fully confirmed, see §13) → `POST /api/v1/users/friend/list` (saved passengers) → **`POST /api/v3/universal-orders/reserve`** (ONE call creates order + passenger + seat hold) → payment step (`payment-end-time`, Stripe).

`reserve` response: `{ "messageLevel": "OK", "code": 200, "response": "UO780Z0QMYA6TQ" }` — `response` is the order number.

Field format gotchas (sent verbatim):
- `fullName` = `Lastname=Firstname=Patronymic` (equals-separated).
- `gender`: `MALE` / `FEMALE`. `birthday`: `YYYY-MM-DD` (but `friend/list` returns `birthDay` as `DD.MM.YYYY` — convert!).
- Cyrillic values sent as-is: `carType` e.g. `"Сидячий"`/`"Плацкартный"`, `serviceClass` `"1В"`, `documentType` `"ПУ"`, `trainNumber` `"710Ф"`.
- `reserveSeatRequirements.seatsRange`: `"5-5"` (first-last seat; single seat = `"N-N"`).
- `webCustomer` = the **account owner** (id = account UUID, username = email, ip = host) — NOT the passenger.

---

## 8. Data model (Prisma — `prisma/schema.prisma`, schema `chipta_radar`)

- **User** — Telegram users. Flags: `quietNight`, `isBlocked`, `botBlocked`.
- **Station** — station codes/names (e.g. Toshkent `2900000`, Samarqand `2900700`, Xiva `2900172`).
- **Watch** — the core "notify me when a seat appears" order. Has search criteria (`fromCode/toCode/date/carTypes/trainNumbers/quantity/timeFrom/timeTo/maxPrice`), EXACT-mode seat prefs (`section/berth/together/noToilet`), and **auto-book fields**: `autoBook`, `autoBookPassengers`, `autoBookStatus` (`PENDING|RESERVED|PAID_REQUESTED|FAILED`), `autoBookOrderId`, `autoBookAt`. State machine in `lastKeys`/`lastResult`/`status`.
- **Notification** — sent-message history.
- **SearchLog** — search analytics.
- **RailwayAccount** — one per user. `secret` = encrypted `{ login, token, accountId, username, payProvider, payPhone }`. Password is **never** stored. `loginMasked` for display. `status` ACTIVE|EXPIRED.
- **Passenger** — saved passengers. `secret` = encrypted `{ firstName, lastName, docNumber, birthDate, gender, citizenship }`. Only masked forms (`nameMasked` "ANVA**** I.", `docMasked` "AA*****67") shown in UI. Child/adult auto-detected from birthdate (≤16 = child).
- **Booking** — bot-made bookings. `status` RESERVED|PAID|CANCELLED|EXPIRED|FAILED, plus `payProvider`, `payRequestedAt`, `expiresAt`.
- **Setting** — key/value JSON edited from the Admin Panel (`accountEnabled`, `paymentEnabled`, `bookingEnabled` [default TRUE], `maxPassengersPerUser`, watcher settings…).

---

## 9. Key modules (file map under `chipta-radar/src/`)

- `index.js` — boot: DB connect, start watcher, keep-alive, Express, bot webhook/polling.
- `config/default.js` — all config/env.
- **`core/railway.js`** — public search client + shared request queue, `RailwayError`, `runQueued`, `browserHeaders`.
- **`core/eticketAccount.js`** — account/booking client on `uzrailpass.uz`: `login` (reads accountId/username from JWT), `getProfile`, `getOrders`, `getFriends`, `searchTrainsForBooking`, `getSeatPlaces`, **`reserve`** (builds the exact contract payload), `getPaymentEndTime`, `createPaymentInvoice` (Payme/Click), `cancelOrder`. Password used only at login, never stored.
- `core/bot.js` — Telegraf instance + routing.
- **`services/accountService.js`** — orchestration + session cache + encryption + limits: `connectAccount`, `disconnectAccount`, passengers CRUD, `listOrders`, `requestPayment`, `getPaymentMethod`/`setPaymentMethod`, `setAutoBook`, **`autoBookOnFound`** (the auto-book pipeline, see §11), `requestAutoPayment`.
- **`services/watcher.js`** — the 60s loop; on a new matching seat for an auto-book watch, calls `accountService.autoBookOnFound` and messages the user (`autoBookOkMessage` / `autoBookFailMessage`).
- `services/matcher.js` — evaluates a watch against search results; `prefsOfWatch`, seat-preference logic.
- `services/seats.js` — `seatFits`, seat classification (lower/upper, compartment/side).
- `services/carTypes.js` — normalizes Cyrillic car-type names → internal keys (`platskart`, `kupe`, `sitting`, `sv`, `general`). Critical for matching reserve's Cyrillic `carType`.
- `services/vault.js` — AES-256-GCM encrypt/decrypt with per-record AAD.
- `services/personal.js` — passenger validation, masking, age category.
- `services/botFlow.js`, `botUi.js`, `botWizard.js` — inline (in-chat) multi-step input flows (account link, add passenger, payment method, pay order, auto-book toggle). Text-input state lives in `botFlow.js`.
- `controllers/botController.js` — all bot callback/command handlers (prefixes `acc:` `pass:` `pay:` `ab:` `flow:` `m:`). Also the Mini-App-equivalent inline screens.
- `controllers/clientController.js` + `routes/client.routes.js` — Mini App REST API (`/api/client/account*`, `/passengers*`, `/orders`, `/orders/pay`).
- `controllers/adminController.js` + `routes/admin.routes.js` — admin panel API (settings, stats, encryption-key status, user management).
- `public/account.html` + `account.js` — the standalone "Akkaunt va ma'lumotlar" Web App page served at `/app/account`.
- `models/*.js` — thin Prisma data-access wrappers.

---

## 10. Security model

- **Password is never persisted.** Account link uses login+password once to obtain a JWT; only the (encrypted) JWT is stored.
- **vault.js** = AES-256-GCM. Key from `DATA_ENCRYPTION_KEY` (32 bytes) or HKDF-derived from `ADMIN_SECRET`. Each record is bound to its owner via AAD context (e.g. `account:<userId>`, `passenger:<userId>`) so ciphertext can't be moved between users.
- Encrypted blobs are versioned (`v1.` prefix). Rotating the key invalidates existing blobs (users must re-link).
- If no key is configured, personal-data features auto-disable.
- Bot messages mask all PII; raw PII is only decrypted server-side at booking time.
- The user's email (`saparboev.sherzod@gmail.com`) is used only as the `webCustomer.username` in reserve and for identification — never sent to unrelated services.

---

## 11. Auto-book flow (current implementation)

In `accountService.autoBookOnFound(userId, watch, matchedTrain)`:
1. `searchTrainsForBooking` on `uzrailpass.uz` → find the train by number (whitespace-normalized). Fail reason `no-train-site`.
2. `getSeatPlaces` → `pickCarSeats`: pick a car whose normalized type is in `watch.carTypes` and that has enough seats passing `seatFits(prefs)`. Fail reason `no-seats` (transient — retried next cycle).
3. `getFriends` → `pickFriends(quantity)` (self first). Fail reason `passengers`.
4. **`reserve`** (single contract call). Throws `RESERVE_FAILED` on non-OK → surfaced as reason `error`.
5. `getPaymentEndTime` (seat-hold deadline).
6. **`requestAutoPayment`**: if the user saved a payment method (`payProvider` + `payPhone`), call `createPaymentInvoice` for the new order. **Never throws** — returns `{requested, ok, provider, phoneMasked, invoiceId, reason}`. If it fails, booking still stands.
7. Create `Booking` row: status `PAY_REQUESTED` if payment invoice ok, else `RESERVED`.

Watcher then: on success sets watch `status=FOUND`, `autoBookStatus=PAID_REQUESTED|RESERVED`, messages the user (payment sent to Payme/Click at <masked phone>, OR "pay manually, seat held ~12 min"). On a terminal failure it disables auto-book and warns; transient `no-seats`/`disabled` just retry next cycle.

Enabling auto-book (`setAutoBook`) requires: account connected + `bookingEnabled` setting + at least `watch.quantity` saved passengers in the eticket account.

---

## 12. Develop / test / deploy

```bash
cd chipta-radar
npm install
npm test        # 91 tests (node:test). Uses test/mock-railway.js — NO real network.
npm start       # needs BOT_TOKEN, DATABASE_URL, PUBLIC_URL, ADMIN_SECRET
```
- Tests mock both `RAILWAY_BASE_URL` and `ETICKET_ACCOUNT_BASE_URL` to a local mock server (`test/mock-railway.js`), which implements login (JWT), search, seat map, `friend/list`, `reserve`, `payment-end-time`, and Payme/Click invoices. Encryption is real in tests.
- Deploy: push dev branch → fast-forward deploy branch → **explicitly trigger** Render deploy → poll until `live` → check app logs for the green boot banner.
- Because the build runs `prisma db push`, schema changes ship automatically.

---

## 13. ⚠️ Known constraints & open questions (read before continuing)

1. **No outbound to the real sites from the build/CI sandbox.** `railway.uz`, `uzrailpass.uz`, and `onrender.com` are blocked by the proxy. You cannot curl/verify them from here — only via the live deployed service + Render logs, or by asking the owner to test on the bot. Design and verify against the mock + unit tests, then have the owner test live.
2. **Payme/Click for uzrailpass orders is UNVERIFIED** (see §6). The single most important open question: when the bot reserves on `uzrailpass.uz`, can a Payme/Click invoice actually be generated for that order (same session/account across domains?), or does that platform force Stripe/card? Resolve by live test. If Payme/Click can't be auto-sent, options: (a) send the user the direct card/Stripe payment link, or (b) investigate whether booking can instead be done through `railway.uz` so its Payme/Click endpoints apply.
3. **Seat-map request body unconfirmed.** `POST /api/v1/handbook/trains` (exact free-seat numbers) — the request body wasn't fully captured (the doc notes this). `getSeatPlaces` parses defensively; confirm the real body/response shape against live traffic. This is the step most likely to need adjustment for real bookings.
4. **Account re-link required** after pointing the account client at `uzrailpass.uz` — the owner must re-link once.
5. **Key rotation = data loss.** Changing `DATA_ENCRYPTION_KEY`/`ADMIN_SECRET` invalidates all stored tokens/passengers.

---

## 14. Immediate next steps (suggested)

1. Owner live-tests: re-link account → save Payme/Click + phone → enable auto-book on a watch → wait for a seat → observe what message arrives and whether a Payme/Click request actually reached the phone.
2. Based on that result, finalize the payment step (§13 #2).
3. Confirm/adjust the seat-map call (§13 #3) against real traffic if reserve picks wrong seats.
4. Optional: set `ETICKET_ACCOUNT_BASE_URL` explicitly in Render (code already defaults to `uzrailpass.uz`, so only needed if changing it).

---

## 15. Owner & conventions

- **Owner:** `saparboev.sherzod@gmail.com` (Telegram project owner of @gurlanuz_bot).
- **Language:** project comments & bot UI are in **Uzbek (Latin)**. Keep that style.
- **Commits:** clear messages; the repo uses a Claude-Code co-author/session footer convention.
- Everything user-facing (bot text, errors) is Uzbek. Money, dates: Tashkent time (UTC+5, no DST).
