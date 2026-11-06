const checkPassword = require("./_auth");
module.exports = (req, res) => {
  const a = checkPassword(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });
  res.status(200).json({ ok: true, serverKey: Boolean(process.env.GEMINI_API_KEY) });
};
