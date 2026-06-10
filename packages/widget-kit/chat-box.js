// chat-box.js — Live-Chat im Overlay. NEU (gab es in der Alt-App nicht).
// props: { max?: number, hideAfterMs?: number (0 = nie ausblenden) }
// Nickname-Farbe: stabiler Hash → HSL, damit jeder User wiedererkennbar ist.

const STYLE_ID = 'bx-cb-style';
const CSS = `
.bx-cb {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  justify-content: flex-end; gap: 5px; overflow: hidden;
  font-family: Verdana, 'Segoe UI', sans-serif;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 14%);
  mask-image: linear-gradient(to bottom, transparent, #000 14%);
}
.bx-cb-msg {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 12px 7px 8px;
  background: rgba(10,11,16,.78);
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  box-shadow: 0 4px 14px rgba(0,0,0,.35);
  transform: translateY(16px); opacity: 0;
  animation: bx-cb-in 260ms cubic-bezier(.2,1.2,.4,1) forwards;
}
.bx-cb-msg.bx-cb-fade { animation: bx-cb-out 400ms ease-in forwards; }
.bx-cb-pic { width: 22px; height: 22px; border-radius: 50%; flex: none; margin-top: 1px;
  background: #262a36 center/cover; box-shadow: 0 0 0 1.5px rgba(255,255,255,.15); }
.bx-cb-body { min-width: 0; }
.bx-cb-name {
  font-family: 'Arial Black', Impact, sans-serif;
  font-size: 12px; text-transform: uppercase; letter-spacing: .04em;
  text-shadow: 0 1px 2px rgba(0,0,0,.8);
}
.bx-cb-text {
  font-size: 14px; line-height: 1.3; color: #f2f3f8;
  text-shadow: 0 1px 2px rgba(0,0,0,.7);
  word-break: break-word; overflow-wrap: anywhere;
}
@keyframes bx-cb-in { to { transform: translateY(0); opacity: 1; } }
@keyframes bx-cb-out { to { opacity: 0; } }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

function nameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 85% 68%)`;
}

export default class ChatBox {
  constructor(root, props) {
    ensureStyle();
    this.max = Math.min(30, Math.max(3, Number(props.max ?? 8)));
    this.hideAfterMs = Number(props.hideAfterMs ?? 0);
    this.el = document.createElement('div');
    this.el.className = 'bx-cb';
    root.appendChild(this.el);
    this.timers = new Set();
  }

  onEvent(event) {
    if (event.type !== 'chat' || !event.text) return;
    const msg = document.createElement('div');
    msg.className = 'bx-cb-msg';
    msg.innerHTML = `
      <div class="bx-cb-pic"></div>
      <div class="bx-cb-body">
        <div class="bx-cb-name"></div>
        <div class="bx-cb-text"></div>
      </div>`;
    const name = event.user?.nickname || 'Anonym';
    const nameEl = msg.querySelector('.bx-cb-name');
    nameEl.textContent = name;
    nameEl.style.color = nameColor(name);
    msg.querySelector('.bx-cb-text').textContent = event.text; // textContent: kein HTML-Inject
    if (event.user?.profilePic) {
      msg.querySelector('.bx-cb-pic').style.backgroundImage = `url("${encodeURI(event.user.profilePic)}")`;
    }
    this.el.appendChild(msg);

    while (this.el.children.length > this.max) this.el.firstElementChild.remove();

    if (this.hideAfterMs > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        msg.classList.add('bx-cb-fade');
        setTimeout(() => msg.remove(), 420);
      }, this.hideAfterMs);
      this.timers.add(timer);
    }
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.el.remove();
  }
}
