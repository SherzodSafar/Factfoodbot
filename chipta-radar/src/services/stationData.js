/**
 * Boshlang'ich stansiyalar ro'yxati (bazaga seed orqali yoziladi).
 *
 * Kodlar eticket.railway.uz ning o'z stansiyalar ma'lumotnomasi bo'yicha
 * tekshirilgan. Noto'g'ri kod jimgina boshqa yo'nalishni qidirib qo'yadi,
 * shuning uchun bu yerga faqat tasdiqlangan kodlar kiritilgan.
 * Yangi stansiyani Admin Panel → Stansiyalar bo'limidan qo'shish mumkin.
 */
export const STATIONS = [
  {
    code: '2900000', nameUz: 'Toshkent', nameRu: 'Ташкент', nameEn: 'Tashkent', region: 'Toshkent',
    aliases: ['Тошкент', 'Tashkent', 'Toshkent shimoliy', 'Toshkent markaziy'], isPopular: true, sortOrder: 1,
  },
  {
    code: '2900700', nameUz: 'Samarqand', nameRu: 'Самарканд', nameEn: 'Samarkand', region: 'Samarqand',
    aliases: ['Самарқанд', 'Samarkand'], isPopular: true, sortOrder: 2,
  },
  {
    code: '2900800', nameUz: 'Buxoro', nameRu: 'Бухара', nameEn: 'Bukhara', region: 'Buxoro',
    aliases: ['Бухоро', 'Bukhara', 'Buhoro', 'Buxara'], isPopular: true, sortOrder: 3,
  },
  {
    code: '2900172', nameUz: 'Xiva', nameRu: 'Хива', nameEn: 'Khiva', region: 'Xorazm',
    aliases: ['Хива', 'Khiva', 'Hiva'], isPopular: true, sortOrder: 4,
  },
  {
    code: '2900790', nameUz: 'Urganch', nameRu: 'Ургенч', nameEn: 'Urgench', region: 'Xorazm',
    aliases: ['Урганч', 'Urgench', 'Urgentch'], isPopular: true, sortOrder: 5,
  },
  {
    code: '2900680', nameUz: 'Andijon', nameRu: 'Андижан', nameEn: 'Andijan', region: 'Andijon',
    aliases: ['Андижон', 'Andijan'], isPopular: true, sortOrder: 6,
  },
  {
    code: '2900940', nameUz: 'Namangan', nameRu: 'Наманган', nameEn: 'Namangan', region: 'Namangan',
    aliases: ['Наманган'], isPopular: true, sortOrder: 7,
  },
  {
    code: '2900920', nameUz: 'Marg\'ilon', nameRu: 'Маргилан', nameEn: 'Margilan', region: 'Farg\'ona',
    aliases: ['Марғилон', 'Margilan', 'Margilon', 'Fargona', 'Фергана', 'Farg\'ona'], isPopular: true, sortOrder: 8,
  },
  {
    code: '2900880', nameUz: 'Qo\'qon', nameRu: 'Коканд', nameEn: 'Kokand', region: 'Farg\'ona',
    aliases: ['Қўқон', 'Kokand', 'Qoqon', 'Kokon'], isPopular: true, sortOrder: 9,
  },
  {
    code: '2900750', nameUz: 'Qarshi', nameRu: 'Карши', nameEn: 'Karshi', region: 'Qashqadaryo',
    aliases: ['Қарши', 'Karshi'], isPopular: true, sortOrder: 10,
  },
  {
    code: '2900255', nameUz: 'Termiz', nameRu: 'Термез', nameEn: 'Termez', region: 'Surxondaryo',
    aliases: ['Термиз', 'Termez'], isPopular: true, sortOrder: 11,
  },
  {
    code: '2900930', nameUz: 'Navoiy', nameRu: 'Навои', nameEn: 'Navoi', region: 'Navoiy',
    aliases: ['Навоий', 'Navoi'], isPopular: true, sortOrder: 12,
  },
  {
    code: '2900970', nameUz: 'Nukus', nameRu: 'Нукус', nameEn: 'Nukus', region: 'Qoraqalpog\'iston',
    aliases: ['Нукус'], isPopular: true, sortOrder: 13,
  },
  {
    code: '2900720', nameUz: 'Jizzax', nameRu: 'Джизак', nameEn: 'Jizzakh', region: 'Jizzax',
    aliases: ['Жиззах', 'Jizzakh', 'Djizak', 'Jizzah'], isPopular: true, sortOrder: 14,
  },
  {
    code: '2900850', nameUz: 'Guliston', nameRu: 'Гулистан', nameEn: 'Gulistan', region: 'Sirdaryo',
    aliases: ['Гулистон', 'Gulistan'], isPopular: false, sortOrder: 15,
  },
  {
    code: '2900780', nameUz: 'Denov', nameRu: 'Денау', nameEn: 'Denau', region: 'Surxondaryo',
    aliases: ['Денов', 'Denau'], isPopular: false, sortOrder: 16,
  },
  {
    code: '2900693', nameUz: 'Pop', nameRu: 'Пап', nameEn: 'Pap', region: 'Namangan',
    aliases: ['Поп', 'Pap'], isPopular: false, sortOrder: 17,
  },
  {
    code: '2900001', nameUz: 'Toshkent (Markaziy vokzal)', nameRu: 'Ташкент Центральный', nameEn: 'Tashkent Central', region: 'Toshkent',
    aliases: ['Toshkent markaziy vokzal', 'Tashkent central', 'Ташкент центральный'], isPopular: false, sortOrder: 18,
  },
  {
    code: '2900002', nameUz: 'Toshkent (Janubiy vokzal)', nameRu: 'Ташкент Южный', nameEn: 'Tashkent South', region: 'Toshkent',
    aliases: ['Toshkent janubiy', 'Tashkent south', 'Ташкент южный', 'Тошкент жанубий'], isPopular: false, sortOrder: 19,
  },
];

/** Tez tanlash uchun mashhur yo'nalishlar */
export const POPULAR_ROUTES = [
  ['2900000', '2900700'],
  ['2900000', '2900800'],
  ['2900000', '2900172'],
  ['2900000', '2900790'],
  ['2900000', '2900680'],
  ['2900000', '2900940'],
  ['2900000', '2900750'],
  ['2900000', '2900255'],
  ['2900700', '2900000'],
  ['2900800', '2900000'],
  ['2900000', '2900970'],
  ['2900000', '2900920'],
];

export default { STATIONS, POPULAR_ROUTES };
