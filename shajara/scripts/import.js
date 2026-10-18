// Tayyor JSON shajarani serverga yuklash.
// Foydalanish:
//   ADMIN_KEY=... node scripts/import.js <fayl.json> <kirish_kodi> <tahrir_kodi> [server_url]
import { readFileSync } from 'node:fs';

const [file, viewCode, editCode, server = 'http://localhost:3100'] = process.argv.slice(2);
if (!file || !viewCode || !editCode) {
  console.log('Foydalanish: node scripts/import.js <fayl.json> <kirish_kodi> <tahrir_kodi> [server_url]');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
const r = await fetch(server.replace(/\/$/, '') + '/api/admin/import', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY || '' },
  body: JSON.stringify({ data, viewCode, editCode }),
});
console.log(r.status, await r.text());
