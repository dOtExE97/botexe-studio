import WebSocket from 'ws';
let id = 0;
const send = (ws, m, p = {}) => new Promise((ok, err) => {
  const n = ++id;
  const h = (d) => { const x = JSON.parse(String(d)); if (x.id === n) { ws.off('message', h); x.error ? err(new Error(x.error.message)) : ok(x.result); } };
  ws.on('message', h); ws.send(JSON.stringify({ id: n, method: m, params: p }));
});
const ev = async (ws, e) => (await send(ws, 'Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const t = targets.find((x) => x.type === 'page' && !x.url.includes('overlay'));
const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((ok) => ws.on('open', ok));
await send(ws, 'Runtime.enable');
await ev(ws, `(() => { const b=[...document.querySelectorAll('nav button')].find(x=>(x.textContent||'').trim().startsWith('Overlay')); b&&b.click(); return 1; })()`);
await new Promise((r) => setTimeout(r, 2500));
// Live-Vorschau EINSCHALTEN, falls sie im Profil aus steht.
console.log('Live-Schalter vorher:', await ev(ws, `localStorage.getItem('bx-palette-live')`));
await ev(ws, `(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Live aus'); if(b){b.click(); return 'eingeschaltet';} return 'war schon an'; })()`);
await new Promise((r) => setTimeout(r, 4000));
console.log('— SCHMALE LEISTE —');
console.log(await ev(ws, `(() => {
  const a = document.querySelector('aside[data-palette-scroll]') || document.querySelector('[data-palette-scroll]');
  return JSON.stringify({
    livePaletteGespeichert: localStorage.getItem('bx-palette-live'),
    iframesInLeiste: a ? a.querySelectorAll('iframe').length : -1,
    knoepfeInLeiste: a ? a.querySelectorAll('button').length : -1,
    liveKnopf: [...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(t=>t.startsWith('Live')),
    platzhalterInLeiste: a ? [...a.querySelectorAll('div')].filter(d=>d.textContent==='Vorschau …').length : -1,
    iframeSrc: (document.querySelector('iframe')?.src || 'KEINER').slice(0, 78),
  }, null, 1);
})()`));
await ev(ws, `(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('Alle Widgets')); b&&b.click(); return 1; })()`);
await new Promise((r) => setTimeout(r, 7000));
console.log('— KATALOG —');
console.log(await ev(ws, `(() => {
  const bereiche=[...document.querySelectorAll('[data-palette-scroll]')];
  const k = bereiche.find(b=>b.querySelector('[data-kat]'));
  return JSON.stringify({
    iframesImKatalog: k ? k.querySelectorAll('iframe').length : -1,
    kachelnImKatalog: k ? k.querySelectorAll('button').length : -1,
    ersteKachelTag: k ? (k.querySelector('[data-kat] > div > *')?.tagName ?? '?') : '?',
    vorschauPlatzhalter: k ? [...k.querySelectorAll('div')].filter(d=>d.textContent==='Vorschau …').length : -1,
    iframesImDokument: document.querySelectorAll('iframe').length,
  }, null, 1);
})()`));

console.log('— SICHTBARKEITSMELDER —');
console.log(await ev(ws, `(async () => {
  const bereiche=[...document.querySelectorAll('[data-palette-scroll]')];
  const k = bereiche.find(b=>b.querySelector('[data-kat]')) || bereiche[0];
  const ziel = k && k.querySelector('div');
  if (!ziel) return 'kein Ziel gefunden';
  const r = ziel.getBoundingClientRect();
  return await new Promise((ok) => {
    const io = new IntersectionObserver((e) => ok('meldet isIntersecting=' + e[0].isIntersecting + ' | Kachel ' + Math.round(r.width) + 'x' + Math.round(r.height)), { root: k });
    io.observe(ziel);
    setTimeout(() => ok('KEINE Meldung nach 1500ms | Kachel ' + Math.round(r.width) + 'x' + Math.round(r.height)), 1500);
  });
})()`));
ws.close();
