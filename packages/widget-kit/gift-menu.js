// gift-menu.js — die Geschenke-Tafel: zeigt den Zuschauern, WELCHES GESCHENK
// WAS auslöst („Rose → Konfetti", „Galaxy → Songwunsch"). Reines Anzeige-Widget.
//
// Zwei Darstellungsarten (props.mode):
//   'rotation' — ein Geschenk nach dem anderen groß eingeblendet (sanfter Übergang)
//   'leiste'   — alle Einträge laufen als endloses Band durch (wie command-carousel)
//
// props: {
//   mode?: 'rotation'|'leiste', items?, style?: 'karte'|'tafel'|'neon',
//   title?, intervalMs?, speed?, showCoins?, showTitle?, source?: 'liste'|'trigger',
//   accent?, theme?
// }
//   items: "rose::Konfetti-Regen | galaxy::Songwunsch"  (Gift-Slug :: Text, mit | getrennt)
//          — exakt das Format des GiftCommandListEditor (Feldtyp 'gift-command-list').
//
// Gift-Bilder kommen AUSSCHLIESSLICH aus dem App-Katalog (/gift-catalog →
// offizielle TikTok-Bilder bzw. deren lokale Kopie unter /gift-img). Es wird
// nichts mitgeliefert. Fehlt ein Bild (Normalfall, solange das Gift noch nie
// gesehen wurde), steht das generische Geschenk-SVG da.
const STYLE_ID = 'bx-gm-style';

const CSS = `
/* container-type ist Pflicht: sonst messen die cq-Einheiten in DIESER Regel
   gegen den Viewport statt gegen die Widget-Box. Die Regel hier wird gegen den
   Eltern-Container (die Widget-Box aus runtime.js) ausgewertet — ein Element
   kann seinen EIGENEN container-type nicht abfragen. Genau so gewollt. */
/* --bx-fs ist der Textgrößen-Regler des Nutzers (1 = Standard). Er steht
   AUSSEN um das clamp — läge er innen, würde die Obergrenze (34px) den Zuwachs
   wegdeckeln. Es gibt genau EINE Basisgröße je Darstellung, alles andere im
   Widget rechnet in em. */
.bx-gm { position:absolute; inset:0; overflow:hidden; container-type:size; box-sizing:border-box;
  font-family: var(--bx-font-body); color: var(--bx-text,#fff);
  font-size: calc(clamp(9px, min(6cqi, 5.2cqh), 34px) * var(--bx-fs, 1));
  /* Drei Schriftebenen für das Laufband. Sie zeigen per Default auf die
     Theme-/Nutzer-Variablen — die Schriftart-Einstellung greift also weiter.
     Nur solange der Nutzer NICHTS eingestellt hat (Basiswerte aus
     widget-base.css), setzt syncFonts() hier die kuratierte Wahl darüber:
     Anton für die Wirkung, Bebas Neue für den Namen, Russo One für den Preis. */
  --bx-gm-hero:  var(--bx-font-display);
  --bx-gm-label: var(--bx-font-body);
  --bx-gm-num:   var(--bx-font-num); }

/* ── Rotation ─────────────────────────────────────────────────────────── */
.bx-gm-rot { position:absolute; inset:0; display:flex; flex-direction:column; align-items:stretch;
  gap:.3em; padding:.55em .6em; box-sizing:border-box; }
.bx-gm-title { flex:none; font-family: var(--bx-font-display); font-size:.72em; letter-spacing:.14em;
  text-transform:uppercase; text-align:center; opacity:.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  /* Der Titel steht frei über dem Stream-Bild — ohne Schatten verschwindet er auf hellem Hintergrund. */
  -webkit-text-stroke: max(2px,.055em) #0a0b12; paint-order: stroke fill;
  text-shadow: 0 .08em .3em rgba(0,0,0,.55); }
.bx-gm-stage { position:relative; flex:1 1 auto; min-height:0; overflow:hidden; }
/* Die Karte legt sich um den INHALT (nicht um die ganze Box) und sitzt mittig —
   so sieht sie in jeder Boxgröße wie eine Karte aus und nicht wie ein leerer
   Rahmen. max-height/overflow halten sie in sehr flachen Boxen im Rahmen. */
/* Kleiner Seitenabstand: die Karte darf beim Auslöser-Plopp kurz wachsen, ohne
   dass die Bühne (overflow:hidden) ihr die Ecken und den Leuchtrand abschneidet. */
.bx-gm-card { position:absolute; top:50%; left:.35em; right:.35em; max-height:100%; min-height:min(100%, 13em); box-sizing:border-box;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:.34em; padding:.75em .7em; text-align:center; overflow:hidden;
  opacity:0; transform:translateY(-50%) scale(.9); transition:opacity .45s ease, transform .55s cubic-bezier(.2,.85,.3,1); }
.bx-gm-card.is-in { opacity:1; transform:translateY(-50%) scale(1); }
/* Dekor-Ebene je Stil (Innenrahmen, Kreidelinie, zweite Neonröhre). Ein eigenes
   Element, weil ::before die Lichtstimmung trägt und ::after den Lichtstreif
   des Auslösers — beide Pseudos sind also schon vergeben. */
.bx-gm-deco { position:absolute; inset:0; pointer-events:none; }
.bx-gm-ic { position:relative; flex:none; display:grid; place-items:center;
  width: min(calc(clamp(18px, min(40cqi, 32cqh), 300px) * var(--bx-fs, 1)), 46cqh, 62cqi);
  height: min(calc(clamp(18px, min(40cqi, 32cqh), 300px) * var(--bx-fs, 1)), 46cqh, 62cqi); }
.bx-gm-ic img, .bx-gm-ic .bx-gm-ph { width:100%; height:100%; object-fit:contain; display:block;
  filter: drop-shadow(0 .12em .22em rgba(0,0,0,.55)); }
.bx-gm-ic img { display:none; }
.bx-gm-ic.has-img img { display:block; }
.bx-gm-ic.has-img .bx-gm-ph { display:none; }
.bx-gm-ph { color: var(--bx-accent, #ff5e8a); opacity:.85; }
/* Name + Preis stehen in EINER Zeile — daraus baut der Stil „tafel" seine
   Speisekarten-Zeile (Name … Punkte … Preis). */
.bx-gm-line { flex:none; display:flex; align-items:center; justify-content:center; gap:.45em;
  max-width:100%; width:100%; min-width:0; }
.bx-gm-name { flex:0 1 auto; min-width:0; font-family: var(--bx-font-display); font-size:1.05em; line-height:1.15;
  text-transform:uppercase; letter-spacing:.02em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bx-gm-coins { flex:none; display:inline-flex; align-items:center; gap:.25em; font-size:.62em; line-height:1;
  padding:.3em .55em; border-radius:99em; background: rgba(255,255,255,.1);
  color: var(--bx-gold,#ffd23e); white-space:nowrap; }
.bx-gm-act { flex:none; max-width:100%; font-size:.82em; line-height:1.25; opacity:.95;
  display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; line-clamp:3; overflow:hidden;
  overflow-wrap:anywhere; }
.bx-gm-act b { font-family: var(--bx-font-display); font-weight:400; color: var(--bx-accent,#ff5e8a); }
.bx-gm-dots { flex:none; display:flex; justify-content:center; align-items:center; gap:.3em; height:.42em; overflow:hidden; }
.bx-gm-dot { width:.28em; height:.28em; border-radius:99em; background:#fff; opacity:.55; flex:none;
  box-shadow: 0 0 0 max(1.5px,.035em) rgba(0,0,0,.55);
  transition: opacity .3s ease, transform .3s ease; }
.bx-gm-dot.is-on { opacity:1; transform:scale(1.5); background: var(--bx-accent,#ff5e8a); }
.bx-gm-bar { flex:none; height:.14em; border-radius:99em; background: rgba(0,0,0,.42);
  box-shadow: 0 0 0 max(1px,.02em) rgba(255,255,255,.3); overflow:hidden; }
.bx-gm-bar i { display:block; height:100%; width:0; background: var(--bx-accent,#ff5e8a); border-radius:99em; }
.bx-gm-bar.run i { animation: bx-gm-fill var(--dwell,6s) linear forwards; }
@keyframes bx-gm-fill { from { width:0 } to { width:100% } }

/* ── Laufband ─────────────────────────────────────────────────────────── */
/* Ein Band ist BREIT: die Chip-Größe hängt an der HÖHE (cqh), cqi deckelt sie
   in schmalen Boxen zusätzlich. --bx-fs auch hier AUSSEN um das clamp. */
.bx-gm-band { position:absolute; inset:0; display:flex; align-items:center; overflow:hidden;
  font-size: calc(clamp(10px, min(23cqh, 5.5cqi), 90px) * var(--bx-fs, 1)); }
/* Durchlaufendes Hintergrund-Banner: das Band SELBST trägt den Hintergrund
   (die Stile überschreiben ihn), damit die Leiste als EIN Objekt wirkt und
   nicht als lose Kette einzelner Kacheln. Der Stil „karte" hatte vorher gar
   keinen — dort schwebten die Kacheln im Nichts. */
.bx-gm-band { background: linear-gradient(180deg, rgba(24,26,40,.88), rgba(10,11,20,.94));
  box-shadow: inset 0 max(1px,.03em) 0 rgba(255,255,255,.14), inset 0 max(-1px,-.03em) 0 rgba(0,0,0,.5); }
/* Lichtstreif, der langsam über das Banner wandert — bewusst nur transform
   (GPU-compositet, kein Layout pro Frame). */
.bx-gm-band::after { content:''; position:absolute; top:0; bottom:0; width:38%; pointer-events:none; z-index:1;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.13) 45%, rgba(255,255,255,.02) 60%, transparent);
  animation: bx-gm-shine 6.5s linear infinite; }
@keyframes bx-gm-shine { from { transform: translateX(-140%) } to { transform: translateX(400%) } }
.bx-gm-track { position:relative; z-index:2; display:inline-flex; align-items:center; gap:.4em; white-space:nowrap;
  will-change:transform; padding:0 .2em; animation: bx-gm-scroll var(--dur,26s) linear infinite; }
@keyframes bx-gm-scroll { to { transform: translateX(-50%); } }
/* Kompakte RECHTECKE statt langer Pillen: Geschenk links, darüber/darunter der
   Name und was er auslöst. Dadurch passen mehrere Einträge gleichzeitig ins
   Bild, statt dass ein einzelner die halbe Leiste belegt. */
.bx-gm-chip { position:relative; overflow:hidden; display:inline-flex; align-items:center; gap:.4em;
  flex:none; height:3.05em; box-sizing:border-box; padding:.26em .62em .26em .42em; border-radius:.5em; }
.bx-gm-chip .bx-gm-ic { width:2.15em; height:2.15em; }
.bx-gm-txt { display:flex; flex-direction:column; align-items:flex-start; justify-content:center;
  gap:.1em; min-width:0; max-width:9.5em; }
/* Im Laufband darf der Name NICHT schrumpfen — dort ist Platz nach rechts
   ohne Ende, ein schrumpfbarer Name wäre auf 0 zusammengefallen. */
.bx-gm-chip .bx-gm-name { flex:none; font-size:.82em; line-height:1.05; }
.bx-gm-chip .bx-gm-line { width:auto; justify-content:flex-start; gap:.32em; }
/* Die Speisekarten-Führungslinie der Preistafel gehört auf die große Karte.
   In der schmalen Laufband-Kachel blieb davon nur ein sinnloser Strich
   zwischen Name und Preis übrig. */
.bx-gm-chip .bx-gm-line::after { display:none; }
/* Dasselbe für die Namensplatte der Sammelkarte: als Balken hinter einem
   zweizeiligen Kacheltext wirkte sie wie ein Kasten im Kasten. */
.bx-gm-chip .bx-gm-line { background:none; padding:0; }
.bx-gm-chip .bx-gm-act { font-size:.62em; line-height:1.1; opacity:.92; max-width:100%;
  -webkit-line-clamp:1; line-clamp:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-gm-chip .bx-gm-coins { font-size:.46em; padding:.28em .5em; }
/* Der Pfeil ist im Laufband überflüssig — die zweite Zeile IST die Wirkung. */
.bx-gm-chip .bx-gm-arr { display:none; }


/* ── Animierte Banner-Hintergründe ───────────────────────────────────────
   Der Wunsch war „wie ein kleines Video". Bewusst NICHT als Videodatei,
   sondern als CSS-Verlauf in Bewegung: kostet fast nichts, läuft auch im
   schwachen TTLS-Browser flüssig und braucht keine mitgelieferte Datei.
   Alle drei animieren nur background-position bzw. transform. */
.bx-gm-b-welle { background:
    linear-gradient(100deg,
      color-mix(in srgb, var(--bx-accent,#ff5e8a) 34%, #0b0c16) 0%,
      #0b0c16 26%,
      color-mix(in srgb, var(--bx-accent-2,#7c5cff) 40%, #0b0c16) 50%,
      #0b0c16 74%,
      color-mix(in srgb, var(--bx-accent,#ff5e8a) 34%, #0b0c16) 100%) !important;
  background-size: 260% 100% !important;
  animation: bx-gm-welle 14s linear infinite; }
@keyframes bx-gm-welle { from { background-position: 0% 0 } to { background-position: -260% 0 } }

.bx-gm-b-streifen { background:
    repeating-linear-gradient(115deg,
      rgba(255,255,255,.055) 0 2.2em,
      rgba(255,255,255,0) 2.2em 4.6em),
    linear-gradient(180deg, rgba(24,26,40,.92), rgba(10,11,20,.96)) !important;
  background-size: 12em 100%, 100% 100% !important;
  animation: bx-gm-streifen 4.5s linear infinite; }
@keyframes bx-gm-streifen { from { background-position: 0 0, 0 0 } to { background-position: 12em 0, 0 0 } }

/* Aurora: zwei weiche Farbwolken, die gegenläufig wandern. */
.bx-gm-b-aurora { background: linear-gradient(180deg, rgba(14,15,26,.94), rgba(8,9,16,.96)) !important; }
.bx-gm-b-aurora::before { content:''; position:absolute; inset:-40% -10%; z-index:0; pointer-events:none;
  background:
    radial-gradient(40% 120% at 20% 50%, color-mix(in srgb, var(--bx-accent,#ff5e8a) 55%, transparent), transparent 70%),
    radial-gradient(36% 110% at 70% 50%, color-mix(in srgb, var(--bx-accent-2,#7c5cff) 55%, transparent), transparent 70%);
  filter: blur(1.2em); opacity:.75; animation: bx-gm-aurora 11s ease-in-out infinite alternate; }
@keyframes bx-gm-aurora { from { transform: translateX(-12%) } to { transform: translateX(12%) } }

/* ── Kachelformen ────────────────────────────────────────────────────────
   Alle Maße hier in cqh (Bandhöhe), NICHT in em: eine Kachel soll die Leiste
   ausfüllen, egal wie der Nutzer die Textgröße gestellt hat. Sonst würde ein
   „Quadrat" bei 1,5× aus dem Band herauswachsen. */

/* QUADRAT — echte kleine Vierecke: Geschenk oben, Name, Wirkung darunter.
   Am kompaktesten, aber die dritte Zeile ist zwangsläufig klein. */
.bx-gm-t-quadrat .bx-gm-chip { flex-direction:column; align-items:center; justify-content:center;
  width:78cqh; height:76cqh; gap:1cqh; padding:3cqh 3cqh 4cqh; }
.bx-gm-t-quadrat .bx-gm-chip .bx-gm-ic { width:38cqh; height:38cqh; }
.bx-gm-t-quadrat .bx-gm-txt { align-items:center; max-width:100%; gap:0; }
.bx-gm-t-quadrat .bx-gm-chip .bx-gm-name { font-size:13cqh; line-height:1.05; max-width:66cqh;
  overflow:hidden; text-overflow:ellipsis; }
.bx-gm-t-quadrat .bx-gm-chip .bx-gm-act { font-size:10.5cqh; line-height:1.1; max-width:66cqh; }
/* Preis als Eck-Marke — im Quadrat ist keine Zeile dafür frei. */
.bx-gm-t-quadrat .bx-gm-chip .bx-gm-coins { position:absolute; top:2cqh; right:2cqh; font-size:8cqh;
  padding:.9cqh 2cqh; }
.bx-gm-t-quadrat .bx-gm-chip .bx-gm-line { justify-content:center; }

/* ETIKETT — quadratisches Geschenk mit Namensband darauf, die Wirkung steht
   rechts daneben. Etwas breiter als ein Quadrat, dafür bleibt die Wirkung groß. */
.bx-gm-t-etikett .bx-gm-chip { gap:2.5cqh; padding:0 3cqh 0 0; height:78cqh; }
.bx-gm-t-etikett .bx-gm-chip .bx-gm-ic { width:78cqh; height:78cqh; padding:6cqh 4cqh 14cqh; box-sizing:border-box; }
/* Namensband liegt ÜBER dem unteren Rand des Bildes — wie ein aufgeklebtes
   Etikett. Deshalb sitzt der Textblock absolut, nicht im Fluss. */
.bx-gm-t-etikett .bx-gm-txt { position:static; }
.bx-gm-t-etikett .bx-gm-chip .bx-gm-line { position:absolute; left:0; bottom:0; width:78cqh;
  justify-content:center; gap:1.5cqh; padding:1.5cqh 0; box-sizing:border-box;
  background:rgba(6,7,14,.82); }
.bx-gm-t-etikett .bx-gm-chip .bx-gm-name { font-size:11cqh; max-width:56cqh; overflow:hidden; text-overflow:ellipsis; }
.bx-gm-t-etikett .bx-gm-chip .bx-gm-coins { font-size:8cqh; padding:.8cqh 1.8cqh; }
.bx-gm-t-etikett .bx-gm-chip .bx-gm-act { font-size:13cqh; max-width:52cqh; white-space:normal;
  -webkit-line-clamp:2; line-clamp:2; display:-webkit-box; -webkit-box-orient:vertical; text-overflow:clip; }

/* ── Formen mit TEXT ALS EBENE ÜBER DEM GESCHENK ─────────────────────────
   Gemeinsame Idee: das Geschenk füllt die Kachel als Bild, die Schrift liegt
   DARÜBER und darf es ruhig anschneiden. Dadurch wird die Wirkung — die
   eigentliche Information — endlich groß, ohne dass die Kachel wächst.
   Grundlage für alle drei: das Geschenk absolut hinter dem Text. */
.bx-gm-t-ueberlagert .bx-gm-chip, .bx-gm-t-untertitel .bx-gm-chip, .bx-gm-t-banderole .bx-gm-chip,
.bx-gm-t-vitrine .bx-gm-chip, .bx-gm-t-aufkleber .bx-gm-chip {
  display:block; width:132cqh; height:80cqh; padding:0; }
.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-ic, .bx-gm-t-untertitel .bx-gm-chip .bx-gm-ic,
.bx-gm-t-banderole .bx-gm-chip .bx-gm-ic,
.bx-gm-t-vitrine .bx-gm-chip .bx-gm-ic, .bx-gm-t-aufkleber .bx-gm-chip .bx-gm-ic {
  position:absolute; left:50%; translate:-50% 0; width:64cqh; height:64cqh; }
.bx-gm-t-ueberlagert .bx-gm-txt, .bx-gm-t-untertitel .bx-gm-txt, .bx-gm-t-banderole .bx-gm-txt,
.bx-gm-t-vitrine .bx-gm-txt, .bx-gm-t-aufkleber .bx-gm-txt {
  position:absolute; inset:0; max-width:none; z-index:2; pointer-events:none; }
/* Preis immer oben rechts als Marke — im Textbereich wäre kein Platz. */
.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-coins, .bx-gm-t-untertitel .bx-gm-chip .bx-gm-coins,
.bx-gm-t-banderole .bx-gm-chip .bx-gm-coins,
.bx-gm-t-vitrine .bx-gm-chip .bx-gm-coins, .bx-gm-t-aufkleber .bx-gm-chip .bx-gm-coins {
  position:absolute; top:2.5cqh; right:2.5cqh; font-size:9cqh; padding:1cqh 2.2cqh; z-index:3;
  background:rgba(0,0,0,.6); box-shadow:0 0 0 max(1px,.02em) rgba(255,255,255,.2); }
/* Der Textkörper der drei ausgestalteten Fassungen (ueberlagert/vitrine/
   aufkleber) steht weiter unten im eigenen Block — dort mit höherer
   Spezifität, damit die Stile karte/tafel/neon ihn nicht überschreiben. */
.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-act, .bx-gm-t-vitrine .bx-gm-chip .bx-gm-act,
.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-act {
  position:absolute; text-align:center; line-height:1.02; opacity:1; z-index:3;
  /* Lange Woerter MUESSEN umbrechen duerfen: „Konfetti-Regen" passt in einer
     Zeile nicht in die Kachel und wurde sonst am letzten Buchstaben abgeschnitten. */
  white-space:normal; overflow-wrap:anywhere; max-width:none; -webkit-line-clamp:2; line-clamp:2;
  display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; }
/* Weicher Verlauf unter dem Text: gibt ihm Halt, ohne das Geschenk zuzudecken. */
.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-txt::after, .bx-gm-t-vitrine .bx-gm-chip .bx-gm-txt::after,
.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-txt::after {
  content:''; position:absolute; left:0; right:0; bottom:0; height:46cqh; z-index:1; pointer-events:none;
  background: linear-gradient(180deg, transparent, rgba(6,7,14,.55) 45%, rgba(6,7,14,.88)); }

/* UNTERTITEL — wie eine Bauchbinde im Fernsehen: unten ein deckender Balken
   in der Akzentfarbe, das Geschenk ragt oben darüber hinaus. */
.bx-gm-t-untertitel .bx-gm-chip .bx-gm-ic { top:0; }
.bx-gm-t-untertitel .bx-gm-chip .bx-gm-line { position:absolute; left:0; right:0; top:1.5cqh;
  justify-content:flex-start; padding:0 2cqh; background:none; }
.bx-gm-t-untertitel .bx-gm-chip .bx-gm-name { font-size:9.5cqh; max-width:56cqh; opacity:.95;
  -webkit-text-stroke: max(2px,.5cqh) #0a0b12; paint-order: stroke fill; }
.bx-gm-t-untertitel .bx-gm-chip .bx-gm-act { position:absolute; left:0; right:0; bottom:0;
  padding:2.5cqh 2cqh 3cqh; box-sizing:border-box;
  font-family: var(--bx-font-display); font-size:15cqh; line-height:1.02; text-align:center;
  white-space:normal; overflow:hidden; max-width:none; opacity:1;
  display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2;
  color:#0a0b12; background: var(--bx-accent,#ff5e8a);
  box-shadow: 0 -.4cqh 1.2cqh rgba(0,0,0,.5); }

/* BANDEROLE — ein schräges Band quer über das Geschenk, wie ein Aufkleber. */
.bx-gm-t-banderole .bx-gm-chip .bx-gm-ic { top:11cqh; }
.bx-gm-t-banderole .bx-gm-chip .bx-gm-line { position:absolute; left:0; right:0; top:2cqh;
  justify-content:flex-start; background:none; padding:0 30cqh 0 3cqh; box-sizing:border-box; }
.bx-gm-t-banderole .bx-gm-chip .bx-gm-name { font-size:10cqh; max-width:100%; opacity:.95;
  -webkit-text-stroke: max(2px,.5cqh) #0a0b12; paint-order: stroke fill; }
.bx-gm-t-banderole .bx-gm-chip .bx-gm-act { position:absolute; left:1cqh; right:1cqh; top:42cqh;
  rotate:-7deg; padding:1.6cqh 0; box-sizing:border-box;
  font-family: var(--bx-font-display); font-size:15cqh; line-height:1; text-align:center;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:none; opacity:1;
  color:#0a0b12; background: var(--bx-gold,#ffd23e);
  box-shadow: 0 .5cqh 1.4cqh rgba(0,0,0,.6); }

/* ABLAGE — wie die Geschenkablage in TikTok: nur Geschenk und Preis, sonst
   nichts. Maximal kompakt und aus jeder Entfernung erkennbar, zeigt aber NICHT
   mehr, was das Geschenk auslöst. */
.bx-gm-t-ablage .bx-gm-chip { flex-direction:column; width:64cqh; height:76cqh; gap:2cqh;
  padding:4cqh 1cqh 2cqh; align-items:center; justify-content:center; }
.bx-gm-t-ablage .bx-gm-chip .bx-gm-ic { width:44cqh; height:44cqh; }
.bx-gm-t-ablage .bx-gm-txt { align-items:center; max-width:100%; gap:0; }
.bx-gm-t-ablage .bx-gm-chip .bx-gm-act { display:none; }
.bx-gm-t-ablage .bx-gm-chip .bx-gm-name { display:none; }
/* Ohne Coin-Preis (Gift noch nie gesehen) blieb hier eine LEERE Pille als
   dunkler Klecks unter dem Geschenk stehen. */
.bx-gm-t-ablage .bx-gm-chip .bx-gm-line { justify-content:center; background:none; padding:0; }
.bx-gm-t-ablage .bx-gm-chip .bx-gm-coins { font-size:15cqh; padding:1.4cqh 3cqh;
  background:rgba(0,0,0,.55); box-shadow:0 0 0 max(1px,.02em) rgba(255,255,255,.18); }
.bx-gm-arr { flex:none; opacity:.55; font-size:.85em; }

/* ══ Stil 1: KARTE — Sammelkarte ═══════════════════════════════════════
   Metapher: eine Trading-Card. Dunkles Kartenblatt mit Lichthof hinter dem
   Geschenk, umlaufender Innenrahmen mit Akzent-Ecken, langsam wandernder
   Hologramm-Glanz und ein geprägter Gold-Preis. Die Auslöser-Zeile sitzt
   unter einer Haarlinie wie der Regeltext einer Karte. */
.bx-st-karte .bx-gm-card { padding:.9em .85em 1em; border-radius:.75em;
  background:
    radial-gradient(125% 78% at 50% -4%, color-mix(in srgb, var(--bx-accent,#ff5e8a) 38%, transparent), transparent 62%),
    linear-gradient(168deg, #262b45, #0c0e18 60%, #171b31);
  border: max(1px,.035em) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 48%, transparent);
  box-shadow: var(--bx-shadow, 0 .5em 1.4em -.5em rgba(0,0,0,.85)),
    inset 0 .06em 0 rgba(255,255,255,.2), 0 0 1.6em -.7em var(--bx-accent,#ff5e8a); }
/* Hologramm-Glanz: wandert langsam quer über das Blatt. */
.bx-st-karte .bx-gm-card::before { content:''; position:absolute; inset:-20% -30%; pointer-events:none;
  background: linear-gradient(115deg, transparent 34%, rgba(255,255,255,.13) 46%, rgba(255,255,255,.03) 54%, transparent 66%);
  animation: bx-gm-holo 7s ease-in-out infinite; }
@keyframes bx-gm-holo { 0%,100% { transform:translateX(-26%) } 50% { transform:translateX(26%) } }
.bx-st-karte .bx-gm-deco { inset:.3em; border-radius:.5em;
  border: max(1px,.028em) solid rgba(255,255,255,.16); box-shadow: inset 0 0 1.6em rgba(0,0,0,.55); }
/* Zwei Akzent-Ecken über Kreuz — das macht aus dem Rechteck eine Karte. */
.bx-st-karte .bx-gm-deco::before, .bx-st-karte .bx-gm-deco::after { content:''; position:absolute;
  width:2.1em; height:2.1em; border:max(1.5px,.04em) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 85%, white); }
.bx-st-karte .bx-gm-deco::before { left:-.05em; top:-.05em; border-right:0; border-bottom:0; border-radius:.5em 0 0 0; }
.bx-st-karte .bx-gm-deco::after { right:-.05em; bottom:-.05em; border-left:0; border-top:0; border-radius:0 0 .5em 0; }
/* Lichthof hinter dem Geschenk — als Hintergrund des Bild-Feldes, damit er
   nicht in einen eigenen Stapel-Kontext muss. */
.bx-st-karte .bx-gm-ic { background: radial-gradient(circle at 50% 48%,
  color-mix(in srgb, var(--bx-accent,#ff5e8a) 38%, transparent), transparent 66%); }
.bx-st-karte .bx-gm-title { color:#e9edfa; letter-spacing:.2em; }
/* Namensplatte wie die Titelleiste einer Sammelkarte. */
.bx-st-karte .bx-gm-line { width:auto; max-width:100%; padding:.2em .5em; border-radius:.35em;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.12), transparent); }
.bx-st-karte .bx-gm-name { color:#fff; text-shadow: 0 .05em .12em rgba(0,0,0,.65); }
/* Geprägter Gold-Preis statt blasser Pille. */
.bx-st-karte .bx-gm-coins { background: linear-gradient(165deg,#ffeaa8,#e2a41c); color:#3a2a00;
  font-family: var(--bx-font-display); box-shadow: inset 0 .08em 0 rgba(255,255,255,.7),
    inset 0 -.08em .1em rgba(0,0,0,.25), 0 .12em .3em rgba(0,0,0,.55); }
.bx-st-karte .bx-gm-act { width:100%; box-sizing:border-box; padding-top:.42em;
  border-top: max(1px,.03em) solid rgba(255,255,255,.16); color:#dfe4f5; }
.bx-st-karte .bx-gm-chip { border-radius:.6em;
  background: linear-gradient(160deg, #232740, #0e1019);
  border: max(1px,.04em) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 42%, transparent);
  box-shadow: var(--bx-shadow, 0 .35em .9em -.4em rgba(0,0,0,.8)), inset 0 .06em 0 rgba(255,255,255,.16); }

/* ══ Stil 2: TAFEL — Preistafel im Holzrahmen ══════════════════════════
   Metapher: die Kreidetafel vor dem Café. Schiefer im Holzrahmen, gestrichelte
   Kreidelinie innen, und die Kernzeile ist eine echte Speisekarten-Zeile:
   Name links, Punktreihe, Preis rechts. Deshalb liest sie sich auf einen Blick
   wie eine Karte und nicht wie eine bunte Kachel. */
.bx-st-tafel .bx-gm-card { padding:.85em .95em .95em; border-radius:.32em;
  border:.32em solid transparent;
  background-image:
    linear-gradient(180deg, #20302a, #131c1a 58%, #182421),
    linear-gradient(150deg, #b2793f, #6b451d 38%, #93602c 64%, #4a2f13);
  background-origin: border-box; background-clip: padding-box, border-box;
  box-shadow: 0 .5em 1.2em -.4em rgba(0,0,0,.8), inset 0 0 2.4em rgba(0,0,0,.6); }
/* Kreidestaub + Licht von oben. */
.bx-st-tafel .bx-gm-card::before { content:''; position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(85% 55% at 50% 8%, rgba(255,255,255,.12), transparent 72%),
    repeating-linear-gradient(102deg, rgba(255,255,255,.035) 0 2px, transparent 2px 8px); }
.bx-st-tafel .bx-gm-deco { inset:.32em; border-radius:.14em;
  border: max(1px,.028em) dashed rgba(238,245,232,.3); }
.bx-st-tafel .bx-gm-title { color:#f2f6ec; letter-spacing:.18em;
  text-shadow: 0 0 .16em rgba(255,255,255,.35), 0 .08em .3em rgba(0,0,0,.8); }
.bx-st-tafel .bx-gm-name { color:#f4f8ee; text-shadow: 0 0 .14em rgba(255,255,255,.45); }
/* Die Punktreihe zwischen Name und Preis. Über flex-order eingehängt, weil ein
   ::after sonst hinter dem Preis landen würde. */
.bx-st-tafel .bx-gm-line { justify-content:flex-start; }
.bx-st-tafel .bx-gm-line::after { content:''; order:0; flex:1 1 auto; min-width:1em; height:.55em;
  border-bottom: max(1px,.03em) dotted rgba(238,245,232,.5); }
.bx-st-tafel .bx-gm-line .bx-gm-name { order:-1; }
.bx-st-tafel .bx-gm-line .bx-gm-coins { order:1; }
.bx-st-tafel .bx-gm-coins { background:none; padding:0; font-size:.72em;
  font-family: var(--bx-font-display); color:#ffe08a; text-shadow: 0 0 .16em rgba(255,208,120,.5); }
.bx-st-tafel .bx-gm-act { align-self:stretch; text-align:left; color:#dfe9d8; letter-spacing:.02em; }
.bx-st-tafel .bx-gm-act b { color: color-mix(in srgb, var(--bx-accent,#ff5e8a) 55%, #fff); }
/* Laufband: EIN durchgehendes Schieferbrett mit Holzkante (border-image, eine
   einfarbige Linie sah aus wie ein schwarzer Balken), die Einträge durch
   Kreidestriche getrennt — nicht fünf einzelne Kacheln. */
.bx-st-tafel .bx-gm-band { background: linear-gradient(180deg, #2a3c34, #17211e);
  border-top:.2em solid; border-bottom:.2em solid;
  border-image: linear-gradient(90deg, #b2793f, #6b451d 35%, #93602c 68%, #5a3a18) 1;
  box-shadow: inset 0 0 2.2em rgba(0,0,0,.45); }
.bx-st-tafel .bx-gm-chip { padding:.28em .85em; border-radius:0;
  border-right: max(1px,.03em) dashed rgba(238,245,232,.28); }
.bx-st-tafel .bx-gm-arr { color:#ffe08a; opacity:.8; }

/* ══ Stil 3: NEON — Leuchtreklame ══════════════════════════════════════
   Metapher: das Schild über der Bar. Dunkle Blende (hält die Schrift auch auf
   hellen Szenen lesbar), doppelte Leuchtröhre, glühende Schrift, der Preis als
   eigene kleine Röhre. Ein feines Flackern hält es lebendig. */
.bx-st-neon .bx-gm-card { padding:.95em .9em 1em; border-radius:.6em;
  background: linear-gradient(180deg, rgba(11,8,22,.82), rgba(4,4,10,.9));
  border: max(2px,.065em) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 82%, white);
  box-shadow: 0 0 1.8em -.3em var(--bx-accent,#ff5e8a),
    inset 0 0 1.6em -.35em var(--bx-accent,#ff5e8a), 0 .6em 1.4em -.6em rgba(0,0,0,.9); }
.bx-st-neon .bx-gm-card::before { content:''; position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(70% 45% at 50% 100%, color-mix(in srgb, var(--bx-accent,#ff5e8a) 22%, transparent), transparent 70%); }
/* Das Flackern sitzt auf der INNEREN Röhre, nicht auf der Karte: die Karte
   blendet sich beim Wechsel über opacity ein — eine Animation auf derselben
   Eigenschaft hätte alle Einträge gleichzeitig sichtbar gemacht. */
.bx-st-neon .bx-gm-deco { inset:.34em; border-radius:.42em; opacity:.75;
  border: max(1px,.032em) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 60%, white);
  box-shadow: 0 0 .9em -.2em var(--bx-accent,#ff5e8a);
  animation: bx-gm-flicker 7s steps(1, end) infinite; }
@keyframes bx-gm-flicker { 0%,91%,93%,95%,100% { opacity:.75 } 92%,94% { opacity:.28 } }
.bx-st-neon .bx-gm-title { color: color-mix(in srgb, var(--bx-accent,#ff5e8a) 55%, white); letter-spacing:.24em;
  text-shadow: 0 0 .35em var(--bx-accent,#ff5e8a), 0 0 .9em color-mix(in srgb, var(--bx-accent,#ff5e8a) 70%, transparent); }
.bx-st-neon .bx-gm-ic img, .bx-st-neon .bx-gm-ic .bx-gm-ph {
  filter: drop-shadow(0 0 .3em var(--bx-accent,#ff5e8a)) drop-shadow(0 .1em .2em rgba(0,0,0,.7)); }
.bx-st-neon .bx-gm-name { color:#fff;
  text-shadow: 0 0 .1em #fff, 0 0 .45em var(--bx-accent,#ff5e8a), 0 0 1.1em color-mix(in srgb, var(--bx-accent,#ff5e8a) 75%, transparent); }
.bx-st-neon .bx-gm-coins { background: rgba(0,0,0,.35); color:#fff6cf;
  border: max(1px,.03em) solid color-mix(in srgb, var(--bx-gold,#ffd23e) 75%, transparent);
  box-shadow: 0 0 .7em -.2em var(--bx-gold,#ffd23e), inset 0 0 .5em -.2em var(--bx-gold,#ffd23e);
  text-shadow: 0 0 .35em var(--bx-gold,#ffd23e); }
.bx-st-neon .bx-gm-act { color:#e7ebff; }
.bx-st-neon .bx-gm-act b { color: color-mix(in srgb, var(--bx-accent,#ff5e8a) 45%, white);
  text-shadow: 0 0 .5em var(--bx-accent,#ff5e8a); }
/* Laufband: Blende mit zwei durchgehenden Röhren oben und unten. */
.bx-st-neon .bx-gm-band { background: linear-gradient(180deg, rgba(10,7,20,.84), rgba(3,3,9,.92));
  box-shadow: inset 0 .1em 0 color-mix(in srgb, var(--bx-accent,#ff5e8a) 85%, white),
    inset 0 -.1em 0 color-mix(in srgb, var(--bx-accent,#ff5e8a) 85%, white),
    inset 0 0 1.6em -.3em var(--bx-accent,#ff5e8a); }
.bx-st-neon .bx-gm-chip { background: rgba(0,0,0,.28); border-radius:.5em;
  border: max(1.5px,.045em) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 70%, white);
  box-shadow: 0 0 .8em -.25em var(--bx-accent,#ff5e8a), inset 0 0 .8em -.35em var(--bx-accent,#ff5e8a); }

/* ── Auslöser: jemand schickt WIRKLICH eins der Geschenke ────────────────
   Ohne das wäre die Tafel nur ein Aushang. So wird sie lebendig: der
   getroffene Eintrag springt nach vorn, pulsiert, bekommt einen Lichtstreif
   und zeigt kurz, WER es geschickt hat. Bewusst über die Eigenschaft "scale"
   statt über "transform" — die Karte trägt dort schon ihr translateY(-50%)
   für die Zentrierung, das dürfen wir nicht überschreiben.
   Steht ABSICHTLICH hinter den Stilen: gleiche Spezifität, also gewinnt der
   spätere Block — sonst würde z.B. das Neon-Flackern den Plopp überschreiben. */
.bx-gm-card.is-hit, .bx-gm-chip.is-hit { animation: bx-gm-hit 900ms cubic-bezier(.2,1.5,.35,1); }
/* Bewusst zurückhaltende 3,5 % statt eines dicken Plopps: die Karte füllt die
   Bühne fast aus, alles darüber würde seitlich abgeschnitten. Den „Wumms"
   liefern Leuchtrand und Lichtstreif, nicht die Größe. */
@keyframes bx-gm-hit { 0% { scale:1 } 26% { scale:1.035 } 60% { scale:.995 } 100% { scale:1 } }
.bx-gm-card.is-hit, .bx-gm-chip.is-hit {
  box-shadow: 0 0 0 max(2px,.07em) var(--bx-accent,#ff5e8a), 0 0 1.6em -.2em var(--bx-accent,#ff5e8a),
    0 .5em 1.2em -.5em rgba(0,0,0,.8); }
/* Lichtstreif einmal quer über den getroffenen Eintrag. */
.bx-gm-card.is-hit::after, .bx-gm-chip.is-hit::after {
  content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,.30) 50%, transparent 62%);
  animation: bx-gm-sweep 900ms ease-out; }
@keyframes bx-gm-sweep { from { transform:translateX(-105%) } to { transform:translateX(105%) } }
/* „von <Name>" — erscheint nur im Moment des Auslösens. Sitzt BEWUSST oben und
   nicht unten: unten steht die Auslöser-Zeile („→ Konfetti-Regen"), und die
   ist die eigentliche Information der Tafel — die darf nichts verdecken. */
.bx-gm-who { position:absolute; left:50%; translate:-50% 0; top:.3em; max-width:88%;
  font-family: var(--bx-font-display); font-size:.58em; line-height:1; letter-spacing:.04em;
  padding:.34em .7em; border-radius:99em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  background: var(--bx-accent,#ff5e8a); color:#0a0b12; opacity:0; transition:opacity .25s ease;
  box-shadow: 0 .2em .5em rgba(0,0,0,.5); }
.bx-gm-card.is-hit .bx-gm-who { opacity:1; }

/* ══ „Rahmen ausblenden" (frameless) ═══════════════════════════════════
   Der Nutzer will das Menü auch OHNE Karte über dem Videobild — nur Geschenk
   und Text. Panel, Rahmen, Dekor und Lichtstimmung fallen weg; dafür bekommt
   jede Textzeile eine schwarze Kontur (Muster aus widget-base.css:
   -webkit-text-stroke + paint-order), sonst verschwindet sie auf hellem Video.
   Steht als LETZTER Block — überschreibt Stile und Auslöser. */
.bx-frameless .bx-gm-card, .bx-frameless .bx-gm-chip {
  background: none !important; border-color: transparent !important; box-shadow: none !important;
  padding:.35em .4em; }
.bx-frameless .bx-gm-band { background: none !important; box-shadow: none !important;
  border-image: none !important; border-color: transparent !important; }
/* Namensplatte gehört zur Karte — ohne Karte wäre sie ein Balken im Nichts. */
.bx-frameless .bx-gm-line { background:none !important; padding:0; }
.bx-frameless .bx-gm-deco, .bx-frameless .bx-gm-card::before, .bx-frameless .bx-gm-chip::before { display:none !important; }
/* Kein Leuchtrand und kein Lichtstreif auf einer Karte, die es nicht gibt —
   das wäre ein Rechteck aus dem Nichts. Der Treffer glüht stattdessen im Bild. */
.bx-frameless .bx-gm-card.is-hit::after, .bx-frameless .bx-gm-chip.is-hit::after { display:none; }
.bx-frameless .bx-gm-card.is-hit .bx-gm-ic img, .bx-frameless .bx-gm-card.is-hit .bx-gm-ic .bx-gm-ph,
.bx-frameless .bx-gm-chip.is-hit .bx-gm-ic img, .bx-frameless .bx-gm-chip.is-hit .bx-gm-ic .bx-gm-ph {
  filter: drop-shadow(0 0 .35em var(--bx-accent,#ff5e8a)) drop-shadow(0 0 .9em var(--bx-accent,#ff5e8a))
    drop-shadow(0 .1em .2em rgba(0,0,0,.8)); }
.bx-frameless .bx-gm-title { -webkit-text-stroke: max(2.5px,.07em) #0a0b12; paint-order: stroke fill;
  opacity:1; text-shadow: 0 .1em .18em rgba(0,0,0,.6); }
.bx-frameless .bx-gm-name { font-size:1.24em; color:#fff; -webkit-text-stroke: max(3px,.085em) #0a0b12; paint-order: stroke fill;
  text-shadow: 0 .08em .14em rgba(0,0,0,.6); }
.bx-frameless .bx-gm-act { font-size:.92em; color:#fff; -webkit-text-stroke: max(2.5px,.07em) #0a0b12; paint-order: stroke fill;
  text-shadow: 0 .08em .14em rgba(0,0,0,.55); }
/* Preis ohne Pille, als Gold-Sticker mit Kontur — eine Pille ohne Karte wirkt
   wie ein vergessenes Bruchstück. */
.bx-frameless .bx-gm-coins { background:none !important; box-shadow:none !important; padding:0;
  font-family: var(--bx-font-display); color: var(--bx-gold,#ffd23e);
  -webkit-text-stroke: max(2.5px,.07em) #0a0b12; paint-order: stroke fill; }
.bx-frameless .bx-gm-ic img, .bx-frameless .bx-gm-ic .bx-gm-ph {
  filter: drop-shadow(0 0 .06em rgba(0,0,0,.95)) drop-shadow(0 .12em .22em rgba(0,0,0,.6)); }
.bx-frameless .bx-gm-arr { opacity:.9; color:#fff; -webkit-text-stroke: max(2px,.06em) #0a0b12; paint-order: stroke fill; }
/* Die Stil-Handschrift bleibt auch ohne Karte erkennbar. */
.bx-frameless .bx-st-karte .bx-gm-ic, .bx-frameless.bx-st-karte .bx-gm-ic { background: radial-gradient(circle at 50% 48%,
  color-mix(in srgb, var(--bx-accent,#ff5e8a) 34%, transparent), transparent 62%); }
.bx-frameless .bx-st-tafel .bx-gm-line::after { border-bottom-color: rgba(255,255,255,.75);
  filter: drop-shadow(0 1px 0 rgba(0,0,0,.9)); }
.bx-frameless .bx-st-neon .bx-gm-name { color: color-mix(in srgb, var(--bx-accent,#ff5e8a) 30%, white);
  text-shadow: 0 0 .3em var(--bx-accent,#ff5e8a), 0 0 .9em color-mix(in srgb, var(--bx-accent,#ff5e8a) 70%, transparent); }
.bx-frameless .bx-st-neon .bx-gm-title { color: color-mix(in srgb, var(--bx-accent,#ff5e8a) 45%, white);
  text-shadow: 0 0 .3em var(--bx-accent,#ff5e8a); }

/* ╔══════════════════════════════════════════════════════════════════════╗
   ║  DREI AUSGESTALTETE LAUFBAND-FASSUNGEN                               ║
   ╚══════════════════════════════════════════════════════════════════════╝
   Drei Haltungen für dieselbe Aufgabe („Galaxy → Runde verlassen"), nicht
   drei Farbvarianten:
     tile='ueberlagert'  WUCHT   — Arcade-Marquee. Kantig, Akzentbalken am Fuß,
                                   Anton in Versalien. Auslöser: Druckwelle,
                                   Kippen, Splitter.
     tile='vitrine'      EDEL    — Schaukasten. Schwarz, Goldhaarlinie, ein
                                   Lichtkegel von oben. Auslöser: weiches
                                   Aufleuchten, Goldstaub, kein Sprung.
     tile='aufkleber'    STICKER — ausgestanzter Aufkleber, leicht schief,
                                   Sonnenstrahlen-Burst. Auslöser: hüpft mit
                                   Squash-and-Stretch und wirft Konfetti.

   Regeln, die für ALLE drei gelten:
   • Maße in cqh (Bandhöhe) — die Kachel darf mit --bx-fs NICHT wachsen,
     sonst ragt sie aus dem Band. Nur die Schriftgrößen sind ebenfalls cqh,
     weil der Text sonst die feste Kachel sprengen würde; der Regler --bx-fs
     wirkt weiter über die Basisgröße des Bandes auf ALLE anderen Formen.
   • Das Geschenkbild bleibt oben frei — Text nur auf dem unteren Drittel.
   • Animiert wird ausschließlich transform / translate / rotate / scale /
     opacity / filter. Kein Layout pro Frame.
   • Die Spezifität ist hier bewusst hoch (.bx-gm-band.bx-gm-t-x .bx-gm-chip),
     damit die Stile karte/tafel/neon die Kachelform nicht überschreiben.
   ─────────────────────────────────────────────────────────────────────── */

/* Streifen-Ebene: blendet die Kacheln an den Bandenden weich aus, statt sie
   hart abzuschneiden. Gilt für alle Kachelformen — reine Verbesserung. */
.bx-gm-strip { position:absolute; inset:0; z-index:2; display:flex; align-items:center; overflow:hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 3%, #000 97%, transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 3%, #000 97%, transparent 100%); }

/* Abstand zwischen den Kacheln an der BANDHÖHE festmachen — die Vorgabe .4em
   wuchs mit dem Textgrößen-Regler und riss die Leiste auseinander. */
.bx-gm-t-ueberlagert .bx-gm-track, .bx-gm-t-vitrine .bx-gm-track, .bx-gm-t-aufkleber .bx-gm-track {
  gap:3.5cqh; }

/* Der Textgrößen-Regler des Nutzers wirkt hier GEDÄMPFT (0,82×…1,22×) und nur
   auf Schriftgrößen und Kachel-BREITE. Auf die Höhe darf er nie wirken — sonst
   wächst die Kachel aus dem Band heraus. Breiter werden darf sie dagegen
   gefahrlos, dann passt der größere Text auch wieder in eine Zeile. */
.bx-gm-band.bx-gm-t-ueberlagert, .bx-gm-band.bx-gm-t-vitrine, .bx-gm-band.bx-gm-t-aufkleber {
  --bx-gm-fs: clamp(.82, var(--bx-fs, 1), 1.22); }

/* ── Gemeinsames Gerüst der drei Fassungen ─────────────────────────────── */
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip, .bx-gm-band.bx-gm-t-vitrine .bx-gm-chip,
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip {
  /* padding:0 steht hier nochmal, weil der Frameless-Block weiter oben
     .35em/.4em setzt — das würde die cqh-Geometrie verschieben. */
  padding:0; overflow:hidden; box-sizing:border-box; height:78cqh; border:0;
  width: calc(138cqh * var(--bx-gm-fs, 1)); }
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-ic, .bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-ic,
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-ic {
  top:3.5cqh; width:62cqh; height:62cqh; z-index:1; }

/* Schweben im Ruhezustand. Nutzt die Eigenschaft translate (nicht transform),
   weil die Bildkachel dort schon ihr -50% für die Zentrierung trägt.
   --bx-i kommt aus dem Markup und versetzt jede Kachel gegen die nächste. */
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-ic, .bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-ic,
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-ic {
  animation: bx-gm-float 4.6s ease-in-out infinite alternate;
  animation-delay: calc(var(--bx-i, 0) * -0.61s); }
@keyframes bx-gm-float { from { translate:-50% 1.1cqh } to { translate:-50% -1.8cqh } }

/* Lichtwurf, der AUS dem Geschenk auf die Kachel fällt — pulsiert langsam und
   je Kachel versetzt, damit die Leiste atmet statt im Gleichschritt zu blinken. */
.bx-gm-t-ueberlagert .bx-gm-ic::before, .bx-gm-t-vitrine .bx-gm-ic::before,
.bx-gm-t-aufkleber .bx-gm-ic::before {
  content:''; position:absolute; inset:-16%; z-index:-1; pointer-events:none; border-radius:50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--bx-accent,#ff5e8a) 70%, transparent), transparent 78%);
  filter: blur(1.8cqh);
  animation: bx-gm-glow 5.2s ease-in-out infinite alternate;
  animation-delay: calc(var(--bx-i, 0) * -0.83s); }
@keyframes bx-gm-glow { from { opacity:.32; scale:.88 } to { opacity:.7; scale:1.1 } }

/* Kachelboden: Aufstandsschatten + Lichtpfütze direkt unter dem Geschenk.
   Erst dadurch STEHT das Geschenk, statt im Rechteck zu schweben. */
.bx-gm-t-ueberlagert .bx-gm-ic::after, .bx-gm-t-vitrine .bx-gm-ic::after,
.bx-gm-t-aufkleber .bx-gm-ic::after {
  content:''; position:absolute; left:14%; right:14%; bottom:-3%; height:13%; z-index:-1;
  pointer-events:none; border-radius:50%; filter: blur(.9cqh);
  background:
    radial-gradient(closest-side, color-mix(in srgb, var(--bx-accent,#ff5e8a) 60%, transparent), transparent 76%),
    radial-gradient(closest-side, rgba(0,0,0,.75), transparent 74%); }

/* Die Effekt-Ebene des Auslösers. Eigenes Element, weil chip::before den
   Kachelboden trägt und chip::after den alten Lichtstreif — beide vergeben. */
.bx-gm-fx { display:none; }
.bx-gm-t-ueberlagert .bx-gm-fx, .bx-gm-t-vitrine .bx-gm-fx, .bx-gm-t-aufkleber .bx-gm-fx {
  display:block; position:absolute; inset:0; z-index:6; pointer-events:none; overflow:hidden;
  border-radius:inherit; }
.bx-gm-t-ueberlagert .bx-gm-fx::before, .bx-gm-t-vitrine .bx-gm-fx::before,
.bx-gm-t-aufkleber .bx-gm-fx::before,
.bx-gm-t-ueberlagert .bx-gm-fx::after, .bx-gm-t-vitrine .bx-gm-fx::after,
.bx-gm-t-aufkleber .bx-gm-fx::after { content:''; position:absolute; opacity:0; }
/* Der alte Lichtstreif auf chip::after würde sich mit den neuen Choreografien
   überlagern — hier läuft er über die Effekt-Ebene. */
.bx-gm-t-ueberlagert .bx-gm-chip.is-hit::after, .bx-gm-t-vitrine .bx-gm-chip.is-hit::after,
.bx-gm-t-aufkleber .bx-gm-chip.is-hit::after { display:none; }

/* Partikel — Splitter, Goldstaub oder Konfetti. Startlinie liegt auf dem
   Kachelboden, geflogen wird nach oben. */
.bx-gm-parts { position:absolute; left:0; right:0; bottom:22cqh; height:0; z-index:7; pointer-events:none; }
.bx-gm-parts i { position:absolute; left:var(--x,50%); bottom:0; width:var(--s,2cqh); height:var(--s,2cqh);
  background: var(--c, #fff); opacity:0;
  animation: bx-gm-part var(--t,900ms) var(--d,0ms) cubic-bezier(.18,.72,.3,1) both; }
@keyframes bx-gm-part {
  0%   { opacity:0; translate:-50% 0; scale:.3; rotate:0deg }
  14%  { opacity:1; scale:1 }
  72%  { opacity:1 }
  100% { opacity:0; translate: calc(-50% + var(--dx,0cqh)) calc(-1 * var(--rise,40cqh)); scale:.6; rotate: var(--r,180deg) } }
/* Splitter: harte Rauten mit Akzent-Glühen. */
.bx-gm-parts-ueberlagert i { border-radius:.3cqh;
  box-shadow: 0 0 1.4cqh color-mix(in srgb, var(--bx-accent,#ff5e8a) 70%, transparent); }
/* Goldstaub: winzige runde Körnchen, kaum leuchtend. */
.bx-gm-parts-vitrine i { border-radius:50%;
  box-shadow: 0 0 1.2cqh color-mix(in srgb, var(--bx-gold,#ffd23e) 55%, transparent); }
/* Konfetti: bunte Schnipsel mit dunkler Kante — passt zur Aufkleber-Kontur. */
.bx-gm-parts-aufkleber i { border-radius:.4cqh;
  box-shadow: 0 0 0 max(1px,.16cqh) rgba(25,27,40,.8); }

/* ══ FASSUNG 1: WUCHT (tile='ueberlagert') ═════════════════════════════════
   Arcade-Marquee über dem Videobild. Kantiges Rechteck, Akzentbalken am Fuß,
   abgeschrägtes Namensschild, Preis bündig in der Ecke. Die Wirkung steht in
   Anton — der engsten und fettesten der zwölf Familien: maximale Strichstärke
   je Pixel, damit sie auf bewegtem Bild und auf dem Handy noch trägt. */
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip {
  border-radius:1.2cqh;
  background:
    /* Harte Akzentkante links — die Kachel bekommt eine Leserichtung. */
    linear-gradient(90deg, var(--bx-accent,#ff5e8a) 0 1.8cqh, transparent 1.8cqh),
    linear-gradient(180deg, rgba(30,33,52,.6), rgba(7,8,15,.9) 70%, rgba(12,13,22,.94));
  box-shadow:
    inset 0 max(1px,.3cqh) 0 rgba(255,255,255,.22),
    inset 0 0 0 max(1px,.22cqh) rgba(255,255,255,.09),
    0 3cqh 4.5cqh -2cqh rgba(0,0,0,.85),
    0 0 3.5cqh -1.2cqh color-mix(in srgb, var(--bx-accent,#ff5e8a) 75%, transparent); }
.bx-gm-t-ueberlagert .bx-gm-chip::before {
  content:''; position:absolute; inset:0; z-index:0; pointer-events:none; border-radius:inherit;
  background: radial-gradient(58% 42% at 50% 26cqh, color-mix(in srgb, var(--bx-accent,#ff5e8a) 24%, transparent), transparent 74%); }
/* Der Fußbalken muss ÜBER den Verlauf — als Kachel-Hintergrund lag er darunter
   und war schlicht nicht zu sehen. Die Kerben machen daraus eine Marquee-Leiste. */
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-txt::before {
  content:''; position:absolute; left:0; right:0; bottom:0; height:2.6cqh; z-index:4; pointer-events:none;
  background:
    repeating-linear-gradient(90deg, rgba(0,0,0,.55) 0 1cqh, transparent 1cqh 3cqh),
    linear-gradient(90deg, var(--bx-accent,#ff5e8a), color-mix(in srgb, var(--bx-accent,#ff5e8a) 55%, var(--bx-gold,#ffd23e)));
  box-shadow: 0 -.5cqh 1.4cqh color-mix(in srgb, var(--bx-accent,#ff5e8a) 55%, transparent); }
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-txt::after {
  height:50cqh;
  background: linear-gradient(180deg, transparent, rgba(4,5,12,.52) 40%, rgba(4,5,12,.9) 76%, rgba(4,5,12,.96)); }
/* Name: schmale Versalzeile auf einem abgeschrägten Schild. Bebas Neue ist
   reine Versalschrift — die Großschreibung wirkt gesetzt, nicht geschrien. */
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-line {
  position:absolute; left:0; right:0; top:0; justify-content:flex-start; background:none; padding:0; }
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-name {
  font-family: var(--bx-gm-label); font-weight:400; font-size: calc(10.5cqh * var(--bx-gm-fs, 1)); line-height:1;
  letter-spacing:.1em; padding:1.5cqh 3.2cqh 1.3cqh 3.4cqh; max-width:76cqh; box-sizing:border-box;
  color:#0a0b12; background: var(--bx-accent,#ff5e8a);
  clip-path: polygon(0 0, 100% 0, calc(100% - 2.6cqh) 100%, 0 100%);
  -webkit-text-stroke:0; text-shadow:none; opacity:1; }
/* Preis in Russo One mit Tabellenziffern: gleich breite Ziffern, damit die
   Zahl beim Vorbeilaufen nicht zappelt. */
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-coins {
  top:0; right:0; border-radius:0 0 0 1.4cqh; padding:1.4cqh 2.4cqh;
  font-family: var(--bx-gm-num); font-variant-numeric: tabular-nums; font-size: calc(9.5cqh * var(--bx-gm-fs, 1)); line-height:1;
  letter-spacing:.02em; color: var(--bx-gold,#ffd23e); background: rgba(4,5,10,.86);
  box-shadow: inset 0 0 0 max(1px,.2cqh) color-mix(in srgb, var(--bx-gold,#ffd23e) 42%, transparent); }
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-act {
  left:3cqh; right:3cqh; bottom:4.6cqh;
  font-family: var(--bx-gm-hero); font-weight:400; font-size: calc(16cqh * var(--bx-gm-fs, 1)); line-height:.94;
  letter-spacing:.005em; text-transform:uppercase; color:#fff;
  -webkit-text-stroke: max(2px,.8cqh) #05060c; paint-order: stroke fill;
  text-shadow: 0 .5cqh 1.3cqh rgba(0,0,0,.95); }

/* Auslöser WUCHT: Druckwelle, Kippen, Splitter. */
.bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip.is-hit {
  animation: bx-gm-w-kick 1500ms cubic-bezier(.22,1.1,.3,1);
  box-shadow:
    inset 0 0 0 max(2px,.45cqh) color-mix(in srgb, var(--bx-accent,#ff5e8a) 92%, #fff),
    0 0 6cqh -.5cqh var(--bx-accent,#ff5e8a),
    0 3cqh 5cqh -2cqh rgba(0,0,0,.9); }
@keyframes bx-gm-w-kick {
  0%   { transform: translateY(0) scale(1) rotate(0deg); filter:none }
  4%   { filter: brightness(2) saturate(1.25) }
  7%   { transform: translateY(-3.4cqh) scale(1.055) rotate(-2.4deg) }
  15%  { transform: translateY(-4.4cqh) scale(1.04) rotate(2deg); filter:none }
  27%  { transform: translateY(-1.6cqh) scale(1.025) rotate(-1deg) }
  42%  { transform: translateY(-2.4cqh) scale(1.015) rotate(.6deg) }
  64%  { transform: translateY(0) scale(1.006) rotate(-.15deg) }
  100% { transform:none; filter:none } }
/* Druckwelle: ein Ring, der aus der Kachelmitte nach außen läuft. */
.bx-gm-t-ueberlagert .bx-gm-chip.is-hit .bx-gm-fx::before {
  inset:26cqh 48cqh; border-radius:50%;
  border: max(2px,1cqh) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 80%, #fff);
  animation: bx-gm-shock 780ms 40ms cubic-bezier(.14,.7,.24,1) both; }
@keyframes bx-gm-shock {
  0%   { opacity:0; scale:.2 }
  12%  { opacity:1 }
  100% { opacity:0; scale:4 } }
/* Lichtstreif quer über die Kachel. */
.bx-gm-t-ueberlagert .bx-gm-chip.is-hit .bx-gm-fx::after {
  inset:-10% -30%;
  background: linear-gradient(102deg, transparent 36%, rgba(255,255,255,.55) 50%, transparent 64%);
  animation: bx-gm-sweep2 880ms 90ms ease-out both; }
@keyframes bx-gm-sweep2 {
  0%   { opacity:0; transform: translateX(-80%) }
  10%  { opacity:1 }
  100% { opacity:0; transform: translateX(80%) } }
/* Geschenk springt nach vorn und überstrahlt — Schweben läuft weiter. */
.bx-gm-t-ueberlagert .bx-gm-chip.is-hit .bx-gm-ic {
  animation: bx-gm-float 4.6s ease-in-out infinite alternate, bx-gm-w-pop 1400ms cubic-bezier(.2,1.5,.3,1);
  animation-delay: calc(var(--bx-i, 0) * -0.61s), 0ms; }
@keyframes bx-gm-w-pop {
  0%   { translate:-50% 0; scale:1; filter:none }
  10%  { translate:-50% -4cqh; scale:1.3; filter: brightness(1.75) saturate(1.35) drop-shadow(0 0 3cqh var(--bx-accent,#ff5e8a)) }
  32%  { translate:-50% -2.4cqh; scale:1.13; filter: brightness(1.2) drop-shadow(0 0 2cqh var(--bx-accent,#ff5e8a)) }
  58%  { translate:-50% -.8cqh; scale:1.04 }
  100% { translate:-50% 0; scale:1; filter:none } }
/* „von <Name>" fliegt von unten ein und setzt sich über die Wirkung. */
.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-who, .bx-gm-t-vitrine .bx-gm-chip .bx-gm-who,
.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-who { display:none; }
.bx-gm-t-ueberlagert .bx-gm-chip.is-hit.has-who .bx-gm-who {
  display:block; z-index:8; top:auto; bottom:41cqh; left:50%; max-width:92%;
  font-family: var(--bx-gm-label); font-size:8.5cqh; line-height:1; letter-spacing:.12em;
  text-transform:uppercase; padding:1.2cqh 2.6cqh; border-radius:0;
  background: var(--bx-gold,#ffd23e); color:#0a0b12;
  box-shadow: 0 .8cqh 2cqh rgba(0,0,0,.7);
  animation: bx-gm-who-pop 2200ms 200ms cubic-bezier(.2,1.5,.3,1) both; }
@keyframes bx-gm-who-pop {
  0%   { opacity:0; translate:-50% 5cqh; scale:.7 }
  9%   { opacity:1; translate:-50% 0; scale:1.1 }
  15%  { scale:1 }
  86%  { opacity:1; translate:-50% 0; scale:1 }
  100% { opacity:0; translate:-50% -2.5cqh; scale:.94 } }

/* ══ FASSUNG 2: EDEL (tile='vitrine') ══════════════════════════════════════
   Ein beleuchteter Schaukasten. Fast nur Schwarz, eine Goldhaarlinie als
   Rahmen, ein Lichtkegel von oben auf das Geschenk und eine Glaskante als
   Regalboden. Wirkung in Bebas Neue (hohe, schlanke Versalien, gesperrt),
   Name winzig in Righteous mit weiter Sperrung wie eine Museumsplakette,
   Preis in Russo One mit Tabellenziffern. Nichts hüpft, nichts blinkt. */
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip {
  width: calc(148cqh * var(--bx-gm-fs, 1)); border-radius:.6cqh;
  background: linear-gradient(180deg, rgba(6,6,9,.94), rgba(1,1,3,.97) 58%, rgba(5,5,8,.95));
  box-shadow:
    inset 0 0 0 max(1px,.34cqh) color-mix(in srgb, var(--bx-gold,#ffd23e) 62%, transparent),
    inset 0 max(1px,.24cqh) 0 rgba(255,255,255,.2),
    inset 0 -4cqh 6cqh -3cqh color-mix(in srgb, var(--bx-accent,#ff5e8a) 45%, transparent),
    0 2.8cqh 4.2cqh -2cqh rgba(0,0,0,.95); }
/* Vier Goldwinkel wie an einer Museumsplakette. Acht Verlaufsschichten auf
   EINEM Pseudo — deshalb muss die is-hit-Variante mit aufgeführt werden,
   sonst nähme ihr die Auslöser-Regel weiter oben die Sichtbarkeit. */
.bx-gm-t-vitrine .bx-gm-chip::after, .bx-gm-t-vitrine .bx-gm-chip.is-hit::after {
  content:''; display:block; position:absolute; inset:2.2cqh 2.6cqh; z-index:5; pointer-events:none;
  border-radius:0; animation:none; opacity:.7;
  --gl: linear-gradient(var(--bx-gold,#ffd23e) 0 0);
  background:
    var(--gl) left top / 5cqh max(1px,.24cqh) no-repeat,
    var(--gl) left top / max(1px,.24cqh) 5cqh no-repeat,
    var(--gl) right top / 5cqh max(1px,.24cqh) no-repeat,
    var(--gl) right top / max(1px,.24cqh) 5cqh no-repeat,
    var(--gl) left bottom / 5cqh max(1px,.24cqh) no-repeat,
    var(--gl) left bottom / max(1px,.24cqh) 5cqh no-repeat,
    var(--gl) right bottom / 5cqh max(1px,.24cqh) no-repeat,
    var(--gl) right bottom / max(1px,.24cqh) 5cqh no-repeat; }
/* Der Lichtkegel: ein Trapez aus der Deckenmitte, weich, langsam heller und
   dunkler werdend — das ist die einzige Bewegung im Ruhezustand. */
.bx-gm-t-vitrine .bx-gm-chip::before {
  content:''; position:absolute; left:0; right:0; top:0; height:70cqh; z-index:0; pointer-events:none;
  clip-path: polygon(39% 0, 61% 0, 86% 100%, 14% 100%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--bx-accent,#ff5e8a) 46%, transparent), transparent 68%);
  filter: blur(2.2cqh);
  animation: bx-gm-cone 6.4s ease-in-out infinite alternate;
  animation-delay: calc(var(--bx-i, 0) * -1.07s); }
@keyframes bx-gm-cone { from { opacity:.34 } to { opacity:.72 } }
/* Regalboden: eine Goldkante, auf der das Geschenk steht. */
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-txt::before {
  content:''; position:absolute; left:8cqh; right:8cqh; top:62.5cqh; height:max(1px,.24cqh); z-index:2;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--bx-gold,#ffd23e) 85%, #fff), transparent);
  opacity:.65; }
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-txt::after {
  height:46cqh;
  background: linear-gradient(180deg, transparent, rgba(2,2,6,.6) 44%, rgba(2,2,6,.94)); }
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-line {
  position:absolute; left:0; right:0; top:3.4cqh; padding:0 4.5cqh; box-sizing:border-box;
  justify-content:flex-start; background:none; }
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-name {
  font-family: var(--bx-gm-label); font-size: calc(8cqh * var(--bx-gm-fs, 1)); line-height:1; letter-spacing:.26em;
  max-width:72cqh; opacity:1; color: color-mix(in srgb, var(--bx-gold,#ffd23e) 42%, #fff);
  -webkit-text-stroke: max(1.5px,.34cqh) rgba(3,3,7,.92); paint-order: stroke fill; }
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-coins {
  top:2.9cqh; right:4.5cqh; padding:0; background:none; box-shadow:none;
  font-family: var(--bx-gm-num); font-variant-numeric: tabular-nums; font-size: calc(8.4cqh * var(--bx-gm-fs, 1)); line-height:1;
  letter-spacing:.05em; color: var(--bx-gold,#ffd23e);
  -webkit-text-stroke: max(1.5px,.34cqh) rgba(3,3,7,.92); paint-order: stroke fill; }
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-act {
  left:2.6cqh; right:2.6cqh; bottom:6cqh;
  font-family: var(--bx-gm-hero); font-weight:400; font-size: calc(15.5cqh * var(--bx-gm-fs, 1)); line-height:.96;
  letter-spacing:.035em; text-transform:uppercase; color:#f7f3e9;
  -webkit-text-stroke: max(1.5px,.48cqh) rgba(2,2,6,.94); paint-order: stroke fill;
  text-shadow: 0 .4cqh 1.4cqh rgba(0,0,0,.92); }
/* Feine Goldlinie unter der Wirkung — die Plakettenkante. Der Chip-Block
   weiter oben blendet .bx-gm-line::after aus, deshalb hier wieder an. */
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-line::after {
  display:block; content:''; position:absolute; left:32%; right:32%; bottom:-70cqh;
  height:max(1px,.2cqh); min-width:0; border:0; flex:none;
  background: linear-gradient(90deg, transparent, var(--bx-gold,#ffd23e), transparent); opacity:.55; }

/* Auslöser EDEL: kein Sprung, sondern ein Aufleuchten. */
.bx-gm-band.bx-gm-t-vitrine .bx-gm-chip.is-hit {
  animation: bx-gm-v-lift 1800ms cubic-bezier(.16,.8,.24,1);
  box-shadow:
    inset 0 0 0 max(1.5px,.3cqh) color-mix(in srgb, var(--bx-gold,#ffd23e) 85%, #fff),
    inset 0 -4cqh 7cqh -3cqh color-mix(in srgb, var(--bx-accent,#ff5e8a) 70%, transparent),
    0 0 5cqh -1cqh color-mix(in srgb, var(--bx-gold,#ffd23e) 60%, transparent),
    0 2.8cqh 4.2cqh -2cqh rgba(0,0,0,.92); }
@keyframes bx-gm-v-lift {
  0%   { transform: translateY(0) scale(1); filter:none }
  18%  { transform: translateY(-1.4cqh) scale(1.02); filter: brightness(1.18) }
  55%  { transform: translateY(-.6cqh) scale(1.008) }
  100% { transform:none; filter:none } }
/* Ein einziger, sehr weicher Goldring — langsam, breit, kaum sichtbar am Ende. */
.bx-gm-t-vitrine .bx-gm-chip.is-hit .bx-gm-fx::before {
  inset:20cqh 44cqh; border-radius:50%;
  border: max(1px,.35cqh) solid color-mix(in srgb, var(--bx-gold,#ffd23e) 80%, #fff);
  filter: blur(.3cqh);
  animation: bx-gm-v-ring 1500ms 60ms cubic-bezier(.2,.65,.2,1) both; }
@keyframes bx-gm-v-ring {
  0%   { opacity:0; scale:.35 }
  20%  { opacity:.85 }
  100% { opacity:0; scale:3.1 } }
/* Das Aufleuchten selbst: der Lichtkegel wird kurz zum Scheinwerfer. */
.bx-gm-t-vitrine .bx-gm-chip.is-hit .bx-gm-fx::after {
  inset:0;
  background: radial-gradient(62% 58% at 50% 34%, rgba(255,248,225,.6), color-mix(in srgb, var(--bx-accent,#ff5e8a) 30%, transparent) 46%, transparent 74%);
  animation: bx-gm-v-bloom 1700ms ease-out both; }
@keyframes bx-gm-v-bloom {
  0%   { opacity:0; scale:.7 }
  14%  { opacity:1; scale:1 }
  46%  { opacity:.6 }
  100% { opacity:0; scale:1.15 } }
.bx-gm-t-vitrine .bx-gm-chip.is-hit .bx-gm-ic {
  animation: bx-gm-float 4.6s ease-in-out infinite alternate, bx-gm-v-pop 1700ms cubic-bezier(.18,.7,.22,1);
  animation-delay: calc(var(--bx-i, 0) * -0.61s), 0ms; }
@keyframes bx-gm-v-pop {
  0%   { translate:-50% 0; scale:1; filter:none }
  22%  { translate:-50% -2.2cqh; scale:1.11; filter: brightness(1.45) saturate(1.1) drop-shadow(0 0 2.4cqh color-mix(in srgb, var(--bx-gold,#ffd23e) 70%, transparent)) }
  60%  { translate:-50% -1cqh; scale:1.04; filter: brightness(1.12) }
  100% { translate:-50% 0; scale:1; filter:none } }
.bx-gm-t-vitrine .bx-gm-chip.is-hit.has-who .bx-gm-who {
  display:block; z-index:8; top:auto; bottom:42cqh; left:50%; max-width:92%;
  font-family: var(--bx-gm-label); font-size:7.4cqh; line-height:1; letter-spacing:.26em;
  text-transform:uppercase; padding:0; border-radius:0; background:none; box-shadow:none;
  color: color-mix(in srgb, var(--bx-gold,#ffd23e) 70%, #fff);
  -webkit-text-stroke: max(1.5px,.34cqh) rgba(2,2,6,.94); paint-order: stroke fill;
  animation: bx-gm-who-fade 2300ms 260ms ease-out both; }
@keyframes bx-gm-who-fade {
  0%   { opacity:0; translate:-50% 2.2cqh }
  16%  { opacity:1; translate:-50% 0 }
  84%  { opacity:1; translate:-50% 0 }
  100% { opacity:0; translate:-50% -1.4cqh } }

/* ══ FASSUNG 3: STICKER (tile='aufkleber') ═════════════════════════════════
   Ein ausgestanzter Aufkleber, leicht schief aufs Videobild geklebt. Heller
   Körper mit weißem Stanzrand und dunkler Keylinie, dahinter ein langsam
   drehender Sonnenstrahlen-Burst in der Akzentfarbe. Wirkung in Luckiest Guy
   (runde, dicke Formen mit Platz für eine kräftige Kontur), Name in Fredoka
   auf einer dunklen Pille, Preis in Baloo 2 auf einem Gold-Button. */
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip {
  width: calc(146cqh * var(--bx-gm-fs, 1)); border-radius:5cqh;
  border: max(3px,1.3cqh) solid #fdfdff;
  background:
    radial-gradient(72% 58% at 50% 6%, rgba(255,255,255,.96), rgba(246,248,255,.86) 52%, rgba(214,221,242,.82)),
    linear-gradient(180deg, #fbfcff, #cfd7ee);
  box-shadow:
    inset 0 0 0 max(1.5px,.42cqh) #191b28,
    inset 0 -2.5cqh 4cqh -2cqh color-mix(in srgb, var(--bx-accent,#ff5e8a) 45%, transparent),
    0 3cqh 3.6cqh -1.6cqh rgba(0,0,0,.8);
  /* Leichte Schräglage wie von Hand geklebt — abwechselnd links/rechts. */
  --tilt: -2.6deg;
  animation: bx-gm-wiggle 5.8s ease-in-out infinite alternate;
  animation-delay: calc(var(--bx-i, 0) * -0.73s); }
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip:nth-child(even) { --tilt: 2.3deg; }
/* Stanzlinie: die gestrichelte Kante, an der man den Aufkleber abzieht. */
.bx-gm-t-aufkleber .bx-gm-chip::after, .bx-gm-t-aufkleber .bx-gm-chip.is-hit::after {
  content:''; display:block; position:absolute; inset:1.8cqh; z-index:5; pointer-events:none;
  border-radius:3.4cqh; animation:none; background:none;
  border: max(1px,.3cqh) dashed rgba(25,27,40,.32); }
@keyframes bx-gm-wiggle {
  from { rotate: calc(var(--tilt, 0deg) - .9deg) }
  to   { rotate: calc(var(--tilt, 0deg) + .9deg) } }
/* Sonnenstrahlen hinter dem Geschenk — die Bewegung im Ruhezustand. */
.bx-gm-t-aufkleber .bx-gm-chip::before {
  content:''; position:absolute; left:50%; top:33cqh; width:96cqh; height:96cqh; z-index:0;
  translate:-50% -50%; pointer-events:none; border-radius:50%; opacity:.5;
  background: repeating-conic-gradient(from 0deg,
    color-mix(in srgb, var(--bx-accent,#ff5e8a) 55%, transparent) 0deg 9deg, transparent 9deg 18deg);
  -webkit-mask-image: radial-gradient(closest-side, #000 24%, rgba(0,0,0,.5) 52%, transparent 76%);
  mask-image: radial-gradient(closest-side, #000 24%, rgba(0,0,0,.5) 52%, transparent 76%);
  animation: bx-gm-rays 26s linear infinite; }
@keyframes bx-gm-rays { to { rotate: 360deg } }
/* Heller Körper: der Verlauf unter dem Text muss AUFHELLEN, nicht abdunkeln. */
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-txt::after {
  height:44cqh;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,.5) 42%, rgba(255,255,255,.86) 76%, rgba(255,255,255,.93)); }
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-line {
  position:absolute; left:0; right:0; top:3cqh; padding:0 3.5cqh; box-sizing:border-box;
  justify-content:flex-start; background:none; }
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-name {
  font-family: var(--bx-gm-label); font-weight:600; font-size: calc(9.5cqh * var(--bx-gm-fs, 1)); line-height:1;
  letter-spacing:.05em; padding:1.3cqh 2.6cqh; border-radius:99em; max-width:74cqh; box-sizing:border-box;
  color:#fbfcff; background:#191b28; box-shadow: 0 .6cqh 0 rgba(0,0,0,.25);
  -webkit-text-stroke:0; text-shadow:none; opacity:1; }
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-coins {
  top:2.6cqh; right:3.5cqh; padding:1.2cqh 2.4cqh; border-radius:99em;
  font-family: var(--bx-gm-num); font-weight:800; font-variant-numeric: tabular-nums;
  font-size: calc(9cqh * var(--bx-gm-fs, 1)); line-height:1; color:#3a2a00;
  background: linear-gradient(165deg, #ffe9a3, var(--bx-gold,#ffd23e));
  box-shadow: inset 0 0 0 max(1.5px,.34cqh) #191b28, 0 .6cqh 0 rgba(0,0,0,.25); }
/* Dunkle Type mit hartem Akzentschatten = Aufkleberschrift. */
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-act {
  left:2.6cqh; right:2.6cqh; bottom:5cqh;
  font-family: var(--bx-gm-hero); font-weight:400; font-size: calc(16cqh * var(--bx-gm-fs, 1)); line-height:1.0;
  letter-spacing:.01em; text-transform:uppercase; color:#14151f;
  /* BEWUSST ohne helle Kontur: dunkle Type direkt auf dem hellen Aufkleber ist
     der kontraststärkste Fall, den es gibt. Ein weißer Halo fraß bei 34 %
     Ansichtsgröße genau den Buchstabeninnenraum weg, den man zum Lesen
     braucht. Der harte Akzentschatten bleibt — er macht die Sticker-Anmutung. */
  -webkit-text-stroke:0;
  text-shadow: 0 .45cqh 0 color-mix(in srgb, var(--bx-accent,#ff5e8a) 88%, #2a0d18),
    0 1cqh .9cqh rgba(0,0,0,.28); }

/* Auslöser STICKER: hüpfen mit Squash-and-Stretch, dann Konfetti. */
.bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip.is-hit {
  animation: bx-gm-wiggle 5.8s ease-in-out infinite alternate,
             bx-gm-s-hop 1500ms cubic-bezier(.3,1.1,.4,1);
  animation-delay: calc(var(--bx-i, 0) * -0.73s), 0ms;
  box-shadow:
    inset 0 0 0 max(1.5px,.42cqh) #191b28,
    inset 0 -3cqh 5cqh -2cqh color-mix(in srgb, var(--bx-accent,#ff5e8a) 70%, transparent),
    0 0 5cqh -1cqh var(--bx-accent,#ff5e8a),
    0 3cqh 3.6cqh -1.6cqh rgba(0,0,0,.8); }
@keyframes bx-gm-s-hop {
  0%   { transform: translateY(0) scale(1,1) }
  8%   { transform: translateY(1.2cqh) scale(1.13,.87) }
  22%  { transform: translateY(-5cqh) scale(.93,1.1) }
  36%  { transform: translateY(-6.4cqh) scale(1,1) }
  52%  { transform: translateY(1cqh) scale(1.11,.9) }
  68%  { transform: translateY(-2.4cqh) scale(.97,1.04) }
  84%  { transform: translateY(.3cqh) scale(1.03,.97) }
  100% { transform:none } }
/* Comic-Ring: eine aufgehende Kontur in Kachelform, kein Kreis. */
.bx-gm-t-aufkleber .bx-gm-chip.is-hit .bx-gm-fx::before {
  inset:14cqh 24cqh; border-radius:6cqh;
  border: max(2px,1.1cqh) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 88%, #fff);
  animation: bx-gm-s-ring 700ms 60ms cubic-bezier(.16,.72,.24,1) both; }
@keyframes bx-gm-s-ring {
  0%   { opacity:0; scale:.4; rotate:-6deg }
  14%  { opacity:1 }
  100% { opacity:0; scale:2.6; rotate:4deg } }
/* Glanz über den Aufkleber — er ist ja beschichtet. */
.bx-gm-t-aufkleber .bx-gm-chip.is-hit .bx-gm-fx::after {
  inset:-10% -30%;
  background: linear-gradient(100deg, transparent 38%, rgba(255,255,255,.85) 50%, transparent 62%);
  animation: bx-gm-sweep2 820ms 140ms ease-out both; }
.bx-gm-t-aufkleber .bx-gm-chip.is-hit .bx-gm-ic {
  animation: bx-gm-float 4.6s ease-in-out infinite alternate, bx-gm-s-pop 1500ms cubic-bezier(.25,1.6,.35,1);
  animation-delay: calc(var(--bx-i, 0) * -0.61s), 0ms; }
@keyframes bx-gm-s-pop {
  0%   { translate:-50% 0; scale:1; rotate:0deg; filter:none }
  12%  { translate:-50% -4.5cqh; scale:1.34; rotate:-9deg; filter: brightness(1.5) saturate(1.3) drop-shadow(0 0 2.4cqh var(--bx-accent,#ff5e8a)) }
  30%  { translate:-50% -2cqh; scale:1.1; rotate:7deg }
  48%  { translate:-50% -3cqh; scale:1.16; rotate:-4deg; filter: brightness(1.15) }
  70%  { translate:-50% -.6cqh; scale:1.03; rotate:1.5deg }
  100% { translate:-50% 0; scale:1; rotate:0deg; filter:none } }
/* „von <Name>" als Sprechblase, die mit Überschwung aufpoppt. */
.bx-gm-t-aufkleber .bx-gm-chip.is-hit.has-who .bx-gm-who {
  display:block; z-index:8; top:auto; bottom:40cqh; left:50%; max-width:92%;
  font-family: var(--bx-gm-label); font-weight:600; font-size:8.5cqh; line-height:1;
  letter-spacing:.03em; padding:1.3cqh 3cqh; border-radius:99em;
  background:#191b28; color:#fdfdff;
  box-shadow: inset 0 0 0 max(1.5px,.34cqh) #fdfdff, 0 .9cqh 1.8cqh rgba(0,0,0,.45);
  animation: bx-gm-who-pop 2200ms 240ms cubic-bezier(.2,1.8,.3,1) both; }

/* ── Banner-Hintergründe: Fassung der Leiste selbst ───────────────────────
   Zu den drei Kachelfassungen bekommt das Band eine Kante, damit die Kacheln
   auf etwas STEHEN statt darin zu kleben: oben eine Lichtlinie, unten eine
   Schattenfuge, dazu ein Bodenschimmer in der Akzentfarbe. */
.bx-gm-band.bx-gm-t-ueberlagert, .bx-gm-band.bx-gm-t-vitrine, .bx-gm-band.bx-gm-t-aufkleber {
  box-shadow:
    inset 0 max(1px,.4cqh) 0 rgba(255,255,255,.16),
    inset 0 max(-2px,-.8cqh) 0 rgba(0,0,0,.6),
    inset 0 -3cqh 5cqh -3cqh color-mix(in srgb, var(--bx-accent,#ff5e8a) 45%, transparent); }
/* Der Schimmer über dem Band läuft bei den drei Fassungen ruhiger und
   schmaler — sonst kämpft er mit dem Lichtwurf der Kacheln. */
.bx-gm-band.bx-gm-t-ueberlagert::after, .bx-gm-band.bx-gm-t-vitrine::after,
.bx-gm-band.bx-gm-t-aufkleber::after { width:24%; opacity:.6; animation-duration:9s; }
/* Von den animierten Bannern bleiben neben den großen Kacheln nur noch die
   Ränder übrig. Damit sie dort überhaupt noch zu sehen sind, laufen Aurora und
   Streifen bei diesen drei Fassungen kräftiger. */
.bx-gm-band.bx-gm-t-ueberlagert.bx-gm-b-aurora::before,
.bx-gm-band.bx-gm-t-vitrine.bx-gm-b-aurora::before,
.bx-gm-band.bx-gm-t-aufkleber.bx-gm-b-aurora::before { opacity:1; inset:-55% -10%; }
.bx-gm-band.bx-gm-t-ueberlagert.bx-gm-b-streifen,
.bx-gm-band.bx-gm-t-vitrine.bx-gm-b-streifen,
.bx-gm-band.bx-gm-t-aufkleber.bx-gm-b-streifen { background:
    repeating-linear-gradient(115deg,
      color-mix(in srgb, var(--bx-accent,#ff5e8a) 22%, transparent) 0 2.2em,
      rgba(255,255,255,0) 2.2em 4.6em),
    linear-gradient(180deg, rgba(24,26,40,.92), rgba(10,11,20,.96)) !important;
  background-size: 12em 100%, 100% 100% !important; }

/* ── „Rahmen ausblenden" für die drei Fassungen ───────────────────────────
   Der Frameless-Block weiter oben nimmt Hintergrund und Schatten weg — der
   Textverlauf, die Goldwinkel, die Stanzlinie, der Fußbalken und der
   Strahlenkranz blieben aber stehen und sahen dann aus wie eine halbe Kachel.
   Ohne Kachel bleibt: Geschenk, Lichtwurf, Schrift. Und die Schrift braucht
   dann ihre eigene Kontur, weil kein Verlauf mehr hinter ihr liegt. */
.bx-frameless .bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-txt::after,
.bx-frameless .bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-txt::after,
.bx-frameless .bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-txt::after,
.bx-frameless .bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip .bx-gm-txt::before,
.bx-frameless .bx-gm-band.bx-gm-t-vitrine .bx-gm-chip .bx-gm-txt::before,
.bx-frameless .bx-gm-band.bx-gm-t-vitrine .bx-gm-chip::after,
.bx-frameless .bx-gm-band.bx-gm-t-vitrine .bx-gm-chip.is-hit::after,
.bx-frameless .bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip::after,
.bx-frameless .bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip.is-hit::after,
.bx-frameless .bx-gm-band.bx-gm-t-ueberlagert .bx-gm-chip::before,
.bx-frameless .bx-gm-band.bx-gm-t-vitrine .bx-gm-chip::before,
.bx-frameless .bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip::before { display:none; }
/* Der Aufkleber trägt seine Lesbarkeit sonst über den hellen Körper. Fällt der
   weg, MUSS die Kontur zurück — sonst steht dunkle Schrift auf dunklem Video. */
.bx-frameless .bx-gm-band.bx-gm-t-aufkleber .bx-gm-chip .bx-gm-act {
  color:#fff; -webkit-text-stroke: max(2.5px,.9cqh) #14151f; paint-order: stroke fill;
  text-shadow: 0 .5cqh 0 color-mix(in srgb, var(--bx-accent,#ff5e8a) 88%, #2a0d18),
    0 1cqh 1.2cqh rgba(0,0,0,.6); }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

// Generisches Geschenk-SVG (identisch zu gift-alert.js) — Platzhalter, solange
// das echte Bild fehlt. Hier der REGELFALL, nicht die Ausnahme.
const GIFT_SVG = `<svg class="bx-gm-ph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" fill="rgba(255,255,255,.08)"/><path d="M2 7h20v5H2z" fill="rgba(255,255,255,.12)"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>`;

const MODES = new Set(['rotation', 'leiste']);
const STYLES = new Set(['karte', 'tafel', 'neon']);
/** Kachelform im Laufband — wie kompakt ein Eintrag gepackt wird.
 *  'ueberlagert' | 'vitrine' | 'aufkleber' sind die drei ausgestalteten
 *  Laufband-Fassungen (Wucht / Edel / Sticker) — siehe CSS weiter oben. */
const TILES = new Set(['breit', 'quadrat', 'etikett', 'ablage', 'ueberlagert', 'untertitel', 'banderole',
  'vitrine', 'aufkleber']);
/** Kachelformen mit eigener Schrift-Hierarchie und eigener Auslöse-Choreografie. */
const SHOWCASE_TILES = new Set(['ueberlagert', 'vitrine', 'aufkleber']);
/** Hintergrund-Banner des Laufbands — ruhig oder in Bewegung. */
const BANNERS = new Set(['schimmer', 'welle', 'streifen', 'aurora']);

/** Kuratierte Schrift-Hierarchie je ausgestalteter Fassung: eine dominante
 *  Display-Schrift für die WIRKUNG, eine schmale Versalschrift für den NAMEN,
 *  eine eigene Schrift mit Tabellenziffern für den PREIS. Alle zwölf Familien
 *  liegen lokal in widget-base.css — nichts wird nachgeladen. */
const TILE_FONTS = {
  // Wucht: Anton ist die engste und fetteste der zwölf — maximale Strichstärke
  // je Pixel, hält auf bewegtem Videobild und bei 34 % noch stand.
  ueberlagert: {
    hero: "'Anton', 'Arial Narrow', 'Arial Black', sans-serif",
    label: "'Bebas Neue', 'Arial Narrow', sans-serif",
    num: "'Russo One', 'Arial Black', sans-serif",
  },
  // Edel: Bebas Neue hat feine, hohe Versalien — schlank statt laut.
  vitrine: {
    hero: "'Bebas Neue', 'Arial Narrow', sans-serif",
    label: "'Righteous', 'Trebuchet MS', sans-serif",
    num: "'Russo One', 'Arial Black', sans-serif",
  },
  // Sticker: Luckiest Guy ist die Aufkleber-Schrift schlechthin (runde, dicke
  // Formen mit Platz für eine kräftige Kontur).
  aufkleber: {
    hero: "'Luckiest Guy', 'Arial Black', cursive",
    label: "'Fredoka', 'Trebuchet MS', sans-serif",
    num: "'Baloo 2', 'Arial Black', sans-serif",
  },
};
/** Die unveränderten Basiswerte aus widget-base.css. Stimmt die aktuelle
 *  Variable damit überein, hat der Nutzer NICHTS eingestellt — nur dann darf
 *  die kuratierte Wahl greifen. Setzt er eine Schriftart oder ein Theme, das
 *  die Variable belegt, gewinnt seine Einstellung. */
const BASE_FONTS = {
  '--bx-font-display': "'Lilita One', 'Arial Black', sans-serif",
  '--bx-font-body': "'Baloo 2', 'Segoe UI', system-ui, sans-serif",
  '--bx-font-num': "'Baloo 2', 'Arial Black', sans-serif",
};
/** Partikel-Farben je Fassung. Die Akzentfarbe des Nutzers ist überall dabei,
 *  damit der Schwarm zur eingestellten Farbe passt. */
const PARTICLE_COLORS = {
  ueberlagert: ['var(--bx-accent,#ff5e8a)', '#ffffff', 'var(--bx-gold,#ffd23e)', 'var(--bx-accent,#ff5e8a)'],
  vitrine: ['var(--bx-gold,#ffd23e)', '#fff6da', 'var(--bx-gold,#ffd23e)'],
  aufkleber: ['var(--bx-accent,#ff5e8a)', 'var(--bx-gold,#ffd23e)', '#4ad3ff', '#7cf59b', '#ffffff'],
};
function normFont(v) {
  return String(v || '').replace(/["']/g, '').replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim().toLowerCase();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Toleranter Gift-Schlüssel (nur Buchstaben/Ziffern, klein) — wie in der
 *  Trigger-Engine, damit Apostroph/Leerzeichen/Schreibweise egal sind. */
export function giftKey(slug) {
  return String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "rose::Konfetti | galaxy::Songwunsch" → [{slug, text}]. Ohne :: gilt der
 *  ganze Eintrag als Gift-Name ohne Aktionstext. */
export function parseItems(raw) {
  return String(raw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf('::');
      if (i >= 0) return { slug: s.slice(0, i).trim(), text: s.slice(i + 2).trim() };
      return { slug: s, text: '' };
    })
    .filter((it) => it.slug || it.text);
}

/** Aktions-Art → verständlicher deutscher Text für die Tafel. */
export function actionLabel(action) {
  if (!action || typeof action !== 'object') return '';
  switch (action.kind) {
    case 'play_sound': return 'Sound';
    case 'fire_alert': return 'Alarm';
    case 'show_layer': return 'Einblendung';
    case 'hide_layer': return '';
    case 'speak': return 'Ansage';
    case 'spin_wheel': return 'Glücksrad';
    case 'play_media': return 'Video/Bild';
    case 'counter_add': return `Zähler ${Number(action.delta) >= 0 ? '+' : ''}${Number(action.delta) || 0}`;
    case 'obs_scene': return `Szene: ${action.scene || ''}`.trim();
    case 'obs_visibility': return 'Quelle ein/aus';
    case 'send_chat': return 'Chat-Nachricht';
    case 'streamerbot_action': return String(action.action || 'Streamer.bot');
    case 'giveaway_draw': return 'Verlosung';
    case 'giveaway_reset': return '';
    case 'spotify_control': return 'Musik';
    case 'spotify_request': return 'Songwunsch';
    default: return '';
  }
}

/** Trigger-Regeln → Tafel-Einträge. Nur aktive Gift-Regeln mit einer
 *  Gift-Bedingung (gift_slug_is / gift_id_is). Der Text kommt aus dem
 *  Regel-Namen, sofern er selbst gewählt ist; sonst aus den Aktionen. */
export function itemsFromRules(rules) {
  const out = [];
  const seen = new Set();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || rule.enabled === false || rule.event !== 'gift') continue;
    const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
    const slugCond = conds.find((c) => c && c.kind === 'gift_slug_is');
    const idCond = conds.find((c) => c && c.kind === 'gift_id_is');
    if (!slugCond && !idCond) continue;
    const slug = slugCond ? String(slugCond.value || '') : '';
    const giftId = idCond ? Number(idCond.value) || 0 : 0;
    const key = slug ? giftKey(slug) : `#${giftId}`;
    if (!key || seen.has(key)) continue;
    // Von der Geschenke-Galerie erzeugte Regeln heißen „Gift: <slug>" — das ist
    // kein sprechender Text, dann lieber die Aktionen beschreiben.
    const name = String(rule.name || '').trim();
    const generic = /^gift:/i.test(name);
    const fromActions = (Array.isArray(rule.actions) ? rule.actions : [])
      .map(actionLabel).filter(Boolean);
    const uniq = [...new Set(fromActions)];
    const text = (!generic && name) ? name : uniq.join(' + ');
    if (!slug && !giftId) continue;
    seen.add(key);
    out.push({ slug, giftId, text });
  }
  return out;
}

const DEMO = 'Rose::Konfetti-Regen | Finger Heart::Danke-Sound | Galaxy::Songwunsch | TikTok::Glücksrad drehen | Doughnut::Tode +1';
const DEMO_COINS = { rose: 1, fingerheart: 5, galaxy: 1000, tiktok: 1, doughnut: 30 };

export default class GiftMenu {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.props = props || {};
    this.timers = new Set();
    this.parts = new Set();   // laufende Partikel-Schwärme (Auslöse-Effekt)
    this.rotTimer = null;
    this.icons = {};      // giftKey → Bild-URL
    this.iconsById = {};  // giftId  → Bild-URL
    this.meta = {};       // giftKey → { name, coins }
    this.metaById = {};   // giftId  → { name, coins, key }
    this.index = 0;

    if (props.accent) root.style.setProperty('--bx-accent', String(props.accent));
    this.mode = MODES.has(props.mode) ? props.mode : 'rotation';
    this.style = STYLES.has(props.style) ? props.style : 'karte';
    this.tile = TILES.has(props.tile) ? props.tile : 'breit';
    this.banner = BANNERS.has(props.banner) ? props.banner : 'schimmer';
    this.showCoins = props.showCoins !== false;
    this.showTitle = props.showTitle !== false;
    this.title = String(props.title ?? 'Geschenke & was sie auslösen');
    this.dwell = Math.max(1200, Number(props.intervalMs ?? 6000) || 6000);
    this.speed = Math.max(6, Number(props.speed ?? 26) || 26);

    this.el = document.createElement('div');
    this.el.className = `bx-gm bx-st-${this.style}`;
    root.appendChild(this.el);

    this.items = parseItems(props.items);
    // Vorschau/Editor: ohne Einträge wäre nur eine leere Box zu sehen.
    if (!this.items.length && this.ctx.preview) {
      this.items = parseItems(DEMO);
      this.demo = true;
    }
    this.build();
    // Die Runtime setzt Theme und Schriftart u.U. ERST nach dem Bauen auf die
    // Widget-Box. Deshalb ein zweiter Blick im nächsten Tick.
    const ft = setTimeout(() => { this.timers.delete(ft); this.syncFonts(); }, 0);
    this.timers.add(ft);

    // Bilder + Coin-Preise aus dem App-Katalog (offizielle Quelle) nachladen.
    if (this.ctx.baseUrl) void this.loadCatalog();
    // Aktionen automatisch aus den Trigger-Regeln des Nutzers ziehen.
    if (String(props.source || 'liste') === 'trigger' && this.ctx.baseUrl) void this.loadRules();
  }

  // ── Aufbau ──────────────────────────────────────────────────────────────
  build() {
    if (this.rotTimer) { clearInterval(this.rotTimer); this.rotTimer = null; }
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.clearParticles();
    this.index = 0;
    const list = this.items.length ? this.items : [{ slug: '', text: 'Noch keine Geschenke eingetragen' }];
    this.list = list; // für die Zuordnung eintreffender Geschenke
    if (this.mode === 'leiste') this.buildBand(list);
    else this.buildRotation(list);
    this.syncFonts();
  }

  /** Kuratierte Schrift-Hierarchie einhängen — aber nur, wo der Nutzer nichts
   *  eigenes gesetzt hat. Sobald seine Schriftart-Einstellung oder ein Theme
   *  eine der drei Basis-Variablen belegt, bleibt DIESE stehen. */
  syncFonts() {
    const st = this.el.style;
    const drop = () => { st.removeProperty('--bx-gm-hero'); st.removeProperty('--bx-gm-label'); st.removeProperty('--bx-gm-num'); };
    const set = TILE_FONTS[this.tile];
    if (!set || this.mode !== 'leiste') { drop(); return; }
    let cs;
    try { cs = getComputedStyle(this.el); } catch { return; }
    const pick = (base, chosen, target) => {
      const cur = normFont(cs.getPropertyValue(base));
      if (!cur || cur === normFont(BASE_FONTS[base])) st.setProperty(target, chosen);
      else st.removeProperty(target);
    };
    pick('--bx-font-display', set.hero, '--bx-gm-hero');
    pick('--bx-font-body', set.label, '--bx-gm-label');
    pick('--bx-font-num', set.num, '--bx-gm-num');
  }

  // ── Auslöser ────────────────────────────────────────────────────────────
  /** Index des Eintrags, auf den dieses Geschenk passt (-1 = keiner). */
  matchIndex(gift) {
    if (!gift) return -1;
    const gid = Number(gift.giftId || gift.gift_id || 0) || 0;
    const key = gift.slug ? giftKey(gift.slug) : '';
    return (this.list || []).findIndex((it) => {
      if (gid && Number(it.giftId) === gid) return true;
      return !!key && !!it.slug && giftKey(it.slug) === key;
    });
  }

  onEvent(event) {
    if (!event || event.type !== 'gift') return;
    const i = this.matchIndex(event.gift);
    if (i < 0) return;
    this.celebrate(i, event.user && event.user.nickname);
  }

  /** Der getroffene Eintrag springt nach vorn und feiert kurz. */
  celebrate(i, who) {
    const targets = [...this.el.querySelectorAll(`[data-idx="${i}"]`)]
      .filter((el) => el.classList.contains('bx-gm-card') || el.classList.contains('bx-gm-chip'));
    if (!targets.length) return;

    if (this.mode !== 'leiste' && this.cards && this.cards.length) {
      // In der Rotation zuerst hinschalten — und die Uhr neu stellen, damit der
      // Eintrag nicht eine Zehntelsekunde später weiterrotiert.
      this.show(i);
      if (this.rotTimer) {
        clearInterval(this.rotTimer);
        this.rotTimer = setInterval(() => this.show((this.index + 1) % this.cards.length), this.dwell);
      }
    }
    this.clearParticles();
    for (const el of targets) {
      const badge = el.querySelector('.bx-gm-who');
      if (badge) badge.textContent = who ? `von ${who}` : '';
      el.classList.toggle('has-who', !!who);
      // Neu anstoßen, auch wenn die Klasse noch hängt (Combo: 10x Rose).
      el.classList.remove('is-hit');
      void el.offsetWidth;
      el.classList.add('is-hit');
      this.spawnParticles(el);
    }
    if (this.hitTimer) { clearTimeout(this.hitTimer); this.timers.delete(this.hitTimer); }
    this.hitTimer = setTimeout(() => {
      this.timers.delete(this.hitTimer);
      this.hitTimer = null;
      for (const el of this.el.querySelectorAll('.is-hit')) el.classList.remove('is-hit');
      this.clearParticles();
    }, 2600);
    this.timers.add(this.hitTimer);
  }

  /** Der Partikel-Schwarm des Auslösers. Bewusst per JS: jedes Teilchen
   *  braucht eigene Startposition, Flugbahn, Drehung und Verzögerung — als
   *  festes CSS wären das dutzende Regeln, die immer gleich aussehen.
   *  Animiert wird ausschließlich translate/rotate/opacity. Aufgeräumt wird
   *  über this.timers (Ablauf) UND clearParticles() (Neubau/destroy). */
  spawnParticles(el) {
    const kind = SHOWCASE_TILES.has(this.tile) ? this.tile : '';
    if (!kind || this.mode !== 'leiste') return;
    // Edel wirft Goldstaub (wenig, langsam), Wucht Splitter, Sticker Konfetti.
    const n = kind === 'vitrine' ? 10 : (kind === 'aufkleber' ? 16 : 14);
    const pal = PARTICLE_COLORS[kind];
    const box = document.createElement('i');
    box.className = `bx-gm-parts bx-gm-parts-${kind}`;
    let html = '';
    for (let k = 0; k < n; k++) {
      const x = Math.round((k / Math.max(1, n - 1)) * 82 + 9 + (Math.random() * 8 - 4));
      const rise = kind === 'vitrine' ? 26 + Math.random() * 22 : 34 + Math.random() * 40;
      const drift = (Math.random() * 26 - 13) * (kind === 'vitrine' ? 0.5 : 1);
      const size = kind === 'vitrine' ? 0.9 + Math.random() * 0.9 : 1.5 + Math.random() * 2.2;
      const rot = Math.round(Math.random() * 900 - 450);
      const del = Math.round(Math.random() * (kind === 'vitrine' ? 420 : 240));
      const dur = Math.round((kind === 'vitrine' ? 1100 : 720) + Math.random() * 520);
      html += `<i style="--x:${x}%;--rise:${rise.toFixed(1)}cqh;--dx:${drift.toFixed(1)}cqh;`
        + `--s:${size.toFixed(2)}cqh;--r:${rot}deg;--d:${del}ms;--t:${dur}ms;`
        + `--c:${pal[k % pal.length]}"></i>`;
    }
    box.innerHTML = html;
    el.appendChild(box);
    this.parts.add(box);
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.parts.delete(box);
      box.remove();
    }, 2200);
    this.timers.add(t);
  }

  clearParticles() {
    for (const p of this.parts) p.remove();
    this.parts.clear();
  }

  /** Bild-Platzhalter + (später) echtes Bild für einen Eintrag. */
  iconHtml(it) {
    const k = it.slug ? giftKey(it.slug) : '';
    const gid = Number(it.giftId) || 0;
    return `<span class="bx-gm-ic" data-key="${escapeHtml(k)}" data-gid="${gid}">${GIFT_SVG}<img alt="" /></span>`;
  }

  displayName(it) {
    const k = it.slug ? giftKey(it.slug) : '';
    const m = (k && this.meta[k]) || (it.giftId && this.metaById[it.giftId]) || null;
    return (m && m.name) || it.slug || (it.giftId ? `Gift #${it.giftId}` : '');
  }

  coinsOf(it) {
    const k = it.slug ? giftKey(it.slug) : '';
    const m = (k && this.meta[k]) || (it.giftId && this.metaById[it.giftId]) || null;
    const c = m ? Number(m.coins) || 0 : (this.demo ? Number(DEMO_COINS[k]) || 0 : 0);
    return c;
  }

  coinsHtml(it) {
    if (!this.showCoins) return '';
    const c = this.coinsOf(it);
    if (!c) return '';
    return `<span class="bx-gm-coins" data-key="${escapeHtml(it.slug ? giftKey(it.slug) : '')}">🪙 ${c.toLocaleString('de-DE')}</span>`;
  }

  buildRotation(list) {
    const cards = list.map((it, i) => {
      const name = this.displayName(it);
      const act = it.text ? `<div class="bx-gm-act"><b>→</b> ${escapeHtml(it.text)}</div>` : '';
      const coins = this.coinsHtml(it);
      // Name und Preis stehen in EINER Zeile — daraus baut der Stil „tafel"
      // seine Speisekarten-Zeile (Name … Punktreihe … Preis).
      const line = (name || coins)
        ? `<div class="bx-gm-line">${name ? `<div class="bx-gm-name">${escapeHtml(name)}</div>` : ''}${coins}</div>`
        : '';
      return `<div class="bx-gm-card" data-idx="${i}"><i class="bx-gm-deco" aria-hidden="true"></i>${this.iconHtml(it)}`
        + `${line}${act}<span class="bx-gm-who"></span></div>`;
    }).join('');
    const dots = list.length > 1 && list.length <= 10
      ? `<div class="bx-gm-dots">${list.map(() => '<i class="bx-gm-dot"></i>').join('')}</div>` : '';
    const bar = list.length > 1 ? '<div class="bx-gm-bar"><i></i></div>' : '';
    this.el.innerHTML = `<div class="bx-gm-rot">`
      + `${this.showTitle && this.title ? `<div class="bx-gm-title">${escapeHtml(this.title)}</div>` : ''}`
      + `<div class="bx-gm-stage">${cards}</div>${dots}${bar}</div>`;
    this.cards = [...this.el.querySelectorAll('.bx-gm-card')];
    this.dots = [...this.el.querySelectorAll('.bx-gm-dot')];
    this.barEl = this.el.querySelector('.bx-gm-bar');
    this.el.style.setProperty('--dwell', `${this.dwell}ms`);
    this.show(0);
    if (list.length > 1) {
      this.rotTimer = setInterval(() => this.show((this.index + 1) % this.cards.length), this.dwell);
    }
  }

  show(i) {
    this.index = i;
    this.cards.forEach((c, j) => c.classList.toggle('is-in', j === i));
    this.dots.forEach((d, j) => d.classList.toggle('is-on', j === i));
    if (!this.barEl) return;
    // Balken-Animation neu starten (Reflow erzwingen, sonst läuft sie weiter).
    this.barEl.classList.remove('run');
    void this.barEl.offsetWidth;
    this.barEl.classList.add('run');
  }

  buildBand(list) {
    const chip = (it, i) => {
      const name = this.displayName(it);
      // Zweizeilig statt einzeilig: oben Name + Preis, darunter die Wirkung.
      // Eine lange Zeile machte aus jeder Kachel ein halbes Banner.
      // --bx-i versetzt Schweben und Lichtpuls je Kachel: die Leiste soll leben,
      // nicht im Gleichschritt blinken.
      return `<span class="bx-gm-chip" data-idx="${i}" style="--bx-i:${i}">${this.iconHtml(it)}`
        + `<span class="bx-gm-txt">`
        + `<span class="bx-gm-line">`
        + `${name ? `<span class="bx-gm-name">${escapeHtml(name)}</span>` : ''}`
        + `${this.coinsHtml(it)}</span>`
        + `${it.text ? `<span class="bx-gm-act">${escapeHtml(it.text)}</span>` : ''}`
        + `</span>`
        + `<i class="bx-gm-fx" aria-hidden="true"></i>`
        + `<span class="bx-gm-who"></span>`
        + `</span>`;
    };
    // Doppelte Sequenz: -50% Verschiebung = exakt eine Sequenz → nahtlose Schleife.
    const seq = list.map((it, i) => chip(it, i)).join('');
    // Die Streifen-Ebene blendet die Kacheln an den beiden Bandenden weich aus
    // (Maske) — vorher schnitten sie hart an der Kante ab.
    this.el.innerHTML = `<div class="bx-gm-band bx-gm-t-${this.tile} bx-gm-b-${this.banner}">`
      + `<div class="bx-gm-strip"><div class="bx-gm-track" style="--dur:${this.speed}s">${seq}${seq}</div></div></div>`;
    this.cards = [];
    this.dots = [];
    this.barEl = null;
  }

  // ── Daten ───────────────────────────────────────────────────────────────
  /** Gift-Bilder/Namen/Coins aus dem App-Katalog (nur offizielle Quelle:
   *  lokale Kopie unter /gift-img, sonst die TikTok-CDN-URL). */
  async loadCatalog() {
    try {
      const res = await fetch(`${this.ctx.baseUrl}/gift-catalog?token=${this.ctx.token}`);
      const cat = await res.json();
      for (const [slug, e] of Object.entries(cat || {})) {
        if (!e) continue;
        const key = giftKey(e.slug || slug);
        const url = e.iconFile
          ? `${this.ctx.baseUrl}/gift-img/${encodeURIComponent(e.iconFile)}?token=${this.ctx.token}`
          : (e.icon || '');
        if (url) this.icons[key] = url;
        this.meta[key] = { name: e.customName || e.slug || slug, coins: Number(e.coins) || 0 };
        const gid = Number(e.giftId) || 0;
        if (gid) {
          if (url) this.iconsById[gid] = url;
          this.metaById[gid] = { ...this.meta[key], key };
        }
      }
      // Namen/Coins können sich jetzt erst ergeben → neu aufbauen, dann Bilder.
      this.build();
      this.applyIcons();
    } catch { /* offline/alte App — Slug + Platzhalter reichen */ }
  }

  applyIcons() {
    for (const ic of this.el.querySelectorAll('.bx-gm-ic')) {
      const gid = Number(ic.dataset.gid) || 0;
      const url = this.icons[ic.dataset.key || ''] || (gid ? this.iconsById[gid] : '');
      if (!url) continue;
      const img = ic.querySelector('img');
      if (!img || img.getAttribute('src')) continue;
      img.onload = () => ic.classList.add('has-img');
      img.src = url;
    }
  }

  /** Einträge aus den Trigger-Regeln des Nutzers ableiten (falls die App die
   *  Regeln ausliefert). Schlägt das fehl, bleibt die manuelle Liste stehen. */
  async loadRules() {
    try {
      const res = await fetch(`${this.ctx.baseUrl}/trigger-rules?token=${this.ctx.token}`);
      if (!res.ok) return;
      const data = await res.json();
      const rules = Array.isArray(data) ? data : (data && Array.isArray(data.rules) ? data.rules : []);
      const items = itemsFromRules(rules);
      if (!items.length) return;
      this.items = items;
      this.demo = false;
      this.build();
      this.applyIcons();
    } catch { /* Route (noch) nicht vorhanden — manuelle Liste bleibt */ }
  }

  destroy() {
    if (this.rotTimer) clearInterval(this.rotTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.clearParticles();
    this.el.remove();
  }
}
