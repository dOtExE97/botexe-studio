// goal-bar.js — Premium Session-Goal-Balken. Glas, Glow-Kante, Stripes,
// Milestone-Ticks, Done-Puls. props: { metric, target, label?, accent? }
const STYLE_ID = 'bx-gb-style';
const CSS = `
.bx-gb { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center;
  font-family: var(--bx-font-body); padding: 4px 2px; container-type: size; }
.bx-gb-head { display: flex; justify-content: space-between; align-items: baseline; margin: 0 4px 8px; }
.bx-gb-label { font-family: var(--bx-font-display); font-size: clamp(9px,8cqmin,16px); letter-spacing: .26em; color: var(--bx-text,#fff);
  text-transform: uppercase; text-shadow: 0 2px 8px rgba(0,0,0,.8); }
.bx-gb-nums { font-family: var(--bx-font-mono); font-weight: 700; font-size: clamp(9px,8cqmin,17px); color: var(--bx-gold);
  text-shadow: 0 0 12px color-mix(in srgb, var(--bx-gold) 45%, transparent), 0 2px 6px rgba(0,0,0,.8); }
.bx-gb-track { position: relative; height: clamp(14px,38cqmin,30px); border-radius: 999px; overflow: hidden;
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
  font-family: var(--bx-font-display); font-size: clamp(9px,5cqmin,14px); color: #fff; letter-spacing: .14em; text-shadow: 0 1px 4px rgba(0,0,0,.95); }
.bx-gb.done .bx-gb-fill { background: linear-gradient(90deg, var(--bx-teal), #7dffe9); box-shadow: 0 0 26px 0 color-mix(in srgb, var(--bx-teal) 75%, transparent); }
.bx-gb.done .bx-gb-track { animation: bx-gb-pulse 900ms ease-in-out 3; }
@keyframes bx-gb-stripes { to { transform: translateX(26px); } }
@keyframes bx-gb-pulse { 50% { box-shadow: 0 0 0 2px color-mix(in srgb, var(--bx-teal) 80%, transparent) inset, 0 0 36px 0 color-mix(in srgb, var(--bx-teal) 65%, transparent); } }

/* ── Stil „Arcade" — LED-Segmentblöcke statt fließendem Balken: eckig, blockig,
   Retro-Spielhallen-Energie. Füllung springt sichtbar Block für Block. */
.bx-gb-arcade .bx-gb-track { border-radius: 6px; }
.bx-gb-arcade .bx-gb-fill { border-radius: 4px;
  -webkit-mask: repeating-linear-gradient(90deg, #000 0 22px, transparent 22px 27px);
  mask: repeating-linear-gradient(90deg, #000 0 22px, transparent 22px 27px); }
.bx-gb-arcade .bx-gb-fill::after { display: none; }
.bx-gb-arcade .bx-gb-tick { display: none; }
.bx-gb-arcade .bx-gb-label { letter-spacing: .4em; }

/* ── Stil „Slim" — hauchdünne Linie, Zahlen frei darüber: edel-minimal für
   cleane IRL-/Talk-Overlays. Kein Chrome, nur Information. */
.bx-gb-slim .bx-gb-track { height: 7px; border-radius: 999px;
  background: rgba(255,255,255,.14); box-shadow: 0 1px 4px rgba(0,0,0,.5); }
.bx-gb-slim .bx-gb-fill { box-shadow: 0 0 14px 0 color-mix(in srgb, var(--bx-accent) 80%, transparent); }
.bx-gb-slim .bx-gb-fill::after { display: none; }
.bx-gb-slim .bx-gb-tick { display: none; }
.bx-gb-slim .bx-gb-pct { display: none; }
.bx-gb-slim .bx-gb-label { letter-spacing: .3em; font-size: clamp(9px,7cqmin,14px); }

/* ── THERMOMETER — senkrecht: füllt sich von unten nach oben. Spart Breite und
   passt damit deutlich besser ins TikTok-Hochformat als ein Querbalken. */
.bx-gb-thermo { flex-direction: column; align-items: center; gap: 6px; }
.bx-gb-thermo .bx-gb-head { flex-direction: column; align-items: center; gap: 2px; margin: 0 0 4px; text-align: center; }
.bx-gb-thermo .bx-gb-track { flex: 1; width: clamp(22px, 26cqmin, 54px); height: auto; min-height: 0;
  border-radius: 999px; overflow: hidden; }
/* Füllung wächst nach OBEN (statt nach rechts) — Höhe kommt aus --pct. */
.bx-gb-thermo .bx-gb-fill { top: auto; bottom: 0; left: 0; right: 0; width: 100% !important;
  height: var(--pct, 0%); border-radius: 999px;
  transition: height 700ms cubic-bezier(.25,1,.35,1); }
.bx-gb-thermo .bx-gb-fill::after { animation: bx-gb-stripes-v 1.6s linear infinite;
  background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.16) 0 8px, transparent 8px 18px); }
@keyframes bx-gb-stripes-v { to { transform: translateY(-26px); } }
/* Skalenstriche waagerecht statt senkrecht */
.bx-gb-thermo .bx-gb-tick { top: auto !important; left: 4px !important; right: 4px; width: auto; height: 2px; }
.bx-gb-thermo .bx-gb-tick:nth-of-type(2) { bottom: 25%; }
.bx-gb-thermo .bx-gb-tick:nth-of-type(3) { bottom: 50%; }
.bx-gb-thermo .bx-gb-tick:nth-of-type(4) { bottom: 75%; }
.bx-gb-thermo .bx-gb-pct { writing-mode: horizontal-tb; align-items: flex-start; padding-top: 6px; }

/* ── AKKU — Batterie-Metapher: eckiges Gehäuse mit Pluspol rechts, füllt sich
   in Blöcken. Bei 100% blitzt es. */
.bx-gb-akku .bx-gb-track { border-radius: 6px; border: 2.5px solid rgba(255,255,255,.75);
  box-shadow: 0 4px 14px -6px rgba(0,0,0,.7); overflow: visible; }
.bx-gb-akku .bx-gb-track::after { content:''; position:absolute; right:-9px; top:28%; bottom:28%; width:6px;
  border-radius: 0 3px 3px 0; background: rgba(255,255,255,.75); }
.bx-gb-akku .bx-gb-fill { border-radius: 3px; margin: 3px;
  -webkit-mask: repeating-linear-gradient(90deg, #000 0 16px, transparent 16px 21px);
  mask: repeating-linear-gradient(90deg, #000 0 16px, transparent 16px 21px); }
.bx-gb-akku .bx-gb-fill::after { display: none; }
.bx-gb-akku .bx-gb-tick { display: none; }
.bx-gb-akku.done .bx-gb-track { animation: bx-gb-flash 700ms ease-in-out infinite; }
@keyframes bx-gb-flash { 50% { border-color: var(--bx-teal); box-shadow: 0 0 24px 0 var(--bx-teal); } }

/* ── RING — kreisförmiger Fortschritt mit Prozent in der Mitte. Braucht kaum
   Fläche und liest sich auf einen Blick. */
.bx-gb-ring { align-items: center; justify-content: center; }
.bx-gb-ring .bx-gb-head { position: absolute; top: 2px; left: 0; right: 0; flex-direction: column;
  align-items: center; gap: 0; margin: 0; }
.bx-gb-ring .bx-gb-track { position: relative; width: clamp(60px, 62cqmin, 200px); height: clamp(60px, 62cqmin, 200px);
  border-radius: 50%; background: conic-gradient(var(--bx-accent) 0, var(--bx-gold) var(--pct, 0%), rgba(255,255,255,.12) var(--pct, 0%));
  box-shadow: 0 8px 22px -10px rgba(0,0,0,.75); overflow: visible; }
.bx-gb-ring .bx-gb-track::after { content:''; position:absolute; inset: 14%; border-radius: 50%;
  background: rgba(10,11,18,.92); }
.bx-gb-ring .bx-gb-fill, .bx-gb-ring .bx-gb-tick { display: none; }
.bx-gb-ring .bx-gb-pct { z-index: 1; font-size: clamp(13px, 15cqmin, 34px); letter-spacing: .04em; }
.bx-gb-ring.done .bx-gb-track { animation: bx-gb-pulse 900ms ease-in-out 3; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
const LABELS = { coins: 'Coin-Ziel', likes: 'Like-Ziel', follows: 'Follower-Ziel', gifts: 'Geschenk-Ziel' };
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

export default class GoalBar {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.metric = ['coins', 'likes', 'follows', 'gifts'].includes(props.metric) ? props.metric : 'coins';
    this.target = Math.max(1, Number(props.target ?? 1000));
    this.label = props.label || LABELS[this.metric];
    this.el = document.createElement('div');
    const style = ['glas', 'arcade', 'slim', 'thermo', 'akku', 'ring'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-gb${style !== 'glas' ? ` bx-gb-${style}` : ''}`;
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
    this.el.style.setProperty('--pct', `${pct}%`); // Thermometer-Stil füllt über die Höhe
    this.el.querySelector('.bx-gb-pct').textContent = `${Math.floor(pct)}%`;
    this.el.querySelector('.bx-gb-nums').textContent = `${fmt(cur)} / ${fmt(this.target)}`;
    this.el.classList.toggle('done', cur >= this.target);
  }
  destroy() { this.el.remove(); }
}
