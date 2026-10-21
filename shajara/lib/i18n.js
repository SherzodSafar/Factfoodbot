// Bot xabarlari uchun tarjimalar. Kalit — o'zbekcha (lotin) matn; kirill avtomatik.
import { toCyrillic } from '../public/js/translit.js';

export const LANGS = ['uz', 'uzc', 'ru', 'en'];

const RU = {
  'Assalomu alaykum, <b>{name}</b>! 🌿': 'Ассаламу алейкум, <b>{name}</b>! 🌿',
  '<b>Shajara AI</b> — oilangiz shajarasini qurish, saqlash va avlodlarga yetkazish uchun.':
    '<b>Shajara AI</b> — чтобы построить, сохранить и передать потомкам родословную вашей семьи.',
  "🌳 Jonli shajara daraxti\n👥 Qarindoshlar ro'yxati\n📸 Oilaviy albom (rasm, video, hujjat)\n🔔 Yangiliklar va tug'ilgan kun eslatmalari\n🔐 Maxfiy kodlar va taklif havolalari":
    '🌳 Живое родословное древо\n👥 Список родственников\n📸 Семейный альбом (фото, видео, документы)\n🔔 Новости и напоминания о днях рождения\n🔐 Секретные коды и пригласительные ссылки',
  'Boshlash uchun pastdagi tugmani bosing 👇': 'Нажмите кнопку ниже, чтобы начать 👇',
  'Sizni shajaraga taklif qilishdi — pastdagi tugmani bosing 👇': 'Вас пригласили в родословную — нажмите кнопку ниже 👇',
  '🌳 Shajarani ochish': '🌳 Открыть родословную',
  'Shajara': 'Родословная',
  'Shajarani ochish': 'Открыть родословную',
  'Qondoshlik haqida hikmat': 'Мудрость о родстве',
  'Qanday foydalaniladi': 'Как пользоваться',
  'Albomga fayl qo‘shish': 'Добавить файл в альбом',
  'Tilni tanlash': 'Выбрать язык',
  'Tilni tanlang:': 'Выберите язык:',
  'Til o‘zgartirildi ✅': 'Язык изменён ✅',
  'Avval ilovada shajarangizni oching — so‘ng fayllarni shu yerga yuboring.': 'Сначала откройте родословную в приложении — затем отправляйте файлы сюда.',
  'Bu shajara albomiga fayl qo‘shishga ruxsatingiz yo‘q.': 'У вас нет прав добавлять файлы в альбом этой родословной.',
  '📁 <b>{tree}</b>\nQaysi albomga qo‘shamiz?': '📁 <b>{tree}</b>\nВ какой альбом добавить?',
  '➕ Yangi albom': '➕ Новый альбом',
  '✖️ Bekor qilish': '✖️ Отмена',
  'Yangi albom nomini yozing (masalan: To‘y 2024):': 'Напишите название нового альбома (например: Свадьба 2024):',
  '✍️ Fayl(lar)ga izoh yozing — kim, qachon, qayerda? (o‘tkazib yuborish: /skip)': '✍️ Напишите подпись к файлу(ам) — кто, когда, где? (пропустить: /skip)',
  '✅ {n} ta fayl «{album}» albomiga qo‘shildi.': '✅ {n} файл(ов) добавлено в альбом «{album}».',
  'Bekor qilindi.': 'Отменено.',
  'Bu tugma siz uchun emas.': 'Эта кнопка не для вас.',
  'Bu yerda fayl kutilmayapti. Albomga qo‘shish uchun faylga javob tariqasida /albom yozing.': 'Здесь файл не ожидается. Чтобы добавить в альбом, ответьте на файл командой /albom.',
  'Albomga qo‘shish uchun rasm/videoga javob tariqasida /albom yozing.': 'Чтобы добавить в альбом, ответьте на фото/видео командой /albom.',
  'Bu guruh hali shajaraga ulanmagan. Ilovada «Guruhni ulash» kodini oling va shu yerga /ulash KOD yuboring.':
    'Эта группа ещё не привязана к родословной. Получите код «Привязать группу» в приложении и отправьте сюда /ulash КОД.',
  '✅ Guruh «{tree}» shajarasiga ulandi. Endi albom va yangiliklar shu yerga ham keladi.': '✅ Группа привязана к родословной «{tree}». Теперь альбом и новости будут приходить сюда.',
  '✅ Kanal «{tree}» albomi uchun ulandi. Barcha fayllar shu kanalda saqlanadi.': '✅ Канал подключён к альбому «{tree}». Все файлы будут храниться здесь.',
  'Kod noto‘g‘ri yoki muddati o‘tgan.': 'Код неверный или истёк.',
  'Salom! Meni shajaraga ulash uchun ilovadan kod oling va shu yerga /ulash KOD yuboring.': 'Привет! Чтобы привязать меня к родословной, получите код в приложении и отправьте сюда /ulash КОД.',
  '🎂 <b>Bugun tug‘ilgan kun:</b>': '🎂 <b>Сегодня день рождения:</b>',
  '{name} — {age} yosh': '{name} — {age} лет',
  'Tabriklashni unutmang — bir qo‘ng‘iroq ham qondoshlikni mustahkamlaydi. 💚': 'Не забудьте поздравить — даже один звонок укрепляет родственные узы. 💚',
  '🤲 <b>Xotira kuni:</b>': '🤲 <b>День памяти:</b>',
  '{name} — vafotiga {years} yil': '{name} — {years} лет со дня кончины',
  'Duo bilan yod eting.': 'Помяните добрым словом и молитвой.',
  '📸 <b>{who}</b> «{album}» albomiga {n} ta fayl qo‘shdi': '📸 <b>{who}</b> добавил(а) {n} файл(ов) в альбом «{album}»',
  '🌱 <b>{who}</b> shajaraga yangi a’zo qo‘shdi: {name}': '🌱 <b>{who}</b> добавил(а) в родословную: {name}',
  '🖼 <b>{who}</b> {name} suratini yangiladi': '🖼 <b>{who}</b> обновил(а) фото: {name}',
  '✏️ <b>{who}</b> {name} ma’lumotlarini yangiladi': '✏️ <b>{who}</b> обновил(а) данные: {name}',
  'Yaqin tug‘ilgan kunlar (30 kun):': 'Ближайшие дни рождения (30 дней):',
  'Yaqin kunlarda tug‘ilgan kun yo‘q.': 'В ближайшие дни нет дней рождения.',
  '<b>Qanday foydalaniladi?</b>': '<b>Как пользоваться?</b>',
  HELP:
    '1️⃣ Откройте приложение и введите <b>код родословной</b> — или создайте новую.\n2️⃣ Для редактирования нажмите 🔒 и введите <b>код редактора</b>.\n3️⃣ <b>Альбом:</b> отправьте фото/видео/файл сюда — бот спросит альбом и подпись.\n4️⃣ <b>Группа:</b> добавьте бота в семейную группу и отправьте /ulash КОД. В группе: /shajara, /albom (ответом на файл), /tugilgan.\n5️⃣ <b>Канал для хранения:</b> создайте закрытый канал, сделайте бота админом и отправьте туда /ulash КОД.\n\nКоманды: /start · /til · /hikmat · /yordam',
  '⭐ Premium faollashtirildi: {until} gacha. Rahmat!': '⭐ Premium активирован до {until}. Спасибо!',
  'Fayl juda katta yoki turi qo‘llab-quvvatlanmaydi.': 'Файл слишком большой или тип не поддерживается.',
  'Bepul tarifda albom limiti tugadi ({n} ta fayl). Premium bilan cheksiz.': 'Лимит альбома бесплатного тарифа исчерпан ({n} файлов). С Premium — без ограничений.',
};

const EXTRA = [
  ['Albom uchun avval shajara tahrirchisi albom kanalini ulashi kerak (ilovada: Ko‘proq → Albom kanali).', 'Сначала редактор должен подключить канал альбома (в приложении: Ещё → Канал альбома).', 'An editor must connect the album channel first (in the app: More → Album channel).'],
  ['{name} o‘g‘li', 'сын {name}', 'son of {name}'],
  ['{name} qizi', 'дочь {name}', 'daughter of {name}'],
  ['{n} yosh', '{n} лет', 'turns {n}'],
];
for (const [k, r] of EXTRA.map((x) => [x[0], x[1]])) RU[k] = r;

const EN = {
  'Assalomu alaykum, <b>{name}</b>! 🌿': 'Hello, <b>{name}</b>! 🌿',
  '<b>Shajara AI</b> — oilangiz shajarasini qurish, saqlash va avlodlarga yetkazish uchun.':
    '<b>Shajara AI</b> — build, keep and pass on your family tree.',
  "🌳 Jonli shajara daraxti\n👥 Qarindoshlar ro'yxati\n📸 Oilaviy albom (rasm, video, hujjat)\n🔔 Yangiliklar va tug'ilgan kun eslatmalari\n🔐 Maxfiy kodlar va taklif havolalari":
    '🌳 Live family tree\n👥 List of relatives\n📸 Family album (photos, videos, documents)\n🔔 News and birthday reminders\n🔐 Secret codes and invite links',
  'Boshlash uchun pastdagi tugmani bosing 👇': 'Tap the button below to start 👇',
  'Sizni shajaraga taklif qilishdi — pastdagi tugmani bosing 👇': 'You were invited to a family tree — tap the button below 👇',
  '🌳 Shajarani ochish': '🌳 Open family tree',
  'Shajara': 'Family tree',
  'Shajarani ochish': 'Open family tree',
  'Qondoshlik haqida hikmat': 'Wisdom about kinship',
  'Qanday foydalaniladi': 'How to use',
  'Albomga fayl qo‘shish': 'Add a file to the album',
  'Tilni tanlash': 'Choose language',
  'Tilni tanlang:': 'Choose a language:',
  'Til o‘zgartirildi ✅': 'Language changed ✅',
  'Avval ilovada shajarangizni oching — so‘ng fayllarni shu yerga yuboring.': 'Open your family tree in the app first — then send files here.',
  'Bu shajara albomiga fayl qo‘shishga ruxsatingiz yo‘q.': 'You are not allowed to add files to this album.',
  '📁 <b>{tree}</b>\nQaysi albomga qo‘shamiz?': '📁 <b>{tree}</b>\nWhich album should we add it to?',
  '➕ Yangi albom': '➕ New album',
  '✖️ Bekor qilish': '✖️ Cancel',
  'Yangi albom nomini yozing (masalan: To‘y 2024):': 'Type the new album name (e.g. Wedding 2024):',
  '✍️ Fayl(lar)ga izoh yozing — kim, qachon, qayerda? (o‘tkazib yuborish: /skip)': '✍️ Write a caption — who, when, where? (skip: /skip)',
  '✅ {n} ta fayl «{album}» albomiga qo‘shildi.': '✅ {n} file(s) added to “{album}”.',
  'Bekor qilindi.': 'Cancelled.',
  'Bu tugma siz uchun emas.': 'This button is not for you.',
  'Bu yerda fayl kutilmayapti. Albomga qo‘shish uchun faylga javob tariqasida /albom yozing.': 'No file expected here. To add to the album, reply to the file with /albom.',
  'Albomga qo‘shish uchun rasm/videoga javob tariqasida /albom yozing.': 'To add to the album, reply to a photo/video with /albom.',
  'Bu guruh hali shajaraga ulanmagan. Ilovada «Guruhni ulash» kodini oling va shu yerga /ulash KOD yuboring.':
    'This group is not linked yet. Get a “Link group” code in the app and send /ulash CODE here.',
  '✅ Guruh «{tree}» shajarasiga ulandi. Endi albom va yangiliklar shu yerga ham keladi.': '✅ Group linked to “{tree}”. Album updates and news will be posted here.',
  '✅ Kanal «{tree}» albomi uchun ulandi. Barcha fayllar shu kanalda saqlanadi.': '✅ Channel linked to the “{tree}” album. All files will be stored here.',
  'Kod noto‘g‘ri yoki muddati o‘tgan.': 'The code is wrong or expired.',
  'Salom! Meni shajaraga ulash uchun ilovadan kod oling va shu yerga /ulash KOD yuboring.': 'Hi! To link me to a family tree, get a code in the app and send /ulash CODE here.',
  '🎂 <b>Bugun tug‘ilgan kun:</b>': '🎂 <b>Birthdays today:</b>',
  '{name} — {age} yosh': '{name} — turns {age}',
  'Tabriklashni unutmang — bir qo‘ng‘iroq ham qondoshlikni mustahkamlaydi. 💚': 'Don’t forget to congratulate — even one call strengthens family ties. 💚',
  '🤲 <b>Xotira kuni:</b>': '🤲 <b>Day of remembrance:</b>',
  '{name} — vafotiga {years} yil': '{name} — {years} years since passing',
  'Duo bilan yod eting.': 'Remember them with a prayer.',
  '📸 <b>{who}</b> «{album}» albomiga {n} ta fayl qo‘shdi': '📸 <b>{who}</b> added {n} file(s) to “{album}”',
  '🌱 <b>{who}</b> shajaraga yangi a’zo qo‘shdi: {name}': '🌱 <b>{who}</b> added to the family tree: {name}',
  '🖼 <b>{who}</b> {name} suratini yangiladi': '🖼 <b>{who}</b> updated the photo of {name}',
  '✏️ <b>{who}</b> {name} ma’lumotlarini yangiladi': '✏️ <b>{who}</b> updated {name}',
  'Yaqin tug‘ilgan kunlar (30 kun):': 'Upcoming birthdays (30 days):',
  'Yaqin kunlarda tug‘ilgan kun yo‘q.': 'No birthdays in the coming days.',
  '<b>Qanday foydalaniladi?</b>': '<b>How to use?</b>',
  HELP:
    '1️⃣ Open the app and enter a <b>family tree code</b> — or create a new tree.\n2️⃣ To edit, tap 🔒 and enter the <b>editor code</b>.\n3️⃣ <b>Album:</b> send a photo/video/file here — the bot will ask for the album and caption.\n4️⃣ <b>Group:</b> add the bot to your family group and send /ulash CODE. In the group: /shajara, /albom (reply to a file), /tugilgan.\n5️⃣ <b>Storage channel:</b> create a private channel, make the bot an admin and post /ulash CODE there.\n\nCommands: /start · /til · /hikmat · /yordam',
  '⭐ Premium faollashtirildi: {until} gacha. Rahmat!': '⭐ Premium activated until {until}. Thank you!',
  'Fayl juda katta yoki turi qo‘llab-quvvatlanmaydi.': 'The file is too large or not supported.',
  'Bepul tarifda albom limiti tugadi ({n} ta fayl). Premium bilan cheksiz.': 'The free album limit is reached ({n} files). Unlimited with Premium.',
};

const UZ_HELP =
  '1️⃣ Ilovani oching va <b>shajara kodini</b> kiriting — yoki yangi shajara yarating.\n2️⃣ Tahrirlash uchun 🔒 ni bosib <b>tahrir kodini</b> kiriting.\n3️⃣ <b>Albom:</b> rasm/video/faylni shu yerga yuboring — bot albom va izohni so‘raydi.\n4️⃣ <b>Guruh:</b> botni oilaviy guruhga qo‘shing va /ulash KOD yuboring. Guruhda: /shajara, /albom (faylga javoban), /tugilgan.\n5️⃣ <b>Saqlash kanali:</b> yopiq kanal oching, botni admin qiling va kanalga /ulash KOD yozing.\n\nBuyruqlar: /start · /til · /hikmat · /yordam';

for (const [k, , e] of EXTRA) EN[k] = e;

export function normLang(l) {
  if (LANGS.includes(l)) return l;
  const s = String(l || '').toLowerCase();
  if (s.startsWith('ru')) return 'ru';
  if (s.startsWith('en')) return 'en';
  return 'uz';
}

const UZ_BOT = {
  BOT_SHORT: 'Oila shajarasi: jonli daraxt, albom, tug‘ilgan kunlar va AI yordamchi.',
  BOT_ABOUT: '🌳 Shajara AI — oilangiz shajarasini qurish, saqlash va avlodlarga yetkazish uchun.\n\n• Jonli shajara daraxti va qarindoshlar ro‘yxati\n• Oilaviy albom (rasm, video, audio)\n• Tug‘ilgan kun va xotira kunlari eslatmalari\n• AI yordamchi: istalgan fayldan ro‘yxat tuzadi\n• Maxfiy kodlar bilan himoya\n\nBoshlash uchun «Start» ni bosing.',
};
RU.BOT_SHORT = 'Семейная родословная: живое древо, альбом, дни рождения и AI-помощник.';
RU.BOT_ABOUT = '🌳 Shajara AI — постройте, сохраните и передайте потомкам родословную вашей семьи.\n\n• Живое древо и список родственников\n• Семейный альбом (фото, видео, аудио)\n• Напоминания о днях рождения и памятных датах\n• AI-помощник: составит список из любого файла\n• Защита секретными кодами\n\nНажмите «Start», чтобы начать.';
EN.BOT_SHORT = 'Family tree: a living tree, album, birthdays and an AI assistant.';
EN.BOT_ABOUT = '🌳 Shajara AI — build, keep and pass on your family tree.\n\n• Living family tree and relatives list\n• Family album (photos, video, audio)\n• Birthday and memorial reminders\n• AI assistant: builds a list from any file\n• Protected by secret codes\n\nTap “Start” to begin.';
for (const [k, r, e] of [
  ['🌳 <b>Shajara iBot</b> endi <b>Shajara AI</b> nomi bilan ishlaydi!\n\nBarcha shajaralar va albomlar saqlangan. Davom etish uchun yangi botni oching 👇', '🌳 <b>Shajara iBot</b> теперь называется <b>Shajara AI</b>!\n\nВсе родословные и альбомы сохранены. Откройте нового бота, чтобы продолжить 👇', '🌳 <b>Shajara iBot</b> is now <b>Shajara AI</b>!\n\nAll trees and albums are kept. Open the new bot to continue 👇'],
  ['Albom yangi botga ko‘chirildi: {n} ta fayl.', 'Альбом перенесён в нового бота: {n} файлов.', 'Album moved to the new bot: {n} files.'],
  ['Maxfiylik siyosati va shartlar', 'Политика конфиденциальности и условия', 'Privacy policy and terms'],
]) { RU[k] = r; EN[k] = e; }

const UZ_AI = '📋 <b>AI bilan ro‘yxat tuzish</b>\n\nQarindoshlar ro‘yxati bor faylni yuboring: Excel, Word, PDF, CSV, qo‘lyozma yoki daraxt rasmi — yoki ro‘yxatni shu yerga matn qilib yozing.\n\nAI uni shajara formatiga keltiradi, tayyor faylni qaytaradi va bir tugma bilan shajarangizga qo‘shib beradi.';
RU['AI_IMPORT_HELP'] = '📋 <b>Список с помощью AI</b>\n\nОтправьте файл со списком родственников: Excel, Word, PDF, CSV, фото рукописи или схемы — или напишите список текстом.\n\nAI приведёт его к формату родословной, вернёт готовый файл и добавит в вашу родословную одной кнопкой.';
EN['AI_IMPORT_HELP'] = '📋 <b>Build the list with AI</b>\n\nSend a file with your relatives: Excel, Word, PDF, CSV, a photo of handwritten notes or a chart — or type the list here.\n\nAI converts it to the family tree format, returns a ready file and adds it to your tree with one tap.';
for (const [k, r, e] of [
  ['Savolingizni yozing — masalan: «Albomga qanday rasm qo‘shaman?»', 'Напишите вопрос — например: «Как добавить фото в альбом?»', 'Type your question — e.g. “How do I add a photo to the album?”'],
  ['AI yordamchi hozir javob bera olmadi. Keyinroq urinib ko‘ring yoki /yordam ni bosing.', 'AI-помощник сейчас не смог ответить. Попробуйте позже или нажмите /yordam.', 'The AI assistant could not answer right now. Try later or tap /yordam.'],
  ['Fayl juda katta (20 MB dan oshmasin).', 'Файл слишком большой (не более 20 МБ).', 'The file is too large (max 20 MB).'],
  ['Faylni yuklab bo‘lmadi.', 'Не удалось загрузить файл.', 'Could not download the file.'],
  ['Bu formatni o‘qib bo‘lmaydi. Faylni .xlsx, .docx, .pdf, .csv yoki rasm qilib yuboring.', 'Этот формат не читается. Отправьте .xlsx, .docx, .pdf, .csv или фото.', 'This format can’t be read. Send .xlsx, .docx, .pdf, .csv or an image.'],
  ['⏳ AI faylni tahlil qilmoqda… Bu 1-2 daqiqa olishi mumkin.', '⏳ AI анализирует файл… Это может занять 1-2 минуты.', '⏳ AI is analysing the file… This may take 1-2 minutes.'],
  ['AI faylni tahlil qila olmadi. Boshqa formatda yuborib ko‘ring.', 'AI не смог разобрать файл. Попробуйте другой формат.', 'AI could not process the file. Try another format.'],
  ['Fayldan odamlar ro‘yxati topilmadi.', 'В файле не найден список людей.', 'No list of people was found in the file.'],
  ['ga qo‘shish', '— добавить', '— add'],
  ['{n} kishi topildi.', 'Найдено человек: {n}.', '{n} people found.'],
  ['Faylni tekshiring. Hammasi to‘g‘ri bo‘lsa — pastdagi tugma bilan shajarangizga qo‘shing yoki ilovada «Fayldan qo‘shish» orqali yuklang.', 'Проверьте файл. Если всё верно — добавьте кнопкой ниже или загрузите в приложении через «Из файла».', 'Check the file. If all is correct, add it with the button below or upload it in the app via “From file”.'],
  ['Bu faylni ilovada tahrir rejimida «+ → Fayldan qo‘shish» orqali yuklang.', 'Загрузите этот файл в приложении в режиме редактирования: «+ → Из файла».', 'Upload this file in the app in edit mode: “+ → From file”.'],
  ['Ma’lumot eskirgan. Faylni qayta yuboring.', 'Данные устарели. Отправьте файл заново.', 'Data expired. Send the file again.'],
  ['Ruxsat yo‘q', 'Нет доступа', 'No permission'],
  ['{n} kishi «{title}» shajarasiga qo‘shildi.', 'Добавлено {n} чел. в «{title}».', '{n} people added to “{title}”.'],
  ['«{title}»da {m} tasi allaqachon bor — qayta qo‘shilmaydi.', 'В «{title}» уже есть {m} — повторно не добавятся.', '{m} already exist in “{title}” — they won’t be duplicated.'],
  ['{m} tasi allaqachon bor edi — ularga bog‘landi.', '{m} уже были — новые записи связаны с ними.', '{m} already existed — new people were linked to them.'],
  ['AI ro‘yxat (fayldan)', 'AI-список (из файла)', 'AI list (from file)'],
  ['AI yordamchiga savol', 'Вопрос AI-помощнику', 'Ask the AI assistant'],
]) { RU[k] = r; EN[k] = e; }

export function t(lang, key, vars = {}) {
  let s = key === 'HELP' ? UZ_HELP : key === 'AI_IMPORT_HELP' ? UZ_AI : UZ_BOT[key] || key;
  if (lang === 'ru') s = RU[key] || s;
  else if (lang === 'en') s = EN[key] || s;
  else if (lang === 'uzc') s = toCyrillic(s);
  return s.replace(/\{(\w+)\}/g, (_, k) => (lang === 'uzc' ? toCyrillic(vars[k] ?? '') : (vars[k] ?? '')));
}

// ---- Albom izohlari (guruh bildirishnomasi)
for (const [k, r, e] of [
  ['💬 «{album}» albomidagi faylga yangi izoh qoldirildi', '💬 Новый комментарий к файлу в альбоме «{album}»', '💬 New comment on a file in the «{album}» album'],
  ['💬 O‘qish', '💬 Читать', '💬 Read'],
  ['💬 Izohlarni o‘qish uchun pastdagi tugmani bosing 👇', '💬 Нажмите кнопку ниже, чтобы прочитать комментарии 👇', '💬 Tap the button below to read the comments 👇'],
  ["✍️ Ilovada to‘ldirish", "✍️ Заполнить в приложении", "✍️ Fill in the app"],
  ["💬 Shu yerda to‘ldirish", "💬 Заполнить здесь", "💬 Fill in here"],
  ["oilasi", "семья", "family"],
  ["to‘liqlik", "заполненность", "completeness"],
  ["Ma’lumoti to‘liq bo‘lmagan: {n} kishi (tug‘ilgan yoki vafot sanasi yo‘q).", "Неполные данные: {n} чел. (нет даты рождения или смерти).", "Incomplete data: {n} people (no birth or death date)."],
  ["Havolani o‘sha oiladagi qarindoshga yuboring — u ilovada yoki shu bot yozishmasida to‘ldiradi.", "Отправьте ссылку родственнику из этой семьи — он заполнит в приложении или в переписке с ботом.", "Send the link to a relative from that family — they can fill it in the app or in this bot chat."],
  ["📊 To‘liqlik paneli", "📊 Панель заполненности", "📊 Completeness panel"],
  ["💬 O‘zim botda to‘ldiraman", "💬 Заполню сам в боте", "💬 I'll fill it in the bot"],
  ["🔕 Eslatmani o‘chirish", "🔕 Отключить напоминание", "🔕 Turn off reminder"],
  ["🔕 Kunlik eslatma o‘chirildi.", "🔕 Ежедневное напоминание отключено.", "🔕 Daily reminder turned off."],
  ["🌳 <b>{name}</b> oilasida hali {n} kishining ma’lumoti yetishmaydi (to‘liqlik {pct}%). Bir necha daqiqa ajratib to‘ldirib bersangiz — avlodlar uchun katta xizmat bo‘ladi 🙏", "🌳 В семье <b>{name}</b> ещё не хватает данных о {n} чел. (заполнено {pct}%). Уделите пару минут — это большой вклад для потомков 🙏", "🌳 The <b>{name}</b> family still lacks data for {n} people ({pct}% complete). A few minutes of your time is a great gift to future generations 🙏"],
  ["💬 Boshladik! Har bir oila uchun savol beraman. Javobni oddiy xabar qilib yozing yoki tugmalarni bosing. Barcha maydonlar to‘ldirilishi shart — sanalarni to‘liq (kun.oy.yil) yozing.\n\nTo‘xtatish: /bekor", "💬 Начинаем! Я задам вопросы по каждой семье. Отвечайте обычным сообщением или кнопками. Все поля обязательны — даты полностью (дд.мм.гггг).\n\nОстановить: /cancel", "💬 Let's start! I'll ask about each family. Reply with a message or tap the buttons. All fields are required — full dates (dd.mm.yyyy).\n\nStop: /cancel"],
  ["Turmush o‘rtog‘i", "Супруг(а)", "Spouse"],
  ["Farzandlari", "Дети", "Children"],
  ["Hammasi to‘g‘rimi? Yetishmagan farzand yoki turmush o‘rtog‘i bo‘lsa — qo‘shing.", "Всё верно? Если не хватает ребёнка или супруга — добавьте.", "Is everything correct? Add any missing child or spouse."],
  ["✅ To‘g‘ri, keyingisi", "✅ Верно, далее", "✅ Correct, next"],
  ["➕ Farzand", "➕ Ребёнок", "➕ Child"],
  ["➕ Turmush o‘rtog‘i", "➕ Супруг(а)", "➕ Spouse"],
  ["✏️ Tuzatish", "✏️ Исправить", "✏️ Edit"],
  ["🔗 Boshqaga topshirish", "🔗 Передать другому", "🔗 Hand over"],
  ["⬅️ Orqaga", "⬅️ Назад", "⬅️ Back"],
  ["📨 Yakunlash", "📨 Завершить", "📨 Finish"],
  ["✍️ Ismini yozing:", "✍️ Напишите имя:", "✍️ Write the name:"],
  ["<b>{who}</b> — o‘g‘ilmi yoki qiz?", "<b>{who}</b> — сын или дочь?", "<b>{who}</b> — son or daughter?"],
  ["👦 O‘g‘il", "👦 Сын", "👦 Son"],
  ["👧 Qiz", "👧 Дочь", "👧 Daughter"],
  ["📅 <b>{who}</b> qachon tug‘ilgan? To‘liq sanani yozing: kun.oy.yil (masalan: 20.03.1958).", "📅 Когда родился(ась) <b>{who}</b>? Полная дата: дд.мм.гггг (например: 20.03.1958).", "📅 When was <b>{who}</b> born? Full date: dd.mm.yyyy (e.g. 20.03.1958)."],
  ["<b>{who}</b> hozir hayotmi?", "<b>{who}</b> жив(а)?", "Is <b>{who}</b> alive?"],
  ["💚 Hayot", "💚 Жив(а)", "💚 Alive"],
  ["🤲 Vafot etgan", "🤲 Умер(ла)", "🤲 Deceased"],
  ["🤲 <b>{who}</b> qachon vafot etgan? To‘liq sanani yozing: kun.oy.yil (masalan: 05.06.2001).", "🤲 Когда умер(ла) <b>{who}</b>? Полная дата: дд.мм.гггг (например: 05.06.2001).", "🤲 When did <b>{who}</b> pass away? Full date: dd.mm.yyyy (e.g. 05.06.2001)."],
  ["<b>{who}</b> — onasi/otasi kim?", "<b>{who}</b> — кто второй родитель?", "<b>{who}</b> — who is the other parent?"],
  ["To‘xtatildi. Kiritganlaringiz yuborilmadi. Qayta boshlash uchun havolani yana oching.", "Остановлено. Введённое не отправлено. Чтобы начать заново, откройте ссылку ещё раз.", "Stopped. Nothing was sent. Open the link again to restart."],
  ["Iltimos, tugmalardan birini bosing 👆", "Пожалуйста, нажмите одну из кнопок 👆", "Please tap one of the buttons 👆"],
  ["Ism bo‘sh bo‘lmasin. Qayta yozing:", "Имя не может быть пустым. Напишите снова:", "Name can't be empty. Write again:"],
  ["Sana to‘liq emas yoki noto‘g‘ri. Kun.oy.yil shaklida yozing, masalan: 20.03.1958", "Дата неполная или неверная. Пишите дд.мм.гггг, например: 20.03.1958", "Incomplete or wrong date. Use dd.mm.yyyy, e.g. 20.03.1958"],
  ["Sessiya tugagan. Havolani qayta oching.", "Сессия истекла. Откройте ссылку снова.", "Session expired. Open the link again."],
  ["👶 Farzandning ismini yozing:", "👶 Напишите имя ребёнка:", "👶 Write the child's name:"],
  ["💍 Turmush o‘rtog‘ining ismini yozing:", "💍 Напишите имя супруга(и):", "💍 Write the spouse's name:"],
  ["Kimning ma’lumotini tuzatamiz?", "Чьи данные исправить?", "Whose data should we fix?"],
  ["✍️ Ismi", "✍️ Имя", "✍️ Name"],
  ["📅 Tug‘ilgan sana", "📅 Дата рождения", "📅 Birth date"],
  ["💚 Hayot deb belgilash", "💚 Отметить живым", "💚 Mark as alive"],
  ["🤲 Vafot etgan deb belgilash", "🤲 Отметить умершим", "🤲 Mark as deceased"],
  ["🤲 Vafot sanasi", "🤲 Дата смерти", "🤲 Date of death"],
  ["🗑 O‘chirish", "🗑 Удалить", "🗑 Delete"],
  ["Avval ma’lumotlarni yuboring — yangi qo‘shilgan oilani keyin topshirish mumkin.", "Сначала отправьте данные — новую семью можно передать позже.", "Send the data first — a newly added family can be handed over later."],
  ["🔗 <b>{name}</b> oilasini shu oiladagi kishiga topshiring. Quyidagi xabarni unga yuboring (forward):", "🔗 Передайте семью <b>{name}</b> человеку из этой семьи. Перешлите ему сообщение ниже:", "🔗 Hand the <b>{name}</b> family over to someone from it. Forward them the message below:"],
  ["Assalomu alaykum! «{title}» shajarasidagi {name} oilasi ma’lumotlarini to‘ldirib bersangiz. Havola:", "Здравствуйте! Заполните, пожалуйста, данные семьи {name} в родословной «{title}». Ссылка:", "Hello! Please fill in the {name} family details in the «{title}» family tree. Link:"],
  ["Yuborishdan oldin yetishmayotgan ma’lumotni to‘ldiring:", "Перед отправкой заполните недостающие данные:", "Fill in the missing data before sending:"],
  ["Rahmat! Hamma ma’lumot to‘g‘ri ekan — o‘zgarish yo‘q.", "Спасибо! Все данные верны — изменений нет.", "Thanks! Everything is correct — no changes."],
  ["Rahmat! Ma’lumotlar yuborildi.", "Спасибо! Данные отправлены.", "Thanks! Your data has been sent."],
  ["Shajara egasi tekshirib tasdiqlagach, ular shajaraga qo‘shiladi. Natija haqida bot xabar beradi.", "После проверки владельцем они будут добавлены в родословную. Бот сообщит о результате.", "Once the owner reviews and approves, they will be added. The bot will notify you."],
  ["✖️ Bekor qilish", "✖️ Отмена", "✖️ Cancel"],
  ["🌳 <b>{title}</b>\n\nSizdan <b>{name}</b> oilasi ma’lumotlarini to‘ldirib berish so‘ralmoqda: ismlar, tug‘ilgan sanalar, turmush o‘rtoqlari va farzandlari. Bu 5–10 daqiqa oladi.\n\nIlovada (savol-javob shaklida) yoki shu yerda bot bilan yozishib to‘ldirishingiz mumkin 👇", "🌳 <b>{title}</b>\n\nВас просят заполнить данные семьи <b>{name}</b>: имена, даты рождения, супруги и дети. Это займёт 5–10 минут.\n\nМожно заполнить в приложении (вопрос-ответ) или прямо здесь, в переписке с ботом 👇", "🌳 <b>{title}</b>\n\nYou're asked to fill in the <b>{name}</b> family details: names, birth dates, spouses and children. It takes 5–10 minutes.\n\nYou can fill it in the app (step by step) or right here in chat with the bot 👇"],
  ["❤️ <b>{who}</b> «{album}» albomidagi faylingizni yoqtirdi", "❤️ <b>{who}</b> нравится ваш файл в альбоме «{album}»", "❤️ <b>{who}</b> liked your file in the «{album}» album"],
  ["💬 <b>{who}</b> «{album}» albomidagi faylingizga izoh yozdi:\n{text}", "💬 <b>{who}</b> прокомментировал(а) ваш файл в альбоме «{album}»:\n{text}", "💬 <b>{who}</b> commented on your file in the «{album}» album:\n{text}"],
  ["↩️ <b>{who}</b> izohingizga javob yozdi:\n{text}", "↩️ <b>{who}</b> ответил(а) на ваш комментарий:\n{text}", "↩️ <b>{who}</b> replied to your comment:\n{text}"],
  ["❤️ <b>{who}</b> izohingizni yoqtirdi", "❤️ <b>{who}</b> нравится ваш комментарий", "❤️ <b>{who}</b> liked your comment"],
  ["👀 Ko‘rish", "👀 Смотреть", "👀 View"],
  ["💬 Bugun {albums} albomlaridagi fayllarga <b>{n} ta</b> izoh yozildi", "💬 Сегодня к файлам альбомов {albums} написано комментариев: <b>{n}</b>", "💬 Today <b>{n}</b> comments were written on files in the {albums} albums"],
  ["🔔 Bildirishnomalarni ko‘rish uchun pastdagi tugmani bosing 👇", "🔔 Нажмите кнопку ниже, чтобы посмотреть уведомления 👇", "🔔 Tap the button below to see notifications 👇"],
  ["💍 Turmush o‘rtog‘ining ism va familiyasini yozing (masalan: Xadicha Rahimova):", "💍 Напишите имя и фамилию супруга(и) (например: Хадича Рахимова):", "💍 Enter the spouse's first and last name (e.g. Khadicha Rakhimova):"],
  ["✍️ Ism va familiyasini yozing (masalan: Xadicha Rahimova):", "✍️ Напишите имя и фамилию (например: Хадича Рахимова):", "✍️ Enter first and last name (e.g. Khadicha Rakhimova):"],
  ["✍️ <b>{who}</b> — familiyasi ham kerak. Ism va familiyasini to‘liq yozing (masalan: Xadicha Rahimova):", "✍️ <b>{who}</b> — нужна и фамилия. Напишите имя и фамилию (например: Хадича Рахимова):", "✍️ <b>{who}</b> — the last name is needed too. Enter first and last name (e.g. Khadicha Rakhimova):"],
  ["Turmush o‘rtog‘ining familiyasi ham yozilishi shart. Ism va familiyasini yozing (masalan: Xadicha Rahimova):", "Фамилия супруга(и) обязательна. Напишите имя и фамилию (например: Хадича Рахимова):", "The spouse's last name is required. Enter first and last name (e.g. Khadicha Rakhimova):"],
  ["🔗 <b>{name}</b> oilasini shu oiladagi kishiga topshiring. Pastdagi tugmani bosib, kimga yuborishni tanlang 👇", "🔗 Передайте семью <b>{name}</b> человеку из этой семьи. Нажмите кнопку ниже и выберите, кому отправить 👇", "🔗 Hand the <b>{name}</b> family to someone in it. Tap the button below and choose who to send it to 👇"],
  ["📤 Kimga yuborishni tanlash", "📤 Выбрать, кому отправить", "📤 Choose who to send to"],
]) { RU[k] = r; EN[k] = e; }
