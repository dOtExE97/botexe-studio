// points-board.js — All-Time-Punkte-Bestenliste (Loyalty), aus stats.topPoints.
// props: { limit?, title?, accent?, source='points' }. Glas-Panel wie leaderboard,
// mit Medaillen-Rängen (Gold/Silber/Bronze) + Krone (Inline-SVG) auf Platz 1.
const STYLE_ID = 'bx-pb-style';
// Krone als Inline-SVG (KEIN Emoji) — currentColor folgt der Goldfarbe der Krone.
const CROWN_SVG = `<svg class="bx-pb-crown" viewBox="0 0 24 18" aria-hidden="true"><path d="M2 6.2l3.6 3.1L9.4 3l2.6 4.2L14.6 3l3.8 6.3L22 6.2l-1.7 9.3a1 1 0 0 1-1 .8H4.7a1 1 0 0 1-1-.8L2 6.2Z" fill="currentColor" stroke="rgba(0,0,0,.55)" stroke-width=".8" stroke-linejoin="round"/><circle cx="2" cy="6.2" r="1.4" fill="currentColor"/><circle cx="12" cy="2.4" r="1.4" fill="currentColor"/><circle cx="22" cy="6.2" r="1.4" fill="currentColor"/></svg>
`;
const CSS = `
.bx-pb { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--bx-font-body); container-type: size;
  padding: clamp(6px,4.5cqh,26px) clamp(8px,3cqi,30px) clamp(5px,3.5cqh,22px); overflow: hidden; background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow); -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3); }
.bx-pb::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 70%, white), transparent 42%, color-mix(in srgb, var(--bx-accent) 30%, transparent));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
/* Schrift skaliert über BEIDE Achsen (min(cqi,cqh)) — reines cqmin macht in
   breiten, flachen Boxen Mini-Schrift. */
.bx-pb-title { position: relative; overflow: hidden; font-family: var(--bx-font-display); font-size: calc(clamp(11px,min(4cqi,9cqh),24px) * var(--bx-fs, 1)); letter-spacing: .3em;
  text-transform: uppercase; color: var(--bx-accent); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 45%, transparent);
  padding-bottom: clamp(3px,2.6cqh,14px); margin-bottom: clamp(3px,2.6cqh,14px); border-bottom: 1px solid color-mix(in srgb, var(--bx-accent) 45%, transparent); }
.bx-pb-title::after { content:''; position:absolute; top:0; bottom:0; left:-60%; width:45%; transform:translateX(0) skewX(-20deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent); animation: bx-shimmer 3.6s ease-in-out infinite; }
.bx-pb-list { position: relative; flex: 1; }
/* Zeile = eigener Größen-Container: Badge, Bild und Schrift messen sich an der
   Zeilenhöhe und wachsen dadurch mit dem Widget mit. */
.bx-pb-row { position: absolute; left:0; right:0; height:46px; display:flex; align-items:center; gap:clamp(4px,2.4cqi,20px); padding:0 clamp(3px,1.2cqi,14px); border-radius:12px;
  container-type: size; transition: transform 520ms cubic-bezier(.25,1,.35,1), opacity 320ms; }
.bx-pb-row[data-rank="1"] { background: linear-gradient(100deg, color-mix(in srgb, var(--bx-gold) 16%, transparent), transparent 70%); }

/* — Rang-Badge: Default schlicht, Platz 1–3 als Medaillen — */
.bx-pb-rank { position: relative; height:62%; aspect-ratio:1/1; width:auto; flex:none; display:flex; align-items:center; justify-content:center;
  font-family: var(--bx-font-display); font-size:calc(clamp(9px,34cqh,30px) * var(--bx-fs, 1)); color:#0a0b10; border-radius:50%; background:#4a5066;
  box-shadow: 0 2px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.18); }
.bx-pb-row[data-rank="1"] .bx-pb-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); box-shadow: 0 0 16px -2px var(--bx-gold), 0 2px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.45); }
.bx-pb-row[data-rank="2"] .bx-pb-rank { background: linear-gradient(160deg,#eef2fb,#b9c2d8); box-shadow: 0 0 12px -3px #d7deec, 0 2px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.5); }
.bx-pb-row[data-rank="3"] .bx-pb-rank { background: linear-gradient(160deg,#f0b487,#c9763c); box-shadow: 0 0 12px -3px #f0a35a, 0 2px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35); }

/* — Krone (Inline-SVG) auf Platz 1, sitzt schräg über dem Badge — */
.bx-pb-crown { position:absolute; left:50%; top:-28cqh; width:clamp(11px,42cqh,34px); height:auto; transform:translateX(-50%) rotate(-14deg);
  color: var(--bx-gold); filter: drop-shadow(0 1px 2px rgba(0,0,0,.7)); z-index:2; pointer-events:none;
  animation: bx-pb-crown-float 2.8s ease-in-out infinite; }
@keyframes bx-pb-crown-float { 0%,100% { transform:translateX(-50%) rotate(-14deg) translateY(0); } 50% { transform:translateX(-50%) rotate(-14deg) translateY(-2px); } }

/* — Avatar mit Medaillen-Ring auf den Podestplätzen — */
/* Eigener Größen-Container, damit der Fallback-Buchstabe (.bx-av::after) mitwächst. */
.bx-pb-pic { height:78%; aspect-ratio:1/1; width:auto; border-radius:50%; flex:none; container-type:size; box-shadow: 0 0 0 2px rgba(255,255,255,.12); }
.bx-pb-pic::after { font-size:52cqmin; }
.bx-pb-row[data-rank="1"] .bx-pb-pic { box-shadow: 0 0 0 2px var(--bx-gold), 0 0 14px -3px var(--bx-gold); }
.bx-pb-row[data-rank="2"] .bx-pb-pic { box-shadow: 0 0 0 2px #d7deec; }
.bx-pb-row[data-rank="3"] .bx-pb-pic { box-shadow: 0 0 0 2px #f0a35a; }

.bx-pb-name { flex:1; font-family: var(--bx-font-display); font-size:calc(clamp(10px,min(46cqh,5.5cqi),36px) * var(--bx-fs, 1)); color:var(--bx-text,#fff); text-transform:uppercase;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 2px 4px rgba(0,0,0,.5); }
.bx-pb-row[data-rank="1"] .bx-pb-name { color: var(--bx-gold); }
.bx-pb-val { font-family: var(--bx-font-mono); font-weight:700; font-size:calc(clamp(10px,min(40cqh,4.6cqi),30px) * var(--bx-fs, 1)); color: var(--bx-accent);
  text-shadow: 0 0 10px color-mix(in srgb, var(--bx-accent) 40%, transparent); }
.bx-pb-row[data-rank="1"] .bx-pb-val { color: var(--bx-gold); text-shadow: 0 0 10px color-mix(in srgb, var(--bx-gold) 45%, transparent); }
.bx-pb-empty { display:flex; align-items:center; justify-content:center; height:100%; font-size:calc(clamp(11px,min(3.2cqi,11cqh),22px) * var(--bx-fs, 1)); letter-spacing:.2em; color: #c3cadd; text-transform:uppercase; }
@keyframes bx-shimmer { 0%,55% { transform:translateX(0) skewX(-20deg); } 100% { transform:translateX(422%) skewX(-20deg); } }
/* ── Stil „Neon" — freistehende Zeilen ohne Panel: Glow-Namen überm Gameplay. */
.bx-pb-neon { background: none !important; box-shadow: none !important; border: none; }
.bx-pb-neon::before { display: none; }
.bx-pb-neon .bx-pb-row { background: none !important; }
.bx-pb-neon .bx-pb-name { text-shadow: 0 1px 0 rgba(0,0,0,.95), 0 2px 8px rgba(0,0,0,.9); }
.bx-pb-neon .bx-pb-val { text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 70%, transparent), 0 1px 0 rgba(0,0,0,.9); }
.bx-pb-neon .bx-pb-title { border-bottom: none; text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 2px 6px rgba(0,0,0,.9); }

/* ── Stil „Pills" — satte Akzent-Pillen, dunkle Schrift (Familien-Look). */
.bx-pb-pills { background: none !important; box-shadow: none !important; }
.bx-pb-pills::before { display: none; }
.bx-pb-pills .bx-pb-row { background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2)) !important;
  border-radius: 999px; box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--bx-accent) 75%, transparent); }
.bx-pb-pills .bx-pb-row[data-rank="1"] { background: linear-gradient(120deg, #ffe88a, var(--bx-gold)) !important; }
.bx-pb-pills .bx-pb-name { color: #0c0d14 !important; text-shadow: none; }
.bx-pb-pills .bx-pb-val { color: #0c0d14 !important; text-shadow: none; background: rgba(255,255,255,.72); border-radius: 999px; padding: 2px 10px; }
.bx-pb-pills .bx-pb-rank { background: rgba(12,13,20,.85) !important; color: #fff; border-radius: 50%; box-shadow: none !important; }

/* ── KASSENBON — Papierstreifen mit Zackenkante unten, Schreibmaschinen-Schrift
   und gestrichelten Trennlinien. Wirkt wie ein ausgedruckter Beleg. */
.bx-pb-bon { background: #f6f0e2; box-shadow: 0 10px 26px -12px rgba(0,0,0,.7); border-radius: 3px 3px 0 0;
  color: #2c2416; font-family: 'Courier New', monospace; padding-bottom: 18px; }
.bx-pb-bon::before { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 10px;
  background: linear-gradient(-45deg, transparent 50%, #f6f0e2 50%) 0 0/12px 12px repeat-x;
  -webkit-mask: none; mask: none; padding: 0; }
.bx-pb-bon .bx-pb-title { color: #2c2416; border-bottom: 2px dashed #b9ad90; letter-spacing: .18em;
  font-family: 'Courier New', monospace; text-shadow: none; }
.bx-pb-bon .bx-pb-title::after { display: none; }
.bx-pb-bon .bx-pb-row { background: none !important; border-bottom: 1px dashed #d5cbb2; border-radius: 0; }
.bx-pb-bon .bx-pb-name, .bx-pb-bon .bx-pb-val { color: #2c2416 !important; text-shadow: none; font-family: 'Courier New', monospace; }
.bx-pb-bon .bx-pb-rank { background: #2c2416 !important; color: #f6f0e2; border-radius: 3px; box-shadow: none !important; }
.bx-pb-bon .bx-pb-pic { box-shadow: 0 0 0 2px #b9ad90; }
.bx-pb-bon .bx-pb-crown { color: #c0392b; }


/* ── HIGHSCORE — Spielhallen-Automat: Pixelschrift, harte Kanten, Neon auf
   Schwarz, Rang als „1ST"-Marke. */
.bx-pb-highscore { background: #05060a; border: 2px solid #37ff6a; border-radius: 3px;
  box-shadow: 0 0 26px -8px #37ff6a, inset 0 0 40px rgba(55,255,106,.06); }
.bx-pb-highscore::before { display: none; }
.bx-pb-highscore .bx-pb-title { color: #eaff8d; border-bottom: 2px solid rgba(55,255,106,.5);
  font-family: 'Press Start 2P', monospace; font-size: calc(clamp(8px,min(2.4cqi,6cqh),20px) * var(--bx-fs, 1)); letter-spacing: .1em; text-shadow: 0 0 10px #37ff6a; }
.bx-pb-highscore .bx-pb-title::after { display: none; }
.bx-pb-highscore .bx-pb-row { background: none !important; border-radius: 0; }
.bx-pb-highscore .bx-pb-name { color: #8dffab; font-family: 'Press Start 2P', monospace; font-size: calc(clamp(8px,min(30cqh,3.2cqi),22px) * var(--bx-fs, 1)); letter-spacing: 0; }
.bx-pb-highscore .bx-pb-val { color: #eaff8d; font-family: 'Press Start 2P', monospace; font-size: calc(clamp(8px,min(30cqh,3.2cqi),22px) * var(--bx-fs, 1)); }
.bx-pb-highscore .bx-pb-rank { background: none !important; box-shadow: none !important; color: #37ff6a;
  font-family: 'Press Start 2P', monospace; font-size: calc(clamp(7px,26cqh,18px) * var(--bx-fs, 1)); }
.bx-pb-highscore .bx-pb-pic { border-radius: 0; box-shadow: 0 0 0 2px #37ff6a; }

/* ── „Rahmen ausblenden" (bx-frameless) ───────────────────────────────────
   Ohne Panel stehen Titel, Namen und Werte direkt auf dem Videobild; auf einer
   hellen Szene waren die weißen Namen praktisch unsichtbar. Kontur deshalb NUR
   im frameless-Fall — mit Panel bleibt das Aussehen unverändert. Stärke in em,
   damit sie mit der Textgrößen-Einstellung mitwächst.
   AUSGENOMMEN pills/bon/highscore: die drei bringen eigene Flächen mit (Akzent-
   Pille, Bonpapier, schwarzer Automat) und setzen dunkle bzw. eigene Textfarben
   — eine Kontur würde dort nur verschmieren. */
/* Glas-Haarlinie weg — beim Bon ist ::before die Zackenkante des Papiers. */
.bx-frameless .bx-pb:not(.bx-pb-bon)::before { display: none; }
.bx-frameless .bx-pb:not(.bx-pb-pills):not(.bx-pb-bon):not(.bx-pb-highscore) .bx-pb-title,
.bx-frameless .bx-pb:not(.bx-pb-pills):not(.bx-pb-bon):not(.bx-pb-highscore) .bx-pb-name,
.bx-frameless .bx-pb:not(.bx-pb-pills):not(.bx-pb-bon):not(.bx-pb-highscore) .bx-pb-val,
.bx-frameless .bx-pb:not(.bx-pb-pills):not(.bx-pb-bon):not(.bx-pb-highscore) .bx-pb-empty {
  -webkit-text-stroke: max(1.5px, .08em) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 max(1px, .04em) max(3px, .1em) rgba(0,0,0,.55); }
/* Bon und Highscore zeichnen ihre Struktur als border — die globale
   frameless-Regel hätte Trennlinien bzw. Automatenrahmen ersatzlos gelöscht. */
.bx-frameless .bx-pb-bon .bx-pb-title { border-bottom-color: #b9ad90 !important; }
.bx-frameless .bx-pb-bon .bx-pb-row { border-bottom-color: #d5cbb2 !important; }
.bx-frameless .bx-pb-highscore { border-color: #37ff6a !important; }
.bx-frameless .bx-pb-highscore .bx-pb-title { border-bottom-color: rgba(55,255,106,.5) !important; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));

/** URL sicher in CSS url("…") einbetten — NUR Quotes escapen, nie
 *  (nach-)encodieren: data-URIs und vor-encodierte CDN-URLs blieben sonst kaputt. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }

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
  if (el.dataset.avUrl === (url || '')) return;
  el.dataset.avUrl = url || '';
  el.classList.remove('bx-av-img');
  el.style.backgroundImage = '';
  if (!url) return;
  const img = new Image();
  img.onload = () => { if (el.dataset.avUrl === url) { el.style.backgroundImage = `url("${cssUrl(url)}")`; el.classList.add('bx-av-img'); } };
  img.src = url;
}
/** Demo-Daten für die Editor-Vorschau. */
const DEMO = { topPoints: [{ id: 'd1', nickname: 'Mia', points: 12450 }, { id: 'd2', nickname: 'Nova', points: 8400 }, { id: 'd3', nickname: 'ExE', points: 6100 }, { id: 'd4', nickname: 'BigBen', points: 3200 }, { id: 'd5', nickname: 'Sara_99', points: 1800 }, { id: 'd6', nickname: 'LeonGG', points: 950 }, { id: 'd7', nickname: 'Kaan', points: 470 }, { id: 'd8', nickname: 'Pia', points: 220 }, { id: 'd9', nickname: 'Tom', points: 120 }, { id: 'd10', nickname: 'Lu', points: 60 }] };
export default class PointsBoard {
  constructor(root, props, ctx) {
    ensureStyle();
    root.style.setProperty('--bx-accent', props.accent || '#7c5cff');
    this.limit = Math.min(10, Math.max(1, Number(props.limit ?? 5)));
    this.title = props.title || '';
    this.el = document.createElement('div');
    const style = ['glas', 'neon', 'pills', 'bon', 'highscore'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-pb${style !== 'glas' ? ` bx-pb-${style}` : ''}`;
    this.el.innerHTML = `<div class="bx-pb-title"></div><div class="bx-pb-list"><div class="bx-pb-empty">Noch keine Punkte</div></div>`;
    this.el.querySelector('.bx-pb-title').textContent = this.title || 'Top Supporter';
    root.appendChild(this.el);
    this.rows = new Map();
    if (ctx?.preview) this.onStats(DEMO);
  }
  onStats(stats) {
    if (!this.title && stats?.currencyName) this.el.querySelector('.bx-pb-title').textContent = `Top ${stats.currencyName}`;
    const items = (stats?.topPoints ?? []).slice(0, this.limit);
    const list = this.el.querySelector('.bx-pb-list');
    const empty = list.querySelector('.bx-pb-empty');
    if (empty && items.length > 0) empty.remove();
    // Zeilenhöhe aus der Box ableiten (wie leaderboard) — feste 48px schneiden
    // bei kleiner Box/hohem Limit die unteren Ränge ab.
    const rowH = Math.max(22, (list.clientHeight || this.limit * 48) / this.limit);
    const seen = new Set();
    items.forEach((g, i) => {
      seen.add(g.id);
      let row = this.rows.get(g.id);
      if (!row) {
        row = document.createElement('div'); row.className = 'bx-pb-row'; row.style.opacity = '0';
        row.innerHTML = `<div class="bx-pb-rank"></div><div class="bx-pb-pic"></div><div class="bx-pb-name"></div><div class="bx-pb-val"></div>`;
        list.appendChild(row); this.rows.set(g.id, row);
        requestAnimationFrame(() => { row.style.opacity = '1'; });
      }
      const rank = i + 1;
      row.dataset.rank = String(rank);
      row.style.height = `${rowH}px`;
      row.style.transform = `translateY(${i * rowH}px)`;
      const rankEl = row.querySelector('.bx-pb-rank');
      // Krone (Inline-SVG) nur auf Platz 1; sonst keine — Badge zeigt die Rang-Zahl.
      rankEl.innerHTML = `${rank === 1 ? CROWN_SVG : ''}<span>${rank}</span>`;
      row.querySelector('.bx-pb-name').textContent = g.nickname;
      row.querySelector('.bx-pb-val').textContent = fmt(g.points);
      avSet(row.querySelector('.bx-pb-pic'), g.nickname, g.profilePic);
    });
    for (const [id, row] of this.rows) { if (!seen.has(id)) { row.remove(); this.rows.delete(id); } }
  }
  destroy() { this.el.remove(); }
}
