# botexe-app Multi-Agent Code-Audit

**Datum:** 2026-06-03
**Durchgeführt von:** Claude Opus 4.8 (5 parallele general-purpose Review-Agenten + statische Checks)
**Repo-Stand:** `main` @ `ee0d71f` (letzter Commit 07.05.2026 "overlay studio foundation"), Tree clean
**Scope:** ~17.600 Zeilen TS in `apps/desktop/src` + `packages`

> Auftrag von Alex: "mit Agenten mal alles anschauen, ob Fehler auffallen." Reiner Audit, **kein Code-Change** in dieser Session (Entscheidung Alex: nur als Report festhalten).

## Statische Baseline (gut)

- `tsc --noEmit`: **0 Errors**
- `eslint --ext .ts,.tsx`: **0 Errors, 20 Warnings** (kosmetisch: unused imports, non-null assertions in u.a. forge.config.ts, main.ts, tiktok-adapter.ts, orchestrator.ts)

Basis ist sauber. Alle echten Findings sind **Laufzeit-Logik**, wo Compiler/Linter blind sind.

## Review-Aufteilung

| Agent | Bereich | Schwerpunkt-Dateien |
|-------|---------|---------------------|
| 1 | Codex-Provider & Auth | `providers/codex-provider.ts` (917), `services/auth.ts`, `oauth-callback-server.ts` |
| 2 | Memory-System | `memory/memory-manager.ts` (804), `conversation-memory.ts`, `prompt-builder.ts` |
| 3 | Overlay-Studio Foundation | `services/overlay-layout-store.ts`, `builder/tools/overlay-tools.ts`, `overlay-server.ts` |
| 4 | Orchestrator & TikTok-Adapter | `services/orchestrator.ts` (434), `adapters/tiktok-adapter.ts`, ModelRouter, StreamContext |
| 5 | main.ts / IPC / Electron-Security | `main.ts` (1569), `preload.ts`, forge.config.ts (Fuses) |

---

## 🔴 KRITISCH — bricht im echten Stream

### K1 — StreamContext-Reset greift bei internem Reconnect NICHT
`orchestrator`/`main.ts:376-378` + `tiktok-adapter.ts:225-228`
Reset läuft nur in `connectPlatform()`. Adapter reconnectet aber intern (`scheduleReconnect → setTimeout → doConnect`) — passiert im Stream ständig. Folge: alte Chats/Gifts bleiben im Kontext und landen im Prompt. Genau der Bug, den der Kommentar zu verhindern vorgibt.
**Fix:** Reset in den `doConnect()`-Erfolgspfad bzw. `onStatusChange('connected')` legen (nur bei echtem Re-Connect, nicht bei `streamEnd`).

### K2 — Verwaister Reconnect-Loop → doppelte Connections & doppelte Events
`tiktok-adapter.ts:74, 230-241`
Alte `WebcastPushConnection` wird beim Reconnect nie abgeräumt (kein `removeAllListeners()`/`disconnect()` der Vorgänger-Instanz). Bei manuellem Reconnect während Auto-Reconnect läuft → zwei parallele Connections pumpen Events in dieselben Handler. Doppel-Danke, Doppel-Counter.
**Fix:** Generation/Epoch-Token pro `connect()`; am Anfang von `doConnect()` alte Connection `removeAllListeners()` + `disconnect()` + nullen.

### K3 — Kein Schema-Validator vor Overlay-Save/Load
`builder/tools/overlay-tools.ts:149-151` + `overlay-layout-store.ts:239-246`
`save_overlay_layout` reicht rohes KI-JSON ungeprüft durch (`create_overlay_layout` sanitized via `asLayerArray`/`asTriggerArray`, `save` umgeht das — Asymmetrie). `executor.ts:13-21` bestätigt per Kommentar: ajv-Validierung "kommt später". KI-Halluzination (`layers:"kaputt"`, `x:"abc"`, NaN) landet 1:1 auf Disk.
**Fix:** ajv-Schema für OverlayLayout im executor/`saveOverlayLayout` erzwingen; mind. beide Pfade durch denselben Normalisierer.

---

## 🟠 HOCH

### H1 — ⚠️ CROSS-VALIDIERT (Agent 2 + Agent 5): Channel-Lock-Cleanup kaputt
`main.ts:727-736`
`Promise.race`-Cleanup ist toter Code: gespeichert wird die *verkettete* Promise (`previousLock.then(()=>ourLock)`), der Vergleich `=== ourLock` schlägt fast immer fehl → Map `builderChannelLocks` wächst bei vielen (renderer-frei-wählbaren) Channel-Namen monoton. Sauberes Vorbild existiert in `conversation-memory.ts:384-397`.
**Fix:** Cleanup vereinfachen zu `if (builderChannelLocks.get(channel) === ourLock) builderChannelLocks.delete(channel)`, `Promise.race`-Zeile streichen; Channel-Namen gegen Whitelist validieren.

### H2 — Sicherheits-Hebel: generisches `invoke()` + ungeprüftes `builder:execute-tool`
`preload.ts:89` + `main.ts:485-507`
`invoke(channel, ...args)` exponiert JEDEN ipcMain-Channel an den Renderer. `execute-tool` validiert weder Toolname noch Args; Confirm-Gate greift nur bei gesetztem `requiresConfirmation`-Flag. XSS im Renderer (z.B. LLM-Markdown-Render) → voller Main-/FS-Zugriff. **Vor Public-Release schließen.**
**Fix:** generisches `invoke` raus, Sound-Channels explizit benennen; `execute-tool` Toolname gegen Registry prüfen, Default-Policy = Confirm verlangen.

### H3 — Kein Compaction-Timeout → Lock-Stall
`conversation-memory.ts:144-151, 302-339` (await summarize Z.322)
`summarize()` läuft innerhalb des Channel-`withLock` ohne Timeout. Hängt der Provider → Channel-Lock hängt ewig → alle weiteren append/load/clear frieren ein. Triggert bei Token-Overflow in langen Sessions.
**Fix:** `Promise.race([summarize, timeout])`; bei Timeout auf Truncation-Marker (Z.328-334) zurückfallen.

### H4 — Gift/Follow umgeht das Speak-Gate
`orchestrator.ts:163-174` vs `149-155`
`processChatBatch` prüft `canSpeak()` (15s-Gap), `processPriorityQueue` nicht — nur 3s `PRIORITY_DELAY`. Gift-Bombing = ~20 LLM-Calls/Min, kostenpflichtig + TTS-Flut. Kosten-Explosion im viralen Moment.
**Fix:** `canSpeak()` auch im Priority-Pfad oder separates Gift-Gate + Aggregation bei hoher Rate.

### H5 — Kein Provider-Fallback bei 429/down
`orchestrator.ts:182-192, 347-352` + `main.ts:195-198`; ModelRouter routet nur model+reasoningEffort, keine Provider-Kette
Rate-Limit → Bot wird stumm (kein Ausweichen auf nano/lokales Ollama). Stumm genau wenn gebraucht.
**Fix:** Fallback-Kette nano→mini→Ollama bei 429/5xx; mind. Model-Downgrade.

### H6 — Unbounded Queues bei viralem Spike
`orchestrator.ts:93, 110-114, 128-132`
`chatBatch`/`priorityQueue` ohne Größenlimit. 40s `BATCH_INTERVAL` × hunderte/s = Riesen-Prompt (`buildContextMessage` mappt alle), Token-Explosion + Latenz.
**Fix:** harte Caps (letzte N behalten, Rest droppen mit "+X weitere"); im Context-Build auf N Zeilen kappen.

### H7 — Unhandled Rejections aus Timer-Callbacks
`orchestrator.ts:98-101, 117-120, 135-138`
`setTimeout(() => this.processChatBatch())` ohne `.catch()`. Provider-Lookup/`isAvailable()` liegen außerhalb des try → unhandled rejection aus Timer → Batch-Loop stirbt still (Timer schon genullt) / möglicher Main-Crash.
**Fix:** Timer-Callbacks mit `.catch(log.error)`; Provider-Lookup ins try ziehen.

### H8 — WebSocket ohne Heartbeat → Listener-Leak gegen MaxListeners=50
`overlay-server.ts:260-292` + `event-bus.ts:18`
Nur `ws.on('close')`, kein Ping/Pong. Tote Sockets (Stream-PC schläft) bleiben im `avatarClients`-Set + `subscribeAll`-Closure am EventEmitter. Cap nach ~50 Reconnects (`setMaxListeners(50)`).
**Fix:** ein einziger persistenter `subscribeAll` der über `avatarClients` iteriert (löst Leak + MaxListeners); `ws.on('pong')` + Interval-Ping mit `terminate()`.

### H9 — AbortController-Timeout bricht lange Streams mittendrin ab
`codex-provider.ts:713-714, 756-758, 768-873`
Absolutes Gesamt-Timeout (`setTimeout(abort, AGENT_TIMEOUT)`) statt Idle-Timeout → langer Reasoning-Stream (gpt-5.5, hohe reasoning-effort) wird abgewürgt obwohl Daten fließen. Zusätzlich: Reader wird bei Throw nicht gecancelt (Socket-Leak); kein externer `options.signal`-Eingang für User-Cancel.
**Fix:** Idle-Timeout (Timer bei jedem Chunk resetten); `try/finally{ reader.cancel() }`; `options.signal` via `AbortSignal.any()` koppeln.

### H10 — account_id-JWT-Fallback fehlt
`codex-provider.ts:202, 675`
`this.accountId` nur aus Top-Level-Datei-Feld. Neuere codex-CLI legt account_id teils im id_token-Claim ab → Header `ChatGPT-Account-ID` bleibt leer → 401/403 → Refresh bringt nichts → falsche "Session abgelaufen" trotz gültigem Token. Multi-Workspace-Plus-Accounts.
**Fix:** account_id aus id_token-JWT-Claim als Fallback dekodieren (analog `getJwtExp`).

### H11 — `isDuplicate()` prüft nur Top-1-Treffer
`memory-manager.ts:383-399`
`const top = results[0]` — Duplikat wird bei mehreren ähnlichen Einträgen verfehlt, wenn ein generischeres Memory höher scort → doppelte Memories, die `smartCleanup` später teuer mergen muss.
**Fix:** über Top-N (3-5) iterieren, Scope+Type+Subject+Similarity prüfen.

---

## 🟡 MITTEL (Auswahl)

- **429 ohne Backoff/Retry-After** — `codex-provider.ts:749-753`. Retry-Sturm-Gefahr gegen inoffizielles Backend.
- **`writeAuthFile` Read-Modify-Write-Race** ggü. externem `codex login` — `codex-provider.ts:213-236`. Single-User akzeptabel.
- **Secrets im Klartext** (auth.json chmod 600, auf Windows wirkungslos; safeStorage-unavailable → Klartext in electron-store) — `codex-provider.ts:229`, `auth.ts:98-101`.
- **`smartCleanup` O(n²) + synchron** blockiert Main-Thread bei wachsender DB — `memory-manager.ts:727-744`.
- **EventEmitter-Listener-Leak bei Memory-Re-Init** ohne `close()` — `memory-manager.ts:99` + `main.ts:1410-1427`. Latent.
- **`processing`-Guard verwirft Events still statt requeue** — `orchestrator.ts:177-180`. Gift während Chat-Antwort → niemand bedankt sich (teils selbstheilend via unthanked-Marker).
- **Custom-Preset immer auf `balanced`-Basis** (`fast`+Custom unmöglich) — `model-routing.ts:151-155`. Crash-Bug schon gefixt.
- **`user-widgets.json` non-atomic write** (kein tmp+rename) → Crash mitten im Write = stiller Totalverlust aller Widgets — `core-tools.ts:92`, `widget-management.ts:29`.
- **Doppelte Layer-IDs nicht verhindert** → Trigger.targetId mehrdeutig — `overlay-tools.ts:21-39`.
- **`/avatar-assets` per-request `express.static`** statt `path.basename` wie andere Routen (Ausnahme, fragil) — `overlay-server.ts:110-113`.
- **Connect/Disconnect-Pfad ohne Serialisierung** (nur builder:chat hat Mutex) — `main.ts:330-421`. Doppelklick → zwei Adapter.
- **webviewTag+allowpopups ohne Nav-Guard** (kein `setWindowOpenHandler`/`will-navigate`) — `main.ts:218`, `EditorPage.tsx:133`.
- **Avatar-Window ohne `sandbox:true`** (lädt Remote-CDN-Scripts CSP-frei) — `main.ts:281-285`.

## 🟢 MITTEL/NIEDRIG & Konsistenz
- Error-Swallowing ohne Log (SSE-Parse `catch{return}`) — `codex-provider.ts:795`.
- OAuth-Callback ohne `state`/CSRF — `oauth-callback-server.ts:184-211` (PKCE deckt Interception, state fehlt).
- `forgetSubject` interpoliert `this.scope` in SQL (intern validiert, kein SQLi, aber inkonsistent) — `memory-manager.ts:235`.
- `rowToMemory` Silent-Fallback auf `stream` bei ungültigem Scope maskiert Korruption — `memory-manager.ts:79`.
- Korrupte DB → Memory komplett tot bis manueller Delete — `memory-manager.ts:206` + `main.ts:1432`.
- Memory-Handler werfen statt `{ok,error}` (inkonsistent) — `main.ts:763-831`.
- RunAsNode-Fuse aktiv (bewusst, für editor-server) — `forge.config.ts:99`. Akzeptabel single-user.

---

## ✅ Verifiziert SOLIDE (Positiv-Befunde)

- **Electron-Fundamentals Main-Window**: `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, CSP restriktiv (`script-src 'self'`), Fuses gehärtet (OnlyLoadAppFromAsar, AsarIntegrity), `webSecurity` nirgends deaktiviert.
- **Overlay-Server**: bindet nur `127.0.0.1` + 32-Byte-Token-Auth auf allen Routen.
- **Path-Traversal** überall sonst per `path.basename` + Extension-Allowlist / Regex-Whitelist abgesichert.
- **Memory Scope-Isolation hält** (alte Codex-Fixes intakt): retrieve filtert visibleScopes, store nur eigener Scope, forget verweigert Fremd-Scope, sharedMemory ohne Rück-Leak. Alle DB-Inputs parametrisiert.
- **JWT-Refresh-Mutex** dedupliziert korrekt (kein Race-Fenster), `.finally()` setzt zurück. Atomarer auth.json-Write (tmp+rename, chmod 600).
- **SSE-Buffer** korrekt (`decode({stream:true})` für Multi-Byte, Frame erst bei `\n\n`).
- **Lifecycle/Cleanup** beim Quit sauber: alle 4 DB-Handles WAL-safe geschlossen, Poller/Platform/Sound/Overlay/Editor gestoppt, `uncaughtException`/`unhandledRejection` global gefangen.
- **ConversationMemory store-interner `withLock`** ist die echte Race-Absicherung (popLastTurn sauber).
- **Keine doppelten ipcMain.handle-Registrierungen**; Secrets bleiben im Main, nie an Renderer.

---

## Empfohlene Reihenfolge (für späteres Fixen)

1. **K1+K2 zusammen** (Reconnect-Reset + Doppel-Connection) — gleicher Code-Bereich `tiktok-adapter.ts`, größter Stream-Impact.
2. **H1** Channel-Lock (cross-validiert, kleiner Fix mit Vorbild) — guter Aufwärmer.
3. **H4+H5+H6+H7** Orchestrator-Härtung (Gate, Fallback, Caps, Catch) — Stream-Robustheit + Kostenschutz.
4. **K3** Overlay-Validierung (ajv) — Voraussetzung bevor Overlay-Studio weitergebaut wird.
5. **H2** IPC-Sicherheit — vor jedem Public/Tester-Release.
6. **H3, H8, H9, H10, H11** + Mittel-Block nach Bedarf.

TASKBOARD: T231-T235 angelegt (TODO).
