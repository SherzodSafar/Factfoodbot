/**
 * Kuzatuvlar ro'yxatiga ta'sir qiluvchi o'zgarishlar hisoblagichi.
 *
 * Kuzatuv xizmati faol kuzatuvlarni xotirada saqlaydi va bazadan faqat shu
 * hisoblagich o'zgarganda qayta o'qiydi. Kuzatuv yoki foydalanuvchi yozuvini
 * o'zgartiradigan har bir model metodi markWatchesChanged() ni chaqiradi.
 */
let version = 0;

export function markWatchesChanged() {
  version += 1;
}

export function watchesVersion() {
  return version;
}
