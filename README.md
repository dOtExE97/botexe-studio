# bOtExE Studio

**Lokales TikTok-Live Overlay-Studio** — ein eigenständiger, kostenloser **TikFinity-Ersatz** als Desktop-App (Windows).
Geschenke, Alerts, Overlays, Sounds, Spiele, TTS, Punkte/Store, Glücksrad u. v. m. — alles läuft **lokal auf deinem Stream-PC**, keine Cloud-Pflicht, keine Abo-Gebühr.

> 🤖 **Transparenz:** Diese App wird von **dOtExE (Alex)** gebaut — gemeinsam „gevibe-coded" mit **Claude (Anthropic)** als KI-Pair-Programmer. Die Richtung, die Ideen, das Testen im echten Stream und alle Entscheidungen kommen von Alex; der Code entsteht im Dialog mit der KI.

---

## 📥 Installation (für Streamer)

1. Lade die neueste **`bOtExE Studio Setup.exe`** unter [**Releases**](https://github.com/dOtExE97/botexe-studio/releases/latest) herunter.
2. Starten → installieren. Beim ersten Start zeigt Windows evtl. **SmartScreen** eine Warnung („unbekannter Herausgeber") — das ist **normal**, weil die App (noch) kein kostenpflichtiges Code-Signing-Zertifikat hat. Auf *Weitere Informationen → Trotzdem ausführen*.
3. **Updates kommen automatisch**: die App prüft im Hintergrund auf neue Versionen (GitHub-Releases) und installiert sie beim nächsten Neustart. Manuell: **Einstellungen → Auf Update prüfen**.

### Systemanforderungen
- **Windows 10 (22H2) oder Windows 11**
- ~2 GB RAM frei (4 GB+ empfohlen, läuft ja neben Spiel + Stream)
- **TikTok Live Studio** (kostenlos) für die Overlay-Browser-Quelle — *oder* **OBS Studio**
- Keine weitere Installation nötig (alles steckt in der EXE)

---

## 🚀 Erste Schritte

1. **Verbinden** (Live-Seite): deinen TikTok-Namen eingeben → *Verbinden*. Die App lauscht auf Gifts, Follows, Likes, Chat …
   *(Vorab testen ohne Live geht: rechts „Testen ohne Live" → Demo-Events durchschicken.)*
2. **Overlay bauen** (Overlay-Seite): links aus der **Widget-Palette** ein Widget wählen — du siehst jedes Widget schon **live in der Liste** und kannst es mit **Test** ausprobieren. Mit *Hinzufügen* / Drag aufs Bild legen, rechts einstellen.
3. **Ins Stream-Programm einbinden**:
   - **TikTok Live Studio (TTLS):** oben den **„TIKTOK-STUDIO-LINK"**-Knopf nutzen. TTLS akzeptiert keine IP-Links → einmalig **Einstellungen → TikTok Live Studio → „Automatisch einrichten"** (legt einen Host-Eintrag an). Danach den Link als Browser-Quelle einfügen.
   - **OBS:** den normalen **„OBS-LINK"** als Browser-Quelle (transparenter Hintergrund).
4. **Trigger** (Trigger-Seite): „Wenn Gift X → spiele Sound / zeige Alert / Glücksrad …". Pro Regel ein **Test**-Knopf.

### Optionale Extras
- **TTS (Chat-Vorlesen / Ansagen):** Standard-Stimme (Microsoft Edge, Cloud) ist **sofort bereit, kein Download**. Lokale Piper-Stimmen oder Premium-Anbieter (eigener API-Key, **kostenpflichtig**) → siehe [`docs/tts-premium-stimmen.md`](docs/tts-premium-stimmen.md).
- **Sport-Liveticker:** Standard nutzt **OpenLigaDB (kein Key)**. Für WM/CL/Top-Ligen einen kostenlosen **football-data.org**-Key in *Einstellungen → Sport*.
- **OBS-Steuerung / Stream-Deck / Streamer.bot:** in den Einstellungen aktivierbar.

---

## 🛠️ Entwicklung

Monorepo (npm workspaces), Electron + Vite + TypeScript, React-Renderer, Vanilla-ES-Module-Widgets.

```bash
npm install              # einmalig (workspace-root)
npm run dev:desktop      # App im Dev-Modus
npm run lint             # eslint über alle workspaces
npm run typecheck        # tsc --noEmit über alle workspaces
npm test                 # alle Unit-/Integrationstests (node:test + tsx)
npm run build:desktop    # distributable bauen (out/make/)
```

### Architektur
```
TikTok Live → [TikTok-Adapter] → [Event-Bus] → [Trigger-Engine] ─┬─→ [Sound-Player] (lokal)
                                                                  └─→ [Overlay-Engine: DSL · Widget-Registry · Renderer]
                                                                          → [Overlay-Server: 1 Link · WebSocket]
                                                                          → TTLS/OBS Browser-Quelle (transparenter Canvas)
```

### Struktur
```
apps/desktop/src/
├── main/
│   ├── core/      ← reine Logik: Event-Bus, Verdrahtung Trigger ↔ Engine (testbar ohne Electron)
│   ├── adapters/  ← I/O: TikTok-Adapter, Overlay-Server
│   └── services/  ← App-Verdrahtung (Studio-Orchestrator, Settings, TTS, Sport, OBS …)
├── renderer/      ← App-Shell (React-UI)
└── shared/        ← Typen, Konstanten, IPC-Kanäle
packages/
├── overlay-engine/  ← Layout-DSL + Renderer + Overlay-Runtime (eigenständig, versioniert, testbar)
├── widget-kit/      ← Pro-Widgets (Vanilla ES-Module, self-contained, kein CDN)
└── trigger-engine/  ← Regel-Logik (deterministisch, ohne I/O)
```

### Release / Auto-Update
Auto-Update läuft über **GitHub-Releases** (`update.electronjs.org`, nur bei **öffentlichem** Repo). Ein Release entsteht durch einen **Versions-Tag**:
```bash
# Version in package.json (root) + apps/desktop/package.json bumpen, committen, dann:
git tag v0.2.0 && git push origin v0.2.0
```
→ CI (`.github/workflows/windows-build.yml`) baut + veröffentlicht die Setup-.exe als Release-Asset. Code-Signing-Zertifikat ist noch offen (daher SmartScreen-Hinweis oben).

---

## Grundprinzipien
1. 🏠 **Lokal-first** — läuft auf dem Stream-PC, keine Cloud-Pflicht
2. ⚡ **Ressourcenschonend** — neben Stream + Game, schlanke Overlays
3. 🎨 **Premium-Optik** — Widgets auf Pro-Niveau, kein generischer KI-Look
4. 🏗️ **Profi-Engineering** — saubere Schichten, SemVer + Auto-Updates, Tests, CI-Gate

## Referenzen
- Design-Spec: [`docs/specs/2026-06-10-tikfinity-ersatz-mvp.md`](docs/specs/2026-06-10-tikfinity-ersatz-mvp.md)
- Build-Briefing: [`docs/specs/2026-06-10-build-briefing.md`](docs/specs/2026-06-10-build-briefing.md)
- Änderungen: [`CHANGELOG.md`](CHANGELOG.md)

## Lizenz
**Source-available, kein Open Source.** Der Code ist öffentlich einsehbar (Transparenz + Audit), und du darfst die offiziellen Builds fürs eigene Streaming nutzen — aber **nicht** kopieren, weiterverbreiten oder ein eigenes/kommerzielles Produkt daraus bauen. Alle Rechte bei dOtExE. Kommerzielle/Agentur-Lizenzen auf Anfrage. Details: [`LICENSE`](LICENSE).
