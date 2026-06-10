# 🛠️ Build-Auftrag: botexe-app — TikFinity/TikTory-Ersatz (MVP „Pur-Kern")

> Dies ist dein vollständiges Briefing. Lies es ganz, dann die referenzierten Dateien, dann leg los.

## Wer du bist & was du tust
Du bist ein Senior-Software-Engineer-Agent. Du baust die **`botexe-app`** — eine eigenständige, **lokale** Electron-Desktop-App, die **TikFinity/TikTory** für **TikTok-Live** ersetzt. Arbeite eigenständig und professionell: erst verstehen, dann planen, dann bauen, testen, smoke-testen. Kommuniziere mit dem User (Alex) auf **Deutsch**.

## ⚠️ ZUERST LESEN (Pflicht, bevor du Code anfässt)
1. **Design-Spec (deine Single Source of Truth):**
   `/home/dotexe/repos/botexe-app/docs/specs/2026-06-10-tikfinity-ersatz-mvp.md`
2. **Audit-Report (14 bekannte Bugs der Alt-Codebase — NICHT wiederholen):**
   `~/Dokumente/KI Home Wissen/plans/2026-06-03-botexe-app-multiagent-audit.md`
3. **Bestehende Codebase** (`@ ee0d71f`): `/home/dotexe/repos/botexe-app/`
   → Hybrid-Ansatz: solide Teile übernehmen, fragmentierte sauber neu bauen.

## Was du baust (MVP „Pur-Kern" = Bausteine 1+2+3)
TikTok-Events → Trigger-Regeln → Overlays/Alerts/Sounds. Der **kleinste Schnitt, der TikFinity im Kern ersetzt.**
- **Events:** Chat · Gift (+Combo) · Follow · Sub · Like · Viewer-Count · Share
- **Pro-Widgets (voller Umfang, kommerzielles Niveau):** Gift-Alert/Animation · Follower-/Sub-Alert · Goal-Bar · Leaderboard · Gift-Feed · Chat-Box
- **Trigger:** „wenn Event X *(+ optionale Bedingung, z.B. Gift ≥ N Coins)* → dann Aktion Y (Overlay einblenden + Sound)"
- **Output:** EIN Overlay-Screen in der App zusammenbauen → **EIN Link** → als Browser-/Link-Quelle in **TikTok Live Studio**

**Bewusst NICHT im MVP** (spätere Bausteine): KI-Buddy/TTS/Avatar (4), AI-Overlay-Builder (5), Premium-UI-Vollausbau (6), Mini-Games, Chat-Commands, Szenen-Steuerung.

## Unsere Wünsche / harte Anforderungen
1. 🏠 **Lokal-first** — läuft auf dem Stream-PC, keine Cloud-Pflicht. **Der MVP-Kern braucht GAR KEIN LLM** (rein deterministisch). LLM kommt erst in späteren Bausteinen (lokal via Ollama/LM Studio).
2. ⚡ **Ressourcenschonend** — läuft neben Stream + Game. Schlanke Overlays, kein unnötiger Overhead.
3. 🎨 **Premium-Optik, KEIN generischer AI-Look** — Widgets auf dem Niveau kommerzieller Pro-Tools. Echtes, distinktives Design.
4. 🏗️ **Profi-Engineering** — saubere Code-/Ordnerstruktur, echte Versionen & Auto-Updates, CI-Qualitätsgate, Tests. Wie ein professionell entwickeltes Produkt, NICHT wie ein Bastelprojekt.

## Architektur (Engine-First, Hybrid)
```
TikTok Live → [TikTok-Adapter] → [Event-Bus] → [Trigger-Engine] ─┬─→ [Sound-Player] (lokal → Audio-Mix)
                                                                  └─→ [Overlay-Engine: DSL · Widget-Registry · Renderer]
                                                                            → [Overlay-Server: 1 Link · WebSocket]
                                                                            → TTLS Browser-Quelle (transparenter Canvas)
[App-Shell (schlank)]: Trigger einstellen · Overlay-Screen bauen · Link kopieren
```
| Komponente | Status |
|---|---|
| TikTok-Adapter, Event-Bus, Widget-Kit, Overlay-Server | ♻️ übernehmen (+ Bugs fixen) |
| Trigger-Engine, Overlay-Engine (DSL/Registry/Renderer), Sound-Player, App-Shell | 🆕 neu, sauber |

**Engine-First:** Die Overlay-Engine ist eine generische DSL + Widget-Registry + Renderer — so trägt sie direkt bis zum späteren AI-Builder (Baustein 5 generiert dann Layouts in dieselbe Engine). Kein späterer Umbau.

## Liefermodell & TikTok-Live-Studio (KRITISCH)
- Ein Overlay-Screen → **ein Link** → Browser-/Link-Quelle in TTLS (genau wie TikFinity es anbietet, aber als ein kombinierter Screen).
- ✅ Transparente Overlays (`rgba`) gehen in TTLS.
- ⚡ TTLS-Browser ist limitierter als OBS → Overlays **schlank** halten.
- 🔊 **TTLS spielt Browser-Audio NICHT zuverlässig ab** → Sound-Alerts spielt die **App LOKAL** ab (System-Audio → Mischpult/Rodecaster), **NICHT** im Overlay-HTML.
- Feste Auflösung 1920×1080, korrekt skaliert.

## Struktur · Versionierung · Qualität (Profi-Engineering)
- **Monorepo, klare Schichten:** `main/core` (reine Logik, testbar ohne Electron) ↔ `main/adapters` (I/O) ↔ `renderer` (UI). Eigenständige `packages/` für `overlay-engine`, `widget-kit`, `trigger-engine`.
- **Versionen:** SemVer + Git-Tags. Changelog automatisch aus Conventional Commits (`feat:`/`fix:`).
- **Auto-Update:** electron-forge + Squirrel (Windows). **Releases über GitHub Actions (Windows-Runner)** → echtes Setup.exe.
- **Daten-Migrationen:** Schema-Versionen für Config/DB → Updates zerstören nie alte Settings/Stände.
- **Qualitäts-Gate:** TypeScript-strict + ESLint/Prettier. Unit-Tests (Trigger-Regeln, DSL-Validierung) + Event-Replay (Stream testen ohne Live). **CI bei jedem Push: Lint + Typecheck + Test → grün = mergebar.**

## Bugs aus dem Audit, die du NICHT wiederholen darfst
- **K1/K2 — TikTok-Reconnect robust:** StreamContext-Reset bei JEDEM (auch internem) Re-Connect; alte Connection sauber abräumen (`removeAllListeners` + disconnect), keine Doppel-Connections/Doppel-Events.
- **K3 — Overlay-JSON validieren:** Schema-Validierung (ajv) vor Save UND Load. Kein KI-/Müll-Layout darf gespeichert werden.
- **H6 — Backpressure:** Bei viralen Spikes (Gift-Bombing) Queues deckeln, kein unbegrenztes Wachstum, keine Kosten-/Last-Explosion.
- **H8 — WebSocket-Heartbeat:** Tote TTLS-Verbindungen per Ping/Pong erkennen und aufräumen (kein Listener-Leak).
- Details & weitere Findings: siehe Audit-Report.

## Vorgehen (in dieser Reihenfolge)
1. Spec + Audit + bestehende Codebase lesen & verstehen.
2. Eigenen Implementierungs-Plan erstellen (Bau-Reihenfolge, Test-Punkte).
3. Auf einem **Feature-Branch** bauen (`feat/mvp-pur-kern`), conventional commits, CI grün halten.
4. Tests schreiben (Trigger-Engine, DSL-Validierung, Event-Replay).
5. **Smoke-Test auf dem echten Stream-PC** (Link in TTLS, Trigger live auslösen).
6. Bei Unklarheiten den User fragen, NICHT raten.

## Definition of Done (MVP)
1. TikTok-Live verbinden → Events real rein, Reconnect übersteht Drops.
2. Overlay-Screen in der App bauen → ein Link generieren.
3. Link in TikTok Live Studio → Widgets erscheinen transparent & flüssig.
4. Trigger „Gift ≥ N → Alert + Sound" funktioniert live (Sound lokal).
5. Smoke-Test auf dem echten Stream-PC bestanden.
6. CI grün, Auto-Update-Build erzeugt.
