// hype-train.js — Hype-Train à la Twitch, für TikTok: Geschenke & Likes treiben
// einen „Zug" an, der in Stufen aufsteigt (Level 1→max). Jeder Beitrag füllt den
// Balken UND verlängert den Timer; läuft der Timer ab, endet der Zug mit einem
// Finale. Eskalierende Farbe pro Level. Sound beim Level-Up (ctx.playSound).
//
// props: { coinsPerPoint?, likesPerPoint?, levelStep?, maxLevels?, windowSec?,
//          title?, levelSoundId?, accent? }
const STYLE_ID = 'bx-ht-style';
const LEVEL_COLORS = ['#28e0c4', '#7cc8ff', '#ffd23e', '#ff9d2e', '#ff4d2e', '#c45cff'];
const CSS = `
.bx-ht { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; gap:8px;
  padding:14px 18px; container-type:size; font-family: var(--bx-font-body);
  background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 50px -14px var(--bx-ht-color, var(--bx-accent));
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  opacity:0; transform: translateY(12px) scale(.97); transition: opacity .4s, transform .4s; }
.bx-ht.on { opacity:1; transform:none; }
.bx-ht-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.bx-ht-title { font-family: var(--bx-font-display); font-size: clamp(14px, 5cqmin, 28px); letter-spacing:.14em;
  text-transform:uppercase; color: var(--bx-text, #fff); text-shadow: 0 0 16px var(--bx-ht-color, var(--bx-accent)); }
.bx-ht-lvl { font-family: var(--bx-font-display); font-size: clamp(13px, 4.6cqmin, 24px);
  color: var(--bx-ht-color, var(--bx-accent)); -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
.bx-ht-track { position:relative; height: clamp(16px, 7cqmin, 30px); border-radius: 999px;
  background: rgba(8,10,18,.55); overflow:hidden; border:1px solid rgba(255,255,255,.12); }
.bx-ht-fill { position:absolute; inset:0 auto 0 0; width:0%;
  background: linear-gradient(90deg, var(--bx-ht-color, var(--bx-accent)), color-mix(in srgb, var(--bx-ht-color, var(--bx-accent)) 40%, #fff));
  box-shadow: 0 0 18px var(--bx-ht-color, var(--bx-accent)); transition: width .35s cubic-bezier(.2,1,.3,1); }
.bx-ht-loco { position:absolute; top:50%; transform: translate(-50%,-50%); font-size: clamp(14px, 6cqmin, 26px);
  transition: left .35s cubic-bezier(.2,1,.3,1); filter: drop-shadow(0 2px 4px rgba(0,0,0,.6)); }
.bx-ht-foot { display:flex; align-items:center; justify-content:space-between; gap:10px;
  font-size: clamp(10px, 3cqmin, 15px); color: var(--bx-muted); }
.bx-ht-foot b { color: var(--bx-text, #fff); }
.bx-ht-timer { height:5px; border-radius:3px; background: rgba(255,255,255,.12); overflow:hidden; }
.bx-ht-timer > i { display:block; height:100%; width:100%; background: var(--bx-ht-color, var(--bx-accent)); transition: width .25s linear; }
.bx-ht.levelup .bx-ht-track { animation: bx-ht-pump .5s ease; }
@keyframes bx-ht-pump { 0%,100%{ transform:scale(1) } 40%{ transform:scale(1.06) } }
.bx-ht-burst { position:absolute; inset:0; pointer-events:none; border-radius:inherit;
  background: radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--bx-ht-color) 55%, transparent), transparent 60%);
  opacity:0; }
.bx-ht.levelup .bx-ht-burst { animation: bx-ht-flash .6s ease; }
@keyframes bx-ht-flash { 0%{opacity:0} 25%{opacity:1} 100%{opacity:0} }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(Math.round(n)));

export default class HypeTrain {
  constructor(root, props, ctx) {
    ensureStyle();
    this.host = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.coinsPerPoint = Math.max(0.01, Number(props.coinsPerPoint ?? 1));
    this.likesPerPoint = Math.max(0.01, Number(props.likesPerPoint ?? 10));
    this.levelStep = Math.max(1, Number(props.levelStep ?? 200));
    this.maxLevels = Math.max(2, Math.min(6, Number(props.maxLevels ?? 5)));
    this.windowMs = Math.max(8, Number(props.windowSec ?? 30)) * 1000;
    this.title = props.title || 'Hype-Train';
    this.levelSound = props.levelSoundId || '';

    this.active = false;
    this.points = 0;
    this.level = 1;
    this.deadline = 0;
    this.contributors = 0;
    this.lastT = 0;

    this.el = document.createElement('div');
    this.el.className = 'bx-ht';
    this.el.innerHTML = `<div class="bx-ht-burst"></div>
      <div class="bx-ht-head"><span class="bx-ht-title"></span><span class="bx-ht-lvl"></span></div>
      <div class="bx-ht-track"><div class="bx-ht-fill"></div><div class="bx-ht-loco">🚂</div></div>
      <div class="bx-ht-foot"><span class="goal"></span><span class="time"></span></div>
      <div class="bx-ht-timer"><i></i></div>`;
    this.el.querySelector('.bx-ht-title').textContent = this.title;
    this.fillEl = this.el.querySelector('.bx-ht-fill');
    this.locoEl = this.el.querySelector('.bx-ht-loco');
    this.lvlEl = this.el.querySelector('.bx-ht-lvl');
    this.goalEl = this.el.querySelector('.goal');
    this.timeEl = this.el.querySelector('.time');
    this.timerEl = this.el.querySelector('.bx-ht-timer > i');
    root.appendChild(this.el);
    this.now = () => performance.now();
  }

  onEvent(event) {
    let pts = 0;
    if (event.type === 'gift' && event.gift) pts = event.gift.totalCoins / this.coinsPerPoint;
    else if (event.type === 'like') pts = (event.likeCount ?? 0) / this.likesPerPoint;
    if (pts <= 0) return;
    this.add(pts);
  }

  add(pts) {
    if (!this.active) this.start();
    const prevLevel = this.level;
    this.points += pts;
    this.contributors += 1;
    this.deadline = this.now() + this.windowMs; // jeder Beitrag verlängert
    this.level = Math.min(this.maxLevels, Math.floor(this.points / this.levelStep) + 1);
    if (this.level > prevLevel) this.levelUp();
    this.render();
  }

  start() {
    this.active = true;
    this.points = 0;
    this.level = 1;
    this.contributors = 0;
    this.el.classList.add('on');
    this.kick();
  }

  levelUp() {
    if (this.levelSound) this.host.playSound?.(this.levelSound);
    this.el.classList.remove('levelup'); void this.el.offsetWidth; this.el.classList.add('levelup');
  }

  end() {
    this.active = false;
    this.el.classList.remove('on');
  }

  // Neuer Stream → Hype-Train komplett zurück: ausblenden, Punkte/Level/Beiträge
  // null, Frame-Loop stoppen UND die DOM-Anzeige (Fill/Level/Farbe/Text) neu
  // zeichnen, sonst bleiben Balken/Level/Glow vom alten Stream stehen.
  onReset() {
    this.points = 0; this.level = 1; this.contributors = 0; this.deadline = 0;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.el.classList.remove('levelup');
    this.end();
    this.render();
  }

  // Countdown-Balken → setInterval statt rAF-Dauerschleife. Die Breite wird
  // per CSS-transition (.25s) GPU-seitig geglättet, also kein sichtbares Ruckeln.
  kick() {
    if (this.timer) return;
    this.timer = setInterval(() => this.frame(), 250);
    this.frame();
  }

  frame() {
    const remain = Math.max(0, this.deadline - this.now());
    this.timerEl.style.width = `${(remain / this.windowMs) * 100}%`;
    this.timeEl.textContent = `${Math.ceil(remain / 1000)}s`;
    if (remain <= 0 && this.active) { this.end(); }
    if (!this.active && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  render() {
    const color = LEVEL_COLORS[Math.min(LEVEL_COLORS.length - 1, this.level - 1)];
    this.el.style.setProperty('--bx-ht-color', color);
    const inLevel = this.points % this.levelStep;
    const prog = this.level >= this.maxLevels ? 1 : inLevel / this.levelStep;
    this.fillEl.style.width = `${Math.min(100, prog * 100)}%`;
    this.locoEl.style.left = `${Math.min(98, Math.max(2, prog * 100))}%`;
    this.lvlEl.textContent = `LVL ${this.level}${this.level >= this.maxLevels ? ' · MAX' : ''}`;
    if (this.level >= this.maxLevels) {
      this.goalEl.innerHTML = `🔥 MAX-LEVEL! <b>${this.contributors}</b> Beiträge`;
    } else {
      const need = Math.ceil(this.levelStep - inLevel);
      this.goalEl.innerHTML = `noch <b>${fmt(need)}</b> bis Level ${this.level + 1}`;
    }
  }

  destroy() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.active = false;
    this.el.remove();
  }
}
