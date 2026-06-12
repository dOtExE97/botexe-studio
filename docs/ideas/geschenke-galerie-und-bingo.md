# Ideen: Geschenke-Galerie + Stream-Bingo (Alex, 12.06.2026 — Live-Test)

## 1. Geschenke-Galerie
**Wunsch:** Eine Seite, auf der der Streamer sieht, welche Gifts wie oft kamen —
mit den echten Gift-Bildern (PNGs).

**Umsetzung:**
- Neuer persistenter `GiftCatalog` (gift-catalog.json): bei jedem Gift-Event
  slug/giftId/icon-URL/coinsPerUnit erfassen + Zähler (count, totalCoins,
  zuletzt gesehen). Wächst automatisch mit jedem Stream.
- Neue Seite „Geschenke": Grid mit Gift-Bild, Name, Coins/Stück, wie oft
  erhalten, Gesamt-Coins. Sortierbar (häufigste/teuerste/neueste).
- **Doppelnutzen:** Der Katalog liefert die Bilder & Slugs für
  (a) Trigger-Bedingung „Gift heißt genau …" als visuellen Picker statt
  Freitext, (b) Bingo-Ziele (s.u.), (c) künftige Gift-Reaktions-Galerie.
- Icon-URLs sind TikTok-CDN — optional lokal cachen (media-artiger Store),
  damit die Galerie offline funktioniert.

## 2. Stream-Bingo (TikFinity-PRO-Feature, bei uns gratis)
**Referenz-Fotos:** TikFinity „Bingo": 3×3-Raster, Zellen = Ziele (bestimmtes
Gift, „20k Likes", „+10 Min", …), erreichte Zellen bekommen Haken, komplette
Reihen werden durchgestrichen (Bingo-Linie).

**Umsetzung:**
- Neues Widget `bingo.js`: NxN-Raster (3×3 default) im Glas-Look; Zell-Typen:
  - `gift:<slug>` — Gift X erhalten (Bild aus der Geschenke-Galerie!)
  - `likes:<n>` — Session-Likes erreichen n
  - `coins:<n>` / `follows:<n>` / `shares:<n>`
  - `minutes:<n>` — Stream-Dauer (+10 Min-Zellen wie TikFinity)
  - `chat:<wort>` — jemand schreibt X
- Erfüllte Zelle: Haken-Animation (Spring-Pop) + optional Sound (Widget-Sound!).
  Komplette Reihe/Spalte/Diagonale: Durchstreich-Linie + Bingo-Alert + optional
  Trigger-Aktion („Bingo → Sound + Ansage").
- Editor: Zell-Konfiguration als Grid-UI (pro Zelle Typ + Wert + optional
  Gift-Picker aus der Galerie). Persistenter Fortschritt pro Session
  (Session-Reset leert das Brett).
- Engine-seitig: Zell-Zustände im Main berechnen (wie Widget-Sounds) und als
  Stats/Action ans Widget pushen — ODER Widget rechnet selbst aus onStats/
  onEvent (einfacher, Session-Reset via Layout-Rebroadcast funktioniert schon).

**Reihenfolge:** Galerie zuerst (liefert den Gift-Picker), dann Bingo.

## Status
Backlog „nächste Version" — nach dem Live-Test-Feinschliff.
