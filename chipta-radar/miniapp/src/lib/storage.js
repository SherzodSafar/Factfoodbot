/** localStorage ustidan xavfsiz qatlam (o'chirilgan bo'lsa ham xato bermaydi) */

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* xotira to'la yoki o'chirilgan */
  }
}

export const KEYS = {
  onboarded: 'chipta_onboarded',
  lastRoute: 'chipta_last_route',
  recent: 'chipta_recent_routes',
};
