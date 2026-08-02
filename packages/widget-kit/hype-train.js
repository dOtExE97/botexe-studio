// hype-train.js — Hype-Train à la Twitch, für TikTok: Geschenke & Likes treiben
// einen „Zug" an, der in Stufen aufsteigt (Level 1→max). Jeder Beitrag füllt den
// Balken UND verlängert den Timer; läuft der Timer ab, endet der Zug mit einem
// Finale. Eskalierende Farbe pro Level. Sound beim Level-Up (ctx.playSound).
//
// props: { coinsPerPoint?, likesPerPoint?, levelStep?, maxLevels?, windowSec?,
//          title?, levelSoundId?, accent? }
const STYLE_ID = 'bx-ht-style';
const LEVEL_COLORS = ['#28e0c4', '#7cc8ff', '#ffd23e', '#ff9d2e', '#ff4d2e', '#c45cff'];
// --u = „1px bei Standardgröße" (560×150). cqmin (kurze Seite) hielt Titel und
// Balken in dem flachen, breiten Widget am Minimum kleben — jetzt führt die
// Breite (cqi), die Höhe (cqh) deckelt, damit nichts überläuft.
const CSS = `
.bx-ht { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; gap:4%;
  padding:2.5% 3.2%; container-type:size; --u: calc((min(0.1786cqi, 0.667cqh)) * var(--bx-fs, 1)); font-family: var(--bx-font-body);
  background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 50px -14px var(--bx-ht-color, var(--bx-accent));
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  opacity:0; transform: translateY(12px) scale(.97); transition: opacity .4s, transform .4s; }
.bx-ht.on { opacity:1; transform:none; }
.bx-ht-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.bx-ht-title { font-family: var(--bx-font-display); font-size: clamp(11px, calc(var(--u) * 20), 80px); letter-spacing:.14em;
  text-transform:uppercase; color: var(--bx-text, #fff); text-shadow: 0 0 16px var(--bx-ht-color, var(--bx-accent)); }
.bx-ht-lvl { font-family: var(--bx-font-display); font-size: clamp(10px, calc(var(--u) * 17), 68px);
  color: var(--bx-ht-color, var(--bx-accent)); -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
.bx-ht-track { position:relative; height: clamp(8px, calc(var(--u) * 26), 104px); border-radius: 999px;
  background: rgba(8,10,18,.55); overflow:hidden; border:1px solid rgba(255,255,255,.12); }
.bx-ht-fill { position:absolute; inset:0 auto 0 0; width:0%;
  background: linear-gradient(90deg, var(--bx-ht-color, var(--bx-accent)), color-mix(in srgb, var(--bx-ht-color, var(--bx-accent)) 40%, #fff));
  box-shadow: 0 0 18px var(--bx-ht-color, var(--bx-accent)); transition: width .35s cubic-bezier(.2,1,.3,1); }
.bx-ht-loco { position:absolute; top:50%; transform: translate(-50%,-50%); font-size: clamp(11px, calc(var(--u) * 20), 80px);
  transition: left .35s cubic-bezier(.2,1,.3,1); filter: drop-shadow(0 2px 4px rgba(0,0,0,.6)); }
.bx-ht-foot { display:flex; align-items:center; justify-content:space-between; gap:10px;
  font-size: clamp(9px, calc(var(--u) * 13), 52px); color: #c2c9dc; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.bx-ht-foot b { color: var(--bx-text, #fff); }
.bx-ht-timer { height: clamp(3px, calc(var(--u) * 5), 20px); border-radius:3px; background: rgba(255,255,255,.12); overflow:hidden; }
.bx-ht-timer > i { display:block; height:100%; width:100%; background: var(--bx-ht-color, var(--bx-accent)); transition: width .25s linear; }
.bx-ht.levelup .bx-ht-track { animation: bx-ht-pump .5s ease; }
@keyframes bx-ht-pump { 0%,100%{ transform:scale(1) } 40%{ transform:scale(1.06) } }
.bx-ht-burst { position:absolute; inset:0; pointer-events:none; border-radius:inherit;
  background: radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--bx-ht-color) 55%, transparent), transparent 60%);
  opacity:0; }
.bx-ht.levelup .bx-ht-burst { animation: bx-ht-flash .6s ease; }
@keyframes bx-ht-flash { 0%{opacity:0} 25%{opacity:1} 100%{opacity:0} }

/* ── Stil „Rakete" — Boost-Metapher statt Zug: Rakete mit Flammen-Schweif,
   freistehend ohne Panel. Der Balken wird zur Schubanzeige. */
.bx-ht-rakete { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-ht-rakete .bx-ht-track { border-radius: 6px; transform: skewX(-12deg);
  background: rgba(8,10,18,.72); border-color: color-mix(in srgb, var(--bx-ht-color, var(--bx-accent)) 50%, transparent); }
.bx-ht-rakete .bx-ht-fill { background: linear-gradient(90deg, #ff8a3d, #ffd23e 55%, #fff); box-shadow: 0 0 22px #ff8a3d; }
.bx-ht-rakete .bx-ht-loco { font-size: clamp(13px, calc(var(--u) * 26), 104px); transform: translate(-50%,-50%) rotate(45deg); }
.bx-ht-rakete .bx-ht-loco::after { content: '🔥'; position: absolute; left: -0.75em; top: 0.55em;
  font-size: 0.62em; transform: rotate(-45deg); filter: blur(0.4px); animation: bx-ht-flame .3s ease-in-out infinite alternate; }
@keyframes bx-ht-flame { from { opacity: .75; transform: rotate(-45deg) scale(.85); } to { opacity: 1; transform: rotate(-45deg) scale(1.15); } }
.bx-ht-rakete .bx-ht-title { -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Stil „LED" — Anzeigetafel: dunkle Tafel, segmentierter Balken, Scanlines. */
.bx-ht-led { background: #0a0c0a; border-radius: 8px;
  box-shadow: 0 0 0 3px #1c201c, 0 12px 30px -10px rgba(0,0,0,.8), inset 0 0 24px rgba(0,0,0,.9);
  -webkit-backdrop-filter: none; backdrop-filter: none; position: relative; }
.bx-ht-led::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.26) 2px 4px); }
.bx-ht-led .bx-ht-track { border-radius: 4px; }
.bx-ht-led .bx-ht-fill { -webkit-mask: repeating-linear-gradient(90deg, #000 0 14px, transparent 14px 18px);
  mask: repeating-linear-gradient(90deg, #000 0 14px, transparent 14px 18px); }
.bx-ht-led .bx-ht-loco { display: none; }
.bx-ht-led .bx-ht-title { font-family: var(--bx-font-mono); letter-spacing: .4em; color: var(--bx-gold); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-gold) 60%, transparent); }
.bx-ht-led .bx-ht-lvl { font-family: var(--bx-font-mono); }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur an Titel, Level und Fußzeile.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-ht-title { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-ht-lvl { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-ht-foot { color: #fff; -webkit-text-stroke: max(1.5px, .11em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Zwei Stufen: jeder Beitrag treibt den Balken → die BAHN löst aus. Steigt der
   Zug dabei eine Stufe, löst zusätzlich die LEVEL-ANZEIGE aus — der lautere
   Moment bekommt die zweite Stelle.
   Bewusst nicht das Panel: dessen box-shadow trägt Glas und Level-Glow, der
   Ring hätte beides 900 ms lang ersetzt.

   KOLLISION: Beim Stufenaufstieg pumpt die Bahn bereits
   („.bx-ht.levelup .bx-ht-track") und ist damit spezifischer als der Auslöser
   der Basis. Darum hier beides gemeinsam. */
.bx-premium .bx-ht.levelup .bx-ht-track.bx-hit {
  animation: bx-ht-pump .5s ease,
    bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Der Rakete-Stil kippt die Bahn (skewX) — der Ring folgt dieser Schräge von
   selbst, weil er am Element hängt. Der abgerundete Radius bleibt erhalten. */
/* Der Ring der Basis zeichnet in der Akzentfarbe. Beim Hype-Train sagt aber die
   LEVEL-Farbe, wie heiß es gerade ist — der Auslöser übernimmt sie, sonst
   leuchtet Stufe 5 in derselben Farbe wie Stufe 1. */
.bx-premium .bx-ht-track.bx-hit, .bx-premium .bx-ht-lvl.bx-hit { --bx-accent: var(--bx-ht-color, #ff4d2e); }
/* Die Level-Anzeige ist reiner Text. Der Ring der Basis ist in em bemessen und
   wird in großen Boxen zur Farbplatte statt zur Kontur — deshalb ein Schein,
   der der Schriftform folgt. */
.bx-premium .bx-ht-lvl.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-ht-hit-schein 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
@keyframes bx-ht-hit-schein {
  0% { filter: drop-shadow(0 0 0 var(--bx-ht-color, #ff4d2e)) drop-shadow(0 0 0 var(--bx-ht-color, #ff4d2e)); }
  18% { filter: drop-shadow(0 0 .12em var(--bx-ht-color, #ff4d2e)) drop-shadow(0 0 .32em var(--bx-ht-color, #ff4d2e)); }
  100% { filter: drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent); }
}
/* Mehr Tiefe: Titel und Level führen, die Fußzeile tritt zurück. */
.bx-premium .bx-ht-lvl { text-shadow: 0 0 .5em color-mix(in srgb, var(--bx-ht-color, var(--bx-accent)) 65%, transparent); }
.bx-premium .bx-ht-foot { opacity: .9; }
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
    this.timers = new Set();

    this.style = ['zug', 'rakete', 'led'].includes(props.style) ? props.style : 'zug';
    this.el = document.createElement('div');
    this.el.className = `bx-ht${this.style !== 'zug' ? ` bx-ht-${this.style}` : ''}`;
    this.el.innerHTML = `<div class="bx-ht-burst"></div>
      <div class="bx-ht-head"><span class="bx-ht-title"></span><span class="bx-ht-lvl"></span></div>
      <div class="bx-ht-track"><div class="bx-ht-fill"></div><div class="bx-ht-loco"></div></div>
      <div class="bx-ht-foot"><span class="goal"></span><span class="time"></span></div>
      <div class="bx-ht-timer"><i></i></div>`;
    this.el.querySelector('.bx-ht-title').textContent = this.title;
    this.fillEl = this.el.querySelector('.bx-ht-fill');
    this.locoEl = this.el.querySelector('.bx-ht-loco');
    this.locoEl.textContent = this.style === 'rakete' ? '🚀' : '🚂';
    this.lvlEl = this.el.querySelector('.bx-ht-lvl');
    this.goalEl = this.el.querySelector('.goal');
    this.timeEl = this.el.querySelector('.time');
    this.timerEl = this.el.querySelector('.bx-ht-timer > i');
    root.appendChild(this.el);
    this.now = () => performance.now();
    // Editor-Vorschau: Der Zug ist normalerweise unsichtbar (opacity 0), bis
    // Gifts kommen — im Editor sähe man nur eine leere Box. Darum ein
    // eingefrorener Beispiel-Zustand, ganz ohne Timer.
    if (this.host.preview) this.demo();
  }

  /** Statische Demo für den Editor: Level 2, Balken halb voll, kein Timer.
   *  Das erste echte Event ruft start() und setzt alles sauber zurück. */
  demo() {
    this.active = false;
    this.points = this.levelStep * 1.55;
    this.level = Math.min(this.maxLevels, 2);
    this.contributors = 7;
    this.el.classList.add('on');
    this.render();
    this.timerEl.style.width = '62%';
    this.timeEl.textContent = '18s';
  }

  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    let pts = 0;
    if (event.type === 'gift' && event.gift) pts = (event.gift.totalCoins || 0) / this.coinsPerPoint; // || 0: NaN würde den Zug dauerhaft einfrieren
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
    // Premium-Auslöser: jeder Beitrag treibt die Bahn; ein Stufenaufstieg
    // bekommt zusätzlich die Level-Anzeige — deutlich lauter.
    this.hit(this.el.querySelector('.bx-ht-track'));
    if (this.level > prevLevel) this.hit(this.lvlEl);
  }

  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu, damit der Effekt bei einer Gift-Salve erneut anspringt. */
  hit(el) {
    if (!el) return;
    // Ohne Premium-Ebene gibt es fuer .bx-hit KEINE einzige CSS-Regel (alle 81
    // haengen an .bx-premium) — der Effekt waere also unsichtbar. Das
    // `void el.offsetWidth` unten erzwingt aber trotzdem ein vollstaendiges
    // Layout des Dokuments, bei JEDEM Ereignis und in JEDEM Widget. Bei 17
    // Widgets im Layout sind das 17 erzwungene Layouts pro Geschenk, fuer
    // nichts. Deshalb hier raus, bevor es teuer wird.
    // Bewusst bei jedem Aufruf pruefen statt einmal zu merken: Die Klasse
    // haengt an der Ebene und kann sich im Editor jederzeit aendern.
    if (!el.closest('.bx-premium')) return;
    el.classList.remove('bx-hit');
    void el.offsetWidth;
    el.classList.add('bx-hit');
    const t = setTimeout(() => { this.timers.delete(t); el.classList.remove('bx-hit'); }, 900);
    this.timers.add(t);
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
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.active = false;
    this.el.remove();
  }
}
