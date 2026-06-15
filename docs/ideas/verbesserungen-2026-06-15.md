# Verbesserungsideen (Agenten-Sammlung, 15.06.2026)

Kuratiert von einem Product/UX-Review-Agenten, read-only über die ganze App.
Aufwand: S = Stunden, M = 1-2 Tage, L = größer. Alle bleiben lokal/gratis.
Noch NICHT umgesetzt (Backlog) — Reihenfolge = grobe Empfehlung.

## Top-Empfehlungen (Mehrwert / Aufwand)
1. **Giveaway / Verlosung** (S-M) — `!join` sammelt Teilnehmer (optional Eintritt =
   X Punkte oder „nur Follower"), Streamer zieht Gewinner als Overlay-Roulette
   (Avatare ziehen vorbei, halten beim Gewinner). Gibt's noch gar nicht. Andockt:
   ChatCommand/`matchChatCommand`, `points-store.spend`, neues Widget à la `wheel.js`.
2. **Trigger-Test im Editor + „Was-feuert-gerade"-Live-Log** (S) — jede Regel per
   Klick auslösen + scrollendes Protokoll „Trigger X feuerte wegen Gift Y". Spart
   Stunden beim Einrichten (kein echtes Gift abwarten). Andockt: TriggersPage,
   Event-Bus, LivePage.
3. **Stammgast-Loyalty** (S) — `points-store` hat firstSeen/lastSeen → Besuchszähler
   + Treue-Rang (Neu/Stammgast/VIP) + „Willkommen zurück, X (12. Stream!)"-Alert/TTS.
4. **Gift-Battle / Team-vs-Team** (M) — zwei Lager/Gifts, Tauziehen-Balken, Countdown,
   Sieger-Feier. TikFinity-Klassiker. Andockt: Event-Bus, gespiegelte `goal-bar`-Logik.

## Weitere Widgets
5. **Live-Poll / Voting** (M) — Zuschauer voten per Chat (`!1`/`!2`) ODER per Gift
   („Rose = A"), Balken live, Reveal. Gift-Voting monetarisiert über Coins.
6. **Now-Playing / Musik-Widget** (S) — aktueller Song (per `!song`-Set oder Datei-Tag).
7. **Recent-Follower-Ticker + Countdown zum nächsten Follower-Meilenstein** (S) —
   „letzte 5 Follower" mit Avataren; sozialer Beweis senkt Absprung neuer Zuschauer.

## UX / Workflow
8. **Overlay-Layout-Vorlagen / Szenen-Presets** (M) — fertige Starter-Layouts
   (Just-Chatting/Gaming/Spenden-Push) per Klick + eigene speichern/duplizieren.
   ADHS-freundlich = weniger Handarbeit. Andockt: OverlayPage, `listLayouts`.
9. **Onboarding-Checkliste** (S) — „TikTok verbunden? Overlay in OBS? 1 Gift-Reaktion?
   TTS getestet? Football-Key?" aus vorhandenen Status-Feldern.
10. **Mini-Live-Monitor im Cockpit** (S) — eingebettetes Overlay-iframe (CSP-Pattern
    existiert) auf der LivePage, damit man das Overlay sieht ohne Alt-Tab zu OBS.
11. **Sound-Lautstärke + Cooldown pro Eintrag + Duck-on-TTS** (S) — andere Sounds
    leiser ziehen während TTS spricht; verhindert Audio-Chaos bei Gift-Spam.

## Technik / Wachstum
12. **Clip-Highlight-MVP** (M) — Marker-Liste (Timestamp + Grund) aus den vorhandenen
    Engagement-Peaks, CSV/JSON-Export, KEIN ffmpeg nötig. Größter Wachstumshebel
    (Live→Clips→FYP). Detail: [[clip-highlight-vorschlaege]].
13. **KI-Buddy MVP ohne GPU** (M-L) — bei großen Gifts/Followern/Fragen kurze Antwort
    von lokalem LM Studio/Ollama (BYOK-Fallback) → durch vorhandenes TTS sprechen,
    optional 2D-PNGTuber (Mund per TTS-Amplitude). Größtes Differenzierungs-Feature.

## Schon erledigt (Stand 15.06., NICHT mehr offen)
- ~~Pre-Live „Live-Watch"-Poll (App vor Live → auto-connect)~~ ✅ umgesetzt.
- ~~Audio-Ausgabe persistent~~ ✅. ~~Session-Reset bei neuem Stream~~ ✅.
