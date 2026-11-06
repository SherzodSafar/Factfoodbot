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

async function callGemini(model, key, body) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body)
  });
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

  const models = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean);
  let last = null;
  for (const m of models) {
    const r = await callGemini(m, key, body);
    if (r.status === 404 || (r.status === 400 && /not found|not supported/i.test(r.text))) { last = r; continue; }
    if (r.status !== 200) {
      const msg = (r.json && r.json.error && r.json.error.message) || r.text.slice(0, 300);
      const human = r.status === 429 ? "Gemini limiti tugadi, birozdan keyin qayta urinib ko'ring." :
        (r.status === 400 || r.status === 403) && /api key/i.test(msg) ? "Gemini API kaliti noto'g'ri." : "Gemini xatosi: " + msg;
      return res.status(502).json({ error: human });
    }
    try {
      const parts = r.json.candidates[0].content.parts;
      const txt = parts.map(p => p.text || "").join("");
      const data = JSON.parse(txt);
      return res.status(200).json({ model: m, notebooks: data.notebooks || [] });
    } catch (e) {
      return res.status(502).json({ error: "Gemini javobini o'qib bo'lmadi. Qayta urinib ko'ring." });
    }
  }
  res.status(502).json({ error: "Gemini modeli topilmadi: " + (last ? last.text.slice(0, 200) : "") });
};
