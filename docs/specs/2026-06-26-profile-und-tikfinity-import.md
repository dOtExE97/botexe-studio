# Profil-System + TikFinity-Import — Design

## Ziel
1. **Profile**: Mehrere benannte Konfigurations-Sets, zwischen denen umgeschaltet
   werden kann (z.B. „Mein Setup" ↔ „TikFinity-Import").
2. **TikFinity-Import**: Eine `.tfc`-Datei einlesen, entschlüsseln, auf unser
   Modell übersetzen und als neues Profil anlegen.

## Profil-System

**Ein Profil = Snapshot der Konfiguration** = das bestehende Config-Bundle
(`exportConfig`): `settings` (Trigger, Befehle, Einlösungen, Panel, Giveaway,
TTS, Punkte, Moderation) + `layouts`. Sounds/Medien-**Dateien** bleiben global
(geteilt, per ID referenziert) — nur die Verweise stecken im Profil.

**ProfileStore** (Main, `userData/profiles/`):
- `list()` → [{id, name, active}]
- `create(name, bundle?)` → neues Profil (leer = aktueller Stand)
- `switch(id)`: aktuellen Stand ins aktive Profil sichern (`exportConfig`) →
  Ziel-Profil laden (`importConfig`)
- `rename(id, name)`, `delete(id)`, `getActiveId()`
- `active`-Zeiger persistent.

**UI**: Profil-Dropdown (Topbar/Einstellungen) mit „+ Neu", „Umbenennen",
„Löschen". Beim Wechsel kurzer Hinweis-Toast.

## TikFinity-Import

**Entschlüsselung** (Main, portiert aus dem geknackten Algorithmus):
`CryptoJS.AES.decrypt(file, FIXED_PW)` → `v3:salt:payload` → `shash(salt,3)`
(modifizierte MD5) → vertauschtes Base64 zurück → AES → `b64RawData` reverse →
base64 → uri-decode → JSON. Lib: `crypto-js`.

**Mapping** TikFinity → botexe (reine Funktion, TDD):
| TikFinity | → botexe |
|---|---|
| event triggerTypeId 4 (gift) | trigger `gift` + condition `gift_slug_is` (per giftId→Name aus Master-Liste) |
| 3 (min_coins) | `gift` + `gift_coins_gte` |
| 7 (likes) | `like` | 9 (follow) | `follow` | 6 (join) | `join` | 1 (share) | `share` |
| 11 (chat) | `chat` + `chat_keyword` |
| 2 (command) | **ChatCommand** (eigenes System) |
| whichUserId | conditions (follower/sub/mod/everyone) |
| action `speakText` | `speak` | `sendText` | `send_chat` | `playAudio` | `play_sound` |
| `showImage/Animation/Video` | `play_media` (sofern Asset ladbar) |
| `switchObsScene`/`activateObsSource` | `obs_scene`/`obs_visibility` |
| `setStreamerbotAction` | `streamerbot_action` |
| Text-Overlay, Lottie, Keystroke, Punkte-Aktionen | **nicht unterstützt** → im Bericht gelistet |

**Asset-Download**: Sounds (myinstants → vorhandene `downloadMyInstants`-Funktion
mit SSRF-Allowlist). Andere Audio/Video best-effort, sonst übersprungen.

**Ablauf**: Datei wählen → entschlüsseln → mappen → Assets laden → neues Profil
„TikFinity-Import" anlegen → **Bericht** („X Trigger, Y Befehle, Z Sounds
übernommen; N nicht unterstützt: …"). Aktuelles Profil bleibt unangetastet.

## Etappen
1. **Profil-System** (Store + IPC + UI + Umschalten). Eigenständig nutzbar.
2. **TikFinity-Import** (Entschlüsselung + Mapping + Asset-Download + Import-UI).

## Sicherheit
- Entschlüsselte Config kann Auth-/Channel-Werte enthalten → nur lokal, nie ins
  Repo/Log. Beim Mapping nur Trigger/Aktionen/Sounds übernehmen, keine Tokens.
- Profil-Wechsel sichert immer erst den aktuellen Stand (kein Datenverlust).
