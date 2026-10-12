/**
 * Uzun bot matnlari to'liq tarjimasi bilan (bo'lak-bo'lak tarjima qilinmaydi).
 * Kod o'zbekcha (uz) matnni yuboradi — tarjima qatlami uni foydalanuvchi tiliga almashtiradi.
 */
export const TEXTS = {
  welcome: {
    uz: '🚉 <b>Temir yo\'l chiptasi kuzatuvchi botiga xush kelibsiz!</b>\n\n'
      + 'Men siz uchun belgilangan yo\'nalishda bo\'sh joy paydo bo\'lishini doimiy kuzataman va topilishi bilan darrov xabar beraman.\n\n'
      + 'Quyidagi menyudan tanlang 👇',
    ru: '🚉 <b>Добро пожаловать в бот отслеживания ж/д билетов!</b>\n\n'
      + 'Я постоянно слежу за появлением свободных мест на выбранном вами направлении и сразу сообщу, как только они появятся.\n\n'
      + 'Выберите в меню ниже 👇',
    en: '🚉 <b>Welcome to the train ticket tracker bot!</b>\n\n'
      + 'I keep watching for free seats on the route you choose and notify you the moment they appear.\n\n'
      + 'Choose from the menu below 👇',
  },
  help: {
    uz: '<b>ℹ️ Yordam — bot qanday ishlaydi</b>\n\n'
      + '🔔 <b>Bot nima qiladi?</b>\n'
      + 'Kerakli poyezdga chipta qolmagan bo\'lsa — kuzatuvga qo\'yasiz. Bo\'sh joy chiqishi bilan bot darhol xabar beradi.\n\n'
      + '➕ <b>Kuzatuv qo\'shish</b> — avval <b>🇺🇿 Mahalliy</b> yoki <b>🌍 Xorijiy</b> yo\'nalishni tanlaysiz, keyin 3 qadam:\n'
      + '1️⃣ Qayerdan → qayerga\n'
      + '2️⃣ Sana\n'
      + '3️⃣ Vagon turi — <b>bir nechtasini</b> belgilash mumkin, har birining yonida shu yo\'nalishdagi narx ko\'rinadi.\n'
      + '🚃 <i>Umumiy — eng arzon vagon: o\'tirib ketiladi, choyshab berilmaydi.</i>\n'
      + '🎯 Faqat Plaskart yoki Kupe tanlasangiz — pastki/yuqori, to\'rttalik/bokovoy joyni ham aniq kuzatish mumkin.\n'
      + '🌍 <b>Xorijiy</b> — Qozog\'iston poyezdlari (Olmaota, Taroz, Shimkent ↔ Toshkent). Narxlar tengeda, chipta bilet.railways.kz saytida sotiladi.\n\n'
      + '📋 <b>Kuzatuvlarim</b> — to\'xtatish, davom ettirish, darhol tekshirish yoki o\'chirish.\n'
      + '🚆 <b>Poyezd narxlari</b> — mashhur yo\'nalishlar (borish va qaytish) bo\'yicha bugungi poyezdlar, vaqt va narxlar.\n'
      + '📱 <b>Qo\'ng\'iroq ilovasi</b> — chipta chiqqanda telefoningizga qo\'ng\'iroq qiladi.\n'
      + '🌐 <b>Til</b> — /lang (O\'zbekcha, Ўзбекча, Русский, English).\n\n'
      + '⚡️ <b>Tezkor qidiruv</b> — shunchaki yozing:\n'
      + '• <code>Toshkent Samarqand ertaga</code>\n'
      + '• <code>Andijon Toshkent 25.10</code>\n\n'
      + '🎫 <b>Chipta qanday olinadi?</b>\n'
      + 'Bot chipta sotmaydi. Joy chiqqanda xabardagi <b>«🎫 Sotib olish»</b> tugmasini bosing — '
      + 'rasmiy saytda yo\'lovchi ma\'lumotini kiritib to\'laysiz. Tez harakat qiling: bo\'sh joylar tez tugaydi!',
    ru: '<b>ℹ️ Помощь — как работает бот</b>\n\n'
      + '🔔 <b>Что делает бот?</b>\n'
      + 'Если на нужный поезд не осталось билетов — поставьте его на отслеживание. Как только появится свободное место, бот сразу сообщит.\n\n'
      + '➕ <b>Добавить отслеживание</b> — сначала выберите <b>🇺🇿 Внутренние</b> или <b>🌍 Международные</b> направления, затем 3 шага:\n'
      + '1️⃣ Откуда → куда\n'
      + '2️⃣ Дата\n'
      + '3️⃣ Тип вагона — можно отметить <b>несколько</b>, рядом с каждым видна цена на этом направлении.\n'
      + '🚃 <i>Общий — самый дешёвый вагон: места сидячие, бельё не выдаётся.</i>\n'
      + '🎯 Если выбрать только Плацкарт или Купе — можно отслеживать и конкретные места: нижние/верхние, основные/боковые.\n'
      + '🌍 <b>Международные</b> — поезда Казахстана (Алматы, Тараз, Шымкент ↔ Ташкент). Цены в тенге, билеты продаются на сайте bilet.railways.kz.\n\n'
      + '📋 <b>Мои отслеживания</b> — приостановить, возобновить, проверить сейчас или удалить.\n'
      + '🚆 <b>Цены на поезда</b> — сегодняшние поезда, время и цены по популярным направлениям (туда и обратно).\n'
      + '📱 <b>Приложение-звонок</b> — звонит на телефон, когда появляются билеты.\n'
      + '🌐 <b>Язык</b> — /lang (O\'zbekcha, Ўзбекча, Русский, English).\n\n'
      + '⚡️ <b>Быстрый поиск</b> — просто напишите:\n'
      + '• <code>Ташкент Самарканд завтра</code>\n'
      + '• <code>Андижан Ташкент 25.10</code>\n\n'
      + '🎫 <b>Как купить билет?</b>\n'
      + 'Бот не продаёт билеты. Когда появятся места, нажмите в сообщении кнопку <b>«🎫 Купить»</b> — '
      + 'на официальном сайте введите данные пассажира и оплатите. Действуйте быстро: свободные места быстро заканчиваются!',
    en: '<b>ℹ️ Help — how the bot works</b>\n\n'
      + '🔔 <b>What does the bot do?</b>\n'
      + 'If the train you need is sold out, set up an alert. As soon as a seat becomes free, the bot notifies you right away.\n\n'
      + '➕ <b>Add alert</b> — first choose <b>🇺🇿 Domestic</b> or <b>🌍 International</b> routes, then 3 steps:\n'
      + '1️⃣ From → to\n'
      + '2️⃣ Date\n'
      + '3️⃣ Car type — you can pick <b>several</b>; each one shows the price on this route.\n'
      + '🚃 <i>General — the cheapest car: seats only, no bedding.</i>\n'
      + '🎯 If you pick only Platskart or Compartment, you can also watch for exact berths: lower/upper, main/side.\n'
      + '🌍 <b>International</b> — Kazakhstan trains (Almaty, Taraz, Shymkent ↔ Tashkent). Prices in tenge; tickets are sold on bilet.railways.kz.\n\n'
      + '📋 <b>My alerts</b> — pause, resume, check now or delete.\n'
      + '🚆 <b>Train prices</b> — today\'s trains, times and prices on popular routes (both directions).\n'
      + '📱 <b>Call app</b> — rings your phone when tickets appear.\n'
      + '🌐 <b>Language</b> — /lang (O\'zbekcha, Ўзбекча, Русский, English).\n\n'
      + '⚡️ <b>Quick search</b> — just type:\n'
      + '• <code>Tashkent Samarkand tomorrow</code>\n'
      + '• <code>Andijan Tashkent 25.10</code>\n\n'
      + '🎫 <b>How do I buy a ticket?</b>\n'
      + 'The bot doesn\'t sell tickets. When seats appear, tap <b>«🎫 Buy»</b> in the message — '
      + 'enter the passenger details and pay on the official site. Be quick: free seats sell out fast!',
  },
  referral: {
    uz: '👥 <b>Do\'stlaringizni taklif qiling</b>\n\n'
      + 'Chipta topishda qiynalayotgan tanishlaringizga shu botni ulashing — ularga ham joy chiqishi bilan xabar beraman.',
    ru: '👥 <b>Пригласите друзей</b>\n\n'
      + 'Поделитесь ботом со знакомыми, которым трудно достать билеты, — им я тоже сообщу, как только появятся места.',
    en: '👥 <b>Invite your friends</b>\n\n'
      + 'Share this bot with friends who struggle to get tickets — I\'ll notify them too as soon as seats appear.',
  },
  appHead: {
    uz: '📱 <b>Chipta Radar ilovasi</b>\n\n'
      + 'Chipta chiqqanda telefoningizga <b>qo\'ng\'iroq</b> qiladi va SMS kabi xabar chiqaradi — Telegram yopiq bo\'lsa ham. '
      + 'Qo\'ng\'iroqni ko\'targaningizda ovozli xabar eshitiladi.\n\n'
      + '1️⃣ Ilovani yuklab olib o\'rnating (telefon ruxsat so\'rasa — «Ruxsat berish»).\n'
      + '2️⃣ Ilovaga shu kodni kiriting:',
    ru: '📱 <b>Приложение Chipta Radar</b>\n\n'
      + 'Когда появятся билеты, оно <b>позвонит</b> на ваш телефон и покажет уведомление как SMS — даже если Telegram закрыт. '
      + 'Ответив на звонок, вы услышите голосовое сообщение.\n\n'
      + '1️⃣ Скачайте и установите приложение (если телефон спросит — «Разрешить»).\n'
      + '2️⃣ Введите в приложении этот код:',
    en: '📱 <b>Chipta Radar app</b>\n\n'
      + 'When tickets appear, it <b>calls</b> your phone and shows an SMS-like notification — even if Telegram is closed. '
      + 'Answer the call to hear a voice message.\n\n'
      + '1️⃣ Download and install the app (if your phone asks, tap «Allow»).\n'
      + '2️⃣ Enter this code in the app:',
  },
  appTail: {
    uz: '(15 daqiqa amal qiladi)\n'
      + '3️⃣ Ilovadagi ruxsatlarni yoqing va «📞 Sinov qo\'ng\'irog\'i»ni bosib tekshiring.',
    ru: '(действует 15 минут)\n'
      + '3️⃣ Включите разрешения в приложении и проверьте кнопкой «📞 Тестовый звонок».',
    en: '(valid for 15 minutes)\n'
      + '3️⃣ Turn on the permissions in the app and tap «📞 Test call» to check.',
  },
};

/** Bot profili (Telegram ilovasi tiliga qarab ko'rinadi) */
export const PROFILE = {
  uz: {
    commands: [
      { command: 'start', description: 'Asosiy menyu' },
      { command: 'watches', description: 'Mening kuzatuvlarim' },
      { command: 'lang', description: 'Til · Язык · Language' },
      { command: 'help', description: 'Yordam' },
    ],
    short: 'Poyezd chiptalari: bo\'sh joylar, kuzatuv va aniq joy buyurtmasi 🚆',
    description: 'Chipta Radar — O\'zbekiston temir yo\'llari chiptalari yordamchisi.\n\n'
      + '🔍 Hozir qaysi poyezdda, qaysi vagonda qancha bo\'sh joy borligini ko\'rsatadi\n'
      + '🔔 Chipta yo\'q bo\'lsa — joy chiqishi bilan xabar beradi\n'
      + '🎯 Aniq joyni kuzatadi: kupe yoki bokovoy, pastki yoki yuqori, hammasi bitta joyda',
  },
  ru: {
    commands: [
      { command: 'start', description: 'Главное меню' },
      { command: 'watches', description: 'Мои отслеживания' },
      { command: 'lang', description: 'Til · Язык · Language' },
      { command: 'help', description: 'Помощь' },
    ],
    short: 'Ж/д билеты: свободные места, отслеживание и точный выбор мест 🚆',
    description: 'Chipta Radar — помощник по билетам железных дорог Узбекистана.\n\n'
      + '🔍 Показывает, сколько свободных мест в каком поезде и вагоне прямо сейчас\n'
      + '🔔 Нет билетов — сообщит, как только появятся места\n'
      + '🎯 Следит за конкретными местами: купе или боковые, нижние или верхние, все вместе',
  },
  en: {
    commands: [
      { command: 'start', description: 'Main menu' },
      { command: 'watches', description: 'My alerts' },
      { command: 'lang', description: 'Til · Язык · Language' },
      { command: 'help', description: 'Help' },
    ],
    short: 'Train tickets in Uzbekistan: free seats, alerts and exact seat tracking 🚆',
    description: 'Chipta Radar — your helper for Uzbekistan railway tickets.\n\n'
      + '🔍 Shows how many free seats each train and car has right now\n'
      + '🔔 Sold out? Get notified as soon as seats appear\n'
      + '🎯 Tracks exact seats: compartment or side, lower or upper, all together',
  },
};

export default { TEXTS, PROFILE };
