# Zuschauer-Daten nutzen, die schon ankommen

Stand 20.08.2026 · Ausgangspunkt: v0.54.1

## Warum

In **jeder** Chat-Nachricht liefert TikTok mit, wie lange dieser Zuschauer schon
folgt, wie lange er im Fanclub ist und seit wie vielen Monaten er Superfan ist.
In jeder Beitritts-Nachricht steht, **woher** der Zuschauer kam. botexe-studio
liest nichts davon.

Das ist nicht dasselbe wie „eine Nachrichtenart mehr abonnieren": Diese Felder
kommen an Nachrichten an, die wir bereits verarbeiten. Der Aufwand ist Auslesen,
nicht Anbinden.

`docs/tiktok-datenquellen.md` kennt sie nicht — es ist aus dem Protokoll-Schema
erzeugt, und diese Felder liegen tief in `publicAreaMessageCommon.portraitInfo`.
Gefunden wurden sie durch einen echten Mitschnitt (@hi_im_billa, 20.08.2026,
141 Ereignisse in 90 Sekunden).

## Was tatsächlich ankommt

Alle Werte unten stammen aus dem Mitschnitt, nicht aus der Doku.

### An jeder Chat-Nachricht: `publicAreaMessageCommon.portraitInfo.portraitTag[]`

```json
{ "tagId": "7399855526094195474", "priority": "2",
  "showValue": "ttlive_ls_msgGroups_viewerLabel_followedDays",
  "showArgs": "{\"s_num\":\"437\",\"num\":\"437\"}" }
```

| `showValue` (Endung) | `showArgs.num` | Bedeutung |
|---|---|---|
| `followedDays` | `437` | folgt seit 437 Tagen |
| `memberDays` | `424` | seit 424 Tagen im Fanclub |
| `subForMo` | `2` | seit 2 Monaten Superfan |
| `topGifter` | — | gehört zu den Top-Schenkern |
| `notFollower` | — | folgt nicht |

**`showArgs` ist ein JSON-String**, kein Objekt — muss geparst werden, und ein
Fehlschlag darf das Ereignis nicht killen. `showValue` ist ein
Übersetzungsschlüssel; wir werten die **Endung nach dem letzten `_`** aus und
behandeln unbekannte Endungen als „egal" (TikTok erfindet neue).

### An Beitritts-Nachrichten: `clientEnterSource`

Beispiel: `"live_merge-live_cover"`. Beantwortet „woher kommen meine Zuschauer" —
eine Frage, die TikTok sonst nirgends beantwortet. **Die möglichen Werte sind
nicht dokumentiert.** Deshalb: roh mitschreiben, in der Auswertung gruppieren,
und unbekannte Werte unverändert anzeigen statt sie in eine erfundene Schublade
zu stecken.

### An jeder Nachricht: `user.followInfo`

`followerCount` / `followingCount` des **Zuschauers** — wie groß der selbst ist.
Bisher wird von `followInfo` nur `followStatus` gelesen (`tiktok-normalize.ts:160`).

### An `roomUser` (kommt alle paar Sekunden)

- `totalUser` — wie viele insgesamt drin waren (im Mitschnitt: 239 gegen 37 gleichzeitig)
- `anonymous` — davon unsichtbar (10)
- `ranks[]` — TikToks eigene Top-5 des Raums mit Punktestand

`anonymous` und `raumBeste` verarbeitet die App bereits.

### Nicht auswerten

`userMetrics` (`[{type:1,metricsValue:"27"}, …]`) — fünf Zahlen ohne
dokumentierte Bedeutung. Mitschreiben im Diagnose-Modus, sonst nichts. Raten
gehört nicht ins Produkt ([[feedback-nicht-raten-beim-bauen]]).

## Aufbau

### 1. Ereignis trägt die Angaben

`StudioEvent` bekommt:

```ts
/** Was TikTok an jeder Nachricht über die Beziehung dieses Zuschauers zum
 *  Kanal mitliefert (portraitTag). Bisher komplett verworfen. */
beziehung?: {
  folgtSeitTagen?: number;
  fanclubSeitTagen?: number;
  superfanSeitMonaten?: number;
  istTopGifter?: boolean;
  folgtNicht?: boolean;
};
/** Nur bei 'join': woher der Zuschauer kam (TikToks clientEnterSource, roh). */
herkunft?: string;
```

`StudioUser` bekommt `followerCount` / `followingCount`.

Gelesen wird das an **einer** Stelle (eine gemeinsame Hilfsfunktion in
`tiktok-normalize.ts`), nicht in jeder Normalisierung einzeln — sonst driften die
Wege wieder auseinander ([[botexe-studio-architektur]]).

### 2. Zuschauer-Gedächtnis

`PointsEntry` (`services/points-store.ts:40`) wird erweitert:

```ts
folgtSeitTagen?: number;      // Höchstwert, nie zurücksetzen
fanclubSeitTagen?: number;    // Höchstwert
superfanSeitMonaten?: number; // Höchstwert
istTopGifter?: boolean;
followerCount?: number;       // letzter bekannter Wert
herkunft?: string;            // wie zuletzt hereingekommen
```

**Höchstwert statt letztem Wert** — aus demselben Grund, der bei `teamLevel`
schon im Code steht: Nicht jede Nachricht trägt die Etiketten, und ein Ereignis
ohne sie würde den Wert sonst auf 0 setzen. Bei `followerCount` ist der letzte
Wert richtig, der ändert sich echt.

### 3. Zuschauer-Reiter

`ViewersPage.tsx` (heute 234 Zeilen: Punkte, VIP, TTS-Sperre, Stimme) bekommt pro
Person eine Zeile mit Substanz: Profilbild, „folgt seit 437 Tagen", Fanclub-Dauer,
Superfan-Monate, Top-Gifter-Abzeichen, eigene Follower-Zahl, Besuche, zuletzt
gesehen.

Sortier- und filterbar — „zeig mir alle, die über ein Jahr dabei sind" ist die
Frage, für die es diese Seite gibt.

Wächst die Seite dabei über ~400 Zeilen, wird die Tabellenzeile in eine eigene
Komponente ausgelagert. Nicht vorher.

### 4. Auswertung

`AnalysePage.tsx` bekommt neue Abschnitte:

- **Woher kamen sie** — Verteilung über `clientEnterSource`, roh gruppiert
- **Sichtbar gegen tatsächlich** — `totalUser` gegen Höchststand gegen `anonymous`
- **Treue** — Verteilung der Folge-Dauer (neu / Wochen / Monate / über ein Jahr)

Dafür muss `stats-history.ts` die neuen Summen mitschreiben. Alte Einträge haben
die Felder nicht — die Auswertung muss mit `undefined` umgehen und darf nicht 0
anzeigen, wo „unbekannt" richtig ist.

### 5. Trigger-Bedingungen

Neue Bedingungen auf dem bestehenden Weg (`Ereignis → Bedingungen[] → Aktionen[]`),
kein Engine-Umbau:

- „folgt seit mehr als N Tagen"
- „ist Top-Gifter"
- „hat selbst mehr als N Follower"
- „ist seit mehr als N Monaten Superfan"

Damit wird „Begrüßung für die, die schon ewig dabei sind" eine normale Regel.

**Fehlt die Angabe** (Nachricht ohne Etiketten), gilt die Bedingung als **nicht
erfüllt** — nie als erfüllt. Sonst feuert eine Treue-Begrüßung bei Fremden.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| `showArgs` ist kein gültiges JSON | Etikett ohne Zahl übernehmen, Ereignis läuft weiter |
| Unbekannte `showValue`-Endung | Ignorieren, im Diagnose-Modus eine Zeile loggen |
| Unbekannter `clientEnterSource` | Roh anzeigen, nicht einsortieren |
| Zuschauer ohne `portraitTag` | Alte Werte behalten (Höchstwert-Regel) |
| Alte Statistik-Einträge | „unbekannt" statt 0 |

## Tests

- Etiketten-Auswertung mit dem echten Mitschnitt-Ereignis → 437 / 424 / 2
- `showArgs` kaputt → kein Absturz, Etikett bleibt
- Höchstwert-Regel: Ereignis ohne Etiketten setzt nichts zurück (Wächter — genau
  der Fehler, den `teamLevel` schon hatte)
- Bedingung „folgt seit > 100 Tagen" ist bei fehlender Angabe **falsch**
- Auswertung mit Alt-Einträgen ohne die neuen Felder → „unbekannt", nicht 0

## Offen

- `userMetrics` — fünf Zahlen, Bedeutung unbekannt. Ließe sich über eine
  Stream-Sitzung mit bekannten Zuschauern aufklären; bis dahin nicht verwenden.
- `tagId` — stabile Nummern je Etikett. Falls `showValue` sich je ändert, wäre
  `tagId` der verlässlichere Anker. Heute nicht nötig.
