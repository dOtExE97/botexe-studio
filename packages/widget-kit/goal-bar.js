// goal-bar.js — Premium Session-Goal-Balken. Glas, Glow-Kante, Stripes,
// Milestone-Ticks, Done-Puls. props: { metric, target, label?, accent? }
const STYLE_ID = 'bx-gb-style';
/* --u = „1px bei Standardgröße" (560×80). cqmin (kurze Seite) war hier falsch:
   in einem 560×80-Balken sind 8cqmin ~6px, die Beschriftung klebte am Minimum.
   Jetzt führt die Breite (cqi), die Höhe (cqh) deckelt. Thermo/Ring sind
   hochkant/quadratisch und bekommen weiter unten ein eigenes --u. */
const CSS = `
.bx-gb { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center;
  font-family: var(--bx-font-body); container-type: size; --u: calc((min(0.1786cqi, 1.25cqh)) * var(--bx-fs, 1));
  padding: 0.7% 0.35%; }
.bx-gb-head { display: flex; justify-content: space-between; align-items: baseline; margin: 0 calc(var(--u) * 4) calc(var(--u) * 8); }
.bx-gb-label { font-family: var(--bx-font-display); font-size: clamp(8px, calc(var(--u) * 13), 64px); letter-spacing: .26em; color: var(--bx-text,#fff);
  text-transform: uppercase; text-shadow: 0 2px 8px rgba(0,0,0,.8);
  /* Kontur statt nur Schatten: der Balken schwebt frei über dem Video und war
     auf hellen Szenen (weißes Weiß, gelbe Zahlen) kaum zu lesen. */
  -webkit-text-stroke: clamp(1px, calc(var(--u) * 2), 6px) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
.bx-gb-nums { font-family: var(--bx-font-mono); font-weight: 700; font-size: clamp(8px, calc(var(--u) * 14), 68px); color: var(--bx-gold);
  text-shadow: 0 0 12px color-mix(in srgb, var(--bx-gold) 45%, transparent), 0 2px 6px rgba(0,0,0,.8);
  -webkit-text-stroke: clamp(1px, calc(var(--u) * 2), 6px) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
.bx-gb-track { position: relative; height: clamp(8px, calc(var(--u) * 30), 140px); border-radius: 999px; overflow: hidden;
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
  font-family: var(--bx-font-display); font-size: clamp(8px, calc(var(--u) * 12), 58px); color: #fff; letter-spacing: .14em; text-shadow: 0 1px 4px rgba(0,0,0,.95); }
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
.bx-gb-slim .bx-gb-track { height: clamp(3px, calc(var(--u) * 7), 34px); border-radius: 999px;
  background: rgba(255,255,255,.14); box-shadow: 0 1px 4px rgba(0,0,0,.5); }
.bx-gb-slim .bx-gb-fill { box-shadow: 0 0 14px 0 color-mix(in srgb, var(--bx-accent) 80%, transparent); }
.bx-gb-slim .bx-gb-fill::after { display: none; }
.bx-gb-slim .bx-gb-tick { display: none; }
.bx-gb-slim .bx-gb-pct { display: none; }
.bx-gb-slim .bx-gb-label { letter-spacing: .3em; font-size: clamp(8px, calc(var(--u) * 12), 58px); }

/* ── THERMOMETER — senkrecht: füllt sich von unten nach oben. Spart Breite und
   passt damit deutlich besser ins TikTok-Hochformat als ein Querbalken. */
.bx-gb-thermo { flex-direction: column; align-items: center; gap: 2%;
  --u: calc((0.5cqmin) * var(--bx-fs, 1)); /* hochkant: hier ist die kurze Seite das richtige Maß */ }
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
.bx-gb-ring .bx-gb-pct { z-index: 1; font-size: calc((clamp(13px, 15cqmin, 34px)) * var(--bx-fs, 1)); letter-spacing: .04em; }
.bx-gb-ring.done .bx-gb-track { animation: bx-gb-pulse 900ms ease-in-out 3; }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   Beschriftung und Zahlen haben bereits eine Kontur — hier nur die Prozentzahl.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-gb-pct { -webkit-text-stroke: max(1.5px, .1em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Zwei Stufen: steigt der Stand, löst die Zahlen-Zeile aus („340 / 1K") — sie
   ist die Stelle, an der man die Änderung liest. Wird das Ziel erreicht, löst
   zusätzlich die ganze Bahn aus; das ist ungleich lauter und passiert genau
   einmal.

   KOLLISION: Bei erreichtem Ziel pulsiert die Bahn bereits
   („.bx-gb.done .bx-gb-track", auch über box-shadow) und ist damit
   spezifischer als der Ring der Basis. Darum beides hier gemeinsam. */
.bx-premium .bx-gb.done .bx-gb-track.bx-hit {
  animation: bx-gb-pulse 900ms ease-in-out 3,
    bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Ring-Stil: die Bahn IST der Kreis — der Auslöser-Ring folgt seiner Form. */
/* Die Zahlen-Zeile ist reiner Text. Der Ring der Basis ist in em bemessen und
   wird dort in großen Boxen zu einer Farbplatte statt zu einer Kontur — deshalb
   ein Schein, der der Ziffernform folgt. */
.bx-premium .bx-gb-nums.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-gb-hit-schein 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
@keyframes bx-gb-hit-schein {
  0% { filter: drop-shadow(0 0 0 var(--bx-gold)) drop-shadow(0 0 0 var(--bx-gold)); }
  18% { filter: drop-shadow(0 0 .12em var(--bx-gold)) drop-shadow(0 0 .3em var(--bx-gold)); }
  100% { filter: drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent); }
}
.bx-premium .bx-gb-ring .bx-gb-track.bx-hit { border-radius: 50%; }
/* Mehr Tiefe: Beschriftung tritt zurück, die Zahlen führen. */
.bx-premium .bx-gb-label { opacity: .88; }
.bx-premium .bx-gb-nums { text-shadow: 0 0 .5em color-mix(in srgb, var(--bx-gold) 60%, transparent), 0 .06em .12em rgba(0,0,0,.85); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
const LABELS = { coins: 'Coin-Ziel', likes: 'Like-Ziel', follows: 'Follower-Ziel', gifts: 'Geschenk-Ziel' };
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

export default class GoalBar {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.metric = ['coins', 'likes', 'follows', 'gifts'].includes(props.metric) ? props.metric : 'coins';
    this.target = Math.max(1, Number(props.target ?? 1000));
    this.label = props.label || LABELS[this.metric];
    this.timers = new Set();
    // Letzter gemalter Stand — der Auslöser gehört nur zum ECHTEN Anstieg,
    // nicht zum ersten Zeichnen.
    this.last = null;
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
    // Editor-Vorschau: ohne Live-Stats stünde der Balken auf 0 % und man könnte
    // Farbe/Füllung nicht beurteilen. Reine Anzeige — die ersten echten Stats
    // überschreiben sie.
    if (ctx && ctx.preview) this.paint(Math.round(this.target * 0.62));
  }
  /** Balken + Beschriftung auf einen Stand setzen. */
  paint(cur) {
    const pct = Math.min(100, (cur / this.target) * 100);
    this.el.querySelector('.bx-gb-fill').style.width = `${pct}%`;
    this.el.style.setProperty('--pct', `${pct}%`); // Thermometer-Stil füllt über die Höhe
    this.el.querySelector('.bx-gb-pct').textContent = `${Math.floor(pct)}%`;
    this.el.querySelector('.bx-gb-nums').textContent = `${fmt(cur)} / ${fmt(this.target)}`;
    const wasDone = this.el.classList.contains('done');
    const done = cur >= this.target;
    this.el.classList.toggle('done', done);
    // Premium-Auslöser: der Stand ist gestiegen → Zahlen-Zeile. Ist damit das
    // Ziel erreicht → zusätzlich die ganze Bahn, deutlich lauter.
    if (this.last != null && cur > this.last) {
      this.hit(this.el.querySelector('.bx-gb-nums'));
      if (done && !wasDone) this.hit(this.el.querySelector('.bx-gb-track'));
    }
    this.last = cur;
  }

  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu, damit der Effekt bei dicht aufeinander folgenden Stats erneut
   *  anspringt. */
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
  onStats(stats) {
    this.paint(Number(stats?.totals?.[this.metric] ?? 0));
  }
  destroy() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
