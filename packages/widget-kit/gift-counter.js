// gift-counter.js — Geschenkzähler (TikFinity-Style): zählt ein bestimmtes Gift
// (oder alle) Richtung Ziel. Großes, animiertes Gift-Icon (Puls + rotierender
// Glow-Ring), Titel, „aktuell / Ziel". Bei Zielerreichung: Ziel erhöhen / Reset /
// belassen. Wert überlebt Overlay-Reloads (localStorage pro Layer).
// props: { giftSlug?, target?, label?, onReach?: 'raise'|'reset'|'keep',
//          accent?, theme? }  — bei „raise" steigt das Ziel um die ursprüngliche
//          Zielgröße (15 → 30 → 45 …).
const STYLE_ID = 'bx-gco-style';
const CSS = `
.bx-gco { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:4px; container-type:size; font-family: var(--bx-font-body); text-align:center; }
.bx-gco-iconwrap { position:relative; display:grid; place-items:center; width: 42cqmin; height: 42cqmin; margin-bottom: 2cqmin; }
/* rotierender konischer Glow-Ring hinter dem Gift */
.bx-gco-ring { position:absolute; inset:0; border-radius:50%;
  background: conic-gradient(from 0deg, transparent, color-mix(in srgb, var(--bx-accent) 85%, white), transparent 45%, color-mix(in srgb, var(--bx-accent) 70%, transparent), transparent);
  filter: blur(2px); opacity:.85; animation: bx-gco-spin 3.2s linear infinite; -webkit-mask: radial-gradient(circle, transparent 54%, #000 56%); mask: radial-gradient(circle, transparent 54%, #000 56%); }
@keyframes bx-gco-spin { to { transform: rotate(360deg); } }
.bx-gco-icon { position:relative; width: 70%; height: 70%; display:grid; place-items:center;
  animation: bx-gco-pulse 2.4s ease-in-out infinite; }
.bx-gco-icon img { width:100%; height:100%; object-fit:contain; filter: drop-shadow(0 4px 14px rgba(0,0,0,.5)) drop-shadow(0 0 16px color-mix(in srgb, var(--bx-accent) 50%, transparent)); }
.bx-gco-icon svg { width:78%; height:78%; color: var(--bx-gold); filter: drop-shadow(0 0 12px color-mix(in srgb, var(--bx-gold) 55%, transparent)); }
@keyframes bx-gco-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
.bx-gco.hit .bx-gco-icon { animation: bx-gco-hit 420ms cubic-bezier(.2,1.6,.35,1); }
@keyframes bx-gco-hit { 0%{transform:scale(1)} 45%{transform:scale(1.28)} 100%{transform:scale(1)} }
.bx-gco-title { font-family: var(--bx-font-display); font-size: clamp(13px, 6cqmin, 30px); text-transform:uppercase;
  color:#fff; -webkit-text-stroke: 3px var(--bx-ink,#0a0b12); paint-order: stroke fill; line-height:1.05;
  text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 50%, transparent); }
.bx-gco-prog { font-family: var(--bx-font-num, var(--bx-font-display)); font-weight:800; font-size: clamp(18px, 9cqmin, 44px);
  color: var(--bx-gold); -webkit-text-stroke: 2.5px var(--bx-ink,#0a0b12); paint-order: stroke fill; }
.bx-gco.done .bx-gco-prog { color: var(--bx-teal); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
const GIFT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>';

/** Was bei Zielerreichung passiert. step = ursprüngliche Schrittweite. */
export function onGiftGoalReached(count, target, step, mode) {
  if (mode === 'raise') return step > 0 ? { count, target: target + step } : { count, target };
  if (mode === 'reset') return { count: 0, target };
  return { count, target };
}

export default class GiftCounter {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.giftSlug = String(props.giftSlug ?? '').trim().toLowerCase();
    this.step = Math.max(0, Math.floor(Number(props.target ?? 15))) || 15;
    this.target = this.step;
    this.onReach = ['raise', 'reset', 'keep'].includes(props.onReach) ? props.onReach : 'raise';
    this.label = props.label || 'Geschenk-Ziel';
    this.storageKey = `bx-gco-${(ctx && ctx.layerId) || 'default'}`;
    const saved = this.load();
    this.count = saved.count;
    this.target = saved.target || this.step;
    this.lastIcon = saved.icon || '';

    this.el = document.createElement('div');
    this.el.className = 'bx-gco';
    this.el.innerHTML = `<div class="bx-gco-iconwrap"><div class="bx-gco-ring"></div><div class="bx-gco-icon"></div></div>
      <div class="bx-gco-title"></div><div class="bx-gco-prog"></div>`;
    this.el.querySelector('.bx-gco-title').textContent = this.label;
    root.appendChild(this.el);
    this.renderIcon();
    this.render(false);
  }

  load() {
    try { const raw = window.localStorage.getItem(this.storageKey); return raw ? JSON.parse(raw) : { count: 0 }; }
    catch { return { count: 0 }; }
  }
  persist() {
    try { window.localStorage.setItem(this.storageKey, JSON.stringify({ count: this.count, target: this.target, icon: this.lastIcon })); }
    catch { /* private mode etc. */ }
  }

  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    // Bestimmtes Gift (per slug) ODER alle, wenn kein slug gesetzt.
    if (this.giftSlug && String(event.gift.slug ?? '').toLowerCase() !== this.giftSlug) return;
    if (event.gift.icon) { this.lastIcon = event.gift.icon; this.renderIcon(); }
    this.count += Math.max(1, Math.floor(event.gift.count || 1));
    // Großer Combo-Sprung kann mehrere Ziele auf einmal überschreiten → mehrfach
    // hochziehen. break, sobald sich das Ziel nicht mehr ändert (reset/keep/step=0)
    // → kein Endlos-Loop.
    while (this.count >= this.target) {
      const prevTarget = this.target;
      const r = onGiftGoalReached(this.count, this.target, this.step, this.onReach);
      this.count = r.count; this.target = r.target;
      if (this.target === prevTarget) break;
    }
    this.persist();
    this.render(true);
  }

  renderIcon() {
    const slot = this.el.querySelector('.bx-gco-icon');
    if (this.lastIcon) { slot.innerHTML = '<img alt="" />'; slot.querySelector('img').src = this.lastIcon; }
    else slot.innerHTML = GIFT_SVG;
  }

  render(animate) {
    this.el.querySelector('.bx-gco-prog').textContent = `${this.count} / ${this.target}`;
    this.el.classList.toggle('done', this.count >= this.target);
    if (animate) { this.el.classList.remove('hit'); void this.el.offsetWidth; this.el.classList.add('hit'); }
  }

  // Neuer Stream → Zähler + Ziel zurück auf Start.
  onReset() { this.count = 0; this.target = this.step; this.persist(); this.render(false); }

  destroy() { this.el.remove(); }
}
