// gift-feed.js — Premium Gift-Ticker. Glas-Zeilen, Avatar-Glow, Gift-Bild,
// Slide-In, TTL-Expiry. props: { max?, ttlMs?, accent? }
// Anzeigename (deutscher/eigener Name, falls eingestellt) — gemeinsame Quelle.
import { giftName } from './gift-rules.js';

const STYLE_ID = 'bx-gf-style';
const CSS = `
.bx-gf { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: clamp(3px,1.6cqh,12px);
  overflow: hidden; font-family: var(--bx-font-body); container-type: size; }
/* Dichter + skalierend: min(cqi,cqh) nutzt beide Achsen — reines cqmin ergibt
   in breiten, flachen Boxen Mini-Schrift und viel toten Rand. */
.bx-gf-item { display: flex; align-items: center; gap: clamp(5px,2.4cqi,20px); padding: clamp(3px,1.6cqh,12px) clamp(8px,3.2cqi,24px) clamp(3px,1.6cqh,12px) clamp(5px,2cqi,16px); border-radius: 14px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: 0 8px 22px -8px rgba(0,0,0,.6), 0 0 0 1px color-mix(in srgb, var(--bx-accent) 22%, transparent) inset;
  transform: translateX(-115%); animation: bx-gf-in 380ms cubic-bezier(.2,1.4,.4,1) forwards; }
.bx-gf-item.old { animation: bx-gf-out 320ms ease-in forwards; }
/* Passt nicht mehr in die Box → gar nicht erst zeigen (statt oben abschneiden). */
.bx-gf-item.bx-off { display: none; }
/* Eigener Größen-Container, damit der Fallback-Buchstabe (.bx-av::after) mitwächst. */
.bx-gf-pic { width: clamp(18px,min(8cqi,9cqh),52px); aspect-ratio: 1/1; height: auto; border-radius: 50%; flex: none; container-type: size;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-gf-pic::after { font-size: 52cqmin; }
.bx-gf-text { font-size: calc((clamp(12px,min(5.2cqi,7cqh),34px)) * var(--bx-fs, 1)); color: var(--bx-text, #e9ebf4); text-shadow: 0 1px 2px rgba(0,0,0,.6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bx-gf-text b { font-family: var(--bx-font-display); color: var(--bx-text,#fff); text-transform: uppercase; font-weight: 700; }
.bx-gf-img { height: clamp(16px,min(7cqi,8cqh),46px); flex: none; filter: drop-shadow(0 2px 5px rgba(0,0,0,.5)); }
.bx-gf-coins { margin-left: auto; font-family: var(--bx-font-mono); font-weight: 700; font-size: calc((clamp(11px,min(4.8cqi,6.4cqh),32px)) * var(--bx-fs, 1)); color: var(--bx-gold);
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
  -webkit-backdrop-filter: none; backdrop-filter: none; padding: clamp(2px,1.2cqh,10px) clamp(8px,3.2cqi,24px) clamp(2px,1.2cqh,10px) clamp(4px,1.6cqi,14px); }
.bx-gf-pills .bx-gf-text { color: #0c0d14; text-shadow: none; font-weight: 600; }
.bx-gf-pills .bx-gf-text b { color: #0c0d14; text-shadow: none; }
.bx-gf-pills .bx-gf-coins { color: #0c0d14; text-shadow: none; background: rgba(255,255,255,.75);
  border-radius: 999px; padding: 2px 10px; }
.bx-gf-pills .bx-gf-pic { box-shadow: 0 0 0 2px rgba(255,255,255,.8); }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur. Der Zeilen-Schatten war ohne Panel ein grauer Klecks.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-gf-item { box-shadow: none; }
html .bx-frameless .bx-gf:not(.bx-gf-pills) .bx-gf-text { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 2px 6px rgba(0,0,0,.55); }
html .bx-frameless .bx-gf:not(.bx-gf-pills) .bx-gf-coins { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Auslöser auf der NEU EINGETROFFENEN Zeile — der Moment, in dem ein Geschenk
   ankommt. Bei einer Combo (10× Rose) feuert er pro Zeile neu.

   KOLLISION: Die Zeile bringt ihre eigene Einflug-Animation mit und steht
   vorher auf translateX(-115%). Die Basis setzt „animation" komplett neu —
   ohne diese Fassung wäre die frische Zeile 900 ms lang links außerhalb der
   Box geblieben. Darum hier Einflug und Auslöser gemeinsam. */
.bx-premium .bx-gf-item.bx-hit {
  animation: bx-gf-in 380ms cubic-bezier(.2,1.4,.4,1) forwards,
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Das Anheben der Basis bleibt bewusst weg (im Bild geprüft): die Zeile ist so
   breit wie die Box, die Box schneidet über overflow ab — beim Anheben wurden
   die Coin-Werte am rechten Rand abgeschnitten. Ring und Aufblitzen des
   Profilbildes bewegen nichts und tragen den Moment allein. */
/* Das Ablaufen der Zeile muss den Auslöser überstimmen können. */
.bx-premium .bx-gf-item.old.bx-hit { animation: bx-gf-out 320ms ease-in forwards; }
/* Mehr Tiefe an der Coin-Zahl — der Wert ist die eigentliche Nachricht. */
.bx-premium .bx-gf-coins { text-shadow: 0 0 .5em color-mix(in srgb, var(--bx-gold) 55%, transparent), 0 .06em .12em rgba(0,0,0,.75); }
.bx-premium .bx-gf-pills .bx-gf-coins { text-shadow: none; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
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
/** Demo-Gifts für die Editor-Vorschau — sonst bleibt der Feed dort leer. */
const DEMO = [
  ['Pia', 'Rose', 1, 1], ['Kaan', 'Finger Heart', 1, 5], ['Nova', 'Perfume', 2, 40],
  ['LeonGG', 'Rose', 3, 3], ['Mia', 'Galaxy', 1, 1000],
];
export default class GiftFeed {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.max = Math.min(10, Math.max(1, Number(props.max ?? 5)));
    this.ttlMs = Number(props.ttlMs ?? 25000);
    this.el = document.createElement('div');
    const style = ['glas', 'neon', 'pills'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-gf${style !== 'glas' ? ` bx-gf-${style}` : ''}`;
    root.appendChild(this.el);
    this.timers = new Set();
    // Zieht der Nutzer die Box kleiner, passen die eingestellten Zeilen nicht
    // mehr hinein — dann zeigen wir eben weniger, statt oben abzuschneiden.
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);
    if (ctx?.preview) {
      for (const [nick, slug, count, coins] of DEMO.slice(-this.max)) {
        this.onEvent({ type: 'gift', ts: Date.now(), user: { id: nick, nickname: nick }, gift: { slug, count, coinsPerUnit: coins, totalCoins: coins * count, icon: '' } });
      }
    }
  }
  /** Sichtbare Zeilenzahl aus der Boxhöhe ableiten: von unten nach oben zählen,
   *  wie viele Zeilen ganz hineinpassen — der Rest wird ausgeblendet (nicht
   *  gelöscht, damit er bei einer größeren Box zurückkommt). Bewusst KEINE
   *  Schrift-Anpassung: die Zeilenhöhe darf nicht bei jedem Gift springen. */
  fit() {
    const box = this.el.clientHeight;
    const kids = Array.from(this.el.children);
    if (!box || kids.length === 0) return;
    for (const k of kids) k.classList.remove('bx-off');
    const last = kids[kids.length - 1];
    const bottom = last.offsetTop + last.offsetHeight;
    let keep = 1;
    for (let i = kids.length - 2; i >= 0; i--) {
      if (bottom - kids[i].offsetTop > box) break;
      keep++;
    }
    for (let i = 0; i < kids.length - keep; i++) kids[i].classList.add('bx-off');
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
    giftEl.textContent = `${event.gift.count > 1 ? `${event.gift.count}× ` : ''}${giftName(event.gift)}`;
    item.querySelector('.bx-gf-coins').textContent = `+${fmt(event.gift.totalCoins)}`;
    avSet(item.querySelector('.bx-gf-pic'), event.user?.nickname, event.user?.profilePic);
    this.el.appendChild(item);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    this.fit();
    this.hit(item);
    const t = setTimeout(() => { this.timers.delete(t); item.classList.add('old'); setTimeout(() => { item.remove(); this.fit(); }, 320); }, this.ttlMs);
    this.timers.add(t);
  }
  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu, damit der Effekt bei einer Combo pro Zeile erneut anspringt. */
  hit(el) {
    if (!el) return;
    // Ohne Premium-Ebene gibt es fuer .bx-hit KEINE einzige CSS-Regel (alle 81
    // haengen an .bx-premium) — der Effekt waere also unsichtbar. Das
    // `void el.offsetWidth` unten erzwingt aber trotzdem ein vollstaendiges
    // Layout des Dokuments, bei JEDEM Ereignis und in JEDEM Widget. Bei 17
    // Widgets im Layout sind das 17 erzwungene Layouts pro Geschenk, fuer
    // nichts. Deshalb hier raus, bevor es teuer wird.
    // Bewusst bei jedem Aufruf pruefen statt einmal zu merken: Die Klasse
    // haengt an der Ebene und kann sich im Editor jederzeit aendern.
    if (!el.closest('.bx-premium')) return;
    el.classList.remove('bx-hit');
    void el.offsetWidth;
    el.classList.add('bx-hit');
    const t = setTimeout(() => { this.timers.delete(t); el.classList.remove('bx-hit'); }, 900);
    this.timers.add(t);
  }
  destroy() { this.ro?.disconnect(); for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
