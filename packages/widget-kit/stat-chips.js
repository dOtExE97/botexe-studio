// stat-chips.js — Premium Live-Zähler-Chips. Glas-Pills, Icon-Glow, Puls.
// props: { metrics?, accent? }
const STYLE_ID = 'bx-sc-style';
// --u = „1px bei Standardgröße" (540×60): Chips, Icons und Zahlen sind
// Vielfache davon und wachsen mit, wenn der Nutzer das Widget größer zieht.
const CSS = `
.bx-sc { position: absolute; inset: 0; display: flex; align-items: center; gap: 1.85%; flex-wrap: wrap;
  container-type: size; --u: min(0.185cqi, 1.667cqh); font-family: var(--bx-font-body); }
.bx-sc-chip { display: flex; align-items: center; gap: calc(var(--u) * 9);
  padding: calc(var(--u) * 9) calc(var(--u) * 18) calc(var(--u) * 9) calc(var(--u) * 12); border-radius: 999px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: 0 8px 20px -8px rgba(0,0,0,.6), 0 0 0 1px color-mix(in srgb, var(--bx-accent) 30%, transparent) inset; }
.bx-sc-icon { display: flex; align-items: center; justify-content: center;
  width: clamp(10px, calc(var(--u) * 19), 76px); height: clamp(10px, calc(var(--u) * 19), 76px);
  color: var(--bx-accent); filter: drop-shadow(0 0 6px color-mix(in srgb, var(--bx-accent) 55%, transparent)); }
.bx-sc-icon svg { width: 100%; height: 100%; display: block; }
.bx-sc-value { font-family: var(--bx-font-num); font-weight: 700; font-size: clamp(10px, calc(var(--u) * 19), 76px); color: var(--bx-text,#fff);
  text-shadow: 0 1px 3px rgba(0,0,0,.9), 0 2px 6px rgba(0,0,0,.7); min-width: calc(var(--u) * 38); }
.bx-sc-chip.pulse .bx-sc-value { animation: bx-sc-pop 440ms cubic-bezier(.2,1.6,.4,1); }
.bx-sc-chip.pulse .bx-sc-icon { animation: bx-sc-glow 440ms ease; }
@keyframes bx-sc-pop { 50% { transform: scale(1.25); color: var(--bx-gold); } }
@keyframes bx-sc-glow { 50% { color: var(--bx-gold); filter: drop-shadow(0 0 10px color-mix(in srgb, var(--bx-gold) 75%, transparent)); } }

/* ── Stil „Badges" — schräge, satte Akzent-Plaketten mit dunkler Schrift:
   fetter Esports-Look, jede Zahl ein Statement. */
.bx-sc-badges .bx-sc-chip { border-radius: 0; clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2));
  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--bx-accent) 80%, transparent);
  -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-sc-badges .bx-sc-icon { color: #0c0d14; filter: none; }
.bx-sc-badges .bx-sc-value { color: #0c0d14; text-shadow: none; font-family: var(--bx-font-display); }

/* ── Stil „Minimal" — kein Chip-Hintergrund: Icon + Zahl frei mit harter
   Schattenkante. Unsichtbar-leicht für cleane IRL-Overlays. */
.bx-sc-minimal .bx-sc-chip { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  padding: calc(var(--u) * 4) calc(var(--u) * 8); }
.bx-sc-minimal .bx-sc-value { text-shadow: 0 1px 0 rgba(0,0,0,.95), 0 2px 8px rgba(0,0,0,.9); }
.bx-sc-minimal .bx-sc-icon { filter: drop-shadow(0 1px 2px rgba(0,0,0,.9)); }
`;
// Monochrome Inline-SVG-Icons (24×24, currentColor) — bewusst schlicht, edel.
const ICON = {
  // Auge — Outline-Kontur + Pupille gefüllt
  viewers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  // Gruppe (zwei Personen) — „verschiedene Zuschauer gesamt"
  uniqueViewers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3.2"/><path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1"/><path d="M16 3.6a3.2 3.2 0 0 1 0 6.8"/><path d="M21.5 20v-1a5 5 0 0 0-3.5-4.8"/></svg>',
  // Herz — gefüllt
  likes: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.7-10.2-9.4C-.4 7.9 1.6 4 5.4 4c2.1 0 3.6 1.2 4.6 2.6C11 5.2 12.5 4 14.6 4c3.8 0 5.8 3.9 3.6 7.6C19.5 16.3 12 21 12 21Z"/></svg>',
  // Person-mit-Plus
  follows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 3 .8"/><path d="M19 14v6M16 17h6"/></svg>',
  // Münze — Kreis + Wertstrich
  coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9v6"/></svg>',
  // Geschenk
  gifts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><rect x="2" y="7" width="20" height="5" rx="1"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.5 2.5 0 0 0 0 5h4Z"/><path d="M12 7s1.5-4 4-4a2.5 2.5 0 0 1 0 5h-4Z"/></svg>',
  // Share — Pfeil nach oben-rechts aus Box heraus
  shares: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/><path d="M14 4h6v6"/><path d="M20 4 11 13"/></svg>',
};
const METRICS = { viewers: ['viewers'], uniqueViewers: ['uniqueViewers'], likes: ['likes'], follows: ['follows'], coins: ['coins'], gifts: ['gifts'], shares: ['shares'] };
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

export default class StatChips {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    const wanted = String(props.metrics || 'viewers,likes,follows').split(',').map((m) => m.trim()).filter((m) => METRICS[m]);
    this.el = document.createElement('div');
    const style = ['glas', 'badges', 'minimal'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-sc${style !== 'glas' ? ` bx-sc-${style}` : ''}`;
    this.chips = new Map();
    for (const m of wanted) {
      const chip = document.createElement('div');
      chip.className = 'bx-sc-chip';
      chip.innerHTML = `<span class="bx-sc-icon">${ICON[m] || ''}</span><span class="bx-sc-value">0</span>`;
      this.el.appendChild(chip);
      this.chips.set(m, { chip, value: chip.querySelector('.bx-sc-value'), last: 0 });
    }
    root.appendChild(this.el);
    // Editor-Vorschau: Beispielzahlen statt lauter Nullen — so sieht man, wie
    // breit die Chips mit echten Werten wirklich werden.
    if (ctx && ctx.preview) {
      const demo = { viewers: 342, uniqueViewers: 1180, likes: 12400, follows: 87, coins: 6800, gifts: 37, shares: 14 };
      for (const [metric, c] of this.chips) c.value.textContent = fmt(demo[metric] ?? 0);
    }
  }
  onStats(stats) {
    for (const [metric, c] of this.chips) {
      const v = Number(stats?.totals?.[METRICS[metric][0]] ?? 0);
      if (v !== c.last) { c.last = v; c.value.textContent = fmt(v); c.chip.classList.remove('pulse'); void c.chip.offsetWidth; c.chip.classList.add('pulse'); }
    }
  }
  destroy() { this.el.remove(); }
}
