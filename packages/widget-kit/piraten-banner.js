// piraten-banner.js — Dauer-Banner für den Follow-Gag „Piraten-Orakel":
// erklärt den Zuschauern, was ein Follow bringt („FOLLOW = KISTEN BIS ZUM
// TOKEN"). Goldene Plakette, Token dreht sich langsam, Glanz läuft drüber.
// Bei jedem Follow blitzt das Banner kurz auf und das Token wirbelt.
//
// Token- und Kistenbild lädt der Nutzer selbst hoch (Medien-Bibliothek). Die
// Originalgrafiken gehören Epic und kommen deshalb NIE ins Repo — ohne Bild
// zeichnet das Widget eine eigene Goldmünze.
// props: { titel?, unterzeile?, chance?, zeigeChance?, tokenId?, kisteId? }
const STYLE_ID = 'bx-pb-style';
const CSS = `
.bx-pb { position:absolute; inset:0; container-type:size; display:flex; align-items:center; justify-content:center; }
.bx-pb-plak { position:relative; box-sizing:border-box; width:100%; height:100%; display:flex; align-items:center;
  gap: 3cqh; padding: 0 5cqh 0 4cqh; overflow:hidden; border-radius: min(26cqh, 8cqi);
  border: max(2px, 3.2cqh) solid transparent;
  background:
    radial-gradient(120% 140% at 18% 50%, rgba(255,170,40,.22), transparent 55%) padding-box,
    linear-gradient(180deg, rgba(46,22,5,.94), rgba(16,7,1,.96)) padding-box,
    linear-gradient(120deg, #fff3c4, #d9952a 22%, #7a4a0a 40%, #ffd56b 58%, #b8761a 78%, #fff0b8) border-box;
  box-shadow: 0 0 6cqh rgba(255,150,30,.45), 0 1.5cqh 4cqh rgba(0,0,0,.55), inset 0 0 5cqh rgba(0,0,0,.6); }
.bx-frameless .bx-pb-plak { background:none !important; box-shadow:none !important; }
/* Glanz-Sweep über die ganze Plakette */
.bx-pb-plak::after { content:''; position:absolute; inset:0; pointer-events:none;
  background: linear-gradient(105deg, transparent 38%, rgba(255,240,200,.28) 48%, rgba(255,255,255,.5) 50%, rgba(255,240,200,.28) 52%, transparent 62%);
  transform: translateX(-110%); animation: bx-pb-sweep 5.5s ease-in-out infinite; }
@keyframes bx-pb-sweep { 0%,55% { transform:translateX(-110%) } 85%,100% { transform:translateX(110%) } }

/* Token links */
.bx-pb-tok { position:relative; flex:0 0 auto; width:min(82cqh, 26cqi); aspect-ratio:1; perspective: 200cqh; }
.bx-pb-tok::before { content:''; position:absolute; inset:-14%; border-radius:50%;
  background: radial-gradient(circle, rgba(255,215,120,.75), rgba(255,160,30,0) 68%);
  animation: bx-pb-glow 2.4s ease-in-out infinite; }
@keyframes bx-pb-glow { 0%,100% { opacity:.55; scale:.92 } 50% { opacity:1; scale:1.06 } }
.bx-pb-dreh { position:absolute; inset:0; animation: bx-pb-spin 6s ease-in-out infinite; transform-style:preserve-3d; }
@keyframes bx-pb-spin { 0%,62% { transform:rotateY(0) } 82%,100% { transform:rotateY(360deg) } }
.bx-pb-dreh img { width:100%; height:100%; object-fit:contain; filter: drop-shadow(0 1.2cqh 1.6cqh rgba(0,0,0,.6)); }
/* Eigene Münze, wenn kein Bild hochgeladen ist */
.bx-pb-muenze { position:absolute; inset:6%; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background: radial-gradient(circle at 35% 30%, #fffbe0, #ffd56b 30%, #d9952a 62%, #8a5208);
  box-shadow: inset 0 0 0 3.5cqh rgba(255,236,170,.55), inset 0 -2cqh 4cqh rgba(90,45,0,.6), 0 1.2cqh 2cqh rgba(0,0,0,.55);
  color:#6a3a02; font: 900 40cqh/1 var(--bx-font-display, 'Lilita One', sans-serif); text-shadow: 0 .4cqh 0 rgba(255,240,190,.7); }

/* Texte */
.bx-pb-txt { position:relative; flex:1 1 auto; min-width:0; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; gap: 1.5cqh; }
.bx-pb-titel { display:flex; align-items:center; justify-content:center; gap:.28em; white-space:nowrap; line-height:1;
  font-family: var(--bx-font-display, 'Lilita One', sans-serif); font-weight:900; letter-spacing:.02em;
  font-size: calc(clamp(10px, min(30cqh, 6.4cqi), 220px) * var(--bx-fs, 1)); }
.bx-pb-gold { background: linear-gradient(180deg, #fffbe8 0%, #ffe39a 38%, #f2ae3a 56%, #ffd56b 80%, #fff0c0 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter: drop-shadow(0 .06em 0 #4a2200) drop-shadow(0 0 .22em rgba(255,140,0,.55)); }
.bx-pb-pille { padding: .12em .42em .1em; border-radius:.5em; color:#fff; font-size:.82em;
  background: linear-gradient(180deg, #ff4f7e, #e0174f); box-shadow: 0 .08em 0 #7a0626, 0 0 .4em rgba(255,60,110,.55); }
.bx-pb-gleich { color:#ffe9a8; filter: drop-shadow(0 .06em 0 #4a2200); }
.bx-pb-unter { white-space:nowrap; line-height:1.1; color:#ffe9c4; font-weight:700; letter-spacing:.06em;
  font-family: var(--bx-font-body, var(--bx-font-display, sans-serif));
  font-size: calc(clamp(8px, min(12cqh, 2.7cqi), 90px) * var(--bx-fs, 1)); text-shadow: 0 .1em .3em rgba(0,0,0,.8); }
.bx-pb-chance { color:#e9c77a; opacity:.92; }

/* Kiste rechts (optional) */
.bx-pb-kiste { flex:0 0 auto; height:96cqh; width:auto; max-width:30cqi; object-fit:contain;
  filter: drop-shadow(0 1.2cqh 1.8cqh rgba(0,0,0,.6)); animation: bx-pb-wipp 3.2s ease-in-out infinite; transform-origin: 50% 90%; }
/* Hochkant-Box: Token oben, Text darunter, Überschrift darf umbrechen */
@container (max-aspect-ratio: 3/2) {
  .bx-pb-plak { flex-direction:column; justify-content:center; padding: 5cqh 6cqi; gap: 2cqh; }
  .bx-pb-tok { width: min(26cqh, 50cqi); }
  .bx-pb-txt { flex:0 1 auto; width:100%; }
  .bx-pb-titel { flex-wrap:wrap; white-space:normal; font-size: calc(clamp(10px, min(9cqh, 11cqi), 160px) * var(--bx-fs, 1)); }
  .bx-pb-unter { white-space:normal; font-size: calc(clamp(8px, min(4cqh, 5cqi), 60px) * var(--bx-fs, 1)); }
  .bx-pb-kiste { height:auto; width: min(22cqh, 40cqi); max-width:none; }
}
@keyframes bx-pb-wipp { 0%,100% { rotate:-2deg } 50% { rotate:2deg } }

/* Follow: Blitz + Token wirbelt + Plakette hüpft */
.bx-pb.jubel .bx-pb-plak { animation: bx-pb-hops 900ms cubic-bezier(.2,1.6,.35,1); }
@keyframes bx-pb-hops { 0% { scale:1 } 30% { scale:1.06 } 100% { scale:1 } }
.bx-pb.jubel .bx-pb-dreh { animation: bx-pb-wirbel 1.2s cubic-bezier(.2,.8,.3,1); }
@keyframes bx-pb-wirbel { from { transform:rotateY(0) } to { transform:rotateY(1080deg) } }
.bx-pb-blitz { position:absolute; inset:0; pointer-events:none; border-radius:inherit; opacity:0;
  background: radial-gradient(70% 120% at 20% 50%, rgba(255,245,210,.9), rgba(255,200,90,0) 70%); }
.bx-pb.jubel .bx-pb-blitz { animation: bx-pb-blitz 900ms ease-out; }
@keyframes bx-pb-blitz { 0% { opacity:1 } 100% { opacity:0 } }
`;
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}

/** 137500 → „137.500". */
function formatDe(n) { return String(Math.max(0, Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function mediaUrl(id, ctx) {
  if (!id || !ctx || !ctx.baseUrl) return '';
  return `${ctx.baseUrl}/media/${encodeURIComponent(id)}?token=${ctx.token}`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export default class PiratenBanner {
  constructor(root, props, ctx) {
    ensureStyle();
    this.timers = new Set();
    const titel = typeof props.titel === 'string' && props.titel.trim() ? props.titel.trim() : 'FOLLOW = KISTEN BIS ZUM TOKEN';
    const unter = typeof props.unterzeile === 'string' ? props.unterzeile.trim() : 'Folge und erfahre, in welcher Kiste dein Piraten-Token liegt';
    const chance = Math.max(2, Math.round(Number(props.chance)) || 137500);

    this.el = el('div', 'bx-pb');
    const plak = el('div', 'bx-pb-plak');

    // Token
    const tok = el('div', 'bx-pb-tok');
    const dreh = el('div', 'bx-pb-dreh');
    const tUrl = mediaUrl(props.tokenId, ctx);
    if (tUrl) { const img = el('img'); img.alt = ''; img.src = tUrl; img.onload = () => this.fit(); img.onerror = () => { img.remove(); dreh.appendChild(el('div', 'bx-pb-muenze', '?')); }; dreh.appendChild(img); }
    else dreh.appendChild(el('div', 'bx-pb-muenze', '?'));
    tok.appendChild(dreh);
    plak.appendChild(tok);

    // Texte: „FOLLOW = REST" → FOLLOW als Pille, Rest in Gold
    const txt = el('div', 'bx-pb-txt');
    const t = el('div', 'bx-pb-titel');
    const i = titel.indexOf('=');
    if (i > 0) {
      t.appendChild(el('span', 'bx-pb-pille', titel.slice(0, i).trim()));
      t.appendChild(el('span', 'bx-pb-gleich', '='));
      const rest = titel.slice(i + 1).trim();
      if (rest) t.appendChild(el('span', 'bx-pb-gold', rest));
    } else t.appendChild(el('span', 'bx-pb-gold', titel));
    txt.appendChild(t);
    const zeilen = [];
    if (unter) zeilen.push(el('div', 'bx-pb-unter', unter));
    if (props.zeigeChance !== false) zeilen.push(el('div', 'bx-pb-unter bx-pb-chance', `CHANCE 1 : ${formatDe(chance)} PRO KISTE`));
    for (const z of zeilen) txt.appendChild(z);
    plak.appendChild(txt);
    this.titel = t; this.zeilen = zeilen;

    // Kiste (optional)
    const kUrl = mediaUrl(props.kisteId, ctx);
    if (kUrl) { const k = el('img', 'bx-pb-kiste'); k.alt = ''; k.src = kUrl; k.onload = () => this.fit(); k.onerror = () => { k.remove(); this.fit(); }; plak.appendChild(k); }

    plak.appendChild(el('div', 'bx-pb-blitz'));
    this.el.appendChild(plak);
    root.appendChild(this.el);

    // Texte notfalls verkleinern, damit nichts aus der Plakette läuft
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);
    this.fit();
  }

  /** Jede Zeile einzeln schrumpfen, bis sie in ihre Spalte passt. */
  fit() {
    for (const z of [this.titel, ...this.zeilen]) {
      if (!z) continue;
      z.style.fontSize = '';
      const platz = z.parentElement ? z.parentElement.clientWidth : 0;
      if (!(platz > 0)) continue;
      const w = z.scrollWidth;
      if (w > platz) z.style.fontSize = `${Math.max(6, parseFloat(getComputedStyle(z).fontSize) * (platz / w) * 0.98)}px`;
    }
  }

  onEvent(e) {
    if (!e || e.type !== 'follow' || !this.el) return;
    this.el.classList.remove('jubel');
    void this.el.offsetWidth; // Reflow → bei schnellen Follows springt der Effekt neu an
    this.el.classList.add('jubel');
    const t = setTimeout(() => { this.timers.delete(t); this.el?.classList.remove('jubel'); }, 1250);
    this.timers.add(t);
  }

  destroy() {
    this.ro?.disconnect();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.el?.remove();
    this.el = null;
  }
}
