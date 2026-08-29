// widget-belastung.mjs — hält jedes Widget aus, was im Stream wirklich kommt?
//
// Der Überlauf-Prüfer (widget-overflow-check.ts) fragt „passt es in die Box".
// Dieser hier fragt „geht es kaputt": Jedes Widget bekommt JEDE Ereignisart —
// auch solche, mit denen es nicht rechnet —, und zwar zweimal: einmal mit
// vollem Beiwerk und einmal NACKT (nur Art und Zeitstempel). Der nackte Fall
// ist der Alltag: TikTok lässt Felder weg, je nach Stream und Übertragungsweg.
//
// Dazu Stats mit leeren Zahlen, Spotify mit null, eine Aktion, eine
// Spiel-Nachricht, ein Moment, ein Reset, das Verkleinern auf 40x30 und ein
// Ereignis NACH destroy(). Alles, was dabei wirft, wird gemeldet.
//
// WARUM DAS ZÄHLT: Ein Wurf in einem Widget bleibt oft unsichtbar — die Runtime
// fängt ihn ab, das Widget hört aber auf zu arbeiten und niemand sieht warum.
// Genau die Klasse Fehler, die im Stream erst auffällt, wenn es zu spät ist.
//
// Aufruf: npm run widget-belastung   (dauert ~3 Minuten, ein Browserstart je Widget)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';
const REPO='/home/dotexe/repos/botexe-studio';
const WK=join(REPO,'packages/widget-kit');
const { WIDGET_TYPES } = await import(join(REPO,'apps/desktop/src/renderer/pages/widget-types.ts'));
const TYPEN=[...new Set(WIDGET_TYPES.map(d=>d.type))];
const DEFS=Object.fromEntries(WIDGET_TYPES.map(d=>[d.type, d]));

const seite = (typ) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/widget-base.css">
<style>html,body{margin:0;background:#111}.box{position:absolute;left:0;top:0;width:${DEFS[typ].w}px;height:${DEFS[typ].h}px;container-type:size}</style></head><body>
<script type="module">
const fehler=[];
window.onerror=(m)=>{fehler.push('onerror: '+m)};
window.addEventListener('unhandledrejection',(e)=>fehler.push('promise: '+e.reason));
const ARTEN=['chat','gift','follow','sub','like','share','join','viewer_count','envelope','timer','superfan','emote'];
const user={id:'u1',nickname:'Maximiliane',profilePic:'',teamLevel:3,giftLevel:5,isModerator:true,isFollower:true};
const gift={slug:'Rose',count:3,coinsPerUnit:5,totalCoins:15,icon:'',giftId:7934};
const stats={totals:{viewers:342,likes:1240,follows:12,coins:680,gifts:37,shares:4,uniqueViewers:180,peakViewers:410,chats:88},
 topGifters:[{id:'1',nickname:'A',coins:8400}],topLikers:[{id:'1',nickname:'B',likes:320}],
 topPoints:[{id:'1',nickname:'C',points:12}],topWinners:[{id:'1',nickname:'D',wins:4}]};
const M=(await import('/${typ}.js')).default;
const host=document.createElement('div'); host.className='box'; document.body.appendChild(host);
let inst=null;
const versuch=(was,f)=>{ try{ f(); }catch(e){ fehler.push(was+': '+(e&&e.message||e)); } };
versuch('constructor', ()=>{ inst=new M(host, ${JSON.stringify(DEFS[typ].props)}, {preview:true, layerId:'t', baseUrl:'', token:'', playSound(){}, reportWin(){}}); });
if (inst) {
  versuch('resize', ()=>inst.resize&&inst.resize());
  versuch('onStats', ()=>inst.onStats&&inst.onStats(stats));
  versuch('onStats leer', ()=>inst.onStats&&inst.onStats({totals:{}}));
  for (const art of ARTEN) {
    versuch('onEvent '+art, ()=>inst.onEvent&&inst.onEvent({type:art, ts:Date.now(), user, gift, text:'hallo 123 😀', likeCount:5, totalLikes:1240, viewerCount:342, sticker:{id:'s1',name:'x',url:''}, stickers:[{id:'s1',index:0}]}));
    // Dieselbe Art OHNE Nutzer und ohne Beiwerk — der haeufigste Fall bei
    // fremden Streams (TikTok laesst Felder weg).
    versuch('onEvent '+art+' nackt', ()=>inst.onEvent&&inst.onEvent({type:art, ts:Date.now()}));
  }
  versuch('onSpotify', ()=>inst.onSpotify&&inst.onSpotify({trackId:'d',title:'T',artist:'A',durationMs:1000,progressMs:10,isPlaying:true}));
  versuch('onSpotify null', ()=>inst.onSpotify&&inst.onSpotify(null));
  versuch('onAction', ()=>inst.onAction&&inst.onAction({kind:'fire_alert',targetId:'t'},{type:'gift',ts:1,user,gift}));
  versuch('onGameEvent', ()=>inst.onGameEvent&&inst.onGameEvent({gameKind:'quiz',event:'win',type:'win',payload:{}}));
  versuch('onGameState', ()=>inst.onGameState&&inst.onGameState({gameKind:'quiz',state:null}));
  versuch('onMoment', ()=>inst.onMoment&&inst.onMoment({kind:'vip',title:'T'}));
  versuch('onReset', ()=>inst.onReset&&inst.onReset());
  versuch('resize klein', ()=>{ host.style.width='40px'; host.style.height='30px'; inst.resize&&inst.resize(); });
  versuch('Ereignis nach Verkleinern', ()=>inst.onEvent&&inst.onEvent({type:'gift',ts:1,user,gift}));
  versuch('destroy', ()=>inst.destroy&&inst.destroy());
  versuch('Ereignis NACH destroy', ()=>inst.onEvent&&inst.onEvent({type:'gift',ts:1,user,gift}));
}
setTimeout(()=>console.log('ERG '+JSON.stringify(fehler)), 700);
</script></body></html>`;

const MIME={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const pages=new Map(TYPEN.map(t=>[`/_r_${t}.html`, seite(t)]));
const srv=createServer(async(req,res)=>{const p=(req.url||'/').split('?')[0];
 if(pages.has(p)){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(pages.get(p));}
 try{const b=await readFile(join(WK,p));res.writeHead(200,{'content-type':MIME[extname(p)]??'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
const port=srv.address().port;
let n=0, gefunden=0;
for (const t of TYPEN) {
  let raw='';
  await new Promise(ok=>{const k=spawn('google-chrome',['--headless=new','--enable-unsafe-swiftshader','--no-sandbox','--enable-logging=stderr','--virtual-time-budget=2500','--dump-dom',`http://127.0.0.1:${port}/_r_${t}.html`],{stdio:['ignore','pipe','pipe']});
   k.stdout.on('data',d=>raw+=d);k.stderr.on('data',d=>raw+=d);k.on('close',ok);k.on('error',ok);});
  const m=raw.match(/ERG (\[.*?\])</s) ?? raw.match(/ERG (\[.*?\])/s);
  if(!m){ console.log(`❓ ${t}: keine Messung`); continue; }
  const f=JSON.parse(m[1]);
  if(f.length) { gefunden++; console.log(`❌ ${t}:\n   ${f.join('\n   ')}`); }
  if(++n%12===0) process.stderr.write(`  ${n}/${TYPEN.length}\n`);
}
srv.close();
console.log(`\nFertig — ${TYPEN.length} Widgets geprüft, ${gefunden} mit Befund.`);
process.exit(gefunden === 0 ? 0 : 1);
