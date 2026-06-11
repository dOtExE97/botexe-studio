// stat-chips.js — kompakte Live-Zähler als Chip-Reihe (Viewer, Likes,
// Follower, Coins, Shares — frei wählbar). Stats-getrieben, kein Polling.
// props: { metrics?: string (komma-liste), accent?: string }

const STYLE_ID = 'bx-sc-style';
const CSS = `
.bx-sc {
  position: absolute; inset: 0; display: flex; align-items: center; gap: 8px;
  font-family: 'Arial Black', Impact, sans-serif; flex-wrap: wrap;
}
.bx-sc-chip {
  display: flex; align-items: center; gap: 7px; padding: 7px 16px 7px 10px;
  background: linear-gradient(165deg, rgba(16,18,26,.92), rgba(10,11,16,.86));
  clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  border-left: 3px solid var(--bx-accent, #ff4d2e);
  box-shadow: 0 8px 22px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08) inset;
}
.bx-sc-icon { font-size: 15px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
.bx-sc-value {
  font-family: Consolas, Menlo, monospace; font-weight: 700; font-size: 17px;
  color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.8); min-width: 36px;
}
.bx-sc-chip.bx-sc-pulse .bx-sc-value { animation: bx-sc-pop 400ms cubic-bezier(.2,1.6,.4,1); }
@keyframes bx-sc-pop { 50% { transform: scale(1.22); color: var(--bx-accent, #ffd23e); } }
`;

const METRICS = {
  viewers: { icon: '👁', key: 'viewers' },
  likes: { icon: '❤️', key: 'likes' },
  follows: { icon: '➕', key: 'follows' },
  coins: { icon: '🪙', key: 'coins' },
  gifts: { icon: '🎁', key: 'gifts' },
  shares: { icon: '📤', key: 'shares' },
};

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

export default class StatChips {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    const wanted = String(props.metrics || 'viewers,likes,follows')
      .split(',')
      .map((m) => m.trim())
      .filter((m) => METRICS[m]);
    this.el = document.createElement('div');
    this.el.className = 'bx-sc';
    this.chips = new Map();
    for (const m of wanted) {
      const chip = document.createElement('div');
      chip.className = 'bx-sc-chip';
      chip.innerHTML = `<span class="bx-sc-icon"></span><span class="bx-sc-value">0</span>`;
      chip.querySelector('.bx-sc-icon').textContent = METRICS[m].icon;
      this.el.appendChild(chip);
      this.chips.set(m, { chip, value: chip.querySelector('.bx-sc-value'), last: 0 });
    }
    root.appendChild(this.el);
  }

  onStats(stats) {
    for (const [metric, c] of this.chips) {
      const v = Number(stats?.totals?.[METRICS[metric].key] ?? 0);
      if (v !== c.last) {
        c.last = v;
        c.value.textContent = fmt(v);
        c.chip.classList.remove('bx-sc-pulse');
        void c.chip.offsetWidth;
        c.chip.classList.add('bx-sc-pulse');
      }
    }
  }

  destroy() {
    this.el.remove();
  }
}
