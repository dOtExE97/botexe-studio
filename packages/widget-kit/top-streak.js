// top-streak.js — Highlight der höchsten Combo der Session (z.B. „50x Rose").
// Zeigt Spender-Avatar + Gift-Bild + die Streak-Zahl „xN" groß. Bounce bei
// neuem Rekord. Hydratisiert nach Overlay-Reload aus den Session-Stats.
// props: { accent?, title? }
// Anzeigename (deutscher/eigener Name, falls eingestellt) — gemeinsame Quelle.
import { giftName } from './gift-rules.js';

const STYLE_ID = 'bx-ts-style';
// --u = „1px bei Standardgröße" (340×320): alle Größen sind Vielfache davon,
// damit die Karte beim Größerziehen wirklich mitwächst statt leer zu wirken.
// --bx-fs ist die Textgrößen-Einstellung (Faktor, Standard 1) und wird hier an
// der EINEN Basisgröße eingerechnet — dadurch wirkt der Regler auf alles.
const CSS = `
.bx-ts { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  container-type: size; --u: calc(min(0.294cqi, 0.3125cqh) * var(--bx-fs, 1));
  font-family: var(--bx-font-body); padding: 4.2%; text-align: center; background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); overflow: hidden; }
.bx-ts::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 80%, white), transparent 45%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-ts-kicker { font-family: var(--bx-font-display); font-size: clamp(9px, calc(var(--u) * 12), 40px); letter-spacing: .42em; text-transform: uppercase; color: var(--bx-gold);
  text-shadow: 0 1px 3px rgba(0,0,0,.75); }
.bx-ts-row { display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 10); margin: calc(var(--u) * 8) 0 calc(var(--u) * 4); }
.bx-ts-img { height: clamp(26px, calc(var(--u) * 58), 200px); filter: drop-shadow(0 6px 14px rgba(0,0,0,.5)); animation: bx-float 2.8s ease-in-out infinite; }
.bx-ts-x { font-family: var(--bx-font-display); font-size: clamp(22px, calc(var(--u) * 46), 160px); line-height: 1; color: var(--bx-text,#fff);
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 0 22px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-ts-gift { font-family: var(--bx-font-display); font-size: clamp(12px, calc(var(--u) * 20), 70px); text-transform: uppercase; color: var(--bx-text,#fff); text-shadow: 0 2px 8px rgba(0,0,0,.6); }
.bx-ts-by { display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 7); font-size: clamp(10px, calc(var(--u) * 14), 48px);
  color: #cfd5e6; text-shadow: 0 1px 3px rgba(0,0,0,.8); margin-top: calc(var(--u) * 5); }
.bx-ts-by b { color: var(--bx-accent); font-family: var(--bx-font-display); }
.bx-ts-av { width: calc(var(--u) * 26); height: calc(var(--u) * 26); border-radius: 50%; object-fit: cover;
  border: 2px solid color-mix(in srgb, var(--bx-accent) 70%, transparent); box-shadow: 0 2px 8px rgba(0,0,0,.5); }
.bx-ts.bounce { animation: bx-ts-bounce 600ms cubic-bezier(.2,1.6,.4,1); }
@keyframes bx-ts-bounce { 0%,100% { transform: scale(1); } 40% { transform: scale(1.07); } }
.bx-ts-empty { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 12);
  font-size: clamp(10px, calc(var(--u) * 13), 44px); letter-spacing: .2em; color: #c6ccdd; text-shadow: 0 1px 3px rgba(0,0,0,.8); text-transform: uppercase; }
.bx-ts-fire { width: clamp(22px, calc(var(--u) * 46), 160px); height: clamp(22px, calc(var(--u) * 46), 160px); color: #c6ccdd; opacity: .6; }
/* — Sticker-Variante (TikFinity-Look): kein Panel, dicke weiße Outline, großes Gift — */
.bx-ts.st-sticker { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-ts.st-sticker::before { display: none; }
.bx-ts.st-sticker .bx-ts-img { height: clamp(32px, calc(var(--u) * 78), 270px); }
.bx-ts.st-sticker .bx-ts-x { font-size: clamp(26px, calc(var(--u) * 58), 200px); }
.bx-ts.st-sticker .bx-ts-kicker { color: #fff; -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
.bx-ts.st-sticker .bx-ts-gift { color: #fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 3px 6px rgba(0,0,0,.5); }
.bx-ts.st-sticker .bx-ts-by { color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.7); }
.bx-ts.st-sticker .bx-ts-by b { -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }

/* ── FLAMMENSÄULE — die Combo brennt: hinter der Zahl steigt eine Feuersäule
   auf, deren Höhe mit der Combo wächst (--flame, in render() gesetzt, log-
   skaliert, damit auch x5 schon sichtbar lodert und x500 nicht ausbricht).
   Der Inhalt sitzt unten in der Glut → hohe Boxen werden von der Säule
   ausgefüllt statt leer zu bleiben. Deko steckt in Pseudo-Elementen der
   Wurzel, die per overflow:hidden ohnehin auf die Box beschnitten ist. */
.bx-ts.bx-ts-flamme { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  justify-content: flex-end; padding: calc(var(--u) * 10) calc(var(--u) * 10) calc(var(--u) * 12); }
/* ::before = äußere Flamme (rot/orange), ::after = heller Kern. Beide als
   Tropfen-Polygon: unten breit, oben spitz — eine reine border-radius-Kuppel
   sah aus wie ein Hügel, nicht wie Feuer. */
.bx-ts.bx-ts-flamme::before, .bx-ts.bx-ts-flamme::after {
  content: ''; position: absolute; bottom: 0; left: 50%; top: auto; right: auto; z-index: 0; pointer-events: none;
  padding: 0; -webkit-mask: none; mask: none; border-radius: 0;
  transform: translateX(-50%); transform-origin: 50% 100%;
  -webkit-clip-path: polygon(50% 0%, 57% 8%, 63% 16%, 67% 24%, 70% 32%, 74% 40%, 79% 48%, 83% 56%, 86% 64%, 87% 72%, 86% 80%, 82% 88%, 75% 95%, 68% 100%, 32% 100%, 25% 95%, 18% 88%, 14% 80%, 13% 72%, 14% 64%, 17% 56%, 21% 48%, 26% 40%, 30% 32%, 33% 24%, 37% 16%, 43% 8%);
  clip-path: polygon(50% 0%, 57% 8%, 63% 16%, 67% 24%, 70% 32%, 74% 40%, 79% 48%, 83% 56%, 86% 64%, 87% 72%, 86% 80%, 82% 88%, 75% 95%, 68% 100%, 32% 100%, 25% 95%, 18% 88%, 14% 80%, 13% 72%, 14% 64%, 17% 56%, 21% 48%, 26% 40%, 30% 32%, 33% 24%, 37% 16%, 43% 8%); }
.bx-ts.bx-ts-flamme::before { width: min(72%, calc(var(--u) * 240)); height: var(--flame, 60%);
  background: linear-gradient(0deg, #ffb020 0%, #ff7a12 34%, #ff3d16 70%, #d61f0c 100%);
  filter: drop-shadow(0 0 30px rgba(255,90,15,.65));
  animation: bx-ts-flare 1.6s ease-in-out infinite alternate; }
.bx-ts.bx-ts-flamme::after { width: min(33%, calc(var(--u) * 110)); height: calc(var(--flame, 60%) * .5);
  background: linear-gradient(0deg, #fffdf0 0%, #fff2a8 40%, #ffcf3a 100%);
  filter: blur(.5px); opacity: .95;
  animation: bx-ts-flare 1.1s ease-in-out infinite alternate; }
@keyframes bx-ts-flare { from { transform: translateX(-50%) scale(.94, .96); } to { transform: translateX(-50%) scale(1.06, 1.03); } }
.bx-ts-flamme > * { position: relative; z-index: 1; }
.bx-ts-flamme .bx-ts-kicker { margin-bottom: auto; color: #fff; -webkit-text-stroke: 2px #4a1200; paint-order: stroke fill; }
.bx-ts-flamme .bx-ts-x { font-size: clamp(26px, calc(var(--u) * 58), 200px); color: #fff;
  -webkit-text-stroke: clamp(2px, calc(var(--u) * 4), 9px) #6b1a00; paint-order: stroke fill;
  text-shadow: 0 0 26px rgba(255,150,30,.9); }
.bx-ts-flamme .bx-ts-img { filter: drop-shadow(0 4px 10px rgba(80,20,0,.7)); }
.bx-ts-flamme .bx-ts-gift { color: #ffe9b0; -webkit-text-stroke: 2.5px #4a1200; paint-order: stroke fill; }
.bx-ts-flamme .bx-ts-by { color: #fff; text-shadow: 0 2px 5px rgba(70,18,0,.6);
  -webkit-text-stroke: 2px #6b1a00; paint-order: stroke fill; }
.bx-ts-flamme .bx-ts-by b { color: #ffe08a; }
.bx-ts-flamme .bx-ts-empty { color: #fff; -webkit-text-stroke: 1.5px #4a1200; paint-order: stroke fill; }
.bx-ts-flamme .bx-ts-fire { color: #ff8a1e; opacity: .9; }

/* ── QUITTUNG — Kassenbon: Papierstreifen mit Zackenkante oben und unten, die
   Combo als Postenzeile („ROSE … ×25"), Spender als Kunde, unten ein Barcode.
   Schreibmaschinenschrift auf Creme liest sich auf hellem wie dunklem Video
   gleich gut — der Gegenentwurf zum glühenden Rest. */
.bx-ts.bx-ts-bon { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  align-items: stretch; justify-content: flex-start; text-align: left;
  padding: calc(var(--u) * 16) calc(var(--u) * 16) calc(var(--u) * 30); }
/* Papier als Pseudo-Element, damit die Zackenkante per clip-path echte Zähne
   bekommt (ein aufgelegtes Dreiecksmuster könnte den Rand nicht wegschneiden). */
.bx-ts.bx-ts-bon::before { background: #f6f0e2; padding: 0; -webkit-mask: none; mask: none; z-index: 0;
  border-radius: 0; filter: drop-shadow(0 10px 22px rgba(0,0,0,.6));
  -webkit-clip-path: polygon(0% 3.2%, 12.5% 0%, 25% 3.2%, 37.5% 0%, 50% 3.2%, 62.5% 0%, 75% 3.2%, 87.5% 0%, 100% 3.2%, 100% 96.8%, 87.5% 100%, 75% 96.8%, 62.5% 100%, 50% 96.8%, 37.5% 100%, 25% 96.8%, 12.5% 100%, 0% 96.8%);
  clip-path: polygon(0% 3.2%, 12.5% 0%, 25% 3.2%, 37.5% 0%, 50% 3.2%, 62.5% 0%, 75% 3.2%, 87.5% 0%, 100% 3.2%, 100% 96.8%, 87.5% 100%, 75% 96.8%, 62.5% 100%, 50% 96.8%, 37.5% 100%, 25% 96.8%, 12.5% 100%, 0% 96.8%); }
/* Fusszeile + Barcode in EINEM Pseudo-Element: die Kinder sind position:relative
   (Stapelreihenfolge), ein Pseudo an einem Kind haette sich an diesem statt an
   der Box ausgerichtet. */
.bx-ts.bx-ts-bon::after { content: '* DANKE FUER DIE COMBO *'; position: absolute; left: 12%; right: 12%; bottom: calc(var(--u) * 10);
  z-index: 1; pointer-events: none; opacity: .85; text-align: center; line-height: 1.2;
  color: #8a7f63; font-family: 'Courier New', monospace; letter-spacing: .1em; font-size: clamp(8px, calc(var(--u) * 11), 34px);
  padding-bottom: clamp(9px, calc(var(--u) * 22), 52px);
  background: repeating-linear-gradient(90deg, #2c2416 0 2px, transparent 2px 5px, #2c2416 5px 9px, transparent 9px 12px, #2c2416 12px 14px, transparent 14px 18px) bottom left / 100% clamp(6px, calc(var(--u) * 16), 40px) no-repeat; }
.bx-ts-bon > * { position: relative; z-index: 1; font-family: 'Courier New', monospace; }
.bx-ts-bon .bx-ts-kicker { order: 0; color: #2c2416; text-align: center; letter-spacing: .2em; text-shadow: none;
  padding-bottom: calc(var(--u) * 5); border-bottom: 2px dashed #b9ad90; }
.bx-ts-bon .bx-ts-gift { order: 1; color: #2c2416; text-shadow: none; margin-top: calc(var(--u) * 7); letter-spacing: .08em; }
.bx-ts-bon .bx-ts-row { order: 2; justify-content: space-between; align-items: center; width: 100%;
  margin: calc(var(--u) * 2) 0 calc(var(--u) * 5); padding-bottom: calc(var(--u) * 5); border-bottom: 1px dashed #c3b79a; }
.bx-ts-bon .bx-ts-row::before { content: 'Combo'; color: #7a6f55; font-size: clamp(9px, calc(var(--u) * 13), 44px); letter-spacing: .12em; }
.bx-ts-bon .bx-ts-img { order: -1; animation: none; filter: none; height: clamp(20px, calc(var(--u) * 38), 130px); }
.bx-ts-bon .bx-ts-x { color: #2c2416; -webkit-text-stroke: 0; text-shadow: none; font-family: 'Courier New', monospace; font-weight: 700;
  font-size: clamp(20px, calc(var(--u) * 40), 140px); }
.bx-ts-bon .bx-ts-by { order: 3; justify-content: flex-start; color: #5a5140; text-shadow: none; }
.bx-ts-bon .bx-ts-by b { color: #2c2416; font-family: 'Courier New', monospace; }
.bx-ts-bon .bx-ts-av { border-color: rgba(44,36,22,.4); }
.bx-ts-bon .bx-ts-empty { color: #6b6250; text-shadow: none; }
.bx-ts-bon .bx-ts-fire { color: #b9ad90; opacity: 1; }

/* ── COMIC — Knall-Sprechblase: gezackter Explosionsstern in Gold mit dunkler
   Kontur, Combo als Ausruf mittendrin. Comic-Kontur + heller Kern sind auf
   jedem Hintergrund lesbar und passen zum „Boom"-Moment einer Combo. */
.bx-ts.bx-ts-comic { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  padding: calc(var(--u) * 34) calc(var(--u) * 38);
  /* Der Stern bleibt annähernd rund statt in breiten Boxen zu langen Zacken
     auszufransen: Kantenlänge = kurze Seite, gedeckelt auf u*340. */
  --burst: min(100%, calc(var(--u) * 340)); --burst-rim: clamp(4px, calc(var(--u) * 10), 24px); }
.bx-ts.bx-ts-comic::before { background: #14100c; padding: 0; -webkit-mask: none; mask: none; z-index: 0; border-radius: 0;
  inset: auto; left: 50%; top: 50%; width: var(--burst); height: var(--burst); transform: translate(-50%, -50%);
  -webkit-clip-path: polygon(50% 0%, 57.8% 21%, 73.9% 8.6%, 71.2% 28.8%, 89.4% 27.3%, 79% 42.2%, 100% 50%, 79% 57.8%, 91.4% 73.9%, 71.2% 71.2%, 72.8% 89.4%, 57.8% 79%, 50% 100%, 42.2% 79%, 26.1% 91.4%, 28.8% 71.2%, 10.6% 72.8%, 21% 57.8%, 0% 50%, 21% 42.2%, 8.6% 26.1%, 28.8% 28.8%, 27.2% 10.6%, 42.2% 21%);
  clip-path: polygon(50% 0%, 57.8% 21%, 73.9% 8.6%, 71.2% 28.8%, 89.4% 27.3%, 79% 42.2%, 100% 50%, 79% 57.8%, 91.4% 73.9%, 71.2% 71.2%, 72.8% 89.4%, 57.8% 79%, 50% 100%, 42.2% 79%, 26.1% 91.4%, 28.8% 71.2%, 10.6% 72.8%, 21% 57.8%, 0% 50%, 21% 42.2%, 8.6% 26.1%, 28.8% 28.8%, 27.2% 10.6%, 42.2% 21%); }
.bx-ts.bx-ts-comic::after { content: ''; position: absolute; z-index: 0; pointer-events: none;
  left: 50%; top: 50%; width: calc(var(--burst) - var(--burst-rim) * 2); height: calc(var(--burst) - var(--burst-rim) * 2);
  transform: translate(-50%, -50%);
  background: radial-gradient(circle at 50% 38%, #fff6c8, var(--bx-gold) 52%, #ff9a1a 100%);
  -webkit-clip-path: polygon(50% 0%, 57.8% 21%, 73.9% 8.6%, 71.2% 28.8%, 89.4% 27.3%, 79% 42.2%, 100% 50%, 79% 57.8%, 91.4% 73.9%, 71.2% 71.2%, 72.8% 89.4%, 57.8% 79%, 50% 100%, 42.2% 79%, 26.1% 91.4%, 28.8% 71.2%, 10.6% 72.8%, 21% 57.8%, 0% 50%, 21% 42.2%, 8.6% 26.1%, 28.8% 28.8%, 27.2% 10.6%, 42.2% 21%);
  clip-path: polygon(50% 0%, 57.8% 21%, 73.9% 8.6%, 71.2% 28.8%, 89.4% 27.3%, 79% 42.2%, 100% 50%, 79% 57.8%, 91.4% 73.9%, 71.2% 71.2%, 72.8% 89.4%, 57.8% 79%, 50% 100%, 42.2% 79%, 26.1% 91.4%, 28.8% 71.2%, 10.6% 72.8%, 21% 57.8%, 0% 50%, 21% 42.2%, 8.6% 26.1%, 28.8% 28.8%, 27.2% 10.6%, 42.2% 21%); }
.bx-ts-comic > * { position: relative; z-index: 1; }
.bx-ts-comic .bx-ts-kicker { color: #46320a; text-shadow: 0 0 4px rgba(255,255,255,.95), 0 0 9px rgba(255,255,255,.8); letter-spacing: .24em; }
.bx-ts-comic .bx-ts-row { margin: calc(var(--u) * 3) 0 0; transform: rotate(-4deg); }
.bx-ts-comic .bx-ts-img { animation: none; filter: drop-shadow(0 3px 6px rgba(70,50,10,.45)); }
.bx-ts-comic .bx-ts-x { color: #fff; font-size: clamp(26px, calc(var(--u) * 56), 190px);
  -webkit-text-stroke: clamp(2px, calc(var(--u) * 5), 11px) #14100c; paint-order: stroke fill;
  text-shadow: 0 calc(var(--u) * 3) 0 rgba(20,16,12,.35); }
.bx-ts-comic .bx-ts-gift { color: #14100c; text-shadow: 0 0 5px rgba(255,255,255,.95), 0 0 11px rgba(255,255,255,.85); letter-spacing: .06em; font-size: clamp(13px, calc(var(--u) * 24), 84px); }
.bx-ts-comic .bx-ts-by { color: #46320a; text-shadow: 0 0 4px rgba(255,255,255,.95), 0 0 9px rgba(255,255,255,.8); }
.bx-ts-comic .bx-ts-by b { color: #14100c; }
.bx-ts-comic .bx-ts-av { border-color: rgba(20,16,12,.55); }
.bx-ts-comic .bx-ts-empty { color: #46320a; text-shadow: none; }
.bx-ts-comic .bx-ts-fire { color: #46320a; opacity: .75; }

/* ── „Rahmen ausblenden" (bx-frameless) ───────────────────────────────────
   Ohne Panel steht der helle Text direkt auf dem Videobild und verschwand auf
   hellen Szenen. Kontur deshalb NUR im frameless-Fall — mit Panel bleibt alles
   unverändert. Stärke in em, damit sie mit der Textgrößen-Einstellung wächst.
   BEWUSST AUSGENOMMEN: flamme, bon, comic. Die drei bringen ihre eigene Fläche
   mit (Feuersäule, Kassenbon-Papier, Comic-Stern) und sind darauf schon
   lesbar; eine zusätzliche Kontur würde die Form zerschlagen. Für sie ist
   „Rahmen ausblenden" ohnehin gegenstandslos — sie haben nie ein Glas-Panel. */
.bx-frameless .bx-ts { box-shadow: none; }
/* Nur die Glas-Haarlinie der Standardkarte wegnehmen. Bei flamme/bon/comic ist
   ::before die Deko selbst (Feuersäule, Bonpapier, Comic-Stern) — die bleibt. */
.bx-frameless .bx-ts:not(.bx-ts-flamme):not(.bx-ts-bon):not(.bx-ts-comic)::before { display: none; }
.bx-frameless .bx-ts:not(.bx-ts-flamme):not(.bx-ts-bon):not(.bx-ts-comic) .bx-ts-kicker,
.bx-frameless .bx-ts:not(.bx-ts-flamme):not(.bx-ts-bon):not(.bx-ts-comic) .bx-ts-gift,
.bx-frameless .bx-ts:not(.bx-ts-flamme):not(.bx-ts-bon):not(.bx-ts-comic) .bx-ts-empty,
.bx-frameless .bx-ts:not(.bx-ts-flamme):not(.bx-ts-bon):not(.bx-ts-comic) .bx-ts-by {
  -webkit-text-stroke: max(1.5px, .085em) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 max(1px, .04em) max(3px, .1em) rgba(0,0,0,.55); }
.bx-frameless .bx-ts:not(.bx-ts-flamme):not(.bx-ts-bon):not(.bx-ts-comic) .bx-ts-img {
  filter: drop-shadow(0 0 1.5px rgba(10,11,18,.9)) drop-shadow(0 5px 12px rgba(0,0,0,.5)); }
/* Der Kassenbon zeichnet seine Trennlinien als border — die globale
   frameless-Regel hätte sie transparent gesetzt und den Bon entkernt. */
.bx-frameless .bx-ts-bon .bx-ts-kicker { border-bottom-color: #b9ad90 !important; }
.bx-frameless .bx-ts-bon .bx-ts-row { border-bottom-color: #c3b79a !important; }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Auslöser auf der KARTE, wenn eine NEUE HÖCHSTE COMBO gesetzt wird — render()
   läuft ausschließlich in diesem Moment.

   KOLLISION 1: Die Karte trägt bereits „bounce" (transform-Skalierung). Die
   Basis hebt über die Einzel-Eigenschaft scale an; zusammen hätte sich das
   multipliziert. Im Premium-Fall übernimmt die Basis das Anheben allein.
   KOLLISION 2: Der Ring der Basis läuft über box-shadow — dort steht je nach
   Stil der Glasschatten oder gar nichts (Flamme, Bon, Comic). Ein Ring hätte
   ihn 900 ms lang ersetzt. Deshalb hier ein Schein über „filter", der die
   Silhouette umfasst und jeden eigenen Schatten stehen lässt. */
.bx-premium .bx-ts.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-ts-hit-schein 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
@keyframes bx-ts-hit-schein {
  0% { filter: drop-shadow(0 0 0 color-mix(in srgb, var(--bx-accent) 95%, white)); }
  22% { filter: drop-shadow(0 0 .55em color-mix(in srgb, var(--bx-accent) 90%, white)); }
  100% { filter: drop-shadow(0 0 0 transparent); }
}
/* Die Combo-Zahl ist der Held der Karte — sie blitzt im Auslöser mit auf.
   (Sie heißt nicht wie ein Bild und fiel deshalb durch die Basis-Selektoren.) */
.bx-premium .bx-ts.bx-hit .bx-ts-x, .bx-premium .bx-ts.bx-hit .bx-ts-img {
  animation: bx-premium-flash 900ms cubic-bezier(0.2, 1.4, 0.35, 1); }
/* Der Kassenbon lebt von flacher Druckoptik — dort kein Aufblitzen. */
.bx-premium .bx-ts-bon.bx-hit .bx-ts-x, .bx-premium .bx-ts-bon.bx-hit .bx-ts-img { animation: none; }
/* Mehr Tiefe am Kicker; der Gift-Name bleibt die Schlagzeile. */
.bx-premium .bx-ts-kicker { text-shadow: 0 0 .7em color-mix(in srgb, var(--bx-gold) 55%, transparent), 0 .06em .12em rgba(0,0,0,.8); }
.bx-premium .bx-ts-bon .bx-ts-kicker, .bx-premium .bx-ts-comic .bx-ts-kicker { text-shadow: none; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const FIRE_SVG = '<svg class="bx-ts-fire" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 .5-2S6 10 6 13a6 6 0 0 0 12 0c0-5-6-11-6-11Z"/></svg>';

export default class TopStreak {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.title = props.title || 'Höchste Combo';
    this.max = 0;
    this.timers = new Set();
    this.el = document.createElement('div');
    // „glas" (Standard) und „sticker" behalten ihre alten Klassen unverändert,
    // damit bestehende Overlays exakt gleich aussehen. Neue Stile folgen dem
    // Schema der anderen Widgets: bx-ts-<stil>.
    const style = ['glas', 'sticker', 'flamme', 'bon', 'comic'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-ts${style === 'sticker' ? ' st-sticker' : style !== 'glas' ? ` bx-ts-${style}` : ''}`;
    this.el.innerHTML = `<div class="bx-ts-empty">${FIRE_SVG}<span>Noch keine Combo</span></div>`;
    root.appendChild(this.el);
    // Editor-Vorschau: Beispiel-Combo zeigen (sonst nur ein leerer Platzhalter).
    // max bleibt 0 → die erste echte Combo überschreibt die Demo sofort.
    if (ctx && ctx.preview) {
      this.render({ count: 25, slug: 'Rose', icon: '', nickname: 'Mia', avatar: '' });
      this.max = 0;
    }
  }
  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    const count = event.gift.count || 1;
    if (count <= this.max) return;
    this.render({ count, slug: giftName(event.gift), icon: event.gift.icon, nickname: event.user?.nickname, avatar: event.user?.profilePic });
  }
  onStats(stats) {
    const t = stats?.topStreak;
    if (!t || t.count <= this.max) return;
    this.render({ count: t.count, slug: t.giftSlug, icon: t.giftIcon, nickname: t.nickname, avatar: t.profilePic });
  }
  render({ count, slug, icon, nickname, avatar }) {
    this.max = count;
    // Höhe der Flammensäule (nur Stil „flamme"): logarithmisch, damit schon x5
    // sichtbar lodert und x999 nicht oben rausbrennt. 30 % … 82 % der Box.
    const f = Math.min(1, Math.log10(Math.max(1, count) + 1) / 2.6);
    this.el.style.setProperty('--flame', `${(52 + 40 * f).toFixed(1)}%`);
    this.el.innerHTML = `
      <div class="bx-ts-kicker">${escapeHtml(this.title)}</div>
      <div class="bx-ts-row">
        ${icon ? '<img class="bx-ts-img" alt="" />' : ''}
        <span class="bx-ts-x">×${count}</span>
      </div>
      <div class="bx-ts-gift"></div>
      <div class="bx-ts-by">${avatar ? '<img class="bx-ts-av" alt="" />' : ''} von <b></b></div>`;
    if (icon) this.el.querySelector('.bx-ts-img').src = icon;
    if (avatar) this.el.querySelector('.bx-ts-av').src = avatar;
    this.el.querySelector('.bx-ts-gift').textContent = slug;
    this.el.querySelector('.bx-ts-by b').textContent = nickname || 'Jemand';
    this.el.classList.remove('bounce'); void this.el.offsetWidth; this.el.classList.add('bounce');
    // Premium-Auslöser: eine neue Höchst-Combo ist DER bemerkenswerte Moment.
    // Klasse weg, Reflow, Klasse neu — sonst bliebe der Effekt bei zwei
    // Rekorden kurz hintereinander beim ersten stehen.
    this.el.classList.remove('bx-hit'); void this.el.offsetWidth; this.el.classList.add('bx-hit');
    const t = setTimeout(() => { this.timers.delete(t); this.el.classList.remove('bx-hit'); }, 900);
    this.timers.add(t);
  }
  // Neuer Stream → höchste Combo zurück auf „leer".
  onReset() { this.max = 0; this.el.style.removeProperty('--flame'); this.el.innerHTML = `<div class="bx-ts-empty">${FIRE_SVG}<span>Noch keine Combo</span></div>`; }
  destroy() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
