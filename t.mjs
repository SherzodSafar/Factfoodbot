import fs from 'node:fs';
const T = process.env.T, H = { authorization: `Bearer ${T}` };
const v = await (await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: H })).json();
console.log('verify', JSON.stringify(v).slice(0, 300));
const a = await (await fetch('https://api.cloudflare.com/client/v4/accounts', { headers: H })).json();
console.log('accounts', JSON.stringify((a.result || []).map((x) => [x.id, x.name])), JSON.stringify(a.errors));
const acc = process.env.ACC || a.result?.[0]?.id;
const prompt = process.env.P;
for (const model of (process.env.M || '@cf/black-forest-labs/flux-2-klein-9b').split(',')) {
  const fd = new FormData();
  fd.append('prompt', prompt);
  fd.append('input_image_0', new Blob([fs.readFileSync('in.jpg')], { type: 'image/jpeg' }), 'photo.jpg');
  fd.append('width', '752'); fd.append('height', '992');
  const t = Date.now();
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`, { method: 'POST', headers: H, body: fd });
  const ct = r.headers.get('content-type');
  const name = 'out-' + model.split('/').pop() + '.jpg';
  if (ct?.startsWith('image/')) fs.writeFileSync(name, Buffer.from(await r.arrayBuffer()));
  else { const j = await r.json(); if (j.result?.image) fs.writeFileSync(name, Buffer.from(j.result.image, 'base64')); else console.log(model, r.status, JSON.stringify(j).slice(0, 400)); }
  console.log(model, r.status, ct, (Date.now() - t) / 1000 + 's', fs.existsSync(name) ? fs.statSync(name).size : 0);
}
