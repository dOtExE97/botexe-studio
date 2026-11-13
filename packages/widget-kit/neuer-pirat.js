// neuer-pirat.js — „Neuer Pirat an Bord!": Schreibt jemand zum allerersten Mal
// in den Chat (Studio setzt `firstOfUser`), schwingt ein an zwei Tauen
// hängendes Holzschild herein: Goldplakette „NEUER PIRAT AN BORD!", links das
// Profilbild im Goldring mit Dreispitz, daneben groß der Name. Eine Möwe
// segelt vorbei, Goldfunken glitzern am Ring. Nach 5 s wird das Schild wieder
// nach oben gezogen; kommen mehrere Neue, stehen sie Schlange.
//
// Nicht begrüßt werden: Replays (sticky), der anonyme Twitch-Stellvertreter,
// der Streamer selbst und Namen aus der Ignorier-Liste (Bots wie Nightbot).
// Plattform-Filter wie bei der Piraten-Infoleiste: Ereignisse OHNE Plattform
// (Test-Knopf) zählen immer.
//
// Look wie Schatzkiste/Infoleiste: gemasertes Holz, Messing, dicke dunkle
// Kontur, Licht von oben links. Reduzierte Bewegung und Sparmodus: kein
// Schwingen, keine Möwe — das Schild erscheint und verschwindet ruhig.
//
// props: { plattform?: 'twitch'|'tiktok'|'alle', ignorieren?: string|string[],
//          dauerMs?: number, titel?: string, fontFamily?, textColor? }
import { setzeTextMitEmojis } from './emoji-bild.js';

const STYLE_ID = 'bx-np-style';

const MASERUNG = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='100'%3E %3Cfilter id='m' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.008 0.32' numOctaves='3' seed='17' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 0.14 0 0 0 0 0.06 0 0 0 0 0.01 0 0 0 2.2 -1.0'/%3E%3C/filter%3E %3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E\")";

const CSS = `
/* Wurzel = Box. Alles in --u („1px bei 400×100", gedeckelt von Breite UND
   Höhe), die Bühne sitzt oben mittig. overflow: hidden — das Schild wird nach
   oben aus dem Bild gezogen. Konturen nur über box-shadow. */
.bx-np { position: absolute; inset: 0; container-type: size; overflow: hidden; pointer-events: none;
  --np-tinte: #1d0c03; --np-holz-h: #d9924a; --np-holz: #a65d27; --np-holz-d: #5e2f10;
  --np-gold-h: #fff4c8; --np-gold: #f5c451; --np-gold-m: #d49a2e; --np-gold-d: #a8701a; --np-gold-t: #6b3f08; }
.bx-np-buehne { position: absolute; left: 50%; top: 0; translate: -50% 0;
  --u: min(1cqh, 0.25cqi); width: calc(var(--u) * 400); height: calc(var(--u) * 100); --r: max(1px, calc(var(--u) * 1.2)); }

/* Das ganze Schild (Taue + Brett + Ring) — kommt von oben, schwingt aus, geht nach oben. */
.bx-np-schild { position: absolute; inset: 0; transform-origin: 60% 0; transform: translateY(-115%); opacity: 0; }
.bx-np-schild.da { transform: none; opacity: 1; animation: bx-np-rein 1100ms cubic-bezier(.3,.7,.3,1) backwards; }
.bx-np-schild.weg { transform: translateY(-115%); opacity: 1; animation: bx-np-raus 650ms cubic-bezier(.6,0,.8,.4) backwards; }

.bx-np-seil { position: absolute; top: calc(var(--u) * -4); height: calc(var(--u) * 28); width: calc(var(--u) * 4.4); z-index: 1; border-radius: 0 0 2px 2px;
  background: linear-gradient(90deg, rgba(255,240,200,.5), transparent 40%, rgba(40,16,2,.45)),
    repeating-linear-gradient(150deg, #f6dca6 0 calc(var(--u) * 1.1), #c08a45 calc(var(--u) * 1.1) calc(var(--u) * 2.3), #6e4018 calc(var(--u) * 2.3) calc(var(--u) * 3.1));
  box-shadow: 0 0 0 calc(var(--r) * .7) var(--np-tinte); }
.bx-np-seil::after { content: ''; position: absolute; left: 50%; bottom: calc(var(--u) * -3); width: calc(var(--u) * 9); aspect-ratio: 1; translate: -50% 0; border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, transparent 0 30%, var(--np-tinte) 30% 40%, transparent 40%),
    radial-gradient(circle at 36% 30%, #fff 0 8%, var(--np-gold-h) 16%, var(--np-gold) 34%, var(--np-gold-d) 60%, var(--np-gold-t) 76%);
  box-shadow: 0 0 0 calc(var(--r) * .7) var(--np-tinte); }
.bx-np-seil.l { left: calc(var(--u) * 140); }
.bx-np-seil.r { right: calc(var(--u) * 40); }

.bx-np-brett { position: absolute; left: calc(var(--u) * 62); right: calc(var(--u) * 6); top: calc(var(--u) * 22); bottom: calc(var(--u) * 8); overflow: hidden;
  border-radius: calc(var(--u) * 9) calc(var(--u) * 13) calc(var(--u) * 11) calc(var(--u) * 8) / calc(var(--u) * 10) calc(var(--u) * 14) calc(var(--u) * 12) calc(var(--u) * 9);
  background:
    linear-gradient(180deg, rgba(255,232,190,.42) 0 4%, rgba(255,220,170,.1) 16%, transparent 42%, rgba(25,8,0,.44)),
    linear-gradient(90deg, rgba(0,0,0,.24), transparent 14%, transparent 80%, rgba(0,0,0,.32)),
    linear-gradient(180deg, transparent calc(52% - var(--r)), rgba(20,8,2,.7) calc(52% - var(--r)) 52%, rgba(255,200,140,.26) 52% calc(52% + var(--r) * .6), transparent calc(52% + var(--r) * .6)),
    ${MASERUNG} 0 0 / calc(var(--u) * 900) calc(var(--u) * 90),
    linear-gradient(180deg, var(--np-holz-h), var(--np-holz) 55%, var(--np-holz-d));
  box-shadow: 0 0 0 calc(var(--r) * 1.2) var(--np-tinte), inset 0 0 0 calc(var(--r) * 2.6) var(--np-tinte),
    inset 0 calc(var(--r) * 4) calc(var(--r) * 3) rgba(0,0,0,.35),
    0 calc(var(--r) * 2.4) 0 rgba(29,12,3,.9), 0 calc(var(--r) * 4) calc(var(--r) * 8) rgba(0,0,0,.5); }
.bx-np-brett::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: calc(var(--r) * 1.6); pointer-events: none;
  background: linear-gradient(180deg, var(--np-gold-h), var(--np-gold) 28%, var(--np-gold-m) 62%, var(--np-gold-t));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
.bx-np-brett::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 38%, rgba(255,240,200,.16) 45%, rgba(255,250,230,.5) 50%, rgba(255,240,200,.16) 55%, transparent 62%);
  transform: translateX(-100%); }
.bx-np-schild.da .bx-np-brett::after { animation: bx-np-glanz 1400ms ease-in-out 900ms; }
.bx-np-nieten { position: absolute; inset: 0; pointer-events: none; --nd: calc(var(--u) * 8);
  background:
    radial-gradient(circle at 42% 40%, #fff 0 9%, var(--np-gold-h) 18%, #e0a93c 36%, #8a5310 54%, var(--np-tinte) 60% 68%, transparent 72%) right calc(var(--r) * 2.8) top calc(var(--r) * 2.8) / var(--nd) var(--nd) no-repeat,
    radial-gradient(circle at 42% 40%, #fff 0 9%, var(--np-gold-h) 18%, #e0a93c 36%, #8a5310 54%, var(--np-tinte) 60% 68%, transparent 72%) right calc(var(--r) * 2.8) bottom calc(var(--r) * 2.8) / var(--nd) var(--nd) no-repeat; }

/* Goldplakette oben auf dem Brett. */
.bx-np-plakette { position: absolute; top: calc(var(--u) * 13); left: calc(var(--u) * 96); right: calc(var(--u) * 16); z-index: 3; width: fit-content; max-width: calc(var(--u) * 288); margin: 0 auto;
  box-sizing: border-box; overflow: hidden; padding: calc(var(--u) * 2.4) calc(var(--u) * 13) calc(var(--u) * 2.6); border-radius: calc(var(--u) * 5);
  background:
    linear-gradient(180deg, rgba(255,255,255,.55) 0 8%, rgba(255,255,255,.16) 46%, transparent 50%),
    linear-gradient(180deg, var(--np-gold-h), var(--np-gold) 35%, var(--np-gold-m) 62%, var(--np-gold-d) 92%);
  box-shadow: 0 0 0 calc(var(--r) * 1.1) var(--np-tinte), inset 0 calc(var(--r) * .7) 0 rgba(255,255,255,.75), inset 0 calc(var(--r) * -1) 0 rgba(107,63,8,.6),
    0 calc(var(--r) * 1.8) 0 var(--np-tinte), 0 0 calc(var(--r) * 6) rgba(255,214,110,.5); }
.bx-np-plakette::before, .bx-np-plakette::after { content: ''; position: absolute; top: 50%; width: calc(var(--u) * 5.6); height: calc(var(--u) * 5.6); margin-top: calc(var(--u) * -2.8); border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff 0 14%, var(--np-gold-h) 26%, var(--np-gold-d) 68%, var(--np-gold-t));
  box-shadow: 0 0 0 calc(var(--r) * .45) rgba(29,12,3,.85); }
.bx-np-plakette::before { left: calc(var(--u) * 3.6); }
.bx-np-plakette::after { right: calc(var(--u) * 3.6); }
.bx-np-titel { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.12;
  font-family: var(--bx-font-display); font-size: calc(var(--u) * 15 * var(--bx-fs, 1)); letter-spacing: .05em; text-transform: uppercase;
  color: #5a2f03; text-shadow: 0 .07em 0 rgba(255,246,214,.85), 0 -.05em 0 rgba(60,28,0,.5); }
.bx-np-plakette i { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.8) 50%, transparent 65%); transform: translateX(-110%); }
.bx-np-schild.da .bx-np-plakette i { animation: bx-np-glanz 1300ms ease-in-out 700ms; }

/* Name groß in Lilita, dunkle Kontur. */
.bx-np-name { position: absolute; left: calc(var(--u) * 92); right: calc(var(--u) * 20); top: calc(var(--u) * 44); bottom: calc(var(--u) * 12); z-index: 2;
  display: flex; align-items: center; justify-content: center; min-width: 0; }
.bx-np-name span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 .1em; line-height: 1.15;
  font-family: var(--bx-font-display); font-size: calc(var(--u) * 33 * var(--bx-fs, 1));
  color: #fff4dc; -webkit-text-stroke: max(2px, .13em) var(--np-tinte); paint-order: stroke fill; text-shadow: 0 .09em 0 var(--np-tinte); }
.bx-np-eigenfarbe .bx-np-name span { color: var(--bx-text, #fff4dc); }
.bx-np-name img.emoji { height: 1em; width: auto; vertical-align: -.12em; margin: 0 .04em; }

/* Profilbild im Goldring, oben ein Dreispitz. */
.bx-np-ring { position: absolute; left: calc(var(--u) * 7); top: calc(var(--u) * 20); width: calc(var(--u) * 76); height: calc(var(--u) * 76); z-index: 4; border-radius: 50%;
  background: conic-gradient(from 200deg, var(--np-gold-t), var(--np-gold-h) 18%, var(--np-gold) 30%, var(--np-gold-d) 50%, var(--np-gold-h) 68%, var(--np-gold-m) 82%, var(--np-gold-t));
  box-shadow: 0 0 0 calc(var(--r) * 1.3) var(--np-tinte), 0 calc(var(--r) * 2.4) 0 rgba(29,12,3,.85), 0 0 calc(var(--r) * 9) rgba(255,190,80,.55); }
.bx-np-bild { position: absolute; inset: 11%; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
  background: radial-gradient(circle at 40% 32%, #3a6f9a, #163552 70%);
  box-shadow: 0 0 0 calc(var(--r) * 1.1) var(--np-tinte), inset 0 calc(var(--r) * 2) calc(var(--r) * 3) rgba(0,0,0,.45); }
.bx-np-bild img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bx-np-bild b { font-family: var(--bx-font-display); font-weight: 400; font-size: calc(var(--u) * 30); color: #fff4dc;
  -webkit-text-stroke: max(1.5px, .1em) var(--np-tinte); paint-order: stroke fill; }
.bx-np-hut { position: absolute; left: calc(var(--u) * 12); top: calc(var(--u) * 9); width: calc(var(--u) * 52); height: calc(var(--u) * 27); z-index: 5;
  transform: rotate(-12deg); transform-origin: 50% 100%; overflow: visible; }
.bx-np-funkel { position: absolute; width: calc(var(--u) * 12); height: calc(var(--u) * 12); z-index: 6; opacity: 0;
  background: radial-gradient(circle, #fff 0 12%, transparent 16%),
    conic-gradient(from 45deg, transparent 0 20deg, #fff8d0 20deg 25deg, transparent 25deg 110deg, #fff8d0 110deg 115deg, transparent 115deg 200deg, #fff8d0 200deg 205deg, transparent 205deg 290deg, #fff8d0 290deg 295deg, transparent 295deg);
  -webkit-mask-image: radial-gradient(circle, #000 30%, transparent 70%); mask-image: radial-gradient(circle, #000 30%, transparent 70%); }
.bx-np-funkel.a { left: calc(var(--u) * 70); top: calc(var(--u) * 22); }
.bx-np-funkel.b { left: calc(var(--u) * 2); top: calc(var(--u) * 70); }
.bx-np-funkel.c { left: calc(var(--u) * 74); top: calc(var(--u) * 78); }
.bx-np-schild.da .bx-np-funkel { animation: bx-np-funkel 1.8s ease-in-out infinite; }
.bx-np-schild.da .bx-np-funkel.b { animation-delay: .6s; }
.bx-np-schild.da .bx-np-funkel.c { animation-delay: 1.2s; }
.bx-np-muenze { position: absolute; left: calc(var(--u) * 40); top: calc(var(--u) * 50); width: calc(var(--u) * 10); height: calc(var(--u) * 10); z-index: 6; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle at 35% 30%, #fff 0 10%, var(--np-gold-h) 20%, var(--np-gold) 50%, var(--np-gold-d));
  box-shadow: 0 0 0 calc(var(--r) * .6) var(--np-tinte), inset 0 0 0 calc(var(--r) * .7) rgba(168,112,26,.85), 0 0 calc(var(--r) * 5) rgba(255,214,110,.9); }
.bx-np-schild.da .bx-np-muenze { animation: bx-np-muenze 1100ms cubic-bezier(.25,.7,.4,1) 450ms forwards; animation-delay: calc(450ms + var(--d, 0ms)); }

/* Möwe: segelt einmal von rechts nach links über das Schild. */
.bx-np-moewe { position: absolute; right: 0; top: calc(var(--u) * 1); width: calc(var(--u) * 40); height: calc(var(--u) * 21); z-index: 7; opacity: 0; }
.bx-np-moewe svg { width: 100%; height: 100%; overflow: visible; }
.bx-np-schild.da ~ .bx-np-moewe { animation: bx-np-moewe 4200ms linear 500ms forwards; }
.bx-np-fluegel { transform-origin: 50% 70%; animation: bx-np-flattern 420ms ease-in-out infinite alternate; }

@keyframes bx-np-rein {
  0% { transform: translateY(-115%) rotate(0deg); opacity: 1; }
  45% { transform: translateY(4%) rotate(4deg); }
  62% { transform: translateY(-2%) rotate(-3deg); }
  78% { transform: translateY(1%) rotate(1.6deg); }
  90% { transform: rotate(-.6deg); }
  100% { transform: none; opacity: 1; } }
@keyframes bx-np-raus { 0% { transform: none; } 25% { transform: translateY(4%) rotate(-1deg); } 100% { transform: translateY(-115%) rotate(2deg); } }
@keyframes bx-np-glanz { from { transform: translateX(-110%); } to { transform: translateX(110%); } }
@keyframes bx-np-funkel { 0%, 100% { opacity: 0; transform: scale(.3) rotate(0deg); } 40% { opacity: 1; transform: scale(1) rotate(45deg); } 70% { opacity: 0; transform: scale(.4) rotate(90deg); } }
@keyframes bx-np-muenze {
  0% { opacity: 0; transform: translate(0, 0) scale(.4) rotateY(0deg); }
  15% { opacity: 1; }
  55% { opacity: 1; transform: translate(calc(var(--dx, 0px) * .7), var(--dy, -20px)) scale(1) rotateY(300deg); }
  100% { opacity: 0; transform: translate(var(--dx, 0px), calc(var(--dy, -20px) * .1)) scale(.7) rotateY(600deg); } }
@keyframes bx-np-moewe {
  0% { opacity: 0; transform: translate(0, calc(var(--u) * 6)); }
  8% { opacity: 1; }
  50% { transform: translate(calc(var(--u) * -200), 0); }
  90% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(var(--u) * -380), calc(var(--u) * 5)); } }
@keyframes bx-np-flattern { from { transform: scaleY(1); } to { transform: scaleY(-.5); } }

@media (prefers-reduced-motion: reduce) {
  .bx-np *, .bx-np *::before, .bx-np *::after { animation: none !important; }
  .bx-np-moewe, .bx-np-funkel, .bx-np-muenze { display: none; } }
html.bx-perf .bx-np *, html.bx-perf .bx-np *::before, html.bx-perf .bx-np *::after { animation: none !important; }
html.bx-perf .bx-np-moewe, html.bx-perf .bx-np-funkel, html.bx-perf .bx-np-muenze { display: none; }
/* Rahmen ausblenden: kein Holz und keine Taue — Plakette, Ring und Name bleiben. */
html .bx-frameless .bx-np-brett { background: none; box-shadow: none; }
html .bx-frameless .bx-np-brett::before, html .bx-frameless .bx-np-nieten, html .bx-frameless .bx-np-seil { display: none; }
`;

// Dreispitz: schwarzer Hut mit Goldborte und Totenkopf.
const HUT_SVG = '<svg class="bx-np-hut" viewBox="0 0 56 30" aria-hidden="true"><g stroke="#1d0c03" stroke-width="2" stroke-linejoin="round">'
  + '<path d="M3 24Q10 6 28 4Q46 6 53 24Q40 18 28 21Q16 18 3 24z" fill="#2a1a12"/>'
  + '<path d="M6 22Q16 16.5 28 19Q40 16.5 50 22" fill="none" stroke="#f5c451" stroke-width="2.2"/>'
  + '<path d="M10 14Q18 8 28 7.4" fill="none" stroke="#5c4636" stroke-width="1.6"/>'
  + '<circle cx="28" cy="13" r="3.6" fill="#fff4dc" stroke-width="1.2"/><path d="M24.6 17.6l6.8-2.4M24.6 15.2l6.8 2.4" stroke="#fff4dc" stroke-width="1.3"/>'
  + '<circle cx="26.8" cy="12.7" r=".8" fill="#1d0c03" stroke="none"/><circle cx="29.2" cy="12.7" r=".8" fill="#1d0c03" stroke="none"/>'
  + '</g></svg>';

const MOEWE_SVG = '<svg viewBox="0 0 30 16" aria-hidden="true"><g stroke="#1d0c03" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">'
  + '<path class="bx-np-fluegel" d="M15 9Q9 1 1.5 4Q8 5.5 12 10.5z" fill="#f4f7fb"/>'
  + '<path class="bx-np-fluegel" d="M15 9Q21 1 28.5 4Q22 5.5 18 10.5z" fill="#dfe6ee"/>'
  + '<path d="M10 10.5Q15 7.6 20.5 10.2Q16 13.4 10 10.5z" fill="#fff"/><path d="M9.4 10.2l-3 .8 3 .9z" fill="#f5a623"/>'
  + '<circle cx="11.4" cy="9.9" r=".5" fill="#1d0c03" stroke="none"/></g></svg>';

export const STANDARD_IGNORIEREN = ['StreamElements', 'Nightbot', 'Moobot'];
const ANONYM_ID = 'twitch:anonym';
const MAX_SCHLANGE = 25;
const STANDARD_DAUER = 5000;

/** Ignorier-Liste aus der Einstellung: Liste oder Text (Komma, Strich, Zeile). */
export function ignorierListe(wert) {
  const roh = Array.isArray(wert) ? wert : typeof wert === 'string' ? wert.split(/[,|\n]/) : STANDARD_IGNORIEREN;
  return roh.filter((x) => typeof x === 'string').map((x) => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
}

/**
 * Wer soll begrüßt werden? DOM-frei, damit prüfbar.
 * @param {any} e Ereignis
 * @param {{ plattform: 'twitch'|'tiktok'|'alle', ignorieren: string[] }} opt
 * @returns {{ id: string, name: string, bild: string } | null}
 */
export function neuerPirat(e, opt) {
  if (!e || typeof e !== 'object' || e.type !== 'chat' || e.firstOfUser !== true || e.sticky) return null;
  const p = e.plattform;
  if (opt.plattform !== 'alle' && p && p !== opt.plattform) return null;
  const u = e.user && typeof e.user === 'object' ? e.user : null;
  if (!u || typeof u.id !== 'string' || !u.id || u.id === ANONYM_ID || u.isBroadcaster === true) return null;
  const roh = [u.nickname, u.uniqueId, u.userId].find((x) => typeof x === 'string' && x.trim());
  if (!roh) return null;
  const namen = [u.nickname, u.userId, u.uniqueId].filter((x) => typeof x === 'string').map((x) => x.trim().toLowerCase());
  if (namen.some((n) => opt.ignorieren.includes(n))) return null;
  const name = roh.trim().length > 60 ? `${roh.trim().slice(0, 60)}…` : roh.trim();
  const bild = typeof u.profilePic === 'string' && /^https?:\/\//.test(u.profilePic) ? u.profilePic : '';
  return { id: u.id, name, bild };
}

const DEMO = [
  { id: 'd1', name: 'Muschelmia', bild: '' },
  { id: 'd2', name: 'KäptnBlaubär', bild: '' },
  { id: 'd3', name: 'Klabauter_Kalle🏴‍☠️', bild: '' },
];

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

export default class NeuerPirat {
  constructor(root, props, ctx) {
    ensureStyle();
    const p = props && typeof props === 'object' ? props : {};
    this.opt = {
      plattform: p.plattform === 'tiktok' || p.plattform === 'alle' ? p.plattform : 'twitch',
      ignorieren: ignorierListe(p.ignorieren),
    };
    const d = Number(p.dauerMs);
    this.dauer = Number.isFinite(d) && d >= 1500 ? Math.min(d, 30000) : STANDARD_DAUER;
    this.titel = typeof p.titel === 'string' && p.titel.trim() ? p.titel.trim() : 'NEUER PIRAT AN BORD!';
    this.schlange = [];
    this.aktuell = null;
    this.timers = new Set();
    this.zerstoert = false;
    this.el = document.createElement('div');
    this.el.className = `bx-np${p.textColor ? ' bx-np-eigenfarbe' : ''}`;
    if (!p.fontFamily) {
      this.el.style.setProperty('--bx-font-display', "'Lilita One', 'Arial Black'");
      this.el.style.setProperty('--bx-font-body', "'Saira Semi Condensed', 'Arial Narrow'");
    }
    this.buehne = document.createElement('div');
    this.buehne.className = 'bx-np-buehne';
    this.el.appendChild(this.buehne);
    root.appendChild(this.el);
    if (ctx && ctx.preview) {
      // Editor: sofort ein Schild zeigen, dann reihum weitere Neue.
      this.demoNr = 0;
      this.zeige(DEMO[0]);
      this.demoTimer = setInterval(() => {
        if (this.aktuell || this.schlange.length) return;
        this.demoNr = (this.demoNr + 1) % DEMO.length;
        this.zeige(DEMO[this.demoNr]);
      }, this.dauer + 2200);
    }
  }

  /** Ein Schild bauen und hereinschwingen lassen; nach `dauer` wieder hoch. */
  zeige(pirat) {
    if (this.zerstoert) return;
    this.aktuell = pirat;
    for (const alt of [...this.buehne.children]) alt.remove();
    const schild = document.createElement('div');
    schild.className = 'bx-np-schild';
    schild.innerHTML = '<i class="bx-np-seil l"></i><i class="bx-np-seil r"></i>'
      + '<div class="bx-np-brett"><i class="bx-np-nieten"></i></div>'
      + '<div class="bx-np-plakette"><span class="bx-np-titel"></span><i></i></div>'
      + '<div class="bx-np-name"><span></span></div>'
      + '<div class="bx-np-ring"><div class="bx-np-bild"></div></div>'
      + HUT_SVG
      + '<i class="bx-np-funkel a"></i><i class="bx-np-funkel b"></i><i class="bx-np-funkel c"></i>';
    schild.querySelector('.bx-np-titel').textContent = this.titel;
    const nameEl = document.createElement('span');
    setzeTextMitEmojis(nameEl, pirat.name);
    const nameBox = schild.querySelector('.bx-np-name');
    for (const alt of [...nameBox.children]) alt.remove();
    nameBox.appendChild(nameEl);
    this.setzeBild(schild.querySelector('.bx-np-bild'), pirat);
    for (let k = 0; k < 6; k++) {
      const m = document.createElement('i');
      m.className = 'bx-np-muenze';
      m.style.setProperty('--dx', `calc(var(--u) * ${Math.round(-30 + k * 14)})`);
      m.style.setProperty('--dy', `calc(var(--u) * ${Math.round(-34 - Math.random() * 20)})`);
      m.style.setProperty('--d', `${k * 60}ms`);
      schild.appendChild(m);
    }
    const moewe = document.createElement('div');
    moewe.className = 'bx-np-moewe';
    moewe.innerHTML = MOEWE_SVG;
    this.buehne.appendChild(schild);
    this.buehne.appendChild(moewe);
    void schild.offsetWidth;
    schild.classList.add('da');
    this.spaeter(this.dauer, () => {
      schild.classList.remove('da');
      schild.classList.add('weg');
      this.spaeter(700, () => {
        schild.remove();
        moewe.remove();
        this.aktuell = null;
        this.weiter();
      });
    });
  }

  /** Profilbild oder — ohne Bild / wenn es nicht lädt — der Anfangsbuchstabe. */
  setzeBild(box, pirat) {
    const buchstabe = () => {
      for (const alt of [...box.children]) alt.remove();
      const b = document.createElement('b');
      b.textContent = (Array.from(pirat.name)[0] || '?').toUpperCase();
      box.appendChild(b);
    };
    if (!pirat.bild) { buchstabe(); return; }
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', buchstabe);
    img.src = pirat.bild;
    box.appendChild(img);
  }

  weiter() {
    if (this.zerstoert || this.aktuell) return;
    const naechster = this.schlange.shift();
    if (naechster) this.zeige(naechster);
  }

  onEvent(e) {
    if (this.zerstoert) return;
    const pirat = neuerPirat(e, this.opt);
    if (!pirat) return;
    if (this.demoTimer) { clearInterval(this.demoTimer); this.demoTimer = null; }
    // Dieselbe Person nicht doppelt (z.B. zwei Nachrichten, bevor der Stand gespeichert ist).
    if ((this.aktuell && this.aktuell.id === pirat.id) || this.schlange.some((x) => x.id === pirat.id)) return;
    if (this.schlange.length >= MAX_SCHLANGE) return;
    this.schlange.push(pirat);
    this.weiter();
  }

  spaeter(ms, f) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (this.zerstoert) return;
      try { f(); } catch { this.aktuell = null; } // Sperre fällt auch im Fehlerfall
    }, ms);
    this.timers.add(id);
    return id;
  }

  destroy() {
    this.zerstoert = true;
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = null;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.schlange = [];
    this.el.remove();
  }
}
