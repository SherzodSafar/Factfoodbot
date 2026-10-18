// Telegram Bot API bilan ishlash (kutubxonasiz, oddiy fetch).
const API = () => `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

export async function tg(method, body) {
  const r = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({ ok: false }));
  if (!j.ok) console.error('Telegram xatosi', method, j.description);
  return j;
}

export async function sendDocument(chatId, filename, buffer, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('document', new Blob([buffer], { type: 'application/json' }), filename);
  const r = await fetch(`${API()}/sendDocument`, { method: 'POST', body: form });
  return r.json();
}
