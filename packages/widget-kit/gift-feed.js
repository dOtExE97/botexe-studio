// gift-feed.js — Premium Gift-Ticker. Glas-Zeilen, Avatar-Glow, Gift-Bild,
// Slide-In, TTL-Expiry. props: { max?, ttlMs?, accent? }
const STYLE_ID = 'bx-gf-style';
const CSS = `
.bx-gf { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 7px;
  overflow: hidden; font-family: var(--bx-font-body); container-type: size; }
.bx-gf-item { display: flex; align-items: center; gap: 11px; padding: 8px 16px 8px 10px; border-radius: 14px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: 0 8px 22px -8px rgba(0,0,0,.6), 0 0 0 1px color-mix(in srgb, var(--bx-accent) 22%, transparent) inset;
  transform: translateX(-115%); animation: bx-gf-in 380ms cubic-bezier(.2,1.4,.4,1) forwards; }
.bx-gf-item.old { animation: bx-gf-out 320ms ease-in forwards; }
.bx-gf-pic { width: clamp(18px,7cqmin,30px); height: clamp(18px,7cqmin,30px); border-radius: 50%; flex: none; background: #1a1c28 center/cover;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-gf-text { font-size: clamp(10px,4cqmin,15px); color: var(--bx-text, #e9ebf4); text-shadow: 0 1px 2px rgba(0,0,0,.6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bx-gf-text b { font-family: var(--bx-font-display); color: var(--bx-text,#fff); text-transform: uppercase; font-weight: 700; }
.bx-gf-img { height: clamp(16px,6.5cqmin,28px); flex: none; filter: drop-shadow(0 2px 5px rgba(0,0,0,.5)); }
.bx-gf-coins { margin-left: auto; font-family: var(--bx-font-mono); font-weight: 700; font-size: clamp(9px,4cqmin,14px); color: var(--bx-gold);
  text-shadow: 0 0 10px color-mix(in srgb, var(--bx-gold) 40%, transparent); flex: none; }
@keyframes bx-gf-in { to { transform: translateX(0); } }
@keyframes bx-gf-out { to { transform: translateX(-115%); opacity: 0; } }

/* ── Stil „Neon" — freistehende Zeilen ohne Panel: Name + Gift mit Glow und
   harter Schattenkante, minimaler Footprint überm Gameplay. */
.bx-gf-neon .bx-gf-item { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  padding: 2px 4px; border-radius: 0; }
.bx-gf-neon .bx-gf-text { color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,.95), 0 2px 8px rgba(0,0,0,.9); }
.bx-gf-neon .bx-gf-text b { color: var(--bx-accent); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 70%, transparent), 0 1px 0 rgba(0,0,0,.9); }
.bx-gf-neon .bx-gf-pic { box-shadow: 0 0 0 2px var(--bx-accent), 0 2px 6px rgba(0,0,0,.7); }

/* ── Stil „Pills" — satte Akzent-Pillen mit dunkler Schrift: knallig-bunter
   Feed, der auch auf hellem Video-Hintergrund sitzt. */
.bx-gf-pills .bx-gf-item { background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2));
  border-radius: 999px; box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--bx-accent) 75%, transparent);
  -webkit-backdrop-filter: none; backdrop-filter: none; padding: 6px 16px 6px 8px; }
.bx-gf-pills .bx-gf-text { color: #0c0d14; text-shadow: none; font-weight: 600; }
.bx-gf-pills .bx-gf-text b { color: #0c0d14; text-shadow: none; }
.bx-gf-pills .bx-gf-coins { color: #0c0d14; text-shadow: none; background: rgba(255,255,255,.75);
  border-radius: 999px; padding: 2px 10px; }
.bx-gf-pills .bx-gf-pic { box-shadow: 0 0 0 2px rgba(255,255,255,.8); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

/** URL sicher in CSS url("…") einbetten — NUR Quotes escapen, nie
 *  (nach-)encodieren: data-URIs und vor-encodierte CDN-URLs blieben sonst kaputt. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }
export default class GiftFeed {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.max = Math.min(10, Math.max(1, Number(props.max ?? 5)));
    this.ttlMs = Number(props.ttlMs ?? 25000);
    this.el = document.createElement('div');
    const style = ['glas', 'neon', 'pills'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-gf${style !== 'glas' ? ` bx-gf-${style}` : ''}`;
    root.appendChild(this.el);
    this.timers = new Set();
  }
  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (event.type !== 'gift' || !event.gift) return;
    const item = document.createElement('div');
    item.className = 'bx-gf-item';
    item.innerHTML = `<div class="bx-gf-pic"></div><div class="bx-gf-text"><b></b> schickt <b></b></div>${event.gift.icon ? '<img class="bx-gf-img" alt="" />' : ''}<div class="bx-gf-coins"></div>`;
    if (event.gift.icon) item.querySelector('.bx-gf-img').src = event.gift.icon;
    const [nameEl, giftEl] = item.querySelectorAll('.bx-gf-text b');
    nameEl.textContent = event.user?.nickname || 'Jemand';
    giftEl.textContent = `${event.gift.count > 1 ? `${event.gift.count}× ` : ''}${event.gift.slug}`;
    item.querySelector('.bx-gf-coins').textContent = `+${fmt(event.gift.totalCoins)}`;
    if (event.user?.profilePic) item.querySelector('.bx-gf-pic').style.backgroundImage = `url("${cssUrl(event.user.profilePic)}")`;
    this.el.appendChild(item);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    const t = setTimeout(() => { this.timers.delete(t); item.classList.add('old'); setTimeout(() => item.remove(), 320); }, this.ttlMs);
    this.timers.add(t);
  }
  destroy() { for (const t of this.timers) clearTimeout(t); this.el.remove(); }
}
