import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

const TIMEOUT_MS = 30_000; // bitta model uchun; javob kelmasa keyingisiga o'tamiz

let _ai = null;
const ai = () =>
  (_ai ??= new GoogleGenAI({
    apiKey: config.geminiKey,
    // v1beta — preview modellar ham ishlashi uchun. Qayta urinishni o'zimiz boshqaramiz.
    httpOptions: { apiVersion: 'v1beta', timeout: TIMEOUT_MS, retryOptions: { attempts: 1 } },
  }));

/** Barcha modellar band yoki limit tugaganda tashlanadi. */
export class AiBusyError extends Error {
  constructor(quota) {
    super(quota ? 'Gemini limiti tugagan' : 'Gemini modellari band');
    this.quota = quota;
  }
}

const cooldown = new Map(); // model -> qaysi vaqtgacha navbat oxiriga suriladi
const BUSY = new Set([429, 500, 502, 503, 504]);

/**
 * Gemini'ga so'rov. Model band (503), javob bermasa (504/timeout) yoki limit tugagan (429) bo'lsa,
 * kutib o'tirmasdan navbatdagi modelga o'tadi.
 * @param {{parts: object[], system?: string, json?: object, thinking?: 'MINIMAL'|'LOW'|'MEDIUM'|'HIGH'}} p
 * @returns {Promise<{text: string, model: string, response: any}>}
 */
export async function generate({ parts, system, json, thinking }) {
  const request = {
    contents: [{ role: 'user', parts }],
    config: {
      ...(system && { systemInstruction: system }),
      ...(json && { responseMimeType: 'application/json', responseJsonSchema: json }),
      ...(thinking && { thinkingConfig: { thinkingLevel: thinking } }),
    },
  };

  // Yaqinda band bo'lgan modellar navbat oxiriga suriladi (qolgan tartib saqlanadi)
  const now = Date.now();
  const cooled = (m) => (cooldown.get(m) || 0) > now;
  const models = [...config.models].sort((a, b) => cooled(a) - cooled(b));

  let lastErr = null;
  let quotaHit = false;
  let busyOnly = true;
  for (const model of models) {
    try {
      const response = await ai().models.generateContent({ model, ...request });
      return { text: response.text ?? '', model, response };
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      console.warn(`Gemini ${model}: ${status ?? err?.name ?? ''} ${String(err?.message).slice(0, 140)}`);
      if (status === 429) {
        quotaHit = true;
        cooldown.set(model, Date.now() + 90_000);
      } else if (status === undefined || status >= 500) {
        // band yoki javob bermadi (timeout) — bir muddat chetga suramiz
        cooldown.set(model, Date.now() + (status === 503 ? 60_000 : 120_000));
      } else {
        // 400/403/404 — bu model so'rovni qabul qilmadi
        busyOnly = false;
        if (status === 404) cooldown.set(model, Date.now() + 3_600_000);
      }
    }
  }
  if (busyOnly && (lastErr?.status === undefined || BUSY.has(lastErr.status))) {
    throw new AiBusyError(quotaHit);
  }
  throw lastErr;
}

/** JSON javobni xavfsiz o'qiydi (```json ... ``` o'ramini ham tushunadi). */
export function parseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
