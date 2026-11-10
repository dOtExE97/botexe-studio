// Serviert anim.html, sammelt die Einzelbilder ein, beendet Chrome danach.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const dir = path.dirname(new URL(import.meta.url).pathname);
const page = process.argv[2] || 'anim.html';
const outDir = path.join(dir, process.argv[3] || 'frames');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);
let chrome, n = 0;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/frame') {
    const parts = [];
    req.on('data', d => parts.push(d));
    req.on('end', () => {
      fs.writeFileSync(path.join(outDir, `f${String(u.searchParams.get('i')).padStart(4, '0')}.png`), Buffer.concat(parts));
      n++; res.end('ok');
    });
    return;
  }
  if (u.pathname === '/log') { console.log('log:', u.search); return res.end('ok'); }
  if (u.pathname === '/done') { res.end('ok'); console.log(`fertig: ${n} Bilder`); chrome.kill(); srv.close(); return; }
  const f = path.join(dir, u.pathname === '/' ? page : u.pathname.slice(1));
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', () => {
  const port = srv.address().port;
  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(dir, '.chrome')}`, '--window-size=1080,1920', `http://127.0.0.1:${port}/?${process.argv[4] || ''}`], { stdio: 'ignore' });
  setTimeout(() => { console.log('Zeitüberschreitung'); chrome.kill(); process.exit(1); }, 600000).unref();
});
