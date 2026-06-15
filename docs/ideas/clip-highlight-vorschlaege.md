# Idee: Auto-Highlight-Clips aus Live-Aufnahmen

**Stand:** 15.06.2026 — Backlog ("kommt noch"), noch nicht geplant.

## Problem / Motivation
Alex streamt viel live (59 h/28 Tage, gute Zahlen), lädt aber **kaum Videos** hoch.
Clips/Shorts aus den Live-Highlights wären der größte ungenutzte Wachstums-Hebel:
Live → Clips → FYP-Reichweite → neue Follower → mehr Live-Zuschauer (Schwungrad).
Hürde ist der Aufwand (ADHS-freundlich = möglichst null Handarbeit).

## Kern-Idee
botexe-studio hat die **Engagement-Daten ohnehin** (Gifts, Combos, Kommentare,
Spiel-Siege, Like-Spikes pro Zeitpunkt). Daraus lassen sich die **spannendsten
Momente automatisch finden** und als Clip-Vorschläge ausgeben.

## Mögliche Bausteine (grob, unverbindlich)
- **Moment-Scoring:** Zeitachse der Session mit Score = gewichtete Summe aus
  Gift-Coins, Combo-Power, Kommentar-Rate, neue Follower, Spiel-Gewinn-Events.
  Peaks = Highlight-Kandidaten (Timestamp + Grund, z. B. "Rakete 99×Rose 21:14").
- **Clip-Marker-Export:** Liste der Top-N Momente mit Zeitstempel → als einfache
  Marker (CSV/JSON) oder direkt als OBS-Replay-Buffer-Trigger.
- **Optional später:** Wenn eine lokale Aufnahme (OBS-Mitschnitt) vorliegt,
  per ffmpeg automatisch 15–40 s vertikale Schnipsel um die Peaks schneiden.
- Alles wie üblich **einstellbar** (Gewichte, Clip-Länge, Anzahl) + Versionen.

## Offen / zu klären
- Hat Alex einen lokalen OBS-Mitschnitt, an dem geschnitten werden kann? (sonst
  nur Marker-Liste fürs manuelle Schneiden)
- Reicht erst eine **Marker-Liste** ("an diesen Stellen war was los") als MVP?

→ Erst nach dem aktuellen TikFinity-Widget-Nachbau angehen.
