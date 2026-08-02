// text-label.js — simples statisches Schrift-Widget: eigener Text in schöner
// Schrift, Farbe, dicker Outline (TikFinity-Look) und optionaler Animation.
// Größe = relativ zur Box (Box ziehen → Text wird größer). Mehrzeilig erlaubt.
// props: { text?, animation?, outline?, accent?, fontFamily?, fontScale?, textColor? }
const STYLE_ID = 'bx-tl-style';
const ANIMS = new Set(['none', 'pulse', 'bounce', 'float', 'glow', 'rainbow', 'shimmer']);
const CSS = `
.bx-tl { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center;
  container-type:size; padding:4px 10px; overflow:hidden; }
.bx-tl-t { font-family: var(--bx-font-display); font-weight:800; line-height:1.06; color: var(--bx-text,#fff);
  /* EINE Basisgröße. Der Faktor --bx-fs (Textgrößen-Einstellung) steht AUSSEN um
     das clamp, sonst deckelt die Obergrenze den Zuwachs weg. fit() unten geht
     von genau diesem Wert aus und verkleinert nur, wenn der umgebrochene Text
     sonst aus der Box liefe — der Faktor wirkt also, solange Platz da ist. */
  font-size: calc(clamp(12px, 42cqmin, 240px) * var(--bx-fs, 1)); white-space:pre-wrap; word-break:break-word;
  text-shadow: 0 3px 10px rgba(0,0,0,.45); }
/* Dicke Kontur (TikFinity-Signatur) */
.bx-tl.outline .bx-tl-t { -webkit-text-stroke: calc(max(2px, 4.5cqmin) * var(--bx-fs, 1)) var(--bx-ink,#0a0b12); paint-order: stroke fill;
  text-shadow: 0 3px 0 rgba(0,0,0,.4); }
/* Effekte/Animationen */
.bx-tl.glow .bx-tl-t { text-shadow: 0 0 16px var(--bx-accent,#ff5436), 0 0 34px var(--bx-accent,#ff5436); animation: bx-tl-glow 2s ease-in-out infinite; }
@keyframes bx-tl-glow { 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.25) } }
.bx-tl.pulse .bx-tl-t { animation: bx-tl-pulse 1.8s ease-in-out infinite; }
@keyframes bx-tl-pulse { 0%,100%{ transform:scale(1) } 50%{ transform:scale(1.06) } }
.bx-tl.bounce .bx-tl-t { animation: bx-tl-bounce 1.5s cubic-bezier(.3,1.3,.5,1) infinite; }
@keyframes bx-tl-bounce { 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-7%) } }
.bx-tl.float .bx-tl-t { animation: bx-tl-float 3.6s ease-in-out infinite; }
@keyframes bx-tl-float { 0%,100%{ transform:translateY(-3%) } 50%{ transform:translateY(3%) } }
/* Regenbogen: animierter Farbverlauf im Text (Outline bleibt sichtbar). */
.bx-tl.rainbow .bx-tl-t { background: linear-gradient(92deg,#ff5e8a,#ffd23e,#28e0c4,#5b8cff,#b06cff,#ff5e8a);
  background-size:300% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
  animation: bx-tl-rb 5s linear infinite; }
@keyframes bx-tl-rb { to { background-position:300% 0 } }
/* Shimmer: heller Lichtstreif wandert über den Text. */
.bx-tl.shimmer .bx-tl-t { position:relative; }
.bx-tl.shimmer .bx-tl-t::after { content:''; position:absolute; inset:0;
  background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.85) 50%, transparent 65%);
  -webkit-mask: linear-gradient(#000 0 0); animation: bx-tl-sh 2.8s ease-in-out infinite; mix-blend-mode:overlay; }
@keyframes bx-tl-sh { 0%{ transform:translateX(-120%) } 60%,100%{ transform:translateX(120%) } }

/* ── Premium-Ebene (.bx-premium) ───────────────────────────────────────────
   Ein Schriftfeld wechselt seinen Eintrag nie — es hat genau einen Moment: das
   Erscheinen. Dort setzt der Auslöser an, und zwar nur als Anheben. Ein Ring
   um einen Textblock wäre ein Kasten mitten auf dem Videobild.
   Die Dauer-Effekte (Puls, Hüpfen, Schweben, Glühen, Regenbogen) laufen im
   Widget selbst und stehen im Dokument nach widget-base.css — sie hätten den
   Auslöser überschrieben. Deshalb hier je Variante beides zusammen. */
.bx-premium .bx-tl-t.bx-hit { --bx-tl-lift: bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1);
  animation: var(--bx-tl-lift); }
.bx-premium .bx-tl.glow .bx-tl-t.bx-hit { animation: bx-tl-glow 2s ease-in-out infinite, var(--bx-tl-lift); }
.bx-premium .bx-tl.pulse .bx-tl-t.bx-hit { animation: bx-tl-pulse 1.8s ease-in-out infinite, var(--bx-tl-lift); }
.bx-premium .bx-tl.bounce .bx-tl-t.bx-hit { animation: bx-tl-bounce 1.5s cubic-bezier(.3,1.3,.5,1) infinite, var(--bx-tl-lift); }
.bx-premium .bx-tl.float .bx-tl-t.bx-hit { animation: bx-tl-float 3.6s ease-in-out infinite, var(--bx-tl-lift); }
.bx-premium .bx-tl.rainbow .bx-tl-t.bx-hit { animation: bx-tl-rb 5s linear infinite, var(--bx-tl-lift); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

// Premium-Auslöser: Klasse `bx-hit` setzen und nach 900 ms wieder wegnehmen.
// Was daraus wird, entscheidet die Premium-Ebene in widget-base.css bzw. die
// eigene Fassung oben — ohne den Haken „Premium-Effekte" passiert nichts.
// Bewusst lokal dupliziert: die Widgets haben kein gemeinsames JS-Modul.
function bxHit(el, timers) {
  if (!el) return;
  // Ohne die Premium-Ebene gibt es fuer .bx-hit keine einzige CSS-Regel —
  // der erzwungene Reflow unten waere also Arbeit fuer einen unsichtbaren
  // Effekt, bei JEDEM Ereignis und in JEDEM Widget.
  if (!el.closest('.bx-premium')) return;
  el.classList.remove('bx-hit');
  void el.offsetWidth; // Reflow → bei schnellen Folgen springt der Effekt neu an
  el.classList.add('bx-hit');
  const t = setTimeout(() => { timers.delete(t); el.classList.remove('bx-hit'); }, 900);
  timers.add(t);
}

export default class TextLabel {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    const anim = ANIMS.has(props.animation) ? props.animation : 'none';
    const outline = props.outline !== false; // Default an (fetter Look)
    this.el = document.createElement('div');
    this.el.className = `bx-tl${outline ? ' outline' : ''}${anim !== 'none' ? ` ${anim}` : ''}`;
    const t = document.createElement('div');
    t.className = 'bx-tl-t';
    // Mehrzeilig erlauben (\n), aber als TEXT (kein HTML) → kein XSS.
    t.textContent = props.text == null || props.text === '' ? 'Dein Text' : String(props.text);
    this.el.appendChild(t);
    root.appendChild(this.el);
    this.t = t;
    // Die CSS-Größe (42cqmin × --bx-fs) kennt die Zeilenumbrüche nicht: in schmalen, hohen
    // Kästchen bricht der Text auf mehrere Zeilen und wächst damit über die Box
    // hinaus. Deshalb nach dem Layout nachmessen und nur bei Bedarf verkleinern.
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);
    this.fit();
    // Der einzige Moment dieses Widgets: es erscheint.
    this.timers = new Set(); // Premium-Auslöser → bei destroy clearen
    bxHit(t, this.timers);
  }
  /** Schrift so weit verkleinern, bis der (ggf. umgebrochene) Text ganz in die
   *  Box passt. Passt er ohnehin, bleibt die CSS-Größe unangetastet. */
  fit() {
    const t = this.t;
    if (!t) return;
    t.style.fontSize = ''; // immer von der CSS-Größe aus neu rechnen
    const avail = this.el.clientHeight - 8; // padding: 4px oben/unten
    if (avail <= 0) return;
    let size = parseFloat(getComputedStyle(t).fontSize) || 0;
    for (let i = 0; i < 14; i++) {
      const h = t.scrollHeight;
      if (h <= avail || size <= 6) break;
      size = Math.max(6, Math.min(size - 0.5, size * (avail / h)));
      t.style.fontSize = `${size}px`;
    }
  }
  destroy() { this.ro?.disconnect(); for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
