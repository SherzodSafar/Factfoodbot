import {chromium} from 'playwright';
// O'yinni ekransiz Chrome'da ochadi, eng qiziq tasodif kodini tanlaydi, videoni kadrma-kadr yozadi va serverga yuklaydi.
export async function renderJob(job,base,log=()=>{}){
  let b=null;
  for(const ch of ['chrome',undefined]){try{b=await chromium.launch({channel:ch,args:['--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage']});log('browser '+(ch||'chromium'));break;}catch(e){if(!ch)throw e;}}
  try{
    const pg=await b.newPage({viewport:{width:1280,height:800}});
    pg.on('console',m=>{if(m.type()==='error')console.log('[page]',m.text());});
    pg.on('pageerror',e=>console.log('[page error]',e.message));
    await pg.goto(base+'/game.html',{waitUntil:'load'});
    await pg.waitForFunction(()=>!!window.__auto,null,{timeout:60000});
    return await pg.evaluate(async(job)=>{
      const ranked=window.__pick(job,job.seeds),best=ranked[0];job.seed=best.seed;
      if(job.fmt==='long')job.thumbAt=[best.T*0.3,best.duel>0?Math.max(1,best.duel-1):best.T*0.8];
      const up=async(name,blob,pos)=>{const x=await fetch(`/up/${job.id}/${name}?k=${job.key}`+(pos!=null?`&pos=${pos}`:''),{method:'POST',body:blob});if(!x.ok)throw new Error('upload '+name+' '+x.status);};
      window.__sink=(d,pos)=>up('video.mp4',d,pos);
      const r=await window.__auto(job);
      if(!r.blob)throw new Error('video kodlovchisi topilmadi');
      if(!r.blob.sunk)await up('video.mp4',r.blob);for(let i=0;i<r.thumbs.length;i++)await up(`thumb${i+1}.jpg`,r.thumbs[i]);
      return{...r.info,seed:best.seed,score:best.sc,multi:best.multi,tri:best.tri};
    },job);
  }finally{await b.close().catch(()=>{});}
}
