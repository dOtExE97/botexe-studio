// goal-bar.js — Premium Session-Goal-Balken. Glas, Glow-Kante, Stripes,
// Milestone-Ticks, Done-Puls. props: { metric, target, label?, accent? }
const STYLE_ID = 'bx-gb-style';
const CSS = `
.bx-gb { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center;
  font-family: var(--bx-font-body); padding: 4px 2px; }
.bx-gb-head { display: flex; justify-content: space-between; align-items: baseline; margin: 0 4px 8px; }
.bx-gb-label { font-family: var(--bx-font-display); font-size: 16px; letter-spacing: .26em; color: var(--bx-text,#fff);
  text-transform: uppercase; text-shadow: 0 2px 8px rgba(0,0,0,.8); }
.bx-gb-nums { font-family: var(--bx-font-mono); font-weight: 700; font-size: 17px; color: var(--bx-gold);
  text-shadow: 0 0 12px color-mix(in srgb, var(--bx-gold) 45%, transparent), 0 2px 6px rgba(0,0,0,.8); }
.bx-gb-track { position: relative; height: 30px; border-radius: 999px; overflow: hidden;
  background: linear-gradient(180deg, rgba(8,9,14,.92), rgba(18,20,28,.92));
  box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--bx-accent) 35%, transparent) inset, 0 10px 24px -8px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.06) inset; }
.bx-gb-fill { position: absolute; inset: 0; width: 0%; border-radius: 999px;
  background: linear-gradient(90deg, var(--bx-accent), var(--bx-accent-2) 55%, var(--bx-gold));
  box-shadow: 3px 0 18px 0 color-mix(in srgb, var(--bx-gold) 75%, transparent);
  transition: width 700ms cubic-bezier(.25,1,.35,1); }
.bx-gb-fill::after { content: ''; position: absolute; inset: 0;
  background: repeating-linear-gradient(115deg, transparent 0 16px, rgba(255,255,255,.18) 16px 26px);
  animation: bx-gb-stripes 1.3s linear infinite; }
.bx-gb-tick { position: absolute; top: 4px; bottom: 4px; width: 2px; border-radius: 2px; background: rgba(255,255,255,.18); }
.bx-gb-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); font-size: 14px; color: #fff; letter-spacing: .14em; text-shadow: 0 1px 4px rgba(0,0,0,.95); }
.bx-gb.done .bx-gb-fill { background: linear-gradient(90deg, var(--bx-teal), #7dffe9); box-shadow: 0 0 26px 0 color-mix(in srgb, var(--bx-teal) 75%, transparent); }
.bx-gb.done .bx-gb-track { animation: bx-gb-pulse 900ms ease-in-out 3; }
@keyframes bx-gb-stripes { to { transform: translateX(26px); } }
@keyframes bx-gb-pulse { 50% { box-shadow: 0 0 0 2px color-mix(in srgb, var(--bx-teal) 80%, transparent) inset, 0 0 36px 0 color-mix(in srgb, var(--bx-teal) 65%, transparent); } }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
const LABELS = { coins: 'Coin-Goal', likes: 'Like-Goal', follows: 'Follower-Goal', gifts: 'Gift-Goal' };
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

export default class GoalBar {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.metric = ['coins', 'likes', 'follows', 'gifts'].includes(props.metric) ? props.metric : 'coins';
    this.target = Math.max(1, Number(props.target ?? 1000));
    this.label = props.label || LABELS[this.metric];
    this.el = document.createElement('div');
    this.el.className = 'bx-gb';
    this.el.innerHTML = `
      <div class="bx-gb-head"><div class="bx-gb-label"></div><div class="bx-gb-nums">0 / ${fmt(this.target)}</div></div>
      <div class="bx-gb-track">
        <div class="bx-gb-fill"></div>
        <div class="bx-gb-tick" style="left:25%"></div><div class="bx-gb-tick" style="left:50%"></div><div class="bx-gb-tick" style="left:75%"></div>
        <div class="bx-gb-pct">0%</div>
      </div>`;
    this.el.querySelector('.bx-gb-label').textContent = this.label;
    root.appendChild(this.el);
  }
  onStats(stats) {
    const cur = Number(stats?.totals?.[this.metric] ?? 0);
    const pct = Math.min(100, (cur / this.target) * 100);
    this.el.querySelector('.bx-gb-fill').style.width = `${pct}%`;
    this.el.querySelector('.bx-gb-pct').textContent = `${Math.floor(pct)}%`;
    this.el.querySelector('.bx-gb-nums').textContent = `${fmt(cur)} / ${fmt(this.target)}`;
    this.el.classList.toggle('done', cur >= this.target);
  }
  destroy() { this.el.remove(); }
}
