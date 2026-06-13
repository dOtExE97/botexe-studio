// bingo.js — Stream-Bingo: Raster (3×3 bis 5×5) mit Auto-Zielen (Gifts,
// Like-/Coin-/Follower-Meilensteine). Zellen haken sich LIVE ab, wenn das
// Ziel erreicht wird (Spring-Animation + Sound), komplette Reihen/Spalten/
// Diagonalen bekommen eine Durchstreich-Linie + BINGO-Banner. Volles Brett →
// automatisch neue Runde (props.autoNewRound).
//
// Deterministisch: Brett wird aus (layerId + Rundennummer) gewürfelt — alle
// Overlay-Clients (OBS + TTLS gleichzeitig) zeigen exakt dasselbe Brett.
// props: { size?, gifts?, likeStep?, coinStep?, followStep?, autoNewRound?,
//          cellSoundId?, bingoSoundId?, title?, accent? }
const STYLE_ID = 'bx-bingo-style';
const CSS = `
.bx-bg { position:absolute; inset:0; display:flex; flex-direction:column; gap:8px; padding:3.5cqmin;
  container-type: size;
  font-family: var(--bx-font-body); background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent); overflow:hidden;
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.bx-bg-title { text-align:center; font-family: var(--bx-font-display);
  font-size: clamp(13px, 5.5cqmin, 30px); letter-spacing:.22em;
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
  font-size: clamp(9px, calc(34cqmin / var(--n)), 26px);
  text-transform:uppercase; word-break:break-word; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
.bx-bg-cell.gift .lbl { font-size: clamp(8px, calc(24cqmin / var(--n)), 18px); opacity:.92; }
.bx-bg-cell.done { background: color-mix(in srgb, var(--bx-teal) 32%, rgba(8,10,18,.5));
  border-color: var(--bx-teal); }
.bx-bg-cell.done .lbl { color:#fff; }
.bx-bg-check { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  pointer-events:none; animation: bx-bg-pop 480ms cubic-bezier(.2,1.6,.4,1); }
.bx-bg-check svg { width:60%; height:60%; filter: drop-shadow(0 0 12px var(--bx-teal)) drop-shadow(0 2px 4px rgba(0,0,0,.6)); }
@keyframes bx-bg-pop { 0% { transform: scale(0); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
.bx-bg-line { position:absolute; height:7px; border-radius:4px; transform-origin:left center;
  background: linear-gradient(90deg, var(--bx-gold), #fff3c4, var(--bx-gold));
  box-shadow: 0 0 16px var(--bx-gold); animation: bx-bg-line 500ms cubic-bezier(.2,1,.3,1) forwards; z-index:3; }
@keyframes bx-bg-line { from { scale: 0 1; } to { scale: 1 1; } }
.bx-bg-banner { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  pointer-events:none; z-index:4; }
.bx-bg-banner span { font-family: var(--bx-font-display); font-size: clamp(34px, 16cqmin, 80px); color: var(--bx-gold);
  -webkit-text-stroke: 4px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 36px var(--bx-gold); animation: bx-bg-banner 1600ms cubic-bezier(.2,1.5,.35,1) forwards; }
@keyframes bx-bg-banner { 0% { transform: scale(.2) rotate(-8deg); opacity:0; }
  20% { transform: scale(1.15) rotate(2deg); opacity:1; } 35% { transform: scale(1); }
  80% { transform: scale(1); opacity:1; } 100% { transform: scale(1.3); opacity:0; } }
.bx-bg-grid.newround { animation: bx-bg-shuffle 600ms ease; }
@keyframes bx-bg-shuffle { 0% { opacity:1; transform: rotateX(0); } 50% { opacity:0; transform: rotateX(90deg); } 100% { opacity:1; transform: rotateX(0); } }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
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
    this.icons = {}; // slug(lowercase) → Bild-URL aus dem Gift-Katalog
    this.newRound(false);
    this.loadCatalog();
  }

  /** Echte Gift-Bilder aus dem App-Katalog (alles, was je gesehen wurde). */
  async loadCatalog() {
    try {
      const res = await fetch(`${this.ctx.baseUrl}/gift-catalog?token=${this.ctx.token}`);
      const cat = await res.json();
      const list = [];
      for (const [slug, entry] of Object.entries(cat)) {
        if (entry && entry.icon) {
          this.icons[slug] = entry.icon;
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
    const rand = rng(`${this.ctx.layerId || 'bingo'}-autogifts`);
    const shuffled = [...pool].sort(() => rand() - 0.5);
    const want = Math.max(3, Math.floor((this.size * this.size) / 2));
    return shuffled.slice(0, want).map((g) => g.slug);
  }

  applyIcons() {
    for (const cell of this.cells) {
      if (cell.kind !== 'gift' || cell.icon) continue;
      const url = this.icons[cell.slug.toLowerCase()];
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
    const rand = rng(`${this.ctx.layerId || 'bingo'}-${this.round}`);
    const base = this.baseStats ?? { likes: 0, coins: 0, follows: 0 };
    const pool = [];
    const giftSlugs = this.gifts.length ? this.gifts : (this.autoGifts || []);
    for (const g of giftSlugs) pool.push({ kind: 'gift', slug: g, label: g, icon: (this.icons || {})[g.toLowerCase()] });
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
    const g = this.gridEl.getBoundingClientRect();
    const a = first.getBoundingClientRect();
    const b = last.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - g.left, y1 = a.top + a.height / 2 - g.top;
    const x2 = b.left + b.width / 2 - g.left, y2 = b.top + b.height / 2 - g.top;
    const len = Math.hypot(x2 - x1, y2 - y1) + Math.min(a.width, a.height) * 0.7;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const off = Math.min(a.width, a.height) * 0.35;
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
    if (event.type !== 'gift' || !event.gift) return;
    const slug = event.gift.slug.toLowerCase();
    for (const cell of this.cells) {
      if (cell.kind === 'gift' && !cell.done && cell.slug.toLowerCase() === slug) {
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

  destroy() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
