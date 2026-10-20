// Bot xabarlari uchun tarjimalar. Kalit — o'zbekcha (lotin) matn; kirill avtomatik.
import { toCyrillic } from '../public/js/translit.js';

export const LANGS = ['uz', 'uzc', 'ru', 'en'];

const RU = {
  'Assalomu alaykum, <b>{name}</b>! 🌿': 'Ассаламу алейкум, <b>{name}</b>! 🌿',
  '<b>Shajara iBot</b> — oilangiz shajarasini qurish, saqlash va avlodlarga yetkazish uchun.':
    '<b>Shajara iBot</b> — чтобы построить, сохранить и передать потомкам родословную вашей семьи.',
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
  '<b>Shajara iBot</b> — oilangiz shajarasini qurish, saqlash va avlodlarga yetkazish uchun.':
    '<b>Shajara iBot</b> — build, keep and pass on your family tree.',
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
  ['AI ro‘yxat (fayldan)', 'AI-список (из файла)', 'AI list (from file)'],
  ['AI yordamchiga savol', 'Вопрос AI-помощнику', 'Ask the AI assistant'],
]) { RU[k] = r; EN[k] = e; }

export function t(lang, key, vars = {}) {
  let s = key === 'HELP' ? UZ_HELP : key === 'AI_IMPORT_HELP' ? UZ_AI : key;
  if (lang === 'ru') s = RU[key] || s;
  else if (lang === 'en') s = EN[key] || s;
  else if (lang === 'uzc') s = toCyrillic(s);
  return s.replace(/\{(\w+)\}/g, (_, k) => (lang === 'uzc' ? toCyrillic(vars[k] ?? '') : (vars[k] ?? '')));
}
