// gift-feed.js — laufender Ticker der letzten Gifts.
// props: { max?: number, ttlMs?: number }

const STYLE_ID = 'bx-gf-style';
const CSS = `
.bx-gf {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  justify-content: flex-end; gap: 6px; overflow: hidden;
  font-family: 'Arial Black', 'Archivo Black', Impact, sans-serif;
}
.bx-gf-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 14px 7px 10px;
  background: linear-gradient(165deg, rgba(16,18,26,.88), rgba(10,11,16,.82));
  clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  border-left: 3px solid var(--bx-accent, #ff4d2e);
  box-shadow: 0 6px 18px rgba(0,0,0,.4);
  transform: translateX(-110%);
  animation: bx-gf-in 320ms cubic-bezier(.2,1.3,.4,1) forwards;
}
.bx-gf-item.bx-gf-old { animation: bx-gf-out 280ms ease-in forwards; }
.bx-gf-pic { width: 24px; height: 24px; border-radius: 50%; flex: none;
  background: #262a36 center/cover; box-shadow: 0 0 0 2px rgba(255,255,255,.12); }
.bx-gf-text { font-size: 14px; color: #e8eaf2; text-shadow: 0 1px 0 rgba(0,0,0,.5);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bx-gf-text b { color: #fff; text-transform: uppercase; }
.bx-gf-coins { margin-left: auto; font-family: Consolas, Menlo, monospace;
  font-weight: 700; font-size: 13px; color: #ffd23e; flex: none; }
.bx-gf-icon { height: 26px; flex: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
@keyframes bx-gf-in { to { transform: translateX(0); } }
@keyframes bx-gf-out { to { transform: translateX(-110%); opacity: 0; } }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
}

export default class GiftFeed {
  constructor(root, props) {
    ensureStyle();
    this.max = Math.min(10, Math.max(1, Number(props.max ?? 5)));
    this.ttlMs = Number(props.ttlMs ?? 25000);
    this.el = document.createElement('div');
    this.el.className = 'bx-gf';
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    root.appendChild(this.el);
    this.timers = new Set();
  }

  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    const item = document.createElement('div');
    item.className = 'bx-gf-item';
    item.innerHTML = `
      <div class="bx-gf-pic"></div>
      <div class="bx-gf-text"><b></b> schickt <b></b></div>
      ${event.gift.icon ? '<img class="bx-gf-icon" alt="" />' : ''}
      <div class="bx-gf-coins"></div>`;
    if (event.gift.icon) item.querySelector('.bx-gf-icon').src = event.gift.icon;
    const [nameEl, giftEl] = item.querySelectorAll('.bx-gf-text b');
    nameEl.textContent = event.user?.nickname || 'Jemand';
    giftEl.textContent = `${event.gift.count > 1 ? `${event.gift.count}× ` : ''}${event.gift.slug}`;
    item.querySelector('.bx-gf-coins').textContent = `+${fmt(event.gift.totalCoins)}`;
    if (event.user?.profilePic) {
      item.querySelector('.bx-gf-pic').style.backgroundImage = `url("${encodeURI(event.user.profilePic)}")`;
    }
    this.el.appendChild(item);

    while (this.el.children.length > this.max) this.el.firstElementChild.remove();

    const timer = setTimeout(() => {
      this.timers.delete(timer);
      item.classList.add('bx-gf-old');
      setTimeout(() => item.remove(), 300);
    }, this.ttlMs);
    this.timers.add(timer);
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.el.remove();
  }
}
