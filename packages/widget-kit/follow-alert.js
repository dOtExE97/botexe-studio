// follow-alert.js — Premium Slide-Alert für Follow/Sub/Share. Glas-Pill,
// Icon-Badge mit Glow, Slide-In. props: { events?, durationMs? }
const STYLE_ID = 'bx-fa-style';
const CSS = `
.bx-fa { position: absolute; inset: 0; overflow: hidden; font-family: var(--bx-font-body); display: flex; align-items: center; }
.bx-fa-pill { display: flex; align-items: center; gap: 14px; padding: 12px 28px 12px 14px; border-radius: 999px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3);
  box-shadow: var(--bx-shadow), -6px 0 26px -8px var(--bx-accent);
  transform: translateX(-130%);
  animation: bx-fa-in 440ms cubic-bezier(.2,1.5,.35,1) forwards, bx-fa-out 340ms ease-in forwards var(--stay,3600ms); }
.bx-fa-pill::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--bx-accent) 80%, white), transparent 50%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-fa-icon { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; flex: none;
  font-size: 21px; border-radius: 13px; color: #0a0b10;
  background: linear-gradient(150deg, var(--bx-accent), var(--bx-accent-2)); box-shadow: 0 0 18px -2px var(--bx-accent); }
.bx-fa-label { font-family: var(--bx-font-display); font-size: 12px; letter-spacing: .3em; text-transform: uppercase; color: var(--bx-accent); }
.bx-fa-name { font-family: var(--bx-font-display); font-size: 23px; color: #fff; text-transform: uppercase;
  text-shadow: 0 2px 6px rgba(0,0,0,.6); max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes bx-fa-in { to { transform: translateX(0); } }
@keyframes bx-fa-out { to { transform: translateX(-130%); opacity: 0; } }
`;
const PRESETS = {
  follow: { label: 'Neuer Follower', icon: '➕', accent: '#28e0c4' },
  sub: { label: 'Neuer Sub', icon: '★', accent: '#ffd23e' },
  share: { label: 'Stream geteilt', icon: '⇗', accent: '#ff5436' },
};
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }

export default class FollowAlert {
  constructor(root, props) {
    ensureStyle();
    this.root = root;
    this.events = Array.isArray(props.events) ? props.events : ['follow', 'sub', 'share'];
    this.stayMs = Number(props.durationMs ?? 3600);
    this.queue = [];
    this.busy = false;
  }
  onEvent(event) {
    if (!this.events.includes(event.type)) return;
    const preset = PRESETS[event.type];
    if (!preset) return;
    if (this.queue.length >= 10) this.queue.shift();
    this.queue.push({ preset, name: event.user?.nickname || 'Jemand' });
    if (!this.busy) this.next();
  }
  onAction(action) {
    if (action.kind !== 'fire_alert') return;
    const p = action.params || {};
    this.queue.push({ preset: PRESETS[p.preset] || PRESETS.follow, name: String(p.name ?? 'Test') });
    if (!this.busy) this.next();
  }
  next() {
    const item = this.queue.shift();
    if (!item) { this.busy = false; return; }
    this.busy = true;
    const wrap = document.createElement('div');
    wrap.className = 'bx-fa';
    wrap.innerHTML = `<div class="bx-fa-pill" style="--accent:${item.preset.accent}"><div class="bx-fa-icon"></div><div><div class="bx-fa-label"></div><div class="bx-fa-name"></div></div></div>`;
    const pill = wrap.querySelector('.bx-fa-pill');
    pill.style.setProperty('--stay', `${this.stayMs}ms`);
    pill.style.setProperty('--bx-accent', item.preset.accent);
    const icon = wrap.querySelector('.bx-fa-icon');
    icon.textContent = item.preset.icon;
    const label = wrap.querySelector('.bx-fa-label');
    label.textContent = item.preset.label;
    wrap.querySelector('.bx-fa-name').textContent = item.name;
    this.root.appendChild(wrap);
    this.timer = setTimeout(() => { wrap.remove(); this.next(); }, this.stayMs + 480);
  }
  destroy() { clearTimeout(this.timer); this.root.querySelectorAll('.bx-fa').forEach((el) => el.remove()); }
}
