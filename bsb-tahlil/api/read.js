// Daftar rasmidan ballarni Gemini orqali o'qish
const checkPassword = require("./_auth");

function buildPrompt(students, k, max) {
  const list = students.map((n, i) => `${i + 1}. ${n}`).join("\n");
  return `You are reading a photo of one or more school notebooks (Uzbekistan). Each notebook page is one student's summative assessment.

On each notebook the teacher wrote in RED pen:
- ${k} criterion scores, each written as "N-S" or "N – S", where N is the criterion number (1..${k}) and S is the score (0..${max.join("/")}). The pairs may be arranged in any order or in 2-3 rows, e.g. "1-9  3-10 / 2-9  4-9  5-9".
- The written total, like "46 b." (b. = ball).
Below the red text, in PENCIL, the student's name is written as surname initial + dot + first name, e.g. "Sh.Asaloy", "G'.Azimboy", "O'.Mahliyo", "A. Nurjan".
Ignore all other handwriting (essay text, blue/black ink).

Class roster (number. Surname Firstname):
${list}

For EVERY notebook visible in the photo (also partly visible or cut-off ones), return one item:
- raw_name: the pencil name exactly as written ("" if not visible).
- student_number: the roster number that matches (surname initial AND first name). null if not visible or if more than one roster student fits.
- scores: array of exactly ${k} values in criterion order 1..${k}; use null for a criterion whose score is missing, cut off or unreadable. Do NOT compute a missing score from the total.
- written_total: the red total number, null if not visible.
- unclear: criterion numbers whose digit you are not sure about.
- note: short note about any doubt (English), "" if none.
Read carefully: "1" vs "7", "5" vs "6", "9" vs "4", "10" vs "1". Be precise; do not guess.`;
}

const schema = {
  type: "OBJECT",
  properties: {
    notebooks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          raw_name: { type: "STRING" },
          student_number: { type: "INTEGER", nullable: true },
          scores: { type: "ARRAY", items: { type: "INTEGER", nullable: true } },
          written_total: { type: "INTEGER", nullable: true },
          unclear: { type: "ARRAY", items: { type: "INTEGER" } },
          note: { type: "STRING" }
        },
        required: ["raw_name", "student_number", "scores", "written_total", "unclear", "note"]
      }
    }
  },
  required: ["notebooks"]
};

async function callGemini(model, key, body, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", signal: ac.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body)
    });
  } catch (e) { clearTimeout(t); return { status: 599, json: null, text: "timeout" }; }
  clearTimeout(t);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, json: j, text };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST kerak" });
  const a = checkPassword(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  const key = process.env.GEMINI_API_KEY || String(req.headers["x-gemini-key"] || "");
  if (!key) return res.status(400).json({ error: "Gemini API kaliti kiritilmagan (Sozlamalar bo'limida kiriting)." });

  const { image, mime, students, max } = req.body || {};
  if (!image || !Array.isArray(students) || !students.length || !Array.isArray(max))
    return res.status(400).json({ error: "Rasm yoki o'quvchilar ro'yxati yo'q." });
  const k = max.length;

  const body = {
    contents: [{ role: "user", parts: [
      { text: buildPrompt(students, k, max) },
      { inline_data: { mime_type: mime || "image/jpeg", data: image } }
    ] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema }
  };

  const models = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-pro"].filter(Boolean);
  const started = Date.now(), errors = [];
  for (const m of models) {
    const left = 280000 - (Date.now() - started);
    if (left < 20000) break;
    const r = await callGemini(m, key, body, Math.min(150000, left));
    if (r.status === 200) {
      try {
        const txt = r.json.candidates[0].content.parts.map(p => p.text || "").join("");
        const data = JSON.parse(txt);
        return res.status(200).json({ model: m, notebooks: data.notebooks || [] });
      } catch (e) { errors.push(m + ": javob o'qilmadi"); continue; }
    }
    const msg = (r.json && r.json.error && r.json.error.message) || r.text.slice(0, 200);
    if ((r.status === 400 || r.status === 403) && /api key/i.test(msg)) return res.status(400).json({ error: "Gemini API kaliti noto'g'ri." });
    errors.push(m + ": " + (r.status === 599 ? "javob kelmadi (vaqt tugadi)" : r.status === 429 ? "limit tugadi" : r.status === 503 ? "server band" : msg));
    // 404 (model yo'q), 429, 5xx, vaqt tugashi — keyingi modelga o'tamiz
  }
  return res.status(502).json({ error: "Gemini hozir javob bermadi. Birozdan keyin \"Qayta urinish\" tugmasini bosing. (" + errors.join("; ") + ")" });
};
