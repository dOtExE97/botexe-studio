// follow-alert.js — kompakter Slide-Alert für Follows / Subs / Shares.
// props.events: array der event-typen (default ['follow','sub','share']).

const STYLE_ID = 'bx-fa-style';
const CSS = `
.bx-fa {
  position: absolute; inset: 0; overflow: hidden;
  font-family: 'Arial Black', 'Archivo Black', Impact, sans-serif;
  display: flex; align-items: center;
}
.bx-fa-pill {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 26px 12px 16px;
  background: linear-gradient(165deg, rgba(16,18,26,.92), rgba(10,11,16,.88));
  clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  border-left: 4px solid #21e6c1;
  box-shadow: 0 10px 30px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08) inset,
    -4px 0 22px rgba(33,230,193,.25);
  transform: translateX(-120%);
  animation: bx-fa-in 380ms cubic-bezier(.2,1.4,.4,1) forwards,
             bx-fa-out 300ms ease-in forwards var(--bx-fa-stay, 3600ms);
}
.bx-fa-icon {
  width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
  background: #21e6c1; color: #0c0d12; font-size: 20px;
  clip-path: polygon(12% 0, 100% 0, 88% 100%, 0 100%);
}
.bx-fa-label { font-size: 12px; letter-spacing: .34em; color: #21e6c1; text-transform: uppercase; }
.bx-fa-name {
  font-size: 22px; color: #fff; text-transform: uppercase;
  text-shadow: 0 2px 0 rgba(0,0,0,.45), 0 6px 18px rgba(0,0,0,.6);
  max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
@keyframes bx-fa-in { to { transform: translateX(0); } }
@keyframes bx-fa-out { to { transform: translateX(-120%); opacity: 0; } }
`;

const PRESETS = {
  follow: { label: 'Neuer Follower', icon: '+', accent: '#21e6c1' },
  sub: { label: 'Neuer Sub', icon: '★', accent: '#ffd23e' },
  share: { label: 'Stream geteilt', icon: '⇗', accent: '#ff4d2e' },
};

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

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
    const preset = PRESETS[p.preset] || PRESETS.follow;
    this.queue.push({ preset, name: String(p.name ?? 'Test') });
    if (!this.busy) this.next();
  }

  next() {
    const item = this.queue.shift();
    if (!item) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const pill = document.createElement('div');
    pill.className = 'bx-fa-pill';
    pill.style.setProperty('--bx-fa-stay', `${this.stayMs}ms`);
    pill.style.borderLeftColor = item.preset.accent;
    pill.innerHTML = `
      <div class="bx-fa-icon"></div>
      <div>
        <div class="bx-fa-label"></div>
        <div class="bx-fa-name"></div>
      </div>`;
    const icon = pill.querySelector('.bx-fa-icon');
    icon.textContent = item.preset.icon;
    icon.style.background = item.preset.accent;
    const label = pill.querySelector('.bx-fa-label');
    label.textContent = item.preset.label;
    label.style.color = item.preset.accent;
    pill.querySelector('.bx-fa-name').textContent = item.name;

    const wrap = document.createElement('div');
    wrap.className = 'bx-fa';
    wrap.appendChild(pill);
    this.root.appendChild(wrap);

    this.timer = setTimeout(() => {
      wrap.remove();
      this.next();
    }, this.stayMs + 420);
  }

  destroy() {
    clearTimeout(this.timer);
    this.root.querySelectorAll('.bx-fa').forEach((el) => el.remove());
  }
}
