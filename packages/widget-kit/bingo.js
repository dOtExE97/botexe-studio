// bingo.js — Stream-Bingo: Raster (3×3 bis 5×5) mit Auto-Zielen (Gifts,
// Like-/Coin-/Follower-Meilensteine). Zellen haken sich LIVE ab, wenn das
// Ziel erreicht wird (Spring-Animation + Sound), komplette Reihen/Spalten/
// Diagonalen bekommen eine Durchstreich-Linie + BINGO-Banner. Volles Brett →
// automatisch neue Runde (props.autoNewRound).
//
// Brett wird aus (Session-Seed + layerId + Rundennummer) gewürfelt — alle
// Overlay-Clients (OBS + TTLS) zeigen dasselbe Brett, aber jeder Stream ein
// anderes (Seed kommt pro Session vom Server via hello/reset).
// props: { size?, gifts?, likeStep?, coinStep?, followStep?, autoNewRound?,
//          cellSoundId?, bingoSoundId?, title?, accent? }
// giftKey aus der gemeinsamen Quelle — dieselbe Normalisierung wie Trigger,
// Tafel, Rad, Automat und Geschenk-Schlacht (siehe gift-rules.js).
import { giftKey, ladeGiftKatalog } from './gift-rules.js';

const STYLE_ID = 'bx-bingo-style';
const CSS = `
.bx-bg { position:absolute; inset:0; display:flex; flex-direction:column; gap:8px; padding:3.5cqmin;
  container-type: size;
  font-family: var(--bx-font-body); background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent); overflow:hidden;
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
/* Titel an der BREITE messen (cqi), gedeckelt durch die Höhe (cqh): in einem
   breiten, flachen Brett wäre reines cqmin winzig. */
.bx-bg-title { text-align:center; font-family: var(--bx-font-display);
  font-size: calc((clamp(13px, min(5.5cqi, 9cqh), 38px)) * var(--bx-fs, 1)); letter-spacing:.22em;
  text-transform:uppercase; color: var(--bx-text, #fff); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-bg-grid { position:relative; flex:1; display:grid; gap: 1.4cqmin; --n: 3; }
/* Zell-Schrift & Bildgröße skalieren mit Brettgröße: --n = Spaltenzahl.
   Größeres Brett (5×5) ⇒ kleinere, aber immer noch lesbare Inhalte. */
.bx-bg-cell { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap: 0.6cqmin; border-radius: 1.8cqmin; background: rgba(8,10,18,.42); border:1px solid rgba(255,255,255,.12);
  padding: 1cqmin; text-align:center; overflow:hidden; transition: background .3s, border-color .3s; }
.bx-bg-cell img { width: min(62%, calc(150cqmin / var(--n) * 0.6)); max-height:58%; object-fit:contain;
  filter: drop-shadow(0 2px 5px rgba(0,0,0,.6)); }
.bx-bg-cell .lbl { font-family: var(--bx-font-display); line-height:1.1; color:#fff;
  /* Deckel bewusst bei 22px statt 26px: bei 26px passte „FOLLOWER" nicht mehr
     in eine 3er-Zelle und word-break riss es zu „FOLLOWE / R" auseinander.
     overflow-wrap statt word-break bricht ausserdem nur dann INNERHALB eines
     Wortes, wenn es allein in keine Zeile passt — bei „+2.0K Likes" wird also
     weiterhin sauber am Leerzeichen umbrochen. */
  font-size: calc((clamp(9px, calc(34cqmin / var(--n)), 22px)) * var(--bx-fs, 1));
  text-transform:uppercase; overflow-wrap:break-word; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
.bx-bg-cell.gift .lbl { font-size: calc((clamp(8px, calc(24cqmin / var(--n)), 18px)) * var(--bx-fs, 1)); opacity:.92; }
.bx-bg-cell.done { background: color-mix(in srgb, var(--bx-teal) 32%, rgba(8,10,18,.5));
  border-color: var(--bx-teal); }
/* Erfülltes Feld: man muss weiter LESEN können, WAS erfüllt wurde. Darum bleibt
   die Beschriftung stehen, wird nur abgedunkelt + durchgestrichen; das Häkchen
   sitzt klein in der Ecke statt großflächig über dem Text. */
.bx-bg-cell.done .lbl { color:#fff; opacity:1; text-decoration: line-through;
  text-decoration-color: rgba(4,36,31,.85);
  text-decoration-thickness: .1em; text-shadow: 0 1px 3px rgba(0,0,0,.75); }
.bx-bg-cell.done img { opacity:.55; filter: grayscale(.35) drop-shadow(0 2px 5px rgba(0,0,0,.6)); }
.bx-bg-check { position:absolute; top: 4%; right: 4%; width: clamp(11px, 30%, 6cqmin); aspect-ratio: 1;
  display:flex; align-items:center; justify-content:center;
  border-radius: 50%; background: color-mix(in srgb, var(--bx-teal) 88%, #04121000);
  box-shadow: 0 0 10px color-mix(in srgb, var(--bx-teal) 70%, transparent), 0 1px 3px rgba(0,0,0,.6);
  pointer-events:none; animation: bx-bg-pop 480ms cubic-bezier(.2,1.6,.4,1); }
.bx-bg-check svg { width:74%; height:74%; }
.bx-bg-check svg path { stroke: #04241f; }
@keyframes bx-bg-pop { 0% { transform: scale(0); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
.bx-bg-line { position:absolute; height:7px; border-radius:4px; transform-origin:left center;
  background: linear-gradient(90deg, var(--bx-gold), #fff3c4, var(--bx-gold));
  box-shadow: 0 0 16px var(--bx-gold); animation: bx-bg-line 500ms cubic-bezier(.2,1,.3,1) forwards; z-index:3; }
@keyframes bx-bg-line { from { scale: 0 1; } to { scale: 1 1; } }
/* Das Banner sitzt BEWUSST oben über der Titelzeile statt mittig über dem
   Gitter: zentriert verdeckte es das mittlere Feld komplett, und genau solche
   verdeckenden Overlays haben wir hier gerade beim Häkchen beseitigt. Der Titel
   darunter ist eine feste Beschriftung, keine Spielinformation — den darf der
   Jubel für 1,7 s überdecken. Die Kapsel blendet ihn sauber aus. */
.bx-bg-banner { position:absolute; inset:0 0 auto 0; display:flex; align-items:flex-start; justify-content:center;
  pointer-events:none; z-index:4; }
.bx-bg-banner span { font-family: var(--bx-font-display); font-size: calc((clamp(22px, 11cqmin, 56px)) * var(--bx-fs, 1)); color: var(--bx-gold);
  padding: .06em .5em .12em; border-radius: 999px;
  background: linear-gradient(160deg, rgba(18,20,30,.96), rgba(8,9,16,.98));
  box-shadow: 0 6px 22px -6px rgba(0,0,0,.9), 0 0 0 2px color-mix(in srgb, var(--bx-gold) 55%, transparent);
  -webkit-text-stroke: 4px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 36px var(--bx-gold); animation: bx-bg-banner 1600ms cubic-bezier(.2,1.5,.35,1) forwards; }
@keyframes bx-bg-banner { 0% { transform: scale(.2) rotate(-8deg); opacity:0; }
  20% { transform: scale(1.15) rotate(2deg); opacity:1; } 35% { transform: scale(1); }
  80% { transform: scale(1); opacity:1; } 100% { transform: scale(1.3); opacity:0; } }
.bx-bg-grid.newround { animation: bx-bg-shuffle 600ms ease; }
@keyframes bx-bg-shuffle { 0% { opacity:1; transform: rotateX(0); } 50% { opacity:0; transform: rotateX(90deg); } 100% { opacity:1; transform: rotateX(0); } }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur am Titel. Die Felder bringen ihren eigenen Hintergrund mit.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-bg-title { -webkit-text-stroke: max(1.5px, .1em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium) ───────────────────────────────────────────
   Zwei Momente: die eben abgehakte Zelle und — deutlich größer — das ganze
   Brett bei BINGO. Beide Elemente tragen von Haus aus KEINEN box-shadow, der
   Ring der Basis kollidiert also mit nichts.
   Nachgeschärft: das Gift-Bild in der getroffenen Zelle blitzt mit auf. Die
   Basis macht das nur für Klassen mit „-ic"/„-pic"; hier heißt das Bild
   schlicht <img> in der Zelle. Die abgehakte Zelle rahmt sich in Türkis (die
   Farbe des Häkchens) statt im Akzent — sonst hätte das Feld zwei Farben. */
.bx-premium .bx-bg-cell.bx-hit { --bx-accent: var(--bx-teal, #21e6c1); }
.bx-premium .bx-bg-cell.bx-hit img { animation: bx-premium-flash 900ms cubic-bezier(.2,1.4,.35,1); }
/* BINGO: das Brett hebt sich, die Linie darf ihre eigene Animation behalten. */
.bx-premium .bx-bg-grid.bx-hit { --bx-accent: var(--bx-gold, #ffd23e); }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}
// Premium-Auslöser: Klasse `bx-hit` setzen und nach 900 ms wieder wegnehmen.
// Was daraus wird (Anheben, Ring, Aufblitzen), entscheidet die Premium-Ebene in
// widget-base.css — ohne den Haken „Premium-Effekte" passiert nichts. Bewusst
// lokal dupliziert: die Widgets haben kein gemeinsames JS-Modul.
function bxHit(el, timers) {
  if (!el) return;
  el.classList.remove('bx-hit');
  void el.offsetWidth; // Reflow → bei schnellen Folgen springt der Effekt neu an
  el.classList.add('bx-hit');
  const t = setTimeout(() => { timers.delete(t); el.classList.remove('bx-hit'); }, 900);
  timers.add(t);
}

const CHECK_SVG = `<svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.5L20 6.5" fill="none" stroke="#3df5cf" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

// Deterministischer Zufall (LCG) — gleicher Seed ⇒ gleiches Brett auf allen Clients.
function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  let state = h >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export default class BingoWidget {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.ctx = ctx || {};
    this.size = Math.min(5, Math.max(3, Number(props.size ?? 3)));
    this.gifts = String(props.gifts ?? '').split(',').map((g) => g.trim()).filter(Boolean);
    this.likeStep = Math.max(0, Number(props.likeStep ?? 2000));
    this.coinStep = Math.max(0, Number(props.coinStep ?? 200));
    this.followStep = Math.max(0, Number(props.followStep ?? 5));
    this.autoNewRound = props.autoNewRound !== false;
    this.cellSound = props.cellSoundId || '';
    this.bingoSound = props.bingoSoundId || '';
    this.round = 0;
    this.baseStats = null; // Meilensteine zählen RELATIV zum Rundenstart
    this.lastStats = null;
    this.autoGifts = [];   // im Auto-Modus aus dem Katalog gewürfelte Gifts
    this.catalogList = [];
    this.timers = new Set(); // Auto-Runde/Banner-Timer → bei destroy clearen

    this.el = document.createElement('div');
    this.el.className = 'bx-bg';
    this.el.innerHTML = `<div class="bx-bg-title"></div><div class="bx-bg-grid"></div>`;
    this.el.querySelector('.bx-bg-title').textContent = props.title || 'Stream-Bingo';
    this.gridEl = this.el.querySelector('.bx-bg-grid');
    root.appendChild(this.el);
    this.icons = {}; // giftKey(slug) → Bild-URL aus dem Gift-Katalog
    this.newRound(false);
    this.loadCatalog();

    // Editor-Vorschau: Felder nach und nach abhaken (inkl. einer vollen Reihe →
    // Durchstreich-Linie + BINGO-Banner), damit man den gefüllten Zustand sieht.
    if (this.ctx.preview) this.startDemo();
  }

  /** Vorschau-Demo: hakt in Ruhe eine Reihe ab und würfelt danach neu. */
  startDemo() {
    const order = [0, this.size + 1, 1, 2, 3];
    let i = 0;
    const step = () => {
      if (i >= order.length) {
        i = 0;
        const t = setTimeout(() => { this.timers.delete(t); this.round++; this.buildBoard(true); }, 2600);
        this.timers.add(t);
        return;
      }
      const cell = this.cells[order[i++] % this.cells.length];
      if (cell && !cell.done) this.markDone(cell);
    };
    const t0 = setTimeout(step, 700); this.timers.add(t0);
    this.demoInterval = setInterval(step, 1400);
  }

  /** Echte Gift-Bilder aus dem App-Katalog (alles, was je gesehen wurde). */
  async loadCatalog() {
    try {
      const cat = await ladeGiftKatalog(this.ctx.baseUrl, this.ctx.token);
      const list = [];
      for (const [slug, entry] of Object.entries(cat)) {
        if (entry && entry.icon) {
          // Schluessel per giftKey — wie ueberall sonst in der App. Befuellung
          // UND Nachschlagen muessen dieselbe Normalisierung nutzen.
          this.icons[giftKey(slug)] = entry.icon;
          list.push({ slug: entry.slug || slug, coins: Number(entry.coinsPerUnit ?? entry.coins ?? 0) });
        }
      }
      this.catalogList = list;
      // Auto-Modus (keine Gifts konfiguriert): echte, eher günstige Gifts ins
      // Brett würfeln, damit Gift-Felder MIT Bild erscheinen (sonst nur Meilensteine).
      if (this.gifts.length === 0 && list.length) {
        this.autoGifts = this.pickAutoGifts(list);
        this.buildBoard(false); // selbe Runde, jetzt mit Gift-Zellen
      } else {
        this.applyIcons();
      }
    } catch { /* offline/alt — Namen reichen als Fallback */ }
  }

  /** Deterministisch ~Hälfte der Felder mit günstigen, häufig gesendeten Gifts. */
  pickAutoGifts(list) {
    const affordable = list
      .filter((g) => g.coins > 0)
      .sort((a, b) => a.coins - b.coins || a.slug.localeCompare(b.slug));
    const pool = (affordable.length ? affordable : list).slice(0, 40);
    const rand = rng(`${this.ctx.sessionSeed || ''}-${this.ctx.layerId || 'bingo'}-autogifts`);
    const shuffled = [...pool].sort(() => rand() - 0.5);
    const want = Math.max(3, Math.floor((this.size * this.size) / 2));
    return shuffled.slice(0, want).map((g) => g.slug);
  }

  applyIcons() {
    for (const cell of this.cells) {
      if (cell.kind !== 'gift' || cell.icon) continue;
      const url = this.icons[giftKey(cell.slug)];
      if (url) { cell.icon = url; this.injectIcon(cell); }
    }
  }

  /** Bild live in eine bereits gerenderte Zelle einsetzen. */
  injectIcon(cell) {
    if (!cell.el || cell.el.querySelector('img')) return;
    const img = document.createElement('img');
    img.alt = '';
    img.src = cell.icon;
    cell.el.insertBefore(img, cell.el.firstChild);
  }

  /** Neue Runde: Zähler hoch, dann Brett bauen. */
  newRound(animate) {
    this.round++;
    this.buildBoard(animate);
  }

  /** Brett würfeln — deterministisch aus layerId + Runde. */
  buildBoard(animate) {
    const rand = rng(`${this.ctx.sessionSeed || ''}-${this.ctx.layerId || 'bingo'}-${this.round}`);
    const base = this.baseStats ?? { likes: 0, coins: 0, follows: 0 };
    const pool = [];
    const giftSlugs = this.gifts.length ? this.gifts : (this.autoGifts || []);
    for (const g of giftSlugs) pool.push({ kind: 'gift', slug: g, label: g, icon: (this.icons || {})[giftKey(g)] });
    for (let i = 1; i <= 4; i++) {
      if (this.likeStep) pool.push({ kind: 'likes', target: base.likes + i * this.likeStep, label: `+${fmt(i * this.likeStep)} Likes` });
      if (this.coinStep) pool.push({ kind: 'coins', target: base.coins + i * this.coinStep, label: `+${fmt(i * this.coinStep)} Coins` });
    }
    for (let i = 1; i <= 3; i++) {
      if (this.followStep) pool.push({ kind: 'follows', target: base.follows + i * this.followStep, label: `+${i * this.followStep} Follower` });
    }
    // Mischen (deterministisch) und Brett füllen — Pool notfalls wiederholen.
    const cells = [];
    const shuffled = [...pool].sort(() => rand() - 0.5);
    const need = this.size * this.size;
    for (let i = 0; i < need; i++) {
      const src = shuffled[i % Math.max(1, shuffled.length)] ?? { kind: 'likes', target: base.likes + (i + 1) * 1000, label: `+${fmt((i + 1) * 1000)} Likes` };
      cells.push({ ...src, done: false });
    }
    this.cells = cells;
    this.lines = new Set();
    this.renderGrid(animate);
  }

  renderGrid(animate) {
    this.gridEl.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
    this.gridEl.style.setProperty('--n', String(this.size));
    this.gridEl.innerHTML = '';
    if (animate) { this.gridEl.classList.remove('newround'); void this.gridEl.offsetWidth; this.gridEl.classList.add('newround'); }
    for (const cell of this.cells) {
      const d = document.createElement('div');
      d.className = cell.kind === 'gift' ? 'bx-bg-cell gift' : 'bx-bg-cell';
      if (cell.kind === 'gift' && cell.icon) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = cell.icon;
        d.appendChild(img);
      }
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = cell.label;
      d.appendChild(lbl);
      cell.el = d;
      this.gridEl.appendChild(d);
    }
  }

  markDone(cell) {
    if (cell.done) return;
    cell.done = true;
    cell.el.classList.add('done');
    const chk = document.createElement('div');
    chk.className = 'bx-bg-check';
    chk.innerHTML = CHECK_SVG;
    cell.el.appendChild(chk);
    // Der Moment im Kleinen: genau dieses Feld wurde eben erfüllt.
    bxHit(cell.el, this.timers);
    if (this.cellSound) this.ctx.playSound?.(this.cellSound);
    this.checkLines();
  }

  /** Reihen/Spalten/Diagonalen prüfen → Durchstreich-Linie + BINGO. */
  checkLines() {
    const n = this.size;
    const lines = [];
    for (let r = 0; r < n; r++) lines.push({ id: `r${r}`, cells: Array.from({ length: n }, (_, c) => r * n + c) });
    for (let c = 0; c < n; c++) lines.push({ id: `c${c}`, cells: Array.from({ length: n }, (_, r) => r * n + c) });
    lines.push({ id: 'd1', cells: Array.from({ length: n }, (_, i) => i * n + i) });
    lines.push({ id: 'd2', cells: Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)) });

    let newBingo = false;
    for (const line of lines) {
      if (this.lines.has(line.id)) continue;
      if (!line.cells.every((i) => this.cells[i].done)) continue;
      this.lines.add(line.id);
      newBingo = true;
      this.drawStrike(line.cells);
    }
    if (newBingo) {
      // Der Moment im Großen: eine Reihe steht — das ganze Brett reagiert.
      bxHit(this.gridEl, this.timers);
      this.banner('BINGO!');
      this.ctx.playSound?.(this.bingoSound || this.cellSound);
    }
    // Volles Brett → neue Runde
    if (this.cells.every((c) => c.done) && this.autoNewRound) {
      { const t = setTimeout(() => { this.timers.delete(t); this.baseStats = this.lastStats; this.newRound(true); }, 3200); this.timers.add(t); }
    }
  }

  drawStrike(cellIdxs) {
    const first = this.cells[cellIdxs[0]].el;
    const last = this.cells[cellIdxs[cellIdxs.length - 1]].el;
    // BEWUSST offsetLeft/offsetTop statt getBoundingClientRect(): das Gitter
    // trägt beim Neuwürfeln die Animation .newround mit rotateX(90deg), und
    // getBoundingClientRect() rechnet Transformationen MIT ein. Fällt die
    // Messung in dieses Fenster, kommen gestauchte Koordinaten heraus — aus
    // einer waagerechten Gewinnreihe wurde dann eine schräge Linie quer übers
    // Brett. offset* misst das ungedrehte Layout und ist damit immun.
    const x1 = first.offsetLeft + first.offsetWidth / 2;
    const y1 = first.offsetTop + first.offsetHeight / 2;
    const x2 = last.offsetLeft + last.offsetWidth / 2;
    const y2 = last.offsetTop + last.offsetHeight / 2;
    const cw = first.offsetWidth, ch = first.offsetHeight;
    const len = Math.hypot(x2 - x1, y2 - y1) + Math.min(cw, ch) * 0.7;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const off = Math.min(cw, ch) * 0.35;
    const line = document.createElement('div');
    line.className = 'bx-bg-line';
    line.style.width = `${len}px`;
    line.style.left = `${x1 - Math.cos(angle) * off}px`;
    line.style.top = `${y1 - Math.sin(angle) * off - 3}px`;
    line.style.transform = `rotate(${(angle * 180) / Math.PI}deg)`;
    this.gridEl.appendChild(line);
  }

  banner(text) {
    const b = document.createElement('div');
    b.className = 'bx-bg-banner';
    b.innerHTML = `<span></span>`;
    b.querySelector('span').textContent = text;
    this.el.appendChild(b);
    { const t = setTimeout(() => { this.timers.delete(t); b.remove(); }, 1700); this.timers.add(t); }
  }

  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (event.type !== 'gift' || !event.gift) return;
    // giftKey statt toLowerCase: sonst verfehlt eine Zelle „Hat-and-Mustache"
    // dasselbe Geschenk, das TikTok als „Hat and Mustache" schickt — die Zelle
    // haekt sich nie ab, obwohl das Geschenk ankam.
    const slug = giftKey(event.gift.slug);
    for (const cell of this.cells) {
      if (cell.kind === 'gift' && !cell.done && giftKey(cell.slug) === slug) {
        if (!cell.icon && event.gift.icon) {
          cell.icon = event.gift.icon; // echtes Gift-Bild nachrüsten
          this.icons[slug] = event.gift.icon;
          this.injectIcon(cell);
        }
        this.markDone(cell);
      }
    }
  }

  onStats(stats) {
    const t = stats?.totals;
    if (!t) return;
    this.lastStats = { likes: t.likes ?? 0, coins: t.coins ?? 0, follows: t.follows ?? 0 };
    if (!this.baseStats) {
      // Erste echte Stats: Meilensteine relativ zum aktuellen Session-Stand
      // neu würfeln — sonst wären „+2K Likes" bei laufender Session sofort voll.
      this.baseStats = { ...this.lastStats };
      this.newRound(false);
      return;
    }
    for (const cell of this.cells) {
      if (cell.done || cell.kind === 'gift') continue;
      const cur = this.lastStats[cell.kind] ?? 0;
      if (cur >= cell.target) this.markDone(cell);
    }
  }

  /** Neuer Stream: Meilenstein-Basis + Brett komplett neu — sonst zielen die
   *  Zellen auf die ALTEN (hohen) Totals und haken sich nie wieder ab. */
  onReset() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.baseStats = null;   // nächstes onStats setzt die neue Basis + würfelt neu
    this.lastStats = null;
    this.round = 0;
    this.newRound(true);
  }

  destroy() { clearInterval(this.demoInterval); for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
