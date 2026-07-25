// text-ticker.js — Lauftext-Banner (Socials, Ansagen). Dünner Streifen,
// deckt kaum etwas zu. props: { messages? (| getrennt), speed?, accent?, style?: 'glas'|'solid'|'neon' }
const STYLE_ID = 'bx-tt-style';
const CSS = `
/* container-type ist Pflicht, sonst greifen cq*-Einheiten ins Leere.
   Ein Lauftext ist ein BREITES Band: die Schrift darf nur an der HÖHE hängen
   (cqh) — sonst wird sie in einer 1600px breiten Leiste absurd groß. Der
   cqi-Anteil deckelt sie zusätzlich in sehr schmalen Boxen.
   Der Faktor --bx-fs (Textgrößen-Einstellung) steht AUSSEN um das clamp, sonst
   würde die Obergrenze den Zuwachs wegdeckeln. Alle Kinder rechnen in em. */
.bx-tt { position: absolute; inset: 0; display: flex; align-items: center; overflow: hidden; font-family: var(--bx-font-body);
  container-type: size; font-size: calc(clamp(9px, min(46cqh, 9cqi), 130px) * var(--bx-fs, 1)); }
.bx-tt-track { display: inline-flex; align-items: center; white-space: nowrap; will-change: transform; animation: bx-tt-scroll var(--dur,18s) linear infinite; }
.bx-tt-item { font-family: var(--bx-font-display); font-size: 1em; text-transform: uppercase; letter-spacing: .06em; color: var(--bx-text,#fff);
  padding: 0 1.45em; text-shadow: 0 2px 6px rgba(0,0,0,.7); }
.bx-tt-sep { color: var(--bx-accent); font-size: .62em; }
@keyframes bx-tt-scroll { to { transform: translateX(-50%); } }
.bx-st-glas { background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border-radius: .5em;
  box-shadow: 0 8px 22px -10px rgba(0,0,0,.6), 0 0 0 1px color-mix(in srgb, var(--bx-accent) 30%, transparent) inset; }
.bx-st-solid { background: linear-gradient(90deg, var(--bx-accent), var(--bx-accent-2)); border-radius: .42em; }
.bx-st-solid .bx-tt-item { color: #0a0b10; text-shadow: 0 1px 0 rgba(255,255,255,.2); }
.bx-st-solid .bx-tt-sep { color: rgba(0,0,0,.5); }
.bx-st-neon { background: rgba(8,9,14,.6); border-radius: .42em; border: max(1.5px, .06em) solid var(--bx-accent); box-shadow: 0 0 18px -4px var(--bx-accent); }
.bx-st-neon .bx-tt-item { color: var(--bx-accent); text-shadow: 0 0 12px var(--bx-accent); }

/* ── „Rahmen ausblenden" (bx-frameless) ───────────────────────────────────
   Das Band verschwindet, der Lauftext bleibt: weiß auf hellem Video war er
   nicht zu lesen, deshalb hier eine Kontur (nur im frameless-Fall). Der
   Solid-Stil hat dunkle Schrift auf Akzentband — dort wäre eine schwarze
   Kontur Matsch, also ausgenommen. */
.bx-frameless .bx-tt:not(.bx-st-solid) .bx-tt-item {
  -webkit-text-stroke: max(1.5px, .07em) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 max(1px, .04em) max(3px, .1em) rgba(0,0,0,.6); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const STYLES = new Set(['glas', 'solid', 'neon']);

export default class TextTicker {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    const msgs = String(props.messages || 'Folge mir! | Discord in der Bio | Danke fürs Zuschauen ❤️')
      .split('|').map((m) => m.trim()).filter(Boolean);
    const style = STYLES.has(props.style) ? props.style : 'glas';
    const speed = Math.max(4, Number(props.speed ?? 18));
    this.el = document.createElement('div');
    this.el.className = `bx-tt bx-st-${style}`;
    // doppelte sequenz für nahtloses loopen (-50% = exakt eine sequenz weiter)
    const seq = msgs.map((m) => `<span class="bx-tt-item">${escapeHtml(m)}</span><span class="bx-tt-sep">◆</span>`).join('');
    this.el.innerHTML = `<div class="bx-tt-track" style="--dur:${speed}s">${seq}${seq}</div>`;
    root.appendChild(this.el);
  }
  destroy() { this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
