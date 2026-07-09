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

## Weitere (bereits vorhandene) Endpunkte
- `GET /api/panel` — Panel-Knöpfe auflisten · `POST /api/panel/fire` `{id}` — Knopf auslösen
- `POST /api/test-event` — ein TikTok-Event simulieren (`{type, user, gift, …}`) — läuft durch die komplette Kette (Trigger/Stats/Overlay/Sounds)

---

## Für KI-Agenten
Empfohlener Ablauf: erst `GET /api/status` lesen (Kontext: verbunden? welche Zahlen?
läuft ein Spiel?), dann gezielt `POST /api/action`. Das `actions`-Array nennt die
erlaubten Aktionen — nur diese werden ausgeführt, alles andere wird abgelehnt.
