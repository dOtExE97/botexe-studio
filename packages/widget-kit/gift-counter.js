// gift-counter.js — Geschenkzähler (TikFinity-Style): zählt ein bestimmtes Gift
// (oder alle) Richtung Ziel. Großes, animiertes Gift-Icon (Puls + rotierender
// Glow-Ring), Titel, „aktuell / Ziel". Bei Zielerreichung: Ziel erhöhen / Reset /
// belassen. Wert überlebt Overlay-Reloads (localStorage pro Layer).
// props: { giftSlug?, target?, label?, onReach?: 'raise'|'reset'|'keep',
//          showTitle?, showCount?, showRing?, accent?, theme? }  — bei „raise"
//          steigt das Ziel um die ursprüngliche Zielgröße (15 → 30 → 45 …).
//          Die show*-Schalter sind standardmäßig an; alle drei aus = nur das
//          Geschenk-Bild.
//
// giftKey() kommt aus gift-rules.js (EINZIGE Quelle, s. dortiger Kommentar) —
// vorher hatte diese Datei eine eigene, textidentische Kopie (4. unabhängige
// Kopie im Repo neben trigger-engine/index.ts, gift-rules.js selbst und dem
// Re-Export hier). Wird re-exportiert, falls jemand `giftKey` bisher von
// HIER importiert (Kompatibilität), aber es gibt nur noch eine Implementierung.
import { giftKey, ladeGiftKatalog } from './gift-rules.js';
export { giftKey };
const STYLE_ID = 'bx-gco-style';
// --u = „1px bei Standardgröße" (340×360): alle Maße sind Vielfache davon,
// damit Icon und Zahlen mitwachsen, wenn das Widget größer gezogen wird.
const CSS = `
.bx-gco { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:1%; container-type:size; --u: calc((min(0.294cqi, 0.278cqh)) * var(--bx-fs, 1)); font-family: var(--bx-font-body); text-align:center; }
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

/* ── Was gezeigt wird (Titel / Zählerstand / Fortschrittsring) ──────────────
   Wunsch aus der Praxis: „nur das Geschenk, ohne Zähler drunter". Ohne diese
   Schalter musste man dafür den Titel leeren UND konnte die Zahl gar nicht
   loswerden. Standard ist unverändert alles an — bestehende Overlays sehen
   also genauso aus wie vorher (die Klassen kommen nur bei ausdrücklichem
   Abwählen dazu). */
.bx-gco.ohne-titel .bx-gco-title { display: none; }
.bx-gco.ohne-zaehler .bx-gco-prog { display: none; }
.bx-gco.ohne-ring .bx-gco-ring { display: none; }
/* Bleibt nur das Geschenk übrig, füllt es die Box aus — sonst schwebte ein
   kleines Icon in viel Leere, weil die Größe für Icon + zwei Textzeilen
   gerechnet ist. Weiter über --u, damit es beim Ziehen mitwächst. */
.bx-gco.nur-icon .bx-gco-iconwrap { width: clamp(40px, calc(var(--u) * 300), 900px);
  height: clamp(40px, calc(var(--u) * 300), 900px); margin-bottom: 0; }

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

/* ══ Drei weitere Stile ══════════════════════════════════════════════════
   Alle drei benutzen dasselbe Gerüst (Rahmen · Ring · Icon · Titel · Zahl)
   und stellen nur um, was der Ring IST. Neue Werte, keine Änderung an den
   bestehenden — vorhandene Overlays bleiben unberührt.
   Animiert wird ausschließlich transform/opacity/filter (der TTLS-Browser ist
   schwach), und jede Ruhebewegung ist langsam genug, um im Stream nicht zu
   nerven. */

/* ── Stil „Aufladung" — der Ring wird zum Füllstand: die Farbe steigt von
   unten hinter dem Geschenk hoch, mit heller Kante an der Oberfläche. Das
   Geschenk selbst ist bei 0 fast farblos und wird mit jedem Eingang satter
   (--pctn = Fortschritt als Zahl 0..1, in render() gesetzt) — der Fortschritt
   ist damit auch ohne Zahl auf einen Blick zu sehen. */
.bx-gco-aufladung .bx-gco-ring {
  -webkit-mask: none; mask: none; border-radius: 50%;
  background: linear-gradient(to top,
    color-mix(in srgb, var(--bx-accent) 92%, black) 0%,
    color-mix(in srgb, var(--bx-accent) 70%, white) calc(var(--pct, 0%) - 4%),
    color-mix(in srgb, white 88%, var(--bx-accent)) calc(var(--pct, 0%) - 1.5%),
    rgba(255,255,255,.06) var(--pct, 0%), rgba(255,255,255,.06) 100%);
  /* Innenschatten = Wölbung des Gefäßes, heller Rand = seine Kante. Ohne die
     Kante schwebte die Farbe frei im Bild, statt in etwas drin zu stehen. */
  box-shadow: inset 0 0 26px rgba(0,0,0,.55),
    inset 0 0 0 calc(var(--u) * 3) color-mix(in srgb, var(--bx-accent) 30%, transparent),
    0 0 24px -6px color-mix(in srgb, var(--bx-accent) 70%, transparent);
  /* Sanftes Schwappen wie in einem Glas — nur Drehung, also GPU-billig. */
  animation: bx-gco-schwapp 6.5s ease-in-out infinite;
}
@keyframes bx-gco-schwapp { 0%,100% { transform: rotate(-1.4deg); } 50% { transform: rotate(1.4deg); } }
.bx-gco-aufladung .bx-gco-icon { filter: saturate(calc(0.25 + 0.75 * var(--pctn, 0))) drop-shadow(0 3px 10px rgba(0,0,0,.6)); }
/* Volles Glas: die Oberfläche verschwindet, alles leuchtet türkis. */
.bx-gco-aufladung.done .bx-gco-ring {
  background: linear-gradient(to top, color-mix(in srgb, var(--bx-teal) 90%, black), color-mix(in srgb, var(--bx-teal) 55%, white));
  animation: bx-gco-schwapp 3.4s ease-in-out infinite; }
.bx-gco-aufladung.hit .bx-gco-ring { animation: bx-gco-schwapp 6.5s ease-in-out infinite, bx-gco-platsch 520ms ease-out; }
@keyframes bx-gco-platsch { 0% { filter: brightness(1); } 22% { filter: brightness(1.85); } 100% { filter: brightness(1); } }

/* ── Stil „Arcade" — der Ring zerfällt in Segmente wie eine Boss-Leiste im
   Spielautomaten, dazu ein eckiges Gehäuse mit Rasterlinien.
   FALLE: Die Segmente entstehen aus ZWEI Masken (Loch in der Mitte UND
   Zahnkranz), die sich überschneiden müssen. Die Kurzschreibweise von -webkit-mask
   in der Grundregel setzt auch die Verrechnung mit — deshalb hier die Langform,
   sonst liegen die Masken übereinander statt sich zu schneiden. */
.bx-gco-arcade { background: linear-gradient(180deg, rgba(10,12,26,.94), rgba(6,7,16,.96)) !important;
  border: 2px solid color-mix(in srgb, var(--bx-accent) 70%, transparent); border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 0 34px -10px var(--bx-accent), inset 0 0 30px rgba(0,0,0,.6) !important;
  overflow: hidden; }
/* Rasterlinien. ::after ist bei diesem Widget frei (der Rahmen-Hairline der
   Basis greift hier nicht, gift-counter hat kein Glas-Panel). */
.bx-gco-arcade::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.045) 0 1px, transparent 1px 3px); }
.bx-gco-arcade .bx-gco-ring {
  -webkit-mask-image: radial-gradient(circle, transparent 52%, #000 54%), repeating-conic-gradient(from -90deg, #000 0 12deg, transparent 12deg 18deg);
  mask-image: radial-gradient(circle, transparent 52%, #000 54%), repeating-conic-gradient(from -90deg, #000 0 12deg, transparent 12deg 18deg);
  -webkit-mask-composite: source-in; mask-composite: intersect;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--bx-accent) 80%, transparent)); }
.bx-gco-arcade .bx-gco-title { letter-spacing: .14em; color: color-mix(in srgb, var(--bx-accent) 45%, white); }
.bx-gco-arcade .bx-gco-prog { font-family: var(--bx-font-mono, var(--bx-font-num)); color: color-mix(in srgb, var(--bx-accent) 30%, white); }
/* Ziel erreicht: die Zahl blinkt wie ein Highscore. */
.bx-gco-arcade.done .bx-gco-prog { animation: bx-gco-blink 1s steps(1) infinite; }
@keyframes bx-gco-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: .25; } }
/* Treffer: ein kurzes Ruckeln des Automaten. */
.bx-gco-arcade.hit { animation: bx-gco-ruckel 260ms steps(2) 2; }
@keyframes bx-gco-ruckel { 0%,100% { transform: translate(0,0); } 50% { transform: translate(1.5px,-1.5px); } }

/* ── Stil „Sticker" — verspielt, wie ein aufgeklebter Chat-Sticker: dicker
   weißer Rand ums Geschenk, Zahl in einer Pille, alles leicht schief und in
   ruhiger Bewegung. Kein Panel, damit er auf jedem Videobild sitzt. */
.bx-gco-sticker { background: none !important; box-shadow: none !important; }
.bx-gco-sticker .bx-gco-iconwrap { border-radius: 50%; background: color-mix(in srgb, var(--bx-accent) 22%, #14121f);
  box-shadow: 0 0 0 calc(var(--u) * 6) #fff, 0 calc(var(--u) * 5) calc(var(--u) * 14) rgba(0,0,0,.5);
  animation: bx-gco-wackel 5s ease-in-out infinite; }
@keyframes bx-gco-wackel { 0%,100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
/* Der Ring liegt hier ALS Rand direkt auf dem weißen Sticker-Rand. */
/* Der Ring liegt AUSSERHALB des weißen Stickerrands — innen lag er auf Weiß
   und war praktisch unsichtbar. */
.bx-gco-sticker .bx-gco-ring { inset: calc(var(--u) * -16);
  /* FALLE: Bei radial-gradient(circle, …) sind 100% die Ecke, nicht die Kante —
     der Kreis reicht also über die Box hinaus. 86% wären außerhalb gewesen und
     der Ring blieb unsichtbar. 62% ≈ 0,88 der halben Breite. Dieselbe Rechnung
     steckt hinter den 54% der Grundregel. */
  -webkit-mask: radial-gradient(circle, transparent 62%, #000 64%); mask: radial-gradient(circle, transparent 62%, #000 64%);
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--bx-accent) 65%, transparent)); }
.bx-gco-sticker .bx-gco-title { color: #fff; -webkit-text-stroke: calc(var(--u) * 5) var(--bx-ink, #0a0b12); }
.bx-gco-sticker .bx-gco-prog { background: #fff; color: #14121f; -webkit-text-stroke: 0;
  border-radius: 999px; padding: 0 calc(var(--u) * 14); margin-top: calc(var(--u) * 4);
  box-shadow: 0 calc(var(--u) * 4) calc(var(--u) * 10) rgba(0,0,0,.45); }
.bx-gco-sticker.done .bx-gco-prog { background: var(--bx-teal); color: #06241e; }
/* Treffer: ein kräftiger Hüpfer statt des kleinen Standard-Pochens. */
.bx-gco-sticker.hit .bx-gco-iconwrap { animation: bx-gco-huepf 620ms cubic-bezier(.2,1.8,.35,1); }
@keyframes bx-gco-huepf {
  0% { transform: rotate(-2.5deg) scale(1); }
  35% { transform: rotate(4deg) scale(1.18); }
  70% { transform: rotate(-3deg) scale(.96); }
  100% { transform: rotate(-2.5deg) scale(1); } }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   Titel und Zähler haben bereits eine Kontur — hier reicht ein satterer Schatten.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-gco-title, html .bx-frameless .bx-gco-prog { text-shadow: 0 3px 10px rgba(0,0,0,.55); }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Zwei Stufen: jedes gezählte Geschenk löst am Gift-Rund aus; ist damit das
   Ziel erreicht, löst zusätzlich der Fortschritts-Text aus — derselbe Effekt
   an zwei Stellen liest sich deutlich lauter als an einer.

   KOLLISION: Der Icon-Rahmen heißt „bx-gco-iconwrap", das Icon
   „bx-gco-icon" — beide fallen unter den breiten Selektor [class*='-ic'] der
   Basis, der Bildern ein langsames Atmen gibt. Beim Icon hätte das dessen
   eigenen Herzschlag (bx-gco-pulse) ersetzt, weil der Basis-Selektor
   spezifischer ist als „.bx-gco-icon". Also hier zurückgeholt. */
.bx-premium .bx-gco-icon { animation: bx-gco-pulse 2.4s ease-in-out infinite; }
/* Der Ring der Basis ist eine box-shadow-Kontur. Der Icon-Rahmen ist eckig,
   der Fortschrittsring darin rund — ohne Radius säße ein Kasten um einen
   Kreis. Der Rahmen hat keinen Hintergrund, der Radius ändert also nichts
   außer der Form des Auslöser-Rings. */
.bx-premium .bx-gco-iconwrap { border-radius: 50%; }
/* Die Fortschrittszahl ist reiner Text. Der Ring der Basis ist in em bemessen
   und wird dort in großen Boxen zu einer Farbplatte statt zu einer Kontur —
   deshalb ein Schein, der der Ziffernform folgt. Türkis wie der volle Ring,
   denn dieser Auslöser feuert nur bei erreichtem Ziel. */
.bx-premium .bx-gco-prog.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-gco-hit-schein 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
@keyframes bx-gco-hit-schein {
  0% { filter: drop-shadow(0 0 0 var(--bx-teal)) drop-shadow(0 0 0 var(--bx-teal)); }
  18% { filter: drop-shadow(0 0 .14em var(--bx-teal)) drop-shadow(0 0 .34em var(--bx-teal)); }
  100% { filter: drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent); }
}
/* Mehr Tiefe an der Fortschrittszahl. */
.bx-premium .bx-gco-prog { text-shadow: 0 0 .45em color-mix(in srgb, var(--bx-gold) 55%, transparent), 0 .05em .1em rgba(0,0,0,.7); }
.bx-premium .bx-gco.done .bx-gco-prog { text-shadow: 0 0 .45em color-mix(in srgb, var(--bx-teal) 60%, transparent), 0 .05em .1em rgba(0,0,0,.7); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
const GIFT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>';

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

/** Die wählbaren Stile. Reihenfolge = die des Auswahlfelds; 'glas' ist der
 *  Rückfall für alles Unbekannte (z.B. ein Overlay von einer neueren Fassung).
 *  Ein Stil wird NIE entfernt — das würde vorhandene Overlays umgestalten. */
export const STILE = ['glas', 'neon', 'medaille', 'aufladung', 'arcade', 'sticker'];

/** Welche Anzeige-Klassen an der Wurzel hängen (Titel/Zähler/Ring aus).
 *
 *  FEHLENDER WERT HEISST „AN": Alle Overlays, die vor diesen Schaltern gebaut
 *  wurden, haben die Schlüssel gar nicht — sie müssen unverändert aussehen.
 *  Nur ein ausdrückliches `false` blendet aus. Ausgelagert, weil der Rest des
 *  Widgets DOM braucht und diese Regel damit sonst ungeprüft bliebe. */
export function anzeigeKlassen(props) {
  const p = props || {};
  const titel = p.showTitle !== false;
  const zaehler = p.showCount !== false;
  const klassen = [];
  if (!titel) klassen.push('ohne-titel');
  if (!zaehler) klassen.push('ohne-zaehler');
  if (p.showRing === false) klassen.push('ohne-ring');
  // Ohne Titel UND ohne Zahl bleibt nur das Geschenk — dann darf es die Box
  // ausfüllen statt in der Mitte zu schweben.
  if (!titel && !zaehler) klassen.push('nur-icon');
  return klassen;
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
    this.timers = new Set();
    this.storageKey = `bx-gco-${(ctx && ctx.layerId) || 'default'}`;
    const saved = this.load();
    this.count = saved.count;
    this.target = saved.target || this.step;
    this.lastIcon = saved.icon || '';

    this.el = document.createElement('div');
    this.style = STILE.includes(props.style) ? props.style : 'glas';
    this.el.className = [
      'bx-gco',
      ...(this.style !== 'glas' ? [`bx-gco-${this.style}`] : []),
      ...anzeigeKlassen(props),
    ].join(' ');
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
    ladeGiftKatalog(this.ctx.baseUrl, this.ctx.token)
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
    // Derselbe Wert als reine Zahl (0..1): der Stil „Aufladung" rechnet damit
    // in filter: saturate(), und dort ist eine Prozentangabe nicht brauchbar.
    this.el.style.setProperty('--pctn', String(pct / 100));
    if (animate) {
      this.el.classList.remove('hit'); void this.el.offsetWidth; this.el.classList.add('hit');
      // Die Klasse WIEDER abnehmen. Ohne das blieb sie nach dem ersten Geschenk
      // für immer stehen — und weil die Treffer-Animation die Ruhebewegung
      // desselben Elements ersetzt, hörte das Geschenk danach auf zu pulsieren.
      // Der längste Treffer-Ablauf dauert 620ms, 700 lässt Luft.
      const t = setTimeout(() => { this.timers.delete(t); this.el.classList.remove('hit'); }, 700);
      this.timers.add(t);
    }
    // Premium-Auslöser: der Zähler ist gestiegen. Ist damit das Ziel erreicht,
    // bekommt zusätzlich der Fortschritts-Text den Auftritt — deutlich lauter.
    if (animate) {
      this.hit(this.el.querySelector('.bx-gco-iconwrap'));
      if (this.count >= this.target) this.hit(this.el.querySelector('.bx-gco-prog'));
    }
  }

  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu, damit der Effekt bei einer Combo (10x Rose) erneut anspringt. */
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

  /** Editor-Vorschau: ohne Gifts stünde hier 0/15 bei leerem Ring — mit
   *  Beispielstand sieht man sofort, wie der Ring später aussieht. Nur Anzeige,
   *  nichts wird gespeichert; das erste echte Gift überschreibt sie. */
  renderDemo() {
    const demo = Math.max(1, Math.round(this.target * 0.4));
    this.el.querySelector('.bx-gco-prog').textContent = `${demo} / ${this.target}`;
    this.el.style.setProperty('--pct', '40%');
    this.el.style.setProperty('--pctn', '0.4');
  }

  // Neuer Stream → Zähler + Ziel zurück auf Start, altes Gift-Icon weg.
  onReset() { this.count = 0; this.target = this.step; this.lastIcon = ''; this.renderIcon(); this.persist(); this.render(false); }

  destroy() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
