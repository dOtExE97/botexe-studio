# Idee: Sport-Liveticker-Widget (WM/Fußball)

**Quelle der Idee:** TikFinity hat einen „WM-Liveticker" (12.06.2026 im Live-Test gesehen):
zeigt aktuelle WM-Spiele mit Spielstand + Spielzeit, bei Tor eine Tor-Animation.
Alex: „Nice Idee eig 👀"

## Warum gut
- WM 2026 läuft JETZT (Nordamerika) — Streamer-Gold, Zuschauer bleiben länger
- Passt perfekt zu unserem Glas-Look (Glas-Pill wie der Countdown, Flaggen, Score chunky)
- Tor-Animation = unser Alert-System kann das schon (fire_alert-artig)

## Umsetzungs-Skizze
- **Datenquelle nötig** (extern!): z.B. football-data.org (free tier), OpenLigaDB
  (DE-Ligen, frei), oder inoffizielle FIFA-/Flashscore-Endpoints — Verfügbarkeit
  & Rate-Limits prüfen. Polling im Main-Prozess (~30–60s), nicht im Widget.
- Neues Widget `sport-ticker.js`: Glas-Pill mit Liga/Turnier-Badge, Flaggen
  (Emoji-Flaggen ok oder SVG), Score, Spielminute; Tor → Pop-Animation + optional
  Trigger-Aktion (Sound/Alert) über den Bus (`sport_goal`-Event?)
- Einstellungen: Wettbewerb wählen, eigenes Team hervorheben
- Vorsicht: externe API = Online-Abhängigkeit — als optionales Widget kennzeichnen

## Status
Backlog — nach dem Live-Test / GitHub-Meilenstein priorisieren.
