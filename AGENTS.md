# AGENTS.md — Bauanleitung für bOtExE Studio

Tool-neutrale Anleitung für KI-Coding-Agenten (Claude Code, Codex/ChatGPT, Cursor,
Gemini u.a.). Sie hält die teuer erkauften Fallstricke dieses Projekts fest, damit
sie nicht ein zweites Mal Stunden kosten. Sprache der Zusammenarbeit: **Deutsch**.

bOtExE Studio ist ein freier TikFinity-Ersatz für TikTok-Streamer (Electron + Vite +
TypeScript-Monorepo). Die **Endnutzer sind Streamer, keine Entwickler** — sie
beurteilen die App über Bilder und Verhalten, nicht über Code. Deshalb: bei
Unsicherheit einen Screenshot erzeugen und wirklich ansehen. **Nichts releasen,
solange der Maintainer es nicht ausdrücklich freigibt.**

## Aufbau

- `apps/desktop/` — Electron. Main-Prozess (`src/main/…`, `src/main.ts`), Renderer (React 19 + Tailwind, `src/renderer/…`).
- `packages/widget-kit/` — die ~44 Overlay-Widgets, je eine **Vanilla-ES-Modul-`.js`** (kein Framework, kein Build-Schritt). Dazu `widget-base.css` (gemeinsame Basis) und gebündelte `.woff2`-Schriften.
- `packages/overlay-engine/runtime/runtime.js` — lädt die Widgets im Overlay, verteilt Events, setzt pro Widget-Box die Design-Klassen und CSS-Variablen.
- `packages/trigger-engine/` — die Regeln „wenn Gift X → tu Y".

Das Overlay ist ein **iframe** — im Editor als Live-Vorschau, im Stream als
Browser-Quelle in OBS bzw. TikTok Live Studio (TTLS). Editor und echtes Overlay
nutzen **dieselbe** `runtime.js`: ein Fix dort greift an beiden Stellen.

## Ein Widget bauen oder ändern

Jedes Widget ist eine Klasse mit Default-Export:

```js
export default class MeinWidget {
  constructor(root, props, ctx) { /* root = die Box; ctx = {preview, baseUrl, token, playSound, ...} */ }
  onEvent(e) {}     // { type:'gift'|'follow'|'chat'|'like', user, gift, ... }
  onStats(s) {}     // { totals, topGifters, topLikers, ... }
  onSpotify(s) {}   // optional
  destroy() {}      // Timer/Observer/DOM aufräumen — Pflicht
}
```

- **`ctx.preview === true`**: das Widget MUSS von selbst plausible deutsche Demo-Daten zeigen. Sonst ist es im Editor eine leere Box und der Nutzer platziert blind. Häufigster Fehler: Widget bleibt bis zum ersten echten Event unsichtbar (`opacity:0`).
- Registriert wird ein Widget in **`apps/desktop/src/renderer/pages/widget-types.ts`** (`WIDGET_TYPES`): `type`, `label`, `desc` (in Erzähler-Form: was es dem Streamer bringt), `w/h`, Standard-`props`, `fields`. Die Einteilung der Palette liegt daneben in **`palette-gruppen.ts`**: Kategorie in `CATEGORY_OF`, verwandte Widgets in `RELATED_OF` (klappen in der schmalen Palette unter einem Anführer zusammen — in „Alle zeigen" nicht, dort steht bewusst jedes Widget einzeln). Wächter-Tests in `palette-gruppen.test.ts` halten das zusammen: jedes Widget hat eine Kategorie, Anführer und Varianten liegen im selben Reiter, „Alle zeigen" zeigt wirklich alles. Danach `npm run galerie` — `docs/widgets.md` wird daraus erzeugt.
- **Bestehende Overlays der Nutzer dürfen sich nie verändern.** Eine neue Optik ist ein NEUER Stil-Wert; der alte bleibt Standard. Widget-Typen werden nicht gelöscht — das zerreißt vorhandene Overlays; stattdessen in der Palette einklappen.
- **Eine Sperre (`running`/`spinning`/`busy`/`luckyRunning`) muss AUCH im Fehlerfall fallen.** Sie wird typisch vor einer Animations-/Abspielschleife gesetzt und nur am normalen Ende gelöscht — stolpert etwas dazwischen, ist das Widget für den Rest der Sitzung tot, und niemand sieht warum: Ein Wurf in einem `requestAnimationFrame`- oder Timer-Callback läuft an ALLEN try/catch der Runtime vorbei (die sichern nur `onEvent`/`onAction`/`onStats` ab). Also: Rumpf der Animationsschleife in try/catch, Sperre im Fehlerfall lösen, danach NICHT weiterplanen (sonst wirft jedes Folgebild erneut). Vorbild: `frame()` in `wheel.js`, `runLuckyDraw()` in `gift-menu.js`.
- **Nichts zeichnen/spawnen ohne vermessene Fläche.** Die Runtime mountet auch **ausgeblendete** Ebenen (`display:none`) und stellt ihnen alle Ereignisse zu. `getBoundingClientRect()` liefert dann 0, `resize()` steigt aus, und `this.w/h/radius` bleiben **undefiniert** → Canvas-Aufrufe rechnen mit `NaN`. Zwei belegte Folgen: `createLinearGradient`/`arc` werfen (siehe Sperre oben), oder es entstehen unsterbliche Objekte, die den Deckel füllen und das Widget dauerhaft blockieren. Muster: `if (!this.w || !this.h) { this.resize(); if (!this.w || !this.h) return; }` (so macht es `gift-jar.js`).

## CSS-Konventionen — hier sitzen die meisten Fallen

- **An der Box messen, nicht am Viewport.** Die Runtime setzt `container-type: size` auf die Widget-Box; Widgets messen mit `cq`-Einheiten. **FALLE:** ein Element kann seinen EIGENEN `container-type` nicht abfragen — stehen `container-type` UND eine `cq`-Einheit in DERSELBEN Regel, misst sie den Viewport statt der Box. (Dieser Fehler lähmte einmal 32 Widgets: Basisschrift ~27px statt ~15px, Inhalt lief aus der Box.) Also: `container-type` auf der Wurzel, `cq`-Einheiten in den KINDERN.
- **Textgrößen-Regler:** die Runtime setzt `--bx-fs` (Faktor, Standard 1). Jede Basisgröße als `calc(clamp(min, N cq…, max) * var(--bx-fs, 1))` — der Faktor gehört AUSSEN ums `clamp`, sonst deckelt die Obergrenze den Zuwachs weg.
- **Breite Widgets** (Laufbänder): `cqmin` misst die kurze Seite → winzig. Für Breit-Elemente `cqi`/`cqw`, für die Höhe `cqh`.
- **Akzentfarbe** `var(--bx-accent)`. Themes über `THEMES` in `runtime.js` (Bündel von CSS-Variablen). Schriften über `--bx-font-display` / `-body` / `-num` — **nie hart setzen**, sonst greift die Schriftart-Einstellung des Nutzers nicht (mit gewünschter Schrift als Fallback arbeiten).
- **`.bx-frameless`** („Rahmen ausblenden"): entfernt Panel-Hintergrund/Blur/Ränder für alle Widgets. **FALLE:** die globale Regel `.bx-frameless * { border-color: transparent !important }` löscht auch formtragende Ränder (Neonröhre, Kassenbon-Linien). Solche Stile holen ihren Rand mit `.bx-frameless .mein-stil { … !important }` zurück. Neue Stile immer AUCH im frameless-Zustand auf hellem Hintergrund prüfen.
- **`.bx-premium`** („Premium-Effekte", opt-in): gemeinsame Ebene in `widget-base.css` — mehr Tiefe, tabellarische Zahlen, langsames Atmen, Auslöser-Choreografie. Für den Auslöser setzt ein Widget nur die Klasse **`bx-hit`** (nach ~900ms per Timer entfernen; bei schnellen Folgen/Combos: entfernen → `void el.offsetWidth` → neu setzen). **FALLE:** `::before`/`::after` sind bei vielen Widgets schon belegt (Rahmen-Hairline, Lichtstreif) — der Premium-Ring läuft deshalb über `box-shadow`, nicht über ein Pseudo-Element.
- **Nur `transform` / `opacity` / `filter` / `scale` animieren** (GPU-compositet) — der TTLS-Browser ist schwach. Wo ein Element schon `translateY(-50%)` in `transform` trägt (z.B. zentrierte Karten), für den Puls `scale` statt `transform` benutzen.

## TikTok-Gift-Bilder

Kommen AUSSCHLIESSLICH aus dem App-Katalog (Route `/gift-catalog` → lokale Kopie unter
`/gift-img`, sonst die TikTok-CDN-URL). **Niemals ins Repo committen** — das ist
TikToks Copyright. Fehlt ein Bild (Normalfall bei neuen Gifts), ein generisches
Inline-SVG zeigen (Muster in `gift-alert.js`).
Zum lokalen Testen mit echten Bildern liegt `apps/desktop/src/renderer/lib/gift-master.json`
bei (Namen, Coin-Preise, CDN-URLs vieler Gifts). Die Bilder über einen SEPARATEN
lokalen HTTP-Server referenzieren, nie nach `packages/widget-kit/` kopieren.
Danach prüfen: `find . -name "*.webp" -not -path "./node_modules/*"` muss `0` liefern.
(`.gitignore` blockt `packages/widget-kit/_*` gegen versehentliche Testreste.)

## Symbole und Startbild (`apps/desktop/assets/`)

| Datei | Wofür | Wer liest sie |
|---|---|---|
| `icon.ico` | Windows-Programmsymbol, Installer | `forge.config.ts` (`packagerConfig.icon`, `setupIcon`) |
| `icon.png` | Fenster-/Taskleistensymbol (dev + Linux) | `main.ts` → `BrowserWindow({ icon })` |
| `tray-16.png` / `tray-32.png` | Infobereich, 100 %/200 % Bildschirmskalierung | `tray.ts#ladeSymbol` |
| `splash.jpg` | Startbild | `splash.ts` |

Der Ordner hängt in `extraResource` und landet im Paket unter `<Resources>/assets/` —
zur Laufzeit über `assetsDir()` in `main.ts` aufgelöst (gepackt vs. dev).

Zwei Fallen:
- **Das Tray-Symbol ist NICHT das verkleinerte Logo.** Bei 16 px verschwinden Verläufe,
  Schatten und 3D-Kanten zu Brei. Es ist eine eigene, flache Zeichnung in denselben
  Farben. Wer das Logo tauscht, muss die 16er-Fassung getrennt prüfen.
- **Das Startbild ist ein echtes Fenster.** Schließt es sich, bevor das Hauptfenster
  existiert, sinkt die Fensterzahl auf 0 und Electron würde die App beenden. Dagegen
  steht `darfBeenden()` in `lebenszyklus.ts` — dort NICHTS vereinfachen, ohne
  `lebenszyklus.test.ts` zu lesen.

## Geheimnisse in den Einstellungen

Eine Quelle für „was ist geheim": `SECRET_TOP_LEVEL_FIELDS` in `settings-store.ts`.
Die Liste steuert **drei** Dinge gleichzeitig — Export-Redigierung, Import-Filter und
seit v0.44 die Verschlüsselung auf der Platte (`secret-box.ts`, Electrons `safeStorage`).
Ein neues Geheimnis wird also nur dort eingetragen, nirgends sonst.

Merkpunkte:
- `secret-box.ts` importiert **bewusst kein `electron`** — nur so ist es unter `node:test`
  prüfbar. Der `SettingsStore` reicht die Krypto per Konstruktor herein.
- Ohne System-Schlüsselbund (Linux ohne Keyring, CI) bleibt alles im Klartext und die App
  läuft normal weiter. Lieber unverschlüsselt als eine App, die nicht startet.
- Scheitert das **Ent**schlüsseln (Datei von einem anderen Rechner), gehen NUR die
  Geheimnisse verloren — Layouts, Trigger und Punkte bleiben. Das ist der Fall, den
  `secret-box.test.ts` unter „Fremder Rechner" absichert.
- Der `SETTINGS_GET`-IPC-Handler ist eine **Deny**list: neue Felder gehen automatisch an
  den Renderer. Ein neues Geheimnis dort explizit löschen.

## Was TikTok liefert — bevor du suchst

`docs/tiktok-datenquellen.md` beantwortet „was könnte TikTok uns schicken, und
was nutzen wir davon?" — erzeugt aus dem Protokoll-Schema, dem Cloud-Router und
den Abos des Adapters. Neu erzeugen mit `npm run inventar` (nach jedem Update
von `tiktok-live-connector`).

Das ersetzt das Suchen von Hand: Die Antwort steht im Repo, nicht im Gedächtnis.
Im **Diagnose-Modus** ergänzt das Log zusätzlich, welche Felder in einem
konkreten Stream tatsächlich ankommen — Feldnamen, niemals Werte.

## Logging — was hineingehört und was nie

Die Endnutzer sind Streamer. Das Log ist für sie die einzige Antwort auf „warum
passiert nichts?" — also schreibt es in Alltagssprache, nennt die Ursache und den
nächsten Handgriff. `[ERROR] evaluate() returned []` hilft niemandem.

**Die Regel dahinter:** Überall, wo der Code bewusst etwas überspringt, filtert,
drosselt oder verwirft, gehört eine Zeile hin. Genau diese Stellen sind von außen
nicht von einem Defekt zu unterscheiden. (Eine Prüfung fand davon 88 Stück — siehe
dem Logging-Audit vom 31.07.2026 — die Belege stehen im CHANGELOG unter v0.46.0.)

**Drosseln ist Pflicht, nicht Kür.** Die nützlichsten Zeilen sitzen an den
heißesten Stellen (jedes Geschenk, jeder Frame). Ungedrosselt ersetzt die Kur die
Krankheit. Dafür gibt es **einen** Ort — `apps/desktop/src/main/core/logger.ts`:
- `log.einmal(schluessel, level, scope, text)` — genau einmal je Schlüssel
- `log.gedrosselt(schluessel, ms, level, scope, text)` — höchstens alle N ms
- `log.merkerZuruecksetzen(praefix)` — beim TikTok-Connect und in `resetSession()`,
  sonst bleibt ein behobenes Problem für den Rest des Abends stumm
Das Muster **nicht** von Hand nachbauen (es lag vor der Zusammenführung fünfmal
einzeln im Repo — genau daraus entstehen Abweichungen, die niemand mehr findet).

`log.debug` landet **nicht** in der Datei — außer im Diagnose-Modus
(Einstellungen → „Diagnose-Modus", 30 Min, läuft von allein aus; schaltet
zusätzlich alle Drosselungen durch). Je Logdatei gilt ein Deckel von 20 MB.

**Niemals ins Log:** Token, API-Keys, `sessionid`, `req.url`/`req.query` (der
Overlay-Token steht in der Query — `req.path` ist sicher), rohe Frames oder ganze
Fehler-/User-Objekte. Bei Fremdfehlern nur `.message`. Unkritisch sind
Geschenknamen, Nicknames, Dateinamen, Close-Codes, Profil-IDs und Origins.

## Screenshots (headless Chrome) — die drei Fallen

1. **KEIN `--disable-gpu`.** Das schaltet den Compositor ab, es entstehen nie Frames, `Page.captureScreenshot` hängt endlos. Stattdessen `--enable-unsafe-swiftshader` (Software-GL).
2. **`requestAnimationFrame` feuert headless NICHT.** Mess-/Injektions-Code in `rAF` läuft nie → das Bild bleibt byte-gleich. `setTimeout` nehmen (wird von `--virtual-time-budget` vorgespult).
3. **CSS-Animationen folgen `--virtual-time-budget` NICHT** (JS-Timer schon). Der Screenshot entsteht nach ~1s Echtzeit → CSS-animiertes steht am Anfang (Emojis Deckkraft 0, Klappziffern mitten im Dreh). Zum Einfrieren mitten im Ablauf: negatives `animation-delay` + `animation-play-state: paused`. Für Ruhezustände `* { animation: none; transition: none }` kurz vor der Aufnahme.

Bei leerem oder seltsamem Screenshot ZUERST das DOM zur Laufzeit auslesen
(Elementanzahl; `getComputedStyle`: Deckkraft, `animationName`, `fontSize`). Meistens
ist es eine dieser drei Fallen, kein Widget-Bug.

## An welchem Rechner kann ich arbeiten?

An jedem — das Repo ist selbsttragend. `AGENTS.md` (diese Datei), `CLAUDE.md`,
`CONTRIBUTING.md` und `.claude/skills/` liegen versioniert dabei, es gibt keine
Verweise auf Ordner, die nur auf einem Rechner existieren.

- **Node 24** ist Pflicht (`engines` in der Wurzel-`package.json`, `.nvmrc`
  liegt dabei) — die App läuft auf genau dieser Fassung, weil Electron 43 sie
  mitbringt. Mit `nvm use` ist man richtig.
- **Prüfen** (`lint`, `typecheck`, `test`, `widget-check`) läuft überall gleich,
  es ist reines Node.
- **Der Selbsttest** (`scripts/run-smoke.sh`) erkennt Linux und macOS selbst.
  Unter Linux braucht er `xvfb` (`sudo apt install xvfb`), unter macOS nicht.
- **Packen** (`npm run package`) baut immer für den Rechner, auf dem es läuft.
  Ein **Installationsprogramm** entsteht nur für Windows (Squirrel) — und das
  baut ohnehin die CI beim Tag-Push, also von jedem Rechner aus.
- **Was NICHT im Repo liegt und auch nicht hingehört:** Zugangsdaten und
  Einstellungen (die liegen im Benutzerordner der App), Gift-Bilder, Logdateien.

## Verifizieren — immer per Exit-Code, nie am getailten Text

```bash
npm run lint        > /tmp/l.log  2>&1; echo "lint=$?"
npm run typecheck   > /tmp/t.log  2>&1; echo "tc=$?"
npm test            > /tmp/te.log 2>&1; echo "test=$?"
npm run widget-check > /tmp/w.log 2>&1; echo "wc=$?"   # misst jedes Widget in 6 Boxgrößen; rot NUR bei sichtbarem Überstand
```

Alle müssen `0` sein. **`node --check <datei>` nach jeder `.js`-Änderung in
`widget-kit/`** — ESLint erfasst diese Dateien NICHT, ein Syntaxfehler (z.B. ein
Backtick in einem Kommentar INNERHALB des CSS-Template-Literals) rutscht sonst bis
ins Release durch.

CI-Status per `gh run view <id> --json conclusion --jq .conclusion` (nie am
getailten Log). Jobs: `quality-gate`, `smoke`, `widget-check`.

## Release (nur nach ausdrücklicher Freigabe)

1. Version in **beiden** `package.json` anheben (Repo-Wurzel + `apps/desktop`).
2. `CHANGELOG.md` — was der NUTZER merkt, in seiner Sprache; die Ursache nennen, nicht nur „behoben".
3. `npm --prefix apps/desktop run package` → `package=0`.
4. `SKIP_BUILD=1 bash apps/desktop/scripts/run-smoke.sh` → `smoke=0` (headless Durchklick aller Seiten + API-Selbsttest).
5. Commit über eine Datei (`git commit -F <datei>`), weil Umlaute/Klammern in der Message die Shell brechen.
6. `git tag vX.Y.Z && git push origin HEAD:main --tags`.
7. Auf CI **und** den `Windows Build` warten (`gh run list`), beide grün. Ein roter **Dependabot**-Lauf (`@electron/fuses` ERESOLVE) gehört nicht zum eigenen Commit — nicht damit verwechseln.

## Arbeitsweise

- Erst Beweis, dann Fix — nie raten. Irreführende Logs oder Screenshots ernst nehmen; bei „wirkt zufällig" früh prüfen, ob eine Nutzer-Einstellung die Ursache ist.
- Selbst gerenderte Screenshots WIRKLICH ansehen, bevor man „fertig" meldet. Berichte von Unter-Agenten gegenprüfen, nicht blind übernehmen.
- Bei klarem Auftrag durchziehen (bauen, testen, prüfen), nicht bei jedem Schritt rückfragen — aber **nicht releasen ohne Freigabe**.
- Keine geheimen Werte (API-Keys, Tokens, Zugangsdaten, private Pfade) in Code, Logs, Commits oder in den Export-Bundle schreiben.
