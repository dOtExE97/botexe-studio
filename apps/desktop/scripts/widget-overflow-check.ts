// widget-overflow-check.ts — misst für JEDES Widget in sechs Box-Größen, ob der
// Inhalt über die eingestellte Box hinausragt.
//
// Warum es das gibt: Widgets setzen `container-type` auf ihrer eigenen Wurzel und
// benutzen cq-Einheiten in DERSELBEN Regel. Ein Element kann seinen eigenen
// container-type aber nicht abfragen — diese Einheiten maßen deshalb den
// Viewport statt der Widget-Box (siehe Kommentar in applyWidgetStyle,
// packages/overlay-engine/runtime/runtime.js). Der Fehler betraf 32 von 43
// Widgets, blieb monatelang unbemerkt und fiel erst im Livestream auf. Dieser
// Prüfer fängt genau diese Klasse ab.
//
// Zwei Befunde je Messung:
//   RAGT-RAUS     — ein Nachfahre ragt sichtbar über die Box hinaus, KEIN Vorfahre
//                   schneidet ihn weg. Immer ein Defekt → Exit-Code 1.
//   abgeschnitten — ein Vorfahre mit overflow!=visible schneidet weg. Bei
//                   Laufbändern und einfliegenden Alerts ist das Absicht, bei
//                   Listen versteckt es Inhalt → nur Bericht, nie rot.
//
// Nutzung: npm run widget-check --workspace apps/desktop  [-- <typ> ...]
// Braucht einen headless-fähigen Chrome/Chromium (CHROME_BIN überschreibt).
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIDGET_TYPES } from '../src/renderer/pages/widget-types';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const KIT_DIR = join(REPO_ROOT, 'packages/widget-kit');

// Größen-Matrix relativ zur Standardgröße: winzig, klein, Standard, groß, sehr
// breit-flach, sehr schmal-hoch. Genau die Fälle, in denen ein Nutzer das
// Kästchen zieht.
const SCALES: [name: string, sx: number, sy: number][] = [
  ['winzig', 0.45, 0.45],
  ['klein', 0.7, 0.7],
  ['standard', 1, 1],
  ['gross', 2.2, 2.2],
  ['breit', 2.6, 0.6],
  ['hoch', 0.6, 2.6],
];

/** Überhänge unter dieser Schwelle sind Rundung/Schatten, kein Defekt. */
const TOLERANZ_PX = 2;

interface Messung {
  type: string;
  name: string;
  w: number;
  h: number;
  /** sichtbarer Überhang (nicht weggeschnitten) in x/y */
  ox: number;
  oy: number;
  /** weggeschnittener Überhang in x/y */
  cx: number;
  cy: number;
  /** Element, das am weitesten raussteht */
  who: string;
  err?: string;
}

function findeBrowser(): string {
  const kandidaten = [
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter((c): c is string => !!c);
  for (const bin of kandidaten) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
      return bin;
    } catch {
      /* nächster Kandidat */
    }
  }
  console.error(
    'Kein headless-fähiger Chrome/Chromium gefunden. Installieren oder CHROME_BIN setzen.\n'
    + `Gesucht: ${kandidaten.join(', ')}`,
  );
  process.exit(2);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
};

/**
 * Winziger statischer Server auf packages/widget-kit. Bewusst ohne
 * Fremd-Abhängigkeit (und ohne python3) — läuft überall, wo Node läuft.
 * `pages` liefert die im Speicher erzeugten Prüfseiten aus, es landet also
 * nie eine Wegwerf-Datei im Widget-Ordner.
 */
function starteServer(pages: Map<string, string>) {
  const srv = createServer(async (req, res) => {
    const pfad = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const seite = pages.get(pfad);
    if (seite !== undefined) {
      res.writeHead(200, { 'content-type': MIME['.html'] as string });
      res.end(seite);
      return;
    }
    // normalize + Präfix-Check: kein Ausbruch aus dem Widget-Ordner
    const datei = join(KIT_DIR, normalize(pfad));
    if (!datei.startsWith(KIT_DIR)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const buf = await readFile(datei);
      res.writeHead(200, { 'content-type': MIME[extname(datei)] ?? 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise<{ port: number; stop: () => void }>((ok) => {
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      ok({ port, stop: () => srv.close() });
    });
  });
}

/**
 * Chrome headless auf eine Prüfseite loslassen und stdout+stderr einsammeln.
 * WICHTIG asynchron (spawn, nicht spawnSync): der Prüf-Server läuft im selben
 * Prozess — ein synchroner Aufruf blockiert die Event-Loop, der Server nimmt
 * keine Verbindung an und Chrome lädt die Seite nie.
 */
function starteBrowser(browser: string, url: string): Promise<string> {
  return new Promise((ok) => {
    const kind = spawn(browser, [
      '--headless=new',
      // KEIN --disable-gpu (schaltet den Compositor ab), stattdessen Software-GL.
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      // Das Messergebnis kommt als console.log — nur mit diesem Flag sichtbar.
      '--enable-logging=stderr',
      '--virtual-time-budget=2500',
      '--dump-dom',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let raw = '';
    kind.stdout.on('data', (d) => { raw += d; });
    kind.stderr.on('data', (d) => { raw += d; });
    const stopper = setTimeout(() => kind.kill('SIGKILL'), 60_000);
    kind.on('close', () => { clearTimeout(stopper); ok(raw); });
    kind.on('error', (e) => { clearTimeout(stopper); ok(`${raw}\n${e.message}`); });
  });
}

/** Prüfseite: instanziiert das Widget in allen Boxgrößen und misst den Überhang. */
function baueSeite(type: string, props: Record<string, unknown>, boxen: [string, number, number][]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/widget-base.css">
<style>html,body{margin:0;background:#14102a}
/* container-type wie in runtime.js auf der Widget-Box — sonst misst der Test
   etwas anderes als der Nutzer sieht. */
.box{position:absolute;left:0;top:0;overflow:visible;container-type:size}</style></head><body>
<script type="module">
const stats={totals:{viewers:342,likes:1240,follows:12,coins:680,gifts:37,shares:4,uniqueViewers:180,peakViewers:410,chats:88},
 topGifters:[{id:'1',nickname:'BigBen',coins:8400},{id:'2',nickname:'Mia',coins:5200},{id:'3',nickname:'LeonGG',coins:3100},{id:'4',nickname:'Nova',coins:1800}],
 topLikers:[{id:'1',nickname:'Mia',likes:320},{id:'2',nickname:'Nova',likes:145}],
 topPoints:[{id:'1',nickname:'Mia',points:1250},{id:'2',nickname:'Nova',points:840}],
 topWinners:[{id:'1',nickname:'Mia',wins:4}]};
const user={id:'u1',nickname:'Maximiliane',profilePic:''};
const gift={slug:'Finger Heart',count:3,coinsPerUnit:5,totalCoins:15,icon:''};
const M=(await import('/${type}.js')).default;
const out=[];
for(const [name,w,h] of ${JSON.stringify(boxen)}){
  const host=document.createElement('div');
  host.className='box'; host.style.width=w+'px'; host.style.height=h+'px';
  document.body.appendChild(host);
  try{
    const inst=new M(host, ${JSON.stringify(props)}, {preview:true, playSound(){}, reportWin(){}});
    if(inst.resize)try{inst.resize()}catch{}
    if(inst.onStats)inst.onStats(stats);
    if(inst.onSpotify)inst.onSpotify({trackId:'d',title:'Blinding Lights',artist:'The Weeknd',durationMs:200000,progressMs:74000,isPlaying:true});
    if(inst.onEvent){inst.onEvent({type:'gift',ts:Date.now(),user,gift});
      inst.onEvent({type:'chat',ts:Date.now(),user,text:'Das Overlay ist mega'});
      inst.onEvent({type:'like',ts:Date.now(),user,likeCount:50,totalLikes:1240});}
    const hr=host.getBoundingClientRect();
    let ox=0, oy=0, cx=0, cy=0, who='';
    for(const el of host.querySelectorAll('*')){
      const cs=getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0) continue;
      const r=el.getBoundingClientRect();
      if(r.width===0||r.height===0) continue;
      // Wird der Ueberhang von einem Vorfahren weggeschnitten? Dann ist es
      // meist Absicht (Laufband, einfliegender Alert, scrollende Liste) — es
      // sieht im Stream nicht kaputt aus, kann aber Inhalt verstecken.
      let clipped=false;
      for(let p=el.parentElement; p && p!==host.parentElement; p=p.parentElement){
        const pc=getComputedStyle(p);
        if(pc.overflow!=='visible'||pc.overflowX!=='visible'||pc.overflowY!=='visible'){clipped=true;break;}
      }
      const dx=Math.max(hr.left-r.left, r.right-hr.right);
      const dy=Math.max(hr.top-r.top, r.bottom-hr.bottom);
      if(clipped){ if(dx>cx)cx=dx; if(dy>cy)cy=dy; continue; }
      if(dx>ox||dy>oy){ if(dx>ox)ox=dx; if(dy>oy)oy=dy; who=el.className||el.tagName; }
    }
    out.push({name,w,h,ox:Math.round(ox),oy:Math.round(oy),cx:Math.round(cx),cy:Math.round(cy),who:String(who).slice(0,34)});
  }catch(e){ out.push({name,w,h,ox:0,oy:0,cx:0,cy:0,who:'',err:e.message.slice(0,60)}); }
}
console.log('ERG '+JSON.stringify(out));
</script></body></html>`;
}

async function main() {
  const browser = findeBrowser();
  const nurTypen = process.argv.slice(2);
  // WIDGET_TYPES darf denselben Typ mehrfach führen (Varianten in der Palette) —
  // je Typ zählt der erste Eintrag, genau wie im Editor-Katalog.
  const defs = WIDGET_TYPES.filter((d, i) => WIDGET_TYPES.findIndex((x) => x.type === d.type) === i)
    .filter((d) => nurTypen.length === 0 || nurTypen.includes(d.type));
  if (defs.length === 0) {
    console.error(`Kein Widget-Typ passt zu: ${nurTypen.join(', ')}`);
    process.exit(2);
  }

  const pages = new Map<string, string>();
  for (const def of defs) {
    const boxen = SCALES.map(([n, sx, sy]) => [n, Math.round(def.w * sx), Math.round(def.h * sy)] as [string, number, number]);
    pages.set(`/_check_${def.type}.html`, baueSeite(def.type, def.props, boxen));
  }

  const { port, stop } = await starteServer(pages);
  const rows: Messung[] = [];
  try {
    for (const def of defs) {
      const raw = await starteBrowser(browser, `http://127.0.0.1:${port}/_check_${def.type}.html`);
      const m = raw.match(/ERG (\[.*\])/);
      if (!m?.[1]) {
        rows.push({ type: def.type, name: '-', w: def.w, h: def.h, ox: 0, oy: 0, cx: 0, cy: 0, who: '', err: 'keine Messung (Seite lud nicht)' });
        continue;
      }
      for (const r of JSON.parse(m[1]) as Omit<Messung, 'type'>[]) rows.push({ type: def.type, ...r });
    }
  } finally {
    stop();
  }

  const raus = rows.filter((r) => !r.err && (r.ox > TOLERANZ_PX || r.oy > TOLERANZ_PX));
  const clip = rows.filter((r) => !r.err && (r.cx > TOLERANZ_PX || r.cy > TOLERANZ_PX));
  const fehler = rows.filter((r) => r.err);

  console.log(`\n${rows.length} Messungen über ${defs.length} Widgets (Browser: ${browser})`);

  if (clip.length) {
    console.log(`\n— abgeschnitten (${clip.length}, nur Bericht — bei Laufband/Einflug-Alert Absicht):`);
    for (const r of clip) {
      console.log(`  ${r.type.padEnd(22)} ${r.name.padEnd(9)} ${`${r.w}x${r.h}`.padEnd(10)} +${r.cx}/${r.cy}`);
    }
  }
  if (fehler.length) {
    console.log(`\n— FEHLER (${fehler.length}, der Prüfer konnte nicht messen):`);
    for (const r of fehler) console.log(`  ${r.type.padEnd(22)} ${r.name.padEnd(9)} ${r.err}`);
  }
  if (raus.length) {
    console.log(`\n— RAGT-RAUS (${raus.length}) — Inhalt steht sichtbar über der Box:`);
    for (const r of raus) {
      console.log(`  ${r.type.padEnd(22)} ${r.name.padEnd(9)} ${`${r.w}x${r.h}`.padEnd(10)} +${r.ox}/${r.oy}  (${r.who})`);
    }
    console.log('\nMeist: container-type auf der Widget-Wurzel + cq-Einheiten in DERSELBEN Regel.');
  }

  // Nur echte Defekte machen rot: RAGT-RAUS und nicht gemessene Widgets.
  // „abgeschnitten" bleibt bewusst grün — sonst wäre der Lauf durch die
  // Einflug-Animationen dauerhaft rot und würde ignoriert.
  const rot = raus.length + fehler.length;
  console.log(rot === 0 ? '\nOK — kein Widget ragt aus seiner Box.' : `\nFEHLGESCHLAGEN — ${rot} Befund(e).`);
  process.exit(rot === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
