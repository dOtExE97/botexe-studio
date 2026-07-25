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
  font-size: calc(clamp(9px, min(6cqi, 5.2cqh), 34px) * var(--bx-fs, 1)); }

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
    this.rotTimer = null;
    this.icons = {};      // giftKey → Bild-URL
    this.iconsById = {};  // giftId  → Bild-URL
    this.meta = {};       // giftKey → { name, coins }
    this.metaById = {};   // giftId  → { name, coins, key }
    this.index = 0;

    if (props.accent) root.style.setProperty('--bx-accent', String(props.accent));
    this.mode = MODES.has(props.mode) ? props.mode : 'rotation';
    this.style = STYLES.has(props.style) ? props.style : 'karte';
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
    this.index = 0;
    const list = this.items.length ? this.items : [{ slug: '', text: 'Noch keine Geschenke eingetragen' }];
    this.list = list; // für die Zuordnung eintreffender Geschenke
    if (this.mode === 'leiste') this.buildBand(list);
    else this.buildRotation(list);
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
    for (const el of targets) {
      const badge = el.querySelector('.bx-gm-who');
      if (badge) badge.textContent = who ? `von ${who}` : '';
      // Neu anstoßen, auch wenn die Klasse noch hängt (Combo: 10x Rose).
      el.classList.remove('is-hit');
      void el.offsetWidth;
      el.classList.add('is-hit');
    }
    if (this.hitTimer) { clearTimeout(this.hitTimer); this.timers.delete(this.hitTimer); }
    this.hitTimer = setTimeout(() => {
      this.timers.delete(this.hitTimer);
      this.hitTimer = null;
      for (const el of this.el.querySelectorAll('.is-hit')) el.classList.remove('is-hit');
    }, 2600);
    this.timers.add(this.hitTimer);
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
      return `<span class="bx-gm-chip" data-idx="${i}">${this.iconHtml(it)}`
        + `<span class="bx-gm-txt">`
        + `<span class="bx-gm-line">`
        + `${name ? `<span class="bx-gm-name">${escapeHtml(name)}</span>` : ''}`
        + `${this.coinsHtml(it)}</span>`
        + `${it.text ? `<span class="bx-gm-act">${escapeHtml(it.text)}</span>` : ''}`
        + `</span></span>`;
    };
    // Doppelte Sequenz: -50% Verschiebung = exakt eine Sequenz → nahtlose Schleife.
    const seq = list.map((it, i) => chip(it, i)).join('');
    this.el.innerHTML = `<div class="bx-gm-band"><div class="bx-gm-track" style="--dur:${this.speed}s">${seq}${seq}</div></div>`;
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
    this.el.remove();
  }
}
