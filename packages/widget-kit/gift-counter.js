// gift-counter.js — Geschenkzähler (TikFinity-Style): zählt ein bestimmtes Gift
// (oder alle) Richtung Ziel. Großes, animiertes Gift-Icon (Puls + rotierender
// Glow-Ring), Titel, „aktuell / Ziel". Bei Zielerreichung: Ziel erhöhen / Reset /
// belassen. Wert überlebt Overlay-Reloads (localStorage pro Layer).
// props: { giftSlug?, target?, label?, onReach?: 'raise'|'reset'|'keep',
//          accent?, theme? }  — bei „raise" steigt das Ziel um die ursprüngliche
//          Zielgröße (15 → 30 → 45 …).
const STYLE_ID = 'bx-gco-style';
// --u = „1px bei Standardgröße" (340×360): alle Maße sind Vielfache davon,
// damit Icon und Zahlen mitwachsen, wenn das Widget größer gezogen wird.
const CSS = `
.bx-gco { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:1%; container-type:size; --u: min(0.294cqi, 0.278cqh); font-family: var(--bx-font-body); text-align:center; }
.bx-gco-iconwrap { position:relative; display:grid; place-items:center;
  width: clamp(40px, calc(var(--u) * 143), 560px); height: clamp(40px, calc(var(--u) * 143), 560px); margin-bottom: calc(var(--u) * 7); }
/* Fortschrittsring: zeigt den ECHTEN Stand (--pct wird in render() gesetzt) —
   vorher war das ein rein dekorativer Glow, der bei 4/15 schon „voll" aussah. */
.bx-gco-ring { position:absolute; inset:0; border-radius:50%;
  background: conic-gradient(from -90deg,
    color-mix(in srgb, var(--bx-accent) 90%, white) 0 var(--pct, 0%),
    rgba(255,255,255,.14) var(--pct, 0%) 100%);
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--bx-accent) 55%, transparent));
  -webkit-mask: radial-gradient(circle, transparent 54%, #000 56%); mask: radial-gradient(circle, transparent 54%, #000 56%); }
/* Ziel erreicht → der volle Ring dreht als Belohnung. */
.bx-gco.done .bx-gco-ring { background: conic-gradient(from -90deg, var(--bx-teal), color-mix(in srgb, var(--bx-teal) 45%, white), var(--bx-teal));
  animation: bx-gco-spin 3.2s linear infinite; }
@keyframes bx-gco-spin { to { transform: rotate(360deg); } }
.bx-gco-icon { position:relative; width: 70%; height: 70%; display:grid; place-items:center;
  animation: bx-gco-pulse 2.4s ease-in-out infinite; }
.bx-gco-icon img { width:100%; height:100%; object-fit:contain; filter: drop-shadow(0 4px 14px rgba(0,0,0,.5)) drop-shadow(0 0 16px color-mix(in srgb, var(--bx-accent) 50%, transparent)); }
.bx-gco-icon svg { width:78%; height:78%; color: var(--bx-gold); filter: drop-shadow(0 0 12px color-mix(in srgb, var(--bx-gold) 55%, transparent)); }
@keyframes bx-gco-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
.bx-gco.hit .bx-gco-icon { animation: bx-gco-hit 420ms cubic-bezier(.2,1.6,.35,1); }
@keyframes bx-gco-hit { 0%{transform:scale(1)} 45%{transform:scale(1.28)} 100%{transform:scale(1)} }
.bx-gco-title { font-family: var(--bx-font-display); font-size: clamp(11px, calc(var(--u) * 20), 78px); text-transform:uppercase;
  color:#fff; -webkit-text-stroke: 3px var(--bx-ink,#0a0b12); paint-order: stroke fill; line-height:1.05;
  text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 50%, transparent); }
.bx-gco-prog { font-family: var(--bx-font-num, var(--bx-font-display)); font-weight:800; font-size: clamp(16px, calc(var(--u) * 31), 120px);
  color: var(--bx-gold); -webkit-text-stroke: 2.5px var(--bx-ink,#0a0b12); paint-order: stroke fill; }
.bx-gco.done .bx-gco-prog { color: var(--bx-teal); }

/* ── Stil „Neon" — freistehend: Icon + Zahlen mit Glow, kein Panel. */
.bx-gco-neon { background: none !important; box-shadow: none !important; -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-gco-neon::before { display: none; }
.bx-gco-neon .bx-gco-count, .bx-gco-neon .bx-gco-label { text-shadow: 0 0 16px var(--bx-accent), 0 2px 4px rgba(0,0,0,.9); }

/* ── Stil „Medaille" — Gold-Auszeichnung: Icon im gravierten Goldring. */
.bx-gco-medaille { background: linear-gradient(170deg, rgba(30,24,10,.95), rgba(16,12,6,.96)) !important;
  border: 1px solid color-mix(in srgb, var(--bx-gold) 65%, transparent); border-radius: 14px;
  box-shadow: 0 0 30px -8px var(--bx-gold), inset 0 0 40px rgba(0,0,0,.5) !important; }
.bx-gco-medaille .bx-gco-icon, .bx-gco-medaille img { filter: drop-shadow(0 0 12px var(--bx-gold)); }
.bx-gco-medaille .bx-gco-count { color: var(--bx-gold); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-gold) 60%, transparent); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
const GIFT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>';

/** Normalisierter Gift-Schlüssel: nur Buchstaben/Ziffern, klein. Macht das
 *  Matching tolerant gegen Apostroph/Leerzeichen/Schreibweise — so findet ein
 *  vorab gewähltes „Jollie's Community" beim Empfang zuverlässig zusammen. */
export function giftKey(slug) {
  return String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Gift-Icon im Katalog finden — über den normalisierten Slug.
 *  Liefert '' wenn nicht gefunden. Reine Logik → testbar. */
export function findGiftIcon(catalog, slug) {
  const key = giftKey(slug);
  if (!key || !catalog) return '';
  for (const [k, e] of Object.entries(catalog)) {
    if (e && e.icon && (giftKey(e.slug || k) === key)) return e.icon;
  }
  return '';
}

/** Was bei Zielerreichung passiert. step = ursprüngliche Schrittweite. */
export function onGiftGoalReached(count, target, step, mode) {
  if (mode === 'raise') return step > 0 ? { count, target: target + step } : { count, target };
  if (mode === 'reset') return { count: 0, target };
  return { count, target };
}

export default class GiftCounter {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.giftSlug = giftKey(props.giftSlug);
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
    this.style = ['glas', 'neon', 'medaille'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-gco${this.style !== 'glas' ? ` bx-gco-${this.style}` : ''}`;
    this.el.innerHTML = `<div class="bx-gco-iconwrap"><div class="bx-gco-ring"></div><div class="bx-gco-icon"></div></div>
      <div class="bx-gco-title"></div><div class="bx-gco-prog"></div>`;
    this.el.querySelector('.bx-gco-title').textContent = this.label;
    root.appendChild(this.el);
    this.renderIcon();
    this.render(false);
    if (this.ctx.preview && this.count === 0) this.renderDemo();
    this.preloadIcon();
  }

  /** Konfiguriertes Gift-Bild SOFORT aus dem Katalog laden (auch bei Stand 0) —
   *  so zeigt der Zähler von Anfang an das richtige Gift, wie bei TikFinity,
   *  statt erst nach dem ersten Eingang. Nur bei festem Gift (giftSlug gesetzt). */
  preloadIcon() {
    if (!this.giftSlug || !this.ctx.baseUrl) return;
    fetch(`${this.ctx.baseUrl}/gift-catalog?token=${this.ctx.token}`)
      .then((r) => r.json())
      .then((cat) => {
        const icon = findGiftIcon(cat, this.giftSlug);
        if (icon) { this.lastIcon = icon; this.renderIcon(); this.persist(); }
      })
      .catch(() => {});
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
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (event.type !== 'gift' || !event.gift) return;
    // Bestimmtes Gift ODER alle, wenn kein slug gesetzt. Normalisierter Vergleich
    // (giftKey) → unempfindlich gegen Apostroph/Leerzeichen/Schreibweise.
    if (this.giftSlug && giftKey(event.gift.slug) !== this.giftSlug) return;
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
    // Ring an den echten Fortschritt binden (0..100 %).
    const pct = Math.max(0, Math.min(100, (this.count / Math.max(1, this.target)) * 100));
    this.el.style.setProperty('--pct', `${pct}%`);
    if (animate) { this.el.classList.remove('hit'); void this.el.offsetWidth; this.el.classList.add('hit'); }
  }

  /** Editor-Vorschau: ohne Gifts stünde hier 0/15 bei leerem Ring — mit
   *  Beispielstand sieht man sofort, wie der Ring später aussieht. Nur Anzeige,
   *  nichts wird gespeichert; das erste echte Gift überschreibt sie. */
  renderDemo() {
    const demo = Math.max(1, Math.round(this.target * 0.4));
    this.el.querySelector('.bx-gco-prog').textContent = `${demo} / ${this.target}`;
    this.el.style.setProperty('--pct', '40%');
  }

  // Neuer Stream → Zähler + Ziel zurück auf Start, altes Gift-Icon weg.
  onReset() { this.count = 0; this.target = this.step; this.lastIcon = ''; this.renderIcon(); this.persist(); this.render(false); }

  destroy() { this.el.remove(); }
}
