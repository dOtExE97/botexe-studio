# Was TikTok uns schickt — und was wir davon nutzen

> **Von Hand geschrieben und Zeile für Zeile belegt. Nicht maschinell erzeugen.**
> `scripts/tiktok-inventar.mjs` schreibt in **dieselbe Datei**
> (`scripts/tiktok-inventar.mjs:27` setzt das Ziel, `:123` schreibt es) — ein
> `npm run inventar` überschreibt dieses Dokument also vollständig. Wer das
> Skript laufen lassen will, leitet die Ausgabe vorher woandershin um.

## Warum es dieses Dokument gibt

Alle paar Tage tauchte etwas auf, das die App übersieht: eine Nachrichtenart,
die im Log stand und die niemand kannte, oder ein Feld, von dem man annahm, es
sei da. Dieses Dokument beendet das. Es beantwortet für **jede** Nachrichtenart
des Protokolls die drei Fragen: Kommt sie überhaupt an? Nutzen wir sie? Lohnt es
sich, sie zu nutzen?

### Wie die Antworten zustande kamen

Drei Quellen, in dieser Reihenfolge der Beweiskraft:

1. **Echte Logdateien** — 12 Dateien aus 27 Verbindungen, 30.07. bis 04.08.2026,
   rund 19 Stunden Live-Betrieb bei zwei Streamern (Chris mit 2–21 Zuschauern,
   Alex mit Peak 109). **Alle 27 Verbindungen liefen im Cloud-Modus**
   („Verbindungsmodus: Cloud (Euler)"). Ein einziges Direkt-Modus-Log existiert
   nicht — über den Direkt-Weg sagen die Logs deshalb **nichts**.
2. **Das Protokoll-Schema** — `node_modules/tiktok-live-proto/dist/node/v3.d.ts`
   (Fassung 0.2.4, 72 `Webcast*`-Nachrichtenarten).
3. **Die Bibliothek** — `node_modules/tiktok-live-connector` (Fassung 2.4.3),
   vor allem die Routing-Tabelle `WebcastEventMap` und der `switch` in
   `dist/lib-CbB_CSnH.js`.

Jede Behauptung hier trägt eine Fundstelle (Datei:Zeile oder Logzeile). Wo keine
existiert, steht **unbelegt** — das ist kein Versehen, sondern die Aussage.

### Die drei blinden Flecken, die man kennen muss

Ohne die liest man die Logbefunde falsch:

| Blinder Fleck | Beleg | Folge |
| --- | --- | --- |
| **Stumme Arten** | `tiktok-cloud.ts:186` meldet nur, was **nicht** in `HARMLOSE_ARTEN` (`:240-245`) steht | Zehn Arten können ankommen, ohne je im Log zu erscheinen. Ihre Abwesenheit beweist **nichts**. |
| **Eine Zeile ≠ ein Ereignis** | `log.einmal` (`tiktok-cloud.ts:187`), Merker wird bei jedem Connect geleert (`tiktok-adapter.ts:521`) | Eine Logzeile heißt „mindestens einmal in dieser Verbindung". Die echte Häufigkeit ist immer ≥ der gezählten und nach oben unbekannt. |
| **Diagnose-Modus war nie an** | 0 Treffer für „bringt diese Felder mit" in allen 12 Logs; die Feldnamen hängen an `diagnoseAktiv()` (`tiktok-cloud.ts:144-146`, `:199`) | Von **keiner** Nachrichtenart kennen wir Feldnamen aus echtem Betrieb. Alles über Felder stammt aus dem Schema. |

Deshalb gibt es hier nur zwei Ankunfts-Urteile:
**belegt-im-log** (stand namentlich in einer Logdatei) und
**im-schema-aber-ungesehen** (existiert im Protokoll, wurde nie beobachtet).
Ein drittes Urteil — „kommt sicher nie" — wird bewusst nirgends vergeben.

### Wann dieses Dokument zu erneuern ist

Bei jedem Update von **`tiktok-live-connector`** oder **`tiktok-live-proto`**.
Dann gilt:

1. `npm run inventar` in eine **Wegwerfdatei** umleiten und die grobe
   Maschinen-Sicht mit den Tabellen hier vergleichen — neue `Webcast*`-Arten und
   verschwundene Namen fallen dabei sofort auf.
2. Der Wächtertest `apps/desktop/src/main/adapters/cloud-vollstaendigkeit.test.ts`
   vergleicht die Abos des Adapters mit `TYPE_TO_EVENT` des Routers und schlägt
   an, wenn eine Seite ohne die andere gepflegt wurde. Er ersetzt dieses
   Dokument nicht, fängt aber die teuerste Fehlerklasse ab.
3. Ändert sich `WebcastEventMap` in `lib-CbB_CSnH.js`, ändern sich womöglich die
   **Kurznamen**, die eulerstream schickt — siehe den nächsten Abschnitt.

Das Skript liefert die grobe Maschinen-Sicht (was im Schema steht), dieses
Dokument die geprüfte (was tatsächlich ankommt und was es wert ist).

---

## 0. Fünf Dinge über den Transportweg, die alles andere erklären

**a) eulerstream schickt ZWEI Schreibweisen durcheinander.** Neben den
Protokollnamen (`WebcastGiftMessage`) kommen auch die Kurznamen der Bibliothek
(`superFan`, `rankUpdate`). Belegt: `superFan` steht 6× als unbekannte Art in
den Logs, und in `c259c9f2-…log:1109/1110` stehen `superFan` und
`WebcastBarrageMessage` auf **dieselbe Millisekunde** (00:49:47.229) in
derselben Verbindung — beides `log.einmal`-Marker, also je das erste ihrer Art.
Dasselbe Ereignis, zweimal benannt. Der Router bildet deshalb konsequent beide
Formen ab (`tiktok-cloud.ts:56-124`).

**b) Doppelte Ereignisse werden über `common.msgId` weggeworfen.**
`tiktok-adapter.ts:635-643` führt eine `seenMsgIds`-Map (Aufräumen ab 3000
Einträgen). Deshalb kostet es nichts, beide Schreibweisen zu mappen.

**c) Unbekannte Arten kommen im selben Paket wie die bekannten.** Der Client
bestellt keine Teilmenge: `buildCloudUrl` (`tiktok-cloud.ts:29-37`) schickt nur
`uniqueId`, `apiKey` und `features.bundleEvents`. Was fehlt, fehlt also nicht,
weil wir es nicht abonniert hätten.

**d) Der Cloud-Weg kennt die eigene Identität nicht.** Aus `roomInfo` liest
`leseHost` (`tiktok-cloud.ts:252-267`) nur `nickname` und `avatar` — **keine
userId, keine roomId**. Die `roomId` wird ausschließlich im Direkt-Weg gesetzt
(`tiktok-adapter.ts:516-517`). Jede Funktion nach dem Muster „ist das ICH?"
(PK-Sieger, Ranglisten-Gewinn, Verwarnung an mich) ist im Standardmodus deshalb
nicht sauber baubar, sondern nur über Nickname-Raten.

**e) Stream-Ende kommt in der Praxis vom WebSocket, nicht vom Protokoll.** Alle
sieben „Stream beendet"-Vorfälle in den Logs zeigen dasselbe Muster: erst
„Verbindung getrennt", 28–37 ms später „Stream beendet", dann sofort das zweite
„getrennt" (z. B. `145269a2-…log:391-395`, `455bde79-…log:87-91`,
`c259c9f2-…log:1091-1095`). Genau das ist `tiktok-cloud.ts:385` — Close-Code
4005 (`STREAM_END_CLOSE_CODES`, `:315`). Käme das Signal aus einem
`WebcastControlMessage`, läge es **vor** der Trennung.

---

## 1. Was die App heute auswertet

### 1.1 Live-Nachrichten mit vollem Durchstich

Diese Arten werden geroutet (`TYPE_TO_EVENT`, `tiktok-cloud.ts:56-124`),
abonniert (`tiktok-adapter.ts:648-698`), normalisiert (`tiktok-normalize.ts`)
und landen als `StudioEvent` in der Trigger-Engine
(`packages/trigger-engine/src/index.ts:21-43`, 12 Ereignisarten).

| Nachrichtenart | Kurzname | Ereignis | Normalisierer | Was wir davon lesen |
| --- | --- | --- | --- | --- |
| `WebcastChatMessage` | `chat` | `chat` | `normalizeChat` (`tiktok-normalize.ts:191`) | Nutzer, Text, Rollen — **`emotes` NICHT** (siehe unten) |
| `WebcastGiftMessage` | `gift` | `gift` | `normalizeGift` (`:171`) | Nutzer, Geschenk, Anzahl, Coins (`coinsPerUnit × count`, `:213`/`:228`) |
| `WebcastLikeMessage` | `like` | `like` | `normalizeLike` (`:234`) | Nutzer, Anzahl, Gesamtzahl |
| `WebcastMemberMessage` | `member` | `join` | `normalizeSocial` (`:388`) | Beitritte |
| `WebcastRoomUserSeqMessage` | `roomUser` | `viewer_count` | `normalizeViewerCount` (`:396`) | Zuschauerzahl |
| `WebcastSocialMessage` | — | `follow` / `share` | `normalizeSocial` (`:388`) | Aufgeteilt nach `common.displayText.displayType` (`tiktok-cloud.ts:151-156`) |
| `WebcastSubNotifyMessage` | `subNotify` | `sub` | `normalizeSub` (`:269`) | Nutzer, Monate, Erst-Abo vs. Verlängerung (`oldSubscribeStatus`) |
| `WebcastEnvelopeMessage` | `envelope`, `superFanBox` | `envelope` | `normalizeEnvelope` (`:309`) | Absender, Coin-Wert, Gewinnerzahl; Superfan-Truhe an `businessType` 19 |
| `WebcastEmoteChatMessage` | `emote` | `emote` | `normalizeEmote` (`:447`) | Nur den Nutzer — **`emoteList` wird verworfen** (`:451`) |
| — (nur Kurzname) | `superFan`, `superFanJoin` | `superfan` | `normalizeSuperfan` (`:356-369`) | Nutzer aus `content.pieces[].userValue.user` |

### 1.2 Live-Nachrichten ohne Bus-Ereignis (bewusst)

| Nachrichtenart | Wohin | Warum kein Ereignis |
| --- | --- | --- |
| `WebcastRankUpdateMessage` / `rankUpdate` | `leseRangUpdate` (`tiktok-rank.ts:49`) → `studio.ts:1570-1584` → `onRankChange` → IPC | Der Platz ist ein **Zustand**, kein Vorfall (`tiktok-rank.ts:3-6`). Die Änderung wird schon erkannt und nur bei echtem Wechsel geloggt (`studio.ts:1579-1581`). |
| `WebcastControlMessage` | `tiktok-cloud.ts:157-168` | Aktion 3 (ENDED) und 4 (SUSPENDED) werden zu `streamEnd`; bei 4 zusätzlich eine Klartext-Warnung „TikTok hat deinen Live UNTERBROCHEN". |
| `roomInfo` (Euler-Rahmen) | `leseHost` (`tiktok-cloud.ts:252`) → `on('hostInfo')` (`tiktok-adapter.ts:689`) | Name und Bild des Streamers, kein Zuschauer-Ereignis. |
| `tiktok.connect` / `tiktok.disconnect` | `tiktok-cloud.ts:170-176` | Verbindungssignale. |

### 1.3 Was in genutzten Nachrichten **ungelesen** liegt

Das ist der billigste Teil des ganzen Dokuments: Nachrichten, die nachweislich
ankommen, deren Felder wir aber nicht auslesen.

- **`WebcastSubNotifyMessage.eventTracking`** (`v3.d.ts:7554`, Typ
  `RoomNotifyMessageEventTracking` mit `giftSubSenderId`, `giftSubReceiverId`,
  `anchorId`, `giftSubOrderCreateTime`, `v3.d.ts:6606-6611`) und
  **`isSend`** (`v3.d.ts:7548`). Beide werden in `normalizeSub`
  (`tiktok-normalize.ts:269-297`) nicht gelesen — Suche nach `eventTracking`
  bzw. `isSend` in der Datei: 0 Treffer. Damit fehlt heute die Antwort auf
  „**wer** hat **wem** ein Abo geschenkt", obwohl sie mitgeliefert wird.
- **`WebcastGiftMessage.matchInfo`** (`v3.d.ts:7001`) — die einzige belegte
  PK-Verbindung an einer Nachricht, die sicher ankommt. Ungelesen; welche Felder
  sie im Cloud-Weg trägt: **unbelegt**.
- **`WebcastChatMessage.emotes`** (`v3.d.ts:6917`) — die Sticker der Nachricht.
  `normalizeChat` liest sie nicht, und `chat-box.js:153` verwirft jede Nachricht
  ohne Text. Sticker-Nachrichten haben als Text nur ein Leerzeichen und
  **verschwinden dadurch spurlos**. Im Mitschnitt vom 20.08.2026 (@hi_im_billa,
  90 s) waren das **8 von 21 Chat-Nachrichten — 38 %**. Entwurf:
  `docs/specs/2026-08-20-sticker-sichtbar-design.md`.
- **`publicAreaMessageCommon.portraitInfo.portraitTag[]`** — liegt an **jeder**
  Chat-Nachricht und sagt, wie lange dieser Zuschauer schon folgt
  (`followedDays`), im Fanclub ist (`memberDays`) und Superfan ist (`subForMo`),
  jeweils mit Zahl in `showArgs` (JSON-**String**). Im Mitschnitt: 437 Tage /
  424 Tage / 2 Monate. Ebenso ungelesen: **`clientEnterSource`** an
  Beitritts-Nachrichten (woher der Zuschauer kam, z. B. `live_merge-live_cover`)
  und **`user.followInfo.followerCount`** (wie groß der Zuschauer selbst ist).
  Diese Felder fehlten hier, weil dieses Dokument aus dem Protokoll-Schema
  erzeugt wird und sie tief in `publicAreaMessageCommon` liegen — **gefunden nur
  durch einen echten Mitschnitt.** Entwurf:
  `docs/specs/2026-08-20-zuschauer-daten-design.md`.

---

## 2. Ungenutzt — und es lohnt sich (nach Wert sortiert)

Vorab die ehrliche Gesamtlage: **Keine einzige der 22 geprüften Arten erreicht
den Wert „hoch".** Zwei erreichen „mittel", und selbst die sind Wetten. Der
eigentliche Ertrag dieser Prüfung sind vier kleine Arbeiten am **Bestehenden**,
die zusammen weniger kosten als jede einzelne neue Nachrichtenart.

### 2.0 Zuerst: die vier billigen Sachen (Aufwand klein, Nutzen belegt)

| # | Was | Warum | Beleg |
| --- | --- | --- | --- |
| 1 | **`'WebcastLinkMicBattle'` und `'WebcastLinkMicArmies'` aus `HARMLOSE_ARTEN` streichen** | Solange sie dort stehen, kann **prinzipiell nie** beantwortet werden, ob PK-Nachrichten im Cloud-Weg ankommen. Zwei Wörter Code. | `tiktok-cloud.ts:243`; Stummschaltung wirkt über `:186` |
| 2 | **Anonymes Superfan-Ereignis untersuchen** | In den Logs **nach** v0.48.0 steht 3× eine „ohne erkennbaren Absender"-Warnung 1–4 ms **vor** der ersten Barrage-Zeile derselben Verbindung (`455bde79:66/67`, `455bde79:85/86`, `7c051dab:33/34`); in den Logs davor 0×. Das passt exakt dazu, dass `normalizeSuperfan` (`tiktok-normalize.ts:356-369`) keinen Nutzer findet und ein namenloses Ereignis publiziert (`tiktok-adapter.ts:~601`). Der Streamer bekommt dann „X ist Superfan" **ohne X**. Nicht bewiesen: die Warnung nennt den Ereignistyp nicht, und `emote` wurde im selben Release gemappt. Diagnose-Modus klärt es. | Logzeilen s. links |
| 3 | **`eventTracking` + `isSend` in `normalizeSub` mitlesen** | Schenker und Beschenkter bei verschenkten Abos — auf einer Nachricht, deren Ankunft belegt ist. Ein paar Zeilen. | `v3.d.ts:7548`/`:7554`, `tiktok-normalize.ts:269-297` |
| 4 | **`cookieJar`-Fehler beim Galerie-Abruf beheben** | „Die Geschenke-Galerie ließ sich nicht abrufen: Cannot read properties of undefined (reading 'cookieJar')" steht in 4 von 5 Logs (`128d77f4:25`, `145269a2:36`, `7c051dab:22`, `455bde79:61`) — der Abruf startet, bevor die HTTP-Clients stehen. Der Schutzcode dagegen existiert bereits (`tiktok-adapter.ts:331-346`), greift aber offenbar nicht in allen Fällen. | s. links |

Ein fünfter Kandidat kostet zwei Zeilen und ist nur **vorsorglich** sinnvoll:
`tiktok-cloud.ts:370` emittiert `this.emit('streamEnd', {})` **ohne Nutzlast**.
Die Unterscheidung „ich habe aufgehört" vs. „TikTok hat mich gestoppt" existiert
also nur als Logzeile (`:163-166`) und kommt beim Adapter nie an. Der Direkt-Weg
reicht sie durch (`lib-CbB_CSnH.js:2006`: `emit("streamEnd", {action})`).
Einschränkung: Aktion 4 (SUSPENDED) wurde in 12 Logs **nie** beobachtet — die
Warnung „TikTok hat deinen Live UNTERBROCHEN" kommt 0× vor.

### 2.1 `WebcastLinkMicBattle` + `WebcastLinkMicArmies` — Wert **mittel**, Aufwand **groß**

**Ankunft: im-schema-aber-ungesehen — und aus den vorhandenen Logs prinzipiell
nicht feststellbar**, weil beide Arten selbst stummgeschaltet sind
(`tiktok-cloud.ts:243`). `grep -ric battle` = 0 in allen 12 Logs, das beweist
in beide Richtungen nichts.

Dass sie in der Liste stehen, ist **kein** Indiz für „kommt an": `git log -S`
liefert für beide genau **einen** Commit — `15927d5` („release: v0.46.0",
31.07.2026), also den Commit, der die Liste überhaupt erst gebaut hat. Sie
wurden spekulativ gesetzt. Dass diese Rate-Runde daneben lag, steht im Code
selbst: `WebcastRankUpdateMessage`/`WebcastRankTextMessage` standen im gleichen
Ursprungs-Set und mussten wieder heraus („Die Ranglisten-Nachrichten standen
kurz fälschlich hier", `tiktok-cloud.ts:236-239`) — und `WebcastRankTextMessage`
tauchte danach tatsächlich in einem echten Log auf (`455bde79-…log:64`).

**Schema (vollständig geprüft, alle Felder existieren):**
`WebcastLinkMicBattle` `v3.d.ts:7142-7180` mit `battleId`, `battleSettings`,
`action`, `battleResult`, `anchorsInfo`, `armies`, `teamBattleResult`.
`BattleSetting` `:5346-5361` (`startTimeMs`, `endTimeMs`, `duration`, `status`).
`BattleSettingsBattleStatus` `:149-156` (NOT_STARTED … PUNISH_FINISHED).
`LinkMicBattleBattleAction` `:3821-3835` (INVITE=1 … FINISH=5, ACCEPT=7).
`BattleResult` `:5334-5341`, `BattleResultResult` `:138-142` (WIN/LOSE/DRAW).
`WebcastLinkMicArmies` `:7113-7130` mit `armies` als **Map**,
`totalDiamondCount` `:7127`; `BattleUserArmies` `:5377`, `BattleUserArmy` `:5384`
(userId, score, nickname, avatarThumb, diamondScore).

**Nutzen:** Für Agenturen ist die Zahl „12 Kämpfe, 7 gewonnen" echt gefragt. Für
Chris (2–21 Zuschauer, Tic Tac Toe mit dem Chat, `d470225d-…log` 17:02:05
„Tic Tac Toe gestartet") gibt es in fünf Sessions keinen einzigen Hinweis auf
ein PK. Und den laufenden Punktebalken zeichnet TikTok den Zuschauern ohnehin
selbst — neu wäre allein die Unterstützer-Bestenliste je Seite.

**Zwei Befunde, die den Nutzen im Cloud-Modus direkt beschädigen:**

- *Wer gewonnen hat, ist nicht sauber bestimmbar.* `battleResult` ist eine Map
  über `userId` und enthält **keinen Namen** (`v3.d.ts:5334-5341`). Der saubere
  Schlüssel wäre `BattleBaseUserInfo.roomId` (`:4903`) — die liefert der
  Cloud-Weg nicht (belegt im Log: „Der Cloud-Weg liefert keine Raum-Nummer",
  `c259c9f2-…log`, Quelle `studio.ts:419-424`). Bliebe Nickname-Raten.
- *WIN = 0 ist der Protobuf-Standardwert* (`v3.d.ts:138-142`). Fehlt das Feld
  oder ist es 0, liest man „gewonnen". Ob eulerstream Standardwerte mitschickt:
  **unbelegt**. Die Agentur-Zahl wäre damit systematisch zu optimistisch.

**Aufwand:** Kein Router-Einzeiler. Vergleichsmaß: `envelope` — ein simples
Vorfalls-Ereignis mit drei Zahlen — berührte 7 Nicht-Test-Dateien. PK ist kein
Vorfall, sondern ein **Zustand mit Phasen**, und für Zustände nutzt das Projekt
bewusst nicht den Ereignis-Bus (Begründung bei den Ranglisten,
`tiktok-rank.ts:3-6`). Nötig wären: aus `HARMLOSE_ARTEN` raus, beide
Schreibweisen in `TYPE_TO_EVENT` (Kurznamen `linkMicBattle`/`linkMicArmies`,
`lib-CbB_CSnH.js:590`/`:591`), Erweiterung der `CloudEmitEvent`-Union
(`tiktok-cloud.ts:39-40`), Abos, Normalisierung inkl. Join
`battleResult(userId) × anchorsInfo`, Zustandshalter, IPC, Widget mit
Countdown, Oberfläche, streamübergreifende Statistik. **Beide Arten nur
zusammen** — der laufende Punktestand ohne Anfang, Ende und Ergebnis ist
schlechter als keiner.

**Empfehlung:** Später. Sofort nur Punkt 1 aus 2.0 (entstummen) und einmal mit
Diagnose-Modus streamen. Solange kein Log einen echten Kampf zeigt, wäre jeder
Bau eine Wette.

### 2.2 `WebcastGoalUpdateMessage` — Wert **niedrig**, Aufwand **mittel**, aber die einzige *belegt ankommende* ungenutzte Art mit Substanz

**Ankunft: belegt-im-log, Cloud-Weg.** Drei Treffer in Sessions, die laut Log
auf Cloud liefen: `7c051dab:141` (Modus `:19`), `128d77f4:397` (Modus `:41`),
`d470225d:137` (Modus `:19`). Landet heute im `default`-Zweig
(`tiktok-cloud.ts:180-201`) und wird verworfen.

**Sauber nachgerechnete Korrelation:** „Hand Heart ×1 (id 5660) · 100💎" kommt
in den fünf Logs genau 3× vor (`7c051dab:139`, `128d77f4:395`, `d470225d:135`),
und **jedes Mal** folgt das GoalUpdate 1–4 ms später. Negativkontrolle hält:
`145269a2` hat 27 Geschenke inklusive Diamond Tree mit 1088 Coins (`:360`) und
**kein** GoalUpdate. Es hängt am konkreten Geschenk, nicht am Coin-Wert. Die
naheliegende Deutung „der Streamer hat in der TikTok-App ein LIVE-Ziel mit
Zielgeschenk Hand Heart gesetzt" ist plausibel, aber **unbelegt** — kein Log
nennt ein Ziel.

**Der Haken:** Belegt ist ausschließlich der **Typname**. Die Felder
(`goal.description`, `contributeSubgoal.progress/.target/.gift`,
`contributorDisplayId`, `contributorAvatar`) sind reine Schema-Lektüre
(`v3.d.ts:4840-4855`, `LiveStreamGoal :1696`, `LiveStreamSubGoal :1737`). Ob
eulerstream sie befüllt und ob `target`/`progress` ≠ 0 sind: **unbelegt**.

**Nutzen:** Schwach. Die App hat den Balken bereits — `packages/widget-kit/goal-bar.js`
kennt die Metriken coins/likes/follows/gifts (`:153`) und zeichnet aus
`stats.totals` (`:218`). Das TikTok-Ziel wäre keine neue Funktion, sondern eine
**zweite Datenquelle** für ein vorhandenes Widget — und eine, die sich seltener
bewegt als die vorhandene (3× in fünf Sessions gegenüber jedem Geschenk). Für
PK/Ranglisten trägt sie nichts bei (kein Battle-Feld in `v3.d.ts:4840-4855`).

**Empfehlung: später — aber nur nach einem kostenlosen Beweis.** Eine Session
mit **eingeschaltetem Diagnose-Modus** fahren (0 Zeilen Code,
`tiktok-cloud.ts:199` hängt dann die Feldnamen an) und nachsehen, ob `goal` und
`contributeSubgoal` überhaupt befüllt ankommen. Leer oder 0 → ersatzlos
streichen. Was man **auf keinen Fall** tun darf: die Art in `HARMLOSE_ARTEN`
aufnehmen — das löscht die einzige Spur.

### 2.3 Was in Abschnitt 2 bewusst **nicht** steht

`WebcastBarrageMessage`. Sie kommt nachweislich an (10× in den fünf neuen Logs,
7× in den älteren), und trotzdem wäre ein Eintrag `WebcastBarrageMessage:
'superFan'` in `TYPE_TO_EVENT` **ein Bug** — Begründung in Abschnitt 3.

---

## 3. Ungenutzt und es lohnt sich **nicht** — je ein Satz, damit es niemand nochmal prüft

Sortiert nach Nachrichtenart. „ungesehen" heißt: in 12 Logs / 27 Verbindungen
nie namentlich aufgetaucht, obwohl der Melder in `tiktok-cloud.ts:186-200` sie
gefangen hätte (Ausnahmen sind markiert).

| Nachrichtenart | Ankunft | Warum es sich nicht lohnt |
| --- | --- | --- |
| `WebcastBarrageMessage` | **belegt-im-log** (10× neu, 7× alt) | Der Superfan-Zweig läuft bereits über die Kurznamen (`tiktok-cloud.ts:81-82`, seit v0.48.0 / `552ebad`), und eulerstream schickt beide Schreibweisen desselben Ereignisses (`c259c9f2:1109/1110`, identische Millisekunde) — ein Mapping würde ohnehin per `msgId` wegdedupt. Es als `superFan` zu mappen wäre sogar **schädlich**: Die Bibliothek emittiert superFan nur, wenn `content.key` „ttlive_superfan" enthält (`lib-CbB_CSnH.js:2014-2016`), sonst `barrage` (`:2017`) — Barrage ist der Träger **aller** Banner (`userGradeParam`, `fansLevelParam`, `giftGalleryParams`, `v3.d.ts:6854-6859`), aus jedem Ranglisten-Banner würde ein Superfan. |
| `WebcastControlMessage` (ungenutzte Teile: Aktion 1/2, `extra`, `punishInfo`) | ungesehen | Aktion 4 (SUSPENDED) kam in 12 Logs **0×** vor; Pause/Unpause wäre ein neuer globaler Pausenzustand quer durch TTS, Sounds, Timer und Widgets, und `violationReason` ist kein String, sondern ein Template (`v3.d.ts:3427-3432`). Der Nutzen liegt in den zwei Zeilen aus 2.0, nicht in der Nachricht. |
| `WebcastLinkmicBattleTaskMessage` | ungesehen | Die versprochenen Inhalte gibt sie nicht her: `taskUpdate.fromUserId` ist eine nackte ID ohne Nutzer-Objekt (`v3.d.ts:7293-7301`), und das Ziel steht in einer **anderen** Teilnachricht (`start.config.targetConfig.progressTarget`, `:5217`) — bei Verbindung mitten im Kampf käme Fortschritt ohne Ziel an. |
| `WebcastLinkMicBattlePunishFinish` | ungesehen | Der versprochene Straf-Countdown ließe sich exakt aus `BattleSetting.endTimeMs` (`v3.d.ts:5356`) bauen; die Nachricht ergänzt nur den Sonderfall `reason=CUT_SHORT` (`:3816-3818`) auf einer Anzeige, die es nicht gibt. |
| `WebcastLinkMicBattleItemCard` | ungesehen | 13 eigene Kartentypen (kein gemeinsames `CommonCardInfo` — `cardInfo` ist `CriticalStrikeCardInfo` `v3.d.ts:6706`, `SmokeCardInfo` `:6721`, …), `cardNameKey` ist ein Übersetzungsschlüssel, und die Kartenwirkung rendert TikTok den Zuschauern selbst. |
| `WebcastPollMessage` | ungesehen | `packages/widget-kit/live-poll.js` existiert bereits fertig (249 Zeilen + Test) mit `!1`-Erkennung, einer Stimme je Zuschauer, Balken, Timer, Sieger-Enthüllung und Auto-Neurunde — und funktioniert in **beiden** Verbindungswegen, statt die Optionen in der TikTok-App setzen zu müssen. |
| `WebcastQuestionNewMessage` | ungesehen | „Beantwortete Fragen verschwinden automatisch" ist **nicht baubar**: Im ganzen v3-Proto gibt es genau **eine** Question-Nachricht (`v3.d.ts:7426`), kein QuestionAnswered/Update/Delete, und `answerStatus` ist ein nacktes `number` ohne Enum (`:6540`). |
| `WebcastRoomPinMessage` | ungesehen — **aber stummgeschaltet** (`tiktok-cloud.ts:241`), Null wertlos | Chris streamt vom PC und müsste zum Anpinnen zum Handy greifen, während `text-label` und `text-ticker` dasselbe ohne zweites Gerät leisten; dazu ist ein Pin ein **Zustand** bis PIN_CANCEL, den der Ereignis-Bus bei jedem Reconnect verliert. |
| `WebcastSubPinEventMessage` | ungesehen (nicht stumm) | Wird von einer belegt ankommenden Nachricht dominiert: `WebcastGoalUpdateMessage` (`v3.d.ts:4840-4855`) liefert Ziel **und** Fortschritt **und** die Beitragenden, `SubPinCard` (`v3.d.ts:1073-1104`) nur `target`/`progress`. |
| `WebcastRankTextMessage` | **belegt-im-log**, 1× (`455bde79:64`) | Der versprochene Vorher/Nachher-Alert ist längst gebaut — `studio.ts:1574-1582` vergleicht den alten mit dem neuen Stand und loggt nur bei echter Änderung, gespeist aus `rankUpdate`, das im Minutentakt kommt statt 1× in 12 Sessions. Die Bedeutung von `scene` deutet ohnehin auf **Zuschauer**-Top-N, nicht auf den Streamer-Platz (`v3.d.ts:3914-3920`), und `content` ist ein Template mit `pieces[]`. |
| `WebcastHourlyRankRewardMessage` | ungesehen | In allen 12 Logs steht **0×** `[Rangliste]` — die Streamer platzieren sich nicht einmal, geschweige denn gewinnen sie; außerdem bräuchte „ist meine userId dabei?" die eigene userId, die es im Cloud-Modus nicht gibt (siehe 0d). |
| `WebcastRoomNotifyMessage` | ungesehen | Der behauptete Alleinstellungsvorteil ist **widerlegt**: `giftSubSenderId`/`giftSubReceiverId` stecken in identischem Typ auch an `WebcastSubNotifyMessage` (`v3.d.ts:7554`), das die App schon empfängt — Aufgabe 3 aus 2.0 statt einer neuen Art. |
| `WebcastGiftBroadcastMessage` | ungesehen | Sie trägt **keine** giftId, kein diamondCount, kein repeatCount und keinen Nutzer (`v3.d.ts:6958-6963`); der Nutzen „Mega-Geschenk-Alert" ist dreifach besser gelöst (`trigger-engine/src/index.ts:459`, `tts-announce.ts:21`, `widget-sounds.ts:24`), und die eigene Schwelle ist einstellbar, TikToks nicht. |
| `WebcastCaptionMessage` | **nie messbar** — stumm seit demselben Commit, der das Melden einführte (`15927d5`), Eintrag `tiktok-cloud.ts:242` | Scheitert schon am Schema: **kein Sprecher-Feld** (`v3.d.ts:6896-6904`, und `CommonMessageData` `:3547` hat auch keins) — ein Satz lässt sich niemandem zuordnen, und TikTok blendet Untertitel seinen Zuschauern ohnehin nativ ein. |
| `WebcastImDeleteMessage` | ungesehen — **stummgeschaltet** (`tiktok-cloud.ts:242`), Null wertlos | Die `msgId` wird nirgends weitergereicht (`normalizeChat` gibt `{type,ts,user,text}` zurück, `tiktok-normalize.ts:146-170`; `StudioEvent` hat kein id-Feld), die TTS-Warteschlange kennt nur `{at,text,voice}` — es gibt downstream schlicht nichts, was per id adressierbar wäre. |
| `WebcastPerceptionMessage` | ungesehen | Kein Verwarnungs-Kanal, sondern TikToks generischer Dialog-Transport (`PerceptionDialogIconType` hat 19 Werte, davon 5 straf-bezogen — `TREASURE_BOX`, `GIFT`, `RANKING` … `v3.d.ts:583-604`), und ohne eigene userId wäre „betrifft das mich?" geraten. |
| `WebcastAccessRecallMessage` | ungesehen | `status` ist ein nacktes `number` **ohne Enum** (`v3.d.ts:4793`), `scene` ein nackter String ohne Enum (`:4796`), Einheit von `duration`/`endTime` unbekannt (`:4794-4795`) — man müsste die Bedeutung der Zahlen raten. Sie liegt zudem allein im **Game**-Protomodul (`v3.d.ts:4791-4807`), nicht bei den allgemeinen Live-Nachrichten. |
| `WebcastBottomMessage` | ungesehen | Liefert nur eine nackte `violationUserId` ohne Nickname und ohne Bild (`v3.d.ts:6867-6879`, `PunishEventInfo` `:3516-3527`) — das versprochene Mod-Protokoll würde „Nutzer 7123456789012345678 verwarnt" anzeigen. |
| `WebcastNoticeMessage` | ungesehen | Der einzige Fall, der wirklich trifft („TikTok hat meinen Live gestoppt"), ist über einen belegten Weg schon abgedeckt (`tiktok-cloud.ts:157-168`); `violationReason`, `title` und `displayText` sind `Text`-Templates (`v3.d.ts:3427-3431`), und `noticeType` ist ein `number` ohne Enum im Schema. |
| `WebcastRoomVerifyMessage` | ungesehen (27 Verbindungen) | `closeRoom` ist ein nacktes `boolean` (`v3.d.ts:7517`) ohne dokumentierte Bedeutung („schließt jetzt" oder „würde schließen" — unbelegt), und das Stream-Ende liefert Close-Code 4005 bereits in Millisekunden (siehe 0e). |
| `WebcastGiftPanelUpdateMessage` | ungesehen — trotz 78 Geschenken allein in `128d77f4` | Zwei Kernbehauptungen sind widerlegt: `GalleryData.progress` ist `{[key]: TitleData}` mit nur `goalCount`/`currentSponsorId` (`v3.d.ts:6266-6272`, `:6672-6675`) — kein Balken, kein Countdown; und der Galerie-Abruf **funktionierte mit dem Gratis-Key** (`d470225d:23`), kam nur leer zurück (`:24`). |

**Zwei Klarstellungen am Code, die aus dieser Prüfung folgen:**

1. Der Kommentar in `tiktok-cloud.ts:105-110` behauptet, für superFan/superFanJoin
   gebe es „gar keinen Protokoll-Namen". Das ist **falsch**: `WebcastEventMap`
   wird nur im `default`-Zweig gelesen (`lib-CbB_CSnH.js:2023`), und
   `WebcastBarrageMessage` erreicht `default` nie, weil es ab `:2013` einen
   eigenen `case` hat, der genau superFanJoin/superFan emittiert. Der
   Protokollname **ist** `WebcastBarrageMessage`. `tiktok-normalize.ts:343-347`
   beschreibt den Mechanismus bereits richtig — das Repo widerspricht sich
   selbst.
2. `HARMLOSE_ARTEN` (`tiktok-cloud.ts:240-245`) ist **geraten**, nicht
   beobachtet: alle zehn Einträge kamen im selben Commit `15927d5` herein wie
   der Melder selbst. Es hat nie einen Build gegeben, der diese Arten hätte
   protokollieren können. Wer dort etwas hinzufügt, macht eine Frage dauerhaft
   unbeantwortbar.

---

## 4. Was nur im Direkt-Modus oder nur mit Bezahlplan kommt

**Wichtig vorweg:** Der Standard ist **Cloud**. Der Direkt-Weg braucht einen
**kostenpflichtigen Business-Key** („eulerstream Webcast Signatures",
`SettingsPage.tsx:362`; ohne ihn endet er in „requires a Business plan",
`:367`). Es existiert **kein einziges Direkt-Modus-Log** — alles in dieser
Spalte ist Schema- und Bibliothekslektüre, keine Beobachtung.

| Art / Fähigkeit | Nur dort, weil | Beleg |
| --- | --- | --- |
| **Chat senden** | Im Cloud-Modus schlicht abgelehnt | `tiktok-adapter.ts:256`; im Log: „Chat-Senden NICHT möglich (nicht bei TikTok angemeldet)" (`128d77f4:8`) |
| **`roomId` der Verbindung** | Wird nur im Direkt-Weg gesetzt; im Cloud-Weg fehlt sie | `tiktok-adapter.ts:516-517`; Log „Der Cloud-Weg liefert keine Raum-Nummer" (`c259c9f2-…log`, Quelle `studio.ts:419-424`) |
| **`streamEnd` mit `action`** | Der Direkt-Weg reicht die ControlAction durch, der Cloud-Weg wirft sie weg | `lib-CbB_CSnH.js:2006` gegen `tiktok-cloud.ts:370` |
| **Vollständige `WebcastControlMessage`** | Der Direkt-Weg emittiert `controlMessage` für **alle** Aktionen; der Adapter abonniert es aber nicht (0 Treffer für `controlMessage` in `tiktok-adapter.ts`) | `lib-CbB_CSnH.js:2003-2004` |
| **`fetchAvailableGifts` an der bestehenden Verbindung** | Der Euler-Cloud-WS hat die Methode nicht; im Cloud-Modus wird dafür eine Wegwerf-Direktverbindung gebaut | `tiktok-adapter.ts:277-288` |
| Kurznamen, die die Bibliothek kennt, die App aber nirgends abonniert: `controlMessage`, `roomPin`, `imDelete`, `captionMessage`, `perception`, `accessRecall`, `linkMicBattle`, `linkMicArmies`, `linkMicBattleTask`, `linkMicBattlePunishFinish`, `linkMicBattleItemCard`, `pollMessage`, `questionNew`, `subPinEvent`, `hourlyRank`, `roomNotify`, `giftBroadcast`, `giftPanelUpdate`, `bottomMessage`, `notice` | Vorhandener Pfad in der Bibliothek, **kein** Abo im Adapter (`tiktok-adapter.ts:648-724` listet nur chat, gift, like, follow, share, member, roomUser, subNotify, envelope, superFan, superFanJoin, emote, hostInfo, rankUpdate, streamEnd, disconnected, error) | `lib-CbB_CSnH.js` `WebcastEventMap`, Zeilen 589–644 |

**Was nachweislich *nicht* nur mit Bezahlplan geht** (häufiges Missverständnis):
Der Abruf der **Geschenke-Galerie** hat mit dem Gratis-Key funktioniert —
„Geschenke-Galerie des Streamers abgerufen." steht 3× in `d470225d` (`:23`,
`:191`, `:229`). Die Bezahlplan-Meldung betrifft die **Gift-Liste**, eine andere
Route (`tiktok-adapter.ts:296-302`).

---

## 5. Die HTTP-Abrufe (getrennt von den Live-Nachrichten)

Diese laufen **nicht** über den WebSocket, sondern als signierte HTTP-Aufrufe
neben der Verbindung. Sie haben eigene Fehlerbilder und eigene Bezahlschranken.

| Abruf | Wann | Ergebnis heute | Beleg |
| --- | --- | --- | --- |
| **`fetchIsLive`** (Live-Check) | Vor dem Verbinden, über eine Wegwerf-Verbindung | Funktioniert | `tiktok-adapter.ts:410-419` |
| **`fetchRoomId`** | Als Vorstufe der beiden folgenden Abrufe | Funktioniert | `tiktok-adapter.ts:344`, `:401` |
| **Gift-Liste** (`fetchAvailableGifts`) | Nach dem Connect, best-effort | **Braucht Bezahlplan.** Wird einmalig freundlich gemeldet statt bei jedem Connect gewarnt; gesendete Geschenke werden trotzdem gespeichert. Status wird geführt (`giftListStatus`) | `tiktok-adapter.ts:282-307`, Meldung `:300` |
| **Geschenke-Galerie** (`fetchRoomGiftGalleryFromEulerRoute`) | Nach dem Connect, best-effort | **Mit Gratis-Key erfolgreich** (`d470225d:23`), kam aber **leer** zurück (`:24`: „enthielt aber keine erkennbaren Einträge"). In 4 von 5 Logs scheitert der Abruf stattdessen an `cookieJar` (siehe 2.0 Punkt 4) | `tiktok-adapter.ts:320-372` |
| **`GET /webcast/rooms/{room_id}/connect`** (`rooms.fetchWebcastURL`) | Nur im **Direkt**-Weg — die Bibliothek signiert damit die eigene Verbindung | **402-Bezahlschranke** („requires a Business plan"). Genau deshalb existiert der Cloud-Weg | `tiktok-cloud.ts:1-12`, `SettingsPage.tsx:362`/`:367` |

---

## Anhang: Zahlen zur Prüfung

- **22** ungenutzte Nachrichtenarten wurden einzeln geprüft (Schema + Logs +
  Bibliothek + Nutzen + Aufwand).
- **3** davon sind **belegt-im-log**: `WebcastBarrageMessage`,
  `WebcastGoalUpdateMessage`, `WebcastRankTextMessage`.
- **19** sind **im-schema-aber-ungesehen**.
- **19** wurden aussortiert („lassen"), **3** auf „später" gesetzt
  (`WebcastLinkMicBattle`, `WebcastLinkMicArmies`, `WebcastGoalUpdateMessage`).
- **0** erreichten den Wert „hoch". **2** erreichten „mittel".
- **12** verschiedene unbekannte Arten wurden in den Logs tatsächlich gemeldet:
  `WebcastLiveIntroMessage` (20), `WebcastBarrageMessage` (17),
  `WebcastLinkMicFanTicketMethod` (16), `WebcastRoomMessage` (15),
  `WebcastLinkMicMethod` (13), `superFan` (6), `WebcastLinkLayerMessage` (4),
  `WebcastLinkMessage` / `WebcastGoalUpdateMessage` / `WebcastEnvelopeMessage`
  (je 3), `WebcastUnauthorizedMemberMessage` / `WebcastRankTextMessage` (je 1).
  **Zur Erinnerung: das sind Verbindungen, nicht Nachrichten** (`log.einmal`).

Die drei Arten mit den meisten Meldungen — `WebcastLiveIntroMessage`,
`WebcastLinkMicFanTicketMethod`, `WebcastRoomMessage` — wurden in dieser Runde
**nicht** einzeln geprüft. Für `WebcastLinkMicMethod` und
`WebcastLinkMicFanTicketMethod` gibt es einen belegten Nebenbefund: Sie kommen
millisekundengleich mit Geschenken (`7c051dab`: 22:31:29.096 Geschenk „Heart Me"
→ 22:31:29.110 `WebcastLinkMicMethod`), sind also Geschenk-Verrechnung und
**kein** PK-Signal. Alles Weitere zu diesen drei: **unbelegt**.
