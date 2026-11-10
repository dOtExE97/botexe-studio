// tools/einblender-vorschau.mjs — rendert das Einblender-Widget Bild für Bild
// (30 fps) über headless Chrome zu PNGs und, falls ffmpeg da ist, zu einer MP4.
//
//   node tools/einblender-vorschau.mjs <ausgabe.mp4> [look=neon] [szenen=tippen,teilen,folgen] [handle=dotexe_97]
//
// Geht über den ECHTEN Widget-Pfad (Default-Export, Schrift-Laden, contain-
// Skalierung in eine 1080×560-Box) und spult mit inst.bild(t) statt mit rAF —
// headless feuert requestAnimationFrame nicht (AGENTS.md, Screenshot-Fallen).
// Hintergrund ist ein ruhiger Verlauf, damit Transparenz/Schein beurteilbar sind.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(ROOT, 'packages/widget-kit');
const [ausgabe = 'einblender.mp4', look = 'neon', szenen = 'tippen,teilen,folgen', handle = 'dotexe_97'] = process.argv.slice(2);
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'einblender-'));

const props = {
  look, szenen: szenen ? szenen.split(',') : [], intro: 'IHR WOLLT SUPPORTEN?', abschluss: 'DANKE', handle,
  intervallMin: 0, auto: false, sound: 'off',
};
const SEITE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}
#box{position:absolute;left:0;top:0;width:1080px;height:560px;container-type:size}</style></head>
<body><div id="box"></div><script>
addEventListener('error', (e) => fetch('/log?err=' + encodeURIComponent(e.message)));
addEventListener('unhandledrejection', (e) => fetch('/log?err=' + encodeURIComponent(String(e.reason && e.reason.stack || e.reason))));
fetch('/log?start=1');
</script><script type="module">
const M = (await import('/einblender.js')).default;
const box = document.getElementById('box');
const inst = new M(box, ${JSON.stringify(props)}, { preview: false, playSound() {} });
await document.fonts.load('100px BxInter');
await fetch('/log?font=' + document.fonts.check('100px BxInter'));
const c = box.querySelector('canvas');
const n = Math.round(inst.renderer.dauer * 30);
for (let i = 0; i <= n; i++) {
  inst.bild(Math.min(i / 30, inst.renderer.dauer - 1e-6));
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await fetch('/frame?i=' + i, { method: 'POST', body: blob });
}
inst.destroy();
await fetch('/done');
</script></body></html>`;

let chrome;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/frame') {
    const teile = [];
    req.on('data', (d) => teile.push(d));
    req.on('end', () => {
      fs.writeFileSync(path.join(frames, `f${String(u.searchParams.get('i')).padStart(4, '0')}.png`), Buffer.concat(teile));
      res.end('ok');
    });
    return;
  }
  if (u.pathname === '/log') { console.log('log:', u.search); return res.end('ok'); }
  if (u.pathname === '/done') { res.end('ok'); chrome.kill(); srv.close(); fertig(); return; }
  if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(SEITE); }
  const f = path.join(KIT, path.basename(u.pathname));
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  const typ = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
  res.setHeader('Content-Type', typ);
  fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', () => {
  const port = srv.address().port;
  chrome = spawn('google-chrome', ['--headless=new', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(frames, '.chrome')}`, '--window-size=1080,560', `http://127.0.0.1:${port}/`], { stdio: process.env.DBG ? 'inherit' : 'ignore' });
  setTimeout(() => { console.log('Zeitüberschreitung'); chrome.kill(); process.exit(1); }, 300000).unref();
});

function fertig() {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(frames, 'f%04d.png'),
    '-f', 'lavfi', '-i', 'gradients=s=1080x560:c0=0x2a3a4a:c1=0x4a5a3a:duration=10:speed=0.01',
    '-filter_complex', '[1][0]overlay=shortest=1,format=yuv420p', '-c:v', 'libx264', '-crf', '18', ausgabe], { stdio: 'inherit' });
  console.log(r.status === 0 ? `fertig: ${ausgabe} (Einzelbilder: ${frames})` : `ffmpeg fehlgeschlagen — Einzelbilder: ${frames}`);
}
