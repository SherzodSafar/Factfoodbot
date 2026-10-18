// Lokal sinov serveri: public/ statik fayllari + /api/* → api/index.js
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import handler from '../api/index.js';

const PORT = Number(process.env.PORT || 3100);
const ROOT = path.resolve('public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return handler(req, res);
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const buf = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(buf);
  } catch {
    res.writeHead(404).end('404');
  }
}).listen(PORT, () => console.log(`Shajara: http://localhost:${PORT}`));
