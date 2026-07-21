// counter.js — manueller Zähler („Tode: 7", „Wins: 3") im Premium-Glas-Look.
// Wird per counter_add-Aktion verändert (Panel-Klick, Hotkey oder Trigger,
// z.B. chat_command „!death" → +1). Wert überlebt Overlay-Reloads via
// localStorage (pro Layer). props: { label?, start?, accent? }
const STYLE_ID = 'bx-counter-style';
const CSS = `
.bx-cnt { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:2px; font-family: var(--bx-font-body); background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 40px -18px var(--bx-accent);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); overflow:hidden; }
.bx-cnt::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 70%, white), transparent 50%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-cnt-label { font-family: var(--bx-font-display); font-size: 14px; letter-spacing:.32em; text-transform:uppercase;
  color: var(--bx-muted); }
.bx-cnt-value { font-family: var(--bx-font-num); font-weight: 800; font-size: 52px; line-height:1; color:var(--bx-text,#fff);
  text-shadow: 0 0 22px color-mix(in srgb, var(--bx-accent) 55%, transparent), 0 2px 8px rgba(0,0,0,.6); }
.bx-cnt-value.pop { animation: bx-cnt-pop 380ms cubic-bezier(.2,1.5,.35,1); }
@keyframes bx-cnt-pop { 0% { transform: scale(1); } 45% { transform: scale(1.22); } 100% { transform: scale(1); } }
.bx-cnt-value.neg { color: var(--bx-accent); }

/* ── Stil „LED" — Arcade-Score: dunkle Kapsel, Mono-Ziffern mit Glow. */
.bx-cnt-led { background: #0a0c0a !important; border-radius: 8px !important;
  box-shadow: 0 0 0 3px #1c201c, 0 10px 26px -10px rgba(0,0,0,.85) !important;
  -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
.bx-cnt-led .bx-cnt-value { font-family: var(--bx-font-mono) !important; color: #59f08a !important;
  text-shadow: 0 0 12px rgba(89,240,138,.7) !important; }
.bx-cnt-led .bx-cnt-label { font-family: var(--bx-font-mono); letter-spacing: .4em; }

/* ── Stil „Sticker" — Comic: weiße schräge Kachel, dunkle dicke Schrift. */
.bx-cnt-sticker { background: #fff !important; border-radius: 14px !important; transform: rotate(-2deg);
  box-shadow: 0 0 0 3px #14161f inset, 5px 5px 0 rgba(20,22,31,.85) !important;
  -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
.bx-cnt-sticker .bx-cnt-value { color: #14161f !important; text-shadow: none !important; }
.bx-cnt-sticker .bx-cnt-label { color: #565d70 !important; text-shadow: none !important; }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

export default class CounterWidget {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.storageKey = `bx-counter-${(ctx && ctx.layerId) || 'default'}`;
    this.start = Number(props.start) || 0;
    this.value = this.load(this.start);

    this.el = document.createElement('div');
    this.style = ['glas', 'led', 'sticker'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-cnt${this.style !== 'glas' ? ` bx-cnt-${this.style}` : ''}`;
    this.el.innerHTML = `
      <div class="bx-cnt-label"></div>
      <div class="bx-cnt-value"></div>`;
    this.el.querySelector('.bx-cnt-label').textContent = props.label || 'Counter';
    root.appendChild(this.el);
    this.render(false);
  }

  load(fallback) {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      return raw === null ? fallback : Number(raw) || 0;
    } catch {
      return fallback;
    }
  }

  persist() {
    try { window.localStorage.setItem(this.storageKey, String(this.value)); } catch { /* private mode etc. */ }
  }

  onAction(action) {
    if (!action || action.kind !== 'counter_add') return;
    this.value += Number(action.delta) || 0;
    this.persist();
    this.render(true);
  }

  render(animate) {
    const v = this.el.querySelector('.bx-cnt-value');
    v.textContent = String(this.value);
    v.classList.toggle('neg', this.value < 0);
    if (animate) {
      v.classList.remove('pop');
      void v.offsetWidth;
      v.classList.add('pop');
    }
  }

  // Neuer Stream → zurück auf Startwert.
  onReset() { this.value = this.start; this.persist(); this.render(false); }

  destroy() { this.el.remove(); }
}
