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
/* ══ Die großen drei ═════════════════════════════════════════════════════
   Aufwendigere Stile, die die freie Bühne .bx-gco-deko benutzen. Bewegt wird
   auch hier nur transform/opacity/filter — nichts, wofür der Browser neu
   rechnen müsste. Ruhebewegungen sind langsam (4–14s), damit sie im Stream
   nicht die Aufmerksamkeit vom Spiel ziehen; laut wird es nur im Moment des
   Geschenks. */
.bx-gco-deko { position:absolute; inset:0; pointer-events:none; }

/* ── Stil „Portal" — das Geschenk schwebt in einem Energiewirbel. Drei Ringe
   in verschiedenen Größen drehen GEGENEINANDER; das ergibt Tiefe, die ein
   einzelner drehender Ring nie hat. Bei jedem Eingang läuft eine Schockwelle
   nach außen. */
.bx-gco-portal .bx-gco-ring {
  background: conic-gradient(from -90deg,
    transparent 0, color-mix(in srgb, var(--bx-accent) 35%, transparent) calc(var(--pct, 0%) * 0.55),
    color-mix(in srgb, var(--bx-accent) 100%, white) var(--pct, 0%),
    rgba(255,255,255,.05) var(--pct, 0%) 100%);
  -webkit-mask: radial-gradient(circle, transparent 60%, #000 63%); mask: radial-gradient(circle, transparent 60%, #000 63%);
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--bx-accent) 85%, transparent)); }
/* Der Sog hinter dem Geschenk: ein weicher Wirbel, der langsam dreht. */
.bx-gco-portal .bx-gco-iconwrap::before { content:''; position:absolute; inset:14%; border-radius:50%;
  background: conic-gradient(from 0deg, transparent 0 18%, color-mix(in srgb, var(--bx-accent) 30%, transparent) 34%,
    transparent 52%, color-mix(in srgb, var(--bx-accent) 34%, transparent) 74%, transparent 92%);
  filter: blur(6px); animation: bx-gco-dreh 14s linear infinite; }
/* Zwei gestrichelte Bahnen, gegenläufig — die äußere langsam, die innere schnell. */
.bx-gco-portal .bx-gco-deko::before, .bx-gco-portal .bx-gco-deko::after { content:''; position:absolute; border-radius:50%;
  border: calc(var(--u) * 2) dashed color-mix(in srgb, var(--bx-accent) 55%, transparent); }
.bx-gco-portal .bx-gco-deko::before { inset: -9%; animation: bx-gco-dreh 22s linear infinite; }
/* Genau in den freien Streifen zwischen Geschenk (70 % der Fläche) und dem
   Fortschrittsring — bei 24 % lag sie hinter dem Geschenk und war unsichtbar. */
.bx-gco-portal .bx-gco-deko::after { inset: 11%; border-style: dotted; opacity:.75;
  animation: bx-gco-dreh 9s linear infinite reverse; }
@keyframes bx-gco-dreh { to { transform: rotate(360deg); } }
/* Die Schockwelle liegt auf dem Rahmen, NICHT auf der Deko-Bühne: eine
   Deckkraft von 0 dort hätte auch die beiden Bahnen darin unsichtbar gemacht
   (Deckkraft wirkt auf den ganzen Teilbaum, nicht nur auf das Element). */
.bx-gco-portal .bx-gco-iconwrap::after { content:''; position:absolute; inset:0; border-radius:50%;
  border: calc(var(--u) * 3) solid var(--bx-accent); opacity:0; }
.bx-gco-portal.hit .bx-gco-iconwrap::after { animation: bx-gco-welle 720ms cubic-bezier(.15,.7,.3,1); }
@keyframes bx-gco-welle {
  0% { opacity:.9; transform: scale(.82); }
  100% { opacity:0; transform: scale(1.75); } }
.bx-gco-portal.done .bx-gco-deko::before { animation-duration: 6s; }
.bx-gco-portal.done .bx-gco-deko::after { animation-duration: 2.6s; }
.bx-gco-portal .bx-gco-prog { color: color-mix(in srgb, var(--bx-accent) 25%, white);
  text-shadow: 0 0 .5em color-mix(in srgb, var(--bx-accent) 70%, transparent); }

/* ── Stil „Rakete" — senkrechte Startbahn statt Ring: das Geschenk steigt mit
   dem Fortschritt zum Ziel hoch. Damit sieht man „wie weit noch" ohne eine
   einzige Zahl zu lesen, und ein Geschenk bewegt sichtbar etwas.
   Der Weg ist in --u gerechnet (nicht in Prozent): Prozente in translate()
   beziehen sich auf die GRÖSSE DES GESCHENKS, nicht auf die Bahn — damit wäre
   der Weg von der Bildgröße abhängig statt von der Bahnlänge. */
.bx-gco-rakete .bx-gco-iconwrap { width: clamp(30px, calc(var(--u) * 96), 380px);
  height: clamp(60px, calc(var(--u) * 250), 980px); border-radius: 999px;
  background: linear-gradient(180deg, rgba(6,8,20,.85), rgba(10,12,28,.6));
  box-shadow: inset 0 0 0 calc(var(--u) * 2) rgba(255,255,255,.09); overflow: hidden; }
/* Sternenfeld, das nach unten zieht — zwei Kopien untereinander, damit die
   Schleife ohne Sprung durchläuft. */
.bx-gco-rakete .bx-gco-iconwrap::before { content:''; position:absolute; left:0; right:0; top:-100%; height:200%;
  background:
    radial-gradient(1.5px 1.5px at 20% 8%, rgba(255,255,255,.75), transparent),
    radial-gradient(1.5px 1.5px at 72% 22%, rgba(255,255,255,.55), transparent),
    radial-gradient(1.5px 1.5px at 38% 41%, rgba(255,255,255,.7), transparent),
    radial-gradient(1.5px 1.5px at 84% 63%, rgba(255,255,255,.5), transparent),
    radial-gradient(1.5px 1.5px at 12% 79%, rgba(255,255,255,.65), transparent);
  background-size: 100% 50%; animation: bx-gco-sterne 9s linear infinite; }
@keyframes bx-gco-sterne { to { transform: translateY(50%); } }
/* Zurückgelegter Weg als schmale Leuchtspur in der Bahnmitte. Als BREITE
   Füllung sah die Bahn aus wie ein Tank — die Rakete soll aber fliegen, nicht
   schwimmen. */
.bx-gco-rakete .bx-gco-ring { -webkit-mask:none; mask:none; border-radius:999px;
  inset: 0 auto 0 50%; width: calc(var(--u) * 5); transform: translateX(-50%);
  background: linear-gradient(to top, color-mix(in srgb, var(--bx-accent) 85%, transparent) 0%,
    color-mix(in srgb, var(--bx-accent) 45%, transparent) calc(var(--pct, 0%) - 8%),
    color-mix(in srgb, white 60%, var(--bx-accent)) var(--pct, 0%),
    rgba(255,255,255,.07) var(--pct, 0%), rgba(255,255,255,.07) 100%);
  animation: none; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--bx-accent) 70%, transparent)); }
/* Das Ziel oben in der Bahn — blinkt erst, wenn es erreicht ist. */
.bx-gco-rakete .bx-gco-deko { top: calc(var(--u) * 10); bottom: auto; left: 16%; right: 16%; height: 0;
  border-top: calc(var(--u) * 3) dashed var(--bx-teal);
  filter: drop-shadow(0 0 calc(var(--u) * 6) color-mix(in srgb, var(--bx-teal) 80%, transparent)); }
.bx-gco-rakete.done .bx-gco-deko { animation: bx-gco-blink 900ms steps(1) infinite; }
/* Die Rakete selbst: sitzt unten und wird um den Fortschritt nach oben
   geschoben. Die Fahrt ist weich, damit ein Geschenk als Aufstieg zu sehen ist. */
.bx-gco-rakete .bx-gco-icon { position:absolute; left:50%; bottom: calc(var(--u) * 12);
  width: clamp(24px, calc(var(--u) * 74), 300px); height: clamp(24px, calc(var(--u) * 74), 300px);
  transform: translateX(-50%) translateY(calc(var(--u) * -196 * var(--pctn, 0)));
  transition: transform 900ms cubic-bezier(.2,.9,.25,1); animation: none; }
/* Antrieb: flackert immer, beim Eingang kurz kräftig. */
.bx-gco-rakete .bx-gco-icon::after { content:''; position:absolute; left:50%; top:90%;
  width: 36%; height: 40%; transform: translateX(-50%); transform-origin: 50% 0%;
  border-radius: 50% 50% 50% 50% / 30% 30% 100% 100%;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bx-accent) 90%, white), color-mix(in srgb, var(--bx-accent) 60%, transparent) 60%, transparent);
  filter: blur(1.5px); animation: bx-gco-schub 260ms ease-in-out infinite alternate; }
@keyframes bx-gco-schub { from { transform: translateX(-50%) scaleY(.75); opacity:.75; } to { transform: translateX(-50%) scaleY(1.15); opacity:1; } }
.bx-gco-rakete.hit .bx-gco-icon::after { animation: bx-gco-zuendung 620ms ease-out; }
@keyframes bx-gco-zuendung {
  0% { transform: translateX(-50%) scaleY(1); opacity:1; }
  30% { transform: translateX(-50%) scaleY(2.4); opacity:1; }
  100% { transform: translateX(-50%) scaleY(1); opacity:.85; } }

/* ── Stil „Hologramm" — das Geschenk als Projektion über einem Sockel:
   Lichtkegel, hochlaufende Scanlinien, ein Hauch Farbversatz an den Kanten und
   ein unregelmäßiges Flackern. Der Sockel IST der Fortschritt (eine flache
   Scheibe, die sich füllt) — deshalb liegt er hier statt des Rings. */
.bx-gco-hologramm { background:none !important; box-shadow:none !important; }
.bx-gco-hologramm .bx-gco-icon {
  filter: drop-shadow(calc(var(--u) * -2) 0 0 rgba(255,45,110,.5))
          drop-shadow(calc(var(--u) * 2) 0 0 rgba(0,225,255,.5))
          drop-shadow(0 0 calc(var(--u) * 12) color-mix(in srgb, var(--bx-accent) 75%, transparent));
  animation: bx-gco-schweben 6s ease-in-out infinite, bx-gco-flacker 5.5s steps(1) infinite; }
@keyframes bx-gco-schweben { 0%,100% { transform: translateY(calc(var(--u) * -3)); } 50% { transform: translateY(calc(var(--u) * 3)); } }
/* Unregelmäßig — ein gleichmäßiges Blinken sieht nach Defekt aus, ein
   ungleichmäßiges nach Projektion. */
@keyframes bx-gco-flacker {
  0%,7%,9%,44%,46%,100% { opacity:1; }
  8%,45% { opacity:.55; }
  71% { opacity:.82; } }
/* Scanlinien laufen nach oben durchs Bild. */
/* Die Linien laufen zu den Rändern hin aus — ohne die Maske stand da ein
   sichtbares Rechteck aus Streifen statt einer Projektion. */
.bx-gco-hologramm .bx-gco-deko::before { content:''; position:absolute; inset:-8%;
  background: repeating-linear-gradient(0deg, color-mix(in srgb, var(--bx-accent) 26%, transparent) 0 1px, transparent 1px 5px);
  -webkit-mask: radial-gradient(58% 58% at 50% 46%, #000 35%, transparent 80%);
  mask: radial-gradient(58% 58% at 50% 46%, #000 35%, transparent 80%);
  animation: bx-gco-scan 3.2s linear infinite; }
@keyframes bx-gco-scan { to { transform: translateY(-5px); } }
/* Lichtkegel vom Sockel nach oben. */
.bx-gco-hologramm .bx-gco-deko::after { content:''; position:absolute; left:50%; bottom:-2%;
  width:150%; height:112%; transform: translateX(-50%);
  clip-path: polygon(34% 0, 66% 0, 100% 100%, 0 100%);
  background: linear-gradient(to top, color-mix(in srgb, var(--bx-accent) 30%, transparent), transparent 78%);
  filter: blur(3px); }
/* Der Sockel: flache Scheibe, füllt sich mit dem Fortschritt. */
.bx-gco-hologramm .bx-gco-ring { -webkit-mask:none; mask:none;
  inset: auto 20% -5% 20%; height: 13%; border-radius: 50%;
  background: conic-gradient(from -90deg, color-mix(in srgb, var(--bx-accent) 95%, white) 0 var(--pct, 0%), rgba(255,255,255,.1) var(--pct, 0%) 100%);
  box-shadow: 0 0 calc(var(--u) * 26) color-mix(in srgb, var(--bx-accent) 60%, transparent);
  animation: bx-gco-sockel 4.5s ease-in-out infinite; }
@keyframes bx-gco-sockel { 0%,100% { transform: scale(1); opacity:.9; } 50% { transform: scale(1.06); opacity:1; } }
.bx-gco-hologramm.done .bx-gco-ring { background: conic-gradient(from -90deg, var(--bx-teal), color-mix(in srgb, var(--bx-teal) 50%, white), var(--bx-teal)); }
.bx-gco-hologramm .bx-gco-title, .bx-gco-hologramm .bx-gco-prog {
  color: color-mix(in srgb, var(--bx-accent) 22%, white);
  text-shadow: calc(var(--u) * -1) 0 0 rgba(255,45,110,.45), var(--u) 0 0 rgba(0,225,255,.45),
    0 0 calc(var(--u) * 10) color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-gco-hologramm.hit .bx-gco-icon { animation: bx-gco-schweben 6s ease-in-out infinite, bx-gco-stoerung 460ms steps(3); }
@keyframes bx-gco-stoerung {
  0% { filter: drop-shadow(calc(var(--u) * -9) 0 0 rgba(255,45,110,.8)) drop-shadow(calc(var(--u) * 9) 0 0 rgba(0,225,255,.8)); }
  100% { filter: drop-shadow(calc(var(--u) * -2) 0 0 rgba(255,45,110,.5)) drop-shadow(calc(var(--u) * 2) 0 0 rgba(0,225,255,.5)); } }

/* ── Stil „Studio" — das Geschenk als Ausstellungsstück ────────────────────
   Der Anspruch: nicht noch ein Rahmen um ein flaches Bild, sondern das
   Geschenk selbst in Szene gesetzt — wie ein Produktfoto.

   Vier Handgriffe, die aus einem Aufkleber einen Gegenstand machen:
   1. KÖRPER: dasselbe Bild zwölfmal übereinander, jede Kopie ein Stück weiter
      hinten (translateZ) und dunkler. Der Stapel wiegt sich langsam; an den
      Rändern sieht man dabei die Tiefe. (Aufbau: studioSchichten())
   2. GLANZ: ein Lichtstreif, der über das Bild wandert — aber MASKIERT mit der
      Form des Bildes, läuft also nur über das Geschenk, nicht über ein
      Rechteck. Das ist der Unterschied zwischen „glänzt" und „hat ein
      Glanz-Rechteck drüber".
   3. BODEN: Kontaktschatten und eine gespiegelte, ausblendende Kopie darunter —
      erst dadurch STEHT etwas, statt zu schweben.
   4. LICHT: eine Studio-Rundung im Hintergrund mit Licht von oben links, dazu
      Randabdunklung. Nichts davon ist ein gerendertes Bild: alles rechnet sich
      aus der Boxgröße und der Akzentfarbe des Nutzers, skaliert also beliebig
      und passt sich seiner Farbe an. */
.bx-gco-studio {
  background:
    radial-gradient(120% 78% at 28% 6%, rgba(255,255,255,.13), transparent 55%),
    radial-gradient(90% 60% at 50% 108%, color-mix(in srgb, var(--bx-accent) 16%, transparent), transparent 70%),
    linear-gradient(178deg, #1b1e2b 0%, #101220 46%, #07080f 100%) !important;
  border-radius: calc(var(--u) * 18);
  box-shadow: inset 0 0 calc(var(--u) * 90) rgba(0,0,0,.6), 0 calc(var(--u) * 10) calc(var(--u) * 30) rgba(0,0,0,.45) !important;
  overflow: hidden; }
/* Die Bodenebene: eine Kante, ab der der Hintergrund heller in den Boden
   übergeht — genau das macht aus einer dunklen Fläche eine Studio-Rundung, in
   der ein Gegenstand STEHT statt vor einer Wand zu hängen. */
.bx-gco-studio::before { content:''; position:absolute; inset:0; pointer-events:none;
  /* WEICH ansetzen: mit einer Farbe direkt an der Oberkante entstand quer über
     die Karte eine sichtbare Kante — das sah nach Fehler aus, nicht nach Boden. */
  background:
    linear-gradient(180deg, transparent 34%, color-mix(in srgb, var(--bx-accent) 10%, transparent) 56%, transparent 88%),
    radial-gradient(150% 60% at 50% 58%, rgba(255,255,255,.06), transparent 70%); }
/* Randabdunklung — der Blick bleibt in der Mitte. */
.bx-gco-studio::after { content:''; position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(78% 62% at 50% 44%, transparent 55%, rgba(0,0,0,.5) 100%); }
/* Das Geschenk ist der Hauptdarsteller: die Bühne ist größer als beim Standard
   und in zwei Zonen geteilt — oben der Gegenstand, unten der Boden mit Ring,
   Kontaktschatten und Spiegelung. Vorher lagen alle drei ÜBER dem Bild. */
.bx-gco-koerper-buehne .bx-gco-iconwrap { margin-bottom: calc(var(--u) * 10);
  width: clamp(50px, calc(var(--u) * 190), 740px); height: clamp(50px, calc(var(--u) * 190), 740px); }
.bx-gco-koerper-buehne .bx-gco-icon { position:absolute; left:9%; right:9%; top:1%; bottom:34%;
  width:auto; height:auto; }

/* Der Fortschritt liegt als eingelassener Ring IM BODEN, nicht um das Bild —
   sonst kämpft er mit dem Körper um dieselbe Kontur. */
.bx-gco-studio .bx-gco-ring {
  inset: 58% 8% auto 8%; height: 22%; border-radius: 50%;
  -webkit-mask: radial-gradient(closest-side, transparent 78%, #000 82%, #000 96%, transparent 100%);
  mask: radial-gradient(closest-side, transparent 78%, #000 82%, #000 96%, transparent 100%);
  background: conic-gradient(from -90deg,
    color-mix(in srgb, var(--bx-accent) 90%, white) 0 var(--pct, 0%),
    rgba(255,255,255,.13) var(--pct, 0%) 100%);
  filter: drop-shadow(0 0 calc(var(--u) * 7) color-mix(in srgb, var(--bx-accent) 45%, transparent)); }
.bx-gco-studio.done .bx-gco-ring { background: conic-gradient(from -90deg, var(--bx-teal), color-mix(in srgb, var(--bx-teal) 45%, white), var(--bx-teal));
  animation: bx-gco-dreh 5s linear infinite; }
/* Kontaktschatten: schmal und dunkel direkt unter dem Geschenk. Ohne ihn
   schwebt alles, egal wie gut der Rest ist. */
.bx-gco-studio .bx-gco-deko { inset: 62% 33% auto 33%; height: 8%; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0,0,0,.75), transparent 78%);
  filter: blur(calc(var(--u) * 3)); }

.bx-gco-koerper-buehne .bx-gco-icon { perspective: calc(var(--u) * 620); animation: none; overflow: visible; }
/* Der Körper wiegt sich — langsam und in beide Richtungen ungleich, damit es
   nicht wie ein Metronom aussieht. */
.bx-gco-koerper { position:absolute; inset:0; transform-style: preserve-3d;
  animation: bx-gco-wiegen 11s cubic-bezier(.45,0,.55,1) infinite; }
@keyframes bx-gco-wiegen {
  0%   { transform: rotateY(-17deg) rotateX(5deg)  translateY(calc(var(--u) * 2)); }
  50%  { transform: rotateY(15deg)  rotateX(-3deg) translateY(calc(var(--u) * -3)); }
  100% { transform: rotateY(-17deg) rotateX(5deg)  translateY(calc(var(--u) * 2)); } }
/* GEWICHT: Die Grundregel .bx-gco-icon img setzt Schatten und Akzent-Schein auf
   JEDES Bild darin — und ist gewichtiger als eine reine Klassen-Regel. Ohne das
   vorangestellte img bekamen alle zwölf Kopien denselben Schein statt der Abstufung:
   zwölf Scheine übereinander ergaben einen gelben Nebel, in dem von der Tiefe
   nichts mehr zu sehen war. */
.bx-gco-icon img.bx-gco-schicht { position:absolute; inset:0; width:100%; height:100%; object-fit:contain;
  /* Tiefe UND Versatz. Nur translateZ reichte nicht: nach hinten geschobene
     Kopien werden durch die Perspektive kleiner und verschwinden dadurch genau
     hinter der vordersten — man sah nichts. Der schräge Versatz nach unten
     rechts (weg vom Licht oben links) macht den Körper auch frontal sichtbar,
     das translateZ sorgt dafür, dass er sich beim Wiegen richtig verschiebt. */
  transform: translate3d(calc(var(--u) * 0.85 * var(--i)), calc(var(--u) * 0.9 * var(--i)), calc(var(--u) * -2.2 * var(--i)));
  /* Nach hinten dunkler UND leicht in die Akzentfarbe gezogen: ein reiner
     Schwarzverlauf sieht aus wie Schmutz, ein farbiger wie Material im Licht. */
  filter: brightness(calc(1 - 0.115 * var(--i))) saturate(calc(1 - 0.045 * var(--i))); }
/* Die vorderste Kopie trägt das Licht: heller Kern, farbiger Konturschein. */
/* Die vorderste Kopie trägt das Licht: eine schmale helle Kante oben links
   (Lichtquelle) und nur ein KNAPPER farbiger Schein. Ein weicher, großer Schein
   legte sich vorher über den ganzen Körper und machte die Tiefe zunichte. */
.bx-gco-icon img.bx-gco-schicht[style*='--i:0'] { filter:
          drop-shadow(calc(var(--u) * -1) calc(var(--u) * -1) 0 rgba(255,255,255,.45))
          drop-shadow(0 0 calc(var(--u) * 3) color-mix(in srgb, var(--bx-accent) 45%, transparent)); }
/* Der wandernde Lichtstreif — in der FORM des Geschenks, nicht als Rechteck. */
.bx-gco-glanz { position:absolute; inset:0; pointer-events:none; overflow:hidden;
  -webkit-mask-image: var(--bx-gco-bild); mask-image: var(--bx-gco-bild);
  -webkit-mask-size: contain; mask-size: contain;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  transform: translateZ(calc(var(--u) * 1)); }
.bx-gco-glanz::after { content:''; position:absolute; top:-60%; bottom:-60%; left:-40%; width:32%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent);
  transform: rotate(18deg) translateX(0); animation: bx-gco-streif 5.5s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes bx-gco-streif {
  0%, 62% { transform: rotate(18deg) translateX(0); opacity:0; }
  66% { opacity:.95; }
  100% { transform: rotate(18deg) translateX(460%); opacity:0; } }
/* Spiegelung auf dem Boden: gekippt, ausblendend, weich. */
.bx-gco-spiegel { position:absolute; left:0; right:0; top:100%; height:58%; pointer-events:none;
  transform: scaleY(-1); opacity:.3;
  -webkit-mask: linear-gradient(to top, transparent 8%, #000 92%); mask: linear-gradient(to top, transparent 8%, #000 92%); }
.bx-gco-icon .bx-gco-spiegel img { width:100%; height:100%; object-fit:contain; object-position: top center;
  filter: blur(calc(var(--u) * 1.4)) saturate(.8); }
/* Ein Geschenk: der Gegenstand springt kurz an und der Lichtstreif feuert sofort. */
.bx-gco-koerper-buehne.hit .bx-gco-koerper { animation: bx-gco-sprung 780ms cubic-bezier(.2,1.5,.3,1); }
@keyframes bx-gco-sprung {
  0% { transform: rotateY(-17deg) rotateX(5deg) scale(1); }
  30% { transform: rotateY(6deg) rotateX(-8deg) scale(1.14) translateY(calc(var(--u) * -10)); }
  100% { transform: rotateY(-17deg) rotateX(5deg) scale(1); } }
.bx-gco-koerper-buehne.hit .bx-gco-glanz::after { animation: bx-gco-streif 780ms cubic-bezier(.4,0,.2,1); }
/* Schrift: ruhig und hell, das Licht liegt auf dem Gegenstand — nicht auf dem Text. */
.bx-gco-studio .bx-gco-title { color: rgba(255,255,255,.72); letter-spacing: .18em;
  -webkit-text-stroke: 0; text-shadow: 0 calc(var(--u) * 2) calc(var(--u) * 6) rgba(0,0,0,.8);
  font-size: clamp(9px, calc(var(--u) * 15), 58px); }
.bx-gco-studio .bx-gco-prog { color: #fff; -webkit-text-stroke: 0;
  text-shadow: 0 0 calc(var(--u) * 18) color-mix(in srgb, var(--bx-accent) 75%, transparent), 0 calc(var(--u) * 2) calc(var(--u) * 5) rgba(0,0,0,.9); }
/* Die Basis lässt Bilder in .bx-gco-icon langsam atmen — hier würde das den
   Körper gegen sein eigenes Wiegen arbeiten lassen. */
.bx-premium .bx-gco-koerper-buehne .bx-gco-icon > * { animation-name: bx-gco-wiegen; }
.bx-premium .bx-gco-koerper-buehne img.bx-gco-schicht, .bx-premium .bx-gco-koerper-buehne .bx-gco-spiegel img { animation: none; }

/* ── Stil „Vitrine" — dasselbe Ausstellungsstück, aber unter Glas.
   Der Unterschied zum Studio ist nicht Deko: eine Glasscheibe hat eine EIGENE
   Spiegelung, die NICHT der Form des Geschenks folgt, sondern der Scheibe. Erst
   dieser Widerspruch — scharfes Objekt, darüber eine flache Reflexion — liest
   sich als „hinter Glas". */
.bx-gco-vitrine {
  background:
    radial-gradient(110% 70% at 30% 4%, rgba(255,255,255,.10), transparent 52%),
    linear-gradient(180deg, #171a26 0%, #0d0f1a 58%, #060710 100%) !important;
  border-radius: calc(var(--u) * 10);
  box-shadow: inset 0 0 0 calc(var(--u) * 2) rgba(255,255,255,.10),
    inset 0 0 calc(var(--u) * 70) rgba(0,0,0,.65),
    0 calc(var(--u) * 12) calc(var(--u) * 34) rgba(0,0,0,.5) !important;
  overflow: hidden; }
/* Dunkler Innenraum nach unten hin — die Haube steht in etwas, nicht auf nichts. */
.bx-gco-vitrine::before { content:''; position:absolute; left:0; right:0; bottom:0; height:44%; pointer-events:none;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,.6) 70%); }
/* Die Sockelplatte, auf der das Stück steht — direkt am Objekt, nicht am
   Kartenrand. Sonst schwebt die Leuchtleiste irgendwo im Nichts. */
.bx-gco-vitrine .bx-gco-iconwrap::after { content:''; position:absolute; inset: 66% 4% auto 4%; height: 13%;
  border-radius: calc(var(--u) * 4);
  background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.03) 22%, rgba(0,0,0,.55));
  box-shadow: 0 calc(var(--u) * 6) calc(var(--u) * 16) rgba(0,0,0,.6); }
/* Die Scheibe: ein breiter, flacher Lichtstreif über ALLES, plus Kantenlicht.
   Bewusst schräg und weich — eine harte Kante sähe nach Aufkleber aus. */
.bx-gco-vitrine::after { content:''; position:absolute; inset:0; pointer-events:none;
  background: linear-gradient(114deg, rgba(255,255,255,.14) 0 16%, transparent 34%, transparent 62%, rgba(255,255,255,.07) 74%, transparent 88%),
    radial-gradient(80% 66% at 50% 46%, transparent 58%, rgba(0,0,0,.45) 100%); }
.bx-gco-vitrine .bx-gco-iconwrap { margin-bottom: calc(var(--u) * 14); }
/* Der Fortschritt läuft als Leuchtleiste IM SOCKEL — waagerecht, weil ein Ring
   unter Glas mit den Scheibenreflexen kollidiert. */
.bx-gco-vitrine .bx-gco-ring { inset: 71% 12% auto 12%; height: calc(var(--u) * 6); border-radius: 999px;
  -webkit-mask:none; mask:none;
  background: linear-gradient(90deg, color-mix(in srgb, var(--bx-accent) 95%, white) 0 var(--pct, 0%), rgba(255,255,255,.10) var(--pct, 0%) 100%);
  filter: drop-shadow(0 0 calc(var(--u) * 9) color-mix(in srgb, var(--bx-accent) 70%, transparent)); }
.bx-gco-vitrine.done .bx-gco-ring { background: linear-gradient(90deg, var(--bx-teal), color-mix(in srgb, var(--bx-teal) 50%, white)); }
.bx-gco-vitrine .bx-gco-deko { inset: 61% 26% auto 26%; height: 7%; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0,0,0,.8), transparent 78%); filter: blur(calc(var(--u) * 3)); }
.bx-gco-vitrine .bx-gco-title { color: rgba(255,255,255,.6); letter-spacing:.2em; -webkit-text-stroke:0;
  font-size: clamp(9px, calc(var(--u) * 14), 54px); }
.bx-gco-vitrine .bx-gco-prog { color:#fff; -webkit-text-stroke:0;
  text-shadow: 0 0 calc(var(--u) * 16) color-mix(in srgb, var(--bx-accent) 70%, transparent); }

/* ── Stil „Museum" — dunkler Raum, EIN Scheinwerfer.
   Hier macht nicht das Objekt die Bühne, sondern das Licht: ein sichtbarer
   Lichtkegel von oben, eine harte Lichtinsel auf dem Boden und ringsum
   Dunkelheit. Das Geschenk steht in der Insel, alles andere verschwindet. */
.bx-gco-museum {
  background: radial-gradient(70% 46% at 50% 78%, rgba(255,255,255,.05), transparent 72%),
    linear-gradient(180deg, #0a0b12 0%, #05060b 100%) !important;
  border-radius: calc(var(--u) * 12);
  box-shadow: inset 0 0 calc(var(--u) * 80) rgba(0,0,0,.9) !important; overflow: hidden; }
/* Der Kegel. Nach unten breiter, nach unten heller — und mit weicher Kante,
   sonst ist es ein Dreieck statt Licht. */
.bx-gco-museum .bx-gco-deko { inset: -20% -6% auto -6%; height: 96%; border:0; border-radius:0;
  clip-path: polygon(41% 0, 59% 0, 92% 100%, 8% 100%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--bx-accent) 26%, transparent), color-mix(in srgb, var(--bx-accent) 7%, transparent) 62%, transparent);
  filter: blur(calc(var(--u) * 5)); }
/* Staub im Strahl — zwei Ebenen, die langsam gegeneinander wandern. */
.bx-gco-museum .bx-gco-deko::after { content:''; position:absolute; inset:0;
  background:
    radial-gradient(1.6px 1.6px at 46% 22%, rgba(255,255,255,.6), transparent),
    radial-gradient(1.4px 1.4px at 57% 44%, rgba(255,255,255,.45), transparent),
    radial-gradient(1.6px 1.6px at 40% 63%, rgba(255,255,255,.5), transparent),
    radial-gradient(1.4px 1.4px at 63% 78%, rgba(255,255,255,.4), transparent);
  animation: bx-gco-staub 13s linear infinite; }
@keyframes bx-gco-staub { 0% { transform: translateY(-6%); } 100% { transform: translateY(6%); } }
/* Die Lichtinsel: gleichmäßig hell, damit sie wie Licht aussieht. Ein von
   links gefüllter Verlauf sah aus, als stünde der Scheinwerfer schief. */
.bx-gco-museum .bx-gco-iconwrap::after { content:''; position:absolute; inset: 56% 10% auto 10%; height: 28%;
  border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--bx-accent) 62%, white), color-mix(in srgb, var(--bx-accent) 30%, transparent) 58%, transparent 82%);
  filter: blur(calc(var(--u) * 3)); }
/* Der Fortschritt läuft als schmaler Bogen um die Lichtinsel — er teilt sich
   die Fläche mit ihr, kämpft aber nicht um dieselbe Helligkeit. */
.bx-gco-museum .bx-gco-ring { inset: 53% 6% auto 6%; height: 34%; border-radius: 50%;
  -webkit-mask: radial-gradient(closest-side, transparent 80%, #000 84%, #000 96%, transparent 100%);
  mask: radial-gradient(closest-side, transparent 80%, #000 84%, #000 96%, transparent 100%);
  background: conic-gradient(from -90deg, color-mix(in srgb, var(--bx-accent) 40%, white) 0 var(--pct, 0%), rgba(255,255,255,.10) var(--pct, 0%) 100%);
  filter: drop-shadow(0 0 calc(var(--u) * 6) color-mix(in srgb, var(--bx-accent) 55%, transparent)); }
.bx-gco-museum.done .bx-gco-ring { background: conic-gradient(from -90deg, var(--bx-teal), color-mix(in srgb, var(--bx-teal) 45%, white), var(--bx-teal)); }
.bx-gco-museum .bx-gco-title { color: color-mix(in srgb, var(--bx-accent) 20%, white); letter-spacing:.22em; -webkit-text-stroke:0;
  font-size: clamp(9px, calc(var(--u) * 14), 54px); opacity:.8; }
.bx-gco-museum .bx-gco-prog { color:#fff; -webkit-text-stroke:0;
  text-shadow: 0 0 calc(var(--u) * 20) color-mix(in srgb, var(--bx-accent) 80%, transparent); }
/* Im Scheinwerfer gibt es keine Bodenspiegelung — der Boden ist matt. */
.bx-gco-museum .bx-gco-spiegel { opacity:.12; }

/* ── „Rahmen ausblenden" für die aufwendigen Stile ─────────────────────────
   Der Kasten ist bei Studio, Vitrine und Museum Teil der Inszenierung — aber im
   Overlay ist oft schlicht kein Platz dafür, und der Streamer will das Geschenk
   frei auf seinem Videobild stehen haben.

   Der Haken „Rahmen ausblenden" nimmt deshalb NUR die Fläche weg. Alles, was den
   Gegenstand ausmacht, bleibt: Tiefe, Standlicht, Kontaktschatten, Spiegelung,
   Fortschritt — beim Museum sogar der Lichtkegel, der über dem Videobild sogar
   besser wirkt als im schwarzen Kasten.

   FALLE (siehe AGENTS.md): Die Grundregel .bx-frameless * setzt JEDEN Rand
   auf durchsichtig. Ränder, die hier eine FORM tragen statt einen Rahmen zu
   ziehen — die Bahnen des Portals, das Gehäuse des Automaten, die Ziellinie der
   Rakete — müssen sich ihre Farbe zurückholen. */
html .bx-frameless .bx-gco-studio,
html .bx-frameless .bx-gco-vitrine,
html .bx-frameless .bx-gco-museum,
html .bx-frameless .bx-gco-arcade,
html .bx-frameless .bx-gco-medaille {
  background: none !important; box-shadow: none !important;
  -webkit-backdrop-filter: none; backdrop-filter: none; }
/* Randabdunklung, Studio-Rundung, Glasscheibe und Sockelwanne gehören zur
   Fläche und verschwinden mit ihr. */
html .bx-frameless .bx-gco-studio::before, html .bx-frameless .bx-gco-studio::after,
html .bx-frameless .bx-gco-vitrine::before, html .bx-frameless .bx-gco-vitrine::after,
html .bx-frameless .bx-gco-arcade::after { display: none; }
/* Ohne Fläche steht der Text direkt auf dem Videobild — dort braucht er wieder
   eine Kontur, sonst verschwindet er auf hellen Szenen. */
html .bx-frameless .bx-gco-studio .bx-gco-title, html .bx-frameless .bx-gco-vitrine .bx-gco-title,
html .bx-frameless .bx-gco-museum .bx-gco-title, html .bx-frameless .bx-gco-studio .bx-gco-prog,
html .bx-frameless .bx-gco-vitrine .bx-gco-prog, html .bx-frameless .bx-gco-museum .bx-gco-prog {
  -webkit-text-stroke: calc(var(--u) * 2.5) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 calc(var(--u) * 3) calc(var(--u) * 8) rgba(0,0,0,.75); }
/* Der Museums-Kegel ohne schwarzen Raum: kräftiger, sonst geht er im Videobild
   unter. Die Sockelplatte der Vitrine bleibt — sie ist der Boden, nicht der Kasten. */
html .bx-frameless .bx-gco-museum .bx-gco-deko { filter: blur(calc(var(--u) * 4)); opacity: .85; }
/* Die Sockelplatte der Vitrine bleibt (der Boden gehört zum Gegenstand), wird
   aber schmaler und durchsichtiger — als volle graue Platte sähe sie aus wie
   ein vergessener Rest des Kastens. */
html .bx-frameless .bx-gco-vitrine .bx-gco-iconwrap::after { inset: 68% 16% auto 16%; height: 8%;
  background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(0,0,0,.35));
  box-shadow: 0 calc(var(--u) * 5) calc(var(--u) * 14) rgba(0,0,0,.5); }
/* Formtragende Ränder zurückholen (siehe Falle oben). */
html .bx-frameless .bx-gco-portal .bx-gco-deko::before,
html .bx-frameless .bx-gco-portal .bx-gco-deko::after {
  border-color: color-mix(in srgb, var(--bx-accent) 55%, transparent) !important; }
html .bx-frameless .bx-gco-rakete .bx-gco-deko { border-top-color: var(--bx-teal) !important; }

/* ══ Drei ANDERE Anordnungen ═════════════════════════════════════════════
   Bis hierher war jeder Stil dasselbe Gerüst mit anderer Deko: Bild in der
   Mitte, Titel darunter, Zahl ganz unten. Das ist der Grund, warum sich zehn
   Stile trotzdem gleich anfühlen — die SILHOUETTE war immer dieselbe.

   Diese drei stellen die Teile anders auf. Möglich ist das ohne Änderung am
   Gerüst, weil die Wurzel ein Raster wird und jedem Kind eine Fläche zuweist:
   nebeneinander, übereinander oder gestapelt. Die Reihenfolge im Dokument
   bleibt, wie sie ist. */

/* ── Stil „Sammelkarte" — Hochformat wie eine Spielkarte: das Geschenk in
   einem gerahmten Fenster oben, darunter ein Namensschild, unten die Zahl auf
   einer Platte, ganz unten die Fortschrittsleiste im Kartenrand.
   Der Fortschrittsring liegt hier NICHT ums Bild: dafür wird der Bildrahmen zum
   Bezugspunkt (position:static), und der Ring kann sich an der ganzen KARTE
   ausrichten statt am Bild. */
.bx-gco-karte { justify-content: flex-start; gap: 0; padding: 5% 6% 7%;
  background: linear-gradient(168deg, #2a2115 0%, #14100a 42%, #0a0a0f 100%) !important;
  border-radius: calc(var(--u) * 14);
  box-shadow: inset 0 0 0 calc(var(--u) * 2) color-mix(in srgb, var(--bx-gold) 45%, transparent),
    0 calc(var(--u) * 10) calc(var(--u) * 26) rgba(0,0,0,.5) !important; }
/* Die Haarlinie innen — das, was eine Karte zur Karte macht. */
.bx-gco-karte .bx-gco-deko { inset: calc(var(--u) * 6); border-radius: calc(var(--u) * 9);
  border: 1px solid color-mix(in srgb, var(--bx-gold) 32%, transparent); }
/* Das Bildfenster. */
/* overflow:hidden ist hier nicht Kosmetik: Die Höhe des Fensters ist eine
   Prozentangabe, und ein Bild darin bekommt seine Höhe dann aus dem eigenen
   Seitenverhältnis statt aus dem Fenster — gemessen ragte der Löwe 62px unten
   heraus, quer über das Namensschild. Ein Bildfenster, das beschneidet, ist bei
   einer Karte ohnehin richtig. */
.bx-gco-karte .bx-gco-iconwrap { position: static; overflow: hidden;
  width: 100%; height: 60%; margin: 0 0 3.5% 0;
  border-radius: calc(var(--u) * 8);
  background: radial-gradient(80% 70% at 50% 22%, color-mix(in srgb, var(--bx-accent) 20%, transparent), rgba(0,0,0,.5) 72%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bx-gold) 30%, transparent), inset 0 0 calc(var(--u) * 30) rgba(0,0,0,.75); }
.bx-gco-karte .bx-gco-icon { width: 88%; height: 88%; }
/* Namensschild statt freistehender Überschrift. */
.bx-gco-karte .bx-gco-title { width: 100%; padding: 2.5% 4%; -webkit-text-stroke: 0;
  background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(0,0,0,.35));
  border-top: 1px solid color-mix(in srgb, var(--bx-gold) 40%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--bx-gold) 40%, transparent);
  color: color-mix(in srgb, var(--bx-gold) 30%, white); letter-spacing: .12em;
  font-size: clamp(9px, calc(var(--u) * 15), 58px); text-shadow: 0 calc(var(--u) * 2) calc(var(--u) * 4) rgba(0,0,0,.9); }
.bx-gco-karte .bx-gco-prog { margin: auto 0; -webkit-text-stroke: 0; color: var(--bx-gold);
  text-shadow: 0 0 calc(var(--u) * 16) color-mix(in srgb, var(--bx-gold) 60%, transparent); }
/* Fortschritt als Leiste im unteren Kartenrand. */
.bx-gco-karte .bx-gco-ring { inset: auto 9% 4% 9%; height: calc(var(--u) * 5); border-radius: 999px;
  -webkit-mask: none; mask: none;
  background: linear-gradient(90deg, color-mix(in srgb, var(--bx-gold) 92%, white) 0 var(--pct, 0%), rgba(255,255,255,.10) var(--pct, 0%) 100%);
  filter: drop-shadow(0 0 calc(var(--u) * 7) color-mix(in srgb, var(--bx-gold) 55%, transparent)); }
.bx-gco-karte.done .bx-gco-ring { background: linear-gradient(90deg, var(--bx-teal), color-mix(in srgb, var(--bx-teal) 45%, white)); animation: none; }
.bx-gco-karte.hit .bx-gco-iconwrap { animation: bx-gco-kartenpuls 620ms ease-out; }
@keyframes bx-gco-kartenpuls {
  0% { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bx-gold) 30%, transparent), inset 0 0 calc(var(--u) * 30) rgba(0,0,0,.75); }
  25% { box-shadow: inset 0 0 0 calc(var(--u) * 2) var(--bx-gold), inset 0 0 calc(var(--u) * 40) color-mix(in srgb, var(--bx-accent) 45%, transparent); }
  100% { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bx-gold) 30%, transparent), inset 0 0 calc(var(--u) * 30) rgba(0,0,0,.75); } }

/* ── Stil „Zeile" — quer statt hoch: Geschenk links, Text rechts. Für flache,
   breite Kästen (die Leiste unter dem Stream), wo eine gestapelte Anordnung
   nur zwei Zeilen Platz hätte und alles winzig würde. */
/* In einer flachen, breiten Box ist die kurze Seite die Höhe — die
   Grundformel (min aus Breite und Höhe) macht dort alles winzig. Eine Zeile
   soll sich aber an ihrer Höhe ausrichten, so wie eine Textzeile auch. */
/* Die Breite bleibt als Deckel drin: in einem hohen, schmalen Kasten wäre eine
   rein höhenbezogene Größe absurd (gemessen: das Geschenk dreimal so breit wie
   die Box). Der kleinere der beiden Werte gewinnt. */
.bx-gco-zeile { --u: calc(min(0.62cqh, 0.30cqi) * var(--bx-fs, 1));
  display: grid; grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas: 'bild titel' 'bild zahl'; align-items: center; justify-items: start;
  column-gap: 4%; row-gap: 0; padding: 0 5%; text-align: left; }
.bx-gco-zeile .bx-gco-iconwrap { grid-area: bild; margin: 0;
  width: clamp(30px, calc(var(--u) * 108), 420px); height: clamp(30px, calc(var(--u) * 108), 420px); }
.bx-gco-zeile .bx-gco-title { grid-area: titel; align-self: end; font-size: clamp(9px, calc(var(--u) * 16), 62px);
  letter-spacing: .1em; }
.bx-gco-zeile .bx-gco-prog { grid-area: zahl; align-self: start; line-height: 1; }

/* ── Stil „Zahl im Fokus" — die Zahl IST das Bild: riesig in der Mitte, das
   Geschenk sitzt als Marke davor, der Titel steht klein darunter. Alle drei
   liegen in DERSELBEN Rasterfläche, überlagern sich also. */
.bx-gco-fokus { display: grid; grid-template-areas: 'stapel'; place-items: center; }
.bx-gco-fokus > * { grid-area: stapel; }
.bx-gco-fokus .bx-gco-prog { font-size: clamp(26px, calc(var(--u) * 88), 340px); line-height: 1;
  letter-spacing: -.04em; opacity: .95;
  color: color-mix(in srgb, var(--bx-accent) 20%, white);
  -webkit-text-stroke: calc(var(--u) * 3) var(--bx-ink, #0a0b12);
  text-shadow: 0 0 calc(var(--u) * 26) color-mix(in srgb, var(--bx-accent) 55%, transparent); }
/* Die Marke sitzt AUF der Zahl, oben links versetzt — in der Ecke der Box
   wirkte sie wie ein zweites, unbeteiligtes Element. */
.bx-gco-fokus .bx-gco-iconwrap { margin: 0; align-self: center; justify-self: center;
  width: clamp(24px, calc(var(--u) * 96), 380px); height: clamp(24px, calc(var(--u) * 96), 380px);
  transform: translate(-52%, -58%); }
.bx-gco-fokus .bx-gco-title { align-self: end; justify-self: center;
  font-size: clamp(9px, calc(var(--u) * 14), 54px); letter-spacing: .16em;
  transform: translateY(-14%); }
.bx-gco-fokus .bx-gco-ring { filter: drop-shadow(0 0 calc(var(--u) * 8) color-mix(in srgb, var(--bx-accent) 70%, transparent)); }

/* ── Stil „Plakat" — Text ÜBER dem Geschenk statt darunter.
   Das Geschenk füllt die ganze Box, der Titel liegt als Band oben darauf, die
   Zahl unten. Wie ein Vorschaubild: kein Platz geht für Textzeilen verloren,
   das Geschenk wird so groß wie die Box hergibt.
   Damit Text auf einem BELIEBIGEN Geschenkbild lesbar bleibt, liegt unter
   beiden Bändern ein Verlauf ins Dunkle — eine Kontur allein reicht auf hellen
   Geschenken (Diamant, Schwan) nicht. */
.bx-gco-plakat { display: grid; grid-template-areas: 'stapel'; gap: 0; }
.bx-gco-plakat > * { grid-area: stapel; }
/* PFLICHT bei jeder überlagerten Anordnung: Das Geschenk-Element ist
   positioniert (position:relative in der Grundregel), die Textzeilen sind es
   nicht — und positionierte Elemente werden ÜBER unpositionierten gezeichnet,
   ganz gleich, wie sie im Dokument stehen. Ohne die zwei Zeilen hier lag der
   Text hinter dem Bild und war schlicht weg. In den gestapelten Anordnungen
   fällt das zum ersten Mal auf, weil sich dort überhaupt etwas überlappt. */
.bx-gco-plakat .bx-gco-title, .bx-gco-plakat .bx-gco-prog,
.bx-gco-davor .bx-gco-title, .bx-gco-davor .bx-gco-prog { position: relative; z-index: 1; }
/* Bei „Zahl im Fokus" ist es GENAU ANDERSHERUM gewollt: dort soll das Geschenk
   als Marke vor der Zahl sitzen. Deshalb bekommt der Titel dort die Ebene, die
   Zahl aber nicht. */
.bx-gco-fokus .bx-gco-title { position: relative; z-index: 1; }
.bx-gco-plakat .bx-gco-iconwrap { width: 100%; height: 100%; margin: 0; }
.bx-gco-plakat .bx-gco-icon { width: 94%; height: 94%; }
.bx-gco-plakat .bx-gco-title { align-self: start; justify-self: stretch; text-align: center;
  padding: 4% 5% 9%; background: linear-gradient(180deg, rgba(0,0,0,.75), rgba(0,0,0,.35) 55%, transparent);
  font-size: clamp(10px, calc(var(--u) * 18), 70px); }
.bx-gco-plakat .bx-gco-prog { align-self: end; justify-self: stretch; text-align: center;
  padding: 9% 5% 5%; background: linear-gradient(0deg, rgba(0,0,0,.8), rgba(0,0,0,.35) 55%, transparent); }
/* Fortschritt als schmale Leiste ganz unten am Bildrand. z-index, weil sie
   sonst unter dem Verlauf der Zahl liegt und ausgegraut wirkt. */
.bx-gco-plakat .bx-gco-ring { inset: auto 0 0 0; height: calc(var(--u) * 5); border-radius: 0; z-index: 2;
  -webkit-mask: none; mask: none;
  background: linear-gradient(90deg, color-mix(in srgb, var(--bx-accent) 95%, white) 0 var(--pct, 0%), rgba(255,255,255,.14) var(--pct, 0%) 100%);
  filter: drop-shadow(0 0 calc(var(--u) * 6) color-mix(in srgb, var(--bx-accent) 60%, transparent)); }
.bx-gco-plakat.done .bx-gco-ring { background: linear-gradient(90deg, var(--bx-teal), color-mix(in srgb, var(--bx-teal) 45%, white)); animation: none; }

/* ── Stil „Davor" — die Zahl steht VOR dem Geschenk.
   Das Geschenk ist groß und dahinter, die Zahl liegt mitten darauf. Der Trick
   ist der abgedunkelte Fleck unter der Zahl: ohne ihn kämpfen Ziffern und
   Geschenkbild um dieselbe Fläche und beide verlieren. */
.bx-gco-davor { display: grid; grid-template-areas: 'stapel'; place-items: center; gap: 0; }
.bx-gco-davor > * { grid-area: stapel; }
.bx-gco-davor .bx-gco-iconwrap { width: 96%; height: 96%; margin: 0; }
.bx-gco-davor .bx-gco-icon { width: 92%; height: 92%; }
/* Der Fortschritt rahmt hier nur — ein dicker Reifen um ein großes Geschenk
   erschlägt beides. */
.bx-gco-davor .bx-gco-ring {
  -webkit-mask: radial-gradient(circle, transparent 66%, #000 68%); mask: radial-gradient(circle, transparent 66%, #000 68%); }
.bx-gco-davor .bx-gco-iconwrap::after { content: ''; position: absolute; inset: 12%;
  background: radial-gradient(closest-side, rgba(0,0,0,.62), rgba(0,0,0,.28) 55%, transparent 78%); }
.bx-gco-davor .bx-gco-prog { align-self: center; font-size: clamp(24px, calc(var(--u) * 62), 240px);
  line-height: 1; letter-spacing: -.02em; color: #fff;
  -webkit-text-stroke: calc(var(--u) * 4) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 0 calc(var(--u) * 22) color-mix(in srgb, var(--bx-accent) 70%, transparent); }
.bx-gco-davor .bx-gco-title { align-self: start; transform: translateY(48%);
  font-size: clamp(10px, calc(var(--u) * 17), 66px); }

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

/** Wie viele Kopien den Körper im Stil „Studio" bilden. Mehr = glatter, aber
 *  jede ist ein weiteres Bild im Baum; ab etwa 14 sieht man keinen Unterschied
 *  mehr. */
const STUDIO_TIEFE = 12;

/** Stile, die aus dem flachen Geschenkbild einen Körper bauen (studioSchichten).
 *  Der Aufbau ist bei allen derselbe — es unterscheidet sich nur, WORIN der
 *  Gegenstand steht: freie Studio-Rundung, Glaskasten oder Scheinwerferkegel. */
const STILE_MIT_KOERPER = new Set(['studio', 'vitrine', 'museum']);

/**
 * Das Gerüst für den Stil „Studio": aus EINEM flachen Bild einen Körper bauen.
 *
 * Die Idee: dasselbe Bild mehrfach übereinander, jede Kopie ein Stückchen
 * weiter hinten (translateZ) und dunkler. Dreht sich der Stapel leicht, sieht
 * man an den Rändern die Tiefe — aus dem Aufkleber wird ein Gegenstand. Das ist
 * der Trick, mit dem man ein beliebiges Geschenkbild räumlich bekommt, ohne
 * ein 3D-Modell davon zu haben. TikTok liefert über 5000 verschiedene
 * Geschenkbilder; ein vorgerendertes Modell könnte immer nur eines davon zeigen.
 *
 * Reihenfolge von HINTEN nach VORNE, damit die vorderste Kopie (i = 0, die
 * einzige in voller Farbe) auch ohne z-index oben liegt.
 */
export function studioSchichten(tiefe) {
  const n = Math.max(2, Math.min(20, Math.floor(Number(tiefe)) || 12));
  let html = '<div class="bx-gco-koerper">';
  for (let i = n - 1; i >= 0; i--) html += `<img class="bx-gco-schicht" alt="" style="--i:${i}">`;
  // Glanz = wandernder Lichtstreif, Rand = Konturlicht. Beide holen sich die
  // Form aus derselben Bildadresse.
  html += '<div class="bx-gco-glanz"></div></div><div class="bx-gco-spiegel"><img alt=""></div>';
  return html;
}

/** Bildadresse, die gefahrlos in url("…") stehen kann.
 *
 *  Anführungszeichen, Backslashes, Klammern und Zeilenumbrüche würden die
 *  CSS-Funktion vorzeitig schließen — der Rest der Adresse landete dann als
 *  CSS im Dokument. Die Adressen kommen zwar aus TikToks Katalog, aber eine
 *  Zeichenkette aus dem Netz gehört nie ungeprüft in eine Stil-Anweisung. */
export function sichereBildAdresse(url) {
  return String(url ?? '').replace(/["'\\()\s]/g, '');
}

/** Die wählbaren Stile. Reihenfolge = die des Auswahlfelds; 'glas' ist der
 *  Rückfall für alles Unbekannte (z.B. ein Overlay von einer neueren Fassung).
 *  Ein Stil wird NIE entfernt — das würde vorhandene Overlays umgestalten. */
export const STILE = ['glas', 'neon', 'medaille', 'aufladung', 'arcade', 'sticker', 'portal', 'rakete', 'hologramm', 'studio', 'vitrine', 'museum', 'karte', 'zeile', 'fokus', 'plakat', 'davor'];

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
      ...(STILE_MIT_KOERPER.has(this.style) ? ['bx-gco-koerper-buehne'] : []),
      ...anzeigeKlassen(props),
    ].join(' ');
    // .bx-gco-deko ist eine leere Bühne für die aufwendigen Stile (Portal,
    // Rakete, Hologramm): sie und ihre beiden Pseudo-Elemente ergeben drei
    // freie Ebenen für Ringe, Schockwellen, Lichtkegel. Ohne so einen Stil hat
    // sie keine Größe und kostet nichts — ein Element im Gerüst ist billiger
    // als drei Stile, die sich um ::before/::after streiten.
    this.el.innerHTML = `<div class="bx-gco-iconwrap"><div class="bx-gco-ring"></div><div class="bx-gco-deko"></div><div class="bx-gco-icon"></div></div>
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
    if (!this.lastIcon) { slot.innerHTML = GIFT_SVG; return; }
    if (STILE_MIT_KOERPER.has(this.style)) {
      // Studio: aus dem flachen Bild wird ein Körper (siehe studioSchichten).
      slot.innerHTML = studioSchichten(STUDIO_TIEFE);
      for (const img of slot.querySelectorAll('img')) img.src = this.lastIcon;
      // Glanz und Spiegelung arbeiten mit der SILHOUETTE des Bildes — die Adresse
      // geht als CSS-Variable rein (nicht ins Markup), dann muss sie nirgends
      // fürs HTML entschärft werden.
      slot.style.setProperty('--bx-gco-bild', `url("${sichereBildAdresse(this.lastIcon)}")`);
      return;
    }
    slot.style.removeProperty('--bx-gco-bild');
    slot.innerHTML = '<img alt="" />';
    slot.querySelector('img').src = this.lastIcon;
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
