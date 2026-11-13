// chat-box.js — Premium Live-Chat im Overlay (NEU ggü. Alt-App).
// Glas-Bubbles, Avatar-Glow, hash-stabile Nickname-Farben, Mask-Fade.
// textContent-only (kein HTML-Inject). props: { style?, max?, hideAfterMs?, plattformZeichen?, emojiBilder?: 'auto'|'an'|'aus' }
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
    img.className = 'bx-cb-emote';
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
    this.style = ['glas', 'clean', 'sticker', 'piraten'].includes(props.style) ? props.style : 'glas';
    // Standard AUS: bestehende Chat-Boxen sehen exakt aus wie vorher.
    this.plattformZeichen = props.plattformZeichen === true;
    this.emojiBilder = emojiBilderAn(props.emojiBilder, this.style);
    this.el = document.createElement('div');
    this.el.className = `bx-cb${this.style !== 'glas' ? ` bx-cb-${this.style}` : ''}`;
    // Piraten bringt eigene Schriften mit — aber nur, solange der Nutzer keine
    // eigene gewählt hat (die setzt die Runtime auf der Box, siehe FONT_STACKS).
    if (this.style === 'piraten' && !props.fontFamily) {
      this.el.style.setProperty('--bx-font-display', "'Lilita One', 'Arial Black'");
      this.el.style.setProperty('--bx-font-body', "'Saira Semi Condensed', 'Arial Narrow'");
    }
    root.appendChild(this.el);
    this.timers = new Set();
    // Zieht der Nutzer die Box kleiner, passen die eingestellten Nachrichten
    // nicht mehr hinein — dann zeigen wir eben weniger, statt oben abzuschneiden.
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);
    if (ctx?.preview) {
      // Mit Plattform-Zeichen abwechselnd TikTok/Twitch, damit man sieht, was der Schalter tut.
      if (this.style === 'piraten') {
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
  }
  /** Sichtbare Zeilenzahl aus der Boxhöhe ableiten: von unten nach oben zählen,
   *  wie viele Nachrichten ganz hineinpassen — der Rest wird ausgeblendet
   *  (nicht gelöscht, damit er bei einer größeren Box zurückkommt).
   *  Bewusst KEINE Schrift-Anpassung: die Zeilenhöhe darf nicht bei jeder
   *  neuen Nachricht springen. */
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
    if (this.style === 'piraten') {
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
    nameEl.style.color = this.style === 'piraten' ? piratenFarbe(name)
      : this.style === 'sticker' ? nameColor(name).replace('88% 70%', '80% 34%') : nameColor(name);
    fuelleText(msg.querySelector('.bx-cb-text'), event.text, stickerListe, this.emojiBilder);
    avSet(msg.querySelector('.bx-cb-pic'), name, event.user?.profilePic);
    this.el.appendChild(msg);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    this.fit();
    this.hit(msg);
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
  destroy() { this.ro?.disconnect(); for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
