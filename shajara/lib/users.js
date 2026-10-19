// Telegram foydalanuvchisi hujjati: til, faol shajara, kutilayotgan albom yuklamasi, xato urinishlar.
import { readJson, writeJson, updateJson } from './store.js';
import { normLang } from './i18n.js';

const key = (uid) => `users/${uid}.json`;

export async function getUser(uid) {
  return (await readJson(key(uid)))?.data || null;
}

/** Hujjatni o'zgartirish (yo'q bo'lsa yaratadi). fn qaytargan qiymat natija sifatida qaytadi. */
export async function updateUser(uid, from, fn) {
  const existing = await readJson(key(uid));
  if (!existing) {
    const doc = { id: uid, name: from?.first_name || '', lang: normLang(from?.language_code), trees: {}, active: null, pending: null };
    const result = await fn(doc);
    try {
      await writeJson(key(uid), doc, null);
      return { doc, result };
    } catch {
      /* parallel yaratilgan — quyida yangilaymiz */
    }
  }
  const r = await updateJson(key(uid), fn);
  return { doc: r?.data, result: r?.result };
}

export async function userLang(uid, from) {
  const u = await getUser(uid);
  return u?.lang || normLang(from?.language_code);
}
