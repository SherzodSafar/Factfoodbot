/**
 * "Kuzatuv qo'shish" sehrgari — foydalanuvchining joriy holati (xotirada).
 *
 * Bot bitta Render nusxasida ishlaydi, shuning uchun holat xotirada saqlanadi.
 * Har bir foydalanuvchi uchun bitta sehrgar sessiyasi; 20 daqiqadan keyin eskiradi.
 */
const sessions = new Map();
const TTL_MS = 20 * 60 * 1000;

/** Sehrgar bosqichlari ketma-ketligi (vagon turiga qarab o'zgaradi) */
export function stepOrder(session) {
  const steps = ['from', 'to', 'date', 'car'];
  if (session.carType === 'platskart') steps.push('section', 'berth');
  else if (session.carType === 'kupe') steps.push('berth');
  steps.push('qty');
  if (isExact(session) && (session.quantity || 1) > 1) steps.push('together');
  steps.push('confirm');
  return steps;
}

/** Aniq joy (EXACT) rejimimi — qism yoki qavat tanlangan bo'lsa */
export function isExact(session) {
  return (session.section && session.section !== 'any') || (session.berth && session.berth !== 'any');
}

export function getSession(id) {
  const key = String(id);
  const session = sessions.get(key);
  if (!session) return null;
  if (Date.now() - session.at > TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return session;
}

export function startSession(id) {
  const session = { step: 'from', at: Date.now() };
  sessions.set(String(id), session);
  return session;
}

export function patchSession(id, patch) {
  const session = getSession(id) || startSession(id);
  Object.assign(session, patch, { at: Date.now() });
  sessions.set(String(id), session);
  return session;
}

export function clearSession(id) {
  sessions.delete(String(id));
}

/** Bir bosqich orqaga qaytarish: joriy bosqich maydonini tozalab, oldingisiga o'tadi */
export function goBack(id) {
  const session = getSession(id);
  if (!session) return null;
  const order = stepOrder(session);
  const index = order.indexOf(session.step);
  if (index <= 0) return session;
  const previous = order[index - 1];
  // Oldingi bosqichda tanlangan qiymatni tozalaymiz
  const clear = { from: 'fromCode', to: 'toCode', date: 'date', car: 'carType', section: 'section', berth: 'berth', qty: 'quantity', together: 'together' };
  if (clear[previous]) delete session[clear[previous]];
  session.step = previous;
  session.at = Date.now();
  return session;
}

export default { stepOrder, isExact, getSession, startSession, patchSession, clearSession, goBack };
