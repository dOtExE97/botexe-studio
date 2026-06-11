// countdown.js — Premium-Countdown. Zählt ab props.minutes herunter; bei 0
// optional Text. Glas-Kapsel, Neon-Ziffern, sanfter Puls in der Schlussphase.
// props: { minutes?, label?, doneText?, accent? }
const STYLE_ID = 'bx-cd-style';
const CSS = `
.bx-cd { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: var(--bx-font-body); gap: 6px; }
.bx-cd-label { font-family: var(--bx-font-display); font-size: 15px; letter-spacing: .34em; text-transform: uppercase;
  color: var(--bx-muted); text-shadow: 0 2px 6px rgba(0,0,0,.8); }
.bx-cd-time { font-family: var(--bx-font-mono); font-weight: 700; font-size: 64px; line-height: 1; color: #fff;
  padding: 10px 28px; border-radius: 18px; background: var(--bx-glass);
  box-shadow: var(--bx-shadow), 0 0 40px -12px var(--bx-accent);
  text-shadow: 0 0 22px color-mix(in srgb, var(--bx-accent) 55%, transparent), 0 3px 8px rgba(0,0,0,.7);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.bx-cd.urgent .bx-cd-time { color: var(--bx-accent); animation: bx-cd-pulse 1s ease-in-out infinite; }
.bx-cd.done .bx-cd-time { color: var(--bx-teal); }
@keyframes bx-cd-pulse { 50% { transform: scale(1.05); } }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

export default class Countdown {
  constructor(root, props) {
    ensureStyle();
    root.style.setProperty('--bx-accent', props.accent || '#ff5436');
    this.remaining = Math.max(0, Number(props.minutes ?? 5)) * 60;
    this.doneText = props.doneText || 'LOS!';
    this.el = document.createElement('div');
    this.el.className = 'bx-cd';
    this.el.innerHTML = `<div class="bx-cd-label"></div><div class="bx-cd-time"></div>`;
    this.el.querySelector('.bx-cd-label').textContent = props.label || 'Countdown';
    root.appendChild(this.el);
    this.render();
    this.timer = setInterval(() => this.tick(), 1000);
  }
  tick() {
    if (this.remaining > 0) this.remaining--;
    this.render();
  }
  render() {
    const timeEl = this.el.querySelector('.bx-cd-time');
    if (this.remaining <= 0) {
      timeEl.textContent = this.doneText;
      this.el.classList.add('done'); this.el.classList.remove('urgent');
      return;
    }
    const m = Math.floor(this.remaining / 60), s = this.remaining % 60;
    timeEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    this.el.classList.toggle('urgent', this.remaining <= 10);
  }
  destroy() { clearInterval(this.timer); this.el.remove(); }
}
