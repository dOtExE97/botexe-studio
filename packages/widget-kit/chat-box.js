// chat-box.js — Premium Live-Chat im Overlay (NEU ggü. Alt-App).
// Glas-Bubbles, Avatar-Glow, hash-stabile Nickname-Farben, Mask-Fade.
// textContent-only (kein HTML-Inject). props: { max?, hideAfterMs? }
const STYLE_ID = 'bx-cb-style';
const CSS = `
.bx-cb { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 7px;
  overflow: hidden; font-family: var(--bx-font-body); container-type: size;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 14%); mask-image: linear-gradient(to bottom, transparent, #000 14%); }
.bx-cb-msg { display: flex; align-items: flex-start; gap: 9px; padding: 8px 14px 9px 9px; border-radius: 14px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  box-shadow: 0 6px 16px -8px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05) inset;
  transform: translateY(14px); opacity: 0; animation: bx-cb-in 280ms cubic-bezier(.2,1.3,.4,1) forwards; }
.bx-cb-msg.fade { animation: bx-cb-out 420ms ease-in forwards; }
.bx-cb-pic { width: clamp(16px,6cqmin,26px); height: clamp(16px,6cqmin,26px); border-radius: 50%; flex: none; margin-top: 1px; background: #1a1c28 center/cover;
  box-shadow: 0 0 0 2px rgba(255,255,255,.12); }
.bx-cb-body { min-width: 0; }
.bx-cb-name { font-family: var(--bx-font-display); font-size: clamp(9px,3.4cqmin,13px); text-transform: uppercase; letter-spacing: .03em;
  text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.bx-cb-text { font-size: clamp(10px,4cqmin,15px); line-height: 1.32; color: var(--bx-text,#f2f3f8); text-shadow: 0 1px 2px rgba(0,0,0,.6);
  word-break: break-word; overflow-wrap: anywhere; }
@keyframes bx-cb-in { to { transform: translateY(0); opacity: 1; } }
@keyframes bx-cb-out { to { opacity: 0; } }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
function nameColor(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0; return `hsl(${Math.abs(h) % 360} 88% 70%)`; }

/** URL sicher in CSS url("…") einbetten — NUR Quotes escapen, nie
 *  (nach-)encodieren: data-URIs und vor-encodierte CDN-URLs blieben sonst kaputt. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }
export default class ChatBox {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
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
    msg.innerHTML = `<div class="bx-cb-pic"></div><div class="bx-cb-body"><div class="bx-cb-name"></div><div class="bx-cb-text"></div></div>`;
    const name = event.user?.nickname || 'Anonym';
    const nameEl = msg.querySelector('.bx-cb-name');
    nameEl.textContent = name;
    nameEl.style.color = nameColor(name);
    msg.querySelector('.bx-cb-text').textContent = event.text;
    if (event.user?.profilePic) msg.querySelector('.bx-cb-pic').style.backgroundImage = `url("${cssUrl(event.user.profilePic)}")`;
    this.el.appendChild(msg);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    if (this.hideAfterMs > 0) {
      const t = setTimeout(() => { this.timers.delete(t); msg.classList.add('fade'); setTimeout(() => msg.remove(), 440); }, this.hideAfterMs);
      this.timers.add(t);
    }
  }
  destroy() { for (const t of this.timers) clearTimeout(t); this.el.remove(); }
}
