// stat-chips.js — Premium Live-Zähler-Chips. Glas-Pills, Icon-Glow, Puls.
// props: { metrics?, accent? }
const STYLE_ID = 'bx-sc-style';
const CSS = `
.bx-sc { position: absolute; inset: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-family: var(--bx-font-body); }
.bx-sc-chip { display: flex; align-items: center; gap: 9px; padding: 9px 18px 9px 12px; border-radius: 999px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: 0 8px 20px -8px rgba(0,0,0,.6), 0 0 0 1px color-mix(in srgb, var(--bx-accent) 30%, transparent) inset; }
.bx-sc-icon { font-size: 17px; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--bx-accent) 50%, transparent)); }
.bx-sc-value { font-family: var(--bx-font-mono); font-weight: 700; font-size: 19px; color: #fff;
  text-shadow: 0 2px 6px rgba(0,0,0,.7); min-width: 38px; }
.bx-sc-chip.pulse .bx-sc-value { animation: bx-sc-pop 440ms cubic-bezier(.2,1.6,.4,1); }
@keyframes bx-sc-pop { 50% { transform: scale(1.25); color: var(--bx-gold); } }
`;
const METRICS = { viewers: ['👁','viewers'], likes: ['❤️','likes'], follows: ['➕','follows'], coins: ['🪙','coins'], gifts: ['🎁','gifts'], shares: ['📤','shares'] };
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
      chip.innerHTML = `<span class="bx-sc-icon">${METRICS[m][0]}</span><span class="bx-sc-value">0</span>`;
      this.el.appendChild(chip);
      this.chips.set(m, { chip, value: chip.querySelector('.bx-sc-value'), last: 0 });
    }
    root.appendChild(this.el);
  }
  onStats(stats) {
    for (const [metric, c] of this.chips) {
      const v = Number(stats?.totals?.[METRICS[metric][1]] ?? 0);
      if (v !== c.last) { c.last = v; c.value.textContent = fmt(v); c.chip.classList.remove('pulse'); void c.chip.offsetWidth; c.chip.classList.add('pulse'); }
    }
  }
  destroy() { this.el.remove(); }
}
