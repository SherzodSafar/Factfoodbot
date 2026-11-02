// Kvadrat Studio: har kuni Square League videolarini serverda tayyorlaydi va Telegram bot / mini app orqali beradi.
import http from 'node:http';import os from 'node:os';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {makeTg} from './lib/tg.js';import {renderJob} from './lib/render.js';import {makeMeta} from './lib/meta.js';
const ROOT=path.dirname(fileURLToPath(import.meta.url)),PUB=path.join(ROOT,'public');
const PORT=+process.env.PORT||10000,DATA=process.env.DATA_DIR||path.join(ROOT,'data'),FILES=path.join(DATA,'files');
const TOKEN=process.env.BOT_TOKEN||'',GEMINI=process.env.GEMINI_API_KEY||'',LEAGUE=process.env.LEAGUE_NAME||'SQUARE LEAGUE';
const BASE=(process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL||`http://localhost:${PORT}`).replace(/\/$/,'');
const DAILY=+(process.env.DAILY_UTC_HOUR??1),SECRET=crypto.createHash('sha256').update('kvadrat:'+TOKEN).digest('hex').slice(0,32);
const tg=makeTg(TOKEN);fs.mkdirSync(FILES,{recursive:true});
const log=(...a)=>console.log(new Date().toISOString(),...a);
// Konteynerga ajratilgan xotira (MB): video yozish uchun ~2 GB kerak.
const MEM=(()=>{for(const f of['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory/memory.limit_in_bytes'])try{const v=fs.readFileSync(f,'utf8').trim();if(/^\d+$/.test(v)&&+v<1e15)return Math.round(+v/1048576);}catch(e){}return Math.round(os.totalmem()/1048576);})();

/* ---------- holat (diskda va Telegram'da zaxira) ---------- */
const SF=path.join(DATA,'state.json');
const fresh=()=>({owner:process.env.OWNER_CHAT_ID?+process.env.OWNER_CHAT_ID:null,season:1,round:0,day:0,standings:{},packages:[],lastDaily:''});
let st;try{st=JSON.parse(fs.readFileSync(SF,'utf8'));}catch(e){st=fresh();}
function save(){fs.writeFileSync(SF+'.tmp',JSON.stringify(st));fs.renameSync(SF+'.tmp',SF);}
async function backup(){if(!st.owner)return;const f=path.join(DATA,'backup.json');fs.writeFileSync(f,JSON.stringify({...st,packages:st.packages.slice(0,10)}));
  const m=await tg.send('sendDocument',{chat_id:String(st.owner),disable_notification:'true',caption:'Kvadrat Studio holati (zaxira, o\'chirmang)'},'document',f,'kvadrat-state.json');
  if(m)await tg.call('pinChatMessage',{chat_id:st.owner,message_id:m.message_id,disable_notification:true});}
async function restore(chat){if(st.round||st.packages.length)return;const c=await tg.call('getChat',{chat_id:chat});const d=c&&c.pinned_message&&c.pinned_message.document;
  if(!d||!/kvadrat-state/.test(d.file_name||''))return;const txt=await tg.download(d.file_id);if(!txt)return;try{const o=JSON.parse(txt);st={...fresh(),...o,owner:chat};save();log('holat tiklandi');}catch(e){}}

/* ---------- navbat va kunlik to'plam ---------- */
let queue=Promise.resolve(),busy='';
const enqueue=(label,fn)=>{const p=queue.then(async()=>{busy=label;try{return await fn();}catch(e){log('job error',e);notify('❌ Xato: '+(e.message||e));}finally{busy='';}});queue=p;return p;};
const notify=(text,btn)=>st.owner?tg.call('sendMessage',{chat_id:st.owner,text,reply_markup:btn?{inline_keyboard:[[{text:'🎬 Studio',web_app:{url:BASE+'/app.html'}}]]}:undefined}):null;
const LONG_MAPS=['bombs','sniper','lava','toxic','pinball','hill','twins','saws'],SHORT_MAPS=['twins','hill','prison','pinball','sniper','lava','toxic'],MELS=['elise','turkish','mountain','ode','jingle','twinkle'];
const MEL_NAME={elise:'Für Elise',turkish:'Turkish March',mountain:'In the Hall of the Mountain King',ode:'Ode to Joy',jingle:'Jingle Bells',twinkle:'Twinkle Twinkle'};
const rndSeeds=k=>Array.from({length:k},()=>1+Math.floor(Math.random()*999998));
function specsFor(day){
  if(process.env.TEST_FAST)return[{fmt:'short',map:'twins',n:10,wCount:4,crush:1.35,minT:15,maxT:34,res:'hd',fps:30,br:4e6,k:6}];
  return[{fmt:'long',map:LONG_MAPS[day%LONG_MAPS.length],n:40,wCount:4,crush:0.75,minT:200,maxT:480,res:'fhd',fps:30,br:8e6,k:10},
    {fmt:'short',map:SHORT_MAPS[(day*2)%SHORT_MAPS.length],n:12,wCount:4,crush:1.35,minT:15,maxT:28,res:'fhd',fps:30,br:6e6,k:20},
    {fmt:'short',map:SHORT_MAPS[(day*2+1)%SHORT_MAPS.length],n:10,wCount:5,crush:1.35,minT:15,maxT:28,res:'fhd',fps:30,br:6e6,k:20,mus:true,mel:MELS[day%MELS.length]}];
}
const standList=()=>Object.entries(st.standings).map(([name,pts])=>({name,pts})).sort((a,b)=>b.pts-a.pts);
const POINTS=[25,18,15,12,10,8,6,4,2,1];
async function makePackage(){
  const day=++st.day,date=new Date().toISOString().slice(0,10),pkg={id:`${date}-d${day}`,date,day,items:[]};
  st.packages.unshift(pkg);st.packages=st.packages.slice(0,20);save();
  const specs=specsFor(day);notify(`⏳ ${specs.length} ta video tayyorlanmoqda (${pkg.id})…`);
  if(MEM<1500)notify(`⚠️ Server xotirasi ${MEM} MB. Video yozish uchun kamida 2 GB kerak (Render: Standard). Urinib ko'raman, lekin xato bo'lishi mumkin.`);
  for(const sp of specs){
    const t0=Date.now(),id=`${pkg.id}-${sp.fmt}${pkg.items.length+1}`,dir=path.join(FILES,id);fs.mkdirSync(dir,{recursive:true});
    const key=crypto.randomBytes(8).toString('hex');uploads.set(id,{key,dir});
    try{
      const info=await renderJob({...sp,id,key,league:LEAGUE,seeds:rndSeeds(sp.k)},`http://127.0.0.1:${PORT}`,log);
      const league={name:LEAGUE,season:st.season,round:st.round+(sp.fmt==='long'?1:0)};
      const meta=await makeMeta({fmt:sp.fmt,info,league,standings:standList(),mel:sp.mus?MEL_NAME[sp.mel]:null,day},GEMINI);
      if(sp.fmt==='long'){st.round++;(info.names||[]).slice(0,POINTS.length).forEach((nm,i)=>{st.standings[nm]=(st.standings[nm]||0)+POINTS[i];});}
      const files=fs.readdirSync(dir);
      const it={id,fmt:sp.fmt,map:info.map,n:info.n,dur:info.dur,seed:info.seed,winner:info.names&&info.names[0],round:sp.fmt==='long'?st.round:null,meta,thumbs:files.filter(f=>/^thumb\d\.jpg$/.test(f)).sort(),size:fs.statSync(path.join(dir,'video.mp4')).size,secs:Math.round((Date.now()-t0)/1000)};
      fs.writeFileSync(path.join(dir,'item.json'),JSON.stringify(it));pkg.items.push(it);save();await deliver(it);
    }finally{uploads.delete(id);}
  }
  await backup();notify(`✅ Tayyor: ${pkg.items.length} ta video. Sarlavha, tavsif, teglar va muqovalar Studio'da.`,true);
}
async function deliver(it){
  if(!st.owner)return;const v=path.join(FILES,it.id,'video.mp4');
  const cap=`${it.fmt==='short'?'📱 Shorts':'🎬 Uzun video'} · ${it.map} · ${Math.round(it.dur)} s\n\n${it.meta.title}`.slice(0,1000);
  if(it.size<48*1024*1024)await tg.send('sendVideo',{chat_id:String(st.owner),caption:cap,supports_streaming:'true'},'video',v,`${it.id}.mp4`);
  else await tg.call('sendMessage',{chat_id:st.owner,text:cap+'\n\nFayl katta (50 MB dan ortiq), Studio\'dan yuklab oling.',reply_markup:{inline_keyboard:[[{text:'⬇️ Yuklab olish',url:fileUrl(it.id,'video.mp4')}],[{text:'🎬 Studio',web_app:{url:BASE+'/app.html'}}]]}});
}
setInterval(()=>{const now=new Date(),d=now.toISOString().slice(0,10);if(now.getUTCHours()===DAILY&&st.lastDaily!==d&&!busy){st.lastDaily=d;save();enqueue('daily',makePackage);}},60000);

/* ---------- fayllar va imzo ---------- */
const sign=s=>crypto.createHmac('sha256',SECRET).update(s).digest('hex').slice(0,24);
const fileUrl=(id,name)=>`${BASE}/f/${encodeURIComponent(id)}/${name}?s=${sign(id+'/'+name)}`;
const uploads=new Map();
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.mp4':'video/mp4','.jpg':'image/jpeg','.png':'image/png'};
function serveFile(req,res,f,download){fs.stat(f,(e,s)=>{if(e||!s.isFile())return end(res,404,'topilmadi');const type=TYPES[path.extname(f)]||'application/octet-stream',r=req.headers.range;
  const h={'content-type':type,'accept-ranges':'bytes','cache-control':'no-store'};if(download)h['content-disposition']=`attachment; filename="${download}"`;
  if(r){const m=/bytes=(\d*)-(\d*)/.exec(r);let a=m[1]?+m[1]:0,b=m[2]?+m[2]:s.size-1;b=Math.min(b,s.size-1);res.writeHead(206,{...h,'content-range':`bytes ${a}-${b}/${s.size}`,'content-length':b-a+1});fs.createReadStream(f,{start:a,end:b}).pipe(res);}
  else{res.writeHead(200,{...h,'content-length':s.size});fs.createReadStream(f).pipe(res);}});}
const end=(res,code,body,type='text/plain; charset=utf-8')=>{res.writeHead(code,{'content-type':type});res.end(body);};
const json=(res,o,code=200)=>end(res,code,JSON.stringify(o),'application/json');
const readBody=req=>new Promise(r=>{let d='';req.on('data',c=>{d+=c;if(d.length>1e6)req.destroy();});req.on('end',()=>r(d));});
function checkInit(init){try{const p=new URLSearchParams(init||''),hash=p.get('hash');if(!hash||!TOKEN)return null;p.delete('hash');
  const dcs=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  const key=crypto.createHmac('sha256','WebAppData').update(TOKEN).digest(),h=crypto.createHmac('sha256',key).update(dcs).digest('hex');
  if(h!==hash)return null;const u=JSON.parse(p.get('user')||'{}');return u.id===st.owner?u:null;}catch(e){return null;}}

/* ---------- Telegram bot ---------- */
async function onUpdate(u){
  const m=u.message;if(!m||!m.text)return;const chat=m.chat.id,txt=m.text.trim();
  if(!st.owner){st.owner=chat;save();}
  if(chat!==st.owner){await tg.call('sendMessage',{chat_id:chat,text:'Bu shaxsiy studiya boti.'});return;}
  await restore(chat);
  if(txt.startsWith('/new')){if(busy)return notify('⏳ Hozir tayyorlanmoqda, tugashini kuting.');notify('▶️ Boshladim. Har bir video tayyor bo\'lishi bilan shu yerga yuboraman.');enqueue('manual',makePackage);}
  else if(txt.startsWith('/status')){const p=st.packages[0];notify(`Holat: ${busy?'⏳ '+busy+' ishlayapti':'bo\'sh'}\nLiga: ${LEAGUE}, ${st.season}-mavsum, ${st.round}-raund o'tdi\nOxirgi to'plam: ${p?p.id+' ('+p.items.length+' video)':'hali yo\'q'}\nKunlik tayyorlash: har kuni ${DAILY}:00 UTC (${(DAILY+5)%24}:00 Toshkent)\nServer xotirasi: ${MEM} MB`,true);}
  else notify(`Salom! Men Kvadrat Studio.\n\nHar kuni ${(DAILY+5)%24}:00 da (Toshkent) 1 ta uzun video va 2 ta Shorts tayyorlab yuboraman: sarlavha, tavsif, teglar va muqovalar bilan.\n\n/new — hozir tayyorlash\n/status — holat`,true);
}
async function setupBot(){if(!TOKEN)return log('BOT_TOKEN yo\'q, bot o\'chiq');
  await tg.call('setWebhook',{url:`${BASE}/tg/${SECRET}`,secret_token:SECRET,allowed_updates:['message'],drop_pending_updates:true});
  await tg.call('setMyName',{name:'Kvadrat Studio'});
  await tg.call('setMyShortDescription',{short_description:'Square League YouTube kanali uchun har kuni tayyor videolar.'});
  await tg.call('setMyDescription',{description:'Kvadrat Studio — Square League kanali uchun video zavodi: har kuni 1 ta uzun video va 2 ta Shorts, sarlavha, tavsif, teglar, tarjimalar va muqovalar bilan. Boshlash uchun /start bosing.'});
  await tg.call('setMyCommands',{commands:[{command:'start',description:'Boshlash'},{command:'new',description:'Hozir yangi videolar tayyorlash'},{command:'status',description:'Holat'}]});
  await tg.call('setChatMenuButton',{menu_button:{type:'web_app',text:'Studio',web_app:{url:BASE+'/app.html'}}});log('bot sozlandi',BASE,'xotira',MEM,'MB');}
// Boshqa dastur webhook'ni o'chirib qo'ysa, 10 daqiqada qayta tiklanadi.
setInterval(async()=>{if(!TOKEN||/localhost/.test(BASE))return;const w=await tg.call('getWebhookInfo',{});
  if(w&&w.url!==`${BASE}/tg/${SECRET}`){log('webhook tiklanmoqda');await tg.call('setWebhook',{url:`${BASE}/tg/${SECRET}`,secret_token:SECRET,allowed_updates:['message']});}},600000);

/* ---------- HTTP ---------- */
http.createServer(async(req,res)=>{
  try{const url=new URL(req.url,'http://x'),p=url.pathname.split('/').map(decodeURIComponent);
    if(req.method==='POST'&&p[1]==='tg'&&p[2]===SECRET){if(req.headers['x-telegram-bot-api-secret-token']!==SECRET)return end(res,403,'no');const b=await readBody(req);end(res,200,'ok');try{await onUpdate(JSON.parse(b));}catch(e){log('update',e);}return;}
    if(req.method==='POST'&&p[1]==='up'){const u=uploads.get(p[2]),ip=req.socket.remoteAddress||'';
      if(!u||url.searchParams.get('k')!==u.key||!/^[\w.-]+$/.test(p[3]||'')||!/127\.0\.0\.1|::1/.test(ip))return end(res,403,'no');
      const fp=path.join(u.dir,p[3]),pos=url.searchParams.get('pos');
      if(pos!=null&&!fs.existsSync(fp))fs.writeFileSync(fp,'');
      const ws=pos!=null?fs.createWriteStream(fp,{flags:'r+',start:+pos}):fs.createWriteStream(fp);req.pipe(ws);ws.on('finish',()=>end(res,200,'ok'));ws.on('error',()=>end(res,500,'err'));return;}
    if(p[1]==='f'&&p[2]&&p[3]){if(url.searchParams.get('s')!==sign(p[2]+'/'+p[3])||!/^[\w.-]+$/.test(p[3]))return end(res,403,'no');return serveFile(req,res,path.join(FILES,path.basename(p[2]),p[3]),url.searchParams.get('dl')?`${p[2]}-${p[3]}`:null);}
    if(p[1]==='api'){const u=checkInit(req.headers['x-init']);if(!u)return json(res,{error:'auth'},401);
      if(p[2]==='packages'){const out=st.packages.map(k=>({...k,items:k.items.map(it=>({...it,video:fileUrl(it.id,'video.mp4'),download:fileUrl(it.id,'video.mp4')+'&dl=1',thumbUrls:it.thumbs.map(t=>fileUrl(it.id,t))}))}));
        return json(res,{busy,league:{name:LEAGUE,season:st.season,round:st.round,standings:standList().slice(0,10)},daily:DAILY,packages:out});}
      if(p[2]==='new'&&req.method==='POST'){if(busy)return json(res,{ok:false,busy});enqueue('manual',makePackage);return json(res,{ok:true});}
      return json(res,{error:'404'},404);}
    if(req.method==='POST'&&p[1]==='dev'&&process.env.DEV_KEY&&url.searchParams.get('k')===process.env.DEV_KEY){enqueue('dev',makePackage);return json(res,{ok:true});}
    if(p[1]==='dev-state'&&process.env.DEV_KEY&&url.searchParams.get('k')===process.env.DEV_KEY)return json(res,{busy,st});
    const f=p[1]===''||!p[1]?'index.html':path.basename(p[1]);
    if(f==='index.html')return end(res,200,`<!doctype html><meta charset=utf8><title>Kvadrat Studio</title><body style="font-family:system-ui;background:#111318;color:#eee;padding:24px"><h1>Kvadrat Studio</h1><p>Server ishlayapti. Holat: ${busy?'tayyorlanmoqda':'bo\'sh'}.</p>`, 'text/html; charset=utf-8');
    if(f==='game.html'||f==='app.html')return serveFile(req,res,path.join(PUB,f));
    if(f==='health')return end(res,200,'ok');
    end(res,404,'topilmadi');
  }catch(e){log('http',e);try{end(res,500,'xato');}catch(_){}}
}).listen(PORT,()=>{log('Kvadrat Studio',PORT,BASE);setupBot();});
