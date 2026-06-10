// gift-alert.js — Vollformat-Alert wenn ein Gift reinkommt.
// Reagiert auf gift-Events (ab props.minCoins) und auf fire_alert-Actions.
// Neo-Arcade Broadcast: schräge Glas-Card, Lava-Akzent, Punch-In-Animation.

const STYLE_ID = 'bx-gift-alert-style';
const CSS = `
.bx-ga {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Arial Black', 'Archivo Black', Impact, sans-serif;
  opacity: 0; pointer-events: none;
}
.bx-ga.bx-ga-show { animation: bx-ga-in 420ms cubic-bezier(.2,1.6,.35,1) forwards; }
.bx-ga.bx-ga-hide { animation: bx-ga-out 280ms ease-in forwards; }
.bx-ga-card {
  position: relative;
  min-width: 62%; max-width: 92%;
  padding: 26px 44px 28px;
  background: linear-gradient(165deg, rgba(16,18,26,.92), rgba(10,11,16,.88));
  clip-path: polygon(3% 0, 100% 0, 97% 100%, 0 100%);
  border-top: 3px solid #ff4d2e;
  box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08) inset;
  text-align: center;
}
.bx-ga-card::before {
  content: ''; position: absolute; left: -2%; top: 0; bottom: 0; width: 10px;
  background: #ff4d2e; transform: skewX(-8deg);
  box-shadow: 0 0 22px rgba(255,77,46,.9);
}
.bx-ga-kicker {
  font-size: 15px; letter-spacing: .42em; color: #21e6c1;
  text-transform: uppercase; text-shadow: 0 2px 8px rgba(0,0,0,.8);
}
.bx-ga-name {
  font-size: 42px; line-height: 1.05; color: #fff; margin-top: 6px;
  text-transform: uppercase; letter-spacing: .02em;
  text-shadow: 0 3px 0 rgba(0,0,0,.45), 0 8px 24px rgba(0,0,0,.6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 560px;
}
.bx-ga-gift {
  display: inline-block; margin-top: 10px; padding: 6px 22px;
  font-size: 24px; color: #0c0d12; background: #ff4d2e;
  clip-path: polygon(6% 0, 100% 0, 94% 100%, 0 100%);
  text-transform: uppercase; letter-spacing: .06em;
}
.bx-ga-coins {
  margin-top: 12px; font-size: 30px; color: #ffd23e;
  font-family: Consolas, Menlo, monospace; font-weight: 700;
  text-shadow: 0 0 18px rgba(255,210,62,.55), 0 2px 0 rgba(0,0,0,.5);
}
.bx-ga-burst { position: absolute; width: 8px; height: 8px; top: 50%; left: 50%;
  background: #ffd23e; opacity: 0; }
@keyframes bx-ga-in {
  0% { opacity: 0; transform: scale(.6) rotate(-3deg); }
  60% { opacity: 1; transform: scale(1.06) rotate(1deg); }
  100% { opacity: 1; transform: scale(1) rotate(0); }
}
@keyframes bx-ga-out {
  to { opacity: 0; transform: scale(.85) translateY(18px); }
}
@keyframes bx-ga-particle {
  0% { opacity: 1; transform: translate(0,0) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.3); }
}
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

export default class GiftAlert {
  constructor(root, props) {
    ensureStyle();
    this.root = root;
    this.minCoins = Number(props.minCoins ?? 0);
    this.durationMs = Number(props.durationMs ?? 5000);
    this.queue = [];
    this.busy = false;
    this.el = document.createElement('div');
    this.el.className = 'bx-ga';
    root.appendChild(this.el);
  }

  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    if (event.gift.totalCoins < this.minCoins) return;
    this.enqueue({
      name: event.user?.nickname || 'Jemand',
      gift: `${event.gift.count > 1 ? `${event.gift.count}× ` : ''}${event.gift.slug}`,
      coins: event.gift.totalCoins,
    });
  }

  onAction(action) {
    if (action.kind !== 'fire_alert') return;
    const p = action.params || {};
    this.enqueue({
      name: String(p.name ?? 'Test'),
      gift: String(p.gift ?? 'Gift'),
      coins: Number(p.coins ?? 0),
    });
  }

  enqueue(alert) {
    if (this.queue.length >= 8) this.queue.shift(); // backpressure: älteste droppen
    this.queue.push(alert);
    if (!this.busy) this.next();
  }

  next() {
    const alert = this.queue.shift();
    if (!alert) {
      this.busy = false;
      return;
    }
    this.busy = true;
    this.el.innerHTML = `
      <div class="bx-ga-card">
        <div class="bx-ga-kicker">Gift Alert</div>
        <div class="bx-ga-name"></div>
        <div class="bx-ga-gift"></div>
        ${alert.coins > 0 ? `<div class="bx-ga-coins">+${fmt(alert.coins)} Coins</div>` : ''}
      </div>`;
    this.el.querySelector('.bx-ga-name').textContent = alert.name;
    this.el.querySelector('.bx-ga-gift').textContent = alert.gift;
    this.burst(alert.coins >= 100 ? 26 : 12);
    this.el.classList.remove('bx-ga-hide');
    this.el.classList.add('bx-ga-show');

    this.hideTimer = setTimeout(() => {
      this.el.classList.remove('bx-ga-show');
      this.el.classList.add('bx-ga-hide');
      this.nextTimer = setTimeout(() => this.next(), 320);
    }, this.durationMs);
  }

  burst(count) {
    const card = this.el.querySelector('.bx-ga-card');
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'bx-ga-burst';
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = 90 + Math.random() * 140;
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      p.style.background = i % 3 === 0 ? '#21e6c1' : i % 3 === 1 ? '#ffd23e' : '#ff4d2e';
      p.style.animation = `bx-ga-particle ${600 + Math.random() * 500}ms ease-out forwards`;
      card.appendChild(p);
      setTimeout(() => p.remove(), 1300);
    }
  }

  destroy() {
    clearTimeout(this.hideTimer);
    clearTimeout(this.nextTimer);
    this.el.remove();
  }
}
