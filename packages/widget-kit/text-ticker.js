// text-ticker.js — Lauftext-Banner (Socials, Ansagen). Dünner Streifen,
// deckt kaum etwas zu. props: { messages? (| getrennt), speed?, accent?, style?: 'glas'|'solid'|'neon' }
const STYLE_ID = 'bx-tt-style';
const CSS = `
.bx-tt { position: absolute; inset: 0; display: flex; align-items: center; overflow: hidden; font-family: var(--bx-font-body); }
.bx-tt-track { display: inline-flex; align-items: center; white-space: nowrap; will-change: transform; animation: bx-tt-scroll var(--dur,18s) linear infinite; }
.bx-tt-item { font-family: var(--bx-font-display); font-size: 22px; text-transform: uppercase; letter-spacing: .06em; color: var(--bx-text,#fff);
  padding: 0 32px; text-shadow: 0 2px 6px rgba(0,0,0,.7); }
.bx-tt-sep { color: var(--bx-accent); font-size: 14px; }
@keyframes bx-tt-scroll { to { transform: translateX(-50%); } }
.bx-st-glas { background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border-radius: 12px;
  box-shadow: 0 8px 22px -10px rgba(0,0,0,.6), 0 0 0 1px color-mix(in srgb, var(--bx-accent) 30%, transparent) inset; }
.bx-st-solid { background: linear-gradient(90deg, var(--bx-accent), var(--bx-accent-2)); border-radius: 10px; }
.bx-st-solid .bx-tt-item { color: #0a0b10; text-shadow: 0 1px 0 rgba(255,255,255,.2); }
.bx-st-solid .bx-tt-sep { color: rgba(0,0,0,.5); }
.bx-st-neon { background: rgba(8,9,14,.6); border-radius: 10px; border: 1.5px solid var(--bx-accent); box-shadow: 0 0 18px -4px var(--bx-accent); }
.bx-st-neon .bx-tt-item { color: var(--bx-accent); text-shadow: 0 0 12px var(--bx-accent); }
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
