// activity-feed.js — kombinierter Aktivitäts-Ticker (Follow, Sub, Share, Gift).
// Glas-Zeilen mit Icon-Badge je Typ. props: { max?, ttlMs?, accent? }
const STYLE_ID = 'bx-af-style';
const CSS = `
.bx-af { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: clamp(3px,1.6cqh,12px);
  overflow: hidden; font-family: var(--bx-font-body); container-type: size; }
.bx-af-item { display: flex; align-items: center; gap: clamp(5px,2.4cqi,20px); padding: clamp(3px,1.6cqh,12px) clamp(8px,3.2cqi,24px) clamp(3px,1.6cqh,12px) clamp(4px,1.6cqi,14px); border-radius: 14px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: 0 8px 22px -8px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.05) inset;
  transform: translateX(-115%); animation: bx-af-in 380ms cubic-bezier(.2,1.4,.4,1) forwards; }
.bx-af-item.old { animation: bx-af-out 320ms ease-in forwards; }
/* Passt nicht mehr in die Box → gar nicht erst zeigen (statt oben abschneiden). */
.bx-af-item.bx-off { display: none; }
/* Profilbild mit Typ-Marke: der Kreis zeigt das Bild — oder, wenn TikTok keins
   liefert, den Anfangsbuchstaben (.bx-av). Die kleine Marke unten rechts sagt,
   um welches Ereignis es geht. */
.bx-af-ava { position: relative; flex: none; width: clamp(20px,min(9cqi,10cqh),58px); aspect-ratio: 1/1; }
.bx-af-av { position: absolute; inset: 0; border-radius: 50%; container-type: size; box-shadow: 0 0 0 2px rgba(255,255,255,.14); }
.bx-af-av::after { font-size: 52cqmin; }
.bx-af-badge { position: absolute; right: -10%; bottom: -10%; width: 56%; height: 56%; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; color: #0a0b10; box-shadow: 0 0 0 2px rgba(10,11,18,.85); }
.bx-af-badge svg { width: 62%; height: 62%; display: block; }
.bx-af-text { font-size: calc((clamp(11px,min(4.2cqi,7cqh),30px)) * var(--bx-fs, 1)); color: #e9ebf4; text-shadow: 0 1px 2px rgba(0,0,0,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bx-af-text b { font-family: var(--bx-font-display); color: var(--bx-text,#fff); text-transform: uppercase; }
@keyframes bx-af-in { to { transform: translateX(0); } }
@keyframes bx-af-out { to { transform: translateX(-115%); opacity: 0; } }

/* ── ZEITSTRAHL — senkrechte Linie mit Punkten und Uhrzeit: wirkt wie ein
   Protokoll statt wie eine Liste. */
.bx-af-timeline .bx-af-item { background: none !important; box-shadow: none !important; border-radius: 0;
  padding: 6px 8px 6px 26px; position: relative; }
.bx-af-timeline .bx-af-item::before { content:''; position:absolute; left:11px; z-index:1; top:0; bottom:0; width:2px;
  background: color-mix(in srgb, var(--bx-accent) 45%, transparent); }
.bx-af-timeline .bx-af-item::after { content:''; position:absolute; left:6px; top:50%; z-index:1; width:12px; height:12px;
  margin-top:-6px; border-radius:50%; background: var(--bx-accent);
  box-shadow: 0 0 0 3px rgba(10,11,18,.9), 0 0 12px -2px var(--bx-accent); }
.bx-af-timeline .bx-af-ava { width: clamp(18px,min(8cqi,9cqh),50px); }
.bx-af-timeline .bx-af-text { text-shadow: 0 1px 3px rgba(0,0,0,.9); }

/* ── SPRECHBLASEN — jedes Ereignis als Blase mit kleinem Zipfel, abwechselnd
   eingerückt. Verspielt und locker. */
.bx-af-bubbles .bx-af-item { border-radius: 18px 18px 18px 6px; position: relative;
  background: linear-gradient(150deg, rgba(28,30,44,.95), rgba(14,15,24,.92));
  box-shadow: 0 8px 18px -9px rgba(0,0,0,.75); margin-bottom: 8px; align-self: flex-start; max-width: 94%; }
.bx-af-bubbles .bx-af-item:nth-child(even) { border-radius: 18px 18px 6px 18px; margin-left: 6%; }
.bx-af-bubbles .bx-af-item::after { content:''; position:absolute; left:6px; bottom:-5px; width:12px; height:12px;
  background: inherit; border-radius: 0 0 0 4px; transform: rotate(45deg) skew(6deg,6deg); }
.bx-af-bubbles .bx-af-item:nth-child(even)::after { left: auto; right: 6px; border-radius: 0 0 4px 0; }
.bx-af-bubbles .bx-af-av { border-radius: 50%; }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur. Der Zeilen-Schatten war ohne Panel ein grauer Klecks.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-af-item { box-shadow: none; }
html .bx-frameless .bx-af-text { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 2px 6px rgba(0,0,0,.55); }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Auslöser auf dem NEU EINGETROFFENEN Eintrag.

   KOLLISION: Die Zeile bringt ihre eigene Einflug-Animation mit und steht
   vorher auf translateX(-115%); die Basis setzt „animation" komplett neu.
   Ohne diese Fassung wäre der frische Eintrag 900 ms außerhalb der Box
   stehen geblieben — darum Einflug und Auslöser gemeinsam. */
.bx-premium .bx-af-item.bx-hit {
  animation: bx-af-in 380ms cubic-bezier(.2,1.4,.4,1) forwards,
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Das Anheben der Basis bleibt bewusst weg (im Bild geprüft): die Zeile ist so
   breit wie die Box, die Box schneidet über overflow ab — beim Anheben lief der
   Zeilentext am rechten Rand hinaus. */
.bx-premium .bx-af-item.old.bx-hit { animation: bx-af-out 320ms ease-in forwards; }
/* Der Zeitstrahl zeichnet Linie und Punkt in ::before/::after der Zeile und
   der Sprechblasen-Stil seinen Zipfel in ::after — beide bleiben unberührt,
   weil der Ring der Basis bewusst über box-shadow läuft.
   Die Typ-Marke (Follow/Sub/Share/Gift) ist eine feste Form, kein Bild: sie
   bekommt weder Schein noch Dauer-Atmen, sondern nur etwas mehr Tiefe. */
.bx-premium .bx-af-badge { box-shadow: 0 0 0 2px rgba(10,11,18,.85), 0 .1em .2em rgba(0,0,0,.55); }
`;
// Monochrome Inline-SVG-Icons (currentColor = dunkle Badge-Schrift auf hellem Gradient).
const ICONS = {
  follow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M19 8v6M22 11h-6"/></svg>',
  sub: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 20.1 6.5 19.3l1.3-6.1L3.2 9l6.2-.7L12 2.6Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>',
};
const TYPES = {
  follow: { icon: ICONS.follow, txt: 'folgt jetzt', col: '#28e0c4' },
  sub: { icon: ICONS.sub, txt: 'hat abonniert', col: '#ffd23e' },
  share: { icon: ICONS.share, txt: 'hat geteilt', col: '#ff5436' },
  gift: { icon: ICONS.gift, txt: '', col: '#ff5e8a' },
};
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));

/* ── Avatar-Fallback (bewusst je Widget dupliziert, kein gemeinsames JS-Modul):
   ohne Bild — oder wenn das Laden scheitert — erscheint der Anfangsbuchstabe
   auf einem aus dem Namen abgeleiteten Farbton statt eines schwarzen Kreises. */
function avHue(name) { const s = String(name || ''); let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i); return h % 360; }
/** URL sicher in CSS url("…") einbetten — nur Quotes escapen, nie nachencodieren. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }
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
/** Demo-Ereignisse für die Editor-Vorschau — sonst bleibt der Ticker dort leer. */
const DEMO = [
  { type: 'follow', user: { id: 'd1', nickname: 'Pia' } },
  { type: 'gift', user: { id: 'd2', nickname: 'Kaan' }, gift: { slug: 'Rose', count: 3, totalCoins: 3 } },
  { type: 'share', user: { id: 'd3', nickname: 'Nova' } },
  { type: 'sub', user: { id: 'd4', nickname: 'LeonGG' } },
  { type: 'gift', user: { id: 'd5', nickname: 'Mia' }, gift: { slug: 'Galaxy', count: 1, totalCoins: 1000 } },
  { type: 'follow', user: { id: 'd6', nickname: 'BigBen' } },
];
export default class ActivityFeed {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.max = Math.min(12, Math.max(1, Number(props.max ?? 6)));
    this.ttlMs = Number(props.ttlMs ?? 60000);
    this.el = document.createElement('div');
    const style = ['glas', 'timeline', 'bubbles'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-af${style !== 'glas' ? ` bx-af-${style}` : ''}`;
    root.appendChild(this.el);
    this.timers = new Set();
    // Zieht der Nutzer die Box kleiner, passen die eingestellten Zeilen nicht
    // mehr hinein — dann zeigen wir eben weniger, statt oben abzuschneiden.
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);
    if (ctx?.preview) for (const e of DEMO.slice(-this.max)) this.onEvent({ ...e, ts: Date.now() });
  }
  /** Sichtbare Zeilenzahl aus der Boxhöhe ableiten: von unten nach oben zählen,
   *  wie viele Zeilen ganz hineinpassen — der Rest wird ausgeblendet (nicht
   *  gelöscht, damit er bei einer größeren Box zurückkommt). Bewusst KEINE
   *  Schrift-Anpassung: die Zeilenhöhe darf nicht bei jedem Ereignis springen. */
  fit() {
    const box = this.el.clientHeight;
    const kids = Array.from(this.el.children);
    if (!box || kids.length === 0) return;
    for (const k of kids) k.classList.remove('bx-off');
    const last = kids[kids.length - 1];
    // Stil „Sprechblasen" gibt den Zeilen margin-bottom — die zählt zur Höhe,
    // steckt aber nicht in offsetHeight.
    const mb = parseFloat(getComputedStyle(last).marginBottom) || 0;
    const bottom = last.offsetTop + last.offsetHeight + mb;
    let keep = 1;
    for (let i = kids.length - 2; i >= 0; i--) {
      if (bottom - kids[i].offsetTop > box) break;
      keep++;
    }
    for (let i = 0; i < kids.length - keep; i++) kids[i].classList.add('bx-off');
  }
  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    const def = TYPES[event.type];
    if (!def) return;
    const name = event.user?.nickname || 'Jemand';
    let line;
    if (event.type === 'gift' && event.gift) {
      line = `<b>${escapeHtml(name)}</b> schickt <b>${escapeHtml(event.gift.slug)}</b> (+${fmt(event.gift.totalCoins)})`;
    } else {
      line = `<b>${escapeHtml(name)}</b> ${def.txt}`;
    }
    const item = document.createElement('div');
    item.className = 'bx-af-item';
    item.innerHTML = `<div class="bx-af-ava"><div class="bx-af-av"></div><div class="bx-af-badge" style="background:linear-gradient(150deg,${def.col},color-mix(in srgb,${def.col} 60%,#000))">${def.icon}</div></div><div class="bx-af-text">${line}</div>`;
    avSet(item.querySelector('.bx-af-av'), name, event.user?.profilePic);
    this.el.appendChild(item);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    this.fit();
    this.hit(item);
    const t = setTimeout(() => { this.timers.delete(t); item.classList.add('old'); setTimeout(() => { item.remove(); this.fit(); }, 320); }, this.ttlMs);
    this.timers.add(t);
  }
  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu, damit der Effekt bei schnellen Folgen erneut anspringt. */
  hit(el) {
    if (!el) return;
    el.classList.remove('bx-hit');
    void el.offsetWidth;
    el.classList.add('bx-hit');
    const t = setTimeout(() => { this.timers.delete(t); el.classList.remove('bx-hit'); }, 900);
    this.timers.add(t);
  }
  destroy() { this.ro?.disconnect(); for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
