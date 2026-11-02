// Sarlavha, tavsif, teglar va (Gemini kaliti bo'lsa) RPM yuqori davlatlar tillariga tarjimalar.
export const CHAR={RED:'the Hothead',BLUE:'the Strategist',LIME:'the Speedster',YELLOW:'the Lucky One',ORANGE:'the Brawler',PURPLE:'the Mystic',CYAN:'the Ice Cold',PINK:'the Sweetheart',GREEN:'the Survivor',BLACK:'the Shadow',CHAMELEON:'the Trickster',WHITE:'the Ghost',BROWN:'the Tank',NAVY:'the Captain',TEAL:'the Calm One',MAROON:'the Veteran',GOLD:'the Champion',MAGENTA:'the Showoff',SKY:'the Dreamer',MINT:'the Rookie',CORAL:'the Wildcard',CHECKER:'the Gambler',OLIVE:'the Sharpshooter',LAVENDER:'the Quiet One',GRAY:'the Underdog',SALMON:'the Comeback Kid',INDIGO:'the Thinker',FOREST:'the Hunter',PEACH:'the Optimist',ROSE:'the Duelist',AQUA:'the Escape Artist',PLUM:'the Schemer',GALAXY:'the Cosmic One',CHOCOLATE:'the Heavyweight',LEMON:'the Sprinter',VIOLET:'the Royal',COBALT:'the Machine',CRIMSON:'the Berserker',JADE:'the Lucky Charm',AMBER:'the Firestarter'};
export const LANGS={de:'German',fr:'French',nl:'Dutch',no:'Norwegian',da:'Danish',sv:'Swedish',es:'Spanish'};
const pick=(a,k)=>a[((k%a.length)+a.length)%a.length];
const TAGS=['battle royale','simulation','who will win','squares battle','last one standing','survival','elimination','satisfying','tournament','marble race','square league','battle simulation'];
const HASH='#battleroyale #simulation #whowillwin #satisfying';
function standLines(st){return st.slice(0,5).map((s,i)=>`${i+1}. ${s.name}${CHAR[s.name]?' ('+CHAR[s.name]+')':''} – ${s.pts} pts`).join('\n');}
export function templateMeta({fmt,info,league,standings,mel,day}){
  const n=info.n,map=info.map,L=league.name,R=league.round,S=league.season;
  const fav=standings[0]?standings[0].name:null;
  if(fmt==='short'){
    const T=mel?[`This square plays ${mel} while fighting 🎹 #shorts`,`${n} squares, 1 survivor – and a ${mel} soundtrack 🎵 #shorts`]
      :[`Who wins? ${n} squares, only 1 survives 🔥 #shorts`,`Only ONE square survives… pick yours 👇 #shorts`,`${map}: who is the last square standing? #shorts`,`Can you guess the winner? ${n} squares battle #shorts`];
    const title=pick(T,day);
    const description=`${n} squares. One arena. Only one survives.\nPick your square in the comments before the end! 👇\n\nFull rounds of the ${L} every day on the channel.\n\n#shorts ${HASH}`;
    return{title,description,tags:TAGS.slice(0,8)};
  }
  const T=[`${n} Squares Battle Royale – Only 1 Survives! | ${L} R${R}`,`Who Will Survive ${map}? ${n} Squares Fight | ${L} R${R}`,
    fav?`Can ${fav} Hold the Lead? ${n} Squares Battle Royale | ${L} R${R}`:`Last Square Standing: ${map} | ${L} R${R}`,`${n} Squares Enter ${map}… Only One Leaves | ${L} R${R}`];
  const title=pick(T,day).slice(0,100);
  const description=`${n} squares enter ${map} – weapons, traps and closing walls. Only one walks out.\n${L} · Season ${S} · Round ${R}\n\n`+
    (standings.length?`🏆 Standings before this round:\n${standLines(standings)}\n\n`:'')+
    `💬 Comment your pick before the final!\n🔔 Subscribe and follow the league – a new round every day.\n\n${HASH} #squareleague`;
  return{title,description,tags:TAGS};
}
export async function makeMeta(ctx,key){
  const base=templateMeta(ctx);if(!key)return{...base,translations:{}};
  const prompt=`You write YouTube metadata for an animated "who will win" battle-simulation channel (colorful squares fight in an arena, one survivor). Audience: global, English first.
Facts (do NOT reveal the winner of this video): ${JSON.stringify({format:ctx.fmt,squares:ctx.info.n,map:ctx.info.map,league:ctx.league,standingsBeforeRound:ctx.standings.slice(0,5),melody:ctx.mel||null,characters:Object.fromEntries(ctx.standings.slice(0,5).map(s=>[s.name,CHAR[s.name]||'']))})}
Draft: ${JSON.stringify(base)}
Improve the draft for click-through without clickbait lies: title max 90 chars, a strong question or stakes; keep "#shorts" for shorts; description keeps the facts, call to comment a pick, subscribe line and hashtags. Then translate title and description into: ${Object.entries(LANGS).map(([k,v])=>k+'='+v).join(', ')} (natural, native style, keep hashtags and names in English).
Return JSON: {"title":"","description":"","tags":[""],"translations":{"de":{"title":"","description":""},...}}`;
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.9}})});
    const j=await r.json();const txt=j.candidates?.[0]?.content?.parts?.[0]?.text;const o=JSON.parse(txt);
    if(!o.title||!o.description)throw new Error('bo\'sh javob');
    return{title:String(o.title).slice(0,100),description:String(o.description).slice(0,4900),tags:Array.isArray(o.tags)&&o.tags.length?o.tags.slice(0,20):base.tags,translations:o.translations||{}};
  }catch(e){console.log('gemini',e.message);return{...base,translations:{}};}
}
