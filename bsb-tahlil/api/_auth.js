// Umumiy parol tekshiruvi
module.exports = function checkPassword(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return { ok: false, status: 500, error: "Serverda APP_PASSWORD sozlanmagan." };
  const got = String(req.headers["x-app-password"] || "");
  if (got !== expected) return { ok: false, status: 401, error: "Parol noto'g'ri." };
  return { ok: true };
};
