/**
 * Ilova qo'ng'irog'idagi ovozli xabarlar. Admin botga ovozli xabar yoki audio fayl yuboradi
 * (Telegram file_id saqlanadi), faolini tanlaydi; ilova faol ovozni yuklab olib eshittiradi.
 */
import crypto from 'node:crypto';
import prisma, { isDatabaseReady } from '../database/connection.js';
import { getBot } from '../core/bot.js';

const KEY = 'appVoices';
let state = null; // { activeId, items: [{ id, name, fileId, kind, mime, duration, createdAt }] }
const files = new Map(); // id → { buffer, type } (Telegram'dan bir marta yuklanadi)

async function load() {
  if (state) return state;
  try {
    const row = isDatabaseReady() ? await prisma.setting.findUnique({ where: { key: KEY } }) : null;
    state = { activeId: row?.value?.activeId || null, items: row?.value?.items || [] };
  } catch {
    state = { activeId: null, items: [] };
  }
  return state;
}

async function save() {
  const value = { activeId: state.activeId, items: state.items };
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export async function listVoices() {
  return load();
}

export async function findVoice(id) {
  return (await load()).items.find((item) => item.id === id) || null;
}

export async function addVoice({ fileId, name, kind, mime, duration }) {
  await load();
  const item = { id: crypto.randomBytes(4).toString('hex'), fileId, name, kind, mime, duration: duration || null, createdAt: new Date().toISOString() };
  state.items.push(item);
  await save();
  return item;
}

/** id = null — ilovaning o'zidagi standart ovoz */
export async function setActiveVoice(id) {
  await load();
  state.activeId = id && state.items.some((item) => item.id === id) ? id : null;
  await save();
  return state.activeId;
}

export async function removeVoice(id) {
  await load();
  state.items = state.items.filter((item) => item.id !== id);
  if (state.activeId === id) state.activeId = null;
  files.delete(id);
  await save();
}

export async function activeVoice() {
  const current = await load();
  return current.items.find((item) => item.id === current.activeId) || null;
}

/** Ovoz fayli (ilova yuklab olishi uchun) */
export async function voiceFile(id) {
  if (files.has(id)) return files.get(id);
  const item = await findVoice(id);
  const bot = getBot();
  if (!item || !bot) return null;
  const link = await bot.telegram.getFileLink(item.fileId);
  const res = await fetch(link.href, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Telegram fayl: HTTP ${res.status}`);
  const entry = { buffer: Buffer.from(await res.arrayBuffer()), type: item.mime || 'audio/ogg' };
  files.set(id, entry);
  return entry;
}

export default { listVoices, findVoice, addVoice, setActiveVoice, removeVoice, activeVoice, voiceFile };
