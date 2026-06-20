// gift-alert.js — Premium-Vollformat-Alert bei Gifts.
// Glas-Karte, Avatar-Ring, schwebendes Gift-Bild, Neon-Name, Coin-Chip,
// Shimmer + Spring-Pop + Partikel-Burst. Nutzt widget-base.css.

const STYLE_ID = 'bx-ga-style';
const CSS = `
.bx-ga { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-body); opacity: 0; pointer-events: none; }
.bx-ga.show { animation: bx-ga-in 480ms cubic-bezier(.2,1.5,.3,1) forwards; }
.bx-ga.hide { animation: bx-ga-out 320ms ease-in forwards; }
.bx-ga-card {
  position: relative; min-width: 60%; max-width: 94%;
  padding: 30px 48px 30px; text-align: center;
  background: var(--bx-glass);
  border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 60px -16px var(--bx-accent);
  -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4);
  overflow: hidden;
}
.bx-ga-card::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.6px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 85%, white), transparent 45%, color-mix(in srgb, var(--bx-accent) 35%, transparent));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events: none; }
.bx-ga-card::after { content: ''; position: absolute; top: 0; bottom: 0; left: -55%; width: 42%;
  transform: translateX(0) skewX(-20deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent);
  animation: bx-ga-sweep 1.5s ease-out 240ms 2; }
/* translateX statt left: GPU-compositet. -55%→135% = 190% Container ≈ 452% der 42%-Glanzfläche. */
@keyframes bx-ga-sweep { to { transform: translateX(452%) skewX(-20deg); } }
.bx-ga-kicker { font-family: var(--bx-font-display); font-size: 14px; letter-spacing: .5em;
  text-transform: uppercase; color: var(--bx-teal); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-teal) 50%, transparent); }
.bx-ga-pic { width: 76px; height: 76px; margin: 12px auto 0; border-radius: 50%;
  background: #1a1c28 center/cover; box-shadow: 0 0 0 3px var(--bx-accent), 0 0 22px -2px var(--bx-accent); }
.bx-ga-name { font-family: var(--bx-font-display); font-size: 46px; line-height: 1.04; margin-top: 10px;
  text-transform: uppercase; color: var(--bx-text,#fff); text-shadow: 0 2px 0 rgba(0,0,0,.4), 0 10px 28px rgba(0,0,0,.6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 600px; }
.bx-ga-img { height: 92px; margin-top: 12px; filter: drop-shadow(0 8px 18px rgba(0,0,0,.6));
  animation: bx-float 2.6s ease-in-out infinite; }
.bx-ga-gift { display: inline-block; margin-top: 12px; padding: 7px 26px; font-family: var(--bx-font-display);
  font-size: 24px; text-transform: uppercase; letter-spacing: .04em; color: #0a0b10;
  background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2)); border-radius: 999px;
  box-shadow: 0 6px 18px -4px var(--bx-accent); }
.bx-ga-coins { margin-top: 16px; font-family: var(--bx-font-mono); font-weight: 700; font-size: 30px;
  color: var(--bx-gold); text-shadow: 0 0 20px color-mix(in srgb, var(--bx-gold) 55%, transparent), 0 2px 4px rgba(0,0,0,.6); }
.bx-ga-burst { position: absolute; width: 9px; height: 9px; top: 50%; left: 50%; border-radius: 2px; opacity: 0; }
@keyframes bx-ga-in { 0% { opacity: 0; transform: scale(.7) translateY(14px); } 60% { opacity: 1; transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
@keyframes bx-ga-out { to { opacity: 0; transform: scale(.88) translateY(20px); } }
@keyframes bx-ga-particle { 0% { opacity: 1; transform: translate(0,0) scale(1) rotate(0); } 100% { opacity: 0; transform: translate(var(--dx),var(--dy)) scale(.3) rotate(180deg); } }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

/** URL sicher in CSS url("…") einbetten — NUR Quotes escapen, nie
 *  (nach-)encodieren: data-URIs und vor-encodierte CDN-URLs blieben sonst kaputt. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }
export default class GiftAlert {
  constructor(root, props) {
    ensureStyle();
    this.root = root;
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
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
      icon: event.gift.icon,
      pic: event.user?.profilePic,
    });
  }

  onAction(action) {
    if (action.kind !== 'fire_alert') return;
    const p = action.params || {};
    this.enqueue({ name: String(p.name ?? 'Test'), gift: String(p.gift ?? 'Gift'), coins: Number(p.coins ?? 0), icon: p.icon, pic: p.pic });
  }

  enqueue(alert) {
    if (this.queue.length >= 8) this.queue.shift();
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
        ${alert.pic ? '<div class="bx-ga-pic"></div>' : ''}
        <div class="bx-ga-name"></div>
        ${alert.icon ? '<img class="bx-ga-img" alt="" />' : '<div class="bx-ga-gift"></div>'}
        ${alert.coins > 0 ? `<div class="bx-ga-coins">+${fmt(alert.coins)} Coins</div>` : ''}
      </div>`;
    this.el.querySelector('.bx-ga-name').textContent = alert.name;
    const giftEl = this.el.querySelector('.bx-ga-gift');
    if (giftEl) giftEl.textContent = alert.gift;
    if (alert.pic) this.el.querySelector('.bx-ga-pic').style.backgroundImage = `url("${cssUrl(alert.pic)}")`;
    if (alert.icon) this.el.querySelector('.bx-ga-img').src = alert.icon;
    this.burst(alert.coins >= 100 ? 28 : 14);
    this.el.classList.remove('hide');
    this.el.classList.add('show');

    this.hideTimer = setTimeout(() => {
      this.el.classList.remove('show');
      this.el.classList.add('hide');
      this.nextTimer = setTimeout(() => this.next(), 340);
    }, this.durationMs);
  }

  burst(count) {
    const card = this.el.querySelector('.bx-ga-card');
    if (!card) return;
    const colors = ['var(--bx-teal)', 'var(--bx-gold)', 'var(--bx-accent)', '#fff'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'bx-ga-burst';
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = 100 + Math.random() * 160;
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      p.style.background = colors[i % colors.length];
      p.style.animation = `bx-ga-particle ${650 + Math.random() * 550}ms ease-out forwards`;
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
