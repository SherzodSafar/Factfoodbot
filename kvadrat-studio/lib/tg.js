import fs from 'node:fs';import path from 'node:path';
export function makeTg(token){
  const api=m=>`https://api.telegram.org/bot${token}/${m}`;
  async function call(m,body){if(!token)return null;try{const r=await fetch(api(m),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const j=await r.json();if(!j.ok)console.log('tg',m,j.description);return j.ok?j.result:null;}catch(e){console.log('tg',m,e.message);return null;}}
  async function send(m,fields,field,file,name){if(!token)return null;try{const fd=new FormData();for(const[k,v]of Object.entries(fields))fd.append(k,typeof v==='string'?v:JSON.stringify(v));fd.append(field,new Blob([fs.readFileSync(file)]),name||path.basename(file));const r=await fetch(api(m),{method:'POST',body:fd});const j=await r.json();if(!j.ok)console.log('tg',m,j.description);return j.ok?j.result:null;}catch(e){console.log('tg',m,e.message);return null;}}
  async function download(fileId){const f=await call('getFile',{file_id:fileId});if(!f)return null;const r=await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`);return r.ok?await r.text():null;}
  return{call,send,download};
}
