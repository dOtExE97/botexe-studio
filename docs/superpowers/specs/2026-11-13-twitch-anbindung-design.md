# Twitch-Anbindung + Twitch-Overlay (Querformat) — Design

Stand 13.11.2026 · Auftrag von Alex: „Ja mach die Verbindung zu Twitch. Und nen Twitch-Mode (Querformat) Overlay. Dass TT und Twitch getrennt laufen könnten, aber jeweils mit Chat-Anzeige.“

## Warum

- TikTok hat Alex' LIVE am 13.11. für 30 Tage gesperrt, sehr wahrscheinlich wegen des Piraten-Orakels
  (Zufallsziehung + „Chance 1 : …“ pro Follow wirkt für TikTok wie Glücksspiel/Follow-Köder).
- Das Orakel hat in einer Stunde ~600 Follower gebracht. Auf Twitch sind solche Follow-Animationen üblich.
- Ziel: Die App spricht zusätzlich mit Twitch. TikTok und Twitch laufen getrennt, jedes mit eigenem Overlay und eigenem Chat.

## Ziele

1. **Twitch verbinden** in den Einstellungen: Client-ID eintragen, „Mit Twitch verbinden“, Code im Browser bestätigen, fertig.
   Danach verbindet die App beim Start automatisch (Token wird erneuert).
2. **Twitch-Ereignisse** kommen als normale `StudioEvent`s in die App: Follow, Chat (mit Emotes, Mod/Sub-Kennung, Profilbild),
   Sub/Resub/Geschenk-Subs, Bits (Cheer), Raid, Stream online/offline.
3. **Getrennt laufen**: Jedes Overlay (Layout) hat eine Plattform: `alle` (Standard, wie heute), `tiktok` oder `twitch`.
   Ein Overlay bekommt nur Ereignisse und Alarm-Aktionen seiner Plattform. So zeigt der TikTok-Chat nur TikTok, der Twitch-Chat nur Twitch.
4. **Twitch-Overlay-Vorlage (Querformat 1920×1080)** mit Chat, Herz-Alarm (Follow → Piraten-Orakel an), Piraten-Banner, Follow-Alert.
5. **Chat-Anzeige** kann optional ein kleines Plattform-Zeichen (TikTok/Twitch) zeigen — für Leute, die ein gemischtes Overlay wollen.

## Nicht-Ziele (v1)

- Chat **senden** nach Twitch, Kanalpunkte-Belohnungen, Hype-Train, Twitch-Vorhersagen.
- Eigene Trigger-Regeln „nur Twitch“ (Regeln feuern für beide Plattformen; die Aktion landet aber nur im passenden Overlay).
- Twitch-Zahlen in den TikTok-Statistiken.

## Anti-Ziele (was es kaputt machen würde)

- **Bestehende Overlays ändern sich nicht.** Ein Layout ohne Plattform-Feld verhält sich exakt wie heute (`alle`).
- Kein Client-Secret in der App (öffentliche App, öffentliches Repo). Tokens nur verschlüsselt (Secret-Liste), nie im Log.
- Kein Raten bei Twitch-Feldnamen: Grundlage ist `docs/twitch-api-belege.md` (aus der offiziellen Doku).
- Das Piraten-Orakel bleibt auf TikTok-Overlays **aus** (Standard der Art `follow` ist ohnehin aus).

## Entscheidungen (meine Calls, von Alex nicht einzeln abgesegnet)

| Thema | Entscheidung | Warum |
|---|---|---|
| Login | **Device-Code-Flow** (öffentlicher Client, kein Secret, kein Rückruf-Port) | Overlay-Port kann um +1..+10 springen → Redirect-URI wäre instabil; DCF braucht keinen |
| Client-ID | Nutzer trägt eigene Client-ID ein (wie bei Spotify) | Repo ist öffentlich; jede Person registriert eigene App |
| Transport | **EventSub WebSocket** (`wss://eventsub.wss.twitch.tv/ws`) | offiziell, kein öffentlicher Server nötig |
| Plattform-Feld | `StudioEvent.plattform?: 'tiktok' \| 'twitch'`; fehlt = „gilt für alle“ (Timer, Test, Replay) | rückwärtskompatibel |
| Nutzer-IDs | Twitch-Nutzer `id = 'twitch:<user_id>'` | keine Kollision mit TikTok-IDs (Punkte, Spiele, Erst-Follow) |
| Neue Ereignisarten | `raid`, `cheer` neu in `StudioEventType`; Twitch-Sub → `sub` mit `subMonths`, Geschenk-Subs → `sub` mit `subGeschenk` | Widgets ignorieren Unbekanntes; `sub` gibt es schon |
| Emotes | Twitch-Emote-Fragmente → `sticker[]` (gleiches Format wie TikTok-Sticker, Bild-URL vom Twitch-CDN) | Chat-Box zeigt sie ohne Umbau |
| Profilbilder | Helix „Get Users“ mit Zwischenspeicher (max. 100 IDs/Abfrage), Chat wartet nicht darauf | Twitch-Chat-Ereignisse haben kein Bild |
| Sticky-Werte | Bus merkt „letzter Wert“ je Art **und** Plattform | sonst überschreibt Twitch-Chat den TikTok-Wert |
| Statistik | `stats.apply` zählt nur Ereignisse ohne Plattform oder `tiktok` | TikTok-Zahlen bleiben sauber |
| Aktionen | Overlay-Nachricht `action` bekommt `plattform` des auslösenden Ereignisses; Filter wie bei Ereignissen | Twitch-Follow-Alarm erscheint nicht im TikTok-Overlay |
| Layout-Feld | `OverlayLayout.plattform?: 'alle' \| 'tiktok' \| 'twitch'` im JSON-Schema | Schema hat `additionalProperties:false` |
| Editor | Plattform-Auswahl je Overlay + Knopf „Twitch-Overlay (Querformat) anlegen“ mit Vorlage | „Twitch-Mode“ |

## Was dem Bauenden überlassen ist

Genaue UI-Texte (Deutsch, Erzähler-Form wie im Rest), Aufteilung der Twitch-Dateien unter `apps/desktop/src/main/adapters/`,
Reconnect-Wartezeiten (an TikTok-Adapter orientieren), Gestaltung des Plattform-Zeichens im Chat.
