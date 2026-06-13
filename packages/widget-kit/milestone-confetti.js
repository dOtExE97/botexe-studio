// milestone-confetti.js — feiert Meilensteine einer Stream-Metrik mit einem
// Konfetti-Burst + Glow-Banner. Zieht laufend onStats und vergleicht gegen die
// nächste Schwelle: entweder feste Liste (milestones: "1000,5000,10000") ODER
// ein Schritt (step: alle N Einheiten). Bei Überschreiten: Banner ploppt mit
// „{label} {n}", Konfetti regnet, optionaler Sound. Bis zur nächsten Schwelle
// ruhig — kein Dauer-Spam.
// props: { metric?, step?, milestones?, label?, message?, soundId?, accent? }
const STYLE_ID = 'bx-mc-style';
const CSS = `
.bx-mc { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  container-type:size; font-family: var(--bx-font-body); pointer-events:none; overflow:hidden; }
.bx-mc-banner { position:relative; display:flex; flex-direction:column; align-items:center; gap:.2em;
  padding: 3cqmin 6cqmin; border-radius: var(--bx-radius); background: var(--bx-glass);
  box-shadow: var(--bx-shadow), 0 0 60px -14px var(--bx-accent);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  opacity:0; transform: scale(.6) translateY(14px); }
.bx-mc-banner::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 85%, white), transparent 45%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; }
.bx-mc.show .bx-mc-banner { animation: bx-mc-pop 600ms cubic-bezier(.2,1.5,.4,1) forwards; }
.bx-mc.hide .bx-mc-banner { animation: bx-mc-out 420ms ease forwards; }
@keyframes bx-mc-pop { 0%{opacity:0; transform: scale(.6) translateY(14px)} 60%{opacity:1; transform: scale(1.06)} 100%{opacity:1; transform: scale(1)} }
@keyframes bx-mc-out { to { opacity:0; transform: scale(.9) translateY(-10px) } }
.bx-mc-label { font-family: var(--bx-font-display); font-size: clamp(11px, 4.5cqmin, 22px); letter-spacing:.24em;
  text-transform:uppercase; color: var(--bx-muted); }
.bx-mc-num { font-family: var(--bx-font-num); font-weight:800; line-height:1; font-size: clamp(32px, 18cqmin, 92px);
  color: var(--bx-gold); -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 26px color-mix(in srgb, var(--bx-gold) 60%, transparent); }
.bx-mc-msg { font-family: var(--bx-font-display); font-size: clamp(12px, 5cqmin, 24px); color: var(--bx-text,#fff);
  text-shadow: 0 2px 6px rgba(0,0,0,.6); }
.bx-mc-piece { position:absolute; top:-8%; width: 1.4cqmin; height: 2.2cqmin; border-radius:1px;
  will-change: transform, opacity; animation: bx-mc-fall var(--d) linear forwards; }
@keyframes bx-mc-fall { 0%{opacity:1; transform: translateY(0) rotate(0)} 100%{opacity:0; transform: translateY(120cqh) rotate(720deg)} }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const METRICS = ['coins', 'likes', 'follows', 'gifts'];
const LABELS = { coins: 'Coins', likes: 'Likes', follows: 'Follower', gifts: 'Geschenke' };
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

/** Nächste noch nicht erreichte Schwelle > cur. milestones schlägt step. */
export function nextMilestone(cur, step, milestones) {
  if (Array.isArray(milestones) && milestones.length) {
    // kleinste Schwelle über cur — robust auch bei unsortierter Liste
    let best = null;
    for (const m of milestones) if (m > cur && (best === null || m < best)) best = m;
    return best;
  }
  if (step > 0) return (Math.floor(cur / step) + 1) * step;
  return null;
}

export default class MilestoneConfetti {
  constructor(root, props, ctx) {
    ensureStyle();
    this.host = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.metric = METRICS.includes(props.metric) ? props.metric : 'follows';
    this.step = Math.max(0, Number(props.step ?? 100));
    this.milestones = String(props.milestones || '')
      .split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    this.label = props.label || LABELS[this.metric];
    this.message = props.message || 'Meilenstein! 🎉';
    this.soundId = props.soundId || '';
    this.colors = ['#ffd23e', '#ff5e8a', '#28e0c4', '#7c6bff', '#ff9d3d', '#5ad1ff'];
    this.lastSeen = null; // bekannter Stand; erst gesetzt → kein Burst beim Mount

    this.el = document.createElement('div');
    this.el.className = 'bx-mc';
    this.el.innerHTML = `<div class="bx-mc-banner">
      <div class="bx-mc-label"></div><div class="bx-mc-num">0</div><div class="bx-mc-msg"></div></div>`;
    this.banner = this.el.querySelector('.bx-mc-banner');
    this.el.querySelector('.bx-mc-label').textContent = this.label;
    this.el.querySelector('.bx-mc-msg').textContent = this.message;
    this.numEl = this.el.querySelector('.bx-mc-num');
    root.appendChild(this.el);

    // Editor-Vorschau: alle paar Sekunden eine Beispiel-Feier zeigen, damit man
    // im Live-Banner sieht, wie es im Stream aussieht (live feuert es nur bei
    // echten Meilensteinen). Eine plausible Schwelle als Demo-Zahl wählen.
    if (this.host.preview) {
      const demoVal = (this.milestones.length ? this.milestones[0] : (this.step || 100));
      const tick = () => this.celebrate(demoVal);
      this.demoTimer = setTimeout(tick, 900);
      this.demoInterval = setInterval(tick, 7000);
    }
  }

  onStats(stats) {
    const cur = Number(stats?.totals?.[this.metric] ?? 0);
    // Beim ersten Stats-Push nur den Stand merken — nicht rückwirkend feiern.
    if (this.lastSeen === null) { this.lastSeen = cur; return; }
    if (cur <= this.lastSeen) { this.lastSeen = cur; return; }
    // Jede überschrittene Schwelle zwischen lastSeen und cur feiern (höchste zuletzt).
    let hit = null;
    let t = nextMilestone(this.lastSeen, this.step, this.milestones.length ? this.milestones : null);
    while (t !== null && t <= cur) { hit = t; t = nextMilestone(t, this.step, this.milestones.length ? this.milestones : null); }
    this.lastSeen = cur;
    if (hit !== null) this.celebrate(hit);
  }

  celebrate(value) {
    this.numEl.textContent = fmt(value);
    this.el.classList.remove('hide');
    // reflow, damit die Pop-Animation auch bei Folge-Meilensteinen neu startet
    void this.banner.offsetWidth;
    this.el.classList.add('show');
    this.burst();
    if (this.soundId) this.host.playSound?.(this.soundId);
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => { this.el.classList.remove('show'); this.el.classList.add('hide'); }, 4200);
  }

  burst() {
    const n = 70;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'bx-mc-piece';
      const dur = 1.8 + (i % 7) * 0.22; // gestreute Falldauer ohne Math.random
      p.style.setProperty('--d', `${dur}s`);
      p.style.left = `${(i * 137) % 100}%`;
      p.style.background = this.colors[i % this.colors.length];
      p.style.animationDelay = `${(i % 9) * 40}ms`;
      this.el.appendChild(p);
      setTimeout(() => p.remove(), (dur + 0.5) * 1000);
    }
  }

  destroy() { clearTimeout(this.hideT); clearTimeout(this.demoTimer); clearInterval(this.demoInterval); this.el.remove(); }
}
