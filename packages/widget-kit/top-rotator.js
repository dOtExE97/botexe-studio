// top-rotator.js — Rotierende Bestenliste für Hochformat: zeigt Top Gifter,
// dann smooth übergeblendet Top Likes, dann Top Punkte usw. — untereinander.
// props: { sources?: 'gifts,likes,points', interval?: sek, limit?, accent?, showPic? }
const STYLE_ID = 'bx-tr-style';
const CSS = `
.bx-tr { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--bx-font-body); overflow: hidden;
  container-type: size; }
.bx-tr-head { position: relative; height: clamp(16px,9.5cqh,64px); margin-bottom: clamp(3px,1.6cqh,12px); flex: none; }
.bx-tr-title { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); font-size: calc(clamp(12px,min(4.4cqi,7cqh),38px) * var(--bx-fs, 1)); letter-spacing: .08em; text-transform: uppercase; color: var(--bx-text,#fff);
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 3px 5px rgba(0,0,0,.5);
  transition: opacity .35s, transform .35s; }
.bx-tr-list { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.bx-tr-list.out .bx-tr-row { opacity: 0; transform: translateY(-14px); }
.bx-tr-list.in .bx-tr-row { animation: bx-tr-rowin .45s cubic-bezier(.2,1.1,.3,1) backwards; }
@keyframes bx-tr-rowin { from { opacity: 0; transform: translateY(18px); } }
/* Zeile = eigener Größen-Container: Badge, Bild und Schrift bemessen sich an
   der Zeilenhöhe (cqh) statt an festen Pixeln. */
.bx-tr-row { display: flex; align-items: center; gap: clamp(4px,2.4cqi,22px); height: 54px; padding: 0 clamp(3px,1.4cqi,16px);
  flex: 1 1 0; min-height: 0; container-type: size; transition: opacity .3s, transform .3s; }
.bx-tr-rank { height: 54%; aspect-ratio: 1/1; width: auto; flex: none; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); font-size: calc(clamp(10px,27cqh,34px) * var(--bx-fs, 1)); color: #0a0b12; border-radius: 22%; background: #525873;
  -webkit-text-stroke: 0; box-shadow: 0 3px 8px rgba(0,0,0,.4); }
.bx-tr-row[data-rank="1"] .bx-tr-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); box-shadow: 0 0 16px -2px var(--bx-gold), 0 3px 8px rgba(0,0,0,.4); }
.bx-tr-row[data-rank="2"] .bx-tr-rank { background: linear-gradient(160deg,#eef2fb,#b9c2d8); }
.bx-tr-row[data-rank="3"] .bx-tr-rank { background: linear-gradient(160deg,#f0b487,#c9763c); }
/* Eigener Größen-Container, damit der Fallback-Buchstabe (.bx-av::after) mitwächst. */
.bx-tr-pic { height: 74%; aspect-ratio: 1/1; width: auto; flex: none; border-radius: 50%; container-type: size;
  box-shadow: 0 0 0 3px #5c9dff, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-pic::after { font-size: 52cqmin; }
.bx-tr-row[data-rank="1"] .bx-tr-pic { box-shadow: 0 0 0 3px var(--bx-gold), 0 0 18px -2px var(--bx-gold), 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-row[data-rank="2"] .bx-tr-pic { box-shadow: 0 0 0 3px #d7deec, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-row[data-rank="3"] .bx-tr-pic { box-shadow: 0 0 0 3px #f0a35a, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-crown { position: absolute; margin-top: -66cqh; margin-left: 34cqh; transform: rotate(-12deg); line-height: 0;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.7)); }
.bx-tr-crown svg { width: clamp(12px,36cqh,44px); height: auto; display: block; }
.bx-tr-name { flex: 1; min-width: 0; font-family: var(--bx-font-display); font-size: calc(clamp(11px,min(33cqh,5.4cqi),44px) * var(--bx-fs, 1)); color: var(--bx-text,#fff); text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.55); }
.bx-tr-row[data-rank="1"] .bx-tr-name { color: var(--bx-gold); }
.bx-tr-val { flex: none; font-family: var(--bx-font-display); font-size: calc(clamp(11px,min(33cqh,5cqi),44px) * var(--bx-fs, 1)); color: var(--bx-text,#fff);
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.55); }
.bx-tr-val .arr { font-size: calc(clamp(9px,23cqh,30px) * var(--bx-fs, 1)); -webkit-text-stroke: 2px var(--bx-ink, #0a0b12); }
.bx-tr-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-family: var(--bx-font-display);
  font-size: calc(clamp(11px,min(3.4cqi,10cqh),24px) * var(--bx-fs, 1)); letter-spacing: .1em; color: #c3cadd; text-transform: uppercase; }

/* ── Stil „Neon" — freistehend ohne Panel, Glow pur. */
.bx-tr-neon { background: none !important; box-shadow: none !important; border: none; }
.bx-tr-neon::before { display: none; }
.bx-tr-neon .bx-tr-row { background: none !important; }
.bx-tr-neon .bx-tr-name { text-shadow: 0 1px 0 rgba(0,0,0,.95), 0 2px 8px rgba(0,0,0,.9); }
.bx-tr-neon .bx-tr-val { text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 70%, transparent), 0 1px 0 rgba(0,0,0,.9); }

/* ── Stil „Pills" — Akzent-Pillen mit dunkler Schrift. */
.bx-tr-pills { background: none !important; box-shadow: none !important; }
.bx-tr-pills::before { display: none; }
.bx-tr-pills .bx-tr-row { background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2)) !important;
  border-radius: 999px; box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--bx-accent) 75%, transparent); margin-bottom: 6px; }
.bx-tr-pills .bx-tr-row[data-rank="1"] { background: linear-gradient(120deg, #ffe88a, var(--bx-gold)) !important; }
.bx-tr-pills .bx-tr-name { color: #0c0d14 !important; text-shadow: none; }
.bx-tr-pills .bx-tr-val { color: #0c0d14 !important; text-shadow: none; background: rgba(255,255,255,.72); border-radius: 999px; padding: 2px 10px; }
.bx-tr-pills .bx-tr-rank { background: rgba(12,13,20,.85) !important; color: #fff; border-radius: 50%; box-shadow: none !important; }

/* ── BAUCHBINDE — TV-Unterzeile: farbiger Rangblock links, breiter dunkler
   Balken, Name groß, Wert als Chip rechts. Schiebt sich seitlich ein. */
.bx-tr-banner { background: none; box-shadow: none; padding: 4px 2px; }
.bx-tr-banner::before { display: none; }
.bx-tr-banner .bx-tr-title { letter-spacing: .3em; }
.bx-tr-banner .bx-tr-row { gap: 0; padding: 0; overflow: hidden;
  border-radius: 0 10px 10px 0; background: linear-gradient(100deg, rgba(12,13,20,.94), rgba(12,13,20,.78));
  box-shadow: 0 6px 18px -8px rgba(0,0,0,.7); margin-bottom: 6px;
  border-left: 6px solid var(--bx-accent); animation: bx-tr-slide .45s cubic-bezier(.2,1.1,.3,1) backwards; }
@keyframes bx-tr-slide { from { opacity:0; transform: translateX(-26px); } }
.bx-tr-banner .bx-tr-rank { width: clamp(22px,74cqh,90px); height: 100%; aspect-ratio: auto; border-radius: 0; flex: none;
  background: var(--bx-accent) !important; box-shadow: none !important; color: #0c0d14; font-size: calc(clamp(12px,34cqh,42px) * var(--bx-fs, 1)); }
.bx-tr-banner .bx-tr-row[data-rank="1"] .bx-tr-rank { background: linear-gradient(160deg,#ffe88a,#f5b914) !important; }
.bx-tr-banner .bx-tr-pic { margin-left: clamp(4px,16cqh,20px); }
.bx-tr-banner .bx-tr-name { margin-left: clamp(5px,20cqh,24px); font-size: calc(clamp(12px,min(38cqh,5.6cqi),46px) * var(--bx-fs, 1)); letter-spacing: .02em; }
.bx-tr-banner .bx-tr-val { margin-right: clamp(5px,20cqh,24px); background: rgba(255,255,255,.10); border-radius: 999px; padding: 3px 14px; }
.bx-tr-banner .bx-tr-crown { margin-left: 118cqh; }

/* ── KARTE — jede Person eine eigene Karte: großes Bild links, Name und Wert
   übereinander rechts. Wirkt wie ein Kontakt-/Sammelkarten-Stapel. */
.bx-tr-karte { background: none; box-shadow: none; padding: 4px 2px; }
.bx-tr-karte::before { display: none; }
.bx-tr-karte .bx-tr-row { gap: clamp(5px,18cqh,22px); padding: 0 clamp(5px,18cqh,22px) 0 clamp(3px,12cqh,16px); margin-bottom: clamp(3px,2cqh,14px);
  border-radius: 14px; background: linear-gradient(150deg, rgba(24,26,38,.95), rgba(12,13,20,.92));
  box-shadow: 0 10px 22px -10px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.07);
  border: 1px solid color-mix(in srgb, var(--bx-accent) 30%, transparent); }
.bx-tr-karte .bx-tr-row[data-rank="1"] { border-color: color-mix(in srgb, var(--bx-gold) 60%, transparent);
  box-shadow: 0 10px 26px -10px rgba(0,0,0,.85), 0 0 22px -8px var(--bx-gold), inset 0 1px 0 rgba(255,255,255,.09); }
.bx-tr-karte .bx-tr-rank { height: 40%; width: auto; font-size: calc(clamp(9px,21cqh,26px) * var(--bx-fs, 1)); border-radius: 22%; }
.bx-tr-karte .bx-tr-pic { height: 78%; width: auto; border-radius: 22%; }
.bx-tr-karte .bx-tr-name { font-size: calc(clamp(11px,min(34cqh,5.6cqi),46px) * var(--bx-fs, 1)); }
.bx-tr-karte .bx-tr-val { font-size: calc(clamp(11px,min(34cqh,5cqi),46px) * var(--bx-fs, 1)); }
.bx-tr-karte .bx-tr-crown { margin-top: -62cqh; margin-left: 68cqh; }


/* ── SIEGEL — rundes Wappen: Profilbild im Kreis, Name darunter, Wert als
   Gravur. Nur Platz 1 groß, der Rest klein daneben. */
.bx-tr-siegel { background: none; box-shadow: none; }
.bx-tr-siegel::before { display: none; }
.bx-tr-siegel .bx-tr-list { display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 4%; }
.bx-tr-siegel .bx-tr-row { position: static; height: auto; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 6px; flex: 1 1 0; min-width: 0; border-radius: 50%; aspect-ratio: 1/1; justify-content: center;
  background: radial-gradient(circle at 50% 30%, rgba(30,32,46,.96), rgba(10,11,18,.96));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--bx-accent) 55%, transparent), 0 10px 24px -10px rgba(0,0,0,.8); }
.bx-tr-siegel .bx-tr-row[data-rank="1"] { box-shadow: 0 0 0 4px var(--bx-gold), 0 0 26px -6px var(--bx-gold), 0 10px 24px -10px rgba(0,0,0,.85); }
.bx-tr-siegel .bx-tr-rank { display: none; }
.bx-tr-siegel .bx-tr-pic { width: 46%; height: auto; aspect-ratio: 1/1; }
.bx-tr-siegel .bx-tr-name { flex: none; font-size: calc(clamp(10px, 15cqmin, 30px) * var(--bx-fs, 1)); text-align: center; max-width: 100%; }
.bx-tr-siegel .bx-tr-val { font-size: calc(clamp(9px, 13cqmin, 26px) * var(--bx-fs, 1)); }
.bx-tr-siegel .bx-tr-crown { margin-top: -30cqh; margin-left: 0; }

/* ── KASSETTE — Retro-Tape: Gehäuse mit zwei Spulen, Name auf dem Klebeetikett. */
.bx-tr-kassette { background: none; box-shadow: none; }
.bx-tr-kassette::before { display: none; }
.bx-tr-kassette .bx-tr-row { margin-bottom: clamp(3px,2cqh,14px); border-radius: 8px; padding: 0 clamp(4px,16cqh,20px);
  background: linear-gradient(180deg, #2a2d3c, #14161f); border: 2px solid #0a0b12;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 6px 16px -8px rgba(0,0,0,.8); }
.bx-tr-kassette .bx-tr-rank { border-radius: 50%; height: 42%; width: auto; font-size: calc(clamp(9px,21cqh,26px) * var(--bx-fs, 1));
  background: #0a0b12 !important; color: var(--bx-gold); box-shadow: inset 0 0 0 2px #4a5066 !important; }
.bx-tr-kassette .bx-tr-pic { border-radius: 50%; height: 55%; width: auto;
  box-shadow: 0 0 0 3px #0a0b12, 0 0 0 5px #4a5066 !important; }
.bx-tr-kassette .bx-tr-name { background: #f6f0e2; color: #2c2416 !important; text-shadow: none;
  border-radius: 3px; padding: 3px clamp(4px,14cqh,18px); font-size: calc(clamp(10px,min(27cqh,4.4cqi),36px) * var(--bx-fs, 1)); margin: 0 clamp(3px,12cqh,16px); flex: 1;
  box-shadow: inset 0 -1px 0 rgba(0,0,0,.15); -webkit-text-stroke: 0; }
.bx-tr-kassette .bx-tr-val { font-size: calc(clamp(10px,min(27cqh,4cqi),36px) * var(--bx-fs, 1)); color: var(--bx-gold) !important; }
.bx-tr-kassette .bx-tr-crown { margin-top: -50cqh; margin-left: 32cqh; }

/* ── „Rahmen ausblenden" (bx-frameless) ───────────────────────────────────
   Namen und Werte tragen schon von Haus aus eine Kontur und bleiben auch ohne
   Panel lesbar. Nur der Leer-Hinweis war ein blasses Grau, das ohne Fläche auf
   hellem Video verschwand. */
.bx-frameless .bx-tr-empty { color: #fff;
  -webkit-text-stroke: max(1.5px, .075em) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 max(1px, .04em) max(3px, .1em) rgba(0,0,0,.6); }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Auslöser auf der ZEILE — aber NICHT beim Weiterdrehen (dann wechselt nur die
   Ansicht, es ist nichts passiert), sondern nur, wenn frische Zahlen jemanden
   neu in die Liste bringen oder nach oben ziehen.
   Die Zeilen sind Flex-Kinder ohne eigenes transform → die volle Choreografie
   der Basis (Anheben + Ring + Aufblitzen) passt hier unverändert.

   KOLLISION: Beim animierten Aufbau trägt die Liste .in, und
   „.bx-tr-list.in .bx-tr-row“ setzt die Einflug-Animation — die hätte die
   Auslöser-Choreografie überschrieben. Darum hier beides gemeinsam. */
.bx-premium .bx-tr-list.in .bx-tr-row.bx-hit {
  animation: bx-tr-rowin .45s cubic-bezier(.2,1.1,.3,1) backwards,
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Bauchbinde: die Zeile schiebt sich seitlich ein — auch das erhalten. */
.bx-premium .bx-tr-banner .bx-tr-list.in .bx-tr-row.bx-hit {
  animation: bx-tr-slide .45s cubic-bezier(.2,1.1,.3,1) backwards,
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Das Anheben der Basis bleibt bewusst weg (im Bild geprüft): die Zeile ist so
   breit wie die Box, die Box schneidet über overflow ab — beim Anheben wurden
   die Werte am rechten Rand abgeschnitten. Ring und Aufblitzen des Profilbildes
   tragen den Moment ohne Ortswechsel. */
.bx-premium .bx-tr-row.bx-hit { animation: bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Der Siegel-Stil ist ein Rund — der Ring folgt seiner Form von selbst, weil er
   am Element hängt und die Zeile dort border-radius:50% trägt. */
/* Die Krone ist eine feste Form, kein Bild — sie behält ihren eigenen Saum. */
.bx-premium .bx-tr-crown { filter: drop-shadow(0 2px 3px rgba(0,0,0,.7)); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
const SRC = {
  gifts: { title: 'Top Gifter', accent: '#ff5436', valColor: '#ffd23e', list: (s) => s?.topGifters || [], val: (e) => fmt(e.coins), arr: '▲' },
  likes: { title: 'Top Likes', accent: '#ff5e8a', valColor: '#ff8ab0', list: (s) => s?.topLikers || [], val: (e) => `${fmt(e.likes)} ❤`, arr: '▲' },
  points: { title: 'Top Supporter', accent: '#7c5cff', valColor: '#b59cff', list: (s) => s?.topPoints || [], val: (e) => fmt(e.points), arr: '★' },
  wins: { title: 'Top Gewinner', accent: '#ffd23e', valColor: '#ffe88a', list: (s) => s?.topWinners || [], val: (e) => `${e.gameWins || 0} 🏆`, arr: '★' },
};

/* ── Avatar-Fallback (bewusst je Widget dupliziert, kein gemeinsames JS-Modul):
   ohne Bild — oder wenn das Laden scheitert — erscheint der Anfangsbuchstabe
   auf einem aus dem Namen abgeleiteten Farbton statt eines schwarzen Kreises. */
function avHue(name) { const s = String(name || ''); let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i); return h % 360; }
function avSet(el, name, url) {
  if (!el) return;
  const s = String(name || '').trim();
  el.classList.add('bx-av');
  el.dataset.initial = (s[0] || '?').toUpperCase();
  el.style.setProperty('--bx-av-h', String(avHue(s)));
  el.classList.remove('bx-av-img');
  el.style.backgroundImage = '';
  if (!url) return;
  const img = new Image();
  img.onload = () => { if (el.isConnected) { el.style.backgroundImage = `url("${cssUrl(url)}")`; el.classList.add('bx-av-img'); } };
  img.src = url;
}
/** URL sicher in CSS url("…") einbetten — nur Quotes escapen, nie nachencodieren. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }
/** Demo-Daten für die Editor-Vorschau — sonst steht dort nur „— noch keine —". */
const DEMO = {
  topGifters: [{ id: 'd1', nickname: 'BigBen', coins: 8400 }, { id: 'd2', nickname: 'Mia', coins: 5200 }, { id: 'd3', nickname: 'LeonGG', coins: 3100 }, { id: 'd4', nickname: 'Nova', coins: 1800 }, { id: 'd5', nickname: 'Sara_99', coins: 940 }, { id: 'd6', nickname: 'ExE', coins: 610 }, { id: 'd7', nickname: 'Kaan', coins: 320 }, { id: 'd8', nickname: 'Pia', coins: 150 }],
  topLikers: [{ id: 'd1', nickname: 'Mia', likes: 3200 }, { id: 'd2', nickname: 'Nova', likes: 1450 }, { id: 'd3', nickname: 'LeonGG', likes: 900 }, { id: 'd4', nickname: 'BigBen', likes: 420 }, { id: 'd5', nickname: 'Sara_99', likes: 260 }, { id: 'd6', nickname: 'ExE', likes: 180 }, { id: 'd7', nickname: 'Kaan', likes: 95 }, { id: 'd8', nickname: 'Pia', likes: 60 }],
  topPoints: [{ id: 'd1', nickname: 'Mia', points: 12450 }, { id: 'd2', nickname: 'Nova', points: 8400 }, { id: 'd3', nickname: 'ExE', points: 6100 }, { id: 'd4', nickname: 'BigBen', points: 3200 }, { id: 'd5', nickname: 'Sara_99', points: 1800 }, { id: 'd6', nickname: 'LeonGG', points: 950 }, { id: 'd7', nickname: 'Kaan', points: 470 }, { id: 'd8', nickname: 'Pia', points: 220 }],
  topWinners: [{ id: 'd1', nickname: 'Mia', gameWins: 4 }, { id: 'd2', nickname: 'Nova', gameWins: 3 }, { id: 'd3', nickname: 'ExE', gameWins: 2 }, { id: 'd4', nickname: 'Kaan', gameWins: 1 }],
};
export default class TopRotator {
  constructor(root, props, ctx) {
    ensureStyle();
    this.root = root;
    this.fixedAccent = props.accent || null;
    this.sources = String(props.sources || 'gifts,likes').split(',').map((x) => x.trim()).filter((x) => SRC[x]);
    if (this.sources.length === 0) this.sources = ['gifts', 'likes'];
    this.interval = Math.max(2, Number(props.interval ?? 5)) * 1000;
    this.limit = Math.min(8, Math.max(1, Number(props.limit ?? 5)));
    this.showPic = props.showPic !== false;
    this.idx = 0;
    this.preview = !!ctx?.preview;
    this.stats = this.preview ? DEMO : null;
    this.el = document.createElement('div');
    const style = ['glas', 'neon', 'pills', 'banner', 'karte', 'siegel', 'kassette'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-tr${style !== 'glas' ? ` bx-tr-${style}` : ''}`;
    this.el.innerHTML = `<div class="bx-tr-head"><div class="bx-tr-title"></div></div><div class="bx-tr-list in"></div>`;
    this.titleEl = this.el.querySelector('.bx-tr-title');
    this.listEl = this.el.querySelector('.bx-tr-list');
    // Letzter bekannter Platz je Quelle+Person → daraus folgt, wer neu ist bzw.
    // wer geklettert ist. Pro Quelle getrennt, sonst meldet jeder Rotationsschritt
    // lauter „Aufstiege".
    this.ranks = new Map();
    this.timers = new Set();
    root.appendChild(this.el);
    this.render(true);
    if (this.sources.length > 1) this.timer = setInterval(() => this.rotate(), this.interval);
  }
  rotate() {
    this.idx = (this.idx + 1) % this.sources.length;
    // raus-animation, dann wechseln + rein
    this.listEl.classList.add('out');
    this.titleEl.style.opacity = '0';
    this.titleEl.style.transform = 'translateY(-8px)';
    setTimeout(() => { this.render(true); this.listEl.classList.remove('out'); this.titleEl.style.opacity=''; this.titleEl.style.transform=''; }, 360);
  }
  onStats(stats) { this.stats = stats; this.render(false); }
  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu: so springt der Effekt auch bei schnellen Folgen erneut an. */
  hit(el) {
    if (!el) return;
    el.classList.remove('bx-hit');
    void el.offsetWidth;
    el.classList.add('bx-hit');
    const t = setTimeout(() => { this.timers.delete(t); el.classList.remove('bx-hit'); }, 900);
    this.timers.add(t);
  }
  render(animate) {
    const key = this.sources[this.idx];
    const def = SRC[key];
    const accent = this.fixedAccent || def.accent;
    this.root.style.setProperty('--bx-accent', accent);
    this.titleEl.textContent = def.title;
    const items = def.list(this.stats).slice(0, this.limit);
    this.listEl.classList.toggle('in', !!animate);
    if (animate) void this.listEl.offsetWidth;
    if (items.length === 0) { this.listEl.innerHTML = `<div class="bx-tr-empty">— noch keine —</div>`; return; }
    this.listEl.innerHTML = items.map((e, i) => `
      <div class="bx-tr-row" data-rank="${i+1}" style="animation-delay:${i*60}ms">
        <div class="bx-tr-rank">${i+1}</div>
        ${this.showPic ? `<div class="bx-tr-pic"></div>${i===0?'<div class="bx-tr-crown"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="17" viewBox="0 0 24 18"><path d="M2 6.2l3.6 3.1L9.4 3l2.6 4.2L14.6 3l3.8 6.3L22 6.2l-1.7 9.3a1 1 0 0 1-1 .8H4.7a1 1 0 0 1-1-.8L2 6.2Z" fill="#ffd23e" stroke="rgba(0,0,0,.55)" stroke-width=".8" stroke-linejoin="round"/><circle cx="2" cy="6.2" r="1.4" fill="#ffd23e"/><circle cx="12" cy="2.4" r="1.4" fill="#ffd23e"/><circle cx="22" cy="6.2" r="1.4" fill="#ffd23e"/></svg></div>':''}` : ''}
        <div class="bx-tr-name">${escapeHtml(e.nickname)}</div>
        <div class="bx-tr-val" style="color:${i===0&&key!=='points'?def.valColor:'var(--bx-text,#fff)'}"><span class="arr">${def.arr}</span> ${def.val(e)}</div>
      </div>`).join('');
    // Profilbilder nach dem Einhängen setzen — mit Buchstaben-Fallback, wenn
    // TikTok keine oder eine tote Bild-URL liefert.
    if (this.showPic) {
      const pics = this.listEl.querySelectorAll('.bx-tr-pic');
      items.forEach((e, i) => avSet(pics[i], e.nickname, e.profilePic));
    }
    // Bemerkenswerter Moment: in DIESER Liste neu dabei oder nach oben geklettert.
    // Beim ersten Aufbau einer Quelle ist noch nichts bekannt → kein Auslöser,
    // sonst würde jeder Rotationsschritt die ganze Liste aufblitzen lassen.
    const rows = this.listEl.querySelectorAll('.bx-tr-row');
    const bekannt = this.ranks.has(key);
    const vorher = this.ranks.get(key) || new Map();
    const jetzt = new Map();
    items.forEach((e, i) => {
      const id = e.id ?? e.nickname;
      const alt = vorher.get(id);
      if (bekannt && (alt == null || i + 1 < alt)) this.hit(rows[i]);
      jetzt.set(id, i + 1);
    });
    this.ranks.set(key, jetzt);
  }
  destroy() { clearInterval(this.timer); for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
