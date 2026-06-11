// stat-chips.js — Premium Live-Zähler-Chips. Glas-Pills, Icon-Glow, Puls.
// props: { metrics?, accent? }
const STYLE_ID = 'bx-sc-style';
const CSS = `
.bx-sc { position: absolute; inset: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-family: var(--bx-font-body); }
.bx-sc-chip { display: flex; align-items: center; gap: 9px; padding: 9px 18px 9px 12px; border-radius: 999px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: 0 8px 20px -8px rgba(0,0,0,.6), 0 0 0 1px color-mix(in srgb, var(--bx-accent) 30%, transparent) inset; }
.bx-sc-icon { display: flex; align-items: center; justify-content: center; width: 19px; height: 19px;
  color: var(--bx-accent); filter: drop-shadow(0 0 6px color-mix(in srgb, var(--bx-accent) 55%, transparent)); }
.bx-sc-icon svg { width: 100%; height: 100%; display: block; }
.bx-sc-value { font-family: var(--bx-font-num); font-weight: 700; font-size: 19px; color: #fff;
  text-shadow: 0 2px 6px rgba(0,0,0,.7); min-width: 38px; }
.bx-sc-chip.pulse .bx-sc-value { animation: bx-sc-pop 440ms cubic-bezier(.2,1.6,.4,1); }
.bx-sc-chip.pulse .bx-sc-icon { animation: bx-sc-glow 440ms ease; }
@keyframes bx-sc-pop { 50% { transform: scale(1.25); color: var(--bx-gold); } }
@keyframes bx-sc-glow { 50% { color: var(--bx-gold); filter: drop-shadow(0 0 10px color-mix(in srgb, var(--bx-gold) 75%, transparent)); } }
`;
// Monochrome Inline-SVG-Icons (24×24, currentColor) — bewusst schlicht, edel.
const ICON = {
  // Auge — Outline-Kontur + Pupille gefüllt
  viewers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
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
const METRICS = { viewers: ['viewers'], likes: ['likes'], follows: ['follows'], coins: ['coins'], gifts: ['gifts'], shares: ['shares'] };
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

export default class StatChips {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    const wanted = String(props.metrics || 'viewers,likes,follows').split(',').map((m) => m.trim()).filter((m) => METRICS[m]);
    this.el = document.createElement('div');
    this.el.className = 'bx-sc';
    this.chips = new Map();
    for (const m of wanted) {
      const chip = document.createElement('div');
      chip.className = 'bx-sc-chip';
      chip.innerHTML = `<span class="bx-sc-icon">${ICON[m] || ''}</span><span class="bx-sc-value">0</span>`;
      this.el.appendChild(chip);
      this.chips.set(m, { chip, value: chip.querySelector('.bx-sc-value'), last: 0 });
    }
    root.appendChild(this.el);
  }
  onStats(stats) {
    for (const [metric, c] of this.chips) {
      const v = Number(stats?.totals?.[METRICS[metric][0]] ?? 0);
      if (v !== c.last) { c.last = v; c.value.textContent = fmt(v); c.chip.classList.remove('pulse'); void c.chip.offsetWidth; c.chip.classList.add('pulse'); }
    }
  }
  destroy() { this.el.remove(); }
}
