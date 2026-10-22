# Shajara AI — ishlab chiquvchi eslatmalari

Telegram bot **@ShajaraAiBot** + Mini App (oila shajarasi). Eski bot (@Shajara_iBot) loyihadan uzilgan: `oldBotOff()` (bot.js) bir marta webhook'ni o'chiradi, kanal/guruhlardan chiqadi, natija `sys/oldbot-off.json`.

## Infratuzilma
- **Vercel** loyiha `prj_yUPhgxNxhcH39Ch7uNy6R8QkJBAd`, team `team_9O94SCoMljTHLcdStVP5qvnf`, region fra1.
  Domen: https://shajara-ai.vercel.app (PUBLIC_URL); shajara-ibot.vercel.app → 308 yo'naltiriladi (vercel.json redirects).
  Git: SherzodSafar/Factfoodbot, Root Directory `shajara`, Production Branch `shajara-main`.
- **Branchlar:** ish — `ccr-29541463-1vn1md`; prod — `shajara-main`.
  Push: `git push origin ccr-29541463-1vn1md && git push origin ccr-29541463-1vn1md:shajara-main`.
  Avto-deploy (git push → shajara-main) ishlaydi; qo'lda `create_deployment` faqat zarur bo'lsa (Hobby: API orqali kuniga 100 deploy limiti). `ccr-29541463-1vn1md` uchun Vercel deploy o'chirilgan (vercel.json git.deploymentEnabled) — Render shu branchdan oladi.
  Zaxira: Vercel MCP `create_deployment` (gitSource github, org SherzodSafar, repo Factfoodbot, ref shajara-main, sha, target production).
- Bu muhitdan shajara-ai.vercel.app ga curl bloklangan → tekshirish uchun Vercel MCP (`get_deployment`, `get_runtime_logs`, `web_fetch_vercel_url`).
- Bitta funksiya `api/index.js` (route=path rewrite), cron `/api/cron` har kuni 04:00 UTC (09:00 Toshkent) va `/api/cron?k=digest` 14:00 UTC (19:00).

## Saqlash
- `lib/store.js`: Neon Postgres `kv(key, data jsonb, ver)` (optimistik qulf), `rl` jadval — rate limit. Yo'q kalit Vercel Blob'dan ko'chiriladi. Shaxs rasmlari Blob'da.
- `lib/r2.js`: Cloudflare R2 (`shajara-media`) media kesh; `/api/media` keshda bo'lsa 302 presigned URL.
- `lib/mtproto.js`: GramJS, bot o'z tokeni bilan; kanal matnlari (`readChannelTexts`) va 20MB+ fayllar oqim bilan: `sendRange` (1 MB bo'laklar 4 tadan parallel, LRU kesh ~96 MB, `prefetch`), Vercel'da bitta javob 4 MB + keyingi 8 MB oldindan; R2 ga ko'chirilmaydi (≤20MB lar R2 keshiga tushadi).
- **Render oqim serveri** (`stream/server.js`, workspace `tea-d2m25rf5r7bs73e89omg`; eski `tea-dakqs1ff3r2c73dvtrhg` bepul limiti tugagan): 20MB+ video/audio `GET /api/media` — `sendRange` 64 MB gacha javob, `/health`. Env: BOT_TOKEN, APP_SECRET (Vercel bilan bir xil — imzo), TG_API_ID, TG_API_HASH, DATABASE_URL, `MT_SESSION=render` (alohida MTProto sessiya). Vercel'da `STREAM_URL` qo'yilsa `album.js` katta fayllar `src`ini Render'ga yo'naltiradi (bo'lmasa Vercel'dagi 4 MB lik oqim); CSP `media-src` da `*.onrender.com`. Bepul rejimda 15 daqiqa so'rovsiz uxlaydi (birinchi ochilish ~30–60 s).
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
- 3-bosqich (shox): bot yozishmasi — birma-bir savollar (`nextQ`/`askQ`: nm,g,b,al,d,ot,sp,k; «🤷 Bilmayman», «Orqaga», «Bu oilani o‘zi to‘ldirsin» → subBranch + `s.skip`), daftar rasmi → `chatMedia` (Gemini extractFamily + planGraph); ovozli rejim olib tashlangan. Takliflarda `warn` (14 yosh, takror), ishonchli mas'ul `branches[bid].trust` (avto-qo'shish), `applyWithUndo`/`undoProposal`, havola muddati `exp` (30 kun, ochilmagan bo'lsa), `branchStats` + `remindBranch`. Yangi shajara: `quickStartSheet` (farzand ismlari → havolalar).
- Shox oilasi yopiq albomi: `album.priv={head}`, `members`; kirish — faqat `members`; egasi (`owner`) bir martalik taklif `invites{code}` (`_k<aid><code>`) yuboradi, `remove` qiladi. A'zo bo'lmaganlarga umuman ko'rinmaydi. Fayllar albomning **alohida yopiq Telegram kanalida** (`album.ch={id,title,invite}`): egasi `POST album/a/<aid>/linkcode` → kanalga `/ulash KOD` (link kind `pchannel`, `chats/<id>` → `{kind:'pchannel', album}`), umumiy albom kanalini ulab bo'lmaydi; kanalsiz yopiq albomga yuklash rad etiladi (ilovada «📡 Yopiq kanal ulanmagan» banneri, `privChannelSheet`). Bot ro'yxatida 🔒 (faqat a'zoga, faqat shaxsiy chatda, kanali bor bo'lsa); yopiq kanalga to'g'ridan-to'g'ri joylangan media ham o'sha albomga tushadi; bot kanaldan chiqarilsa `ch=null`. Yopiq albom yuklamalari jurnal/bildirishnomalarsiz. Eski R2 dagi yopiq fayllar (`it.r2`, `/api/pm/...`) ishlashda davom etadi. `item.pub` + `alsoIn` (Umumiy) — tasdiqdan so'ng hammaga.
- Qon qarindosh ismi: `stripSurname` (bot, taklif, ilova) — familiya/otasining ismi qo'shib yozilsa faqat ism; panelda «Faqat ismni qoldirish» (`branch/cleannames`).
- «Shajarada men»: `members[uid].pid` (+ `users/<uid>.trees[treeId].pid`), `PATCH /api/me {pid}`; ilova ochilganda bir marta so'raladi (`whoAmISheet`), «Ko‘proq»da o'zgartiriladi. Albom oilalari (`album/heads`): o'zining va ota-onasining oilasi, egallagan shoxlari; tahrirchiga — farzandi bor barcha qon qarindosh.
- Shaxsiylashtirish (pid asosida): daraxt o'ziga markazlashadi + «Mening oilam» chiplari (`myBar`), shaxs oynasida «Sizga: …» (`meKin`, kinship + egalik qo'shimchasi), «Oilangiz N% — to'ldirasizmi?» → `POST /api/me/branch` → wizard, 3 qadamli yo'l-yo'riq (localStorage `sh_ob*`), rasmdagilarni belgilash `item.tags` (`album/i/<iid>/tags`) va shaxs oynasida «Suratlari», shaxsiy tabrik eslatmasi `lib/greet.js` (cron, 3 qadamgacha yaqinlar, ertangi tug'ilgan kun).
- Keyingi g'oyalar: ovozli javob (bot chat), AI bilan Q&A.

## Foydalanuvchi afzalliklari
O'zbekcha, qisqa javob, tokenlarni tejash, tez bajarish. Ruxsat umumiy berilgan ("hammasini o'zing qil").
- Render oqim serveri (`stream/server.js`, https://shajara-stream.onrender.com, yangi akkaunt, `ccr-29541463-1vn1md` dan avto-deploy): kerakli env — BOT_TOKEN, TG_API_ID, TG_API_HASH, MT_SESSION=render (DATABASE_URL ixtiyoriy — sessiyani saqlash; APP_SECRET shart emas: imzoni Vercel `/api/media?...&chk=1` → 204 tekshiradi, kesh). Vercel'da `STREAM_URL` bo'lsa katta video `src` Render'ga, `src2` — Vercel zaxirasi (ilova 8 soniyada javob bo'lmasa yoki xatoda o'tadi), albom ochilganda `/health` bilan uyg'otiladi.
- Fayl menejeri (albom): ☑️ tanlash rejimi (`S.sel`), `POST album/batch {op: delete|move|send|zip, ids, album}`. Boshqarish huquqi: tahrirchi, faylni yuklagan yoki albomni ochgan (`album.uid`/`owner`). Ko'chirishda umumiy↔yopiq kanal almashsa fayl yangi kanalga nusxalanib, eskisi o'chiriladi. `send` — fayllar bot chatiga (file_id), yopiq albom fayllari yuborilmaydi. ZIP: `zip/<id>.json` topshiriq → Render `GET /zip/<id>?e&s` (imzo `zip:<id>`, Vercel `/api/zipjob/<id>` dan ro'yxat) — Telegram'dan oqim bilan STORE ZIP, har albom papka; `&send=1` — ≤49 MB ZIP Bot API orqali bot chatiga. Bitta fayl: `album/i/<id>/share` → `savePreparedInlineMessage` → `tg.shareMessage` (istalgan chat), bo'lmasa bot chatiga.
- Render avto-deploy ishlamaydi (GitHub webhook yo'q): `stream/` o'zgarsa — Render MCP `trigger_deploy` (srv-dbd0c80m7kps73d5foa0, workspace tea-d2m25rf5r7bs73e89omg).
- Yuborish (ko'rgich): «🔗 Istalgan odamga» — `album/i/<id>/link` → `t.me/<bot>?start=f_<tree>_<iid>_<signShare>` (t.me/share/url oynasi), havolani ochganga bot faylni yuboradi (yopiq albom fayli — yo'q); «📎 Faylning o'zini» — shareMessage. Albomda bosib turish (0.45 s) — tanlash rejimi. Bir nechta fayl yuklashda har biriga izoh: ilovada har fayl ostida maydon; botda izohsiz fayllar uchun birma-bir so'raladi (`askNextCaption`, item.cap/mid, o'sha faylga javob).
- ZIP yuborish (Render `/zip/<id>?send=1`): avval MTProto (`canReachUser` → `uploadDocument`, 512 KB bo'laklar, total=-1 oqim; ≤1.9 GB guruhlar) foydalanuvchi bot chatiga, `encodeFileId` (MTProto hujjat → Bot API file_id, versiya baytlari mavjud file_id dan) → savePreparedInlineMessage → ilovada shareMessage. MTProto ishlamasa — 48 MB lik Bot API qismlar.
