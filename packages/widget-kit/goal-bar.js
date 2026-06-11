// goal-bar.js — Session-Goal als Fortschrittsbalken.
// props: { metric: 'coins'|'likes'|'follows'|'gifts', target: number, label?: string }
// Datenquelle: stats-Push (onStats) — kein Polling.

const STYLE_ID = 'bx-gb-style';
const CSS = `
.bx-gb {
  position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center;
  font-family: 'Arial Black', 'Archivo Black', Impact, sans-serif;
}
.bx-gb-head { display: flex; justify-content: space-between; align-items: baseline; margin: 0 4px 7px; }
.bx-gb-label {
  font-size: 15px; letter-spacing: .3em; color: #fff; text-transform: uppercase;
  text-shadow: 0 2px 6px rgba(0,0,0,.8);
}
.bx-gb-nums {
  font-family: Consolas, Menlo, monospace; font-weight: 700; font-size: 16px;
  color: #ffd23e; text-shadow: 0 2px 6px rgba(0,0,0,.8);
}
.bx-gb-track {
  position: relative; height: 26px;
  background: rgba(10,11,16,.85);
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  box-shadow: 0 0 0 1px rgba(255,255,255,.12) inset, 0 8px 22px rgba(0,0,0,.45);
  overflow: hidden;
}
.bx-gb-fill {
  position: absolute; inset: 0; width: 0%;
  background: linear-gradient(90deg, var(--bx-accent, #ff4d2e), #ff8a3d 60%, #ffd23e);
  transition: width 600ms cubic-bezier(.25,1,.35,1);
  box-shadow: 2px 0 14px rgba(255,210,62,.85);
}
.bx-gb-tick {
  position: absolute; top: 0; bottom: 0; width: 1.5px;
  background: rgba(255,255,255,.22);
}
.bx-gb-fill::after {
  content: ''; position: absolute; inset: 0;
  background: repeating-linear-gradient(115deg, transparent 0 14px, rgba(255,255,255,.16) 14px 22px);
  animation: bx-gb-stripes 1.4s linear infinite;
}
.bx-gb-pct {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: #fff; letter-spacing: .12em;
  text-shadow: 0 1px 3px rgba(0,0,0,.9);
}
.bx-gb.bx-gb-done .bx-gb-fill { background: linear-gradient(90deg, #21e6c1, #6dffe3); }
.bx-gb.bx-gb-done .bx-gb-track { animation: bx-gb-pulse 900ms ease-in-out 3; }
@keyframes bx-gb-stripes { to { transform: translateX(22px); } }
@keyframes bx-gb-pulse {
  50% { box-shadow: 0 0 0 1px rgba(33,230,193,.8) inset, 0 0 32px rgba(33,230,193,.65); }
}
`;

const METRIC_LABELS = { coins: 'Coin-Goal', likes: 'Like-Goal', follows: 'Follower-Goal', gifts: 'Gift-Goal' };

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
}

export default class GoalBar {
  constructor(root, props) {
    ensureStyle();
    this.metric = ['coins', 'likes', 'follows', 'gifts'].includes(props.metric) ? props.metric : 'coins';
    this.target = Math.max(1, Number(props.target ?? 1000));
    this.label = props.label || METRIC_LABELS[this.metric];
    this.el = document.createElement('div');
    this.el.className = 'bx-gb';
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.el.innerHTML = `
      <div class="bx-gb-head">
        <div class="bx-gb-label"></div>
        <div class="bx-gb-nums">0 / ${fmt(this.target)}</div>
      </div>
      <div class="bx-gb-track">
        <div class="bx-gb-fill"></div>
        <div class="bx-gb-tick" style="left:25%"></div>
        <div class="bx-gb-tick" style="left:50%"></div>
        <div class="bx-gb-tick" style="left:75%"></div>
        <div class="bx-gb-pct">0%</div>
      </div>`;
    this.el.querySelector('.bx-gb-label').textContent = this.label;
    root.appendChild(this.el);
  }

  onStats(stats) {
    const current = Number(stats?.totals?.[this.metric] ?? 0);
    const pct = Math.min(100, (current / this.target) * 100);
    this.el.querySelector('.bx-gb-fill').style.width = `${pct}%`;
    this.el.querySelector('.bx-gb-pct').textContent = `${Math.floor(pct)}%`;
    this.el.querySelector('.bx-gb-nums').textContent = `${fmt(current)} / ${fmt(this.target)}`;
    this.el.classList.toggle('bx-gb-done', current >= this.target);
  }

  destroy() {
    this.el.remove();
  }
}
