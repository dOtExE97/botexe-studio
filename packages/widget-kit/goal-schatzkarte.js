// goal-schatzkarte.js — Stil „Schatzkarte" der Goal-Bar (goal-bar.js reicht ihn
// hierher durch). Kein eigenes Widget, nur die Szene: ein Pergament-Streifen mit
// Seekarte in einem gemaserten Holzrahmen, Messingkappen links und rechts. Eine
// gepunktete Route läuft über die Karte, ein kleines Piratenschiff segelt mit dem
// Fortschritt darauf entlang, am Ende markiert ein rotes X die Stelle mit der
// Truhe. Links groß der Stand („23 / 50"), darüber der Titel.
//
// Licht durchgehend von oben links, dicke dunkle Konturen, harter Schlagschatten
// nach unten — wie Schatzkiste (Chat-Box) und Schatz-Podest (Bestenliste).
//
// Steigt der Stand: Das Schiff macht einen Satz nach vorn, Gischt und Gold
// spritzen, die Zahl hüpft. Wird das Ziel erreicht: Die Truhe springt auf,
// Münzen und Konfetti fliegen, „ZIEL ERREICHT!" schlägt als Band ein.
// Ruhe: Schiff schaukelt, Wellen laufen, Glanz wischt über die Messingkappen,
// der nächste Wegpunkt glimmt. Reduzierte Bewegung und Sparmodus: alles still.
//
// Größen: alles in --e („1px bei 640×110"), gedeckelt von Breite UND Höhe, so
// dass die Leiste in jeder Box als Band in voller Breite mittig sitzt.

const STYLE_ID = 'bx-sk-style';

// Holzmaserung als breite Rauschkachel (wie die Piraten-Infoleiste, damit auf
// der langen Leiste keine Kachelnaht sichtbar wird).
const MASERUNG = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='100'%3E %3Cfilter id='m' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.008 0.32' numOctaves='3' seed='23' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 0.14 0 0 0 0 0.06 0 0 0 0 0.01 0 0 0 2.2 -1.0'/%3E%3C/filter%3E %3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E\")";
// Pergament: weiches Wolkenrauschen in warmem Braun (Flecken, Altersspuren).
const PERGAMENT = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E %3Cfilter id='p' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.03' numOctaves='4' seed='5' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.25 0 0 0 0 0.05 0 0 0 1.6 -0.62'/%3E%3C/filter%3E %3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E\")";
// Kompassrose als blasse Tusche auf der Karte.
const KOMPASS = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cg fill='none' stroke='%235a2f0c' stroke-width='1'%3E%3Ccircle cx='20' cy='20' r='15.5'/%3E%3Ccircle cx='20' cy='20' r='13' stroke-dasharray='1.2 1.8'/%3E%3C/g%3E%3Cpath d='M20 2l3 15 15 3-15 3-3 15-3-15-15-3 15-3z' fill='%235a2f0c' fill-opacity='.75'/%3E%3Cpath d='M20 20l8-8-5.6 10zM20 20l-8 8 5.6-10zM20 20l8 8-10-5.6zM20 20l-8-8 10 5.6z' fill='%235a2f0c' fill-opacity='.45'/%3E%3C/svg%3E\")";

const CSS = `
/* Wurzel = Box (container-type: size). Das Band füllt die Breite; seine Höhe
   ergibt sich aus --e und ist so nie höher als die Box. Konturen nur über
   box-shadow, nie border. */
.bx-sk { position: absolute; inset: 0; container-type: size; display: flex; align-items: center; pointer-events: none;
  --sk-tinte: #1d0c03; --sk-holz-h: #d9924a; --sk-holz: #a65d27; --sk-holz-d: #5e2f10;
  --sk-gold-h: #fff4c8; --sk-gold: #f5c451; --sk-gold-m: #d49a2e; --sk-gold-d: #a8701a; --sk-gold-t: #6b3f08;
  --sk-tusche: #5a2f0c; --sk-rot: #c8231b; }
.bx-sk-band { position: relative; width: 100%; flex: none;
  --e: min(0.909cqh, 0.1563cqi); --fs: var(--bx-fs, 1);
  height: calc(var(--e) * 110); }

/* ── Holzrahmen ───────────────────────────────────────────────────────── */
.bx-sk-rahmen { position: absolute; inset: calc(var(--e) * 3) calc(var(--e) * 4) calc(var(--e) * 5);
  border-radius: calc(var(--e) * 12);
  background:
    linear-gradient(180deg, rgba(255,232,190,.42) 0 5%, rgba(255,220,170,.1) 16%, transparent 45%, rgba(25,8,0,.45)),
    linear-gradient(90deg, rgba(0,0,0,.25), transparent 10%, transparent 88%, rgba(0,0,0,.3)),
    ${MASERUNG} 0 0 / calc(var(--e) * 1100) calc(var(--e) * 110),
    linear-gradient(180deg, var(--sk-holz-h), var(--sk-holz) 55%, var(--sk-holz-d));
  box-shadow: 0 0 0 calc(var(--e) * 2.4) var(--sk-tinte),
    inset 0 calc(var(--e) * 1.4) 0 rgba(255,226,180,.45), inset 0 calc(var(--e) * -1.6) 0 rgba(30,10,0,.5),
    0 calc(var(--e) * 3.4) 0 rgba(29,12,3,.9), 0 calc(var(--e) * 5) calc(var(--e) * 8) rgba(0,0,0,.5); }
/* Nieten in den Holzecken. */
.bx-sk-rahmen::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  --nd: calc(var(--e) * 5.4);
  background:
    radial-gradient(circle at 40% 36%, #fff 0 9%, var(--sk-gold-h) 18%, #e0a93c 38%, #8a5310 58%, var(--sk-tinte) 64% 72%, transparent 76%) left calc(var(--e) * 13) top calc(var(--e) * 1.2) / var(--nd) var(--nd) no-repeat,
    radial-gradient(circle at 40% 36%, #fff 0 9%, var(--sk-gold-h) 18%, #e0a93c 38%, #8a5310 58%, var(--sk-tinte) 64% 72%, transparent 76%) right calc(var(--e) * 13) top calc(var(--e) * 1.2) / var(--nd) var(--nd) no-repeat,
    radial-gradient(circle at 40% 36%, #fff 0 9%, var(--sk-gold-h) 18%, #e0a93c 38%, #8a5310 58%, var(--sk-tinte) 64% 72%, transparent 76%) left calc(var(--e) * 13) bottom calc(var(--e) * 1.2) / var(--nd) var(--nd) no-repeat,
    radial-gradient(circle at 40% 36%, #fff 0 9%, var(--sk-gold-h) 18%, #e0a93c 38%, #8a5310 58%, var(--sk-tinte) 64% 72%, transparent 76%) right calc(var(--e) * 13) bottom calc(var(--e) * 1.2) / var(--nd) var(--nd) no-repeat; }

/* ── Messingkappen links/rechts (Rollen-Enden der Karte) ───────────────── */
.bx-sk-kappe { position: absolute; top: 0; bottom: calc(var(--e) * 2); width: calc(var(--e) * 11); z-index: 6; overflow: hidden;
  border-radius: calc(var(--e) * 5.5) / calc(var(--e) * 8);
  background:
    radial-gradient(circle at 42% 38%, #fff 0 8%, var(--sk-gold-h) 16%, #e0a93c 36%, #8a5310 58%, var(--sk-tinte) 64% 72%, transparent 76%) center calc(var(--e) * 6) / calc(var(--e) * 5.6) calc(var(--e) * 5.6) no-repeat,
    radial-gradient(circle at 42% 38%, #fff 0 8%, var(--sk-gold-h) 16%, #e0a93c 36%, #8a5310 58%, var(--sk-tinte) 64% 72%, transparent 76%) center bottom calc(var(--e) * 6) / calc(var(--e) * 5.6) calc(var(--e) * 5.6) no-repeat,
    linear-gradient(180deg, transparent calc(50% - var(--e) * 6), rgba(107,63,8,.85) calc(50% - var(--e) * 6) calc(50% - var(--e) * 4.8), rgba(255,246,214,.7) calc(50% - var(--e) * 4.8) calc(50% - var(--e) * 3.8), transparent calc(50% - var(--e) * 3.8) calc(50% + var(--e) * 3.8), rgba(107,63,8,.85) calc(50% + var(--e) * 3.8) calc(50% + var(--e) * 5), rgba(255,246,214,.5) calc(50% + var(--e) * 5) calc(50% + var(--e) * 6), transparent calc(50% + var(--e) * 6)),
    linear-gradient(90deg, var(--sk-gold-t) 0, var(--sk-gold-d) 10%, var(--sk-gold-h) 32%, var(--sk-gold) 48%, var(--sk-gold-m) 70%, var(--sk-gold-d) 88%, var(--sk-gold-t));
  box-shadow: 0 0 0 calc(var(--e) * 2.2) var(--sk-tinte), 0 calc(var(--e) * 3) 0 rgba(29,12,3,.85), 0 0 calc(var(--e) * 6) rgba(255,190,80,.35); }
.bx-sk-kappe.l { left: calc(var(--e) * 2.4); }
.bx-sk-kappe.r { right: calc(var(--e) * 2.4); }
.bx-sk-kappe::after { content: ''; position: absolute; left: 0; right: 0; top: -40%; height: 60%;
  background: linear-gradient(170deg, transparent 30%, rgba(255,255,255,.85) 50%, transparent 70%);
  transform: translateY(-120%); animation: bx-sk-kappe 6.4s ease-in-out infinite; }
.bx-sk-kappe.r::after { animation-delay: .5s; }

/* ── Pergament ────────────────────────────────────────────────────────── */
.bx-sk-karte { position: absolute; left: calc(var(--e) * 15); right: calc(var(--e) * 15); top: calc(var(--e) * 11); bottom: calc(var(--e) * 13);
  overflow: hidden; border-radius: calc(var(--e) * 4) calc(var(--e) * 6) calc(var(--e) * 5) calc(var(--e) * 3);
  background:
    radial-gradient(ellipse 60% 120% at 30% 0%, rgba(255,250,228,.55), transparent 60%),
    ${PERGAMENT} 0 0 / calc(var(--e) * 360) calc(var(--e) * 180),
    linear-gradient(180deg, #f7e6bb, #ecd09a 60%, #ddb377);
  box-shadow: 0 0 0 calc(var(--e) * 1.8) var(--sk-tinte),
    inset 0 0 calc(var(--e) * 2) calc(var(--e) * .6) rgba(90,40,4,.65),
    inset 0 0 calc(var(--e) * 12) calc(var(--e) * 2) rgba(150,80,16,.42),
    inset 0 calc(var(--e) * 2.4) calc(var(--e) * 3) rgba(40,14,0,.38); }
/* Seekarten-Tusche: Gitter, Kompassrose, Inselchen, Wellen-Striche. */
.bx-sk-deko { position: absolute; inset: 0; opacity: .5;
  background:
    ${KOMPASS} right calc(var(--e) * 74) bottom calc(var(--e) * -8) / calc(var(--e) * 40) calc(var(--e) * 40) no-repeat,
    radial-gradient(ellipse calc(var(--e) * 16) calc(var(--e) * 7) at 64% 22%, rgba(122,74,22,.42) 0 55%, rgba(90,47,12,.6) 60% 68%, transparent 72%),
    radial-gradient(ellipse calc(var(--e) * 9) calc(var(--e) * 4.4) at 70% 30%, rgba(122,74,22,.36) 0 55%, rgba(90,47,12,.55) 60% 70%, transparent 74%),
    radial-gradient(ellipse calc(var(--e) * 13) calc(var(--e) * 5) at 47% 88%, rgba(122,74,22,.36) 0 55%, rgba(90,47,12,.55) 60% 70%, transparent 74%),
    repeating-linear-gradient(90deg, transparent 0 calc(var(--e) * 40), rgba(90,47,12,.16) calc(var(--e) * 40) calc(var(--e) * 40.8)),
    repeating-linear-gradient(0deg, transparent 0 calc(var(--e) * 28), rgba(90,47,12,.12) calc(var(--e) * 28) calc(var(--e) * 28.8)); }
.bx-sk-deko i { position: absolute; width: calc(var(--e) * 12); height: calc(var(--e) * 4); opacity: .8;
  background: radial-gradient(ellipse at 25% 100%, transparent 0 calc(var(--e) * 2.2), var(--sk-tusche) calc(var(--e) * 2.3) calc(var(--e) * 3.1), transparent calc(var(--e) * 3.2)) 0 0 / 50% 100% repeat-x; }
.bx-sk-deko i:nth-child(1) { left: 40%; top: 18%; }
.bx-sk-deko i:nth-child(2) { left: 56%; top: 74%; }
.bx-sk-deko i:nth-child(3) { left: 80%; top: 16%; }
.bx-sk-deko i:nth-child(4) { left: 31%; top: 80%; }

/* ── Info links: Titel + Stand ────────────────────────────────────────── */
.bx-sk-info { position: absolute; left: calc(var(--e) * 24); top: calc(var(--e) * 13); bottom: calc(var(--e) * 15);
  width: calc(var(--e) * 178); z-index: 3; min-width: 0;
  display: flex; flex-direction: column; justify-content: center; gap: calc(var(--e) * 1); }
.bx-sk-titel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.1;
  font-family: var(--bx-font-body); font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  font-size: calc(var(--e) * 11.5 * var(--fs)); color: var(--sk-tusche);
  text-shadow: 0 .07em 0 rgba(255,248,222,.85); }
.bx-sk-zahl { display: flex; align-items: baseline; gap: .14em; min-width: 0; white-space: nowrap; line-height: 1;
  font-family: var(--bx-font-display); }
.bx-sk-ist { position: relative; display: inline-block; font-size: calc(var(--e) * 46 * var(--fs)); padding: 0 .06em; transform-origin: 50% 80%;
  color: #f7b733; -webkit-text-stroke: max(2px, .15em) var(--sk-tinte); paint-order: stroke fill;
  text-shadow: 0 .07em 0 var(--sk-tinte); }
/* Goldverlauf als zweite Ebene obendrauf — mit transparenter Füllung frisst
   -webkit-text-stroke sonst den Verlauf. */
.bx-sk-ist::after { content: attr(data-z); position: absolute; inset: 0; padding: inherit; -webkit-text-stroke: 0; text-shadow: none;
  background: linear-gradient(180deg, #fffbe6 0 16%, #ffe27a 34%, #ffc93a 56%, #f09a1c 82%, #c97312); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; }
.bx-sk-soll { font-size: calc(var(--e) * 27 * var(--fs)); color: #fff4dc; padding-right: .06em;
  -webkit-text-stroke: max(1.5px, .15em) var(--sk-tinte); paint-order: stroke fill;
  text-shadow: 0 .09em 0 var(--sk-tinte); }
.bx-sk-lang .bx-sk-ist { font-size: calc(var(--e) * 36 * var(--fs)); }
.bx-sk-lang .bx-sk-soll { font-size: calc(var(--e) * 22 * var(--fs)); }
.bx-sk-einheit { min-width: 0; overflow: hidden; text-overflow: ellipsis; align-self: center; margin-left: .2em; padding-top: .5em;
  font-family: var(--bx-font-body); font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
  font-size: calc(var(--e) * 11 * var(--fs)); color: var(--sk-tusche); text-shadow: 0 .07em 0 rgba(255,248,222,.85); }
.bx-sk-einheit:empty { display: none; }

/* ── Route ────────────────────────────────────────────────────────────── */
.bx-sk-bahn { position: absolute; left: calc(var(--e) * 214); right: calc(var(--e) * 22); top: calc(var(--e) * 11); bottom: calc(var(--e) * 13); z-index: 2; }
.bx-sk-punkt { position: absolute; width: calc(var(--e) * 4.4); height: calc(var(--e) * 4.4); margin: calc(var(--e) * -2.2) 0 0 calc(var(--e) * -2.2);
  border-radius: 50%; background: rgba(90,47,12,.42); transition: background-color .5s ease, box-shadow .5s ease; }
.bx-sk-punkt.gefahren { background: var(--sk-rot); box-shadow: 0 0 0 calc(var(--e) * .9) rgba(60,8,4,.85), 0 calc(var(--e) * .8) 0 rgba(60,8,4,.5); }
.bx-sk-punkt.naechster { background: #e8a021; box-shadow: 0 0 0 calc(var(--e) * .9) rgba(107,63,8,.9); animation: bx-sk-glimm 1.8s ease-in-out infinite; }

/* Ziel: rotes X, darauf die Truhe. */
.bx-sk-ziel { position: absolute; left: 94%; top: 0; bottom: 0; width: 0; }
.bx-sk-x { position: absolute; left: calc(var(--e) * -28); width: calc(var(--e) * 56); height: calc(var(--e) * 24); top: calc(var(--y, 60%) - var(--e) * 12); }
.bx-sk-truhe { position: absolute; left: calc(var(--e) * -19); width: calc(var(--e) * 38); height: calc(var(--e) * 42); top: calc(var(--y, 60%) - var(--e) * 47);
  transform-origin: 50% 100%; animation: bx-sk-truhe-ruhe 4.4s ease-in-out infinite; }
.bx-sk-truhe svg { position: absolute; left: 0; width: 100%; overflow: visible; }
.bx-sk-korpus { bottom: 0; height: 66%; }
.bx-sk-deckel { top: 6%; height: 38%; transform-origin: 8% 96%; transition: transform .5s cubic-bezier(.3,1.7,.5,1); z-index: 2; }
.bx-sk-glut { position: absolute; left: 6%; right: 6%; top: 30%; height: 22%; z-index: 1; border-radius: 50% 50% 20% 20%; opacity: 0;
  background: radial-gradient(ellipse at 50% 70%, #fffbe0 0 22%, #ffd447 48%, #e8901a 80%);
  box-shadow: 0 0 0 calc(var(--e) * 1.2) var(--sk-tinte); transition: opacity .3s ease; }
/* Schein hinter der Truhe: eigene Ebene in Pergament-Größe, die ihn am
   Kartenrand abschneidet (sonst ragten die Strahlen über die Box). Die Mitte
   liegt genau über der Truhe: Route beginnt 199e weiter rechts, ist 206e
   schmaler, Truhe bei 94 %. */
.bx-sk-schein { position: absolute; left: calc(var(--e) * 15); right: calc(var(--e) * 15); top: calc(var(--e) * 11); bottom: calc(var(--e) * 13); z-index: 1; overflow: hidden; pointer-events: none; }
.bx-sk-strahlen { position: absolute; left: calc(var(--e) * 199 + (100% - var(--e) * 206) * .94); top: calc(var(--y, 60%) - var(--e) * 27);
  width: calc(var(--e) * 130); height: calc(var(--e) * 130); margin: calc(var(--e) * -65) 0 0 calc(var(--e) * -65);
  border-radius: 50%; opacity: 0; z-index: 0; pointer-events: none; mix-blend-mode: screen;
  background: radial-gradient(circle, rgba(255,250,220,.95) 0 8%, rgba(255,214,90,.6) 20%, transparent 55%),
    repeating-conic-gradient(from 0deg, rgba(255,232,150,.7) 0 6deg, transparent 6deg 22deg);
  -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 66%); mask-image: radial-gradient(circle, #000 18%, transparent 66%); }
.bx-sk-funkel { position: absolute; width: calc(var(--e) * 9); height: calc(var(--e) * 9); left: 66%; top: 18%; z-index: 3; opacity: 0;
  background: radial-gradient(circle, #fff 0 12%, transparent 16%),
    conic-gradient(from 45deg, transparent 0 20deg, #fff8d0 20deg 25deg, transparent 25deg 110deg, #fff8d0 110deg 115deg, transparent 115deg 200deg, #fff8d0 200deg 205deg, transparent 205deg 290deg, #fff8d0 290deg 295deg, transparent 295deg);
  -webkit-mask-image: radial-gradient(circle, #000 30%, transparent 70%); mask-image: radial-gradient(circle, #000 30%, transparent 70%);
  animation: bx-sk-funkel 3.6s ease-in-out infinite; }
.bx-sk-fertig .bx-sk-deckel { transform: rotate(-32deg) translate(calc(var(--e) * -1), calc(var(--e) * -3)); }
.bx-sk-fertig .bx-sk-glut { opacity: 1; }
.bx-sk-fertig .bx-sk-strahlen { opacity: .75; animation: bx-sk-strahlen 9s linear infinite; }
.bx-sk-fertig .bx-sk-titel { color: #9c1a12; }

/* Schiff: zwei Träger verschieben es (x über die Breite, y auf der Route),
   beides als transform in Prozent der eigenen Größe = der Route. Die Träger
   sind so groß wie die Route und ragen verschoben weit über sie hinaus —
   deshalb liegen sie in einem Fenster (.bx-sk-see), das bis an den Bandrand
   reicht und den Rest abschneidet; das Schiff selbst bleibt ganz sichtbar. */
.bx-sk-see { position: absolute; top: calc(var(--e) * -11); bottom: calc(var(--e) * -13); left: calc(var(--e) * -40); right: calc(var(--e) * -22); overflow: hidden; }
.bx-sk-see-innen { position: absolute; top: calc(var(--e) * 11); bottom: calc(var(--e) * 13); left: calc(var(--e) * 40); right: calc(var(--e) * 22); }
.bx-sk-fahrt, .bx-sk-kurs { position: absolute; inset: 0; transition: transform 1.2s cubic-bezier(.3,.85,.3,1); }
.bx-sk-schiff { position: absolute; left: 0; top: 0; width: calc(var(--e) * 54); height: calc(var(--e) * 50);
  translate: -50% -82%; z-index: 2; }
.bx-sk-rumpf { position: absolute; inset: 0; transform-origin: 50% 85%; animation: bx-sk-schaukeln 3.4s ease-in-out infinite; }
.bx-sk-rumpf svg { width: 100%; height: 100%; overflow: visible; display: block;
  filter: drop-shadow(0 calc(var(--e) * 1.6) 0 rgba(29,12,3,.55)); }
/* Wasser um den Rumpf: zwei Wellenbögen + Kielwasser. */
.bx-sk-wasser { position: absolute; left: -16%; right: -10%; bottom: 4%; height: 26%; z-index: 3; overflow: hidden; }
.bx-sk-wasser::before, .bx-sk-wasser::after { content: ''; position: absolute; left: 0; width: 200%; height: 100%; bottom: 0;
  background: radial-gradient(ellipse calc(var(--e) * 5) calc(var(--e) * 3.4) at 50% 100%, transparent 0 52%, #1d6fa6 56% 88%, transparent 92%) 0 0 / calc(var(--e) * 9) 100% repeat-x;
  animation: bx-sk-welle 1.9s linear infinite; }
.bx-sk-wasser::after { bottom: -26%; opacity: .7; animation-duration: 2.6s; animation-direction: reverse;
  background-image: radial-gradient(ellipse calc(var(--e) * 5) calc(var(--e) * 3.2) at 50% 100%, transparent 0 58%, #f4fbff 62% 84%, transparent 88%); }
.bx-sk-kielwasser { position: absolute; right: 74%; bottom: 10%; width: calc(var(--e) * 20); height: calc(var(--e) * 5); z-index: 1;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.85)); border-radius: 50%;
  -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 calc(var(--e) * 3), transparent calc(var(--e) * 3) calc(var(--e) * 5));
  mask-image: repeating-linear-gradient(90deg, #000 0 calc(var(--e) * 3), transparent calc(var(--e) * 3) calc(var(--e) * 5));
  animation: bx-sk-kiel 1.4s ease-in-out infinite; }

/* ── Effekte ──────────────────────────────────────────────────────────── */
.bx-sk-schub .bx-sk-schiff { animation: bx-sk-satz 900ms cubic-bezier(.2,.9,.3,1); }
.bx-sk-schub .bx-sk-ist { animation: bx-sk-pop 620ms cubic-bezier(.2,1.6,.35,1); }
.bx-sk-tropfen { position: absolute; left: 62%; bottom: 16%; width: calc(var(--e) * 7); height: calc(var(--e) * 7); z-index: 4; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle at 35% 30%, #fff 0 14%, var(--sk-gold-h) 24%, var(--sk-gold) 52%, var(--sk-gold-d));
  box-shadow: 0 0 0 calc(var(--e) * .7) var(--sk-tinte), 0 0 calc(var(--e) * 4) rgba(255,214,110,.9);
  animation: bx-sk-tropfen 900ms cubic-bezier(.25,.7,.4,1) forwards; animation-delay: var(--d, 0ms); }
.bx-sk-bugwelle { position: absolute; right: -8%; bottom: 4%; width: 56%; height: 34%; z-index: 4; opacity: 0; border-radius: 50%;
  background: radial-gradient(ellipse at 30% 100%, transparent 0 40%, rgba(255,255,255,.95) 46% 62%, rgba(140,210,240,.8) 68%, transparent 74%); }
.bx-sk-schub .bx-sk-bugwelle { animation: bx-sk-bugwelle 800ms ease-out; }
@keyframes bx-sk-bugwelle { 0% { opacity: 0; transform: scale(.3, .2); } 25% { opacity: 1; transform: scale(1.1, 1.2); } 100% { opacity: 0; transform: scale(1.5, .8) translateX(-20%); } }
.bx-sk-tropfen.gischt { background: radial-gradient(circle at 35% 30%, #fff 0 30%, #d8f2ff 60%, #7cc6ea); box-shadow: 0 0 0 calc(var(--e) * .6) #0d4f7a; }
.bx-sk-fx { position: absolute; inset: 0; z-index: 8; overflow: hidden; pointer-events: none; border-radius: calc(var(--e) * 12); }
.bx-sk-konfetti { position: absolute; top: 40%; width: calc(var(--e) * 4.6); height: calc(var(--e) * 7.4); opacity: 0; border-radius: calc(var(--e) * 1);
  box-shadow: 0 0 0 calc(var(--e) * .6) rgba(29,12,3,.8);
  animation: bx-sk-konfetti 2200ms cubic-bezier(.2,.6,.35,1) forwards; animation-delay: var(--d, 0ms); }
.bx-sk-muenze { position: absolute; top: 46%; width: calc(var(--e) * 9); height: calc(var(--e) * 9); border-radius: 50%; opacity: 0;
  background: radial-gradient(circle at 35% 30%, #fff 0 10%, var(--sk-gold-h) 20%, var(--sk-gold) 50%, var(--sk-gold-d));
  box-shadow: 0 0 0 calc(var(--e) * .9) var(--sk-tinte), inset 0 0 0 calc(var(--e) * 1.1) rgba(168,112,26,.85), 0 0 calc(var(--e) * 5) rgba(255,214,110,.9);
  animation: bx-sk-muenzflug 1500ms cubic-bezier(.25,.7,.4,1) forwards; animation-delay: var(--d, 0ms); }
.bx-sk-ziel-fx .bx-sk-truhe { animation: bx-sk-truhe-auf 900ms cubic-bezier(.2,1.5,.4,1); }
.bx-sk-ziel-fx .bx-sk-strahlen { animation: bx-sk-strahlen-auf 1600ms ease-out, bx-sk-strahlen 9s linear infinite; }
/* „ZIEL ERREICHT!"-Band: schlägt über der Route ein. */
.bx-sk-meldung { position: absolute; left: calc(var(--e) * 214); right: calc(var(--e) * 60); top: 50%; z-index: 9; display: flex; justify-content: center;
  translate: 0 -50%; opacity: 0; scale: .4; pointer-events: none; }
.bx-sk-meldung span { display: block; padding: .16em .9em .1em; white-space: nowrap; line-height: 1;
  font-family: var(--bx-font-display); font-size: calc(var(--e) * 30 * var(--fs)); letter-spacing: .04em; color: #fff6e0;
  -webkit-text-stroke: max(1.5px, .1em) #4a0306; paint-order: stroke fill; text-shadow: 0 .08em 0 #4a0306;
  background: linear-gradient(180deg, #ff6a55, #d01e24 55%, #8c0c12);
  clip-path: polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%);
  box-shadow: inset 0 calc(var(--e) * 2) 0 #ffd56b, inset 0 calc(var(--e) * -2) 0 #ffd56b; }
.bx-sk-meldung.zeigen { animation: bx-sk-meldung 4200ms cubic-bezier(.2,1.4,.4,1) forwards; }

@keyframes bx-sk-kappe { 0%, 70% { transform: translateY(-120%); } 90%, 100% { transform: translateY(260%); } }
@keyframes bx-sk-glimm { 0%, 100% { scale: 1; filter: brightness(1); } 50% { scale: 1.35; filter: brightness(1.35); } }
@keyframes bx-sk-schaukeln { 0%, 100% { transform: rotate(-3deg) translateY(0); } 50% { transform: rotate(3deg) translateY(calc(var(--e) * -1.6)); } }
@keyframes bx-sk-welle { to { transform: translateX(calc(var(--e) * -9)); } }
@keyframes bx-sk-kiel { 0%, 100% { opacity: .55; transform: scaleX(.85); } 50% { opacity: 1; transform: scaleX(1.1); } }
@keyframes bx-sk-truhe-ruhe { 0%, 92%, 100% { transform: none; } 95% { transform: rotate(-3deg) scale(1.03); } 98% { transform: rotate(2deg); } }
@keyframes bx-sk-funkel { 0%, 60%, 100% { opacity: 0; transform: scale(.3) rotate(0deg); } 72% { opacity: 1; transform: scale(1) rotate(45deg); } 86% { opacity: 0; transform: scale(.4) rotate(90deg); } }
@keyframes bx-sk-strahlen { to { rotate: 360deg; } }
@keyframes bx-sk-strahlen-auf { 0% { scale: .2; opacity: 0; } 25% { scale: 1.25; opacity: 1; } 100% { scale: 1; opacity: .75; } }
@keyframes bx-sk-satz {
  0% { transform: none; }
  22% { transform: translateX(calc(var(--e) * 7)) rotate(-9deg) scale(1.08); }
  48% { transform: translateX(calc(var(--e) * 2)) rotate(4deg); }
  72% { transform: translateX(calc(var(--e) * -1)) rotate(-2deg); }
  100% { transform: none; } }
@keyframes bx-sk-pop { 0% { transform: scale(1); } 30% { transform: scale(1.32) rotate(-4deg); filter: drop-shadow(0 calc(var(--e) * 2.6) 0 var(--sk-tinte)) brightness(1.4); } 100% { transform: scale(1); } }
@keyframes bx-sk-tropfen {
  0% { opacity: 0; transform: translate(0, 0) scale(.4); }
  12% { opacity: 1; }
  50% { opacity: 1; transform: translate(calc(var(--dx, 0px) * .7), var(--dy, -20px)) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx, 0px), calc(var(--dy, -20px) * .1)) scale(.6); } }
@keyframes bx-sk-konfetti {
  0% { opacity: 0; transform: translate(0, 0) rotate(0deg) scale(.4); }
  8% { opacity: 1; }
  40% { opacity: 1; transform: translate(calc(var(--dx, 0px) * .75), var(--dy, -40px)) rotate(calc(var(--rot, 300deg) * .6)) rotateY(240deg) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx, 0px), calc(var(--dy, -40px) * -.4)) rotate(var(--rot, 300deg)) rotateY(720deg) scale(.9); } }
@keyframes bx-sk-muenzflug {
  0% { opacity: 0; transform: translate(0, 0) scale(.4) rotateY(0deg); }
  10% { opacity: 1; }
  50% { opacity: 1; transform: translate(calc(var(--dx, 0px) * .7), var(--dy, -40px)) scale(1) rotateY(300deg); }
  100% { opacity: 0; transform: translate(var(--dx, 0px), calc(var(--dy, -40px) * .15)) scale(.7) rotateY(620deg); } }
@keyframes bx-sk-truhe-auf { 0% { transform: none; } 18% { transform: scale(1.3, .78); } 42% { transform: scale(.9, 1.22) translateY(calc(var(--e) * -6)); } 68% { transform: scale(1.06, .95); } 100% { transform: none; } }
@keyframes bx-sk-meldung {
  0% { opacity: 0; scale: .4; rotate: -8deg; }
  10% { opacity: 1; scale: 1.12; rotate: 2deg; }
  16% { scale: 1; rotate: -1deg; }
  85% { opacity: 1; scale: 1; rotate: -1deg; }
  100% { opacity: 0; scale: .9; rotate: -1deg; } }

@media (prefers-reduced-motion: reduce) {
  .bx-sk *, .bx-sk *::before, .bx-sk *::after { animation: none !important; transition: none !important; }
  .bx-sk-fx, .bx-sk-tropfen, .bx-sk-funkel { display: none; } }
html.bx-perf .bx-sk *, html.bx-perf .bx-sk *::before, html.bx-perf .bx-sk *::after { animation: none !important; transition: none !important; }
html.bx-perf .bx-sk-fx, html.bx-perf .bx-sk-tropfen, html.bx-perf .bx-sk-funkel { display: none; }
/* „Rahmen ausblenden": kein Holz — Pergament, Schiff und Zahlen bleiben. */
html .bx-frameless .bx-sk-rahmen { background: none; box-shadow: none; }
html .bx-frameless .bx-sk-rahmen::before, html .bx-frameless .bx-sk-kappe { display: none; }
`;

// Konfetti-Farben: Gold, Piratenrot, Türkis (Meer), Creme.
const KONFETTI = ['#ffd23e', '#ff5436', '#28e0c4', '#fff4dc', '#f0a521', '#e2386f'];

// Wie die Route über die Karte schlängelt: Höhe (0…1 der Route) an der Stelle x (0…1).
const kursY = (x) => 0.66 + 0.15 * Math.sin(x * Math.PI * 2.3 + 0.5) - 0.05 * x;
// Schiff fährt von 3 % bis 78 % der Routenbreite; dahinter liegen X und Truhe.
const SCHIFF_START = 0.03;
const SCHIFF_ENDE = 0.78;
const PUNKTE = 26;

let instanzNr = 0;

/** Schiff (Seitenansicht, fährt nach rechts) — reine Flächen, keine Verläufe:
 *  so gibt es keine doppelten IDs, wenn mehrere Karten im Overlay liegen. */
const SCHIFF_SVG = '<svg viewBox="0 0 60 56" aria-hidden="true"><g stroke="#1d0c03" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">'
  // Bugspriet + Takelage
  + '<path d="M46 34L58 27" fill="none"/><path d="M31 6L56 27.6M31 6L8 33" fill="none" stroke-width="1.1" opacity=".8"/>'
  // Mast
  + '<path d="M29.8 4h2.6v32h-2.6z" fill="#6e3a14"/>'
  // Großsegel (Creme, leicht gebläht) + Schatten + Totenkopf
  + '<path d="M16 10.5Q31 7.5 46 10.5Q49 20 45.5 31Q31 28 16.5 31Q13 20 16 10.5z" fill="#fff4dc"/>'
  + '<path d="M38 9.4Q46 9.8 46 10.5Q49 20 45.5 31Q42 30.3 38.5 30Q41.5 20 38 9.4z" fill="#e3c99a" stroke="none"/>'
  + '<path d="M16 10.5Q31 7.5 46 10.5" fill="none" stroke="#c9a46a" stroke-width="1" opacity="0"/>'
  + '<circle cx="30.4" cy="18.4" r="4.4" fill="#2a1508" stroke="none"/><circle cx="28.9" cy="18" r="1.1" fill="#fff4dc" stroke="none"/><circle cx="31.9" cy="18" r="1.1" fill="#fff4dc" stroke="none"/>'
  + '<path d="M25 24.5l11-3M25 21.5l11 3" stroke="#2a1508" stroke-width="1.6" fill="none"/>'
  // Fahne
  + '<path d="M32.4 2.2L42.5 4.4L32.4 7.4z" fill="#c8231b"/>'
  // Rumpf: Holz, dunkler Kiel, Goldstreif, Bullaugen
  + '<path d="M5 33.5L50 33.5Q53 33.5 52 36L47.5 47Q30 52.5 12 47.5L5.5 37Q4.5 33.5 5 33.5z" fill="#a65d27"/>'
  + '<path d="M8.8 42.6Q30 46.5 50 41.5L47.5 47Q30 52.5 12 47.5z" fill="#5e2f10" stroke="none"/>'
  + '<path d="M6.5 37.2Q30 39.8 51.4 37" fill="none" stroke="#f5c451" stroke-width="2.2"/>'
  + '<path d="M5 33.5L50 33.5" fill="none" stroke="#d9924a" stroke-width="1.3" opacity=".9"/>'
  + '<circle cx="17" cy="41.4" r="1.8" fill="#f5c451" stroke-width="1.2"/><circle cx="27" cy="42.2" r="1.8" fill="#f5c451" stroke-width="1.2"/><circle cx="37" cy="41.8" r="1.8" fill="#f5c451" stroke-width="1.2"/>'
  // Heckkastell
  + '<path d="M3.5 33.5L3.5 29.5L13 29.5L13 33.5z" fill="#8a4a1c"/>'
  + '</g></svg>';

// Das X liegt flach auf der Karte (perspektivisch gestaucht), die Truhe steht darauf.
const X_SVG = '<svg viewBox="0 0 50 22" preserveAspectRatio="none" aria-hidden="true" style="width:100%;height:100%;overflow:visible">'
  + '<g fill="none" stroke-linecap="round"><path d="M5 3L45 19M45 3L5 19" stroke="#3a0604" stroke-width="7.2"/>'
  + '<path d="M5 3L45 19M45 3L5 19" stroke="#d6281e" stroke-width="4.4"/>'
  + '<path d="M7 4.2L16 7.8M43 4.2L35 7.4" stroke="#ff8a72" stroke-width="1.4" opacity=".85"/></g></svg>';

const KORPUS_SVG = '<svg class="bx-sk-korpus" viewBox="0 0 42 30" preserveAspectRatio="none" aria-hidden="true"><g stroke="#1d0c03" stroke-width="2" stroke-linejoin="round">'
  + '<path d="M2.5 2.5h37v24.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" fill="#a65d27"/>'
  + '<path d="M3.5 18.5h35v8.4H3.5z" fill="#7a3d15" stroke="none"/>'
  + '<path d="M3.5 10.5h35M3.5 18.5h35" stroke="#5e2f10" stroke-width="1.1" fill="none"/>'
  + '<path d="M3.5 4.4h35" stroke="#e7a865" stroke-width="1.1" fill="none" opacity=".8"/>'
  + '<path d="M8 2.5h4.6v26H8zM29.4 2.5H34v26h-4.6z" fill="#f5c451"/>'
  + '<path d="M9 4v23M30.4 4v23" stroke="#fff4c8" stroke-width=".9" fill="none" opacity=".9"/>'
  + '<path d="M17 6h8v9.5l-4 3.4-4-3.4z" fill="#f5c451"/><circle cx="21" cy="10.6" r="1.6" fill="#1d0c03" stroke="none"/><path d="M21 11.6v3" stroke-width="1.4"/>'
  + '</g></svg>';

const DECKEL_SVG = '<svg class="bx-sk-deckel" viewBox="0 0 42 17" preserveAspectRatio="none" aria-hidden="true"><g stroke="#1d0c03" stroke-width="2" stroke-linejoin="round">'
  + '<path d="M2.5 15.5Q2.5 2 21 1.8Q39.5 2 39.5 15.5z" fill="#b8692d"/>'
  + '<path d="M5.5 8Q12 3.6 21 3.6" fill="none" stroke="#f0b27a" stroke-width="1.4" opacity=".9"/>'
  + '<path d="M8 15.5Q8 5 10.3 3.6L14.6 3V15.5zM29.4 15.5V3L33 3.6Q34 6 34 15.5z" fill="#f5c451"/>'
  + '<path d="M2.5 15.5h37" stroke-width="2.4" fill="none"/>'
  + '</g></svg>';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** Zahl für die Karte: bis 9.999 ausgeschrieben (deutsch gegliedert), darüber „12,5K". */
export function kartenZahl(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v < 10000) return v.toLocaleString('de-DE');
  return `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: v >= 100000 ? 0 : 1 })}K`;
}

/** Wo das Schiff bei diesem Anteil (0…1) steht — x/y als Anteil der Route. */
export function schiffsPosition(anteil) {
  const a = Math.min(1, Math.max(0, Number(anteil) || 0));
  const x = SCHIFF_START + (SCHIFF_ENDE - SCHIFF_START) * a;
  return { x, y: kursY(x) };
}

export default class Schatzkarte {
  /**
   * @param {any} root   die Widget-Box
   * @param {{ titel: string, einheit: string, eigeneSchrift: boolean }} opt
   */
  constructor(root, opt) {
    ensureStyle();
    this.nr = ++instanzNr;
    this.timers = new Set();
    this.zerstoert = false;
    this.fertig = false;
    this.el = document.createElement('div');
    this.el.className = 'bx-sk';
    if (!opt.eigeneSchrift) {
      this.el.style.setProperty('--bx-font-display', "'Lilita One', 'Arial Black'");
      this.el.style.setProperty('--bx-font-body', "'Saira Semi Condensed', 'Arial Narrow'");
    }
    const zielY = `${(kursY(0.94) * 100).toFixed(2)}%`;
    let punkte = '';
    /** x-Anteil je Wegpunkt (gemerkt statt aus dem Stil zurückgelesen). */
    this.punktX = [];
    for (let i = 0; i < PUNKTE; i++) {
      const x = SCHIFF_START + (0.9 - SCHIFF_START) * (i / (PUNKTE - 1));
      this.punktX.push(x);
      punkte += `<i class="bx-sk-punkt" style="left:${(x * 100).toFixed(2)}%;top:${(kursY(x) * 100).toFixed(2)}%"></i>`;
    }
    this.el.innerHTML = '<div class="bx-sk-band">'
      + '<div class="bx-sk-rahmen"></div>'
      + '<div class="bx-sk-karte"><div class="bx-sk-deko"><i></i><i></i><i></i><i></i></div></div>'
      + `<div class="bx-sk-schein" style="--y:${zielY}"><div class="bx-sk-strahlen"></div></div>`
      + '<i class="bx-sk-kappe l"></i><i class="bx-sk-kappe r"></i>'
      + '<div class="bx-sk-info"><div class="bx-sk-titel"></div>'
      + '<div class="bx-sk-zahl"><span class="bx-sk-ist" data-z="0">0</span><span class="bx-sk-soll"></span><span class="bx-sk-einheit"></span></div></div>'
      + `<div class="bx-sk-bahn">${punkte}`
      + `<div class="bx-sk-ziel" style="--y:${zielY}"><div class="bx-sk-x">${X_SVG}</div>`
      + `<div class="bx-sk-truhe"><div class="bx-sk-glut"></div>${KORPUS_SVG}${DECKEL_SVG}<i class="bx-sk-funkel"></i></div></div>`
      + '<div class="bx-sk-see"><div class="bx-sk-see-innen"><div class="bx-sk-fahrt"><div class="bx-sk-kurs"><div class="bx-sk-schiff"><i class="bx-sk-kielwasser"></i>'
      + `<div class="bx-sk-rumpf">${SCHIFF_SVG}</div><div class="bx-sk-wasser"></div><i class="bx-sk-bugwelle"></i></div></div></div></div></div>`
      + '</div>'
      + '<div class="bx-sk-meldung"><span>ZIEL ERREICHT!</span></div>'
      + '<div class="bx-sk-fx"></div>'
      + '</div>';
    this.titelEl = this.el.querySelector('.bx-sk-titel');
    this.istEl = this.el.querySelector('.bx-sk-ist');
    this.sollEl = this.el.querySelector('.bx-sk-soll');
    this.punkte = [...this.el.querySelectorAll('.bx-sk-punkt')];
    this.fahrt = this.el.querySelector('.bx-sk-fahrt');
    this.kurs = this.el.querySelector('.bx-sk-kurs');
    this.schiff = this.el.querySelector('.bx-sk-schiff');
    this.fx = this.el.querySelector('.bx-sk-fx');
    this.meldung = this.el.querySelector('.bx-sk-meldung');
    this.el.querySelector('.bx-sk-einheit').textContent = opt.einheit || '';
    this.titel = opt.titel || '';
    this.titelEl.textContent = this.titel;
    root.appendChild(this.el);
    this.setze(null, 1, false, false);
  }

  setTitel(t) { this.titel = t || ''; if (!this.fertig) this.titelEl.textContent = this.titel; }

  /**
   * Stand zeichnen. `cur === null` = noch kein Wert bekannt („– / 50"),
   * `ziel === null` = auch das Ziel ist noch unbekannt („– / –").
   * `feiern`: Anstieg → Schiff macht einen Satz; Ziel gerade erreicht → Truhe springt auf.
   */
  setze(cur, ziel, erreicht, feiern) {
    if (this.zerstoert) return;
    const sollBekannt = ziel != null;
    const soll = Math.max(1, Number(ziel) || 1);
    const ist = cur == null || !sollBekannt ? null : Math.max(0, Number(cur) || 0);
    const anteil = ist == null ? 0 : Math.min(1, ist / soll);
    const text = ist == null ? '–' : kartenZahl(ist);
    this.istEl.textContent = text;
    this.istEl.setAttribute('data-z', text);
    const sollText = sollBekannt ? kartenZahl(soll) : '–';
    this.sollEl.textContent = `/ ${sollText}`;
    // Lange Zahlen („5.750 / 12,5K") etwas kleiner, damit sie nicht in die Route ragen.
    this.el.classList.toggle('bx-sk-lang', text.length + sollText.length > 6);
    const pos = schiffsPosition(anteil);
    this.fahrt.style.transform = `translateX(${(pos.x * 100).toFixed(2)}%)`;
    this.kurs.style.transform = `translateY(${(pos.y * 100).toFixed(2)}%)`;
    let naechster = false;
    for (let i = 0; i < this.punkte.length; i++) {
      const p = this.punkte[i];
      const x = this.punktX[i] ?? 1;
      const gefahren = ist != null && x <= pos.x + 0.004;
      p.classList.toggle('gefahren', gefahren);
      const istNaechster = !gefahren && !naechster && ist != null && anteil < 1;
      p.classList.toggle('naechster', istNaechster);
      if (istNaechster) naechster = true;
    }
    const fertig = ist != null && (erreicht || ist >= soll);
    const warFertig = this.fertig;
    this.fertig = fertig;
    this.el.classList.toggle('bx-sk-fertig', fertig);
    this.titelEl.textContent = fertig ? 'ZIEL ERREICHT!' : this.titel;
    if (!feiern) return;
    if (fertig && !warFertig) this.zielFeier();
    else this.schub();
  }

  /** Stand gestiegen: Schiff macht einen Satz, Gischt und Gold spritzen. */
  schub() {
    this.neuStarten(this.el, 'bx-sk-schub', 950);
    for (const alt of this.schiff.querySelectorAll('.bx-sk-tropfen')) alt.remove();
    const neu = [];
    for (let k = 0; k < 9; k++) {
      const t = document.createElement('i');
      t.className = `bx-sk-tropfen${k % 3 === 0 ? ' gischt' : ''}`;
      t.style.setProperty('--dx', `calc(var(--e) * ${Math.round(-34 + k * 9 + Math.random() * 6)})`);
      t.style.setProperty('--dy', `calc(var(--e) * ${Math.round(-20 - Math.random() * 22)})`);
      t.style.setProperty('--d', `${k * 35}ms`);
      this.schiff.appendChild(t);
      neu.push(t);
    }
    this.spaeter(1300, () => { for (const t of neu) t.remove(); });
  }

  /** Ziel erreicht: Truhe springt auf, Münzen + Konfetti, Band schlägt ein. */
  zielFeier() {
    this.neuStarten(this.el, 'bx-sk-ziel-fx', 1700);
    this.neuStarten(this.el, 'bx-sk-schub', 950);
    this.meldung.classList.remove('zeigen');
    void this.meldung.offsetWidth;
    this.meldung.classList.add('zeigen');
    this.spaeter(4300, () => this.meldung.classList.remove('zeigen'));
    for (const alt of [...this.fx.children]) alt.remove();
    const teile = [];
    for (let k = 0; k < 26; k++) {
      const c = document.createElement('i');
      c.className = 'bx-sk-konfetti';
      c.style.left = `${86 + Math.random() * 6}%`;
      c.style.background = KONFETTI[k % KONFETTI.length];
      c.style.setProperty('--dx', `${Math.round(-260 + Math.random() * 300)}px`);
      c.style.setProperty('--dy', `${Math.round(-30 - Math.random() * 40)}px`);
      c.style.setProperty('--rot', `${Math.round(200 + Math.random() * 400)}deg`);
      c.style.setProperty('--d', `${Math.round(k * 22)}ms`);
      this.fx.appendChild(c);
      teile.push(c);
    }
    for (let k = 0; k < 10; k++) {
      const m = document.createElement('i');
      m.className = 'bx-sk-muenze';
      m.style.left = `${88 + Math.random() * 3}%`;
      m.style.setProperty('--dx', `${Math.round(-140 + k * 18 + Math.random() * 10)}px`);
      m.style.setProperty('--dy', `${Math.round(-26 - Math.random() * 22)}px`);
      m.style.setProperty('--d', `${80 + k * 40}ms`);
      this.fx.appendChild(m);
      teile.push(m);
    }
    this.spaeter(2600, () => { for (const t of teile) t.remove(); });
  }

  neuStarten(el, klasse, ms) {
    el.classList.remove(klasse);
    void el.offsetWidth;
    el.classList.add(klasse);
    const alt = this[`t_${klasse}`];
    if (alt) { clearTimeout(alt); this.timers.delete(alt); }
    this[`t_${klasse}`] = this.spaeter(ms, () => el.classList.remove(klasse));
  }

  spaeter(ms, f) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (this.zerstoert) return;
      try { f(); } catch { /* Aufräumen darf die Karte nie lahmlegen */ }
    }, ms);
    this.timers.add(id);
    return id;
  }

  destroy() {
    this.zerstoert = true;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.el.remove();
  }
}
