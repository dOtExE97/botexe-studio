// piraten-infoleiste.js — „Letzter Follower / Abo / Cheer / Raid / Geschenk"
// als Reihe einzelner Piraten-Schilder, wie die Infoleiste unten im Bild bei
// großen Twitch-Streamern — nur im Look der Schatzkiste: gemasertes Holzbrett
// mit Messingrahmen, an zwei Tauen aufgehängt, links ein Goldmedaillon mit
// Symbol, daneben kleine Überschrift und der Name (Lilita, gekürzt) mit Wert.
//
// Neues Ereignis: Das Schild schwingt wie im Wind, Goldblitz, Münzen springen,
// der Name gleitet herein, ein „NEU"-Band hängt 4 s an der Ecke.
// Ruhe: Glanz läuft Schild für Schild durch, Medaillons wippen, Taue pendeln.
// Reduzierte Bewegung und Sparmodus (html.bx-perf): alles still.
//
// Reconnect-Replay (event.sticky): stellt die letzten Werte wieder her —
// genau dafür ist er da —, aber ohne Feier. Der Bus merkt sich je Art UND
// Plattform einen Wert; beim Nachliefern gewinnt deshalb der jüngere (ts).
// Test-Ereignisse (synthetic) zählen ganz normal: so sieht man den Effekt.
//
// props: { slots?: string[], plattform?: 'alle'|'twitch'|'tiktok',
//          anordnung?: 'reihe'|'stapel', einblenden?: boolean, fontFamily?, textColor? }
import { setzeTextMitEmojis } from './emoji-bild.js';

const STYLE_ID = 'bx-pi-style';

// Holzmaserung als Rauschkachel — wie bei Schatzkiste/Schatz-Podest, aber mit
// einer breiten Kachel (1000 × 100, baseFrequency × Kante ganzzahlig): Die
// kurze Kachel der Kiste wiederholte sich auf den langen Brettern der Leiste
// sichtbar — alle paar Zentimeter stand eine Naht im Holz.
const MASERUNG = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='100'%3E %3Cfilter id='m' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.008 0.32' numOctaves='3' seed='11' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 0.14 0 0 0 0 0.06 0 0 0 0 0.01 0 0 0 2.2 -1.0'/%3E%3C/filter%3E %3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E\")";

const CSS = `
/* Wurzel = Größen-Container der Box. Jedes Schild ist selbst wieder ein
   Container: alles darin misst sich an der SCHILDHÖHE (cqh) — so passt
   dasselbe Schild in die Reihe (1600x84) wie in den Stapel (360x300).
   Konturen nur als box-shadow, nie border (Rahmen ausblenden). Licht von oben
   links, dicke dunkle Kontur, harter Schlagschatten nach unten. */
.bx-pi { position: absolute; inset: 0; container-type: size; display: flex; box-sizing: border-box; pointer-events: none;
  --pi-tinte: #1d0c03; --pi-holz-h: #d9924a; --pi-holz: #a65d27; --pi-holz-d: #5e2f10;
  --pi-gold-h: #fff4c8; --pi-gold: #f5c451; --pi-gold-m: #d49a2e; --pi-gold-d: #a8701a; --pi-gold-t: #6b3f08; }
.bx-pi-reihe { flex-direction: row; align-items: center; gap: clamp(4px, 1.1cqi, 24px); }
.bx-pi-stapel { flex-direction: column; justify-content: center; gap: clamp(3px, 2.6cqh, 14px); }
.bx-pi-tafel { position: relative; container-type: size; min-width: 0; flex: 1 1 0; }
/* In der Reihe nie höher als ~36 % der eigenen Breite (sonst wird in einer
   hohen Box ein Turm aus Holz daraus); im Stapel teilen sich die Schilder die
   Höhe, höchstens 30 % der Breite. */
.bx-pi-reihe .bx-pi-tafel { height: min(100cqh, calc(100cqi / var(--n, 4) * .36)); }
.bx-pi-stapel .bx-pi-tafel { flex: 0 0 auto; width: 100%;
  height: min(calc((100cqh - (var(--n, 4) - 1) * clamp(3px, 2.6cqh, 14px)) / var(--n, 4)), 30cqi); }
.bx-pi-tafel { --r: clamp(1px, 2.4cqh, 2.6px); }

/* Taue: oben aus dem Bild, unten ein Messingring auf der Brettkante. */
.bx-pi-seil { position: absolute; top: 0; height: 18cqh; width: clamp(2.5px, 6cqh, 7px); z-index: 3; transform-origin: 50% 0;
  border-radius: 0 0 2px 2px;
  background: linear-gradient(90deg, rgba(255,240,200,.5), transparent 40%, rgba(40,16,2,.45)),
    repeating-linear-gradient(150deg, #f6dca6 0 1.3px, #c08a45 1.3px 2.8px, #6e4018 2.8px 3.8px);
  box-shadow: 0 0 0 calc(var(--r) * .55) var(--pi-tinte);
  animation: bx-pi-seil 4.8s ease-in-out infinite alternate; animation-delay: calc(var(--i, 0) * -.8s); }
/* Messingöse: Ring mit Loch, durch das das Tau läuft. */
.bx-pi-seil::after { content: ''; position: absolute; left: 50%; bottom: -5cqh; width: 11cqh; aspect-ratio: 1; translate: -50% 0; border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, transparent 0 30%, var(--pi-tinte) 30% 40%, transparent 40%),
    radial-gradient(circle at 36% 30%, #fff 0 8%, var(--pi-gold-h) 16%, var(--pi-gold) 34%, var(--pi-gold-d) 60%, var(--pi-gold-t) 76%);
  box-shadow: 0 0 0 calc(var(--r) * .6) var(--pi-tinte), 0 calc(var(--r) * .8) 0 rgba(29,12,3,.65); }
.bx-pi-seil-l { left: calc(46cqh + (100cqi - 46cqh) * .2); }
.bx-pi-seil-r { right: calc((100cqi - 46cqh) * .1); }

/* Das Schild (Brett + Medaillon) schwingt als Ganzes um die Brett-Oberkante. */
.bx-pi-schild { position: absolute; inset: 0; transform-origin: 50% 16cqh; }

/* Brett: zwei Planken (Fuge in der Mitte), Maserung, oben Licht, unten dunkel,
   Messingrahmen (::before), Glanzstreif (::after). */
.bx-pi-brett { position: absolute; left: 46cqh; right: .5cqi; top: 16cqh; bottom: 7cqh; overflow: hidden;
  border-radius: 9cqh 14cqh 12cqh 8cqh / 12cqh 18cqh 16cqh 10cqh;
  background:
    linear-gradient(180deg, rgba(255,232,190,.4) 0 4%, rgba(255,220,170,.1) 14%, transparent 42%, rgba(25,8,0,.42)),
    linear-gradient(90deg, rgba(0,0,0,.22), transparent 14%, transparent 78%, rgba(0,0,0,.32)),
    linear-gradient(180deg, transparent calc(53% - var(--r) * 1.1), rgba(20,8,2,.7) calc(53% - var(--r) * 1.1) 53%, rgba(255,200,140,.26) 53% calc(53% + var(--r) * .7), transparent calc(53% + var(--r) * .7)),
    ${MASERUNG} 0 0 / 1000cqh 100cqh,
    linear-gradient(180deg, var(--pi-holz-h), var(--pi-holz) 55%, var(--pi-holz-d));
  box-shadow: 0 0 0 calc(var(--r) * 1.2) var(--pi-tinte),
    inset 0 0 0 calc(var(--r) * 2.5) var(--pi-tinte),
    inset 0 calc(var(--r) * 4) calc(var(--r) * 3) rgba(0,0,0,.35),
    0 calc(var(--r) * 2.2) 0 rgba(29,12,3,.9), 0 calc(var(--r) * 4) calc(var(--r) * 7) rgba(0,0,0,.5); }
.bx-pi-brett::before { content: ''; position: absolute; inset: 0; z-index: 1; border-radius: inherit; padding: calc(var(--r) * 1.6); pointer-events: none;
  background: linear-gradient(180deg, var(--pi-gold-h), var(--pi-gold) 28%, var(--pi-gold-m) 62%, var(--pi-gold-t));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
.bx-pi-brett::after { content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background: linear-gradient(105deg, transparent 38%, rgba(255,240,200,.16) 45%, rgba(255,250,230,.55) 50%, rgba(255,240,200,.16) 55%, transparent 62%);
  transform: translateX(-100%); animation: bx-pi-glanz 7.2s ease-in-out infinite; animation-delay: calc(var(--i, 0) * .6s + 1.2s); }
/* Messingnieten rechts oben/unten. */
.bx-pi-nieten { position: absolute; inset: 0; z-index: 2; pointer-events: none;
  --nd: clamp(5px, 10cqh, 13px);
  background:
    radial-gradient(circle at 42% 40%, #fff 0 9%, var(--pi-gold-h) 18%, #e0a93c 36%, #8a5310 54%, var(--pi-tinte) 60% 68%, transparent 72%) right calc(var(--r) * 2.6) top calc(var(--r) * 2.6) / var(--nd) var(--nd) no-repeat,
    radial-gradient(circle at 42% 40%, #fff 0 9%, var(--pi-gold-h) 18%, #e0a93c 36%, #8a5310 54%, var(--pi-tinte) 60% 68%, transparent 72%) right calc(var(--r) * 2.6) bottom calc(var(--r) * 2.6) / var(--nd) var(--nd) no-repeat,
    url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cg fill='none' stroke='%23280e02' stroke-opacity='.5' stroke-width='1.3'%3E%3Ccircle cx='20' cy='20' r='15.5'/%3E%3Ccircle cx='20' cy='20' r='12.8' stroke-dasharray='1.4 2'/%3E%3C/g%3E%3Cpath d='M20 1.5l3 15.5 15.5 3-15.5 3-3 15.5-3-15.5-15.5-3 15.5-3z' fill='%23280e02' fill-opacity='.42'/%3E%3Cpath d='M20 20l9-9-6.4 11.2zM20 20l-9 9 6.4-11.2zM20 20l9 9-11.2-6.4zM20 20l-9-9 11.2 6.4z' fill='%23280e02' fill-opacity='.3'/%3E%3C/svg%3E\") right 9cqh center / 64cqh 64cqh no-repeat,
    radial-gradient(ellipse 7cqh 3.2cqh at 62% 74%, rgba(40,14,2,.6), rgba(40,14,2,.22) 55%, transparent 72%),
    radial-gradient(ellipse 15cqh 6.5cqh at 62% 74%, transparent 52%, rgba(50,20,3,.28) 62%, transparent 74%); }

/* Goldmedaillon mit Symbol, sitzt vorn auf dem Brettende. */
.bx-pi-med { position: absolute; left: 0; top: 3cqh; height: 92cqh; aspect-ratio: 1; border-radius: 50%; z-index: 4; overflow: hidden;
  color: #5a2f03;
  background: radial-gradient(circle at 34% 28%, #fffbe6 0 6%, #ffe39a 16%, var(--pi-gold) 34%, var(--pi-gold-m) 58%, #8a5310 86%, #5a3008);
  box-shadow: 0 0 0 calc(var(--r) * 1.2) var(--pi-tinte), inset 0 calc(var(--r) * .9) 0 rgba(255,255,255,.65),
    inset 0 calc(var(--r) * -1.3) calc(var(--r) * 1) rgba(90,45,0,.6),
    0 calc(var(--r) * 2.2) 0 rgba(29,12,3,.85), 0 0 calc(var(--r) * 8) rgba(255,190,80,.45);
  animation: bx-pi-wippen 3.8s ease-in-out infinite; animation-delay: calc(var(--i, 0) * -.95s); }
/* Eingelassene Mitte mit dunkler Linie (Prägung). */
.bx-pi-med::before { content: ''; position: absolute; inset: 14%; border-radius: 50%;
  background: radial-gradient(circle at 40% 34%, #ffeaa8, #f0b94a 46%, #c98a26 82%);
  box-shadow: 0 0 0 calc(var(--r) * .7) rgba(107,63,8,.7), 0 calc(var(--r) * .6) 0 calc(var(--r) * .7) rgba(255,246,214,.45),
    inset 0 calc(var(--r) * 1.3) calc(var(--r) * 1.6) rgba(107,63,8,.6), inset 0 calc(var(--r) * -.8) 0 rgba(255,246,214,.6); }
.bx-pi-med::after { content: ''; position: absolute; inset: -10%; z-index: 2; pointer-events: none;
  background: linear-gradient(115deg, transparent 36%, rgba(255,255,255,.85) 50%, transparent 64%);
  transform: translateX(-120%); animation: bx-pi-glanz-med 7.2s ease-in-out infinite; animation-delay: calc(var(--i, 0) * .6s + 1.2s); }
/* Perlrand zwischen Rand und Mitte. */
.bx-pi-perlen { position: absolute; inset: 6%; border-radius: 50%; z-index: 0;
  background: repeating-conic-gradient(rgba(107,63,8,.7) 0 4.5deg, transparent 4.5deg 12deg);
  -webkit-mask-image: radial-gradient(circle, transparent 0 85%, #000 87% 96%, transparent 98%); mask-image: radial-gradient(circle, transparent 0 85%, #000 87% 96%, transparent 98%); }
.bx-pi-med svg { position: absolute; left: 24%; top: 24%; width: 52%; height: 52%; z-index: 1; overflow: visible;
  filter: drop-shadow(0 calc(var(--r) * .7) 0 rgba(255,246,214,.75)); }

/* Text: kleine Überschrift, darunter Name (Lilita, dunkle Kontur) und Wert. */
.bx-pi-text { position: absolute; top: 0; bottom: 0; left: 51cqh; right: 8cqh; z-index: 2; min-width: 0;
  display: flex; flex-direction: column; justify-content: center; gap: 1.5cqh; padding-top: 1cqh; }
.bx-pi-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.05;
  font-family: var(--bx-font-body); font-weight: 700; text-transform: uppercase; letter-spacing: .1em;
  font-size: calc(clamp(7px, min(15cqh, 4.4cqi), 18px) * var(--bx-fs, 1));
  color: #ffe39a; text-shadow: 0 .09em 0 var(--pi-tinte), 0 0 .35em rgba(0,0,0,.7); }
.bx-pi-zeile { display: flex; align-items: baseline; gap: .3em; min-width: 0; line-height: 1.12; }
.bx-pi-name { flex: 0 1 auto; min-width: min(2.6em, 40%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 .08em;
  font-family: var(--bx-font-display); font-size: calc(clamp(10px, min(31cqh, 9cqi), 38px) * var(--bx-fs, 1));
  color: #fff4dc; -webkit-text-stroke: max(2px, .13em) var(--pi-tinte); paint-order: stroke fill; text-shadow: 0 .09em 0 var(--pi-tinte); }
.bx-pi-eigenfarbe .bx-pi-name { color: var(--bx-text, #fff4dc); }
.bx-pi-name img.emoji { height: 1em; width: auto; vertical-align: -.12em; margin: 0 .04em; }
.bx-pi-wert { flex: 0 0 auto; min-width: 0; max-width: 58%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: .08em;
  font-family: var(--bx-font-display); font-size: calc(clamp(9px, min(22cqh, 6.6cqi), 28px) * var(--bx-fs, 1));
  color: #ffd23e; -webkit-text-stroke: max(1.5px, .12em) var(--pi-tinte); paint-order: stroke fill; text-shadow: 0 .09em 0 var(--pi-tinte); }
.bx-pi-wert:empty { display: none; }
.bx-pi-wert::before { content: '· '; color: #ffe9b0; }
/* Leer: gestalteter Platzhalter statt einer Lücke. */
.bx-pi-leer .bx-pi-name { flex: none; min-width: 0; color: rgba(255,226,160,.6); }
.bx-pi-leer .bx-pi-wert { flex: 0 1 auto; max-width: none; font-family: var(--bx-font-body); font-weight: 600; font-style: italic;
  font-size: calc(clamp(7px, min(15cqh, 4.6cqi), 18px) * var(--bx-fs, 1)); color: #fbe6bf; -webkit-text-stroke: 0;
  text-shadow: 0 .09em 0 var(--pi-tinte), 0 0 .4em rgba(0,0,0,.75); }
.bx-pi-leer .bx-pi-wert::before { content: none; }
.bx-pi-leer .bx-pi-med { filter: saturate(.45) brightness(.82); }

/* „NEU"-Band an der Ecke (4 s nach einem Ereignis). */
.bx-pi-band { position: absolute; top: 9cqh; right: -19cqh; width: 74cqh; height: 19cqh; z-index: 4; display: grid; place-items: center;
  transform: rotate(36deg); opacity: 0; scale: .3;
  background: linear-gradient(180deg, #ff6a55, #d01e24 55%, #8c0c12);
  box-shadow: 0 0 0 calc(var(--r) * .6) var(--pi-tinte), inset 0 calc(var(--r) * .9) 0 #ffd56b, inset 0 calc(var(--r) * -.9) 0 #ffd56b;
  font-family: var(--bx-font-display); font-size: clamp(7px, 13.5cqh, 18px); letter-spacing: .1em; line-height: 1; padding-top: .08em;
  color: #fff6e0; text-shadow: 0 .08em 0 #5a0408; }
.bx-pi-frisch .bx-pi-band { opacity: 1; scale: 1; animation: bx-pi-band 560ms cubic-bezier(.2,1.6,.4,1); }

/* Goldblitz hinter dem Medaillon + springende Münzen (nur bei einem Ereignis). */
.bx-pi-blitz { position: absolute; left: -29cqh; top: -26cqh; width: 150cqh; height: 150cqh; z-index: 5; border-radius: 50%; pointer-events: none; opacity: 0;
  background: radial-gradient(circle, rgba(255,252,230,.95) 0 7%, rgba(255,220,120,.75) 20%, rgba(255,170,40,.28) 40%, transparent 62%),
    repeating-conic-gradient(from 0deg, rgba(255,236,170,.75) 0 5deg, transparent 5deg 20deg);
  -webkit-mask-image: radial-gradient(circle, #000 22%, transparent 68%); mask-image: radial-gradient(circle, #000 22%, transparent 68%);
  mix-blend-mode: screen; }
.bx-pi-schwung .bx-pi-blitz { animation: bx-pi-blitz 950ms ease-out; }
.bx-pi-muenze { position: absolute; left: 37cqh; top: 40cqh; width: 18cqh; height: 18cqh; z-index: 6; border-radius: 50%; opacity: 0; pointer-events: none;
  background: radial-gradient(circle at 35% 30%, #fff 0 10%, var(--pi-gold-h) 20%, var(--pi-gold) 50%, var(--pi-gold-d));
  box-shadow: 0 0 0 calc(var(--r) * .6) var(--pi-tinte), inset 0 0 0 calc(var(--r) * .7) rgba(168,112,26,.85), 0 0 calc(var(--r) * 5) rgba(255,214,110,.9);
  animation: bx-pi-muenze 1050ms cubic-bezier(.25,.7,.4,1) forwards; animation-delay: var(--d, 0ms); }

/* Ereignis: Schild schwingt um die Oberkante, Brett blitzt auf, Name gleitet herein. */
.bx-pi-schwung .bx-pi-schild { animation: bx-pi-schwung 1200ms cubic-bezier(.3,.6,.4,1); }
.bx-pi-schwung .bx-pi-brett { animation: bx-pi-auf 950ms ease-out; }
.bx-pi-schwung .bx-pi-zeile { animation: bx-pi-name-ein 680ms cubic-bezier(.16,1.1,.3,1) 160ms backwards; }

/* Auftritt beim Laden: Schild für Schild von unten herein. */
.bx-pi-einblenden .bx-pi-tafel { animation: bx-pi-ein 760ms cubic-bezier(.2,1.25,.35,1) backwards; animation-delay: calc(var(--i, 0) * 140ms + 150ms); }

@keyframes bx-pi-seil { from { rotate: -2.4deg; } to { rotate: 2.4deg; } }
@keyframes bx-pi-wippen { 0%, 100% { translate: 0 0; rotate: -2deg; } 50% { translate: 0 -2.4cqh; rotate: 2deg; } }
@keyframes bx-pi-glanz { 0%, 78% { transform: translateX(-100%); } 93%, 100% { transform: translateX(100%); } }
@keyframes bx-pi-glanz-med { 0%, 74% { transform: translateX(-120%); } 84%, 100% { transform: translateX(120%); } }
@keyframes bx-pi-schwung {
  0% { transform: perspective(420cqh) rotateX(0deg); }
  13% { transform: perspective(420cqh) rotateX(-46deg) rotateZ(-1.2deg); }
  32% { transform: perspective(420cqh) rotateX(28deg) rotateZ(.9deg); }
  50% { transform: perspective(420cqh) rotateX(-17deg) rotateZ(-.5deg); }
  68% { transform: perspective(420cqh) rotateX(8deg); }
  84% { transform: perspective(420cqh) rotateX(-3deg); }
  100% { transform: perspective(420cqh) rotateX(0deg); } }
@keyframes bx-pi-auf { 0% { filter: brightness(1); } 18% { filter: brightness(1.55) saturate(1.2); } 100% { filter: brightness(1); } }
@keyframes bx-pi-name-ein { from { opacity: 0; transform: translateX(-1.4em); filter: blur(3px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes bx-pi-band { from { scale: .3; opacity: 0; } to { scale: 1; opacity: 1; } }
@keyframes bx-pi-blitz { 0% { opacity: 0; scale: .3; rotate: 0deg; } 20% { opacity: 1; } 100% { opacity: 0; scale: 1.35; rotate: 45deg; } }
@keyframes bx-pi-muenze {
  0% { opacity: 0; transform: translate(0, 0) scale(.4) rotate(0deg); }
  12% { opacity: 1; }
  55% { opacity: 1; transform: translate(calc(var(--dx, 0cqh) * .7), var(--dy, -40cqh)) scale(1) rotate(190deg) rotateY(300deg); }
  100% { opacity: 0; transform: translate(var(--dx, 0cqh), calc(var(--dy, -40cqh) * .35)) scale(.7) rotate(340deg) rotateY(560deg); } }
@keyframes bx-pi-ein { from { opacity: 0; transform: translateY(60%) scale(.92); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .bx-pi *, .bx-pi *::before, .bx-pi *::after { animation: none !important; }
  .bx-pi-blitz, .bx-pi-muenze { display: none; } }
html.bx-perf .bx-pi *, html.bx-perf .bx-pi *::before, html.bx-perf .bx-pi *::after { animation: none !important; }
html.bx-perf .bx-pi-blitz, html.bx-perf .bx-pi-muenze { display: none; }
/* Rahmen ausblenden: nur Medaillon und Schrift bleiben. */
html .bx-frameless .bx-pi-brett { background: none; box-shadow: none; }
html .bx-frameless .bx-pi-brett::before, html .bx-frameless .bx-pi-brett::after,
html .bx-frameless .bx-pi-seil, html .bx-frameless .bx-pi-nieten { display: none; }
html .bx-frameless .bx-pi-label { -webkit-text-stroke: .22em var(--pi-tinte); paint-order: stroke fill; }
`;

// Symbole (24er-Raster), gefüllt in der Prägefarbe des Medaillons.
const SYMBOLE = {
  // Anker
  follow: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.6" r="2.1"/><path d="M12 6.8V21"/><path d="M7.6 10.2h8.8"/><path d="M4.2 13.6c.4 4.3 3.7 7.4 7.8 7.4s7.4-3.1 7.8-7.4"/></g><path d="M2 15.2l2.2-3.6 2.6 3z M22 15.2l-2.2-3.6-2.6 3z" fill="currentColor"/></svg>',
  // Stern
  sub: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.4 7 1-5.1 4.9 1.2 7L12 17.8l-6.2 3.3 1.2-7L1.9 9.2l7-1z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>',
  // Münzstapel + stehende Münze
  cheer: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><path d="M1.8 17.6v2.1c0 1.4 2.8 2.5 6.2 2.5s6.2-1.1 6.2-2.5v-2.1c0 1.4-2.8 2.5-6.2 2.5s-6.2-1.1-6.2-2.5z"/><path d="M1.8 13.8v2.1c0 1.4 2.8 2.5 6.2 2.5s6.2-1.1 6.2-2.5v-2.1c0 1.4-2.8 2.5-6.2 2.5s-6.2-1.1-6.2-2.5z"/><ellipse cx="8" cy="13.6" rx="6.2" ry="2.5"/><circle cx="17" cy="8.6" r="5.6"/></g><circle cx="17" cy="8.6" r="3.3" fill="none" stroke="#f0b94a" stroke-width="1.3"/><path d="M5 13.4h6" stroke="#f0b94a" stroke-width="1.1" stroke-linecap="round"/></svg>',
  // Schiff mit Segeln
  raid: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><path d="M2.2 15.4h19.6l-3 5H5.2z"/><path d="M11.2 2.4h1.6v13h-1.6z"/><path d="M13.6 3.6c3.6 1.7 5.6 5 5.8 9.9h-5.8z"/><path d="M10.4 5.4c-2.9 1.6-4.4 4.2-4.8 8.1h4.8z"/><path d="M12.8 1.8l4 1.3-4 1.3z"/></g><path d="M1.6 22.4c1.4-1 2.8-1 4.2 0s2.8 1 4.2 0 2.8-1 4.2 0 2.8 1 4.2 0 2.8-1 4.2 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  // Geschenk
  gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><path d="M3.6 11.4h16.8v9.8a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1z"/><path d="M2.4 7.4a1 1 0 0 1 1-1h17.2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1z"/><path d="M12 6.4C10.6 2.4 5.6 1.6 5.6 4.4c0 1.8 3 2.2 6.4 2z"/><path d="M12 6.4c1.4-4 6.4-4.8 6.4-2 0 1.8-3 2.2-6.4 2z"/></g><path d="M12 6.6v15.6" stroke="#f0b94a" stroke-width="2"/></svg>',
};

/** Die Schilder in fester Reihenfolge der Optionen; Überschrift je Schild. */
export const SLOTS = {
  follow: { label: 'Letzter Follower' },
  sub: { label: 'Letztes Abo' },
  cheer: { label: 'Letzter Cheer' },
  raid: { label: 'Letzter Raid' },
  gift: { label: 'Letztes Geschenk' },
};
export const STANDARD_SLOTS = ['follow', 'sub', 'cheer', 'raid'];
const LEER_TEXT = 'Noch keiner – sei der Erste!';

/** Gewählte Schilder: Reihenfolge wie gespeichert (= wie angeklickt), ohne
 *  Doppelte und Unbekanntes. Nichts Brauchbares → die Standard-Auswahl. */
export function slotListe(wert) {
  if (!Array.isArray(wert)) return [...STANDARD_SLOTS];
  const raus = [];
  for (const s of wert) if (typeof s === 'string' && Object.prototype.hasOwnProperty.call(SLOTS, s) && !raus.includes(s)) raus.push(s);
  return raus.length ? raus : [...STANDARD_SLOTS];
}

function ganz(v) { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; }
function fmt(n) { return Number(n).toLocaleString('de-DE'); }
function nameVon(user) {
  const u = user && typeof user === 'object' ? user : {};
  const roh = [u.nickname, u.uniqueId, u.name].find((x) => typeof x === 'string' && x.trim());
  const s = roh ? roh.trim() : 'Jemand';
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/**
 * Welches Schild füllt dieses Ereignis, mit welchem Namen und Wert?
 * DOM-frei, damit es prüfbar ist. null = gehört in kein Schild.
 *
 * Plattform: Ereignisse OHNE Plattform (Test-Knöpfe, Timer, Wiederholungen)
 * gelten wie im Overlay-Filter für jede Plattform. Ein Abo zählt nur von
 * Twitch — TikToks „sub" ist das Superfan-Abo und hat hier nichts verloren.
 * @param {any} event
 * @param {'alle'|'twitch'|'tiktok'} [filter]
 * @returns {{slot: string, name: string, wert: string} | null}
 */
export function eintragAus(event, filter = 'alle') {
  if (!event || typeof event !== 'object') return null;
  const p = event.plattform;
  if (filter === 'twitch' && p && p !== 'twitch') return null;
  if (filter === 'tiktok' && p && p !== 'tiktok') return null;
  switch (event.type) {
    case 'follow':
      return { slot: 'follow', name: nameVon(event.user), wert: '' };
    case 'sub': {
      if (p !== 'twitch') return null;
      const g = event.subGeschenk;
      if (g && typeof g === 'object') {
        const n = ganz(g.anzahl) || 1;
        return { slot: 'sub', name: g.anonym === true ? 'Anonym' : nameVon(event.user), wert: `${fmt(n)} verschenkt` };
      }
      const m = ganz(event.subMonths);
      return { slot: 'sub', name: nameVon(event.user), wert: m >= 2 ? `${fmt(m)} Monate` : 'neu' };
    }
    case 'cheer': {
      const bits = ganz(event.cheer && event.cheer.bits);
      return { slot: 'cheer', name: nameVon(event.user), wert: bits ? `${fmt(bits)} ${bits === 1 ? 'Bit' : 'Bits'}` : '' };
    }
    case 'raid': {
      const v = ganz(event.raid && event.raid.viewers);
      return { slot: 'raid', name: nameVon(event.user), wert: v ? `${fmt(v)} ${v === 1 ? 'Pirat' : 'Piraten'}` : '' };
    }
    case 'gift': {
      const g = event.gift && typeof event.gift === 'object' ? event.gift : {};
      const coins = ganz(g.totalCoins) || ganz(g.coinsPerUnit) * (ganz(g.count) || 1);
      const giftName = [g.displayName, g.slug].find((x) => typeof x === 'string' && x.trim());
      const wert = coins ? `${fmt(coins)} ${coins === 1 ? 'Coin' : 'Coins'}` : (giftName ? giftName.trim() : '');
      return { slot: 'gift', name: nameVon(event.user), wert };
    }
    default:
      return null;
  }
}

const DEMO = {
  follow: { name: 'Muschelmia', wert: '' },
  sub: { name: 'KäptnBlaubär', wert: '3 Monate' },
  cheer: { name: 'Goldzahn', wert: '500 Bits' },
  raid: { name: 'Klabauter', wert: '42 Piraten' },
  gift: { name: 'Nebelkrähe', wert: '1.000 Coins' },
};
// Im Editor wechselt alle paar Sekunden ein Schild — damit man den Effekt sieht.
const DEMO_FOLGE = [
  { slot: 'follow', name: 'Seemöwe🏴‍☠️', wert: '' },
  { slot: 'cheer', name: 'Rumfass', wert: '1.000 Bits' },
  { slot: 'sub', name: 'Planke', wert: '5 verschenkt' },
  { slot: 'raid', name: 'Kraken_Kalle', wert: '128 Piraten' },
  { slot: 'gift', name: 'Perlentaucher', wert: '299 Coins' },
  { slot: 'follow', name: 'Muschelmia', wert: '' },
];
const DEMO_TAKT_MS = 9000;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

export default class PiratenInfoleiste {
  constructor(root, props, ctx) {
    ensureStyle();
    const p = props && typeof props === 'object' ? props : {};
    this.filter = p.plattform === 'twitch' || p.plattform === 'tiktok' ? p.plattform : 'alle';
    this.slots = slotListe(p.slots);
    this.anordnung = p.anordnung === 'stapel' ? 'stapel' : 'reihe';
    this.timers = new Set();
    this.zerstoert = false;
    this.el = document.createElement('div');
    this.el.className = `bx-pi bx-pi-${this.anordnung}${p.einblenden !== false ? ' bx-pi-einblenden' : ''}${p.textColor ? ' bx-pi-eigenfarbe' : ''}`;
    this.el.style.setProperty('--n', String(this.slots.length));
    // Eigene Schriften wie Schatzkiste/Schatz — nur ohne eigene Wahl des Nutzers.
    if (!p.fontFamily) {
      this.el.style.setProperty('--bx-font-display', "'Lilita One', 'Arial Black'");
      this.el.style.setProperty('--bx-font-body', "'Saira Semi Condensed', 'Arial Narrow'");
    }
    /** @type {Map<string, {el: any, name: any, wert: any, ts: number, tSchwung: any, tFrisch: any}>} */
    this.tafeln = new Map();
    this.slots.forEach((slot, i) => {
      const t = this.baueTafel(slot, i);
      this.tafeln.set(slot, t);
      this.el.appendChild(t.el);
    });
    root.appendChild(this.el);
    if (ctx && ctx.preview) {
      for (const slot of this.slots) this.zeige(this.tafeln.get(slot), { slot, ...DEMO[slot] }, 1, false);
      this.demoSchritt = 0;
      this.demoTimer = setInterval(() => this.demoWeiter(), DEMO_TAKT_MS);
    }
  }

  baueTafel(slot, i) {
    const el = document.createElement('div');
    el.className = 'bx-pi-tafel bx-pi-leer';
    el.dataset.slot = slot;
    el.style.setProperty('--i', String(i));
    el.innerHTML = '<i class="bx-pi-seil bx-pi-seil-l"></i><i class="bx-pi-seil bx-pi-seil-r"></i>'
      + '<div class="bx-pi-schild"><div class="bx-pi-brett"><i class="bx-pi-nieten"></i>'
      + '<div class="bx-pi-text"><div class="bx-pi-label"></div><div class="bx-pi-zeile"><span class="bx-pi-name"></span><span class="bx-pi-wert"></span></div></div>'
      + '<div class="bx-pi-band">NEU</div></div>'
      + `<div class="bx-pi-med"><i class="bx-pi-perlen"></i>${SYMBOLE[slot] || ''}</div></div>`
      + '<div class="bx-pi-blitz"></div>';
    el.querySelector('.bx-pi-label').textContent = SLOTS[slot].label;
    const t = { el, name: el.querySelector('.bx-pi-name'), wert: el.querySelector('.bx-pi-wert'), ts: 0, tSchwung: null, tFrisch: null };
    t.name.textContent = '—';
    t.wert.textContent = LEER_TEXT;
    return t;
  }

  /** Schild beschriften; mit `feiern` schwingt es, blitzt und bekommt das NEU-Band. */
  zeige(t, eintrag, ts, feiern) {
    if (!t) return;
    t.ts = ts;
    t.el.classList.remove('bx-pi-leer');
    setzeTextMitEmojis(t.name, eintrag.name);
    t.wert.textContent = eintrag.wert || '';
    if (feiern) this.feiere(t);
  }

  feiere(t) {
    const el = t.el;
    el.classList.remove('bx-pi-schwung');
    void el.offsetWidth; // Effekt bei schneller Folge neu anstoßen
    el.classList.add('bx-pi-schwung', 'bx-pi-frisch');
    if (t.tSchwung) { clearTimeout(t.tSchwung); this.timers.delete(t.tSchwung); }
    if (t.tFrisch) { clearTimeout(t.tFrisch); this.timers.delete(t.tFrisch); }
    t.tSchwung = this.spaeter(1300, () => { el.classList.remove('bx-pi-schwung'); t.tSchwung = null; });
    t.tFrisch = this.spaeter(4000, () => { el.classList.remove('bx-pi-frisch'); t.tFrisch = null; });
    // Münzen springen aus dem Medaillon (höchstens 7 je Schild gleichzeitig).
    for (const alt of el.querySelectorAll('.bx-pi-muenze')) alt.remove();
    const muenzen = [];
    for (let k = 0; k < 7; k++) {
      const m = document.createElement('i');
      m.className = 'bx-pi-muenze';
      m.style.setProperty('--dx', `${Math.round(-40 + k * 32 + Math.random() * 18)}cqh`);
      m.style.setProperty('--dy', `${Math.round(-55 - Math.random() * 45)}cqh`);
      m.style.setProperty('--d', `${k * 45}ms`);
      el.appendChild(m);
      muenzen.push(m);
    }
    this.spaeter(1500, () => { for (const m of muenzen) m.remove(); });
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

  demoWeiter() {
    if (this.zerstoert) return;
    const verfuegbar = DEMO_FOLGE.filter((d) => this.tafeln.has(d.slot));
    if (!verfuegbar.length) return;
    const d = verfuegbar[this.demoSchritt++ % verfuegbar.length];
    this.zeige(this.tafeln.get(d.slot), d, Date.now(), true);
  }

  onEvent(event) {
    if (this.zerstoert || !event || typeof event !== 'object') return;
    const eintrag = eintragAus(event, this.filter);
    if (!eintrag) return;
    const t = this.tafeln.get(eintrag.slot);
    if (!t) return;
    const ts = Number(event.ts) > 0 ? Number(event.ts) : Date.now();
    if (event.sticky) {
      // Nachlieferung nach dem (Neu-)Verbinden: nur wiederherstellen. Der Bus
      // schickt je Plattform einen Wert — der ältere darf den jüngeren nicht
      // überschreiben.
      if (t.ts && ts < t.ts) return;
      this.zeige(t, eintrag, ts, false);
      return;
    }
    // Ein echtes Ereignis beendet die Vorführung im Editor.
    if (this.demoTimer) { clearInterval(this.demoTimer); this.demoTimer = null; }
    this.zeige(t, eintrag, Math.max(ts, t.ts), true);
  }

  destroy() {
    this.zerstoert = true;
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = null;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.el.remove();
  }
}
