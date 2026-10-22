// Ovozli suhbat (shox to'ldirish): savollar ovozli xabar bo'lib boradi (Gemini TTS → MP3),
// ovozli javob esa Gemini orqali tushuniladi (ha/yo'q/bilmayman/qiymat).
import { Mp3Encoder } from '@breezystack/lamejs';
import { tgUpload } from './telegram.js';

const TTS_MODELS = () => [...new Set([process.env.GEMINI_TTS_MODEL, 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts', 'gemini-2.5-pro-preview-tts'].filter(Boolean))];
let ttsModel = null;
export const ttsInfo = () => ttsModel;

const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu, '').replace(/·\s*\d+\/\d+/g, '').replace(/\s+/g, ' ').trim();

const STYLE = {
  uz: 'Say in Uzbek, warmly and slowly, like talking to an elderly relative: ',
  uzc: 'Say in Uzbek, warmly and slowly, like talking to an elderly relative: ',
  ru: 'Скажи по-русски тепло и не спеша, как пожилому родственнику: ',
  en: 'Say warmly and slowly, like talking to an elderly relative: ',
};

/** Matnni ovozga aylantirish: MP3 bufer yoki null (kalit yo'q / model ishlamadi). */
export async function tts(text, lang = 'uz') {
  const key = process.env.GEMINI_API_KEY;
  const say = plain(text);
  if (!key || !say) return null;
  for (const m of ttsModel ? [ttsModel] : TTS_MODELS()) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ contents: [{ parts: [{ text: (STYLE[lang] || STYLE.uz) + say }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || 'Kore' } } } } }),
    }).catch((e) => { console.error('tts', m, e?.message); return null; });
    if (!r?.ok) { if (r) console.error('tts', m, r.status, (await r.text().catch(() => '')).slice(0, 200)); continue; }
    const j = await r.json().catch(() => null);
    const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    const d = part?.inlineData || part?.inline_data;
    if (!d?.data) continue;
    ttsModel = m;
    const rate = Number(/rate=(\d+)/.exec(d.mimeType || d.mime_type || '')?.[1]) || 24000;
    return pcmToMp3(Buffer.from(d.data, 'base64'), rate);
  }
  return null;
}

function pcmToMp3(buf, rate) {
  const pcm = new Int16Array(new Uint8Array(buf).buffer, 0, Math.floor(buf.length / 2)); // 16-bit mono PCM
  const enc = new Mp3Encoder(1, rate, 48);
  const out = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) out.push(Buffer.from(b));
  }
  const f = enc.flush();
  if (f.length) out.push(Buffer.from(f));
  return Buffer.concat(out);
}

/** Savolni ovozli xabar qilib yuborish (matni izoh sifatida, tugmalar bilan). Muvaffaqiyatsiz bo'lsa — null. */
export async function sendVoiceQ(chatId, html, lang, kb) {
  const mp3 = await tts(String(html).replace(/yozing/g, 'ayting').replace(/напишите/gi, 'скажите'), lang).catch(() => null);
  if (!mp3) return null;
  const r = await tgUpload('sendVoice', { chat_id: chatId, caption: String(html).slice(0, 1000), parse_mode: 'HTML', reply_markup: kb ? { inline_keyboard: kb } : undefined },
    'voice', mp3, 'savol.mp3', 'audio/mpeg');
  return r?.ok ? r : null;
}

/**
 * Ovozli javobni tushunish. expect — kutilayotgan javob turi.
 * Qaytaradi: { action: 'yes'|'no'|'unknown'|'value'|'family', value, heard }
 */
export async function understand(audio, question, expect, lang = 'uz') {
  const { askGemini } = await import('./ai.js');
  const prompt = `A relative answered this question by a voice message (Uzbek, Russian or English): «${plain(question)}».
Expected answer: ${expect}.
Return ONLY JSON: {"heard":"<short transcript>","action":"yes|no|unknown|value|family","value":"<value or empty>"}
- yes: confirms the shown information is correct.
- no: says it is wrong; if a correction is given, put it in value.
- unknown: doesn't know / not sure / no spouse.
- value: gives the requested answer. Format: names — as spoken, capitalized, Latin Uzbek spelling (o‘, g‘); dates — DD.MM.YYYY (only YYYY if day/month not said); numbers — digits; gender — m or f; alive — alive or dead.
- family: describes several relatives at length (lists children, spouses etc.) instead of a short answer.`;
  const r = await askGemini({ system: 'You understand short spoken answers in a family-tree questionnaire.', json: true, mode: 'fast', max_tokens: 400,
    messages: [{ role: 'user', content: [audio, { type: 'text', text: prompt }] }] });
  const raw = typeof r === 'string' ? r : r?.text || r?.content?.[0]?.text || '';
  const j = JSON.parse(String(raw).replace(/^```(json)?|```$/g, '').trim());
  return { action: String(j.action || ''), value: String(j.value ?? '').trim(), heard: String(j.heard || '').trim() };
}
