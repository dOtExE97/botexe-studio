# botexe-app — TikFinity/TikTory-Ersatz: Design-Spec (MVP „Pur-Kern")

**Datum:** 2026-06-10
**Status:** Design freigegeben — bereit für Implementierungs-Plan
**Scope dieser Spec:** MVP „Pur-Kern" (Bausteine 1+2+3). Spätere Bausteine sind als Kontext/Roadmap beschrieben, aber NICHT Teil dieser Spec — jeder kriegt seinen eigenen Spec→Plan→Build-Zyklus.

---

## 1. Kontext & Problem

Die `botexe-app` (Electron-Desktop) soll **TikFinity/TikTory ersetzen** — ein eigenständiges, lokales Overlay-/Stream-Studio für TikTok-Live.

**Das Problem mit dem bisherigen Stand:** Über mehrere Sprints (3.1–3.4 + Overlay-Foundation) wurde „überall ein bisschen" gebaut → fragmentiert, 3 kritische Bugs (siehe Audit `KI Home Wissen/plans/2026-06-03-botexe-app-multiagent-audit.md`), nie auf dem Stream-PC smoke-getestet, seit 7. Mai 2026 brach. Letzter Commit `ee0d71f`.

**Ziel dieser Neuausrichtung:** Schluss mit Stückwerk. **Ein durchdachtes Design als Single Source of Truth**, daraus ein fokussierter, kohärenter Build — statt vieler paralleler Halbfertig-Teile.

---

## 2. Vision & Roadmap (das große Bild)

Die App besteht aus **6 Bausteinen**. Sie werden nacheinander gebaut, jeder mit eigenem Spec→Plan→Build:

| # | Baustein | Inhalt | Abhängig von |
|---|----------|--------|--------------|
| 1 | 🔌 **Kern** | TikTok-Events · Event-Bus · (später) lokales LLM-Routing · Memory | — |
| 2 | 🖼️ **Overlay-Engine** | Layout-DSL · Renderer · Widget-Kit · Overlay-Server | 1 |
| 3 | ⚡ **Trigger-Engine** | „Wenn Event X → dann Aktion Y" | 1, 2 |
| 4 | 🤖 **KI-Buddy + Avatar + TTS** | bOtExE reagiert/redet, Avatar-Steuerung | 1 |
| 5 | ✨ **AI-Overlay-Builder** | Overlays per Prompt bauen (das „Studio") | 2 |
| 6 | 🎨 **App-Shell (Premium)** | professionelle Desktop-UI, kein AI-Look | durchgehend |

**Bausteine 1+2+3 = MVP** = der kleinste Schnitt, der TikFinity im Kern ersetzt (Events → Overlays/Alerts/Sounds).

---

## 3. Grundprinzipien (gelten für ALLE Bausteine)

1. 🏠 **Lokal-first** — läuft auf dem Stream-PC, keine Cloud-Pflicht. LLM-Teile (Baustein 4/5) nutzen lokale Modelle (Ollama/LM Studio). **Der MVP-Kern braucht GAR KEIN LLM** (rein deterministisch).
2. ⚡ **Ressourcenschonend** — läuft neben Stream + Game. Schlanke Overlays (auch wegen TTLS), kein unnötiger Overhead.
3. 🎨 **Premium-Optik, kein generischer AI-Look** — Widgets & UI auf dem Niveau kommerzieller Pro-Tools. (Umsetzung später via `frontend-design` Skill.)
4. 🏗️ **Profi-Engineering** — saubere Struktur, echte Versionen & Updates, CI-Qualitätsgate. Wie ein professionell entwickeltes Produkt.

---

## 4. MVP-Scope „Pur-Kern" (Bausteine 1+2+3)

### Drin
- **TikTok-Events:** Chat · Gift (+ Gift-Combo) · Follow · Sub · Like · Viewer-Count · Share
- **Pro-Widgets** (voller Umfang, kommerzielles Niveau): Gift-Alert/Animation · Follower-/Sub-Alert · Goal-Bar · Leaderboard · Gift-Feed · Chat-Box
- **Trigger:** „Wenn Event X *(+ optionale Bedingung, z.B. Gift-Wert ≥ N Coins)* → dann Aktion Y" (Overlay einblenden/aktualisieren und/oder Sound)
- **Output:** EIN Overlay-Screen in der App zusammenbauen → **ein Link** → als Browser-/Link-Quelle in **TikTok Live Studio**
- **Sound-Alerts:** werden **lokal von der App** abgespielt (→ Rodecaster-Mix), NICHT im Overlay-HTML

### Raus (spätere Phasen)
- KI-Buddy / TTS / Avatar (Baustein 4)
- AI-Overlay-Builder (Baustein 5)
- Premium-UI-Vollausbau (Baustein 6)
- Mini-Games, Chat-Commands, OBS/TTLS-Szenen-Steuerung

---

## 5. Liefermodell & TTLS-Kompatibilität

**Modell:** Nutzer baut in der App einen Overlay-Screen (Widgets auf einem Canvas positioniert) → App liefert **eine URL** → diese als Browser-/Link-Quelle in TikTok Live Studio (TTLS). Genau wie TikFinity es anbietet, aber als **ein** kombinierter Screen statt vieler Einzel-Widgets.

**TTLS-Constraints (recherchiert, hart):**
- ✅ Transparente Overlays (`rgba`/transparenter Body) werden unterstützt
- ⚡ TTLS-Browser ist limitierter als OBS → Overlays müssen **schlank** sein (deckt sich mit Prinzip „ressourcenschonend")
- 🔊 **TTLS spielt Audio aus Browser-Quellen oft NICHT zuverlässig** → Sound-Alerts laufen **lokal über die App** (System-Audio → Rodecaster), nicht über das Overlay
- Feste Auflösung (1920×1080), korrekt skaliert

---

## 6. Architektur (MVP)

```
TikTok Live
    │
    ▼
[TikTok-Adapter] ──normalisierte Events──► [Event-Bus] ──► [Trigger-Engine]
 (übernommen+fix)                          (übernommen)     (NEU, Regeln)
                                                              │        │
                                                  ┌───────────┘        └────────────┐
                                                  ▼                                 ▼
                                          [Sound-Player]                    [Overlay-Engine]
                                          (NEU, lokal →                     (NEU: DSL · Widget-
                                           Rodecaster)                       Registry · Renderer)
                                                                                    │
                                                                                    ▼
                                                                            [Overlay-Server]
                                                                            (übernommen+fix:
                                                                             1 Link · WebSocket)
                                                                                    │
                                                                                    ▼
                                                                  ein Link → TTLS Browser-Quelle
                                                                  (transparenter Overlay-Canvas)

[App-Shell (schlank)]: Trigger einstellen · Overlay-Screen bauen · Link kopieren
```

### Komponenten (jede eine klare Aufgabe)

| Komponente | Aufgabe | Status |
|------------|---------|--------|
| **TikTok-Adapter** | TikTok Live verbinden, Events normalisieren | ♻️ übernommen + Reconnect-Fix (Audit K1/K2) |
| **Event-Bus** | Events zentral verteilen, einheitliches Format | ♻️ übernommen |
| **Trigger-Engine** | Regeln „wenn X → dann Y", deterministisch | 🆕 neu |
| **Overlay-Engine** | Layout-DSL + Widget-Registry + Renderer | 🆕 neu (Engine-First) |
| **Overlay-Server** | hostet den einen Link + WebSocket, transparent, TTLS-schlank | ♻️ übernommen + Heartbeat-Fix (H8) |
| **Sound-Player** | Alert-Sounds lokal abspielen → Rodecaster | 🆕 neu, klein |
| **App-Shell** | Trigger/Screen konfigurieren, Link kopieren | 🆕 schlank (Premium voll mit Baustein 6) |

### Datenfluss
TikTok-Event → Adapter normalisiert → Event-Bus → Trigger-Engine matcht Regeln → Aktion → (a) Overlay-State-Update → per WebSocket an Overlay-Canvas → Widget animiert; (b) Sound-Player spielt lokal.

### State & Persistenz
Overlay-Layout + Trigger-Regeln als **lokale, schema-validierte Config** (JSON). Memory-System (vorhanden) für Leaderboard/Goal-Stände. Config/DB mit **Schema-Versionen** (Migrations) → Updates zerstören keine alten Daten.

---

## 7. Architektur-Entscheidung: Engine-First (Hybrid)

- **Hybrid:** Solide Bestandsteile übernehmen (TikTok-Adapter, Event-Bus, Widget-Kit, Overlay-Server), fragmentierte/halbgare Teile sauber neu (Overlay-Engine, Trigger-Engine, App-Shell).
- **Engine-First:** Overlay-Engine von Anfang an als generische DSL + Widget-Registry + Renderer → trägt direkt bis zum späteren **AI-Builder** (Baustein 5 generiert dann DSL-Layouts in dieselbe Engine). Kein späterer Umbau.
- **Design-Duell:** Architektur-Varianten wurden in der Design-Phase gegeneinander abgewogen (auf dem Papier, kein Doppel-Code) → Engine-First gewann.

---

## 8. Projekt-Struktur (Monorepo, klare Schichten)

```
botexe-app/
├── apps/desktop/src/
│   ├── main/
│   │   ├── core/      ← reine Logik: Event-Bus, Trigger-Engine (testbar OHNE Electron)
│   │   ├── adapters/  ← I/O: TikTok-Adapter, Overlay-Server, Sound-Player
│   │   └── services/  ← App-Verdrahtung
│   ├── renderer/      ← App-Shell (UI)
│   └── shared/        ← Typen, Konstanten
└── packages/
    ├── overlay-engine/  ← DSL + Renderer (eigenständig, versioniert, testbar)
    ├── widget-kit/      ← Pro-Widgets
    └── trigger-engine/  ← Regel-Logik
```

**Prinzip:** Core (Logik) ↔ Adapter (I/O) ↔ UI sauber getrennt. Jedes `package` eigenständig & einzeln testbar. Datei wird zu groß → macht zu viel → wird geteilt.

---

## 9. Versionierung & Updates

| Was | Wie |
|-----|-----|
| Versionen | SemVer (`major.minor.patch`) + Git-Tags pro Release |
| Changelog | automatisch aus Conventional Commits (`feat:`, `fix:` …) |
| Auto-Update | electron-forge + Squirrel → App lädt & installiert Updates selbst (teils angelegt) |
| Releases | über GitHub Actions (Windows-Runner) → echtes Setup.exe (löst Linux-Build-Limit) |
| Daten-Migrationen | Schema-Versionen für Config/DB → Updates zerstören nie alte Settings/Stände |

---

## 10. Robustheit (Audit-Lehren fest eingebaut)

- **TikTok-Reconnect** kugelsicher (K1/K2) — übersteht ständige Stream-Drops, kein Doppel-Connection-Leak, StreamContext-Reset bei Re-Connect
- **Backpressure** bei viralen Spikes (H6) — gedeckelte Queues, Gift-Bombing überlastet nichts
- **Overlay-JSON validiert** vor Save/Load (K3, ajv-Schema) — kein Müll-Layout
- **WebSocket-Heartbeat** (H8) — tote TTLS-Verbindungen werden aufgeräumt

---

## 11. Testing & Qualitäts-Gate

- TypeScript-strict + ESLint/Prettier
- **Unit-Tests:** Trigger-Regel-Matching, Overlay-DSL-Validierung
- **Event-Replay:** TikTok-Events aufnehmen → Stream testen ohne Live (Recorder-Basis vorhanden)
- **CI bei jedem Push:** Lint + Typecheck + Test → grün = mergebar
- README + kurze Architektur-Doku

---

## 12. Erfolgskriterien (Definition of Done für den MVP)

1. TikTok-Live verbinden → Events kommen real rein, Reconnect übersteht Drops
2. Overlay-Screen in der App zusammenbauen → ein Link generieren
3. Link in TikTok Live Studio als Browser-Quelle → Widgets erscheinen transparent & flüssig
4. Trigger „Gift ≥ N → Alert + Sound" funktioniert live (Sound lokal über Rodecaster)
5. Smoke-Test auf dem echten Stream-PC bestanden
6. CI grün, Auto-Update-Build erzeugt

---

## 13. Referenzen
- Audit-Report: `KI Home Wissen/plans/2026-06-03-botexe-app-multiagent-audit.md`
- Topic-File: `botexe-standalone.md` (Memory)
- Repo: `/home/dotexe/repos/botexe-app/` @ `ee0d71f`
