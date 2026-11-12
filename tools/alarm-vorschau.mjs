#!/usr/bin/env node
// alarm-vorschau.mjs — rendert eine Alarm-Animation aus packages/widget-kit/alarm-anim.js
// Bild für Bild über headless Chrome zu einem MP4 (für den Sichtvergleich mit den
// abgenommenen Proben-Videos). Muster: docs/superpowers/specs/2026-11-10-proben/render.mjs.
//
//   node tools/alarm-vorschau.mjs <id> [Optionen]
//     --art team|gifter     Farbschema (Standard team)
//     --name "Text"         Anzeigename (Standard „Schwester Mary")
//     --alt N --neu N       Stufen (Standard 11 → 12)
//     --bild <datei>        Profilbild (PNG/JPG); ohne → Initiale
//     --token <datei>       piraten-orakel: Token-Bild (PNG); ohne → gezeichnete Münze
//     --kiste <datei>       piraten-orakel: Kistenbild (PNG); ohne → gezeichnete Truhe
//     --fps N               Bildrate (Standard 30; 60 prüft die Interpolation)
//     --hintergrund RRGGBB  Untergrund (Standard 2a2a2a)
//     --ohne-ton            Standard-Sound NICHT unterlegen
//     --aus <ordner>        Zielordner (Standard .tmp/alarm-vorschau)
//     --daten '{json}'      weitere daten-Felder, z. B. '{"neuAbo":true,"coins":500}'
//     --datei <name>        Dateiname ohne .mp4 (Standard: <id>[-gifter][-60fps])
//
// Braucht google-chrome (oder CHROME=/pfad) und ffmpeg im PATH.
// Headless-Fallen (AGENTS.md): kein --disable-gpu, kein requestAnimationFrame —
// die Seite zeichnet jedes Bild direkt und schickt es per fetch zurück.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(ROOT, 'packages', 'widget-kit');

const args = process.argv.slice(2);
const id = args[0];
if (!id || id.startsWith('--')) {
  console.error('Aufruf: node tools/alarm-vorschau.mjs <id> [--art gifter] [--bild datei] [--fps 60] [--aus ordner]');
  process.exit(2);
}
const opt = (name, std) => { const i = args.indexOf(`--${name}`); return i > 0 && args[i + 1] !== undefined ? args[i + 1] : std; };
const art = opt('art', 'team');
const fps = Number(opt('fps', '30'));
const bildDatei = opt('bild', '');
const tokenDatei = opt('token', '');
const kisteDatei = opt('kiste', ''); // piraten-orakel: eigenes Kistenbild (nur lokal) // piraten-orakel: eigenes Token-Bild (nur lokal, nie ins Repo)
const hintergrund = opt('hintergrund', '2a2a2a');
const mitTon = !args.includes('--ohne-ton');
const ausOrdner = path.resolve(opt('aus', path.join(ROOT, '.tmp', 'alarm-vorschau')));
const daten = {
  name: opt('name', 'Schwester Mary'), alt: Number(opt('alt', '11')), neu: Number(opt('neu', '12')), art, bild: bildDatei ? '/bild' : '', tokenBild: tokenDatei ? '/token' : '', kisteBild: kisteDatei ? '/kiste' : '',
  ...JSON.parse(opt('daten', '{}')),
};

const { ANIMATIONEN } = await import(path.join(KIT, 'alarm-anim.js'));
const eintrag = ANIMATIONEN[id];
if (!eintrag) { console.error(`Unbekannte Animation „${id}". Vorhanden: ${Object.keys(ANIMATIONEN).join(', ')}`); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alarm-vorschau-'));
const bilder = path.join(tmp, 'bilder');
fs.mkdirSync(bilder);
fs.mkdirSync(ausOrdner, { recursive: true });

const SEITE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}</style></head><body>
<canvas id="c" width="1080" height="1920"></canvas>
<script type="module">
import { erzeugeRenderer, ladeSchrift } from '/widgets/alarm-anim.js';
const melde = (t) => fetch('/log?' + encodeURIComponent(t));
try {
  await ladeSchrift(location.origin, '');
  await melde('schrift=' + document.fonts.check('900 50px BxInter'));
  const r = erzeugeRenderer(${JSON.stringify(id)}, ${JSON.stringify(daten)});
  await new Promise((ok) => setTimeout(ok, 400)); // Profilbild laden lassen
  const c = document.getElementById('c'), g = c.getContext('2d');
  const n = Math.round(r.dauer * ${fps});
  for (let i = 0; i <= n; i++) {
    r.zeichne(g, i / ${fps}, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    await fetch('/bild-ein?i=' + i, { method: 'POST', body: blob });
  }
  r.destroy();
} catch (e) { await melde('FEHLER ' + (e && e.stack || e)); }
await fetch('/fertig');
</script></body></html>`;

const TYPEN = { '.js': 'application/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
let chrome, anzahl = 0, fehler = false;
const fertig = new Promise((aufloesen) => {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(SEITE); }
    if (u.pathname === '/log') { const t = decodeURIComponent(u.search.slice(1)); if (t.startsWith('FEHLER')) fehler = true; console.log('seite:', t); return res.end('ok'); }
    if (u.pathname === '/bild-ein') {
      const teile = [];
      req.on('data', (d) => teile.push(d));
      req.on('end', () => { fs.writeFileSync(path.join(bilder, `f${String(u.searchParams.get('i')).padStart(4, '0')}.png`), Buffer.concat(teile)); anzahl++; res.end('ok'); });
      return;
    }
    if (u.pathname === '/fertig') { res.end('ok'); chrome.kill(); srv.close(); return aufloesen(); }
    let datei = '';
    if (u.pathname === '/bild' && bildDatei) datei = path.resolve(bildDatei);
    else if (u.pathname === '/token' && tokenDatei) datei = path.resolve(tokenDatei);
    else if (u.pathname === '/kiste' && kisteDatei) datei = path.resolve(kisteDatei);
    else if (u.pathname.startsWith('/widgets/')) datei = path.join(KIT, path.basename(u.pathname));
    if (!datei || !fs.existsSync(datei)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', TYPEN[path.extname(datei)] || 'application/octet-stream');
    fs.createReadStream(datei).pipe(res);
  });
  srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port;
    const bin = process.env.CHROME || ['google-chrome', 'chromium', 'chromium-browser'].find((b) => spawnSync('which', [b]).status === 0);
    if (!bin) { console.error('Kein Chrome gefunden (CHROME=/pfad setzen).'); process.exit(1); }
    chrome = spawn(bin, ['--headless=new', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${path.join(tmp, 'chrome')}`, '--window-size=1080,1920', `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
    setTimeout(() => { console.error('Zeitüberschreitung'); chrome.kill(); process.exit(1); }, 600000).unref();
  });
});
await fertig;
if (fehler || anzahl === 0) { console.error(`Abbruch: ${anzahl} Bilder, Fehler in der Seite.`); process.exit(1); }

const ziel = path.join(ausOrdner, `${opt('datei', `${id}${art === 'gifter' ? '-gifter' : ''}${fps !== 30 ? `-${fps}fps` : ''}`)}.mp4`);
const ton = path.join(KIT, 'sounds', eintrag.sound);
const ff = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x${hintergrund}:s=1080x1920:r=${fps}`,
  '-framerate', String(fps), '-i', path.join(bilder, 'f%04d.png')];
if (mitTon && fs.existsSync(ton)) ff.push('-i', ton);
ff.push('-filter_complex', '[0][1]overlay=shortest=1,format=yuv420p', '-c:v', 'libx264', '-crf', '18');
if (mitTon && fs.existsSync(ton)) ff.push('-c:a', 'aac', '-b:a', '160k');
ff.push(ziel);
const r = spawnSync('ffmpeg', ff, { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0) { console.error('ffmpeg ist gescheitert.'); process.exit(1); }
console.log(`fertig: ${anzahl} Bilder → ${path.relative(ROOT, ziel)}`);
