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
  font-size: clamp(12px, 42cqmin, 240px); white-space:pre-wrap; word-break:break-word;
  text-shadow: 0 3px 10px rgba(0,0,0,.45); }
/* Dicke Kontur (TikFinity-Signatur) */
.bx-tl.outline .bx-tl-t { -webkit-text-stroke: max(2px, 4.5cqmin) var(--bx-ink,#0a0b12); paint-order: stroke fill;
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
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

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
  }
  destroy() { this.el.remove(); }
}
