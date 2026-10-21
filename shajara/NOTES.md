# Shajara AI — ishlab chiquvchi eslatmalari

Telegram bot **@ShajaraAiBot** + Mini App (oila shajarasi). Eski bot (@Shajara_iBot) loyihadan uzilgan: `oldBotOff()` (bot.js) bir marta webhook'ni o'chiradi, kanal/guruhlardan chiqadi, natija `sys/oldbot-off.json`.

## Infratuzilma
- **Vercel** loyiha `prj_yUPhgxNxhcH39Ch7uNy6R8QkJBAd`, team `team_9O94SCoMljTHLcdStVP5qvnf`, region fra1.
  Domen: https://shajara-ai.vercel.app (PUBLIC_URL); shajara-ibot.vercel.app → 308 yo'naltiriladi (vercel.json redirects).
  Git: SherzodSafar/Factfoodbot, Root Directory `shajara`, Production Branch `shajara-main`.
- **Branchlar:** ish — `ccr-29541463-1vn1md`; prod — `shajara-main`.
  Push: `git push origin ccr-29541463-1vn1md && git push origin ccr-29541463-1vn1md:shajara-main`.
  Avto-deploy ba'zan ishlamaydi → Vercel MCP `create_deployment` (gitSource github, org SherzodSafar, repo Factfoodbot, ref shajara-main, sha, target production).
- Bu muhitdan shajara-ai.vercel.app ga curl bloklangan → tekshirish uchun Vercel MCP (`get_deployment`, `get_runtime_logs`, `web_fetch_vercel_url`).
- Bitta funksiya `api/index.js` (route=path rewrite), cron `/api/cron` har kuni 04:00 UTC (09:00 Toshkent) va `/api/cron?k=digest` 14:00 UTC (19:00).

## Saqlash
- `lib/store.js`: Neon Postgres `kv(key, data jsonb, ver)` (optimistik qulf), `rl` jadval — rate limit. Yo'q kalit Vercel Blob'dan ko'chiriladi. Shaxs rasmlari Blob'da.
- `lib/r2.js`: Cloudflare R2 (`shajara-media`) media kesh; `/api/media` keshda bo'lsa 302 presigned URL.
- `lib/mtproto.js`: GramJS, bot o'z tokeni bilan; 20MB+ fayllar va kanal matnlarini o'qish (`readChannelTexts`).
- Kalitlar: `trees/<id>.json`, `albums/<id>.json`, `users/<uid>.json`, `props/<treeId>.json` (takliflar), `brchat/<uid>.json` (bot-yozishma holati), `aijobs/`.

## Asosiy modullar
- `lib/tree.js` — shajara modeli, import (planGraph/importGraph/undo), dublikat/merge, `branchScope`, `applyProposal`, `flexDate`.
- `lib/branch.js` — shox havolalari: claim, zanjir (`subBranch`), `submitProposal` (bo'sh maydon taqiqlangan), to'liqlik (`completeness`), kunlik eslatmalar (`dailyReminders`), bot yozishmasi orqali to'ldirish (`chatStart/chatText/chatCallback`, callback `bc:*`).
- `lib/comments.js` — albom izohlari: matn albom kanalida (reply), JSONda faqat indeks `it.cm`; like/seen ro'yxatlari (izoh like'lari ham: `people?k=likes&mid=`), `inboxRoute` (`/api/inbox?k=me|fam`, `?n=1`).
- `lib/inbox.js` — shaxsiy bildirishnomalar `inbox/<uid>.json` (like, cm, re, cmlike) + Telegram DM (`notify.social`), kunlik izoh dayjesti guruhlarga (cron `/api/cron?k=digest` 14:00 UTC = 19:00). Avatar: `/api/uphoto/<uid>` (imzoli, getUserProfilePhotos).
- Start payload suffikslari: `_n` — bildirishnomalar (Menga), `_f` — oila izohlari.
- `lib/bot.js` — bot (start payloadlar: invite, `br_<tree>_<bid>`, `<inv>_<pid>`, `<inv>_m<itemId>`), albom yuklash, AI.
- `lib/ai.js` — Gemini (flash-lite asosiy), fayldan import.
- `lib/notify.js`, `lib/events.js` — bildirishnomalar, tug'ilgan kunlar (ismlar profil havolasi bilan).
- `public/js/app.js` — Mini App (daraxt: standart real-tree, `sh_tv='cards'` — tarmoq), reels albom, shox sehrgari (`renderBranchWizard`), `branchesSheet` (takliflar + to'liqlik paneli).
- i18n: `public/js/i18n.js` (D massiv [uz,ru,en]), `lib/i18n.js` (bot). Kirill avtomatik.
- Kesh versiyasi: `public/index.html` `?v=N` — har klient o'zgarishida oshiring.

## Sinov
- `BOT_TOKEN=TEST PORT=3111 node scripts/dev-server.js` (lokal store `.data/`).
- Playwright: `/opt/node22/lib/node_modules/playwright/index.mjs`, executablePath `/opt/pw-browsers/chromium`; Telegram WebApp stub + initData HMAC (BOT_TOKEN=TEST).

## Holat (2026-10-21)
- Bajarilgan: shox havolasi + sehrgar + tasdiqlash, zanjir, bot-yozishma, to'liqlik paneli, eslatmalar, albom izohlari/like/ko'rganlar ro'yxati.
- Prod'da tekshirilmagan: izoh matnini MTProto orqali kanaldan o'qish (`accessHash 0`); bot kanalda admin (post/edit/delete) bo'lishi shart.
- 2-bosqich: Instagram uslubi — bildirishnomalar bo'limi (Menga/Oila izohlari/Yangiliklar/Sozlamalar), profil oynasi (rasm + yuklagan fayllari), albom plitkalarida 👁❤💬, shox havolasi tilini tanlash (`branches[bid].lang`), shoxda sanalar faqat to'liq (kun.oy.yil), eski bot kodi olib tashlandi.
- Asl sifat: mini app yuklamalari `album/up/chunk` (2.5 MB bo'laklar, `tmp/up/`) + `album/up/finish` → kanalga sendDocument (siqilmaydi). Avatar: 640px kvadrat ko'rsatish uchun + asl nusxa «Portretlar» albomiga (`person.photoItem`). Katta rasmlar `/api/media` da R2 ga ko'chirilib 302. Botga «rasm» sifatida yuborilganlar siqilgan — bot «Fayl» sifatida yuborishni maslahat beradi.
- Bildirishnoma tugmalari: `notify(..., { open })` — `_p<id>` shaxs, `_a<itemId>` albom fayli.
- Keyingi g'oyalar: ovozli javob (bot chat), AI bilan Q&A.

## Foydalanuvchi afzalliklari
O'zbekcha, qisqa javob, tokenlarni tejash, tez bajarish. Ruxsat umumiy berilgan ("hammasini o'zing qil").
