// chat-box.js — Premium Live-Chat im Overlay (NEU ggü. Alt-App).
// Glas-Bubbles, Avatar-Glow, hash-stabile Nickname-Farben, Mask-Fade.
// textContent-only (kein HTML-Inject). props: { style?, max?, hideAfterMs?, plattformZeichen?, emojiBilder?: 'auto'|'an'|'aus', kistenTitel? }
//
// ACHTUNG Namen: Der Optik-Stil 'sticker' (Klasse .bx-cb-sticker) ist der helle
// Bubble-Look und hat NICHTS mit TikTok-Stickern zu tun. Die Bilder aus dem
// Chat heissen deshalb durchgaengig „emote" (.bx-cb-emote).
import { textMitStickern, hatInhalt } from './sticker-text.js';
import { haengeTextAn, setzeTextMitEmojis } from './emoji-bild.js';

const STYLE_ID = 'bx-cb-style';
const CSS = `
.bx-cb { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: clamp(3px,1.4cqh,12px);
  overflow: hidden; container-type: size;
  /* Emoji-Schriften ausdrücklich ans Ende: OBS (CEF unter Windows) setzte
     ZWJ-Folgen wie die Piratenflagge sonst aus Einzelteilen zusammen. Greift
     nur für Zeichen, die die eigentliche Schrift nicht hat. */
  font-family: var(--bx-font-body), 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 14%); mask-image: linear-gradient(to bottom, transparent, #000 14%); }
.bx-cb-msg { display: flex; align-items: flex-start; gap: clamp(5px,1.8cqi,16px); padding: clamp(3px,1.3cqh,12px) clamp(7px,2.6cqi,22px) clamp(4px,1.5cqh,13px) clamp(4px,1.4cqi,14px); border-radius: 14px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  box-shadow: 0 6px 16px -8px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05) inset;
  transform: translateY(14px); opacity: 0; animation: bx-cb-in 280ms cubic-bezier(.2,1.3,.4,1) forwards; }
.bx-cb-msg.fade { animation: bx-cb-out 420ms ease-in forwards; }
/* Passt nicht mehr in die Box → gar nicht erst zeigen (statt oben abschneiden). */
.bx-cb-msg.bx-off { display: none; }
/* Eigener Groessen-Container, damit der Fallback-Buchstabe (.bx-av::after) mitwaechst. */
.bx-cb-pic { width: clamp(17px,min(6.6cqi,7.5cqh),46px); aspect-ratio: 1/1; height: auto; border-radius: 50%; flex: none; margin-top: 1px;
  container-type: size; box-shadow: 0 0 0 2px rgba(255,255,255,.12); }
/* Bewusst OHNE --bx-fs: der Buchstabe sitzt in einem Kreis fester Größe und
   würde sonst herauslaufen — die Textgrößen-Einstellung wirkt auf echte Texte. */
.bx-cb-pic::after { font-size: 52cqmin; }
.bx-cb-body { min-width: 0; }
.bx-cb-name { font-family: var(--bx-font-display), 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif; font-size: calc((clamp(9px,min(3.4cqi,4.2cqh),22px)) * var(--bx-fs, 1)); text-transform: uppercase; letter-spacing: .03em;
  text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.bx-cb-text { font-size: calc((clamp(11px,min(4.4cqi,5.4cqh),28px)) * var(--bx-fs, 1)); line-height: 1.28; color: var(--bx-text,#f2f3f8); text-shadow: 0 1px 2px rgba(0,0,0,.6);
  word-break: break-word; overflow-wrap: anywhere; }
/* TikTok-Sticker im Text. Hoehe an die Zeile gekoppelt (em, nicht cq), damit er
   in jeder Widget-Groesse mitwaechst und die Zeile nie sprengt. */
.bx-cb-emote { height: 1.5em; width: auto; vertical-align: -0.35em; border-radius: 5px; object-fit: contain; }
/* Bild nicht ladbar → farbiges Kaestchen statt kaputtem Bildsymbol. */
.bx-cb-emote-leer { width: 1.5em; opacity: .55; border-radius: 5px; }
/* Twitch-GIFs (Giphy im Chat) sind Bilder, keine Emotes: eigene Zeile, sichtbar gross.
   Drei Klassen tief, damit kein Stil (piraten, schatzkiste ...) sie auf Emote-Hoehe drueckt. */
.bx-cb .bx-cb-emote.bx-cb-gif { display: block; height: auto; width: auto; max-width: 100%; max-height: 5.5em; margin: .3em 0 .1em; border-radius: 8px; vertical-align: 0; }
/* Plattform-Zeichen vor dem Namen (nur mit props.plattformZeichen, Standard aus).
   Groesse in em, damit es mit der Namensschrift (und --bx-fs) mitwaechst. */
.bx-cb-pf { display: inline-block; width: 1.05em; height: 1.05em; margin-right: .32em; vertical-align: -0.16em; }
.bx-cb-pf svg { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 1px 1px rgba(0,0,0,.7)); }
@keyframes bx-cb-in { to { transform: translateY(0); opacity: 1; } }
@keyframes bx-cb-out { to { opacity: 0; } }

/* ── Stil „Clean" — keine Bubbles: pure Textzeilen mit harter Schattenkante,
   minimaler Footprint (klassischer Gamer-Chat direkt überm Gameplay). */
.bx-cb-clean .bx-cb-msg { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  padding: clamp(1px,.5cqh,4px) 4px; border-radius: 0; }
.bx-cb-clean .bx-cb-pic { box-shadow: 0 2px 6px rgba(0,0,0,.7); }
.bx-cb-clean .bx-cb-name { text-shadow: 0 1px 0 rgba(0,0,0,.9), 0 2px 6px rgba(0,0,0,.9); }
.bx-cb-clean .bx-cb-text { color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,.95), 0 2px 8px rgba(0,0,0,.9); }

/* ── Stil „Sticker" — helle Comic-Bubbles mit dunkler Schrift und Akzent-Nase,
   leicht abwechselnd gekippt: verspielter Cute-Pop-Look. */
.bx-cb-sticker .bx-cb-msg { background: rgba(255,255,255,.94); border-radius: 16px 16px 16px 4px;
  box-shadow: 0 6px 16px -6px rgba(0,0,0,.55), 0 0 0 2.5px var(--bx-accent);
  -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-cb-sticker .bx-cb-msg:nth-child(odd) { transform-origin: left bottom; rotate: -0.6deg; }
.bx-cb-sticker .bx-cb-msg:nth-child(even) { transform-origin: left bottom; rotate: 0.5deg; }
.bx-cb-sticker .bx-cb-text { color: #14161f; text-shadow: none; font-weight: 600; }
.bx-cb-sticker .bx-cb-name { text-shadow: none; }

/* ── Stil „Piraten" (Gold & Lila) — Nachtmeer-Thema: jede Nachricht eine
   kompakte Karte aus violettem Glas mit goldener Lichtkante, Profilbild im
   Goldring, Name in Lilita One, Text in Saira. Neue Karten gleiten von links
   herein, ein Goldschimmer läuft einmal darüber; ältere treten leicht zurück.
   Die Schriften setzt das JS nur, wenn der Nutzer keine eigene gewählt hat. */
.bx-cb-piraten { gap: clamp(4px,1.5cqh,12px); padding: 0 clamp(2px,1cqi,8px) clamp(2px,.8cqh,6px) clamp(1px,.6cqi,5px); box-sizing: border-box;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 10%); mask-image: linear-gradient(to bottom, transparent, #000 10%); }
.bx-cb-piraten .bx-cb-msg { position: relative; overflow: hidden; isolation: isolate; align-items: flex-start; flex: none;
  gap: clamp(6px,2.2cqi,16px); border-radius: clamp(8px,2.6cqi,16px);
  padding: clamp(5px,1.6cqh,13px) clamp(9px,3cqi,22px) clamp(6px,1.9cqh,15px) clamp(6px,2cqi,15px);
  background:
    radial-gradient(130% 160% at 0% 0%, rgba(145,70,255,.34), transparent 58%),
    linear-gradient(165deg, rgba(40,21,78,.93), rgba(18,10,36,.95) 70%);
  -webkit-backdrop-filter: blur(10px) saturate(1.25); backdrop-filter: blur(10px) saturate(1.25);
  box-shadow: inset 0 1px 0 rgba(255,222,140,.42), inset 0 0 0 1px rgba(184,129,31,.30),
    0 10px 22px -12px rgba(0,0,0,.85), 0 0 22px -10px rgba(145,70,255,.7);
  transform: none; opacity: 1; transform-origin: left center;
  animation: bx-cb-pt-in 520ms cubic-bezier(.16,1.12,.3,1) backwards;
  transition: opacity 600ms ease, scale 600ms ease, filter 600ms ease; }
/* Goldene Lichtkante oben: in der Mitte am hellsten, zu den Seiten hin weg. */
.bx-cb-piraten .bx-cb-msg::before { content: ''; position: absolute; left: 6%; right: 6%; top: 0; height: 1.5px; z-index: 1; pointer-events: none;
  background: linear-gradient(90deg, transparent, #b8811f 18%, #f5c451 42%, #fff1c2 55%, #f5c451 70%, #b8811f 86%, transparent);
  box-shadow: 0 0 8px rgba(245,196,81,.55); }
/* Goldschimmer: läuft beim Eintreffen genau einmal über die Karte. */
.bx-cb-piraten .bx-cb-msg::after { content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background: linear-gradient(100deg, transparent 30%, rgba(255,214,120,.14) 42%, rgba(255,238,190,.55) 50%, rgba(255,214,120,.14) 58%, transparent 70%);
  transform: translateX(-120%); animation: bx-cb-pt-glanz 1300ms 140ms cubic-bezier(.3,.6,.3,1) forwards; }
/* Ältere Nachrichten treten zurück — die neueste bleibt der Blickfang. */
.bx-cb-piraten .bx-cb-msg:nth-last-child(n+3) { scale: .985; filter: brightness(.93); }
.bx-cb-piraten .bx-cb-msg:nth-last-child(n+5) { opacity: .9; scale: .97; filter: brightness(.84) saturate(.9); }
.bx-cb-piraten .bx-cb-msg:nth-last-child(n+7) { opacity: .8; scale: .955; filter: brightness(.74) saturate(.8); }
.bx-cb-piraten .bx-cb-msg.fade { animation: bx-cb-pt-out 440ms ease-in forwards; }
.bx-cb-piraten .bx-cb-pic { width: clamp(20px,min(8.4cqi,9.6cqh),54px); margin-top: .15em;
  box-shadow: 0 0 0 2px #f5c451, 0 0 0 3.5px rgba(18,10,36,.95), 0 0 0 4.5px rgba(184,129,31,.55), 0 0 12px 2px rgba(245,196,81,.35); }
.bx-cb-piraten .bx-cb-body { flex: 1 1 auto; min-width: 0; }
.bx-cb-piraten .bx-cb-name { display: flex; align-items: center; gap: .3em; min-width: 0;
  font-size: calc((clamp(11px,min(4cqi,4.8cqh),26px)) * var(--bx-fs, 1)); line-height: 1.15;
  text-transform: none; letter-spacing: .015em; margin-bottom: .12em;
  text-shadow: 0 2px 0 rgba(10,4,24,.75), 0 0 .6em rgba(0,0,0,.45); }
.bx-cb-nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bx-cb-piraten .bx-cb-pf { flex: none; margin-right: 0; }
.bx-cb-bdg { display: inline-flex; gap: .18em; flex: none; }
.bx-cb-b { display: inline-grid; place-items: center; width: 1.12em; height: 1.12em; border-radius: .3em; flex: none;
  box-shadow: 0 1px 0 rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.28); }
.bx-cb-b svg { width: 78%; height: 78%; display: block; overflow: visible; }
.bx-cb-b-host { background: linear-gradient(180deg, #ff5a4f, #b3121b); }
.bx-cb-b-mod { background: linear-gradient(180deg, #33d77f, #0d8445); }
.bx-cb-b-sub { background: linear-gradient(180deg, #a874ff, #6a2ce0); }
.bx-cb-piraten .bx-cb-text { font-family: var(--bx-font-body), 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  font-weight: 600; color: var(--bx-text,#f7f2ff); letter-spacing: .005em;
  font-size: calc((clamp(12px,min(4.9cqi,5.8cqh),30px)) * var(--bx-fs, 1)); line-height: 1.24;
  text-shadow: 0 1px 2px rgba(6,2,16,.85); }
.bx-cb-piraten .bx-cb-emote { height: 1.32em; vertical-align: -0.3em; border-radius: 4px; }
.bx-cb-piraten .bx-cb-emote-leer { width: 1.32em; }
@keyframes bx-cb-pt-in {
  0% { opacity: 0; transform: translateX(-34px) scale(.96); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: none; } }
@keyframes bx-cb-pt-glanz { to { transform: translateX(120%); } }
@keyframes bx-cb-pt-out { to { opacity: 0; transform: translateX(-18px); } }
@keyframes bx-cb-pt-ein { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .bx-cb-piraten .bx-cb-msg { animation: bx-cb-pt-ein 300ms ease-out backwards; transition: none; }
  .bx-cb-piraten .bx-cb-msg::after { display: none; }
  .bx-cb-piraten .bx-cb-msg.fade { animation: bx-cb-out 420ms ease-in forwards; } }
html.bx-perf .bx-cb-piraten .bx-cb-msg::after { display: none; }
/* Rahmen ausblenden: Karte und Lichtkante weg, Goldring und Abzeichen bleiben. */
html .bx-frameless .bx-cb-piraten .bx-cb-msg { background: none; }
html .bx-frameless .bx-cb-piraten .bx-cb-msg::before, html .bx-frameless .bx-cb-piraten .bx-cb-msg::after { display: none; }

/* ── Stil „Schatzkiste" (Fortnite-Insel) — der ganze Chat ist eine Szene:
   Holzkiste mit Maserung, Messingbeschlägen und Nieten; der gewölbte Deckel
   steht einen Spalt offen, Goldlicht und Münzen quellen heraus und fallen auf
   die Plakette. Darunter eine Insel, die links und rechts aus dem Bild läuft.
   Die Nachrichten sind Piraten-Karten in der Samtmulde. Licht kommt immer von
   oben links. Alles CSS + Inline-SVG (Maserung/Samt/Wellen als SVG-Daten-URI),
   Maße in cq-Einheiten der Szene. Konturen über box-shadow/SVG-stroke, nie
   border (die frameless-Regel würde sie löschen).
   Bewegung NUR über transform/opacity/filter (bzw. translate/rotate/scale);
   prefers-reduced-motion und Sparmodus stellen alles still. */
.bx-ck { position: absolute; inset: 0; overflow: hidden; container-type: size; pointer-events: none;
  --ck-holz-h: #d9924a; --ck-holz: #a65d27; --ck-holz-d: #5e2f10; --ck-tinte: #1d0c03;
  --ck-gold-h: #fff4c8; --ck-gold: #f5c451; --ck-gold-m: #d49a2e; --ck-gold-d: #a8701a; --ck-gold-t: #6b3f08; }
/* Warmer Schein rund um die Kiste — läuft vor den Rändern aus. */
.bx-ck-aura { position: absolute; inset: 0; z-index: 0;
  background: radial-gradient(46% 40% at 50% 22%, rgba(255,214,110,.42), transparent 72%),
    radial-gradient(60% 50% at 50% 55%, rgba(145,70,255,.22), transparent 75%); }
/* Der offene Spalt: oben tiefer Schatten unterm Deckel, unten Goldlicht und Münzberg. */
.bx-ck-glut { position: absolute; left: 5cqi; right: 5cqi; top: 13cqh; height: 10.5cqh; z-index: 1; overflow: hidden;
  border-radius: .8cqmin;
  background:
    radial-gradient(circle at 50% 100%, #fff4c8 0 26%, #f5c451 31% 50%, #9a5f12 55% 62%, transparent 66%) 0 calc(100% - 1.6cqh) / 3.4cqmin 2.5cqmin repeat-x,
    radial-gradient(circle at 50% 100%, #ffe7a0 0 26%, #e0a93c 31% 50%, #6b3f08 55% 62%, transparent 66%) 1.7cqmin calc(100% - 3cqh) / 3.4cqmin 2.5cqmin repeat-x,
    radial-gradient(40% 90% at 50% 100%, #fffbe6, rgba(255,214,110,.9) 40%, transparent 75%),
    linear-gradient(180deg, #080200 0 30%, #3d1c04 48%, #b97a22 72%, #ffe29a 90%);
  box-shadow: 0 0 0 .6cqmin var(--ck-tinte); }
/* Glitzern auf den Münzen im Spalt. */
.bx-ck-glut::after { content: ''; position: absolute; inset: 0;
  background: radial-gradient(circle, #fff 0 .25cqmin, transparent .6cqmin) 0 calc(100% - 2.4cqh) / 11cqmin 3cqh repeat-x;
  animation: bx-ck-funkeln 2.2s ease-in-out infinite; }
/* Lichtausbruch aus dem Spalt: liegt über Deckelkante und Plakette (screen). */
.bx-ck-schein { position: absolute; left: 0; right: 0; top: 2cqh; height: 30cqh; z-index: 7; mix-blend-mode: screen;
  background:
    radial-gradient(38% 34% at 50% 62%, rgba(255,226,140,.55), transparent 70%),
    repeating-conic-gradient(from -90deg at 50% 64%, rgba(255,236,170,.22) 0 3deg, transparent 3deg 11deg);
  -webkit-mask-image: radial-gradient(48% 52% at 50% 62%, #000 30%, transparent 75%); mask-image: radial-gradient(48% 52% at 50% 62%, #000 30%, transparent 75%);
  opacity: .8; animation: bx-ck-pulsen 3.2s ease-in-out infinite alternate; }
/* Deckel: gewölbt (Lichtband oben links), Maserung, Brettfugen, Unterseite dunkel. */
.bx-ck-deckel { position: absolute; left: 2.2cqi; right: 2.2cqi; top: 1cqh; height: 16cqh; z-index: 3; overflow: hidden;
  border-radius: 50% 50% 4% 4% / 100% 100% 8% 8%;
  background:
    radial-gradient(60% 55% at 30% 18%, rgba(255,236,200,.5), transparent 70%),
    linear-gradient(90deg, rgba(255,210,150,.18), transparent 35%, transparent 65%, rgba(0,0,0,.25)),
    repeating-linear-gradient(180deg, transparent 0 calc(25% - .6cqmin), rgba(20,8,2,.7) calc(25% - .6cqmin) calc(25% - .2cqmin), rgba(255,200,140,.28) calc(25% - .2cqmin) 25%),
    url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='90'%3E %3Cfilter id='m' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.008 0.32' numOctaves='3' seed='11' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 0.14 0 0 0 0 0.06 0 0 0 0 0.01 0 0 0 2.2 -1.0'/%3E%3C/filter%3E %3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E") 0 0 / 70cqmin 18cqmin,
    linear-gradient(180deg, var(--ck-holz-h), var(--ck-holz) 55%, var(--ck-holz-d));
  box-shadow: 0 0 0 .7cqmin var(--ck-tinte), inset 0 .8cqmin 0 rgba(255,226,180,.45), inset 0 -1.6cqmin 1.4cqmin -.6cqmin rgba(0,0,0,.6);
  transition: translate 160ms ease-out; }
/* Messingbeschläge auf dem Deckel: zwei Bänder + Vorderkante, abgeschrägt. */
.bx-ck-band { position: absolute; top: -2%; bottom: 0; width: 5.2cqmin; z-index: 1;
  background: linear-gradient(90deg, var(--ck-gold-t), var(--ck-gold-h) 18%, var(--ck-gold) 42%, var(--ck-gold-m) 70%, var(--ck-gold-t));
  box-shadow: 0 0 0 .45cqmin var(--ck-tinte); }
.bx-ck-band::after { content: ''; position: absolute; left: 50%; translate: -50% 0; top: 22%; bottom: 14%; width: 1.7cqmin;
  background: radial-gradient(circle at 40% 35%, #fff 0 .2cqmin, var(--ck-gold-h) .3cqmin, var(--ck-gold-d) .7cqmin, var(--ck-gold-t) .85cqmin, transparent .95cqmin) 50% 0 / 1.7cqmin 4.2cqmin repeat-y; }
.bx-ck-band.l { left: 13%; } .bx-ck-band.r { right: 13%; }
.bx-ck-rand { position: absolute; left: 0; right: 0; bottom: 0; height: 2.6cqmin; z-index: 2;
  background: linear-gradient(180deg, var(--ck-gold-h), var(--ck-gold) 35%, var(--ck-gold-m) 70%, var(--ck-gold-t));
  box-shadow: 0 -.4cqmin 0 var(--ck-tinte); }
/* Glanzwisch über das Messing (alle ~5 s). */
.bx-ck-wisch { position: absolute; inset: 0; z-index: 4; overflow: hidden; border-radius: inherit; }
.bx-ck-wisch::before { content: ''; position: absolute; top: -10%; bottom: -10%; left: 0; width: 22%;
  background: linear-gradient(100deg, transparent, rgba(255,250,225,.55) 50%, transparent);
  transform: translateX(-120%) skewX(-20deg); animation: bx-ck-wisch 5.4s ease-in-out 2.4s infinite; }
/* Kasten: Bretter mit Fugen (dunkle Kerbe + Lichtkante), Maserung, unten dunkler. */
.bx-ck-korpus { position: absolute; left: 2.5cqi; right: 2.5cqi; top: 21.6cqh; bottom: 3cqh; z-index: 2;
  border-radius: 1.4cqmin 1.4cqmin 2.2cqmin 2.2cqmin;
  background:
    linear-gradient(180deg, transparent 40%, rgba(20,6,0,.45)),
    linear-gradient(90deg, rgba(255,210,150,.16), transparent 30%, transparent 70%, rgba(0,0,0,.28)),
    repeating-linear-gradient(180deg, transparent 0 calc(20% - .7cqmin), rgba(20,8,2,.75) calc(20% - .7cqmin) calc(20% - .25cqmin), rgba(255,200,140,.3) calc(20% - .25cqmin) 20%),
    url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='90'%3E %3Cfilter id='m' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.008 0.32' numOctaves='3' seed='11' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 0.14 0 0 0 0 0.06 0 0 0 0 0.01 0 0 0 2.2 -1.0'/%3E%3C/filter%3E %3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E") 0 0 / 70cqmin 18cqmin,
    linear-gradient(180deg, var(--ck-holz-h), var(--ck-holz) 45%, var(--ck-holz-d));
  box-shadow: 0 0 0 .7cqmin var(--ck-tinte), inset 0 .7cqmin 0 rgba(255,226,180,.4), inset .6cqmin 0 0 rgba(255,210,160,.18),
    0 2cqmin 3cqmin -1cqmin rgba(0,0,0,.7); }
/* Messinglippe oben am Kasten mit Nietenreihe. */
.bx-ck-lippe { position: absolute; left: -.3cqmin; right: -.3cqmin; top: -.3cqmin; height: 3.4cqmin; z-index: 3; border-radius: 1.2cqmin 1.2cqmin .4cqmin .4cqmin;
  background:
    radial-gradient(circle at 40% 35%, #fff 0 .2cqmin, var(--ck-gold-h) .3cqmin, var(--ck-gold-d) .65cqmin, var(--ck-gold-t) .8cqmin, transparent .9cqmin) 2.6cqmin 50% / 6cqmin 100% repeat-x,
    linear-gradient(180deg, var(--ck-gold-h), var(--ck-gold) 35%, var(--ck-gold-m) 70%, var(--ck-gold-t));
  box-shadow: 0 0 0 .5cqmin var(--ck-tinte), inset 0 -.35cqmin 0 rgba(107,63,8,.7); overflow: hidden; }
/* Samtmulde: tiefes Violett, Samtrauschen, kräftiger Innenschatten, Goldfaden. */
.bx-ck-innen { position: absolute; left: 4.4cqmin; right: 4.4cqmin; top: 4.6cqmin; bottom: 13.5cqh; overflow: hidden; z-index: 2;
  border-radius: 1.4cqmin;
  background:
    radial-gradient(90% 45% at 50% 0%, rgba(255,214,110,.2), transparent 70%),
    url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E %3Cfilter id='s' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='3' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 0.75 0 0 0 0 0.6 0 0 0 0 1 0 0 0 0.55 -0.2'/%3E%3C/filter%3E %3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E") 0 0 / 40cqmin 40cqmin,
    radial-gradient(130% 100% at 20% 0%, #2c1658, #1a0c36 55%, #0d0620);
  box-shadow: 0 0 0 .5cqmin var(--ck-tinte), 0 0 0 1cqmin rgba(212,154,46,.75), 0 0 0 1.4cqmin var(--ck-tinte),
    inset 0 1.4cqmin 2.4cqmin rgba(0,0,0,.8), inset 0 -1cqmin 2cqmin rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,214,110,.22); }
/* Münzen + Edelsteine in den unteren Ecken der Mulde, hinter den Karten. */
.bx-ck-beute { position: absolute; bottom: -.4cqmin; height: 7cqmin; width: auto; aspect-ratio: 5 / 3; z-index: 0; }
.bx-ck-beute.l { left: -.6cqmin; } .bx-ck-beute.r { right: -.6cqmin; transform: scaleX(-1); }
.bx-ck-funke { position: absolute; width: 2.4cqmin; height: 2.4cqmin; z-index: 1;
  background: conic-gradient(from 45deg, transparent 0 20%, #fff 25%, transparent 30% 45%, #fff 50%, transparent 55% 70%, #fff 75%, transparent 80% 95%, #fff 100%);
  -webkit-mask-image: radial-gradient(circle, #000 0 20%, transparent 70%); mask-image: radial-gradient(circle, #000 0 20%, transparent 70%);
  animation: bx-ck-funke 2.6s ease-in-out infinite; }
.bx-ck-funke.a { left: 3.4cqmin; bottom: 3.6cqmin; } .bx-ck-funke.b { right: 4.6cqmin; bottom: 2.4cqmin; animation-delay: 1.3s; }
/* Goldstaub, der aus der Kiste steigt. */
.bx-ck-staub { position: absolute; left: 6cqi; right: 6cqi; top: 4cqh; height: 20cqh; z-index: 6; }
.bx-ck-staub i { position: absolute; bottom: 0; width: 1.5cqmin; height: 1.5cqmin; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, #fff 0 18%, #ffe9a0 35%, rgba(245,196,81,.7) 55%, transparent 72%);
  box-shadow: 0 0 1.4cqmin .2cqmin rgba(255,214,110,.85); animation: bx-ck-staub 4.2s linear infinite; }
.bx-ck-staub i:nth-child(1) { left: 14%; animation-delay: 0s; }
.bx-ck-staub i:nth-child(2) { left: 27%; animation-delay: 1.6s; animation-duration: 5s; }
.bx-ck-staub i:nth-child(3) { left: 41%; animation-delay: .7s; animation-duration: 3.8s; }
.bx-ck-staub i:nth-child(4) { left: 58%; animation-delay: 2.4s; }
.bx-ck-staub i:nth-child(5) { left: 71%; animation-delay: 1.1s; animation-duration: 4.8s; }
.bx-ck-staub i:nth-child(6) { left: 86%; animation-delay: 3s; animation-duration: 3.6s; }
.bx-ck-staub i:nth-child(7) { left: 50%; animation-delay: 3.6s; animation-duration: 5.4s; }
/* Messing-Eckkappen (SVG, Seitenverhältnis fest). */
.bx-ck-ecke { position: absolute; width: 11cqmin; height: 11cqmin; z-index: 4; }
.bx-ck-ecke.ol { left: -1cqmin; top: -1cqmin; }
.bx-ck-ecke.or { right: -1cqmin; top: -1cqmin; transform: scaleX(-1); }
.bx-ck-ecke.ul { left: -1cqmin; bottom: -1cqmin; transform: scaleY(-1); }
.bx-ck-ecke.ur { right: -1cqmin; bottom: -1cqmin; transform: scale(-1,-1); }
/* Plakette: Schnörkel – Goldplatte – Schnörkel. Platte glänzend, Text graviert. */
.bx-ck-schild { position: absolute; left: 50%; top: 3.2cqh; z-index: 8; translate: -50% 0; max-width: 86cqi;
  display: flex; align-items: center; transition: translate 160ms ease-out; }
.bx-ck-rolle { flex: none; height: 5.6cqh; width: auto; aspect-ratio: 2 / 3; margin: 0 -.6cqmin; position: relative; z-index: 0; }
.bx-ck-rolle.r { transform: scaleX(-1); }
.bx-ck-platte { position: relative; z-index: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 1.2cqmin;
  padding: .5cqh 2.6cqmin .7cqh; border-radius: 1.6cqmin;
  background:
    linear-gradient(180deg, rgba(255,255,255,.55) 0 8%, rgba(255,255,255,.18) 46%, transparent 50%),
    linear-gradient(180deg, var(--ck-gold-h), var(--ck-gold) 35%, var(--ck-gold-m) 62%, var(--ck-gold-d) 90%);
  box-shadow: 0 0 0 .7cqmin var(--ck-tinte), inset 0 .4cqmin 0 rgba(255,255,255,.75), inset 0 -.7cqmin 0 rgba(107,63,8,.6),
    inset 0 0 0 1.1cqmin rgba(255,240,190,.0), 0 1.1cqmin 0 -.1cqmin var(--ck-tinte), 0 0 3cqmin rgba(255,214,110,.6); }
/* Eingelassenes Feld in der Platte (Gravur sitzt darin). */
.bx-ck-feld { min-width: 0; padding: .1cqh 1.6cqmin; border-radius: .9cqmin;
  background: linear-gradient(180deg, rgba(122,74,12,.28), rgba(255,236,170,.18));
  box-shadow: inset 0 .35cqmin .5cqmin rgba(80,44,4,.55), inset 0 -.2cqmin 0 rgba(255,248,215,.6); }
.bx-ck-niete { flex: none; width: 1.7cqmin; height: 1.7cqmin; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff 0 .2cqmin, var(--ck-gold-h) .35cqmin, var(--ck-gold-d) 65%, var(--ck-gold-t));
  box-shadow: 0 0 0 .25cqmin rgba(29,12,3,.8), 0 .2cqmin 0 rgba(255,248,215,.5); }
.bx-ck-titel { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--bx-font-display); font-size: calc((clamp(11px, min(5.4cqi, 6.4cqh), 34px)) * var(--bx-fs, 1));
  line-height: 1.14; letter-spacing: .05em; text-transform: uppercase; color: #5a2f03;
  text-shadow: 0 .07em 0 rgba(255,246,214,.85), 0 -.05em 0 rgba(60,28,0,.55); }
.bx-ck-glanz { position: absolute; inset: 0; pointer-events: none; overflow: hidden; border-radius: inherit; }
.bx-ck-glanz::before { content: ''; position: absolute; top: -20%; bottom: -20%; left: 0; width: 30%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.9) 50%, transparent);
  transform: translateX(-160%) skewX(-18deg); animation: bx-ck-glanz 5s ease-in-out 1.2s infinite; }
/* Schloss: hängt unter der Plakette über dem Spalt. */
.bx-ck-schloss { position: absolute; left: 50%; top: 14.6cqh; height: 8.6cqh; width: auto; aspect-ratio: 3 / 4; translate: -50% 0; z-index: 5;
  transition: translate 160ms ease-out; }
/* Insel: Sand (Dünen, nasser Saum), Wasser mit Tiefe, Lichtnetz, Schaum, Palmen, Krebs. */
.bx-ck-insel { position: absolute; left: 0; right: 0; bottom: 0; height: 18cqh; z-index: 9; overflow: hidden; }
.bx-ck-insel > svg { position: absolute; display: block; }
.bx-ck-land { left: 0; bottom: 0; width: 100%; height: 100%; }
.bx-ck-kaustik { position: absolute; left: 0; bottom: 0; width: 200%; height: 4.6cqh; opacity: .55;
  background: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 40' preserveAspectRatio='none'%3E %3Cg fill='none' stroke='%23dffffb' stroke-width='1.4' stroke-linecap='round' opacity='.75'%3E %3Cpath d='M4 10 q10 -6 20 0 t20 2'/%3E%3Cpath d='M50 26 q12 -7 24 -1 t18 3'/%3E%3Cpath d='M96 12 q9 -5 18 0 t22 -1'/%3E %3Cpath d='M20 32 q8 -4 16 0'/%3E%3Cpath d='M120 30 q10 -6 22 0'/%3E%3Cpath d='M70 6 q6 -3 12 0'/%3E%3C/g%3E%3C/svg%3E") 0 0 / 12.5% 100% repeat-x; mix-blend-mode: screen;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 40%); mask-image: linear-gradient(180deg, transparent, #000 40%);
  animation: bx-ck-welle 14s linear infinite; }
.bx-ck-welle { position: absolute; left: 0; bottom: 4.2cqh; width: 200%; height: 2.2cqh; opacity: .9;
  background: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 10' preserveAspectRatio='none'%3E %3Cpath d='M0 5 Q15 0 30 5 T60 5 T90 5 T120 5' fill='none' stroke='%23f2fffd' stroke-width='2.6' stroke-linecap='round'/%3E%3C/svg%3E") 0 0 / 25% 100% repeat-x;
  animation: bx-ck-welle 8s linear infinite, bx-ck-schaum 2.4s ease-in-out infinite alternate; }
.bx-ck-welle.b { bottom: 1.6cqh; opacity: .45; animation-duration: 12s, 3.1s; animation-direction: reverse, alternate; }
.bx-ck-palme { bottom: 2.4cqh; height: 19cqh; width: auto; aspect-ratio: 3 / 4; transform-origin: 45% 100%;
  filter: drop-shadow(.3cqmin .5cqmin 0 rgba(13,40,24,.45)); animation: bx-ck-wiegen 5.5s ease-in-out infinite alternate; }
.bx-ck-palme.l { left: -2.6cqi; }
.bx-ck-palme.r { right: -1.6cqi; height: 15cqh; transform: scaleX(-1); animation-duration: 6.4s; animation-delay: -2s; }
.bx-ck-krebs { right: 20cqi; bottom: 6cqh; height: 3.4cqh; width: auto; aspect-ratio: 3 / 2; animation: bx-ck-krebs 7s ease-in-out infinite; }
.bx-ck-muschel { left: 17cqi; bottom: 5.4cqh; height: 2.6cqh; width: auto; aspect-ratio: 1; }
/* Neue Nachricht: der Deckel hüpft, Licht blitzt, ein paar Münzen springen. */
.bx-ck.bx-ck-bump .bx-ck-deckel, .bx-ck.bx-ck-bump .bx-ck-schild, .bx-ck.bx-ck-bump .bx-ck-schloss { animation: bx-ck-bump 520ms cubic-bezier(.2,1.6,.4,1); }
.bx-ck.bx-ck-bump .bx-ck-schild, .bx-ck.bx-ck-bump .bx-ck-schloss { animation-name: bx-ck-bump-mitte; }
.bx-ck.bx-ck-bump .bx-ck-schein { animation: bx-ck-blitz 700ms ease-out; }
.bx-ck-muenze { position: absolute; top: 19cqh; width: 3.8cqmin; height: 3.8cqmin; z-index: 9; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle at 35% 30%, #fff 0 .25cqmin, var(--ck-gold-h) .4cqmin, var(--ck-gold) 55%, var(--ck-gold-d));
  box-shadow: 0 0 0 .45cqmin var(--ck-tinte), inset 0 0 0 .5cqmin rgba(168,112,26,.8), 0 0 1.6cqmin rgba(255,214,110,.9);
  animation: bx-ck-muenze 900ms cubic-bezier(.3,.7,.5,1) forwards; }
@keyframes bx-ck-welle { to { transform: translateX(-50%); } }
@keyframes bx-ck-schaum { from { opacity: .55; } to { opacity: 1; } }
@keyframes bx-ck-glanz { 0%, 62% { transform: translateX(-160%) skewX(-18deg); } 100% { transform: translateX(420%) skewX(-18deg); } }
@keyframes bx-ck-wisch { 0%, 70% { transform: translateX(-120%) skewX(-20deg); } 100% { transform: translateX(560%) skewX(-20deg); } }
@keyframes bx-ck-pulsen { from { opacity: .55; } to { opacity: 1; } }
@keyframes bx-ck-funkeln { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
@keyframes bx-ck-funke { 0%, 70%, 100% { opacity: 0; transform: scale(.3) rotate(0deg); } 82% { opacity: 1; transform: scale(1) rotate(45deg); } }
@keyframes bx-ck-staub {
  0% { opacity: 0; transform: translate(0, 0) scale(.6); }
  15% { opacity: 1; }
  100% { opacity: 0; transform: translate(1.6cqmin, -17cqh) scale(1.1); } }
@keyframes bx-ck-wiegen { from { rotate: -2.2deg; } to { rotate: 2.2deg; } }
@keyframes bx-ck-krebs { 0%, 40%, 100% { transform: translateX(0); } 55%, 80% { transform: translateX(-2.4cqi); } }
@keyframes bx-ck-bump { 0% { translate: 0 0; } 35% { translate: 0 -1.6cqh; } 100% { translate: 0 0; } }
@keyframes bx-ck-bump-mitte { 0% { translate: -50% 0; } 35% { translate: -50% -1.6cqh; } 100% { translate: -50% 0; } }
@keyframes bx-ck-blitz { 0% { opacity: .8; } 25% { opacity: 1; filter: brightness(1.6); } 100% { opacity: .8; filter: none; } }
@keyframes bx-ck-muenze {
  0% { opacity: 0; transform: translate(0, 0) scale(.5) rotate(0deg); }
  15% { opacity: 1; }
  50% { transform: translate(calc(var(--dx, 0) * .6), -15cqh) scale(1.1) rotate(160deg); opacity: 1; }
  100% { opacity: 0; transform: translate(var(--dx, 0), -6cqh) scale(.85) rotate(320deg); } }
/* Der Chat in der Mulde: Piraten-Karten mit Schatten, Text etwas größer. */
.bx-ck .bx-cb { inset: 0; z-index: 2; padding: 1.6cqmin 1.8cqmin 2.2cqmin 1.4cqmin; gap: clamp(3px,1.2cqh,10px);
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 9%); mask-image: linear-gradient(to bottom, transparent, #000 9%); }
.bx-ck .bx-cb-piraten .bx-cb-text { font-size: calc((clamp(12px,min(5.2cqi,7.2cqh),30px)) * var(--bx-fs, 1)); }
.bx-ck .bx-cb-piraten .bx-cb-name { font-size: calc((clamp(11px,min(4.2cqi,6cqh),26px)) * var(--bx-fs, 1)); }
.bx-ck .bx-cb-piraten .bx-cb-pic { width: clamp(20px,min(8.8cqi,12cqh),54px); }
.bx-ck .bx-cb.bx-cb-piraten .bx-cb-msg { box-shadow: inset 0 1.5px 0 rgba(255,222,140,.55), inset 0 0 0 1px rgba(184,129,31,.4),
  0 8px 14px -6px rgba(0,0,0,.95), 0 2px 0 rgba(0,0,0,.45); }
@media (prefers-reduced-motion: reduce) {
  .bx-ck *, .bx-ck *::before, .bx-ck *::after { animation: none !important; transition: none !important; }
  .bx-ck-staub, .bx-ck-muenze { display: none; } }
html.bx-perf .bx-ck *, html.bx-perf .bx-ck *::before, html.bx-perf .bx-ck *::after { animation: none !important; }
html.bx-perf .bx-ck-staub, html.bx-perf .bx-ck-muenze, html.bx-perf .bx-ck-schein, html.bx-perf .bx-ck-kaustik { display: none; }

/* ── Emoji als Bild (emojiBilder): Twemoji statt Schrift-Emoji. Die Regel
   greift nur, wenn das JS überhaupt <img class="emoji"> baut — ohne den
   Schalter bleibt jede Chat-Box exakt wie vorher. */
.bx-cb img.emoji { display: inline-block; width: 1.15em; height: 1.15em; margin: 0 .04em; vertical-align: -0.22em; border: 0; }
.bx-cb .bx-cb-name img.emoji { vertical-align: -0.18em; }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur. Der Bubble-Schatten war ohne Panel ein grauer Klecks.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-cb-msg { box-shadow: none; }
html .bx-frameless .bx-cb:not(.bx-cb-sticker) .bx-cb-name { -webkit-text-stroke: max(1.5px, .1em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-cb:not(.bx-cb-sticker) .bx-cb-text { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 2px 6px rgba(0,0,0,.55); }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Auslöser auf der NEU EINGETROFFENEN Nachricht — der einzige Moment, in dem
   im Chat etwas passiert.

   KOLLISION: Die Bubble bringt ihre eigene Einflug-Animation mit und startet
   bei opacity:0. Die Basis setzt „animation" komplett neu — ohne diese Fassung
   wäre die frische Nachricht 900 ms lang unsichtbar geblieben. Darum hier
   Einflug und Auslöser gemeinsam deklariert. */
.bx-premium .bx-cb-msg.bx-hit {
  animation: bx-cb-in 280ms cubic-bezier(.2,1.3,.4,1) forwards,
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Das Anheben der Basis bleibt bewusst weg (im Bild geprüft): die Bubble ist so
   breit wie die Box, die Box schneidet über overflow ab — beim Anheben lief der
   Text am rechten Rand hinaus. */
/* Der Ausblender muss den Auslöser überstimmen können (Nachricht läuft ab). */
.bx-premium .bx-cb-msg.fade.bx-hit { animation: bx-cb-out 420ms ease-in forwards; }
/* Mehr Tiefe: der Name ist der Anker der Zeile — im Premium-Fall etwas fester
   gesetzt, damit die Hierarchie Name → Text klarer liest. Keine Maßänderung. */
.bx-premium .bx-cb-name { letter-spacing: .06em; text-shadow: 0 .04em .1em rgba(0,0,0,.9), 0 0 .5em rgba(0,0,0,.5); }
.bx-premium .bx-cb-sticker .bx-cb-name { text-shadow: none; }
/* Piraten: eigener Einflug statt des Glas-Einflugs, Ausblender gewinnt weiter. */
.bx-premium .bx-cb-piraten .bx-cb-msg.bx-hit {
  animation: bx-cb-pt-in 520ms cubic-bezier(.16,1.12,.3,1) backwards,
    bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
.bx-premium .bx-cb-piraten .bx-cb-msg.fade, .bx-premium .bx-cb-piraten .bx-cb-msg.fade.bx-hit { animation: bx-cb-pt-out 440ms ease-in forwards; }
.bx-premium .bx-cb-piraten .bx-cb-name { letter-spacing: .02em; text-shadow: 0 2px 0 rgba(10,4,24,.8), 0 0 .6em rgba(0,0,0,.5); }
@media (prefers-reduced-motion: reduce) {
  .bx-premium .bx-cb-piraten .bx-cb-msg.bx-hit { animation: bx-cb-pt-ein 300ms ease-out backwards; } }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
/** Piraten-Namensfarben: warm und hell, alle lesbar auf dunklem Violett.
 *  Lavendel und Himmelblau halten den Twitch-Ton, der Rest ist Laternenlicht. */
const PIRATEN_FARBEN = ['#ffc94d', '#ff8f5e', '#ff74ad', '#7fdcff', '#a6f58a', '#ffe28f', '#c7a2ff', '#5ef0c6', '#ffb36b', '#ff9fd8', '#bf94ff', '#f7d774'];
function piratenFarbe(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0; return PIRATEN_FARBEN[Math.abs(h) % PIRATEN_FARBEN.length]; }
function nameColor(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0; return `hsl(${Math.abs(h) % 360} 88% 70%)`; }

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
/** Plattform-Zeichen: bewusst einfache, selbst gezeichnete Inline-SVGs (keine
 *  Marken-Bilddateien). Feste Zeichenketten aus dieser Datei — nie Daten aus
 *  dem Ereignis —, darum ist innerHTML hier unbedenklich. */
const NOTE = 'M14 3h3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.3V15a6 6 0 1 1-6-6v3.2a2.8 2.8 0 1 0 3 2.8z';
const PLATTFORM_ZEICHEN = {
  twitch: { klasse: 'bx-cb-pf bx-cb-pf-twitch', titel: 'Twitch',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#9146ff" d="M4.5 2 2.5 6.5V20h5v3h3l3-3h4l4-4.5V2z"/><path fill="#fff" d="M11 6.5h2v6h-2zm5 0h2v6h-2z"/></svg>' },
  tiktok: { klasse: 'bx-cb-pf bx-cb-pf-tiktok', titel: 'TikTok',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#25f4ee" transform="translate(-1 -1)" d="${NOTE}"/><path fill="#fe2c55" transform="translate(1 1)" d="${NOTE}"/><path fill="#fff" d="${NOTE}"/></svg>` },
};
/** Zeichen-Element für ein Ereignis — oder null (keine/unbekannte Plattform). */
function plattformZeichen(plattform) {
  const z = Object.prototype.hasOwnProperty.call(PLATTFORM_ZEICHEN, plattform) ? PLATTFORM_ZEICHEN[plattform] : null;
  if (!z) return null;
  const el = document.createElement('span');
  el.className = z.klasse;
  el.title = z.titel;
  el.innerHTML = z.svg;
  return el;
}

/** Abzeichen vor dem Namen (nur Stil „Piraten"): Krone = Streamer,
 *  gekreuzte Säbel = Mod, Stern = Abo. Feste SVG-Zeichenketten aus dieser
 *  Datei — nie Daten aus dem Ereignis —, darum ist innerHTML hier unbedenklich. */
const ABZEICHEN = {
  host: { klasse: 'bx-cb-b bx-cb-b-host', titel: 'Streamer', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffd45e" stroke="#7a3e00" stroke-width="1.2" stroke-linejoin="round" d="M3 8.5l4.5 3.8L12 5l4.5 7.3L21 8.5 19.2 18H4.8z"/><rect x="4.8" y="18.6" width="14.4" height="2.4" rx="1" fill="#ffd45e"/></svg>' },
  mod: { klasse: 'bx-cb-b bx-cb-b-mod', titel: 'Moderator', svg: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-linecap="round"><path d="M5 4l11.5 11.5M19 4L7.5 15.5" stroke="#fff" stroke-width="2.6"/><path d="M13.6 18.4l4.8-4.8M5.6 13.6l4.8 4.8" stroke="#ffd45e" stroke-width="2.4"/><path d="M17.6 17.6l2.2 2.2M6.4 17.6l-2.2 2.2" stroke="#ffd45e" stroke-width="2.6"/></svg>' },
  sub: { klasse: 'bx-cb-b bx-cb-b-sub', titel: 'Abo', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffd45e" stroke="#7a3e00" stroke-width="1" stroke-linejoin="round" d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>' },
};
function abzeichen(user) {
  const arten = [];
  if (user?.isBroadcaster) arten.push('host');
  else if (user?.isMod) arten.push('mod');
  if (user?.isSub) arten.push('sub');
  if (!arten.length) return null;
  const box = document.createElement('span');
  box.className = 'bx-cb-bdg';
  for (const art of arten) {
    const b = document.createElement('span');
    b.className = ABZEICHEN[art].klasse;
    b.title = ABZEICHEN[art].titel;
    b.innerHTML = ABZEICHEN[art].svg;
    box.appendChild(b);
  }
  return box;
}

/** Stile, die Emojis von sich aus als Bild zeigen. Die alten Stile bleiben
 *  bei Schrift-Emojis, damit vorhandene Overlays pixelgleich bleiben. */
const EMOJI_BILD_STILE = new Set(['piraten', 'schatzkiste']);
/** Prop `emojiBilder`: 'an'/true und 'aus'/false gelten immer; alles andere
 *  ('auto', fehlt — also jedes vorhandene Overlay) folgt dem Stil. */
export function emojiBilderAn(wert, stil) {
  if (wert === true || wert === 'an') return true;
  if (wert === false || wert === 'aus') return false;
  return EMOJI_BILD_STILE.has(stil);
}

/** Szene des Stils „Schatzkiste". Feste Zeichenketten aus dieser Datei — der
 *  Titel kommt danach per textContent hinein, nie über innerHTML.
 *  Verlaufs-IDs tragen eine laufende Nummer je Instanz: Doppelte IDs würden auf
 *  die erste Kiste im Dokument zeigen — liegt die in einer ausgeblendeten
 *  Ebene (display:none), malt Chrome die Verläufe der sichtbaren gar nicht. */
const KISTE_SVG = {
  ecke: '<svg class="bx-ck-ecke %K" viewBox="0 0 40 40" aria-hidden="true"><defs>'
    + '<linearGradient id="bx-ck-eg#" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".3" stop-color="#f5c451"/><stop offset=".7" stop-color="#c48a24"/><stop offset="1" stop-color="#6b3f08"/></linearGradient>'
    + '<radialGradient id="bx-ck-ng#" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff4c8"/><stop offset=".7" stop-color="#c48a24"/><stop offset="1" stop-color="#6b3f08"/></radialGradient></defs>'
    + '<path d="M3 3H37V16H16V37H3z" fill="url(#bx-ck-eg#)" stroke="#1d0c03" stroke-width="2.6" stroke-linejoin="round"/>'
    + '<path d="M5.6 33.5V5.6H34.5" fill="none" stroke="#fff8dc" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>'
    + '<path d="M35.4 14.4H14.4V35.4" fill="none" stroke="#6b3f08" stroke-width="1.6" opacity=".8"/>'
    + '<g stroke="#1d0c03" stroke-width="1"><circle cx="9.5" cy="9.5" r="3.4" fill="url(#bx-ck-ng#)"/><circle cx="28.5" cy="9.5" r="2.6" fill="url(#bx-ck-ng#)"/><circle cx="9.5" cy="28.5" r="2.6" fill="url(#bx-ck-ng#)"/></g>'
    + '<g fill="#fff"><circle cx="8.4" cy="8.4" r=".9"/><circle cx="27.7" cy="8.7" r=".7"/><circle cx="8.7" cy="27.7" r=".7"/></g></svg>',
  rolle: '<svg class="bx-ck-rolle %K" viewBox="0 0 20 30" aria-hidden="true">'
    + '<path d="M19 6C9 4 3 9 3 15.5C3 21.5 7.5 25 12 25C15.8 25 18 22.3 18 19.2C18 16.2 15.6 14.2 13 14.6C10.8 15 10 17 11 18.6" fill="none" stroke="#1d0c03" stroke-width="5.4" stroke-linecap="round"/>'
    + '<path d="M19 6C9 4 3 9 3 15.5C3 21.5 7.5 25 12 25C15.8 25 18 22.3 18 19.2C18 16.2 15.6 14.2 13 14.6C10.8 15 10 17 11 18.6" fill="none" stroke="#e0a93c" stroke-width="3" stroke-linecap="round"/>'
    + '<path d="M17 6.6C9.5 5.6 5 10 4.6 14.6" fill="none" stroke="#fff4c8" stroke-width="1.2" stroke-linecap="round"/></svg>',
  schloss: '<svg class="bx-ck-schloss" viewBox="0 0 30 40" aria-hidden="true"><defs>'
    + '<linearGradient id="bx-ck-sg#" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".35" stop-color="#f5c451"/><stop offset=".75" stop-color="#c48a24"/><stop offset="1" stop-color="#6b3f08"/></linearGradient></defs>'
    + '<path d="M3 3H27V24C27 31 21 36 15 38C9 36 3 31 3 24z" fill="url(#bx-ck-sg#)" stroke="#1d0c03" stroke-width="2.4" stroke-linejoin="round"/>'
    + '<path d="M5.4 22V5.4H24.6" fill="none" stroke="#fff8dc" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>'
    + '<circle cx="15" cy="17" r="3.6" fill="#2a1204"/><path d="M13.4 19h3.2l1.2 8h-5.6z" fill="#2a1204"/>'
    + '<circle cx="15" cy="16.4" r="1.2" fill="#6b3f08"/>'
    + '<g stroke="#1d0c03" stroke-width=".8" fill="#ffe7a0"><circle cx="7.5" cy="7.5" r="1.8"/><circle cx="22.5" cy="7.5" r="1.8"/></g></svg>',
  beute: '<svg class="bx-ck-beute %K" viewBox="0 0 50 30" aria-hidden="true">'
    + '<g stroke="#3a1a04" stroke-width="1.2">'
    + '<ellipse cx="14" cy="27" rx="12" ry="3.6" fill="#c48a24"/><ellipse cx="14" cy="25" rx="12" ry="3.6" fill="#f5c451"/>'
    + '<ellipse cx="13" cy="22" rx="10" ry="3.2" fill="#d49a2e"/><ellipse cx="13" cy="20.4" rx="10" ry="3.2" fill="#ffd968"/>'
    + '<ellipse cx="31" cy="27.4" rx="9" ry="2.8" fill="#c48a24"/><ellipse cx="31" cy="25.8" rx="9" ry="2.8" fill="#f5c451"/>'
    + '<path d="M22 22l4-6h6l4 6-7 7z" fill="#e2304a"/><path d="M26 16l3 6 3-6" fill="#ff7a8e" stroke-width=".7"/>'
    + '<path d="M38 25l3-4h4l3 4-5 4z" fill="#21c7b4"/></g>'
    + '<g fill="#fff"><ellipse cx="9" cy="19.6" rx="2.6" ry=".9" opacity=".8"/><circle cx="27.5" cy="18.6" r="1"/><circle cx="41.6" cy="22.4" r=".7"/></g></svg>',
  palme: '<svg class="bx-ck-palme %K" viewBox="0 0 64 84" aria-hidden="true"><defs>'
    + '<linearGradient id="bx-ck-pb#" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ef07f"/><stop offset=".55" stop-color="#2fbf4a"/><stop offset="1" stop-color="#157a33"/></linearGradient>'
    + '<linearGradient id="bx-ck-ps#" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c99555"/><stop offset=".5" stop-color="#9a6630"/><stop offset="1" stop-color="#6e4418"/></linearGradient></defs>'
    + '<path d="M27 84C28 66 30 46 37 26" fill="none" stroke="#1d0c03" stroke-width="9" stroke-linecap="round"/>'
    + '<path d="M27 84C28 66 30 46 37 26" fill="none" stroke="url(#bx-ck-ps#)" stroke-width="6" stroke-linecap="round"/>'
    + '<path d="M24.5 78q3 -1.6 6 0M25 70q3 -1.6 6.2 0M25.8 62q3 -1.6 6.3 0M27 54q3 -1.6 6.3 .2M28.6 46q3 -1.4 6.2 .4M30.8 38q2.8 -1.3 5.8 .6M33.4 31q2.6 -1 5 .8" fill="none" stroke="#4a2a0c" stroke-width="1.3" stroke-linecap="round"/>'
    + '<path d="M26.4 80C27 66 28.4 52 32.6 38" fill="none" stroke="#f0c48a" stroke-width="1" stroke-linecap="round" opacity=".7"/>'
    + '<g stroke="#0b3318" stroke-width="1.5" stroke-linejoin="round" fill="url(#bx-ck-pb#)">'
    + '<path d="M37 26C30 10 20 4 9 5C20 10 28 16 37 26z"/><path d="M37 26C38 10 49 3 60 7C50 10 43 16 37 26z"/>'
    + '<path d="M37 26C25 13 10 15 2 31C12 23 24 22 37 26z"/><path d="M37 26C49 16 60 22 62 37C54 29 45 27 37 26z"/>'
    + '<path d="M37 26C25 27 16 35 14 48C22 38 29 31 37 26z"/><path d="M37 26C47 31 53 41 53 52C47 42 43 33 37 26z"/></g>'
    + '<g fill="none" stroke="#c7ffb0" stroke-width=".9" stroke-linecap="round" opacity=".85">'
    + '<path d="M36 24C29 13 21 8 12 7"/><path d="M38 23C40 12 48 7 57 8"/><path d="M35 25C25 17 13 18 5 28"/><path d="M39 25C49 19 57 24 60 33"/></g>'
    + '<g stroke="#2b1406" stroke-width="1"><circle cx="35" cy="28.6" r="2.9" fill="#7a4a1c"/><circle cx="40" cy="29" r="2.7" fill="#8f5a24"/><circle cx="37.4" cy="31.6" r="2.5" fill="#6e4418"/></g>'
    + '<g fill="#fff" opacity=".7"><circle cx="34" cy="27.6" r=".8"/><circle cx="39.2" cy="28" r=".7"/></g></svg>',
};
let kistenNr = 0;
function kisteHtml() {
  const n = String(++kistenNr);
  const svg = (art, k = '') => KISTE_SVG[art].replace('%K', k).replace(/#"/g, `${n}"`).replace(/#\)/g, `${n})`);
  return '<div class="bx-ck-aura"></div><div class="bx-ck-glut"></div>'
    + '<div class="bx-ck-deckel"><span class="bx-ck-band l"></span><span class="bx-ck-band r"></span><span class="bx-ck-rand"></span><span class="bx-ck-wisch"></span></div>'
    + '<div class="bx-ck-korpus"><span class="bx-ck-lippe"></span>'
    + svg('ecke', 'ol') + svg('ecke', 'or') + svg('ecke', 'ul') + svg('ecke', 'ur')
    + '<div class="bx-ck-innen">' + svg('beute', 'l') + svg('beute', 'r') + '<span class="bx-ck-funke a"></span><span class="bx-ck-funke b"></span></div></div>'
    + svg('schloss')
    + '<div class="bx-ck-staub"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>'
    + '<div class="bx-ck-schein"></div>'
    + '<div class="bx-ck-schild">' + svg('rolle', 'l')
    + '<div class="bx-ck-platte"><span class="bx-ck-niete"></span><span class="bx-ck-feld"><span class="bx-ck-titel"></span></span><span class="bx-ck-niete"></span><span class="bx-ck-glanz"></span></div>'
    + svg('rolle', 'r') + '</div>'
    + '<div class="bx-ck-insel">'
    + '<svg class="bx-ck-land" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden="true"><defs>'
    + `<linearGradient id="bx-ck-sand${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c0"/><stop offset=".35" stop-color="#ffd682"/><stop offset=".8" stop-color="#eaa955"/><stop offset="1" stop-color="#c98640"/></linearGradient>`
    + `<linearGradient id="bx-ck-duene${n}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6d8" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#9a5a20" stop-opacity=".45"/></linearGradient>`
    + `<linearGradient id="bx-ck-meer${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ff7e6"/><stop offset=".3" stop-color="#22c8da"/><stop offset=".7" stop-color="#1287c4"/><stop offset="1" stop-color="#0a4f95"/></linearGradient></defs>`
    + `<path d="M-20 42C30 18 120 13 200 15C290 13 370 18 420 42L420 70L-20 70z" fill="url(#bx-ck-sand${n})" stroke="#7a4512" stroke-width="2.4" vector-effect="non-scaling-stroke"/>`
    + `<path d="M-20 42C30 18 120 13 200 15C290 13 370 18 420 42L420 70L-20 70z" fill="url(#bx-ck-duene${n})"/>`
    + '<path d="M110 30C150 26 180 30 210 36C240 30 280 27 320 31" fill="none" stroke="#d99a4e" stroke-width="2" opacity=".55" vector-effect="non-scaling-stroke"/>'
    + '<path d="M20 34C70 20 130 17 190 18" fill="none" stroke="#fffbe8" stroke-width="2.2" stroke-linecap="round" opacity=".8" vector-effect="non-scaling-stroke"/>'
    + '<path d="M-20 50C70 42 140 47 200 45C270 47 330 42 420 50L420 56L-20 56z" fill="#c98640" opacity=".75"/>'
    + `<path d="M-20 53C70 46 140 51 200 49C270 51 330 46 420 53L420 70L-20 70z" fill="url(#bx-ck-meer${n})"/>`
    + '<path d="M-20 53C70 46 140 51 200 49C270 51 330 46 420 53" fill="none" stroke="#f2fffd" stroke-width="2.6" vector-effect="non-scaling-stroke" opacity=".9"/>'
    + '<path d="M-20 70L-20 53C70 46 140 51 200 49C270 51 330 46 420 53L420 70" fill="none" stroke="#063e74" stroke-width="1.4" vector-effect="non-scaling-stroke" opacity=".6"/></svg>'
    + '<span class="bx-ck-kaustik"></span><span class="bx-ck-welle"></span><span class="bx-ck-welle b"></span>'
    + '<svg class="bx-ck-muschel" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3C4 3 1.5 9 2.5 14L10 18L17.5 14C18.5 9 16 3 10 3z" fill="#ffb3c4" stroke="#7a2a3c" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 18V4M10 18L5.5 5.5M10 18L14.5 5.5M10 18L3 10M10 18L17 10" stroke="#d9667f" stroke-width=".9"/><circle cx="7" cy="7" r="1" fill="#fff" opacity=".8"/></svg>'
    + '<svg class="bx-ck-krebs" viewBox="0 0 30 20" aria-hidden="true"><g stroke="#3a0a04" stroke-width="1.1" stroke-linecap="round">'
    + '<path d="M8 13L3 17M10 14L7 18.5M20 14L23 18.5M22 13L27 17" fill="none"/>'
    + '<path d="M7 10C4 9 2 6 3.5 4C5 5.5 6 5 6.5 3.6C8 5 8 8 9 9.5" fill="#ff5a3c"/><path d="M23 10C26 9 28 6 26.5 4C25 5.5 24 5 23.5 3.6C22 5 22 8 21 9.5" fill="#ff5a3c"/>'
    + '<ellipse cx="15" cy="12" rx="8" ry="5.2" fill="#ff5a3c"/><path d="M12.5 7.5V5M17.5 7.5V5" fill="none"/></g>'
    + '<g fill="#fff" stroke="#3a0a04" stroke-width=".8"><circle cx="12.5" cy="4.6" r="1.6"/><circle cx="17.5" cy="4.6" r="1.6"/></g>'
    + '<g fill="#1d0c03"><circle cx="12.8" cy="4.8" r=".7"/><circle cx="17.8" cy="4.8" r=".7"/></g><ellipse cx="12.5" cy="10" rx="3" ry="1.2" fill="#ffb09a" opacity=".8"/></svg>'
    + svg('palme', 'l') + svg('palme', 'r') + '</div>';
}

/** Demo-Nachrichten für die Editor-Vorschau — sonst bleibt die Box dort leer. */
const DEMO = [
  ['Mia', 'Das Overlay ist mega 🔥'],
  ['LeonGG', 'gg wp'],
  ['Nova', 'Wie lange streamst du heute noch?'],
  ['BigBen', 'Bin neu hier — cooler Stream!'],
  ['Sara_99', 'Ich muss gleich leider weg, aber morgen wieder ❤'],
  ['Kaan', 'W stream'],
  ['Pia', 'erster'],
  ['ExE', 'Kommt gleich noch eine Runde?'],
];
/** Vorschau im Piraten-Stil: zeigt gleich, wie Abzeichen und Emojis aussehen. */
const DEMO_PIRATEN = [
  ['Seemann42', 'Ahoi Käpt’n! 🏴‍☠️', {}],
  ['Goldzahn', 'Wo liegt heute der Schatz? 💰', { isSub: true }],
  ['KäptnBlaubär', 'Ich sag nur: Loot-Insel, jetzt!', { isMod: true }],
  ['Nebelkrähe', 'gg, der Sieg war sauber', {}],
  ['Muschelmia', 'Bin neu an Bord — cooler Stream!', { isSub: true }],
  ['Klabauter', 'Noch eine Runde, bitte 🙏', {}],
  ['dOtExE_97', 'Willkommen an Bord, ihr Landratten!', { isBroadcaster: true, isMod: true }],
  ['Rumfass', 'Hoch die Segel! ⚓', {}],
];
/** Text und Sticker in das Textfeld schreiben.
 *
 *  Bewusst Element fuer Element gebaut: Diese Datei ist textContent-only (siehe
 *  Kopf), damit nie fremder Text als HTML ausgefuehrt wird. Eine Bild-Adresse
 *  von TikTok gehoert genauso wenig in ein innerHTML wie ein Kommentar. */
function fuelleText(el, text, sticker, emojiBilder) {
  if (!el) return;
  for (const teil of textMitStickern(text || '', sticker)) {
    if (teil.art === 'text') {
      if (!teil.wert) continue;
      if (emojiBilder) haengeTextAn(el, teil.wert);
      else el.appendChild(document.createTextNode(teil.wert));
      continue;
    }
    const img = document.createElement('img');
    img.className = /^twitch-gif-/.test(String(teil.wert.id)) ? 'bx-cb-emote bx-cb-gif' : 'bx-cb-emote';
    img.alt = '';
    // avgColor als Grundton, solange das Bild laedt — sonst blitzt ein Loch auf.
    if (teil.wert.farbe) img.style.background = teil.wert.farbe;
    // Laedt das Bild nicht (abgelaufene TikTok-Adresse), bleibt ein farbiges
    // Kaestchen stehen statt eines kaputten Bildsymbols im Overlay.
    img.addEventListener('error', () => { img.classList.add('bx-cb-emote-leer'); });
    img.src = teil.wert.bild;
    el.appendChild(img);
  }
}

export default class ChatBox {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.max = Math.min(30, Math.max(3, Number(props.max ?? 8)));
    this.hideAfterMs = Number(props.hideAfterMs ?? 0);
    this.style = ['glas', 'clean', 'sticker', 'piraten', 'schatzkiste'].includes(props.style) ? props.style : 'glas';
    // Standard AUS: bestehende Chat-Boxen sehen exakt aus wie vorher.
    this.plattformZeichen = props.plattformZeichen === true;
    this.emojiBilder = emojiBilderAn(props.emojiBilder, this.style);
    // Die Schatzkiste zeigt dieselben Karten wie „Piraten" — nur in einer Szene.
    this.karten = this.style === 'piraten' || this.style === 'schatzkiste';
    this.el = document.createElement('div');
    this.el.className = this.style === 'schatzkiste' ? 'bx-cb bx-cb-piraten bx-cb-schatzkiste'
      : `bx-cb${this.style !== 'glas' ? ` bx-cb-${this.style}` : ''}`;
    this.szene = null;
    if (this.style === 'schatzkiste') {
      this.szene = document.createElement('div');
      this.szene.className = 'bx-ck';
      this.szene.innerHTML = kisteHtml();
      const titel = typeof props.kistenTitel === 'string' && props.kistenTitel.trim() ? props.kistenTitel.trim() : 'CHAT AN DECK';
      this.szene.querySelector('.bx-ck-titel').textContent = titel;
      this.szene.querySelector('.bx-ck-innen').appendChild(this.el);
    }
    const aussen = this.szene ?? this.el;
    // Piraten bringt eigene Schriften mit — aber nur, solange der Nutzer keine
    // eigene gewählt hat (die setzt die Runtime auf der Box, siehe FONT_STACKS).
    if (this.karten && !props.fontFamily) {
      aussen.style.setProperty('--bx-font-display', "'Lilita One', 'Arial Black'");
      aussen.style.setProperty('--bx-font-body', "'Saira Semi Condensed', 'Arial Narrow'");
    }
    root.appendChild(aussen);
    this.timers = new Set();
    // Zieht der Nutzer die Box kleiner, passen die eingestellten Nachrichten
    // nicht mehr hinein — dann zeigen wir eben weniger, statt oben abzuschneiden.
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);
    // Karten-Stile bringen eigene Schriften mit: Erst wenn die geladen sind,
    // stimmt die Kartenhöhe — sonst blieb oben eine Lücke frei, in die noch
    // eine Nachricht gepasst hätte (die Boxgröße ändert sich dabei nicht, der
    // ResizeObserver meldet sich also nicht).
    if (this.karten) document.fonts?.ready?.then(() => { if (this.el.isConnected) this.fit(); });
    // Beim Befüllen der Vorschau soll der Deckel nicht acht Mal hüpfen.
    this.stillBefuellen = true;
    if (ctx?.preview) {
      // Mit Plattform-Zeichen abwechselnd TikTok/Twitch, damit man sieht, was der Schalter tut.
      if (this.karten) {
        DEMO_PIRATEN.slice(-this.max).forEach(([nick, text, rollen], i) => {
          const plattform = this.plattformZeichen ? (i % 2 ? 'twitch' : 'tiktok') : undefined;
          this.onEvent({ type: 'chat', ts: Date.now(), user: { id: nick, nickname: nick, ...rollen }, text, ...(plattform ? { plattform } : {}) });
        });
      } else {
        DEMO.slice(-this.max).forEach(([nick, text], i) => {
          const plattform = this.plattformZeichen ? (i % 2 ? 'twitch' : 'tiktok') : undefined;
          this.onEvent({ type: 'chat', ts: Date.now(), user: { id: nick, nickname: nick }, text, ...(plattform ? { plattform } : {}) });
        });
      }
    }
    this.stillBefuellen = false;
  }
  /** Schatzkiste: Bei jeder NEUEN Nachricht hüpft der Deckel kurz, Licht
   *  blitzt aus dem Spalt und ein paar Münzen springen heraus. Alles CSS; die
   *  Münzen räumt ein Timer wieder ab. Kommen Nachrichten schneller als alle
   *  400 ms, gibt es nur das Hüpfen — keine Münzflut im DOM. */
  kistenBump() {
    const sz = this.szene;
    if (!sz || this.stillBefuellen || !sz.isConnected) return;
    sz.classList.remove('bx-ck-bump');
    void sz.offsetWidth;
    sz.classList.add('bx-ck-bump');
    if (this.bumpT) { clearTimeout(this.bumpT); this.timers.delete(this.bumpT); }
    this.bumpT = setTimeout(() => { this.timers.delete(this.bumpT); this.bumpT = null; sz.classList.remove('bx-ck-bump'); }, 720);
    this.timers.add(this.bumpT);
    const jetzt = Date.now();
    if (jetzt - (this.letzteMuenzen || 0) < 400) return;
    this.letzteMuenzen = jetzt;
    const muenzen = [];
    for (let i = 0; i < 3; i++) {
      const m = document.createElement('span');
      m.className = 'bx-ck-muenze';
      m.style.left = `${46 + i * 3 + Math.random() * 2}%`;
      m.style.setProperty('--dx', `${(i - 1) * 38 + (Math.random() * 6 - 3)}cqmin`);
      m.style.animationDelay = `${i * 70}ms`;
      sz.appendChild(m);
      muenzen.push(m);
    }
    const t = setTimeout(() => { this.timers.delete(t); for (const m of muenzen) m.remove(); }, 1200);
    this.timers.add(t);
  }
  /** Sichtbare Zeilenzahl aus der Boxhöhe ableiten: von unten nach oben zählen,
   *  wie viele Nachrichten ganz hineinpassen — der Rest wird ausgeblendet
   *  (nicht gelöscht, damit er bei einer größeren Box zurückkommt).
   *  Bewusst KEINE Schrift-Anpassung: die Zeilenhöhe darf nicht bei jeder
   *  neuen Nachricht springen. */
  fit() {
    let box = this.el.clientHeight;
    // Schatzkiste: Die Liste hat Innenabstand — der zählt nicht als Platz für
    // Karten, sonst ragt die oberste halb über den Muldenrand.
    if (this.szene && box && typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(this.el);
      box -= (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    }
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
    if (event.type !== 'chat') return;
    // Eine reine Sticker-Nachricht traegt als Text nur ein Leerzeichen. Die
    // alte Bedingung (!event.text) hat sie deshalb KOMPLETT verworfen — im
    // Mitschnitt vom 20.08.2026 waren das 8 von 21 Chat-Nachrichten (38 %).
    const stickerListe = Array.isArray(event.sticker) ? event.sticker : [];
    if (!hatInhalt(event)) return;
    const msg = document.createElement('div');
    msg.className = 'bx-cb-msg';
    msg.innerHTML = `<div class="bx-cb-pic"></div><div class="bx-cb-body"><div class="bx-cb-name"></div><div class="bx-cb-text"></div></div>`;
    const name = event.user?.nickname || 'Anonym';
    const nameEl = msg.querySelector('.bx-cb-name');
    if (this.karten) {
      // Eigener Namens-Span, damit ein langer Name mit „…" endet statt die
      // Abzeichen aus der Zeile zu schieben.
      const nm = document.createElement('span');
      nm.className = 'bx-cb-nm';
      if (this.emojiBilder) setzeTextMitEmojis(nm, name); else nm.textContent = name;
      const bdg = abzeichen(event.user);
      if (bdg) nameEl.appendChild(bdg);
      nameEl.appendChild(nm);
    } else if (this.emojiBilder) {
      setzeTextMitEmojis(nameEl, name);
    } else {
      nameEl.textContent = name;
    }
    if (this.plattformZeichen) {
      const zeichen = plattformZeichen(event.plattform);
      if (zeichen) nameEl.insertBefore(zeichen, nameEl.firstChild);
    }
    // Sticker-Stil hat helle Bubbles → dunklere Namensfarbe, sonst unlesbar.
    nameEl.style.color = this.karten ? piratenFarbe(name)
      : this.style === 'sticker' ? nameColor(name).replace('88% 70%', '80% 34%') : nameColor(name);
    fuelleText(msg.querySelector('.bx-cb-text'), event.text, stickerListe, this.emojiBilder);
    avSet(msg.querySelector('.bx-cb-pic'), name, event.user?.profilePic);
    this.el.appendChild(msg);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    this.fit();
    this.hit(msg);
    this.kistenBump();
    if (this.hideAfterMs > 0) {
      const t = setTimeout(() => { this.timers.delete(t); msg.classList.add('fade'); setTimeout(() => { msg.remove(); this.fit(); }, 440); }, this.hideAfterMs);
      this.timers.add(t);
    }
  }
  /** Premium-Auslöser (siehe widget-base.css, .bx-premium). Immer setzen — ob
   *  daraus ein Effekt wird, entscheidet die Basis. Klasse weg, Reflow, Klasse
   *  neu, damit der Effekt bei schnellen Folgen erneut anspringt. */
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
  destroy() { this.ro?.disconnect(); for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); this.szene?.remove(); }
}
