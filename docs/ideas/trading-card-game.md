# Idee: bOtExE Trading Card Game (Arbeitstitel „StreamDuell")

**Stand:** 2026-06-11 — Ideensammlung von Alex, noch KEIN Baustein/Spec. Kommt nach MVP-Live-Test + Baustein 4.

## Die Vision (O-Ton Alex)

Ein Trading-Card-Game à la Yu-Gi-Oh **im Stream**: Zuschauer haben Karten mit
ATK/DEF-Werten und Effekten und können **per Chat-Befehl gegeneinander antreten** —
aus Spaß, als Community-Feature. Karten werden **gelevelt durch Coins, Likes, Shares**.

## Warum das gut auf den jetzigen Unterbau passt

| TCG braucht | Haben wir schon |
|---|---|
| Chat-Befehle erkennen (`!duell @mia`) | Event-Bus + Trigger-Engine (chat_keyword) — Befehls-Parser wäre ein neuer Condition-Typ |
| Engagement pro User tracken (Coins/Likes/Shares fürs Leveln) | SessionStats trackt schon Gifter + Liker pro User mit Profilbild |
| Kampf im Overlay anzeigen | Widget-Kit + Overlay-Engine — „Duell-Arena" wäre ein Widget wie Gift-Alert |
| Karten-/Spieler-Daten persistent über Streams | Store-Pattern mit schemaVersion + Migrations liegt bereit |
| Visuals: Karten, Effekte, Animationen | Canvas-Widgets (Glas/Feuerwerk) zeigen, dass Physik/Partikel performant gehen |

## Grobe Mechanik-Skizze (zum späteren Ausarbeiten)

- **Karten bekommen:** Drops durch Aktivität (erster Chat des Tages, Follow, Gift-Schwellen) — Gacha-Moment im Stream („NeuerFan zieht eine seltene Karte!" als Alert)
- **Leveln:** Coins/Likes/Shares = XP aufs aktive Deck; Level hebt ATK/DEF
- **Duell:** `!duell @user` → beide bestätigen → Overlay zeigt Arena-Widget, Karten fliegen rein (Punch-In wie Gift-Alert), Kampf läuft automatisch ab (deterministisch, Seed aus Event — replay-fähig!), Sieger-Animation + Leaderboard
- **Rarity/Effekte:** Common→Legendary, simple Effekt-Verbs (z.B. „+20 ATK wenn Streamer-Goal voll")
- **Karten-Art:** generierte/kuratierte Bilder, evtl. TikTok-Gift-Bilder als Karten-Motive der „Gift-Edition"
- **Anti-Spam:** Duell-Cooldowns pro User (Trigger-Engine kann das schon), Queue bei vielen Anfragen

## Abgrenzung

- Eigener Baustein NACH Live-Test des MVP und Baustein 4 (KI-Buddy/TTS)
- Eigener Spec→Plan→Build-Zyklus (Lehre aus botexe-app: kein Stückwerk)
- Erster Schnitt sollte OHNE Economy-Komplexität starten (keine Trades zwischen Usern, kein Kauf) — erst Spielspaß, dann Tiefe
