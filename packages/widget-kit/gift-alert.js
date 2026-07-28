// gift-alert.js — Premium-Vollformat-Alert bei Gifts.
// Glas-Karte, Avatar-Ring, schwebendes Gift-Bild, Neon-Name, Coin-Chip,
// Shimmer + Spring-Pop + Partikel-Burst. Nutzt widget-base.css.

// Anzeigename (deutscher/eigener Name, falls eingestellt) — gemeinsame Quelle.
import { giftName } from './gift-rules.js';

const STYLE_ID = 'bx-ga-style';
const CSS = `
/* container-type: size → alle Größen unten skalieren mit der Widget-Box mit.
   min(cqi,cqh) statt cqmin: in einer breiten 760x380-Karte wäre cqmin nur die
   kurze Seite und die Schrift bliebe unnötig klein. */
.bx-ga { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-body); opacity: 0; pointer-events: none; container-type: size; }
.bx-ga.show { animation: bx-ga-in 480ms cubic-bezier(.2,1.5,.3,1) forwards; }
.bx-ga.hide { animation: bx-ga-out 320ms ease-in forwards; }
.bx-ga-card {
  position: relative; min-width: 60%; max-width: 94%;
  padding: clamp(6px,6cqh,50px) clamp(12px,6.3cqi,96px); text-align: center;
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
.bx-ga-kicker { font-family: var(--bx-font-display); font-size: calc((clamp(9px,min(1.9cqi,3.7cqh),30px)) * var(--bx-fs, 1)); letter-spacing: .5em;
  text-transform: uppercase; color: var(--bx-teal); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-teal) 50%, transparent); }
/* Eigener Größen-Container, damit der Fallback-Buchstabe (.bx-av::after) mitwächst. */
.bx-ga-pic { width: clamp(28px,min(9cqi,17cqh),150px); aspect-ratio: 1/1; height: auto; margin: clamp(3px,2.4cqh,20px) auto 0; border-radius: 50%;
  container-type: size; box-shadow: 0 0 0 3px var(--bx-accent), 0 0 22px -2px var(--bx-accent); }
.bx-ga-pic::after { font-size: 46cqmin; }
.bx-ga-name { font-family: var(--bx-font-display); font-size: calc((clamp(17px,min(5.4cqi,10.5cqh),86px)) * var(--bx-fs, 1)); line-height: 1.04; margin-top: clamp(3px,2cqh,18px);
  text-transform: uppercase; color: var(--bx-text,#fff); text-shadow: 0 2px 0 rgba(0,0,0,.4), 0 10px 28px rgba(0,0,0,.6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80cqi; }
.bx-ga-img { height: clamp(28px,min(9.5cqi,18cqh),160px); margin-top: clamp(3px,2.4cqh,20px); filter: drop-shadow(0 8px 18px rgba(0,0,0,.6));
  animation: bx-float 2.6s ease-in-out infinite; }
.bx-ga-gift { display: inline-block; margin-top: clamp(3px,2.4cqh,20px); padding: .3em 1.1em; font-family: var(--bx-font-display);
  font-size: calc((clamp(12px,min(3.2cqi,6.3cqh),50px)) * var(--bx-fs, 1)); text-transform: uppercase; letter-spacing: .04em; color: #0a0b10;
  background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2)); border-radius: 999px;
  box-shadow: 0 6px 18px -4px var(--bx-accent); }
.bx-ga-coins { margin-top: clamp(4px,3cqh,26px); font-family: var(--bx-font-mono); font-weight: 700; font-size: calc((clamp(12px,min(3.6cqi,7cqh),56px)) * var(--bx-fs, 1));
  color: var(--bx-gold); text-shadow: 0 0 20px color-mix(in srgb, var(--bx-gold) 55%, transparent), 0 2px 4px rgba(0,0,0,.6); }
/* Platzhalter, wenn kein Gift-Bild kommt: generisches Geschenk-Symbol, damit die
   große Karte nicht halb leer bleibt. */
.bx-ga-ph { display: block; height: clamp(26px,min(9cqi,17cqh),150px); width: auto; margin: clamp(3px,2.4cqh,20px) auto 0;
  color: var(--bx-accent); filter: drop-shadow(0 8px 18px rgba(0,0,0,.6)); animation: bx-float 2.6s ease-in-out infinite; }
.bx-ga-burst { position: absolute; width: 9px; height: 9px; top: 50%; left: 50%; border-radius: 2px; opacity: 0; }
@keyframes bx-ga-in { 0% { opacity: 0; transform: scale(.7) translateY(14px); } 60% { opacity: 1; transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
@keyframes bx-ga-out { to { opacity: 0; transform: scale(.88) translateY(20px); } }
@keyframes bx-ga-particle { 0% { opacity: 1; transform: translate(0,0) scale(1) rotate(0); } 100% { opacity: 0; transform: translate(var(--dx),var(--dy)) scale(.3) rotate(180deg); } }

/* ── Stil „Neon" — freistehend, ohne Panel: riesiger Kontur-Name mit hartem
   Glow, Gift-Bild groß. Gemacht für Overlays direkt über dem Gameplay. */
.bx-ga-neon .bx-ga-card { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; padding: 10px 20px; }
.bx-ga-neon .bx-ga-card::before, .bx-ga-neon .bx-ga-card::after { display: none; }
.bx-ga-neon .bx-ga-kicker { display: inline-block; padding: 4px 22px; transform: rotate(-2deg);
  background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2)); color: #0a0b10;
  clip-path: polygon(4% 0, 100% 0, 96% 100%, 0 100%); text-shadow: none; letter-spacing: .34em; }
.bx-ga-neon .bx-ga-name { font-size: calc((clamp(20px,min(8.4cqi,16.8cqh),130px)) * var(--bx-fs, 1)); -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 0 34px var(--bx-accent), 0 6px 0 rgba(0,0,0,.35); max-width: none; }
.bx-ga-neon .bx-ga-img { height: clamp(40px,min(17cqi,34cqh),270px); }
.bx-ga-neon .bx-ga-ph { height: clamp(38px,min(16cqi,32cqh),250px); }
.bx-ga-neon .bx-ga-coins { font-size: calc((clamp(15px,min(5cqi,10cqh),76px)) * var(--bx-fs, 1)); -webkit-text-stroke: 2px var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Stil „Banner" — Lower-Third-Leiste: schmale Zeile, schräge Kanten, slidet
   von links. Dezent für Streamer, denen der Vollformat-Alert zu viel ist. */
.bx-ga-banner { align-items: flex-end; justify-content: flex-start; padding-bottom: 4%; }
.bx-ga-banner.show { animation: bx-ga-slide-in 420ms cubic-bezier(.2,1.4,.3,1) forwards; }
.bx-ga-banner.hide { animation: bx-ga-slide-out 300ms ease-in forwards; }
.bx-ga-banner .bx-ga-card { display: flex; align-items: center; gap: clamp(6px,2.1cqi,26px); text-align: left;
  min-width: 0; max-width: 96%; padding: clamp(4px,3.2cqh,24px) clamp(10px,4.5cqi,60px) clamp(4px,3.2cqh,24px) clamp(5px,1.8cqi,26px); border-radius: 0;
  clip-path: polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%);
  background: linear-gradient(105deg, rgba(9,10,16,.95), rgba(14,16,26,.88) 70%, color-mix(in srgb, var(--bx-accent) 30%, rgba(14,16,26,.85)));
  border-left: 5px solid var(--bx-accent); }
.bx-ga-banner .bx-ga-card::before { display: none; }
.bx-ga-banner .bx-ga-kicker { display: none; }
.bx-ga-banner .bx-ga-pic { width: clamp(24px,min(6.8cqi,13.7cqh),110px); margin: 0; }
.bx-ga-banner .bx-ga-name { font-size: calc((clamp(13px,min(3.4cqi,6.8cqh),52px)) * var(--bx-fs, 1)); margin: 0; max-width: 45cqi; }
.bx-ga-banner .bx-ga-img { height: clamp(22px,min(6.3cqi,12.6cqh),100px); margin: 0; }
.bx-ga-banner .bx-ga-ph { height: clamp(20px,min(5.8cqi,11.6cqh),92px); margin: 0; }
.bx-ga-banner .bx-ga-gift { margin: 0; font-size: calc((clamp(10px,min(2.1cqi,4.2cqh),32px)) * var(--bx-fs, 1)); padding: .25em .9em; }
.bx-ga-banner .bx-ga-coins { margin: 0 0 0 4px; font-size: calc((clamp(12px,min(2.9cqi,5.8cqh),44px)) * var(--bx-fs, 1)); }
@keyframes bx-ga-slide-in { 0% { opacity: 0; transform: translateX(-60px); } 100% { opacity: 1; transform: translateX(0); } }
@keyframes bx-ga-slide-out { to { opacity: 0; transform: translateX(-40px); } }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur an Kicker, Name und Coins.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-ga-kicker { -webkit-text-stroke: max(1.5px, .1em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-ga-name { -webkit-text-stroke: max(1.5px, .07em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-ga-coins { -webkit-text-stroke: max(1.5px, .08em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Auslöser auf der KARTE, im Moment des Erscheinens. Bewusst die Karte und
   nicht die Wurzel: die Wurzel trägt schon Ein- und Ausblenden (.show/.hide),
   die Karte selbst hat keine eigene Animation — die Choreografie der Basis
   passt dort ohne Umbau.
   Der Ring der Basis läuft über box-shadow und kommt damit an ::before
   (Gradient-Haarlinie) und ::after (Glanzstreif) vorbei, die hier beide
   belegt sind. Die Karte verliert dafür 900 ms lang ihren eigenen Schatten —
   im Moment des Auftritts ist genau das gewollt. */
/* Der Ring wird für 900 ms zum einzigen Schatten der Karte — damit sie dabei
   nicht flach wirkt, legt ein mitlaufender Filter-Schein Tiefe darunter.
   KOLLISION: Der Stil „Banner" schneidet die Karte per clip-path schräg an;
   ein clip-path schneidet auch box-shadow weg, der Ring wäre dort unsichtbar
   gewesen. Derselbe Filter-Schein umfasst die geschnittene Silhouette und
   springt für den Banner ein. */
.bx-premium .bx-ga-card.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1),
    bx-ga-hit-schein 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
@keyframes bx-ga-hit-schein {
  0% { filter: drop-shadow(0 .16em .4em rgba(0,0,0,.7)) drop-shadow(0 0 0 color-mix(in srgb, var(--bx-accent) 95%, white)); }
  22% { filter: drop-shadow(0 .16em .4em rgba(0,0,0,.7)) drop-shadow(0 0 .5em color-mix(in srgb, var(--bx-accent) 90%, white)); }
  100% { filter: drop-shadow(0 .16em .4em rgba(0,0,0,.7)) drop-shadow(0 0 0 transparent); }
}
/* Mehr Tiefe: Kicker und Coin-Zeile führen das Auge, der Name bleibt Held. */
.bx-premium .bx-ga-kicker { text-shadow: 0 0 .7em color-mix(in srgb, var(--bx-teal) 60%, transparent), 0 .06em .12em rgba(0,0,0,.8); }
.bx-premium .bx-ga-coins { text-shadow: 0 0 .55em color-mix(in srgb, var(--bx-gold) 65%, transparent), 0 .06em .12em rgba(0,0,0,.8); }
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

/* ── Avatar-Fallback (bewusst je Widget dupliziert, kein gemeinsames JS-Modul):
   ohne Bild — oder wenn das Laden scheitert — erscheint der Anfangsbuchstabe
   auf einem aus dem Namen abgeleiteten Farbton statt eines schwarzen Kreises. */
function avHue(name) { const s = String(name || ''); let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i); return h % 360; }
function avSet(el, name, url) {
  if (!el) return;
  const s = String(name || '').trim();
  el.classList.add('bx-av');
  el.dataset.initial = (s[0] || '?').toUpperCase();
  el.style.setProperty('--bx-av-h', String(avHue(s)));
  if (!url) return;
  const img = new Image();
  img.onload = () => { if (el.isConnected) { el.style.backgroundImage = `url("${cssUrl(url)}")`; el.classList.add('bx-av-img'); } };
  img.src = url;
}
/** Generisches Geschenk-Symbol — springt ein, wenn TikTok kein Gift-Bild liefert. */
const GIFT_SVG = `<svg class="bx-ga-ph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" fill="rgba(255,255,255,.08)"/><path d="M2 7h20v5H2z" fill="rgba(255,255,255,.12)"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>`;
export default class GiftAlert {
  constructor(root, props, ctx) {
    ensureStyle();
    this.root = root;
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.minCoins = Number(props.minCoins ?? 0);
    this.durationMs = Number(props.durationMs ?? 5000);
    this.queue = [];
    this.busy = false;
    this.timers = new Set();
    this.el = document.createElement('div');
    const style = ['glas', 'neon', 'banner'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-ga${style !== 'glas' ? ` bx-ga-${style}` : ''}`;
    root.appendChild(this.el);
    // Editor-Vorschau: einen stehenden Beispiel-Alert zeigen (ohne Ausblenden),
    // sonst ist die Box im Editor komplett leer.
    this.preview = !!ctx?.preview;
    if (this.preview) this.enqueue({ name: 'Mia', gift: '3× Rose', coins: 420, icon: '', pic: '' });
  }

  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (event.type !== 'gift' || !event.gift) return;
    if (event.gift.totalCoins < this.minCoins) return;
    this.leavePreview();
    this.enqueue({
      name: event.user?.nickname || 'Jemand',
      gift: `${event.gift.count > 1 ? `${event.gift.count}× ` : ''}${giftName(event.gift)}`,
      coins: event.gift.totalCoins,
      icon: event.gift.icon,
      pic: event.user?.profilePic,
    });
  }

  onAction(action) {
    if (action.kind !== 'fire_alert') return;
    this.leavePreview();
    const p = action.params || {};
    this.enqueue({ name: String(p.name ?? 'Test'), gift: String(p.gift ?? 'Gift'), coins: Number(p.coins ?? 0), icon: p.icon, pic: p.pic });
  }

  /** Sobald ein echtes Gift kommt, den stehenden Vorschau-Alert abgeben. */
  leavePreview() {
    if (!this.preview) return;
    this.preview = false;
    this.busy = false;
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
    // Profilbild und Gift-Bild fehlen im Live oft — beide bekommen deshalb einen
    // Platzhalter (Buchstaben-Avatar bzw. generisches Geschenk-Symbol), sonst
    // steht hier eine fast leere 760x380-Karte.
    this.el.innerHTML = `
      <div class="bx-ga-card">
        <div class="bx-ga-kicker">Neues Geschenk</div>
        <div class="bx-ga-pic"></div>
        <div class="bx-ga-name"></div>
        ${alert.icon ? '<img class="bx-ga-img" alt="" />' : `${GIFT_SVG}<div class="bx-ga-gift"></div>`}
        ${alert.coins > 0 ? `<div class="bx-ga-coins">+${fmt(alert.coins)} Coins</div>` : ''}
      </div>`;
    this.el.querySelector('.bx-ga-name').textContent = alert.name;
    const giftEl = this.el.querySelector('.bx-ga-gift');
    if (giftEl) giftEl.textContent = alert.gift;
    avSet(this.el.querySelector('.bx-ga-pic'), alert.name, alert.pic);
    if (alert.icon) this.el.querySelector('.bx-ga-img').src = alert.icon;
    this.burst(alert.coins >= 100 ? 28 : 14);
    this.el.classList.remove('hide');
    this.el.classList.add('show');
    // Premium-Auslöser: der Auftritt der Karte IST der bemerkenswerte Moment.
    this.hit(this.el.querySelector('.bx-ga-card'));
    if (this.preview) return; // Vorschau bleibt stehen

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

  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu, damit der Effekt bei Alert-Ketten erneut anspringt. */
  hit(el) {
    if (!el) return;
    el.classList.remove('bx-hit');
    void el.offsetWidth;
    el.classList.add('bx-hit');
    const t = setTimeout(() => { this.timers.delete(t); el.classList.remove('bx-hit'); }, 900);
    this.timers.add(t);
  }

  destroy() {
    clearTimeout(this.hideTimer);
    clearTimeout(this.nextTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.el.remove();
  }
}
