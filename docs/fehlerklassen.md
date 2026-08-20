# Wie wir verhindern, dass Reparaturen etwas kaputt machen

Stand 21.08.2026, nach dem v0.55.0-Release.

Anlass: Zwei Durchsichten kurz vor diesem Release fanden **15 Fehler**, davon
drei, die ganze Funktionen tot ausgeliefert hätten. Das Projekt hatte zu dem
Zeitpunkt **991 Tests und 12 Wächter-Tests**. Es lag also nicht an fehlender
Sorgfalt — sondern daran, dass die Fehler in Lücken fielen, die Tests
grundsätzlich schlecht abdecken.

Dieses Dokument sortiert die 15 Funde nach ihrer Ursache und hält fest, was
gegen jede Sorte hilft.

---

## Die fünf Fehlerklassen (aus echten Funden)

### A · Handgepflegte Liste läuft dem Typ davon — 5 von 15

Immer dasselbe Muster: Irgendwo steht eine Liste erlaubter Werte, gepflegt von
Hand, und der Typ daneben wächst weiter.

| Liste | Was fehlte | Folge |
|---|---|---|
| `EVENT_TYPES` (validators.ts) | `emote`, `superfan` | **Jede** solche Regel wurde beim Speichern komplett verworfen |
| `CONDITION_KINDS` | `sticker_ist` + 5 Treue-Bedingungen | Bedingung still entfernt → Regel feuert bei JEDEM Ereignis |
| Test-Event-Route | `sticker`, `beziehung`, `herkunft` | Ereignis kommt an, aber ohne Inhalt |
| `CATEGORY_OF` (OverlayPage) | `slot-machine` | Widget im falschen Reiter, praktisch unauffindbar |
| `EVENT_OPTIONS` (TriggersPage) | `emote` | Regel in „Sonstige"; ein Klick löscht ihre Bedingung |

**Diese Klasse ist vollständig vermeidbar.** Nicht durch bessere Tests — durch
den Typ selbst:

```ts
// Heute: TypeScript prüft NICHTS. Fehlt ein Wert, merkt es niemand.
const EVENT_TYPES: ReadonlySet<string> = new Set<StudioEventType>([
  'chat', 'gift', /* … 'emote' vergessen … */
]);

// Morgen: `satisfies` erzwingt Vollständigkeit beim Übersetzen.
const ARTEN = {
  chat: true, gift: true, follow: true, sub: true, like: true, share: true,
  join: true, viewer_count: true, superfan: true, emote: true,
  envelope: true, timer: true,
} satisfies Record<StudioEventType, true>;

export const EVENT_TYPES: ReadonlySet<string> = new Set(Object.keys(ARTEN));
```

Praktisch geprüft — lässt man einen Wert weg, sagt der Übersetzer:

```
error TS1360: … is missing the following properties
              from type 'Record<StudioEventType, true>': emote, superfan
```

**Beim Tippen. Ohne Test, ohne Durchsicht, ohne dass jemand daran denken muss.**
Drei der zwölf Wächter-Tests wären damit überflüssig.

Dasselbe Muster für `switch`-Anweisungen — ein `never`-Zweig macht jeden
vergessenen Fall zum Übersetzungsfehler:

```ts
default: {
  const _vollstaendig: never = kind;   // meckert, sobald ein Fall fehlt
  return null;
}
```

### B · Der Test macht dieselbe falsche Annahme wie der Code — 2 von 15

Der teuerste Fund: Die Sticker-Seite baute eine Aktion verschachtelt
(`{ kind: { kind: 'play_sound' } }`) statt flach. Die Tests dazu bauten sie
**genauso falsch** — und waren grün. Ein `as unknown as`-Cast verdeckte, dass
TypeScript es gemerkt hätte.

Dagegen hilft nur, gegen die **echte Grenze** zu prüfen statt gegen die eigene
Vorstellung davon: Der neue Test schickt die erzeugte Regel durch denselben
Validator, der beim Speichern läuft.

Zweiter Fall derselben Klasse: Die Reihenfolge der Geschenke-Galerie steckte in
der Ansicht und war dadurch **gar nicht** prüfbar — genau deshalb fiel nicht
auf, dass die neue Relevanz-Sortierung zwei Zeilen später überschrieben wurde.
Konsequenz: Entscheidungslogik gehört in eine DOM-freie Datei
(`galerie-sortierung.ts`, `viewers-sortierung.ts`, `palette-gruppen.ts`).

**Merkmal zum Erkennen:** Wenn im Test dieselbe Struktur von Hand gebaut wird
wie im Code, prüft der Test nur sich selbst.

### C · Die Reparatur bricht den Nachbarn — 3 von 15

- Der Beitritt wurde in die Statistik aufgenommen (nötig für die Herkunft) →
  „Neue begrüßen" feuerte nie wieder, weil der Zuschauer beim ersten Kommentar
  schon bekannt war.
- Dieselbe Änderung → Zuschauzeit-Punkte für Leute, die nur kurz hereinschauen.
- Die Reparatur **dafür** → alle Alt-Einträge ohne Kommentar-Zähler wären einmal
  als Neulinge begrüßt worden.

Diese Klasse ist die schwerste. Kein Werkzeug findet sie zuverlässig; sie
entsteht dort, wo ein Wert *zwei* Bedeutungen trägt (hier: „gesehen" und
„aktiv"). Was hilft:

- Beim Ändern eines gemeinsam genutzten Feldes **alle** Leser suchen
  (`grep -rn feldname`) — nicht nur den, für den man gerade baut.
- Zwei Bedeutungen = zwei Felder (`lastSeen` / `lastActive`).
- Der Verdacht „das betrifft nur meinen Fall" ist genau der Moment zum Nachsehen.

### D · Die Reparatur ist unvollständig — 3 von 15

Bei fünf Sortier-Möglichkeiten wurde eine vergessen. Beim Sticker-Zähler war der
Schlüssel zu grob, dann im zweiten Anlauf am falschen Wert verankert.

Gegenmittel: Bei einer **Auswahl** immer alle Möglichkeiten durchtesten, nicht
eine beispielhaft:

```ts
for (const sort of ['coins', 'name', 'recent'] as const) {
  assert.equal(ersten(sort, 'rose'), 'Rose', `Sortierung „${sort}"`);
}
```

### E · Der Wächter selbst ist zu schwach — 2 von 15

Ein neuer Wächter ließ sich von einem **Kommentar** zufriedenstellen (er suchte
den Feldnamen im Quelltext, und der stand im Kommentar daneben). Und eine
Adressprüfung verglich gegen `::1`, während der Browser `[::1]` **mit Klammern**
liefert — der Vergleich konnte nie zutreffen.

Gegenmittel ist die Gegenprobe, die im Projekt ohnehin gilt: **Jeden neuen
Wächter einmal absichtlich brechen und sehen, ob er rot wird.** Wurde bei allen
Wächtern dieser Runde gemacht.

---

## Was Werkzeuge zusätzlich leisten können

### Mutation Testing — „sind meine 991 Tests überhaupt etwas wert?"

Das Werkzeug ([StrykerJS](https://stryker-mutator.io)) verändert den Code
absichtlich an tausenden Stellen (`>` wird `>=`, `true` wird `false`, eine Zeile
fällt weg) und prüft, ob **irgendein Test** das merkt. Was unbemerkt bleibt,
ist ungeprüfter Code — egal was die Abdeckungszahl sagt.

Genau die Gegenprobe, die hier von Hand gemacht wird, nur automatisch und für
alles auf einmal.

**Haken für dieses Projekt:** Stryker hat fertige Anbindungen für Jest, Mocha,
Vitest und Karma — für Node's eingebauten Testläufer (`node --test`, den dieses
Projekt nutzt) gibt es keine, man müsste den „command runner" nehmen. Machbar,
aber kein Einzeiler. Und Mutation Testing ist langsam: Es lässt die Tests
hunderte Male laufen. Sinnvoll wäre es deshalb **nicht** für alles, sondern für
die paar Dateien, wo ein Fehler wirklich weh tut — `validators.ts`,
`trigger-engine`, `points-store`.

### Lint-Regel gegen versteckte Casts

`as unknown as` schaltet die Typprüfung ab. Im Projekt gibt es davon **39** —
und genau so einer hat den teuersten Fehler dieser Runde verdeckt. Die meisten
sind harmlos (IPC-Grenzen verlieren die Typen ohnehin), aber sie sind blinde
Flecken. Eine Lint-Regel, die sie in **Renderer-Seiten** verbietet und an
IPC-Grenzen erlaubt, kostet nichts und hätte hier gegriffen.

### Fehler sehen, statt sie zu erraten

Sentry ist eingebaut und der Zugang hinterlegt — aber die Telemetrie ist
**freiwillig und standardmäßig aus**. Wer nicht zustimmt, meldet nichts. Solange
niemand zustimmt, erfährt der Streamer von einem kaputten Release erst, wenn
jemand im Chat davon erzählt.

Mindestens die eigenen Rechner (Stream-PC, Zweit-Tester) sollten die Berichte
einschalten. Dann steht ein Absturz nach dem Update binnen Minuten im
Dashboard, statt tagelang unentdeckt zu bleiben.

### Nicht alle auf einmal beliefern

Das Update geht heute an **jeden gleichzeitig**. Wer erst 10 % beliefert und
einen Tag wartet, begrenzt jeden Fehler auf ein Zehntel der Leute. Für den
genutzten Update-Weg (`update.electronjs.org`) ist das allerdings **nicht**
vorgesehen — er kennt nur „neueste Fassung für alle". Ein gestaffeltes Ausrollen
bräuchte einen eigenen Update-Server, was bisher bewusst nicht gebaut wurde
(siehe die Delta-Paket-Warnung in `forge.config.ts`).

Billiger Ersatz mit demselben Effekt: **einen Abend selbst streamen, bevor der
Tag gesetzt wird.** Der Tag ist der Punkt, ab dem alle es bekommen — der
Commit davor nicht.

---

## Empfehlung, nach Wirkung geordnet

| # | Maßnahme | Deckt ab | Aufwand |
|---|---|---|---|
| 1 | `satisfies Record<Typ, …>` statt Handlisten, `never`-Zweig in jedem `switch` | **Klasse A — 5 von 15 Fehlern, strukturell** | klein |
| 2 | Entscheidungslogik raus aus den Ansichten, Tests gegen die echte Grenze | Klasse B | klein, laufend |
| 3 | Telemetrie auf den eigenen Rechnern einschalten | alles, was trotzdem durchkommt | winzig |
| 4 | Vor dem Tag einen Abend selbst streamen | Klasse C+D | ein Abend |
| 5 | Lint-Regel gegen `as unknown as` in Renderer-Seiten | Klasse B | klein |
| 6 | Mutation Testing für die drei kritischen Dateien | Klasse E | mittel |

Punkt 1 ist der einzige, der eine ganze Fehlerklasse **verschwinden** lässt,
statt sie zu bemerken. Alles andere macht Fehler sichtbarer — dieser hier macht
sie unmöglich.
