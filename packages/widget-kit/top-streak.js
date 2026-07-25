// top-streak.js — Highlight der höchsten Combo der Session (z.B. „50x Rose").
// Zeigt Spender-Avatar + Gift-Bild + die Streak-Zahl „xN" groß. Bounce bei
// neuem Rekord. Hydratisiert nach Overlay-Reload aus den Session-Stats.
// props: { accent?, title? }
const STYLE_ID = 'bx-ts-style';
// --u = „1px bei Standardgröße" (340×320): alle Größen sind Vielfache davon,
// damit die Karte beim Größerziehen wirklich mitwächst statt leer zu wirken.
const CSS = `
.bx-ts { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  container-type: size; --u: min(0.294cqi, 0.3125cqh);
  font-family: var(--bx-font-body); padding: 4.2%; text-align: center; background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); overflow: hidden; }
.bx-ts::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 80%, white), transparent 45%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-ts-kicker { font-family: var(--bx-font-display); font-size: clamp(9px, calc(var(--u) * 12), 40px); letter-spacing: .42em; text-transform: uppercase; color: var(--bx-gold);
  text-shadow: 0 1px 3px rgba(0,0,0,.75); }
.bx-ts-row { display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 10); margin: calc(var(--u) * 8) 0 calc(var(--u) * 4); }
.bx-ts-img { height: clamp(26px, calc(var(--u) * 58), 200px); filter: drop-shadow(0 6px 14px rgba(0,0,0,.5)); animation: bx-float 2.8s ease-in-out infinite; }
.bx-ts-x { font-family: var(--bx-font-display); font-size: clamp(22px, calc(var(--u) * 46), 160px); line-height: 1; color: var(--bx-text,#fff);
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 0 22px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-ts-gift { font-family: var(--bx-font-display); font-size: clamp(12px, calc(var(--u) * 20), 70px); text-transform: uppercase; color: var(--bx-text,#fff); text-shadow: 0 2px 8px rgba(0,0,0,.6); }
.bx-ts-by { display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 7); font-size: clamp(10px, calc(var(--u) * 14), 48px);
  color: #cfd5e6; text-shadow: 0 1px 3px rgba(0,0,0,.8); margin-top: calc(var(--u) * 5); }
.bx-ts-by b { color: var(--bx-accent); font-family: var(--bx-font-display); }
.bx-ts-av { width: calc(var(--u) * 26); height: calc(var(--u) * 26); border-radius: 50%; object-fit: cover;
  border: 2px solid color-mix(in srgb, var(--bx-accent) 70%, transparent); box-shadow: 0 2px 8px rgba(0,0,0,.5); }
.bx-ts.bounce { animation: bx-ts-bounce 600ms cubic-bezier(.2,1.6,.4,1); }
@keyframes bx-ts-bounce { 0%,100% { transform: scale(1); } 40% { transform: scale(1.07); } }
.bx-ts-empty { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 12);
  font-size: clamp(10px, calc(var(--u) * 13), 44px); letter-spacing: .2em; color: #c6ccdd; text-shadow: 0 1px 3px rgba(0,0,0,.8); text-transform: uppercase; }
.bx-ts-fire { width: clamp(22px, calc(var(--u) * 46), 160px); height: clamp(22px, calc(var(--u) * 46), 160px); color: #c6ccdd; opacity: .6; }
/* — Sticker-Variante (TikFinity-Look): kein Panel, dicke weiße Outline, großes Gift — */
.bx-ts.st-sticker { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-ts.st-sticker::before { display: none; }
.bx-ts.st-sticker .bx-ts-img { height: clamp(32px, calc(var(--u) * 78), 270px); }
.bx-ts.st-sticker .bx-ts-x { font-size: clamp(26px, calc(var(--u) * 58), 200px); }
.bx-ts.st-sticker .bx-ts-kicker { color: #fff; -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
.bx-ts.st-sticker .bx-ts-gift { color: #fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 3px 6px rgba(0,0,0,.5); }
.bx-ts.st-sticker .bx-ts-by { color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.7); }
.bx-ts.st-sticker .bx-ts-by b { -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const FIRE_SVG = '<svg class="bx-ts-fire" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 .5-2S6 10 6 13a6 6 0 0 0 12 0c0-5-6-11-6-11Z"/></svg>';

export default class TopStreak {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.title = props.title || 'Höchste Combo';
    this.max = 0;
    this.el = document.createElement('div');
    this.el.className = props.style === 'sticker' ? 'bx-ts st-sticker' : 'bx-ts';
    this.el.innerHTML = `<div class="bx-ts-empty">${FIRE_SVG}<span>Noch keine Combo</span></div>`;
    root.appendChild(this.el);
    // Editor-Vorschau: Beispiel-Combo zeigen (sonst nur ein leerer Platzhalter).
    // max bleibt 0 → die erste echte Combo überschreibt die Demo sofort.
    if (ctx && ctx.preview) {
      this.render({ count: 25, slug: 'Rose', icon: '', nickname: 'Mia', avatar: '' });
      this.max = 0;
    }
  }
  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    const count = event.gift.count || 1;
    if (count <= this.max) return;
    this.render({ count, slug: event.gift.slug, icon: event.gift.icon, nickname: event.user?.nickname, avatar: event.user?.profilePic });
  }
  onStats(stats) {
    const t = stats?.topStreak;
    if (!t || t.count <= this.max) return;
    this.render({ count: t.count, slug: t.giftSlug, icon: t.giftIcon, nickname: t.nickname, avatar: t.profilePic });
  }
  render({ count, slug, icon, nickname, avatar }) {
    this.max = count;
    this.el.innerHTML = `
      <div class="bx-ts-kicker">${escapeHtml(this.title)}</div>
      <div class="bx-ts-row">
        ${icon ? '<img class="bx-ts-img" alt="" />' : ''}
        <span class="bx-ts-x">×${count}</span>
      </div>
      <div class="bx-ts-gift"></div>
      <div class="bx-ts-by">${avatar ? '<img class="bx-ts-av" alt="" />' : ''} von <b></b></div>`;
    if (icon) this.el.querySelector('.bx-ts-img').src = icon;
    if (avatar) this.el.querySelector('.bx-ts-av').src = avatar;
    this.el.querySelector('.bx-ts-gift').textContent = slug;
    this.el.querySelector('.bx-ts-by b').textContent = nickname || 'Jemand';
    this.el.classList.remove('bounce'); void this.el.offsetWidth; this.el.classList.add('bounce');
  }
  // Neuer Stream → höchste Combo zurück auf „leer".
  onReset() { this.max = 0; this.el.innerHTML = `<div class="bx-ts-empty">${FIRE_SVG}<span>Noch keine Combo</span></div>`; }
  destroy() { this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
