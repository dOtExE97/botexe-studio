# bOtExE Studio — lokale Steuer-API

Eine kleine, **lokale** HTTP-API, über die Programme, Skripte, Stream-Deck oder
eine **KI** den laufenden bOtExE Studio steuern und seinen Zustand lesen können.

- **Adresse:** `http://127.0.0.1:27415` (nur lokal, nicht im Netzwerk erreichbar)
- **Auth:** jeder Aufruf braucht `?token=DEIN_TOKEN`. Den Token findest du in der App
  unter **Einstellungen → Stream Deck** (bzw. im kopierbaren Overlay-Link nach `token=`).
- **Format:** JSON. POST-Body als `application/json`.

Ohne gültigen Token antwortet der Server mit `401/403`. Die API läuft nur, solange
die App offen ist.

---

## Lesen

### `GET /api/status`
Aggregierter, **secret-freier** Zustand (keine Keys/Passwörter — nur „gesetzt"-Flags).

```bash
curl "http://127.0.0.1:27415/api/status?token=DEIN_TOKEN"
```

```jsonc
{
  "connected": true,              // mit TikTok verbunden?
  "platformStatus": "connected",  // roher Status
  "username": "dotexe_97",
  "keySet": true,                 // eulerstream-Key hinterlegt?
  "overlayClients": 1,            // verbundene Browser-Quellen (OBS/TTLS)
  "stats": { "viewers": 342, "likes": 555, "gifts": 12, "coins": 4038, "follows": 3, "comments": 87 },
  "game": { "kind": "quiz", "state": { /* … */ } },  // oder null
  "boss": { "active": false },
  "actions": ["play_sound", "speak", "start_game", "stop_game", "reveal_game", "start_boss", "stop_boss"]
}
```

Das `actions`-Feld ist die **Selbstauskunft**: welche Aktionen `POST /api/action` kennt.

---

## Steuern

### `POST /api/action`
Führt **eine** validierte Aktion aus. Unbekannte/fehlerhafte Aktionen → `400` mit `error`.

```bash
# Sound abspielen
curl -X POST "http://127.0.0.1:27415/api/action?token=DEIN_TOKEN" \
  -H "content-type: application/json" -d '{"kind":"play_sound","soundId":"boom","volume":0.8}'

# Etwas vorlesen lassen (TTS)
curl -X POST "http://127.0.0.1:27415/api/action?token=DEIN_TOKEN" \
  -H "content-type: application/json" -d '{"kind":"speak","text":"Willkommen im Stream!"}'

# Spiel starten / stoppen
curl -X POST "…/api/action?token=…" -d '{"kind":"start_game","game":"hangman","config":{"word":"APFEL"}}'
curl -X POST "…/api/action?token=…" -d '{"kind":"stop_game"}'
```

| kind          | Felder                                   | Wirkung                                  |
|---------------|------------------------------------------|------------------------------------------|
| `play_sound`  | `soundId` (nötig), `volume` 0–1 (opt.)   | Sound abspielen (Soundboard-Kanal)       |
| `speak`       | `text` (nötig, ≤500), `voice` (opt.)     | Text vorlesen (TTS)                      |
| `start_game`  | `game` (quiz/hangman/tic-tac-toe/connect-four), `config` (opt.) | Chat-Spiel starten |
| `stop_game`   | —                                        | laufendes Spiel beenden                  |
| `reveal_game` | —                                        | Quiz auflösen                            |
| `start_boss` / `stop_boss` | —                           | Stream-Boss starten/beenden              |

Antwort: `{ "ok": true }` oder `{ "ok": false, "error": "…" }`.

---

## Twitch-Streamer-Aktionen (Stream Deck)

Brauchen eine Twitch-Anmeldung (Einstellungen → Twitch). Alle per **POST**, Werte als
Query-Parameter (oder gleichnamig im JSON-Body):

| Adresse | Wirkung |
|---|---|
| `POST /api/twitch/clip?token=…` | Clip erstellen — Antwort enthält `url` (Bearbeiten-Link, 24 h gültig) |
| `POST /api/twitch/marker?token=…[&beschreibung=…]` | Stream-Marker setzen (Beschreibung max. 140 Zeichen) |
| `POST /api/twitch/werbung?sekunden=60&token=…` | Werbung starten (`30`, `60`, `90`, `120`, `150`, `180`) |
| `POST /api/twitch/shoutout?token=…[&login=name]` | Shoutout — ohne `login` an den letzten Raider dieser Sitzung |
| `POST /api/twitch/chat-modus?modus=emote&token=…` | Chat-Modus umschalten: `emote`, `langsam` (30 s), `follower` |
| `POST /api/twitch/raid?login=name&token=…` | Raid zu diesem Kanal starten — Twitch zählt 90 s herunter („Jetzt raiden" in Twitch geht sofort) |
| `POST /api/twitch/raid-abbrechen?token=…` | laufenden Raid abbrechen (bis der Countdown durch ist) |

Antwort: `{ "ok": true, "info": "…" }` (HTTP 200) oder `{ "ok": false, "fehler": "…" }`
(HTTP 409, z. B. nicht live, Abklingzeit mit Sekunden, „Bitte Twitch neu verbinden";
HTTP 400 bei falschen Parametern). Jedes Ergebnis steht auch im Log unter `[Twitch]`.
Twitch-Regeln (Belege: `docs/twitch-api-belege.md`, Abschnitte 10 und 11.5): Clip/Marker/Werbung/Shoutout
nur live; Werbung nur als Partner/Affiliate; Shoutout höchstens alle 2 Minuten, an denselben
Kanal alle 60 Minuten. Raid: höchstens 10 Anfragen in 10 Minuten (starten und abbrechen
zusammen); Fehler auf Deutsch für unbekanntes Ziel, „nimmt keine Raids an / blockiert / nicht
live", „Raid läuft schon" und das Limit. Ob man für einen Raid live sein muss, sagen die Docs
nicht — Twitchs eigene Begründung hängt dann am Fehlertext. Ohne `login` → HTTP 400.

Ereignisse von Twitch für eigene Widgets (über den Overlay-WebSocket, `plattform: "twitch"`):

| `type` | Felder | Hinweis |
|---|---|---|
| `follower_stand` | `followerStand: { anzahl }` | Follower-Zahl des Kanals: beim Verbinden, alle 10 Min., +1 je Follow; sticky (neu geladene Overlays bekommen sofort den letzten Wert) |
| `kanalpunkte` | `kanalpunkte: { titel, kosten, eingabe? }`, `user`, `text` (= Eingabe) | Kanalpunkte-Belohnung eingelöst (nur Affiliate/Partner) |

Beide lassen sich über `POST /api/test-event` ausprobieren, z. B.
`{"type":"follower_stand","plattform":"twitch","followerStand":{"anzahl":42}}` oder
`{"type":"kanalpunkte","plattform":"twitch","user":{"id":"twitch:1","nickname":"Pia"},"kanalpunkte":{"titel":"Kanone","kosten":500}}`.

---

## Weitere (bereits vorhandene) Endpunkte
- `GET /api/panel` — Panel-Knöpfe auflisten · `POST /api/panel/fire` `{id}` — Knopf auslösen
- `POST /api/test-event` — ein TikTok-Event simulieren (`{type, user, gift, …}`) — läuft durch die komplette Kette (Trigger/Stats/Overlay/Sounds). Wie der Test-Knopf in der App: **simuliert**, also ohne Punkte-Gutschrift, ohne Eintrag im Geschenk-Katalog und ohne Einfluss auf eine laufende Aufnahme.

---

## Für KI-Agenten
Empfohlener Ablauf: erst `GET /api/status` lesen (Kontext: verbunden? welche Zahlen?
läuft ein Spiel?), dann gezielt `POST /api/action`. Das `actions`-Array nennt die
erlaubten Aktionen — nur diese werden ausgeführt, alles andere wird abgelehnt.
