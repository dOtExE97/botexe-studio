# Sticker sichtbar machen und mit Sound belegen

Stand 20.08.2026 · Ausgangspunkt: v0.54.1

## Warum

TikTok-Zuschauer schicken Sticker (Fanclub-Sticker, Superfan-Emotes) in den Chat.
botexe-studio verwirft sie **vollständig**. Das ist kein fehlendes Feature, sondern
ein Loch: Eine Sticker-Nachricht hat als Text nur ein Leerzeichen, und
`chat-box.js:153` wirft alles ohne Text weg (`if (event.type !== 'chat' || !event.text) return;`).
Die Nachricht verschwindet also spurlos.

**Wie groß das Loch ist, wurde gemessen**, nicht geschätzt: 90 Sekunden Mitschnitt
aus einem fremden Live (@hi_im_billa, 20.08.2026, 141 Ereignisse). Ergebnis:
**8 von 21 Chat-Nachrichten enthielten Sticker — 38 %.** Ein Streamer mit aktivem
Fanclub sieht also gut ein Drittel seines Chats nicht.

## Was TikTok liefert

Zwei Wege, und der wichtigere ist **nicht** der, den man vermutet:

1. **Sticker im Chat** (`WebcastChatMessage.emotes`) — der Regelfall. Liste von
   `EmoteWithIndex`: `index` (Position im Text) + `emote` (`EmoteModel`).
   Im Mitschnitt kamen **alle 8** Sticker auf diesem Weg.
2. **Reine Sticker-Nachricht** (`WebcastEmoteChatMessage`, Ereignis `emote`) —
   kam in 90 Sekunden **kein einziges Mal** vor. Wird trotzdem mitbedient, ist
   derselbe `EmoteModel`.

Ein `EmoteModel` trägt (aus dem echten Mitschnitt, nicht aus der Doku):

| Feld | Beispielwert | Nutzen |
|---|---|---|
| `emoteId` | `"7444741533452225312"` | Eindeutig → Sound daran binden |
| `image.urlList[]` | 2 CDN-Adressen | Das Bild |
| `image.avgColor` | `"#DCDCFA"` | Platzhalter-Farbe beim Laden |
| `image.isAnimated` | `false` | Bewegt oder nicht |
| `packageId` | `"fansclub"` | Welches Set (Fanclub / Superfan) |
| `emoteScene` | `3` | Von TikTok, Bedeutung unklar — mitschreiben, nicht auswerten |

**Es gibt keinen Katalog-Abruf.** Untersucht und ausgeschlossen:
- `roomInfo` (243 Felder) — `sticker_list`, `emoji_list`, `all_emoji_list` sind alle leer
- eulerstream-SDK — kennt nur Gift-Routen
- TikFinity — ruft `api.get("getChannelEmotes", {uniqueId})` gegen **seinen eigenen
  Server** (`appConfig.apiBasePath`, `X-Authorization-Token`), nicht gegen TikTok.
  Deren Backend hat eine Quelle, die wir nicht einsehen können.
- TikToks Weboberfläche — kann Sticker nicht einmal senden, lädt die Liste also nicht.
  Damit ist der Endpunkt über den Browser nicht auffindbar.

Konsequenz: **Der Katalog entsteht beim Zusehen.** Bei 38 % Stickeranteil füllt er
sich an einem Abend von allein; zusätzlich kann der Streamer per Handy einmal alle
durchschicken.

## Nicht-Ziele

- Kein eigener Server, kein Nachbau von TikFinitys Backend.
- Keine Spam-Bremse (ausdrückliche Entscheidung: jeder Sticker feuert). Die Felder
  `cooldownMs`/`userCooldownMs` der Trigger-Engine bleiben auf 0 und stehen bereit,
  falls es im echten Stream doch kracht.
- Kein zweiter Regelspeicher (siehe Aufbau).

## Aufbau

Vier Teile, klar getrennt.

### 1. Ereignis trägt die Sticker mit

`StudioEvent` bekommt ein optionales Feld:

```ts
/** Sticker in dieser Nachricht (TikToks „emotes"). Bisher verworfen — dadurch
 *  verschwanden Sticker-Nachrichten komplett, weil ihr Text leer ist. */
sticker?: StudioSticker[];

interface StudioSticker {
  id: string;        // emoteId
  bild: string;      // lokaler Pfad nach dem Zwischenspeichern, sonst CDN-Adresse
  index: number;     // Position im Text (0 = ganz vorne)
  animiert: boolean;
  paket?: string;    // packageId, z.B. 'fansclub'
}
```

Befüllt wird es in `normalizeChat` (bisher `tiktok-normalize.ts:213`) und in
`normalizeEmote` (bisher `:451`, wirft `emoteList` weg).

### 2. Sticker-Katalog — reines Beobachtungsgedächtnis

Neuer Dienst `services/sticker-catalog.ts`, gebaut nach dem Vorbild von
`gift-catalog.ts` (das Muster steht, inklusive Bild-Ablage).

Aufgabe: Kommt ein unbekannter Sticker durch → Eintrag anlegen, **Bild einmal
herunterladen und lokal ablegen**, Zähler und Zeitstempel führen.

Das lokale Ablegen ist nicht optional: TikToks CDN-Adressen laufen ab. Ohne Kopie
zeigt die Sticker-Seite morgen leere Kacheln — dieselbe Lehre wie bei der
Geschenke-Galerie.

```ts
interface StickerEintrag {
  id: string;
  bildPfad: string;      // lokal
  bildUrl: string;       // Herkunft, für Neu-Laden
  animiert: boolean;
  paket?: string;
  anzahl: number;        // wie oft gesehen
  erstGesehen: number;
  zuletztGesehen: number;
  eigenerName?: string;  // der Streamer darf umbenennen (TikTok liefert keinen Namen)
}
```

**Wichtig:** TikTok liefert zu einem Sticker *keinen Namen* — TikFinity zeigt
deshalb nur `#<emoteId>`. Wir zeigen das Bild groß und erlauben einen eigenen
Namen; das ist der einzige Punkt, an dem wir es besser machen können als sie.

### 3. Anzeige

**Chat-Box** (`packages/widget-kit/chat-box.js`):
- Die Bedingung in Zeile 153 darf eine Nachricht nicht mehr verwerfen, wenn sie
  zwar keinen Text, aber Sticker hat.
- Sticker werden an ihrer `index`-Position in den Text eingesetzt; ohne Text steht
  der Sticker allein in der Zeile.
- Das Widget baut die Bild-Elemente selbst (`document.createElement('img')`) und
  setzt die Adresse als Eigenschaft. **Kein `innerHTML` mit der Adresse** — die
  Datei ist bewusst „textContent-only, kein HTML-Inject" (Kommentar Zeile 3), und
  das bleibt so.
- Höhe an die Zeilenhöhe gekoppelt (`1.2em`), damit Sticker die Zeile nicht sprengen.
- Lädt ein Bild nicht, tritt `avgColor` als Kästchen an seine Stelle — kein
  kaputtes Bildsymbol im Overlay.

**Aktivitäts-Feed**: gleiche Behandlung.

### 4. Sticker-Seite mit Sound

Neue Seite `StickerPage.tsx`, aufgebaut wie `GalleryPage.tsx` (Kachel-Raster,
Suche über `shared/suche.ts`, Sortierung).

Pro Kachel: Bild, wie oft gesehen, wann zuletzt, eigener Name, Sound zuweisen
(`SoundPlayer`), Vorhören.

**Die Seite hat keinen eigenen Regelspeicher.** Weist der Streamer einen Sound zu,
entsteht eine ganz normale Trigger-Regel:

```
Ereignis 'emote' + Bedingung „Sticker ist <emoteId>" → Aktion Sound
```

Sie liest und schreibt dieselben Regeln wie die Trigger-Seite und zeigt an, was
dort schon steht. Damit ist alles andere geschenkt: Video, Overlay, TTS,
Bedingungen, Abklingzeiten — ohne dass die Sticker-Seite davon wissen muss.

Der Grund für diese Strenge steht in [[botexe-studio-architektur]]: doppeltes
Wissen ist eine der beiden wiederkehrenden Fehlerklassen dieses Projekts.

**Ereignis-Auslösung:** Eine Chat-Nachricht mit Stickern löst weiterhin `chat` aus
UND zusätzlich je Sticker ein `emote`-Ereignis. Sonst müssten Sticker-Regeln am
`chat`-Ereignis hängen, und ein Sticker mitten im Satz würde beides gleichzeitig
sein. Der Trigger-Typ `'emote'` existiert bereits (`trigger-engine/src/index.ts:36`)
und ist bisher inhaltsleer.

**Zwei Nebenwirkungen, die niemanden überraschen dürfen:**

1. Der Zähler `emotes` in `session-stats.ts` zählt heute nur die seltenen reinen
   Sticker-Nachrichten — im Mitschnitt: null. Künftig zählt er die Sticker aus dem
   Chat mit und **springt sichtbar nach oben**. Das ist richtig so, aber der
   Vergleich mit alten Sitzungen in der Auswertung hinkt ab diesem Release. Die
   Auswertung muss den Bruch benennen, statt einen Zuwachs vorzutäuschen.
2. Eine Chat-Nachricht mit Sticker löst künftig **beides** aus. Wer eine
   Chat-Regel ohne Textfilter hat (z. B. „jeder Kommentar gibt einen Punkt") und
   zusätzlich eine Sticker-Regel, bekommt beide Aktionen. Das ist die ehrliche
   Abbildung dessen, was passiert ist — aber es gehört in den Erklärtext auf der
   Sticker-Seite.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Bild-Download scheitert | Eintrag wird trotzdem angelegt, CDN-Adresse als Rückfall, nächste Sichtung versucht es erneut |
| CDN-Adresse abgelaufen, Bild lokal da | Lokales Bild gewinnt immer |
| Sticker ohne `emoteId` | Verwerfen, eine Zeile ins Log — nichts darf am fehlenden Feld abstürzen |
| `index` außerhalb des Textes | Sticker ans Ende hängen statt Nachricht zu zerreißen |
| Regel zeigt auf gelöschten Sticker | Regel bleibt gültig (feuert auf die ID), Seite zeigt Platzhalter |

## Tests

- `normalizeChat` mit echtem Mitschnitt-Ereignis (liegt vor) → `sticker` gefüllt,
  `index` stimmt
- `normalizeEmote` mit `emoteList` → nicht mehr leer
- Katalog: zweite Sichtung erhöht nur den Zähler, legt nichts doppelt an
- Katalog: fehlgeschlagener Download hinterlässt keinen kaputten Eintrag
- Chat-Box: Nachricht ohne Text, aber mit Sticker wird **angezeigt** (Wächter gegen
  genau den Fehler, der heute besteht)
- Chat-Box: die Bild-Adresse landet als Eigenschaft, nicht als HTML
- Sticker-Seite schreibt eine Regel, die die Trigger-Seite unverändert wiederfindet
  (Golden-Test wie bei `gift-mapping.test.ts`)

Wächter-Tests müssen gegengeprüft werden — ein immer-grüner Wächter sieht aus wie
ein funktionierender ([[feedback-fix-gegencheck]]).

## Offen

- **Vorab-Abruf**: nicht ausgeschlossen, nur nicht auffindbar. Sollte die Adresse
  je bekannt werden (Mitschnitt der Handy-App, fremde Quelle), lässt sie sich als
  Beschleuniger nachrüsten — der Katalog müsste dafür nur zusätzlich gefüllt
  werden können. Die Seite selbst ändert sich dadurch nicht. Zugang wäre vermutlich
  `tiktokSessionId` + `tiktokTargetIdc`, die es schon gibt.
- `emoteScene` und `emoteType` werden mitgeschrieben, aber nicht ausgewertet —
  Bedeutung unbekannt, und geraten wird nicht.
