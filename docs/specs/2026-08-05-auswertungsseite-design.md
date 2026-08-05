# Auswertungsseite — verbindliches Design-Spec

**Stand:** 05.08.2026 · **Ersetzt:** `apps/desktop/src/renderer/pages/AnalysePage.tsx` (559 Zeilen)
**Gilt für:** die Seite „Auswertung" der Desktop-App. Nicht für Live-Seite, Zuschauer-Seite, Galerie.

---

## 1 · Die eine Idee

Diese Seite stellt **einen Abend gegen deine anderen**. Sie zeigt keinen Zeitraum und keine
Summenübersicht, sondern beantwortet die einzige Frage, mit der man eine Auswertung öffnet:
war das gut — für meine Verhältnisse? Alles auf der Seite ist als Abweichung von einer
sichtbaren Nulllinie gebaut: die Schlagzeile, die Vergleichszeilen, der Verlauf. Deshalb
funktioniert die Seite **ab dem zweiten Stream**, denn ein Vergleich braucht genau zwei
Datenpunkte, nicht fünfzig.

### Warum dieser Blickwinkel gewonnen hat

Es standen vier Entwürfe zur Wahl: eine Chronik des Abends („Spielbericht"), ein
Urteil-mit-Beweis („Das Urteil"), eine Gästeliste („Zehn Namen") und diese Gegenüberstellung.
Die Entscheidung fiel an der Datenlage, nicht am Geschmack:

* **Pro Abend dauerhaft gespeichert** ist ausschließlich `StatsHistoryEntry`
  (`main/services/stats-history.ts:16-24`) — Summen plus `startedAt`/`durationMin`. Diese
  Einträge existieren für **jeden** Abend, überleben jeden Neustart und sind vollständig.
* **Pro Abend NICHT gespeichert** sind Menschen und Momente. `topGifters`, `topGift`,
  `topStreak` leben nur in `SessionStats` (`main/core/session-stats.ts:102-114`) und werden
  beim nächsten Connect von `resetSession()` gelöscht (`studio.ts:2396`). `firstSeen` und
  `firstSenderAt` sind **Lebenszeit**-Erstereignisse, keine Abend-Ereignisse — ein Kanal im
  sechsten Monat erzeugt davon an einem Abend null.

Eine Seite, deren Herzstück ein Minutenprotokoll (Spielbericht) oder eine Gästeliste
(Zehn Namen) ist, wird also **dünner, je länger jemand die App benutzt** — und ist bei
fehlendem `startedAt` gar nicht aufspannbar. Das ist die eine Sorte Fehler, die der Auftrag
ausdrücklich ausschließt: „Ein Entwurf, der Daten voraussetzt, die es nicht gibt, ist wertlos."

Die Gegenüberstellung steht dagegen auf dem einzigen vollständigen Datensatz der App. Die
besten Ideen der anderen drei werden eingepflanzt, aber nur dort, wo sie den Vergleich
**stützen**: die Menschen als Beleg für einen Abend (statt als Trophäenschrank), der
Nachtstreifen als Antwort auf „wann lohnt es sich" (statt als zweite Chronologie), die
Schlagzeile in Lilita One als Träger einer Aussage (statt einer Summe).

---

## 2 · Aufbau von oben nach unten

Grundmaße: Der Inhalt liegt in `max-width: 940px`, linksbündig, `padding: 32px 24px 64px`.
Die App-Mindestbreite ist 960 px (`main.ts:275`), die Seitenleiste 208 px (`App.tsx:186`) —
**verfügbar sind also im schlechtesten Fall 704 px**. Alle Raster arbeiten deshalb mit
`minmax()`, nie mit festen Pixelspalten. Das ist keine Kür: die heutige Seite kann das
(`auto-fit`), und ein Entwurf, der bei 704 px bricht, ist eine Verschlechterung.

**Kein einziges `.bx-card` auf dieser Seite.** Begründung unter Abschnitt 4.

### 2.1 Kopfzeile — welcher Abend, welche Messlatte

**Zeigt:** Links Avatar 24 px rund und Name aus `getDiagnostics()` → `hostAvatar` /
`hostNickname` (`studio.ts:1743-1744`), daneben die Kennung des **bewerteten** Abends aus dem
gewählten `StatsHistoryEntry`:

| Lage | Text |
| --- | --- |
| `startedAt` + `durationMin` vorhanden | `FREITAG, 01. AUGUST · 19:40–22:20 · 2 H 40 MIN` |
| nur `at` | `ZULETZT AKTIV AM FREITAG, 01. AUGUST` |
| Stream läuft | `LÄUFT GERADE` |

Rechts der **Messlatten-Umschalter** mit drei Optionen: `DIE 5 DAVOR` · `30 TAGE` · `ALLE`.
Er wählt die **Vergleichsgruppe**, nicht einen Summenzeitraum. Optionen, die dieselbe Gruppe
ergäben, werden nicht gerendert; ergeben alle dieselbe Gruppe, entfällt der Umschalter ganz.
Bei nur einem Vergleichsabend heißt die erste Option `DER DAVOR`.

**Sieht aus:** Eine Zeile, 34 px hoch, `display:flex; justify-content:space-between`.
Kicker in `.bx-kicker` (Lilita One 11 px, `letter-spacing:.32em`, versal,
`--color-studio-muted`). Umschalter: drei Textknöpfe, 11 px versal, `letter-spacing:.14em`,
**kein Rahmen, keine Füllung** — aktiv = `--color-studio-text` mit 2 px Unterstrich in
`--color-studio-text`, inaktiv = `--color-studio-muted`. `aria-pressed` gesetzt, Fokusring
2 px `--color-studio-accent` mit 2 px Offset. Darunter eine 1-px-Haarlinie in
`rgba(38,42,54,.55)`, deren rechte 96 px als 3-px-Block mit `.clip-slant` abgeschrägt sind —
das ist das Hausmotiv, das auf dieser Seite die Rolle des Kartenrahmens übernimmt.
Darunter, nur wenn der Umschalter da ist, 11 px `--color-studio-muted`:
„Verglichen wird immer derselbe Abend — nur die Messlatte wechselt." 40 px Abstand nach unten.

**Beantwortet:** Über welchen Abend reden wir, und wogegen halte ich ihn? Ohne diese zwei
Angaben ist jede Differenz weiter unten unlesbar.

**Was ersatzlos wegfällt:** der Gruß „Guten Abend, alex" samt 44-px-Profilbild
(`AnalysePage.tsx:141-153`), das `BarChart3`-Icon und der Methodik-Absatz über
Durchschnittsbildung (`:155-158`). Ein Gruß ist auf einer Seite mit genau einer Aussage eine
konkurrierende Aussage, und das Profilbild wäre nach der Schlagzeile das zweitgrößte Objekt.
Der methodische Vorbehalt wandert dorthin, wo er gebraucht wird: in die Fußzeile.

### 2.2 Das Urteil — die Schlagzeile

**Zeigt:** drei Zeilen. Schlagzeile, Belegsatz, Maßstab-Zeile.

Die Schlagzeile kommt aus einer neuen reinen Funktion `schlagzeile()` in `shared/analyse.ts`
— deterministisch, nie zufällig, unit-testbar. Regeln in dieser Reihenfolge, die erste
zutreffende gewinnt (`n` = Größe der Vergleichsgruppe, `basis` = Messlatte im gewählten Maßstab):

| # | Bedingung | Schlagzeile |
| --- | --- | --- |
| 1 | Stream läuft, keine Abende mit `durationMin` | `LÄUFT GERADE` |
| 2 | Stream läuft, Dauer-Daten vorhanden | `SCHNELLER ALS SONST` / `RUHIGER UNTERWEGS` (Tempo gegen Tempo) |
| 3 | `n === 0` | `DEIN ERSTER ABEND` |
| 4 | `basis < PROZENT_AB` | Themenwechsel — siehe unten |
| 5 | `n === 1` | `BESSER ALS DIENSTAG` / `RUHIGER ALS DIENSTAG` / `WIE DIENSTAG, UNGEFÄHR` |
| 6 | `n` 2–3 | `BESSER ALS DIE ZWEI DAVOR` / `RUHIGER ALS …` / `MITTENDRIN` |
| 7 | `n ≥ 4`, Bestwert der **gesamten** Historie | `DEIN BESTER ABEND ÜBERHAUPT` |
| 8 | `n ≥ 4`, Bestwert seit x Wochen | `STÄRKSTER ABEND SEIT SECHS WOCHEN` |
| 9 | `n ≥ 4` | aus `urteil().art`: `DEUTLICH ÜBER DEINEM NORMALWERT` / `RUHIGER ABEND` / `GANZ NORMALER ABEND` |

**Regel 4 ist die wichtigste Einzelentscheidung des Specs.** Liegt die Messlatte unter
`PROZENT_AB` (= 10), darf die Schlagzeile nicht über diese Kennzahl reden — sonst steht bei
einem Coin gegen zwei in 56 px „RUHIGER ALS DIENSTAG". Stattdessen **wechselt die Schlagzeile
das Thema** auf die Zeile der Gegenüberstellung mit dem stärksten belastbaren Ausschlag
(Messlatte ≥ `PROZENT_AB`): „SO VIEL GEREDET WIE NIE". Gibt es auch die nicht, greift
Regel 3/5/6 mit absoluten Worten statt Prozent.

**Sieht aus:** Kein Rahmen, kein Hintergrund, kein Blur, kein Icon.
Schlagzeile: `font-family: var(--font-display)`, `clamp(30px, 4.4vw, 56px)`,
`line-height:.92`, `text-transform:uppercase`, `letter-spacing:.005em`,
`color: var(--color-studio-text)`, `max-width:16ch` (bricht lieber zweizeilig um als zu
schrumpfen). **Die Schlagzeile ist bei JEDEM Urteil weiß** — auch bei „RUHIGER ABEND".
Orangerot bedeutet auf dieser Seite ausschließlich „das ist der bewertete Abend", nie
„schlecht". Damit ist der Ist-Fehler behoben, dass `text-studio-accent` heute gleichzeitig
Alarm (`:196`, `:234-235`) und Balkenfarbe (`:533`) ist.

Links am Schlagzeilenblock sitzt eine 3 px breite, blockhohe Kante in
`--color-studio-accent` mit `border-radius:2px` und 20 px Abstand zum Text. Das ist die
einzige Akzentfläche des ersten Bildschirms und zugleich die Wiedererkennung zur Live-Seite —
sie ersetzt den Kartenrahmen, ohne einen Blur zu kosten.

Belegsatz: `var(--font-chunky)` (Baloo 2) 17 px / `line-height:1.5`,
`color: var(--color-studio-text)` bei 90 %, `max-width:62ch`, 14 px Abstand. Die Zahlen darin
in `var(--font-mono)` 15 px, volle Textfarbe. Baloo 2 trägt hier bewusst Fließtext und nicht
nur eine Tabellenspalte — sonst hätte die Seite genau ein Element in der Hausschrift und
sähe aus wie ein Geschäftsbericht.

Maßstab-Zeile: 12 px, `--color-studio-muted`, 12 px Abstand, mit einem unterstrichenen
Textlink zum Umschalten (`text-decoration: underline; text-underline-offset: 3px`).

Abschluss: dieselbe Haarlinie mit abgeschrägtem Block wie in 2.1, 38 px darüber.

**Beantwortet:** „War das gut?" — als Erstes und als Größtes. Heute steht die Antwort (der
Satz aus `urteil()`) in `text-sm` neben einer `text-3xl`-Zahl, also ein Zehntel so groß wie
ihr eigener Beleg. Hier ist die Reihenfolge umgedreht: der Satz ist die Seite, die Zahl
belegt ihn.

#### Der Maßstab — einmal gewählt, über die ganze Historie

`urteil()` rechnet heute fest auf Coins. Bei zehn Zuschauern hängen Coins an einem einzigen
Menschen, und die Seite stünde dauerhaft auf „ruhiger Abend". Deshalb wählt die Seite ihre
Leitkennzahl **einmal, ergebnisunabhängig, über ALLE aufgezeichneten Abende** — nicht pro
Zeitraum:

> Maßstab = **Coins**, wenn mindestens die Hälfte aller Abende `coins > 0` hatte **und** der
> Coin-Normalwert über alle Abende ≥ `PROZENT_AB` liegt. Sonst Maßstab = **Kommentare** (`chats`).

Die Regel schaut nur darauf, wie oft Geschenke überhaupt vorkommen, nie darauf, ob heute gut
war — sie ist also nicht in Richtung Lob manipulierbar. Und weil sie über die gesamte
Historie entscheidet, kann der Messlatten-Umschalter niemals das Urteil kippen. (Ein
Umschalter, der laut Beschriftung nur die Vergleichsgruppe wechselt, aber die Schlagzeile
umdreht, würde den einen Satz entwerten, auf dem die ganze Seite steht.)

Die Maßstab-Zeile sagt es **vorwärts**, nie als Defizit-Bescheid:

> „Gemessen wird bei dir an Kommentaren — da ist genug los, dass ein Vergleich was taugt.
> Die Coins stehen weiter unten mit drin. [an Coins messen]"

Nicht: „Geschenke kommen bei dir zu selten, um daraus was abzulesen." Gleiche Information,
kein Stich.

### 2.3 Die Gegenüberstellung — divergierende Zeilen

**Zeigt:** höchstens acht Zeilen in fester Reihenfolge; die Reihenfolge ist die Argumentation.
Datenquelle ist der gewählte `StatsHistoryEntry` gegen den Median der Vergleichsgruppe.

Immer: **Coins · Neue Follower · Kommentare · Leute im Raum (`uniqueViewers`) ·
Meiste gleichzeitig (`peakViewers`) · Geschenke.**
Angehängt, nur wenn dieser Abend **oder** die Messlatte > 0 ist: Geteilt (`shares`),
Neue Superfans (`superfans`), Verlängerungen (`subs`).
Nicht hier, sondern in der Fußzeile: Likes, Emotes, Truhen, Unsichtbar.

Je Zeile vier Spalten: Label · Wert dieses Abends · Bahn mit der Abweichung · Differenz in Worten.

**Sieht aus:**
`grid-template-columns: minmax(112px,168px) minmax(56px,76px) minmax(140px,1fr) minmax(140px,200px)`,
`gap: 12px`, Zeilenhöhe 44 px, zwischen den Zeilen 1 px `rgba(38,42,54,.7)`. Unter 620 px
Containerbreite fällt Spalte 3 weg und die Differenz rutscht unter den Wert — die
Argumentation bleibt lesbar, nur das Bild geht.

* **Spalte 1 Label:** 13 px, `--color-studio-muted`.
* **Spalte 2 Wert:** 20 px `var(--font-chunky)`, `--color-studio-text`, rechtsbündig,
  `font-variant-numeric: tabular-nums`.
* **Spalte 3 Bahn:** `border-radius:2px`. Mittig eine 1 px Senkrechte in
  `--color-studio-border`, die 6 px über und unter die Bahn hinausragt — das ist die
  Messlatte. Dahinter das **Normalband**: ein Rechteck über ±25 % der Messlatte in
  `rgba(255,255,255,.045)`.
* **Spalte 4 Differenz**, zweizeilig: Zeile 1 12 px in `--color-studio-teal` bzw.
  `--color-studio-muted`, Zeile 2 10 px `var(--font-mono)` `--color-studio-muted` mit dem
  Bezugswert.

Der Balken wächst aus der Mitte: nach **rechts** in `--color-studio-teal` bei 85 % Deckkraft,
wenn mehr; nach **links** in `#a6abbe` bei 30 % Deckkraft, wenn weniger. Grau, nicht
orangerot — „weniger" ist kein Alarm.

**Die Bahnhöhe kodiert die Belastbarkeit der Aussage** — das ist die Regel, die den kleinen
Zustand rettet:

| Messlatte dieser Zeile | Bahn | Text |
| --- | --- | --- |
| `= 0` | **kein Balken** | „das erste Mal überhaupt" bzw. „auch sonst keine" |
| `1 … 9` (unter `PROZENT_AB`) | 4 px hoch | absolut: „1 Geschenk mehr als sonst" · „sonst 2" |
| `≥ 10` | 10 px hoch | Prozent erlaubt: „+43 % gegenüber sonst" · „sonst 28" |

Ohne Bezugswert gibt es nichts zu vergleichen — deshalb bei Messlatte 0 kein Balken, sondern
nur der wahre Satz. Und ein dünner Balken bei dünner Datenlage ist eine ehrliche Grafik: man
sieht der Zeile an, wie viel sie wiegt.

Balkenlänge = `min(1, |wert − basis| / max(basis,1)) × (Bahnbreite/2 − 4)`. Eine Verdopplung
füllt die rechte Hälfte, Null die linke.

Über der ersten Zeile einmalig 10 px `--color-studio-muted`: „der graue Bereich heißt: wie
immer (±25 %)". Bei `n === 1` heißt es in Spalte 4 nicht „als sonst", sondern „als am
Dienstag" — bei einem einzigen Vergleichsabend darf der einen Namen haben.

Dieser Block ist **die einzige Fläche im oberen Seitendrittel**: `background:
var(--color-studio-panel)` (#14161e, volldeckend), `border: 1px solid
var(--color-studio-border)`, `border-radius: 12px`, obere linke Ecke über `.clip-slant-r`
abgeschrägt, `padding: 18px 20px`. **Kein `backdrop-filter`, kein `box-shadow`, kein
Verlauf.** Damit gehört die Seite sichtbar zur App, ohne eine einzige Glas-Ebene.

**Beantwortet:** „besser oder schlechter — worin genau?" Sechs Antworten auf **derselben**
Achse mit sichtbarem Nullpunkt. Das ersetzt die 14 gleich großen Kacheln
(`AnalysePage.tsx:244-284`) durch Small Multiples mit gemeinsamer Skala. Jede Zahl trägt
ihren Bezug am Körper, und bei drei Geschenken steht dort ein wahrer Satz statt „+50 %".

### 2.4 Die Reihe — der Verlauf gegen die Nulllinie, anklickbar

**Zeigt:** alle Abende der Vergleichsgruppe plus den bewerteten, chronologisch. Nicht die
absolute Höhe, sondern die **Abweichung vom Normalwert** der Gruppe — derselbe Wert, mit dem
die Schlagzeile rechnet.

**Sieht aus:** volle Breite, 132 px hoch, kein Rahmen, kein Hintergrund.

* Waagerechte 1-px-Nulllinie auf halber Höhe in `--color-studio-border`, links **auf der
  Linie sitzend** beschriftet: 10 px `var(--font-mono)` `--color-studio-muted`
  „dein Normalwert: 1.240". Genau die Skala, die dem heutigen Balkendiagramm fehlt
  (`:523-559`: kein Nullpunkt, keine Achse, keine Beschriftung).
* Dasselbe ±25-%-Normalband wie in 2.3, rechts einmal beschriftet „±25 % = ganz normal".
  Das Band wird nur gezeichnet, wenn der Normalwert ≥ `PROZENT_AB` ist.
* Je Abend eine Senkrechte, `flex:1`, `gap:3px`, `min-width:6px`, `max-width:26px`; nach
  **oben** in `--color-studio-teal` bei 70 %, wenn über dem Normalwert, nach **unten** in
  `#a6abbe` bei 28 %, wenn darunter.
  Höhe = `|wert − normal| / spanne × 52px`, wobei `spanne` = größte Abweichung aller
  gezeigten Abende, mindestens 1. **Nicht** `/ max(normal,1)` — sonst steht bei Normalwert 0
  jeder Abend mit einem Coin auf Vollhöhe, und die Grafik widerspricht der Schlagzeile.
* **Der bewertete Abend:** 6 px hohe Unterstreichung in `--color-studio-accent` direkt unter
  seiner Säule, mit `.clip-slant` abgeschrägt, darunter sein Datum in 11 px
  `--color-studio-accent-soft` (#ff8a3d, wegen Lesbarkeit auf #0c0d12). Das sind die einzigen
  Akzentstellen der Grafik.
* **Gold kommt auf der ganzen Seite genau hier vor, an genau einer Säule:** der Bestwert der
  Gruppe bekommt eine 1 px Kappe in `--color-studio-gold` und darüber 10 px Gold „Bestwert" —
  aber **erst ab `URTEIL_AB` Abenden in der Gruppe**. Bei zwei Abenden ist keiner „der beste",
  das wäre ein Münzwurf. Ist der bewertete Abend zugleich der Bestwert, entfällt die
  Doppelung und das Akzentlabel lautet „Fr 01.08. · dein Bestwert" in Gold.
* Unter der Achse nur drei Beschriftungen: erster Termin links, bei ≥ 7 Abenden eine Mitte,
  der bewertete rechts.
* Jede Säule ist ein `<button>` mit
  `aria-label="Freitag 01.08.: 1.640 Coins, 38 % über deinem Normalwert"` — Werte stecken nie
  nur im `title`. Das Klickziel ist ein unsichtbarer, volle Höhe hoher Streifen um die Säule
  (Padding statt schmalem Button), damit 6-px-Säulen bedienbar bleiben. Klick wählt diesen
  Abend: die ganze Seite rechnet neu, Vergleichsgruppe = die N Abende **davor**.
  Pfeiltasten links/rechts verschieben die Auswahl, Fokusring 2 px `--color-studio-accent`.
* Ist ein vergangener Abend gewählt, erscheint über der Reihe ein 11-px-Textknopf
  „zurück zum letzten Abend".
* Ab 60 Abenden werden die letzten 60 gezeigt **und es steht dran**: 10 px
  `--color-studio-muted`, „die letzten 60 von 137 — die Messlatte rechnet mit allen 137".
  Heute rechnet `max` über alle Streams, gezeigt werden aber nur 40 (`:524`/`:527`), ohne
  einen Hinweis.

**Beantwortet:** „War das eine Ausnahme oder normal?" — als Form. Man sieht auf einen Blick,
wie viele Abende über und unter der Linie liegen. Und die Klickbarkeit macht endlich den
Weg zu **einem** Stream auf, den es heute strukturell nicht gibt: 2000 Einträge in der
Historie, 40 sichtbare Balken, Werte nur im Browser-Tooltip.

### 2.5 Woran es lag — höchstens drei Sätze

**Zeigt:** generierte Sätze in fester Prüfreihenfolge, jeder nur wenn seine Daten vorliegen
und seine Schwelle hält. Alle Zahlen stehen im Satz und sind damit nachprüfbar.

| # | Braucht | Schwelle | Beispiel |
| --- | --- | --- | --- |
| R1 | `studio.stats.topGifters` (laufender/letzter Abend) | Abend-Coins ≥ 100 **und** ≥ 2 Geber | „Von deinen 4.200 Coins kamen 81 % von marie_x. Ein Mensch hat den Abend getragen — schön, aber das lässt sich nicht planen." |
| R2 | `durationMin` hier und in der Gruppe | Differenz ≥ 20 min | „Du warst 70 min länger live als sonst und hattest trotzdem weniger pro Stunde (310 statt 420). Die Extrazeit hat nichts gebracht." |
| R3 | `chats`, `uniqueViewers` | Abweichung ≥ 25 %, Messlatte ≥ `PROZENT_AB` | „Jeder, der da war, hat im Schnitt 4,5 Kommentare geschrieben statt 2,4. Es war gesprächiger als sonst — auch ohne Geschenke." |
| R4 | `follows` vs. Maßstab | beide Messlatten ≥ `PROZENT_AB` | „Coins waren weniger, Follower nicht: 3 neue, sonst 1. Der Abend hat dir Leute gebracht, kein Geld." |
| R5 | `studio.stats.topGift` | Anteil ≥ 50 % **und** ≥ 100 Coins | „Der Löwe von tom_ war allein 2.400 Coins — mehr als die Hälfte des Abends." |
| R6 | — | Rückfall | „Die Zahlen liegen dicht beieinander — an diesem Abend gab es keinen Ausreißer, der ihn erklärt." |

Die absoluten Böden bei R1 und R5 sind Pflicht: „Von deinem 1 Coin kamen 100 % von marie_x"
wäre kein Befund, sondern Hohn. Geschenknamen kommen über
`giftDisplayName(slug, 'de', customName)` (`shared/gift-names-de.ts:208`), nie als roher Slug
wie heute in `:426`.

**Sieht aus:** Kicker `.bx-kicker` „WORAN ES LAG", darunter die Sätze mit 16 px Abstand. Je
Satz links eine 3 px breite, zeilenhohe Senkrechte mit `border-radius:2px` —
`--color-studio-teal`, wenn der Befund für den Abend spricht, `#a6abbe` bei 30 %, wenn
dagegen; 14 px Abstand zum Text. Text Segoe 15 px / `line-height:1.6`,
`--color-studio-text` bei 88 %, `max-width:64ch`; Zahlen darin in `var(--font-mono)` 13 px in
der Farbe der Senkrechten. Keine Icons, keine Emoji, keine Karte.

**Beantwortet:** „Besser oder schlechter" ist die halbe Frage — „woran lag es" ist die
andere. R1, R2 und R3 sind genau bei zehn Zuschauern aussagekräftig, weil sie Anteile und
Pro-Kopf-Werte betrachten statt Summen.

### 2.6 Deine Leute an diesem Abend

**Zeigt:** die Menschen, die an dem bewerteten Abend da waren — mit Gesicht, Name und genau
einem Wert. **Nur für den laufenden und den zuletzt beendeten Abend**, und das steht in der
Überschrift, nicht in einer 10-px-Fußnote.

Zwei Quellen, in dieser Reihenfolge:

1. **`studio.stats`** (laufend / gerade beendet): bis zu 5 aus `topGifters`, dazu bis zu 3
   aus `topLikers`, die nicht schon dabei sind. Werte: Coins bzw. Likes.
2. **`window.studio.listViewers('')`** gefiltert auf `lastSeen >= letzterAbend.startedAt`
   (bzw. `at − durationMin·60000`): so lässt sich „wer war gestern Abend da" **ohne neue
   IPC und ohne Session-Snapshot** rekonstruieren. Sortiert nach `coins`, dann `totalChats`.
   Diese Quelle überlebt jeden App-Neustart — die erste nicht (siehe Abschnitt 7).

Je Person: Avatar 40 px rund, darunter Name 12 px auf 72 px abgeschnitten
(`text-overflow: ellipsis`), darunter der Wert 11 px `var(--font-mono)`
`--color-studio-muted`. Bei `teamLevel > 0` steht „Team 3" als **Wort** dabei — kein 💜 wie
heute in `:447`. Der oberste bekommt als Einziger einen 2 px Ring in `--color-studio-border`
bei voller Deckkraft; kein Gold, kein Akzent — Gold gehört der Reihe.

**Fehlendes Bild:** ein Kreis in `--color-studio-raised` mit dem Anfangsbuchstaben in
Lilita One 16 px `--color-studio-muted`. Dafür braucht es ein `Gesicht`-Bauteil mit
`onError`-Umschaltung. Das gibt es heute **nirgends** im Renderer, und TikToks CDN-URLs in
`PointsEntry.profilePic` verfallen — ohne dieses Bauteil kann die Reihe als Reihe grauer
Kreise enden.

Überschrift `.bx-kicker`: `WER AN DEM ABEND DA WAR` bzw., wenn ein älterer Abend gewählt ist,
entfällt der Abschnitt **komplett** — kein leerer Kasten, keine Ersatz-Lebenszeitliste. Statt
dessen steht dann eine einzige 12-px-Zeile in `--color-studio-muted`:
„Von diesem Abend habe ich keine Namen mehr — die hebt die App bisher nur vom letzten auf."

Gibt es niemanden: „Heute war niemand da, den ich mit Namen kenne — sobald jemand schreibt
oder etwas schickt, steht er hier."

**Beantwortet:** „an wem lag es?" Das ist der Teil, der bei zehn Zuschauern **besser**
funktioniert als bei 500 und damit die direkte Antwort auf die harte Randbedingung.
„Reichweite 47" sagt einem kleinen Streamer nichts, „Kaya war da, 30 Coins" sagt ihm alles.
Und es rettet Daten, die die App heute wegwirft: `topGifters` und `topGift` sind die
reichsten Daten, die die App je hat, und niemand zeigt sie.

**Wichtig zur Abgrenzung:** Das ist eine **Belegzeile für diesen Abend**, keine Bestenliste
über die Lebenszeit. „Deine Top-Geschenke" und „Deine Leute" (heute `:417-458`) fallen
ersatzlos weg — siehe Abschnitt 6.

### 2.7 Wann es bei dir läuft

**Zeigt:** eine Grafik plus zwei Sätze. Ersetzt die drei Karten „Starke Wochentage",
„Beste Sendezeit" und „Coins pro Stunde".

**Der Nachtstreifen.** Eine waagerechte Achse von **12:00 bis 12:00** — nicht 0–24, sonst
zerschneidet sie jeden Stream über Mitternacht, und TikTok-Streamer sind zu genau diesen
Uhrzeiten live. Beschriftung alle vier Stunden: `12 · 16 · 20 · 0 · 4 · 8 · 12`. Eine Zeile
je Abend **mit** Stream (leere Tage bekommen keine Zeile). Jeder Abend ein Segment:
`left = ((startStunde − 12 + 24) % 24) / 24`, `width = durationMin / 1440`.

Ein Objekt kodiert damit drei Werte: **wann**, **wie lange**, und über die Füllung **wie es
lief** — `--color-studio-teal` bei 55 %, wenn über dem Normalwert, `#a6abbe` bei 30 %, wenn
darunter, und `#3a4052`, wenn innerhalb des ±25-%-Bands. Damit ist der Streifen keine zweite
Chronologie neben der Reihe, sondern dieselbe Aussage auf einer **anderen Achse**: die Reihe
fragt „wann in deiner Geschichte", der Streifen fragt „wann in der Nacht".

Zeilenhöhe 20 px, Segment 12 px hoch, `border-radius:2px`, `min-width:8px`. 64 px
Datums-Gutter links, `var(--font-mono)` 10 px `--color-studio-muted` („Fr 01.08."). Der
gewählte Abend bekommt einen 1 px Rahmen in `--color-studio-text`. Jedes Segment ist ein
`<button>` mit `aria-label` und wählt denselben Abend wie die Reihe.

**Sichtbarkeitsregel:** Der Streifen erscheint **erst ab vier Abenden mit bekanntem
`startedAt`**. Darunter wäre er eine volle Achse mit sieben Beschriftungen über einem
einzigen 8-px-Strich — 99 % gestaltete Leere, die nichts zeigt. Und die Achse spannt nur den
**belegten** Ausschnitt der Nacht: `achsenStart = früheste Startstunde − 1 h`,
`achsenEnde = späteste Endstunde + 1 h`, mindestens sechs Stunden breit. Bei drei Abenden
zwischen 19 und 23 Uhr ist die Achse also 18–00 Uhr breit, nicht 12–12. Erst ab ~10 Abenden
mit gestreuten Startzeiten wird auf die volle Nachtachse umgestellt.
Ab 28 Zeilen wird auf Kalenderwochen-Zeilen umgestellt (mehrere Segmente je Zeile), ab 40
Zeilen sinkt die Zeilenhöhe auf 10 px und das Gutter beschriftet nur jede vierte Woche.
Abende ohne `startedAt`/`durationMin` landen in einer eigenen Zeile ganz unten,
„Ohne Uhrzeit aufgezeichnet", als gleich breite 10-px-Kästchen.

**Die zwei Sätze**, jeder nur wenn belegt (`besteWochentage()` und `besteSendezeiten()`
verlangen schon heute je ≥ 2 Streams — `analyse.ts:102`/`:168`):

> „Deine Freitage bringen im Schnitt 1.640 Coins, deine Sonntage 410. Wenn du wählen kannst: Freitag."
> „Wenn du zwischen 20 und 22 Uhr angefangen hast, lief es besser — 1.480 gegen 690."

15 px, `--color-studio-text` bei 85 %, `max-width:62ch`, Zahlen in `var(--font-mono)` 13 px.
Dazu `coinsProStunde()` als dritte Zeile: „Unterm Strich 890 Coins je Stunde, aus 7 Abenden
mit bekannter Dauer."

Greift keine Regel, wird der ganze Abschnitt **nicht gerendert** — die Erwartung steht
stattdessen als eine Zeile in der Fußzeile. Die heutigen drei Entschuldigungsabsätze
(`:327-330`, `:372-375`, `:398-402`) fallen ersatzlos weg, samt der Formulierung „das
zeichnet sie erst seit dieser Fassung auf", die für einen Erstnutzer schlicht nicht stimmt.

**Beantwortet:** „Was mache ich nächstes Mal anders?" Das ist das natürliche Ende einer
Gegenüberstellung — erst der Befund, dann die Entscheidung.

### 2.8 Der Rest — alles andere, flach

**Zeigt:** eine schlichte Tabelle mit **drei** Zahlenspalten: `dieser Abend` · `sonst ⌀` ·
`Summe im Zeitraum`. Zeilen: Likes, Emotes, Truhen (samt Coins darin, nie zu `coins`
addiert), Unsichtbar dabei, Geteilt, Verlängerungen, Neue Superfans, Beste Platzierung.
Rechts oben ein Textknopf „Zahlen als CSV" → `window.studio.exportStatsCsv()` (`preload.ts:43`;
hängt heute auf der Live-Seite, `LivePage.tsx:343`, also am falschen Ort).

**Die dritte Spalte ist Pflicht, kein Extra.** Ohne sie verliert die App die Frage „wie viele
Coins hatte ich diesen Monat?" ersatzlos — für Meilensteine, für eine Agentur, fürs
Finanzamt. Der Messlatten-Umschalter bestimmt dabei, über welche Gruppe summiert wird, und
die Spaltenüberschrift sagt es (`Summe · 30 Tage`).

**Zeilen mit 0 in allen drei Spalten erscheinen nicht.** Dieselbe Regel wie in 2.3 — sonst
kommt die Kachel „Geteilt 0 · ⌀ 0 pro Stream" flach durch die Hintertür zurück.

**Drei Umbenennungen, weil die alten Wörter lügen:**

| heute | neu | warum |
| --- | --- | --- |
| „Reichweite — verschiedene Zuschauer" (`:253`) | **LEUTE IM RAUM** · „Stammgäste zählen jeden Abend mit" | `stats-history.ts:105` summiert `uniqueViewers` über Einträge — derselbe Mensch zählt bei 20 Besuchen 20-mal. |
| „Peak" (`:254`) | **MEISTE GLEICHZEITIG**, mit Datum | „Peak" ist kein deutsches Wort für diese Zahl. |
| „Unsichtbar" (`:263`) | **UNSICHTBAR DABEI** · „zugeschaut, ohne dass TikTok sie zeigt" | sonst liest man es als Fehler. |

`totals.viewers` (der letzte Messwert vor Schluss, meist nahe 0) wird nirgends gezeigt.

**Sieht aus:** die zweite und letzte Fläche der Seite — `background: var(--color-studio-panel)`,
`border-top: 1px solid var(--color-studio-border)`, kein Radius, **kein Schatten, kein
`backdrop-filter`**. Innenabstand 20 px 24 px. Zeilenhöhe 26 px, Label 11 px
`--color-studio-muted`, Zahlen 12 px `var(--font-mono)` `--color-studio-text` bei 80 %,
Trennung 1 px `rgba(38,42,54,.6)`, zwei Spaltenblöcke nebeneinander ab 900 px Breite. Keine
Icons, keine Farben, keine großen Zahlen. Die ⌀-Spalte erscheint erst ab zwei Abenden in der
Gruppe.

**Darunter die Fußnoten**, 11 px `--color-studio-muted` bei 85 %, `line-height:1.6`,
`max-width:70ch` — und nur die, deren Kennzahl auch dasteht:

> „Likes ist TikToks Zähler für den ganzen Raum; verbindest du dich mitten im Live, springt er hoch."
> „Abende ganz ohne Reaktion schreibt die App nicht mit — es können also mehr gewesen sein."
> „‚Leute im Raum' zählt jeden, von dem überhaupt ein Ereignis kam, auch reine Beitritte. Wer still zuschaut, taucht nirgends auf — TikTok verrät ihn uns nicht."
> „Namen habe ich nur vom letzten Abend; ältere hebt die App bisher nicht auf."
> „Der gerade laufende Stream zählt in den Summen erst mit, wenn er beendet ist."

**Beantwortet:** „Was war es genau?" Diese Zahlen sind nicht falsch, sie sind nur nicht die
Antwort auf die Frage der Seite. Vierzehn gleich große Kacheln mit je einer 2xl-Zahl machen
aus zwanzig Aussagen null Aussagen; dieselben Zahlen in einer stillen Tabelle beantworten die
Detailfrage besser und kosten auf dem ersten Bildschirm nichts. Und hier — nach dem Ergebnis,
nicht davor — ist der richtige Ort für methodische Vorbehalte.

---

## 3 · Die Hauptaussage: was in 2 Sekunden ankommt

Nach zwei Sekunden auf dem ersten Bildschirm (1280×800, ohne Scrollen) kann der Streamer
einen Satz mit Inhalt sagen: **„Freitag war deutlich besser als sonst."** Nicht: „da waren
Zahlen."

**Prüfbar:**

* Squint-Test: Screenshot auf 15 % skaliert — genau **ein** Element bleibt lesbar, die
  Schlagzeile.
* Größenverhältnis: Schlagzeile `clamp(30px, 4.4vw, 56px)` gegen das nächstgrößte Element
  (Wertspalte in 2.3, 20 px `--font-chunky`). Bei 1280 px Fensterbreite: 56 : 20 = **2,8×**.
  Bei der Mindestbreite 960 px: 30 : 20 = 1,5× — deshalb wird bei Containerbreite unter
  760 px die Wertspalte auf 17 px und der Belegsatz auf 15 px gesetzt, damit das Verhältnis
  nirgends unter **1,75×** fällt. Diese Zahl ist eine Abnahmebedingung, keine Absicht.
* Farbige Fläche auf dem ersten Bildschirm: die 3-px-Akzentkante am Schlagzeilenblock plus
  der Akzentstrich in der Reihe. Zusammen deutlich unter 1 % der Fläche.

**Farbvokabular, seitenweit, je genau eine Bedeutung:**

| Farbe | Bedeutung | Wo genau |
| --- | --- | --- |
| `--color-studio-accent` #ff4d2e | „hier stehst du" — der bewertete Abend | Kante am Schlagzeilenblock, Markierung in der Reihe, Fokusringe |
| `--color-studio-teal` #21e6c1 | besser als sonst — als **gemessene Länge**, nie als Abzeichen | Balken nach rechts (2.3), Säulen nach oben (2.4), Segmentfüllung (2.7), Senkrechte bei Pro-Befunden (2.5) |
| `--color-studio-gold` #ffd23e | Bestwert, sonst nichts | **genau eine** Säulenkappe in der Reihe, erst ab `URTEIL_AB` Abenden |
| `#a6abbe` / Graustufen | weniger, neutral, Nebensache | alles andere |

Fokusringe sind die einzige gewollte Ausnahme bei Orangerot und sind Barrierefreiheit, keine
Gestaltung. Die neun goldenen Sektionsüberschriften von heute (`:288, 308, 323, 351, 368,
394, 419, 439, 463`) fallen weg: neun goldene Überschriften heißen, dass nichts wichtig ist.

---

## 4 · Bewegung

**Es gibt genau eine Animation auf dieser Seite, und sie erklärt eine Veränderung.**

Wechselt man die Messlatte (2.1) oder wählt einen anderen Abend in der Reihe (2.4), fahren
die divergierenden Balken der Gegenüberstellung von ihrer alten auf ihre neue Länge — und
wechseln dabei sichtbar die Seite. Die Bewegung **ist** der Vergleich: man sieht, wie
derselbe Abend an einer anderen Messlatte anders dasteht.

Technisch: je Zeile liegen zwei Balkenelemente fester Breite (`Bahnbreite/2 − 4` px) an der
Mittellinie, das rechte mit `transform-origin:left`, das linke mit `transform-origin:right`.
Verändert wird ausschließlich `transform: scaleX(f)` mit
`transition: transform 260ms cubic-bezier(.2,.8,.3,1)`. Kein Layout, kein Neuzeichnen, keine
Breitenanimation. Die `transition` sitzt nur auf der Seite, die sich tatsächlich ändert.
Weil die Gegenüberstellung hart auf **8 Zeilen** gedeckelt ist, laufen nie mehr als acht
gleichzeitig — exakt die bestehende Obergrenze `ANIMIERTE_BALKEN`.

Beim **ersten Erscheinen** der Seite: ein einziges `bx-auf` auf dem Schlagzeilenblock,
240 ms, ein Element. Kein Stagger über Kacheln, kein Hochzählen, kein Aufwachsen der Säulen.
Die Reihe steht sofort fertig da.

**Abnahmebedingung:** `document.getAnimations().filter(a => a.playState === 'running').length`
ist drei Sekunden nach dem Aufbau **0**.

**Ersatzlos entfernt:**

* `ZaehlZahl` (`AnalysePage.tsx:491-516`, 34 Zeilen). Sie initialisiert `gezeigt` per
  `useState(wert)` und `vorher` per `useRef(wert)`; beim Mount ist `start === wert`, der
  Effekt steigt in `:498` sofort aus — **beim Öffnen läuft sie nachweislich nie**. Sie feuert
  nur beim Zeitraumwechsel und zählt dort eine Summe auf eine andere herunter, erfindet also
  eine Entwicklung, die ein Filterwechsel ist. Dabei bis zu 14 parallele
  `requestAnimationFrame`-Schleifen mit je einem `setState` pro Frame.
* Der 40-ms-Kachel-Stagger (`:268`) — letzte Karte 560 ms nach dem Laden.
* Die 8 `bx-balken`-Wachstumsanimationen (`:550`).

**`prefers-reduced-motion: reduce`:** Die bestehende Regel in `index.css:227-228`
(`[style*="bx-auf"], [style*="bx-balken"] { animation: none !important }`) greift für das
`bx-auf` unverändert, weil es als Inline-`style` gesetzt wird. Für die neue Transition kommt
**eine** Zeile dazu:

```css
@media (prefers-reduced-motion: reduce) {
  .bx-diff-balken { transition: none !important; }
}
```

Alles steht dann sofort im Endzustand — nichts zuckt, nichts bleibt unsichtbar.

### Der eigentliche Gewinn ist keine Animation

`.bx-card` trägt in `index.css:69-89` **`backdrop-filter: blur(8px)`** plus einen
Verlaufshintergrund plus zweifachen `box-shadow` plus ein `::before`-Pseudo mit
`color-mix`-Verlauf. Die heutige Seite rendert davon je nach Datenlage 13 bis 25 gleichzeitig
(2 Kopfkarten + bis zu 14 Kacheln + Verlauf + bis zu 8 Sektionen) — und sie scrollt, während
`body` (`index.css:40-48`) zwei Radial-Verläufe mit `background-attachment: fixed` trägt.
Genau diese Kombination ist auf einem Software-Rasterizer der teuerste Fall überhaupt: jede
Backdrop-Fläche erzwingt eine eigene Render-Oberfläche samt Rücklesung bei jedem Scroll.

Diese Seite geht auf **null** Blur-Ebenen. Zwei volldeckende Flächen (2.3 und 2.8) ohne
Filter, ohne Schatten, ohne Verlauf. Auf dem Laptop ohne Grafikbeschleunigung ist das um
Größenordnungen mehr wert als jede Animationsfrage — und es ist bezeichnend, dass sich der
heutige Code in elf Kommentarzeilen (`:541-549`) um 40 Balken sorgt und 25 permanente
Blur-Ebenen darüber nicht erwähnt.

**Zusätzlich:** `const jetzt = Date.now()` steht heute in `:90` und ist in `:91`/`:98`
`useMemo`-Abhängigkeit — beide Memos sind damit wirkungslos, jeder Render rechnet alles neu.
Weil die neue Seite bei jeder Auswahl neu rechnet, wird `jetzt` per
`useState(() => Date.now())` eingefroren.

**Abnahmebedingung:** `document.querySelectorAll('*')` auf `backdrop-filter` durchzählen —
auf dieser Seite muss die Zahl **0** sein.

---

## 5 · Der leere und der kleine Zustand

Der kleine Zustand ist der Entwurfsfall, nicht der Notfall. Er funktioniert hier deshalb,
weil ein Vergleich schon mit zwei Punkten funktioniert — und weil die Seite eine **Blockfolge**
ist, kein Raster: fällt ein Block weg, rückt der nächste nach. Es entsteht nie ein Loch, weil
es nie ein Kästchen gab.

### (a) Noch nie live

```
NOCH NICHTS ZU VERGLEICHEN

Sobald du das erste Mal live warst, steht hier, wie der Abend lief.
Ab dem zweiten kann ich vergleichen — und ab da wird die Seite richtig gut.
```

Darunter, an der Stelle, wo später die Reihe steht: eine einzelne waagerechte Haarlinie über
die volle Breite mit dem 10-px-Label „hier entsteht deine Nulllinie". Sonst nichts. **Kein
gestrichelter Kasten**, keine Umschaltknöpfe, die viermal dasselbe Nichts zeigen (heute
`:176-182`). Das leere Objekt ist dasselbe, das später gefüllt wird — der Leerzustand ist ein
Versprechen, keine Absage.

### (b) Erster Stream läuft gerade

Heute ist die Seite in diesem Moment **komplett leer**: `streams.length === 0` (`:176`)
klammert den gesamten Rumpf ein, also auch die Karte „Gerade läuft" (`:186`), die
Top-Geschenke und „Deine Leute". Die App verschweigt Daten, die im Speicher liegen, weil eine
unabhängige Liste leer ist. Das ist ein Bug, kein Design.

```
LÄUFT GERADE

DEIN ERSTER ABEND

Ab jetzt habe ich eine Messlatte. Was heute ist, ist ab morgen dein Vergleich.
```

Die Gegenüberstellung wird gerendert, aber **ohne Bahn und ohne Differenzspalte** — nur Label
und Wert, mit einer einzigen Notiz an der ersten Zeile: „Diese Zahlen sind ab morgen deine
Messlatte." Nicht sechsmal derselbe Entschuldigungssatz, sondern einer.
„Deine Leute an diesem Abend" zeigt die Gesichter, die **jetzt** da sind. Kein
Prozentvergleich gegen fertige Streams — heute steht dort zehn Minuten nach Start
zuverlässig „−85 % gegenüber deinem Schnitt" in Alarmfarbe (`:194-204`).

### (c) Erster Stream beendet

Dasselbe in der Vergangenheitsform. Die Reihe zeigt **eine** Säule, die genau auf der Linie
sitzt, beschriftet „das ist deine Nulllinie". Kein Balken, der zu 100 % ausschlägt, weil er
der einzige ist (heute `:539`: `Math.max(2, (s.coins/max)*100)` mit `max` = eigener Bestwert).
Kein „⌀ 0 pro Stream" (heute `:277-281` ab `streams.length > 1`), kein „Platz 1 von 1".

### (d) Zweiter Stream — der Fall, an dem dieser Entwurf hängt

Alles funktioniert vollständig. Die Messlatte ist der eine Abend davor und hat einen Namen.

```
BESSER ALS DIENSTAG

45 Kommentare von 10 Leuten — am Dienstag waren es 18 von 6.
Ein Abend Unterschied ist noch kein Muster, aber ein Anfang.

Gemessen wird bei dir an Kommentaren — da ist genug los, dass ein Vergleich
was taugt. Die Coins stehen weiter unten mit drin. [an Coins messen]
```

Die Reihe zeigt zwei Säulen und eine Linie dazwischen; das Normalband beantwortet gleich mit,
ob der Unterschied überhaupt zählt. „Woran es lag" läuft mit einem Vergleichswert genauso wie
mit fünfzig. Das ist die Stufe, auf der die heutige Seite nur sagt: „Das war dein 2.
aufgezeichneter Stream — für einen ehrlichen Vergleich braucht es ein paar mehr."

### (e) Drei Streams · 10 Zuschauer · 3 Geschenke · 1 Coin · 45 Kommentare

Der harte Prüffall. Vorabende: 12 Coins / 18 Kommentare und 0 Coins / 12 Kommentare.

**Maßstab:** Coin-Normalwert über alle drei Abende = 1 → unter `PROZENT_AB` → **Maßstab =
Kommentare**. Die einzige Grafik der Seite zeichnet damit 45 gegen 15 und nicht 1 gegen 0.
Ohne diese Kopplung wäre die 940 px breite Präzisionszeichnung eine Darstellung von **einer
Rose weniger als letztes Mal** — und die 45 Kommentare, das einzig Reale an dem Abend, ein
Fragment in einer 13-px-Nebenzeile.

```
BESSER ALS DIE ZWEI DAVOR

45 Kommentare von 10 Leuten. Deine zwei Abende davor: 18 · 12.
Ab dem fünften rechne ich dir einen echten Normalwert aus.
```

Gegenüberstellung:

| Zeile | Wert | Bahn | Differenz |
| --- | --- | --- | --- |
| Kommentare | 45 | 10 px, weit über das Band nach rechts | +200 % gegenüber sonst · sonst 15 |
| Leute im Raum | 10 | 10 px, rechts | +43 % · sonst 7 |
| Meiste gleichzeitig | 8 | 4 px, links | 1 weniger als sonst · sonst 9 |
| Geschenke | 3 | 4 px, rechts | 2 Geschenke mehr als sonst · sonst 1 |
| Coins | 1 | 4 px, links | 5 Coins weniger als sonst · sonst 6 |
| Neue Follower | 0 | kein Balken | auch sonst keine |

„Geteilt" erscheint gar nicht. „Woran es lag" liefert hier zuverlässig R3:

> „Jeder, der da war, hat im Schnitt 4,5 Kommentare geschrieben statt 2,4. Es war
> gesprächiger als sonst — auch ohne Geschenke."

„Wann es bei dir läuft" entfällt komplett (unter vier Abenden mit `startedAt`), dafür steht in
der Fußzeile: „Sobald du an zwei verschiedenen Wochentagen je zweimal live warst, steht hier
oben, welcher Tag sich bei dir lohnt." Die ⌀-Spalte in der Tabelle erscheint, die
Summenspalte auch.

Kein einziger Satz auf dem Schirm wird bei drei Geschenken peinlich. Kein „Was für ein
Monat!". Nirgends eine Kachel mit 0. Und die Seite lobt nichts, was sie nicht belegen kann.

**Regel für alle Texte, die geprüft werden muss:** jeden Satz **laut vorlesen** — mit diesen
Zahlen. Was dabei zynisch, hohl oder herablassend klingt, ist falsch, auch wenn es bei guten
Zahlen schön wäre. Nie eine Menge betonen, die klein ist; lieber den Menschen benennen als
die Summe.

### (f) Zeitraum-Pause: es gibt Abende, aber keinen neuen

Der Messlatten-Umschalter kennt keinen leeren Zustand — er wählt eine Gruppe, und die Gruppe
ist immer nicht-leer, weil der bewertete Abend selbst dazugehört. Der Fall „vier Knöpfe,
viermal derselbe leere Kasten" existiert also gar nicht mehr. Der Kicker sagt schlicht
`ZULETZT AKTIV AM DIENSTAG, 22. JULI`, und wenn das über zwei Wochen her ist, steht unter der
Schlagzeile ein Halbsatz: „Das ist 13 Tage her."

### (g) 40+ Streams

Identischer Aufbau. Die Reihe wird dichter (Säulen bei 26 px Höchstbreite, ab 60 Einträgen
mit sichtbarer Angabe, wie viele gezeigt und wie viele gerechnet werden), der Nachtstreifen
schaltet auf Wochenzeilen um. **Die Seite wächst nicht mit den Daten** — sie wird beim großen
Kanal ruhiger, nicht reicher.

---

## 6 · Was NICHT gebaut wird

Damit diese Ideen nicht in sechs Wochen erneut vorgeschlagen werden — jede mit dem Grund,
warum sie hier scheitert.

**Ein Minutenprotokoll / eine Chronik des Abends.** Die schönste Idee der Vorlage und die
fragilste. Ihre zwei Beat-Quellen sind **Lebenszeit**-Erstereignisse: `firstSeen` wird in
`points-store.ts:193` per `??=` genau einmal gesetzt und nie aktualisiert, `firstSenderAt`
in `gift-catalog.ts:239` nur, solange `!entry.firstSender`. Ein Kanal im sechsten Monat mit
acht Stammgästen erzeugt an einem Abend **null** Neuling-Beats und **null**
Erstgeschenk-Beats. Die Chronik verblasst also genau bei den Nutzern, die der App am längsten
treu sind. Dazu kommt: ohne `startedAt` lässt sie sich gar nicht aufspannen, und Chats sind
nirgends zeitgestempelt — eine Lückenmarke „41 Minuten ohne Ereignis" wäre an einem Abend mit
45 Kommentaren schlicht falsch. Eine echte Chronik bräuchte ein Beat-Protokoll pro Session
(Abschnitt 7); erst dann ist sie wieder eine Option.

**Namen als 60-px-Schlagzeile („TOM HAT DEN ABEND GETRAGEN").** Zwei Gründe. Erstens hängt
sie an `studio.stats`, und das ist im Renderer **Push ohne Pull** (`useStudio.ts:76`,
`preload.ts:216` — es gibt kein `getStats`), nach einem App-Neustart also `null`. Die größte
Schrift der Seite dürfte nicht davon abhängen, ob die App über Nacht offen blieb. Zweitens
zeigen Streamer ihre Werkzeuge im Stream: eine namentliche Aussage über eine Privatperson in
60 px ist beim Screenshare eine Veröffentlichung. Menschen kommen auf dieser Seite als
**Beleg** vor (2.6), nicht als Überschrift.

**Ein Verteilungs-Streifen mit linearer Position (0 … Bestwert).** Nach dem ersten
Wal-Abend — jemand schickt ein Universum, 1.000 Coins — quetschen sich alle anderen Abende
auf die linken 3 %. Bei einem kleinen Kanal ist genau das die Regel, weil Coin-Verteilungen
an einzelnen Menschen hängen. Die Reihe in 2.4 hat das Problem nicht, weil sie die
**Abweichung** skaliert, nicht den Absolutwert.

**Das Kachelraster.** 14 gleich große `.bx-card` in `repeat(auto-fit, minmax(150px, 1fr))`
mit „Label oben, Zahl mittig, Fußnote unten" — genau das Muster, das abgelehnt wurde. Auch
nicht als rahmenlose Definitionsliste mit `auto-fill minmax(150px,1fr)`: den Rahmen
wegzunehmen nimmt die Form nicht weg.

**Lebenszeit-Ranglisten auf dieser Seite** („Deine Top-Geschenke", „Deine Leute" als Top 5
nach Coins, heute `:417-458`). Sie vergleichen nichts, sie ändern sich beim Umschalten nicht,
und der Hinweis darauf steht heute als 10-px-Fußnote am Kartenboden, wo er niemandem
auffällt. Sie haben auf der Zuschauer- und der Galerie-Seite bereits eine Heimat.

**Der automatische Maßstab-Wechsel pro Zeitraum.** Ein Umschalter, der das Urteil kippt, ist
schlimmer als gar kein Umschalter. Der Maßstab wird einmal über die gesamte Historie gewählt.

**`ZaehlZahl`, der Kachel-Stagger, die Balken-Wachstumsanimation, alle Hover-Übergänge auf
nicht klickbaren Flächen.** Siehe Abschnitt 4.

**Emoji als Datenpunkt.** `💜 {teamLevel}` (`:447`) wird zu „Team 3". Und der rohe
Gift-Slug (`:426`, „hand_heart") wird zu `giftDisplayName(slug, 'de', customName)`.

**Acht Sektions-Icons in Gold.** Icons, die alle gleich aussehen und alle dieselbe Farbe
haben, unterscheiden nichts — sie tapezieren. Auf der ganzen Seite gibt es kein einziges
`lucide`-Icon.

---

## 7 · Was an Daten fehlt

Getrennt aufgeführt, weil nichts davon Voraussetzung für die Seite ist — die Seite steht auf
`StatsHistoryEntry`, und der ist vollständig. Aber diese neun Lücken begrenzen, wie gut sie
werden kann.

**Blockiert einen Abschnitt (mit Fallback, aber spürbar):**

1. **`startedAt` fehlt auf dem Restore-Pfad.** `flushSessionToHistory()` (`studio.ts:1219`)
   reicht `erstesEchtesEventAt` korrekt an `record()` durch — aber der Restore-Pfad tut es
   nicht: `studio.ts:2368` ruft `this.statsHistory.record(totals, Math.min(mtimeMs, Date.now()))`
   **ohne `start`**. Wer die App nach dem Stream schließt, bekommt für diesen Abend also weder
   Startzeit noch Dauer. Damit fallen der Nachtstreifen (2.7), `besteSendezeiten()` und
   `coinsProStunde()` für genau diesen — häufigen — Nutzertyp aus.
   *Fix:* `erstesEchtesEventAt` in `session-stats.json` mitschreiben (`SerializedStats` um ein
   Feld erweitern) und im Restore-Pfad als `startedAt` durchreichen. Zwei Stellen, je wenige
   Zeilen.

2. **Kein Pull für den Session-Schnappschuss.** `useStudio.ts:76` befüllt `stats`
   ausschließlich über den Push `onStats`; in `shared/constants.ts` existiert nur
   `STATS_UPDATE`, kein `STATS_GET`, und `preload.ts` hat kein `getStats`. Nach einem
   App-Neustart ist `studio.stats === null`, bis das nächste Live-Ereignis kommt. Betrifft
   „Deine Leute an diesem Abend" (Quelle 1) und die Befunde R1/R5. Der Fallback über
   `listViewers('')` + `lastSeen` greift, ist aber ärmer (keine Coin-Beträge pro Abend).
   *Fix:* `IPC.STATS_GET` + `ipcMain.handle` auf `isStudio()`-Snapshot + Aufruf in `useStudio`
   nach dem Subscribe, mit demselben `pushedSincePull`-Wächter, den `getPlatformStatus`
   zwölf Zeilen darüber schon vormacht (`useStudio.ts:57-64`). ~15 Zeilen.

3. **Die Historie speichert keine Namen.** `StatsHistoryEntry` (`stats-history.ts:16-24`)
   erbt `StatsTotals` — reine Summen. `topGifters`, `topGift` und `topStreak` sterben mit
   `SessionStats`. Deshalb hat 2.6 zwei Qualitätsstufen: reich für den letzten Abend, leer für
   ältere. Das ist im Spec ehrlich gemacht (der Abschnitt entfällt und sagt warum), aber es
   bleibt ein Verlust.
   *Fix:* Top-3-Gifter (`nickname`, `profilePic`, `coins`) und das wertvollste Einzelgeschenk
   beim `flushSessionToHistory()` mit in den Eintrag schreiben. Danach funktioniert 2.6 auch
   für „vorletzten Dienstag".

**Verfälscht Zahlen (muss mindestens ehrlich beschriftet sein):**

4. **Stille Abende werden gar nicht aufgezeichnet.** `record()` (`stats-history.ts:70-72`)
   legt nur an, wenn `coins + gifts + likes + chats + follows + shares + subs + envelopes +
   superfans > 0` ist — **Zuschauer und Peak zählen nicht mit**. Ein Abend mit zwölf stillen
   Zuschauern taucht nirgends auf. Damit ist „die 5 davor" womöglich nicht die letzten fünf
   Abende, sondern die letzten fünf **mit Aktivität**, und die Messlatte liegt systematisch zu
   hoch. Bis das behoben ist, steht die Fußnote aus 2.8 dort.

5. **`uniqueViewers` zählt Beitritte mit.** `SessionStats.apply()` ruft
   `trackViewer(event.user?.id)` für **jedes** Ereignis mit Nutzer-ID auf
   (`session-stats.ts:181-194`), und `member` kommt als `join`-Ereignis an
   (`docs/tiktok-datenquellen.md` §1.1). Der Klassenkommentar sagt es selbst: „inkl. reiner
   Beitritte" (`:156-157`). Eine Zahl „wie viele haben wirklich etwas gemacht" gibt es
   **nicht**. Deshalb heißt die Zeile „Leute im Raum" und nicht „Leute, die was gemacht
   haben". Wer letzteres will, braucht eine neue Zählung im Hauptprozess.

6. **`listViewers('')` ist auf 200 gedeckelt und nach Punkten sortiert**
   (`main.ts:785`, `points-store.ts:287`). Für die Zielgruppe (unter 200 bekannte Menschen)
   ist das der vollständige Bestand; bei einem großen Kanal fällt ein Neuling mit wenigen
   Punkten durchs Raster. Für 2.6 ist das hinnehmbar, aber kein Satz darf „der Einzige, der …"
   behaupten — die Formulierung lautet immer „von dem ich etwas gesehen habe".

**Begrenzt, was die Seite je sagen kann:**

7. **Kein Verlauf innerhalb eines Streams.** Es gibt keine Minuten-Stützstellen pro Abend
   (`useStudio.verlauf` reicht 30 Minuten zurück und beginnt beim App-Start). Deshalb gibt es
   auf dieser Seite **keine** Aussage der Sorte „hör früher auf" — sie wäre erfunden.

8. **Avatare werden nicht lokal gespiegelt.** TikToks CDN-URLs in `PointsEntry.profilePic`
   verfallen. Der Gift-Katalog macht es bereits richtig vor: `localIconFile()`
   (`gift-catalog.ts:90-93`) plus die Umschreibung auf `http://127.0.0.1:*/gift-img/…` in
   `studio.ts`, und die CSP erlaubt das. Bis Avatare denselben Weg gehen, ist das
   `Gesicht`-Bauteil mit `onError`→Buchstabenkreis (2.6) **Pflicht**, nicht Kür.

9. **`GiftHighlight` hat kein `at`** (`session-stats.ts:92-100`). Ein Zeitstempel am
   wertvollsten Geschenk wäre eine Zeile (`session-stats.ts:222-230`) und die Voraussetzung
   für jede spätere Chronik. Ohne echtes Beat-Protokoll pro Session (Ankunft, erstes Gift,
   Höhepunkt, Schluss) bleibt der Spielbericht-Entwurf unbaubar.

---

## 8 · Umsetzung in Schritten

Jeder Schritt ist einzeln auslieferbar und einzeln zurückrollbar. Nach jedem Schritt gelten
die Regeln aus `AGENTS.md`: `lint`, `typecheck`, `test`, `widget-check` per **Exit-Code**.

**Schritt 1 — Die Rechenschicht (nichts sichtbar).**
`shared/analyse.ts` erweitern, alles reine Funktionen mit Tests in `shared/analyse.test.ts`:
`PROZENT_AB = 10`; `ueblich(werte): number` (Median statt Mittelwert — ein 5.000-Coin-Abend
verdirbt sonst wochenlang jede Schlagzeile); `vergleichsSatz(wert, basis, einheitSg,
einheitPl)` als **die einzige** Textquelle für Differenzen, mit Singular/Plural und den vier
Fällen aus 2.3; `massstab(alleAbende): 'coins' | 'chats'`; `schlagzeile(...)` mit den neun
Regeln. `urteil()` bekommt strukturierte Felder (`ueblich`, `abweichung`) und rechnet auf
`ueblich()` statt auf dem Mittelwert; `satz` bleibt vorerst erhalten. `analyse.ts` wird nur
von `AnalysePage.tsx` benutzt — es kann nichts anderes brechen.

**Schritt 2 — Kopf und Urteil.**
2.1 und 2.2 bauen, den Gruß, das Icon und den Methodik-Absatz entfernen, den
Zeitraum-Umschalter durch den Messlatten-Umschalter ersetzen. Der Rest der Seite bleibt
zunächst unverändert darunter stehen. Erster sichtbarer Gewinn, kleines Risiko.

**Schritt 3 — Die Gegenüberstellung.**
2.3 bauen, das 14er-Kachelraster **und** `ZaehlZahl` löschen. Damit fallen 14 `.bx-card` weg.

**Schritt 4 — Die Reihe.**
2.4 bauen, `StreamBalken` löschen. Inklusive Klick, Pfeiltasten, `aria-label` und der
Auswahl-Zustandsverwaltung — ab hier ist jeder einzelne Abend erreichbar. Der `jetzt`-Wert
wird eingefroren.

**Schritt 5 — Woran es lag.**
2.5 bauen, inklusive der absoluten Böden bei R1/R5 und `giftDisplayName()`.

**Schritt 6 — Deine Leute an diesem Abend.**
Zuerst das `Gesicht`-Bauteil mit `onError`-Fallback (eigene, wiederverwendbare Komponente),
dann 2.6 mit beiden Quellen. Die alten Karten „Deine Top-Geschenke" und „Deine Leute" fallen
hier weg.

**Schritt 7 — Wann es bei dir läuft.**
2.7 bauen, die Karten „Starke Wochentage", „Beste Sendezeit" und „Coins pro Stunde" löschen,
samt der drei „erst seit dieser Fassung"-Absätze.

**Schritt 8 — Der Rest.**
2.8 bauen, die restlichen Sektionen löschen, `exportStatsCsv()` von der Live-Seite hierher
umziehen, die drei Umbenennungen und die Fußnoten setzen. Danach ist auf der Seite **kein
`.bx-card` und kein `backdrop-filter` mehr**. Abnahme: die zwei Konsolenprüfungen aus
Abschnitt 3 und 4.

**Schritt 9 — Die Datenlücken (Hauptprozess, unabhängig von der Optik).**
In dieser Reihenfolge nach Nutzen: (a) `startedAt` im Restore-Pfad — schaltet 2.7 für den
häufigsten Nutzertyp frei; (b) `STATS_GET` als Pull — macht 2.6 nach jedem App-Neustart
verlässlich; (c) Top-3-Gifter und wertvollstes Einzelgeschenk in `StatsHistoryEntry` —
nimmt 2.6 die zweite Qualitätsstufe. Jeder Punkt für sich lieferbar, jeder mit einem Test,
der die Lücke vorher nachweist.
