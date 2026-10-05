/**
 * Inline matn-kiritish oqimlari holati (xotirada) — akkaunt ulash, yo'lovchi qo'shish,
 * to'lov telefoni va avto-bron sozlamalari uchun.
 *
 * "wizard" (botWizard.js) faqat kuzatuv qo'shish uchun. Bu modul boshqa barcha
 * bosqichma-bosqich inline oqimlar uchun — ular foydalanuvchidan matn kutadi.
 * Har bir foydalanuvchida bir vaqtda bitta faol oqim; 15 daqiqada eskiradi.
 */
const flows = new Map();
const TTL_MS = 15 * 60 * 1000;

/** Joriy oqim (eskirgan bo'lsa — null) */
export function getFlow(id) {
  const flow = flows.get(String(id));
  if (!flow) return null;
  if (Date.now() - flow.at > TTL_MS) {
    flows.delete(String(id));
    return null;
  }
  return flow;
}

/** Oqim boshlash: type ('acc'|'pass'|'payphone'), boshlang'ich step va data */
export function startFlow(id, type, step, data = {}) {
  const flow = { type, step, data, at: Date.now() };
  flows.set(String(id), flow);
  return flow;
}

export function patchFlow(id, patch) {
  const flow = getFlow(id);
  if (!flow) return null;
  const data = patch.data ? { ...flow.data, ...patch.data } : flow.data;
  Object.assign(flow, patch, { data, at: Date.now() });
  flows.set(String(id), flow);
  return flow;
}

export function clearFlow(id) {
  flows.delete(String(id));
}

export default { getFlow, startFlow, patchFlow, clearFlow };
