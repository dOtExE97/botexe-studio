// piraten-zaehler.js — Fortnite-Zähler im Piraten-Look: zwei Holztafeln mit
// Messingrahmen nebeneinander, oben je eine gravierte Goldplakette
// („VICTORY ROYALES", „KILLS"), links ein Goldmedaillon (Krone bzw. gekreuzte
// Säbel), rechts eine Klappziffer-Anzeige wie an einer alten Bahnhofsuhr.
//
// Gesteuert wird über die vorhandenen Aktionen — Panel-Knopf, Hotkey, Stream
// Deck (POST /api/panel/fire) oder Trigger-Regel, z.B. Chat-Befehl „!kill":
//   counter_add  { delta }                 → Standard-Zähler (Kills) ± delta
//   fire_alert   { }                       → Victory Royale +1 (mit Feier)
//   beide auch mit { zaehler: 'siege'|'kills', delta?, wert? } direkt oder in
//   `params` — `wert` setzt den Stand fest (z.B. 0 zum Zurücksetzen).
// Werte überleben ein Neuladen der Browserquelle (localStorage je Layer) und
// starten bei einem neuen Stream wieder bei 0 (abschaltbar).
//
// Änderung: Die Ziffer klappt um (obere Hälfte fällt, untere klappt nach),
// das Medaillon reagiert. Victory Royale: Krone strahlt, Münzen und Konfetti,
// Band „VICTORY ROYALE!" über beide Tafeln. Ruhe: Glanz über die Plaketten,
// Medaillons wippen. Reduzierte Bewegung und Sparmodus: alles still.
//
// props: { labelSiege?, labelKills?, standardZaehler?: 'kills'|'siege',
//          zuruecksetzen?: boolean, fontFamily?, textColor? }

const STYLE_ID = 'bx-pz-style';

const MASERUNG = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='100'%3E %3Cfilter id='m' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.3' numOctaves='3' seed='7' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 0.14 0 0 0 0 0.06 0 0 0 0 0.01 0 0 0 2.2 -1.0'/%3E%3C/filter%3E %3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E\")";

const CSS = `
/* Wurzel = Box. Jede Tafel ist selbst ein Größen-Container: alles darin misst
   sich an der TAFELHÖHE (cqh). Konturen nur über box-shadow, nie border. */
.bx-pz { position: absolute; inset: 0; container-type: size; display: flex; align-items: center; gap: 3cqi; box-sizing: border-box; pointer-events: none;
  --pz-tinte: #1d0c03; --pz-holz-h: #d9924a; --pz-holz: #a65d27; --pz-holz-d: #5e2f10;
  --pz-gold-h: #fff4c8; --pz-gold: #f5c451; --pz-gold-m: #d49a2e; --pz-gold-d: #a8701a; --pz-gold-t: #6b3f08; }
.bx-pz-tafel { position: relative; container-type: size; flex: 1 1 0; min-width: 0; height: min(100cqh, 31cqi); --r: clamp(1px, 2.2cqh, 3px); }

/* Holztafel mit Messingrahmen (::before) und Glanzstreif (::after). */
.bx-pz-brett { position: absolute; left: 3%; right: 1%; top: 17cqh; bottom: 7cqh; overflow: hidden;
  border-radius: 10cqh 12cqh 11cqh 9cqh;
  background:
    linear-gradient(180deg, rgba(255,232,190,.4) 0 5%, rgba(255,220,170,.1) 16%, transparent 45%, rgba(25,8,0,.45)),
    linear-gradient(90deg, rgba(0,0,0,.24), transparent 16%, transparent 80%, rgba(0,0,0,.32)),
    ${MASERUNG} 0 0 / 400cqh 100cqh,
    linear-gradient(180deg, var(--pz-holz-h), var(--pz-holz) 55%, var(--pz-holz-d));
  box-shadow: 0 0 0 calc(var(--r) * 1.2) var(--pz-tinte),
    inset 0 0 0 calc(var(--r) * 2.6) var(--pz-tinte),
    inset 0 calc(var(--r) * 4) calc(var(--r) * 3) rgba(0,0,0,.35),
    0 calc(var(--r) * 2.4) 0 rgba(29,12,3,.9), 0 calc(var(--r) * 4) calc(var(--r) * 7) rgba(0,0,0,.5); }
.bx-pz-brett::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: calc(var(--r) * 1.6); pointer-events: none;
  background: linear-gradient(180deg, var(--pz-gold-h), var(--pz-gold) 28%, var(--pz-gold-m) 62%, var(--pz-gold-t));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
/* Nieten rechts oben/unten. */
.bx-pz-brett::after { content: ''; position: absolute; inset: 0; pointer-events: none; --nd: 9cqh;
  background:
    radial-gradient(circle at 42% 40%, #fff 0 9%, var(--pz-gold-h) 18%, #e0a93c 36%, #8a5310 54%, var(--pz-tinte) 60% 68%, transparent 72%) right calc(var(--r) * 2.8) top calc(var(--r) * 2.8) / var(--nd) var(--nd) no-repeat,
    radial-gradient(circle at 42% 40%, #fff 0 9%, var(--pz-gold-h) 18%, #e0a93c 36%, #8a5310 54%, var(--pz-tinte) 60% 68%, transparent 72%) right calc(var(--r) * 2.8) bottom calc(var(--r) * 2.8) / var(--nd) var(--nd) no-repeat; }

/* Goldplakette oben auf der Tafel: Schnörkel-Kappen, gravierte Schrift. */
.bx-pz-plakette { position: absolute; top: 2cqh; left: 2%; right: 2%; z-index: 4; width: fit-content; max-width: 96%; margin: 0 auto; box-sizing: border-box;
  display: flex; align-items: center; padding: 1.4cqh 6.6cqh 1.6cqh; border-radius: 4cqh; overflow: hidden;
  background:
    linear-gradient(180deg, rgba(255,255,255,.55) 0 8%, rgba(255,255,255,.16) 46%, transparent 50%),
    linear-gradient(180deg, var(--pz-gold-h), var(--pz-gold) 35%, var(--pz-gold-m) 62%, var(--pz-gold-d) 92%);
  box-shadow: 0 0 0 calc(var(--r) * 1.1) var(--pz-tinte), inset 0 calc(var(--r) * .7) 0 rgba(255,255,255,.75), inset 0 calc(var(--r) * -1) 0 rgba(107,63,8,.6),
    0 calc(var(--r) * 1.8) 0 var(--pz-tinte), 0 0 calc(var(--r) * 5) rgba(255,214,110,.45); }
.bx-pz-plakette::before, .bx-pz-plakette::after { content: ''; position: absolute; top: 50%; width: 4.4cqh; height: 4.4cqh; margin-top: -2.2cqh; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff 0 14%, var(--pz-gold-h) 26%, var(--pz-gold-d) 68%, var(--pz-gold-t));
  box-shadow: 0 0 0 calc(var(--r) * .45) rgba(29,12,3,.85); }
.bx-pz-plakette::before { left: 1.3cqh; }
.bx-pz-plakette::after { right: 1.3cqh; }
.bx-pz-titel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.1;
  font-family: var(--bx-font-display); font-size: calc(clamp(8px, 14cqh, 21px) * var(--bx-fs, 1)); letter-spacing: .025em; text-transform: uppercase;
  color: #5a2f03; text-shadow: 0 .07em 0 rgba(255,246,214,.85), 0 -.05em 0 rgba(60,28,0,.5); }
.bx-pz-glanz { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.75) 50%, transparent 65%);
  transform: translateX(-110%); animation: bx-pz-glanz 6.4s ease-in-out infinite; animation-delay: calc(var(--i, 0) * 1.4s + .8s); }

/* Goldmedaillon mit Symbol (Krone / gekreuzte Säbel). */
.bx-pz-med { position: absolute; left: 0; bottom: 3cqh; height: 66cqh; aspect-ratio: 1; z-index: 3; border-radius: 50%; color: #5a2f03;
  background: radial-gradient(circle at 34% 28%, #fffbe6 0 6%, #ffe39a 16%, var(--pz-gold) 34%, var(--pz-gold-m) 58%, #8a5310 86%, #5a3008);
  box-shadow: 0 0 0 calc(var(--r) * 1.2) var(--pz-tinte), inset 0 calc(var(--r) * .9) 0 rgba(255,255,255,.65),
    inset 0 calc(var(--r) * -1.3) calc(var(--r) * 1) rgba(90,45,0,.6),
    0 calc(var(--r) * 2.2) 0 rgba(29,12,3,.85), 0 0 calc(var(--r) * 8) rgba(255,190,80,.45);
  animation: bx-pz-wippen 4.2s ease-in-out infinite; animation-delay: calc(var(--i, 0) * -1.3s); }
.bx-pz-med::before { content: ''; position: absolute; inset: 14%; border-radius: 50%;
  background: radial-gradient(circle at 40% 34%, #ffeaa8, #f0b94a 46%, #c98a26 82%);
  box-shadow: 0 0 0 calc(var(--r) * .7) rgba(107,63,8,.7), 0 calc(var(--r) * .6) 0 calc(var(--r) * .7) rgba(255,246,214,.45),
    inset 0 calc(var(--r) * 1.3) calc(var(--r) * 1.6) rgba(107,63,8,.6), inset 0 calc(var(--r) * -.8) 0 rgba(255,246,214,.6); }
.bx-pz-med svg { position: absolute; left: 22%; top: 22%; width: 56%; height: 56%; z-index: 1; overflow: visible;
  filter: drop-shadow(0 calc(var(--r) * .7) 0 rgba(255,246,214,.75)); }
/* Strahlen hinter dem Medaillon — in einem Fenster in Tafelgröße, damit sie
   nicht über die Box hinausragen (das Medaillon sitzt am linken Rand). */
.bx-pz-schein { position: absolute; inset: 0; z-index: 2; overflow: hidden; pointer-events: none; border-radius: 10cqh; }
.bx-pz-strahlen { position: absolute; left: 33cqh; top: 64cqh; width: 190cqh; height: 190cqh; translate: -50% -50%; border-radius: 50%; opacity: 0; pointer-events: none; mix-blend-mode: screen;
  background: radial-gradient(circle, rgba(255,250,220,.95) 0 10%, rgba(255,214,90,.6) 24%, transparent 56%),
    repeating-conic-gradient(from 0deg, rgba(255,232,150,.8) 0 7deg, transparent 7deg 24deg);
  -webkit-mask-image: radial-gradient(circle, #000 20%, transparent 66%); mask-image: radial-gradient(circle, #000 20%, transparent 66%); }

/* Klappziffern: dunkles Fenster mit Messing-Einfassung, zwei Hälften, Mittelfuge. */
.bx-pz-flip { position: absolute; right: 8%; bottom: 16cqh; height: 48cqh; z-index: 2; min-width: 1.5em; padding: 0 .22em;
  font-family: var(--bx-font-display); font-size: calc(clamp(12px, 40cqh, 60px) * var(--bx-fs, 1)); line-height: 1; perspective: 3em;
  border-radius: .16em; background: linear-gradient(180deg, #3a1d0b, #160802);
  box-shadow: 0 0 0 calc(var(--r) * 1.1) var(--pz-tinte), 0 0 0 calc(var(--r) * 2.4) var(--pz-gold-m), 0 0 0 calc(var(--r) * 3.3) var(--pz-tinte),
    inset 0 calc(var(--r) * 1.6) calc(var(--r) * 2) rgba(0,0,0,.8), 0 calc(var(--r) * 3.6) 0 rgba(29,12,3,.7); }
.bx-pz-mass { visibility: hidden; display: block; height: 100%; line-height: 1.24; white-space: nowrap; }
.bx-pz-h { position: absolute; left: 0; right: 0; height: 50%; overflow: hidden; backface-visibility: hidden; }
.bx-pz-h.o { top: 0; border-radius: .16em .16em 0 0; transform-origin: 50% 100%;
  background: linear-gradient(180deg, #4a2610, #2a1205); }
.bx-pz-h.u { bottom: 0; border-radius: 0 0 .16em .16em; transform-origin: 50% 0;
  background: linear-gradient(180deg, #1f0c03, #2e1506); }
.bx-pz-h b { position: absolute; left: 0; right: 0; height: 200%; display: flex; align-items: center; justify-content: center; white-space: nowrap;
  font-weight: 400; color: #fff1cf; text-shadow: 0 .05em 0 #000, 0 0 .25em rgba(255,200,90,.25); }
.bx-pz-h.u b { color: #f6dca0; }
.bx-pz-h.o b { top: 0; }
.bx-pz-h.u b { bottom: 0; }
/* Fuge in der Mitte mit zwei Messing-Scharnieren. */
.bx-pz-fuge { position: absolute; left: -.06em; right: -.06em; top: 50%; height: calc(var(--r) * 1.1); margin-top: calc(var(--r) * -.55); z-index: 3;
  background: linear-gradient(90deg, var(--pz-gold-m) 0 .12em, #050100 .12em calc(100% - .12em), var(--pz-gold-m) calc(100% - .12em));
  box-shadow: 0 calc(var(--r) * .5) 0 rgba(255,220,160,.12); }
.bx-pz-klappe.o { z-index: 2; animation: bx-pz-klappe-o 300ms ease-in forwards; }
.bx-pz-klappe.u { z-index: 2; transform: rotateX(90deg); animation: bx-pz-klappe-u 300ms ease-out 280ms forwards; }

/* Auslöser: Medaillon reagiert. Säbel klirren, Krone springt und strahlt. */
.bx-pz-tafel.bx-pz-tick .bx-pz-med { animation: bx-pz-klirr 520ms cubic-bezier(.2,1.5,.4,1); }
.bx-pz-tafel.bx-pz-tick .bx-pz-brett { animation: bx-pz-auf 700ms ease-out; }
.bx-pz-tafel.bx-pz-sieg .bx-pz-med { animation: bx-pz-krone 1100ms cubic-bezier(.2,1.5,.4,1); }
.bx-pz-tafel.bx-pz-sieg .bx-pz-strahlen { animation: bx-pz-strahlen 1600ms ease-out; }
.bx-pz-funke { position: absolute; width: 6cqh; height: 6cqh; left: 30cqh; top: 40cqh; z-index: 5; border-radius: 50%; opacity: 0; pointer-events: none;
  background: radial-gradient(circle, #fff 0 20%, #ffe58a 45%, transparent 70%);
  animation: bx-pz-funke 600ms ease-out forwards; animation-delay: var(--d, 0ms); }

/* Victory-Royale-Feier über beide Tafeln. */
.bx-pz-fx { position: absolute; inset: 0; z-index: 8; overflow: hidden; pointer-events: none; }
.bx-pz-konfetti { position: absolute; top: 48%; width: 2.6cqh; height: 4.4cqh; border-radius: .6cqh; opacity: 0;
  box-shadow: 0 0 0 .35cqh rgba(29,12,3,.8);
  animation: bx-pz-konfetti 1900ms cubic-bezier(.2,.6,.35,1) forwards; animation-delay: var(--d, 0ms); }
.bx-pz-muenze { position: absolute; top: 55%; width: 7cqh; height: 7cqh; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle at 35% 30%, #fff 0 10%, var(--pz-gold-h) 20%, var(--pz-gold) 50%, var(--pz-gold-d));
  box-shadow: 0 0 0 .6cqh var(--pz-tinte), inset 0 0 0 .8cqh rgba(168,112,26,.85), 0 0 3cqh rgba(255,214,110,.9);
  animation: bx-pz-muenze 1300ms cubic-bezier(.25,.7,.4,1) forwards; animation-delay: var(--d, 0ms); }
.bx-pz-band { position: absolute; left: 50%; top: 50%; z-index: 9; translate: -50% -50%; opacity: 0; scale: .4; max-width: 98cqi; pointer-events: none; }
.bx-pz-band span { display: block; padding: .14em .9em .08em; white-space: nowrap; line-height: 1;
  font-family: var(--bx-font-display); font-size: calc(clamp(10px, min(22cqh, 9cqi), 40px) * var(--bx-fs, 1)); letter-spacing: .04em; color: #fff6e0;
  -webkit-text-stroke: max(1.5px, .1em) #4a0306; paint-order: stroke fill; text-shadow: 0 .08em 0 #4a0306;
  background: linear-gradient(180deg, #ff6a55, #d01e24 55%, #8c0c12);
  clip-path: polygon(0 0, 100% 0, 95% 50%, 100% 100%, 0 100%, 5% 50%);
  box-shadow: inset 0 .1em 0 #ffd56b, inset 0 -.1em 0 #ffd56b; }
.bx-pz-band.zeigen { animation: bx-pz-band 2600ms cubic-bezier(.2,1.4,.4,1) forwards; }

@keyframes bx-pz-glanz { 0%, 72% { transform: translateX(-110%); } 90%, 100% { transform: translateX(110%); } }
@keyframes bx-pz-wippen { 0%, 100% { translate: 0 0; rotate: -2deg; } 50% { translate: 0 -2cqh; rotate: 2deg; } }
@keyframes bx-pz-klappe-o { from { transform: rotateX(0deg); } to { transform: rotateX(-90deg); } }
@keyframes bx-pz-klappe-u { from { transform: rotateX(90deg); } to { transform: rotateX(0deg); } }
@keyframes bx-pz-klirr { 0% { transform: none; } 20% { transform: rotate(-14deg) scale(1.16); } 40% { transform: rotate(10deg) scale(1.08); } 60% { transform: rotate(-5deg); } 100% { transform: none; } }
@keyframes bx-pz-auf { 0% { filter: brightness(1); } 20% { filter: brightness(1.45) saturate(1.15); } 100% { filter: brightness(1); } }
@keyframes bx-pz-krone { 0% { transform: none; } 18% { transform: scale(1.38) rotate(-8deg) translateY(-6cqh); } 40% { transform: scale(1.2) rotate(6deg) translateY(-4cqh); } 70% { transform: scale(1.06) rotate(-2deg); } 100% { transform: none; } }
@keyframes bx-pz-strahlen { 0% { opacity: 0; scale: .3; rotate: 0deg; } 20% { opacity: 1; } 100% { opacity: 0; scale: 1.2; rotate: 60deg; } }
@keyframes bx-pz-funke { 0% { opacity: 0; transform: translate(0, 0) scale(.4); } 25% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx, 0cqh), var(--dy, -20cqh)) scale(1); } }
@keyframes bx-pz-konfetti {
  0% { opacity: 0; transform: translate(0, 0) rotate(0deg) scale(.4); }
  8% { opacity: 1; }
  40% { opacity: 1; transform: translate(calc(var(--dx, 0cqh) * .75), var(--dy, -40cqh)) rotate(calc(var(--rot, 300deg) * .6)) rotateY(240deg) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx, 0cqh), calc(var(--dy, -40cqh) * -.5)) rotate(var(--rot, 300deg)) rotateY(720deg) scale(.9); } }
@keyframes bx-pz-muenze {
  0% { opacity: 0; transform: translate(0, 0) scale(.4) rotateY(0deg); }
  10% { opacity: 1; }
  50% { opacity: 1; transform: translate(calc(var(--dx, 0cqh) * .7), var(--dy, -40cqh)) scale(1) rotateY(300deg); }
  100% { opacity: 0; transform: translate(var(--dx, 0cqh), calc(var(--dy, -40cqh) * .15)) scale(.7) rotateY(620deg); } }
@keyframes bx-pz-band {
  0% { opacity: 0; scale: .4; rotate: -8deg; }
  12% { opacity: 1; scale: 1.12; rotate: 2deg; }
  20% { scale: 1; rotate: -1deg; }
  82% { opacity: 1; scale: 1; rotate: -1deg; }
  100% { opacity: 0; scale: .9; rotate: -1deg; } }

@media (prefers-reduced-motion: reduce) {
  .bx-pz *, .bx-pz *::before, .bx-pz *::after { animation: none !important; }
  .bx-pz-klappe, .bx-pz-fx, .bx-pz-funke, .bx-pz-strahlen { display: none; } }
html.bx-perf .bx-pz *, html.bx-perf .bx-pz *::before, html.bx-perf .bx-pz *::after { animation: none !important; }
html.bx-perf .bx-pz-klappe, html.bx-perf .bx-pz-fx, html.bx-perf .bx-pz-funke, html.bx-perf .bx-pz-strahlen { display: none; }
/* Rahmen ausblenden: Holz weg — Plakette, Medaillon und Klappziffern bleiben. */
html .bx-frameless .bx-pz-brett { background: none; box-shadow: none; }
html .bx-frameless .bx-pz-brett::before, html .bx-frameless .bx-pz-brett::after { display: none; }
`;

const SYMBOLE = {
  // Krone mit drei Zacken, Edelsteinen und Band
  siege: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"><path d="M2.6 17.4L4.2 6.8l4.9 4.6L12 3.6l2.9 7.8 4.9-4.6 1.6 10.6z"/><path d="M3.6 18.8h16.8v2.8H3.6z"/></g>'
    + '<circle cx="4.2" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="2.8" r="1.6" fill="currentColor"/><circle cx="19.8" cy="6" r="1.5" fill="currentColor"/>'
    + '<g fill="#f0b94a"><circle cx="12" cy="13.6" r="1.7"/><circle cx="7.4" cy="14.6" r="1.1"/><circle cx="16.6" cy="14.6" r="1.1"/></g><path d="M5 20.2h14" stroke="#f0b94a" stroke-width=".9"/></svg>',
  // Zwei gekreuzte Säbel
  kills: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">'
    + '<path d="M2.4 2.2l3 .4 11.4 11.4-2.4 2.4L3 5z"/><path d="M12.6 18.6l6-6 1.5 1.5-6 6z"/><path d="M17.2 18l1.7-1.7 2.6 2.6-1.7 1.7z"/><circle cx="21.6" cy="21.6" r="1.6"/>'
    + '<path d="M21.6 2.2l-3 .4L7.2 14l2.4 2.4L21 5z"/><path d="M11.4 18.6l-6-6-1.5 1.5 6 6z"/><path d="M6.8 18l-1.7-1.7-2.6 2.6 1.7 1.7z"/><circle cx="2.4" cy="21.6" r="1.6"/></g>'
    + '<path d="M4.6 3.8l9.6 9.6M19.4 3.8l-9.6 9.6" stroke="#f0b94a" stroke-width=".8"/></svg>',
};

const ZAEHLER = ['siege', 'kills'];
// Map statt Objekt-Literal: „constructor", „__proto__", „toString" … sind
// sonst geerbte Treffer (Review Runde 3, M1).
const ALIAS = new Map([['siege', 'siege'], ['sieg', 'siege'], ['vr', 'siege'], ['victory', 'siege'], ['wins', 'siege'], ['win', 'siege'], ['kills', 'kills'], ['kill', 'kills']]);
const MAX = 99999;
const KONFETTI = ['#ffd23e', '#ff5436', '#28e0c4', '#fff4dc', '#f0a521', '#8a5cff'];

/** 'VR', 'Kill', 'siege' … → 'siege' | 'kills' | null */
export function zaehlerName(wert) {
  if (typeof wert !== 'string') return null;
  return ALIAS.get(wert.trim().toLowerCase()) ?? null;
}

function ganz(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}
const begrenze = (n) => Math.max(0, Math.min(MAX, n));

/**
 * Was eine Aktion mit den beiden Ständen macht. DOM-frei, damit prüfbar.
 *  - counter_add: Standard-Zähler (oder `zaehler`) ± delta; `wert` setzt fest.
 *  - fire_alert: Victory Royale +1, außer `params` sagt etwas anderes.
 * @returns {{ siege: number, kills: number, geaendert: string | null, sieg: boolean } | null}
 *   null = Aktion betrifft dieses Widget nicht / ist unbrauchbar.
 */
export function wendeAn(stand, action, standard = 'kills') {
  if (!action || typeof action !== 'object') return null;
  if (action.kind !== 'counter_add' && action.kind !== 'fire_alert') return null;
  const p = action.params && typeof action.params === 'object' ? action.params : {};
  const angabe = action.zaehler ?? p.zaehler;
  const welcher = zaehlerName(angabe) ?? (action.kind === 'fire_alert' ? 'siege' : (zaehlerName(standard) ?? 'kills'));
  const wert = ganz(action.wert ?? p.wert);
  let delta = ganz(action.delta ?? p.delta);
  if (delta === null) delta = action.kind === 'fire_alert' ? 1 : null;
  const alt = stand[welcher];
  let neu;
  if (wert !== null) neu = begrenze(wert);
  else if (delta !== null) neu = begrenze(alt + delta);
  else return null;
  return { ...stand, [welcher]: neu, geaendert: neu !== alt ? welcher : null, sieg: welcher === 'siege' && neu > alt };
}

/** Eine Hälfte der Klappziffer: Fenster (span) mit der ganzen Ziffer (b) darin. */
function halbe(klasse) {
  const h = document.createElement('span');
  h.className = klasse;
  h.appendChild(document.createElement('b'));
  return h;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

export default class PiratenZaehler {
  constructor(root, props, ctx) {
    ensureStyle();
    const p = props && typeof props === 'object' ? props : {};
    this.standard = zaehlerName(p.standardZaehler) ?? 'kills';
    this.zuruecksetzen = p.zuruecksetzen !== false;
    this.storageKey = `bx-pz-${(ctx && ctx.layerId) || 'default'}`;
    this.timers = new Set();
    this.zerstoert = false;
    this.preview = !!(ctx && ctx.preview);
    this.stand = this.preview ? { siege: 3, kills: 12 } : this.lade();
    this.el = document.createElement('div');
    this.el.className = 'bx-pz';
    if (!p.fontFamily) {
      this.el.style.setProperty('--bx-font-display', "'Lilita One', 'Arial Black'");
      this.el.style.setProperty('--bx-font-body', "'Saira Semi Condensed', 'Arial Narrow'");
    }
    const titel = {
      siege: typeof p.labelSiege === 'string' && p.labelSiege.trim() ? p.labelSiege.trim() : 'Victory Royales',
      kills: typeof p.labelKills === 'string' && p.labelKills.trim() ? p.labelKills.trim() : 'Kills',
    };
    /** @type {Record<string, {el: any, flip: any, mass: any, ober: any, unter: any, tKlappe: any, tTick: any}>} */
    this.tafeln = {};
    ZAEHLER.forEach((z, i) => {
      const t = document.createElement('div');
      t.className = 'bx-pz-tafel';
      t.dataset.zaehler = z;
      t.style.setProperty('--i', String(i));
      t.innerHTML = '<div class="bx-pz-brett"></div>'
        + '<div class="bx-pz-plakette"><span class="bx-pz-titel"></span><i class="bx-pz-glanz"></i></div>'
        + '<div class="bx-pz-schein"><i class="bx-pz-strahlen"></i></div>'
        + `<div class="bx-pz-med">${SYMBOLE[z]}</div>`
        + '<div class="bx-pz-flip"></div>';
      t.querySelector('.bx-pz-titel').textContent = titel[z];
      const flip = t.querySelector('.bx-pz-flip');
      const mass = document.createElement('span');
      mass.className = 'bx-pz-mass';
      const ober = halbe('bx-pz-h o bx-pz-ober');
      const unter = halbe('bx-pz-h u bx-pz-unter');
      const fuge = document.createElement('i');
      fuge.className = 'bx-pz-fuge';
      flip.appendChild(mass);
      flip.appendChild(ober);
      flip.appendChild(unter);
      flip.appendChild(fuge);
      const eintrag = { el: t, flip, mass, ober, unter, tKlappe: null, tTick: null };
      this.tafeln[z] = eintrag;
      this.schreibe(eintrag, String(this.stand[z]));
      this.el.appendChild(t);
    });
    this.fx = document.createElement('div');
    this.fx.className = 'bx-pz-fx';
    this.band = document.createElement('div');
    this.band.className = 'bx-pz-band';
    this.band.innerHTML = '<span>VICTORY ROYALE!</span>';
    this.el.appendChild(this.fx);
    this.el.appendChild(this.band);
    root.appendChild(this.el);
    if (this.preview) {
      this.demoSchritt = 0;
      this.demoTimer = setInterval(() => this.demoWeiter(), 2600);
    }
  }

  lade() {
    try {
      const roh = window.localStorage.getItem(this.storageKey);
      if (roh) {
        const o = JSON.parse(roh);
        return { siege: begrenze(ganz(o.siege) ?? 0), kills: begrenze(ganz(o.kills) ?? 0) };
      }
    } catch { /* privater Modus, kaputter Eintrag */ }
    return { siege: 0, kills: 0 };
  }

  speichere() {
    if (this.preview) return;
    try { window.localStorage.setItem(this.storageKey, JSON.stringify({ siege: this.stand.siege, kills: this.stand.kills })); } catch { /* egal */ }
  }

  /** Ruhender Stand ohne Klappen. */
  schreibe(t, text) {
    t.mass.textContent = text;
    t.ober.firstElementChild.textContent = text;
    t.unter.firstElementChild.textContent = text;
  }


  /** Klappziffer von alt auf neu: obere Hälfte fällt, untere klappt nach. */
  klappe(t, alt, neu) {
    for (const k of t.flip.querySelectorAll('.bx-pz-klappe')) k.remove();
    if (t.tKlappe) { clearTimeout(t.tKlappe); this.timers.delete(t.tKlappe); }
    // Breite für die längere der beiden Zahlen, damit nichts springt.
    t.mass.textContent = neu.length >= alt.length ? neu : alt;
    t.ober.firstElementChild.textContent = neu;
    t.unter.firstElementChild.textContent = alt;
    const ko = halbe('bx-pz-h o bx-pz-klappe');
    ko.firstElementChild.textContent = alt;
    const ku = halbe('bx-pz-h u bx-pz-klappe');
    ku.firstElementChild.textContent = neu;
    t.flip.appendChild(ko);
    t.flip.appendChild(ku);
    t.tKlappe = this.spaeter(620, () => {
      ko.remove();
      ku.remove();
      this.schreibe(t, neu);
      t.tKlappe = null;
    });
  }

  /** Medaillon reagiert; beim Sieg zusätzlich Strahlen, Münzen, Konfetti, Band. */
  feiere(z, sieg) {
    const t = this.tafeln[z];
    const klasse = sieg ? 'bx-pz-sieg' : 'bx-pz-tick';
    t.el.classList.remove('bx-pz-tick', 'bx-pz-sieg');
    void t.el.offsetWidth;
    t.el.classList.add(klasse);
    if (t.tTick) { clearTimeout(t.tTick); this.timers.delete(t.tTick); }
    t.tTick = this.spaeter(sieg ? 1700 : 760, () => { t.el.classList.remove('bx-pz-tick', 'bx-pz-sieg'); t.tTick = null; });
    // Funken am Medaillon
    for (const alt of t.el.querySelectorAll('.bx-pz-funke')) alt.remove();
    const funken = [];
    for (let k = 0; k < 5; k++) {
      const f = document.createElement('i');
      f.className = 'bx-pz-funke';
      f.style.setProperty('--dx', `${Math.round(-26 + k * 13)}cqh`);
      f.style.setProperty('--dy', `${Math.round(-22 - Math.random() * 16)}cqh`);
      f.style.setProperty('--d', `${k * 40}ms`);
      t.el.appendChild(f);
      funken.push(f);
    }
    this.spaeter(900, () => { for (const f of funken) f.remove(); });
    if (!sieg) return;
    this.band.classList.remove('zeigen');
    void this.band.offsetWidth;
    this.band.classList.add('zeigen');
    if (this.tBand) { clearTimeout(this.tBand); this.timers.delete(this.tBand); }
    this.tBand = this.spaeter(2700, () => { this.band.classList.remove('zeigen'); this.tBand = null; });
    for (const alt of [...this.fx.children]) alt.remove();
    const teile = [];
    for (let k = 0; k < 22; k++) {
      const c = document.createElement('i');
      c.className = 'bx-pz-konfetti';
      c.style.left = `${8 + Math.random() * 30}%`;
      c.style.background = KONFETTI[k % KONFETTI.length];
      c.style.setProperty('--dx', `${Math.round(-20 + Math.random() * 260)}cqh`);
      c.style.setProperty('--dy', `${Math.round(-30 - Math.random() * 30)}cqh`);
      c.style.setProperty('--rot', `${Math.round(200 + Math.random() * 400)}deg`);
      c.style.setProperty('--d', `${k * 24}ms`);
      this.fx.appendChild(c);
      teile.push(c);
    }
    for (let k = 0; k < 9; k++) {
      const m = document.createElement('i');
      m.className = 'bx-pz-muenze';
      m.style.left = `${10 + Math.random() * 8}%`;
      m.style.setProperty('--dx', `${Math.round(-10 + k * 26 + Math.random() * 10)}cqh`);
      m.style.setProperty('--dy', `${Math.round(-32 - Math.random() * 20)}cqh`);
      m.style.setProperty('--d', `${60 + k * 45}ms`);
      this.fx.appendChild(m);
      teile.push(m);
    }
    this.spaeter(2200, () => { for (const x of teile) x.remove(); });
  }

  setze(neuStand, z, sieg) {
    const t = this.tafeln[z];
    const alt = String(this.stand[z]);
    this.stand = { siege: neuStand.siege, kills: neuStand.kills };
    this.speichere();
    this.klappe(t, alt, String(this.stand[z]));
    this.feiere(z, sieg);
  }

  onAction(action) {
    if (this.zerstoert) return;
    const r = wendeAn(this.stand, action, this.standard);
    if (!r || !r.geaendert) return;
    this.stopDemo();
    this.setze(r, r.geaendert, r.sieg);
  }

  /** Neuer Stream → beide wieder 0 (wenn gewünscht). */
  onReset() {
    if (this.zerstoert || !this.zuruecksetzen) return;
    this.stand = { siege: 0, kills: 0 };
    this.speichere();
    for (const z of ZAEHLER) this.schreibe(this.tafeln[z], '0');
  }

  demoWeiter() {
    if (this.zerstoert) return;
    this.demoSchritt++;
    const sieg = this.demoSchritt % 4 === 0;
    if (this.stand.kills > 40) this.stand = { siege: 3, kills: 12 };
    const r = wendeAn(this.stand, sieg ? { kind: 'fire_alert' } : { kind: 'counter_add', delta: 1 }, 'kills');
    if (r && r.geaendert) this.setze(r, r.geaendert, r.sieg);
  }

  stopDemo() {
    if (this.demoTimer) { clearInterval(this.demoTimer); this.demoTimer = null; }
  }

  spaeter(ms, f) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (this.zerstoert) return;
      try { f(); } catch { /* Aufräumen darf das Widget nie lahmlegen */ }
    }, ms);
    this.timers.add(id);
    return id;
  }

  destroy() {
    this.zerstoert = true;
    this.stopDemo();
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.el.remove();
  }
}
