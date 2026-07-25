// follow-alert.js — Slide-Alert für Follow/Sub/Share mit 4 wählbaren Stilen.
// props: { events?, durationMs?, style?: 'glas'|'neon'|'minimal'|'hype', accent? }
const STYLE_ID = 'bx-fa-style';
const CSS = `
/* container-type: size → Symbol und Schrift wachsen mit der Widget-Box.
   min(cqi,cqh): in einer breiten 460x90-Leiste wäre cqmin nur die kurze Seite. */
.bx-fa { position: absolute; inset: 0; overflow: hidden; font-family: var(--bx-font-body); display: flex; align-items: center; container-type: size; }
.bx-fa-pill { display: flex; align-items: center; gap: clamp(5px,3cqi,26px); padding: clamp(4px,13cqh,24px) clamp(10px,6cqi,52px) clamp(4px,13cqh,24px) clamp(5px,3cqi,26px);
  transform: translateX(-130%); animation: bx-fa-in 440ms cubic-bezier(.2,1.5,.35,1) forwards, bx-fa-out 340ms ease-in forwards var(--stay,3600ms); }
.bx-fa-icon { width: clamp(18px,min(9.1cqi,46cqh),82px); aspect-ratio: 1/1; height: auto; display: flex; align-items: center; justify-content: center; flex: none; }
.bx-fa-icon svg { width: 56%; height: 56%; display: block; }
.bx-fa-label { font-family: var(--bx-font-display); font-size: calc((clamp(8px,min(2.6cqi,13cqh),24px)) * var(--bx-fs, 1)); letter-spacing: .3em; text-transform: uppercase; color: var(--bx-accent); }
.bx-fa-name { font-family: var(--bx-font-display); font-size: calc((clamp(12px,min(5cqi,26cqh),46px)) * var(--bx-fs, 1)); color: var(--bx-text,#fff); text-transform: uppercase;
  text-shadow: 0 2px 6px rgba(0,0,0,.6); max-width: 74cqi; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes bx-fa-in { to { transform: translateX(0); } }
@keyframes bx-fa-out { to { transform: translateX(-130%); opacity: 0; } }

/* — GLAS — */
.bx-st-glas .bx-fa-pill { border-radius: 999px; background: var(--bx-glass); -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3); box-shadow: var(--bx-shadow), -6px 0 26px -8px var(--bx-accent); }
.bx-st-glas .bx-fa-pill::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--bx-accent) 80%, white), transparent 50%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-st-glas .bx-fa-icon { border-radius: 13px; color: #0a0b10; background: linear-gradient(150deg, var(--bx-accent), var(--bx-accent-2)); box-shadow: 0 0 18px -2px var(--bx-accent); }

/* — NEON — dünner dunkler body, leuchtende outline */
.bx-st-neon .bx-fa-pill { border-radius: 10px; background: rgba(8,9,14,.72); border: 2px solid var(--bx-accent);
  box-shadow: 0 0 18px -2px var(--bx-accent), 0 0 32px -6px var(--bx-accent) inset; }
.bx-st-neon .bx-fa-icon { border-radius: 8px; color: var(--bx-accent); background: rgba(255,255,255,.06); border: 1.5px solid var(--bx-accent); }
.bx-st-neon .bx-fa-name { color: var(--bx-accent); text-shadow: 0 0 14px var(--bx-accent); }

/* — MINIMAL — sehr schlank, kaum Fläche, perfekt fürs nicht-zudecken */
.bx-st-minimal .bx-fa-pill { gap: clamp(4px,2cqi,16px); padding: clamp(2px,6.5cqh,14px) clamp(6px,3.5cqi,30px) clamp(2px,6.5cqh,14px) clamp(3px,1.8cqi,16px); border-radius: 8px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--bx-accent) 26%, transparent), transparent 90%);
  border-left: 3px solid var(--bx-accent); }
.bx-st-minimal .bx-fa-icon { width: clamp(12px,min(5.6cqi,29cqh),52px); color: var(--bx-accent); }
.bx-st-minimal .bx-fa-label { font-size: calc((clamp(7px,min(2.2cqi,11cqh),20px)) * var(--bx-fs, 1)); }
.bx-st-minimal .bx-fa-name { font-size: calc((clamp(10px,min(3.9cqi,20cqh),36px)) * var(--bx-fs, 1)); }

/* — HYPE — fette Gradient-Füllung, groß */
.bx-st-hype .bx-fa-pill { border-radius: 14px; padding: clamp(5px,17cqh,30px) clamp(12px,7.4cqi,64px) clamp(5px,17cqh,30px) clamp(6px,3.9cqi,34px);
  background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2)); box-shadow: 0 14px 34px -10px var(--bx-accent); }
.bx-st-hype .bx-fa-icon { width: clamp(20px,min(10.9cqi,55cqh),96px); border-radius: 14px; color: var(--bx-accent); background: rgba(0,0,0,.25); }
.bx-st-hype .bx-fa-label { color: rgba(0,0,0,.6); }
.bx-st-hype .bx-fa-name { font-size: calc((clamp(13px,min(6.1cqi,31cqh),56px)) * var(--bx-fs, 1)); color: #0a0b10; text-shadow: 0 1px 0 rgba(255,255,255,.25); }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur an Beschriftung und Name (Hype-Stil hat dunkle Schrift).
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-fa:not(.bx-st-hype) .bx-fa-label { -webkit-text-stroke: max(1.5px, .11em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-fa:not(.bx-st-hype) .bx-fa-name { -webkit-text-stroke: max(1.5px, .08em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Auslöser auf dem SYMBOLFELD, nicht auf der Pille. Grund: die Pille trägt
   ihre komplette Choreografie in einer einzigen animation-Kurzschreibweise
   (Einflug + zeitversetztes Ausblenden über --stay) und in der Vorschau
   zusätzlich eine Inline-Animation. Jede Fassung dort wäre brüchig. Das
   Symbolfeld ist das Wappen der Karte, hat keine eigene Animation und
   erscheint gleichzeitig mit ihr — der Ring sitzt dort sauber.

   AUSGENOMMEN: Das Symbolfeld heißt „bx-fa-icon" und fällt damit unter den
   breiten Selektor [class*='-ic'] der Basis, der Bildern ein langsames Atmen
   gibt. Hier ist es aber kein Bild, sondern eine gefüllte Kachel (Glas/Hype) —
   die ganze Fläche hätte im Ruhezustand gepulst. Also Atmen aus, Schein nur
   auf dem Zeichen darin. Der Auslöser (.bx-hit) bleibt ausdrücklich erhalten. */
.bx-premium .bx-fa-icon:not(.bx-hit) { animation: none; }
/* Der Ring der Basis allein ging hier unter (im Bild geprüft): das Symbolfeld
   trägt ohnehin einen Akzent-Glow, ein zweiter Ring darüber fiel nicht auf.
   Deshalb blitzt das Feld zusätzlich auf — derselbe Gedanke, mit dem die Basis
   Bilder im Moment des Treffers hervorhebt. */
.bx-premium .bx-fa-icon.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1),
    bx-fa-hit-schein 900ms cubic-bezier(0.2, 1.4, 0.35, 1); }
@keyframes bx-fa-hit-schein {
  0% { filter: brightness(1) drop-shadow(0 0 0 var(--bx-accent)); }
  18% { filter: brightness(1.6) drop-shadow(0 0 .55em var(--bx-accent)); }
  100% { filter: brightness(1) drop-shadow(0 0 0 transparent); }
}
/* KOLLISION, gefunden im Bild: Die Wurzel trägt „bx-st-glas" nur als Marke für
   die Stil-Variante. Die Premium-Ebene hält „.bx-st-glas" aber für ein
   Glas-Panel und legte Lichtkante und Tiefenschatten auf diese unsichtbare
   Vollflächen-Wurzel — ein Geisterrahmen in der Standard-Akzentfarbe lag um die
   ganze Box. Das Panel ist hier die PILLE; sie bekommt die Tiefe. */
.bx-premium .bx-fa.bx-st-glas { box-shadow: none; }
.bx-premium .bx-st-glas .bx-fa-pill {
  box-shadow: var(--bx-shadow), -6px 0 26px -8px var(--bx-accent),
    0 0 0 1px rgba(255,255,255,.09) inset, 0 2px 0 rgba(255,255,255,.18) inset; }
.bx-premium .bx-fa-icon svg { filter: drop-shadow(0 .05em .1em rgba(0,0,0,.5)); }
/* Mehr Tiefe: die Beschriftung führt, der Name trägt. */
.bx-premium .bx-fa-label { text-shadow: 0 0 .6em color-mix(in srgb, var(--bx-accent) 55%, transparent), 0 .06em .12em rgba(0,0,0,.7); }
.bx-premium .bx-st-hype .bx-fa-label { text-shadow: none; }
`;
// Monochrome Inline-SVG-Icons, eingefärbt via currentColor (.bx-fa-icon color je Stil).
const ICONS = {
  follow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M19 8v6M22 11h-6"/></svg>',
  sub: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 20.1 6.5 19.3l1.3-6.1L3.2 9l6.2-.7L12 2.6Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
};
const PRESETS = {
  follow: { label: 'Neuer Follower', icon: ICONS.follow, accent: '#28e0c4' },
  sub: { label: 'Neuer Sub', icon: ICONS.sub, accent: '#ffd23e' },
  share: { label: 'Stream geteilt', icon: ICONS.share, accent: '#ff5436' },
};
const STYLES = new Set(['glas', 'neon', 'minimal', 'hype']);
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

export default class FollowAlert {
  constructor(root, props, ctx) {
    ensureStyle();
    this.root = root;
    this.style = STYLES.has(props.style) ? props.style : 'glas';
    this.colorByType = props.colorByType !== false; // pro typ eigene farbe, sonst accent
    this.fixedAccent = props.accent;
    this.events = Array.isArray(props.events) ? props.events : ['follow', 'sub', 'share'];
    this.stayMs = Number(props.durationMs ?? 3600);
    this.queue = [];
    this.busy = false;
    this.timers = new Set();
    // Editor-Vorschau: einen stehenden Beispiel-Alert zeigen, sonst ist die Box
    // im Editor leer und man sieht nicht, was das Widget später tut.
    this.preview = !!ctx?.preview;
    if (this.preview) {
      const type = this.events.includes('follow') ? 'follow' : this.events[0] || 'follow';
      this.queue.push({ preset: PRESETS[type] || PRESETS.follow, name: 'NeuerFan' });
      this.next();
    }
  }
  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (!this.events.includes(event.type)) return;
    const preset = PRESETS[event.type];
    if (!preset) return;
    this.leavePreview();
    if (this.queue.length >= 10) this.queue.shift();
    this.queue.push({ preset, name: event.user?.nickname || 'Jemand' });
    if (!this.busy) this.next();
  }
  onAction(action) {
    if (action.kind !== 'fire_alert') return;
    this.leavePreview();
    const p = action.params || {};
    this.queue.push({ preset: PRESETS[p.preset] || PRESETS.follow, name: String(p.name ?? 'Test') });
    if (!this.busy) this.next();
  }
  /** Sobald ein echtes Ereignis kommt, den stehenden Vorschau-Alert abräumen. */
  leavePreview() {
    if (!this.preview) return;
    this.preview = false;
    this.busy = false;
    this.root.querySelectorAll('.bx-fa').forEach((el) => el.remove());
  }

  next() {
    const item = this.queue.shift();
    if (!item) { this.busy = false; return; }
    this.busy = true;
    const accent = this.fixedAccent || (this.colorByType ? item.preset.accent : 'var(--bx-accent)');
    const wrap = document.createElement('div');
    wrap.className = `bx-fa bx-st-${this.style}`;
    wrap.innerHTML = `<div class="bx-fa-pill"><div class="bx-fa-icon"></div><div><div class="bx-fa-label"></div><div class="bx-fa-name"></div></div></div>`;
    const pill = wrap.querySelector('.bx-fa-pill');
    pill.style.setProperty('--stay', `${this.stayMs}ms`);
    if (this.fixedAccent || this.colorByType) pill.style.setProperty('--bx-accent', accent);
    if (this.fixedAccent || this.colorByType) pill.style.setProperty('--bx-accent-2', accent);
    wrap.querySelector('.bx-fa-icon').innerHTML = item.preset.icon;
    wrap.querySelector('.bx-fa-label').textContent = item.preset.label;
    wrap.querySelector('.bx-fa-name').textContent = item.name;
    if (this.preview) pill.style.animation = 'bx-fa-in 440ms cubic-bezier(.2,1.5,.35,1) forwards';
    this.root.appendChild(wrap);
    // Premium-Auslöser: der Auftritt der Karte IST der bemerkenswerte Moment.
    this.hit(wrap.querySelector('.bx-fa-icon'));
    if (this.preview) return; // Vorschau bleibt stehen
    this.timer = setTimeout(() => { wrap.remove(); this.next(); }, this.stayMs + 480);
  }
  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu, damit der Effekt bei Alert-Ketten erneut anspringt. */
  hit(el) {
    if (!el) return;
    el.classList.remove('bx-hit');
    void el.offsetWidth;
    el.classList.add('bx-hit');
    const t = setTimeout(() => { this.timers.delete(t); el.classList.remove('bx-hit'); }, 900);
    this.timers.add(t);
  }
  destroy() { clearTimeout(this.timer); for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.root.querySelectorAll('.bx-fa').forEach((el) => el.remove()); }
}
