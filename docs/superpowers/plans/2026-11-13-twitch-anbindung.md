# Twitch-Anbindung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bOtExE Studio verbindet sich zusätzlich mit Twitch (Device-Code-Login + EventSub WebSocket); TikTok- und Twitch-Overlays laufen getrennt, jedes mit eigenem Chat; es gibt eine Twitch-Querformat-Vorlage.

**Architecture:** `StudioEvent` bekommt ein optionales `plattform`. Ein neuer `TwitchAdapter` (main) publiziert normalisierte Ereignisse auf denselben `EventBus`. Der `OverlayServer` filtert Ereignisse und Aktionen je Browser-Quelle nach `layout.plattform`. Login/Token über einen `TwitchAuth`-Dienst nach dem Muster des Spotify-Dienstes, aber Device-Code-Flow.

**Tech Stack:** Electron main (TypeScript, `ws`, global `fetch`), React-Renderer, Vanilla-JS-Widgets, Tests mit `node:test` über `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-13-twitch-anbindung-design.md` · Twitch-Fakten: `docs/twitch-api-belege.md` (aus offizieller Doku, einzige Quelle für Twitch-Feldnamen)

## Global Constraints

- Repo-Anleitung `AGENTS.md` gilt (Deutsch in UI/Kommentaren, Bezeichner wie im Umfeld).
- Verifikation nur per Exit-Code: `npm run lint`, `npm run typecheck`, `npm test`, `npm run widget-check` = 0. Nach jeder `.js`-Änderung in `packages/widget-kit/`: `node --check <datei>`.
- Bestehende Overlays dürfen sich nicht ändern: Layout ohne `plattform` = `alle` = heutiges Verhalten; Ereignis ohne `plattform` geht an alle Overlays.
- Kein Client-Secret, nirgends. Twitch-Tokens nur über `SECRET_TOP_LEVEL_FIELDS` (verschlüsselt) und nie im Log/IPC an den Renderer.
- Twitch-Feldnamen ausschließlich aus `docs/twitch-api-belege.md`; was dort „unbelegt“ ist, defensiv lesen (optional chaining, Fallback).
- Twitch-Nutzer-IDs immer `twitch:<user_id>`.
- Nichts releasen, keine Versionsnummer ändern. Commits nur auf `feature/twitch`.
- Kein Netzwerkzugriff in Tests: `fetch` und WebSocket werden injiziert/gefälscht.

## Review Focus

1. Altes Layout ohne `plattform` + TikTok-Ereignis ohne/mit `plattform:'tiktok'` → kommt exakt wie vorher an (inkl. Sticky-Nachlieferung beim Verbinden).
2. Twitch-Follow löst eine bestehende Follow-Regel aus → Alert erscheint nur in `twitch`/`alle`-Overlays, nicht im `tiktok`-Overlay.
3. Abgelaufener Access-Token beim App-Start → Erneuerung mit Refresh-Token; Refresh-Token ungültig (`invalid_grant`/400) → Status „Bitte neu verbinden“, keine Endlosschleife, kein Absturz.
4. EventSub `session_reconnect` und Keepalive-Ausfall → neue Verbindung ohne doppelte Ereignisse (message_id-Duplikate verwerfen) und ohne verlorene Abos.
5. Chat mit Emotes, leerem Text, sehr langem Namen, fehlendem Profilbild → Chat-Box zeigt sauber an, wirft nicht.

---

### Task 1: Plattform-Fundament (Ereignis, Layout, Bus, Overlay-Filter, Statistik)

**Files:**
- Modify: `packages/trigger-engine/src/index.ts` (`StudioEventType` + `raid`, `cheer`; `StudioEvent.plattform?`, `raid?`, `cheer?`, `subGeschenk?`)
- Modify: `packages/overlay-engine/src/index.ts` (`OverlayLayout.plattform?`, `layoutJsonSchema`, Export `type OverlayPlattform`)
- Modify: `apps/desktop/src/main/core/event-bus.ts` (Sticky-Schlüssel je Art+Plattform)
- Modify: `apps/desktop/src/main/adapters/overlay-server.ts` (Filter in Event-/Action-Broadcast und Sticky-Nachlieferung)
- Modify: `apps/desktop/src/main/services/studio.ts` (Action-Nachricht trägt `plattform`; `stats.apply` nur für ohne/`tiktok`)
- Modify: `apps/desktop/src/main/adapters/tiktok-adapter.ts` (jedes publizierte Ereignis bekommt `plattform:'tiktok'`)
- Test: bestehende Testdateien daneben ergänzen (`overlay-server.test.ts`, `event-bus`-Test falls vorhanden sonst neu `event-bus.test.ts`, `packages/overlay-engine/src/layout.test.ts`)

**Interfaces:**
- Produces:
  - `type Plattform = 'tiktok' | 'twitch'` (trigger-engine, exportiert)
  - `StudioEvent.plattform?: Plattform`; `StudioEvent.raid?: { viewers: number }`; `StudioEvent.cheer?: { bits: number }`; `StudioEvent.subGeschenk?: { anzahl: number; tier?: string; anonym?: boolean }`
  - `type OverlayPlattform = 'alle' | 'tiktok' | 'twitch'` und `OverlayLayout.plattform?: OverlayPlattform` (overlay-engine)
  - `export function passtZuPlattform(layoutPlattform: OverlayPlattform | undefined, eventPlattform: Plattform | undefined): boolean` in overlay-engine — true wenn Layout fehlt/`alle`, oder Ereignis ohne Plattform, oder gleich.
  - Overlay-Nachricht `{ kind:'action'; ruleId; action; plattform?: Plattform }`

- [ ] Step 1: Tests schreiben: `passtZuPlattform` Wahrheitstabelle (alle 3×3 Kombinationen inkl. undefined); `validateLayout` akzeptiert `plattform:'twitch'`, lehnt `plattform:'youtube'` ab, akzeptiert Layout ohne Feld; EventBus: `chat` tiktok und `chat` twitch überschreiben sich in `getAllLastValues()` nicht, Ereignis ohne Plattform verhält sich wie bisher; OverlayServer: Client mit Layout `twitch` bekommt TikTok-Ereignis NICHT, Ereignis ohne Plattform JA, Client mit Layout ohne `plattform` bekommt beides; dasselbe für `action` und für die Sticky-Nachlieferung beim Verbinden.
- [ ] Step 2: Tests laufen lassen → rot.
- [ ] Step 3: Implementieren. OverlayServer kennt das Layout eines Clients über das vorhandene `getLayout(profileId)`; Plattform des Layouts beim Senden nachschlagen (Layout kann sich im Editor ändern — nicht nur beim Verbinden cachen). `studio.ts`: dort, wo Aktionen an den OverlayServer gehen, die Plattform des auslösenden Ereignisses mitgeben.
- [ ] Step 4: `npm run typecheck && npm test` → 0.
- [ ] Step 5: Commit `Plattform-Feld: Ereignisse und Overlays nach TikTok/Twitch trennbar`.

### Task 2: Twitch-Login (Device-Code-Flow) und Token-Verwaltung

**Files:**
- Create: `apps/desktop/src/main/services/twitch-auth.ts`
- Create: `apps/desktop/src/main/services/twitch-auth.test.ts`
- Modify: `apps/desktop/src/main/services/settings-store.ts` (`twitchClientId: string`, `twitchTokens?: TwitchTokens`, `twitchAutoConnect: boolean` Standard true; Defaults; `sanitizeSettingsPatch`; `SECRET_TOP_LEVEL_FIELDS` + `'twitchTokens'`)
- Modify: `apps/desktop/src/main.ts` (`SETTINGS_GET`-Deny-List: `twitchTokens` entfernen, Flag `twitchConnected` setzen)
- Test: `settings-allowlist.test.ts`, `secret-box`/`settings-store`-Tests ergänzen

**Interfaces:**
- Produces:
  - `interface TwitchTokens { accessToken: string; refreshToken: string; expiresAt: number; scopes: string[]; userId: string; login: string }`
  - `const TWITCH_SCOPES: readonly string[]` — genau die Scopes, die Task 3 laut Belege-Datei braucht (Follow, Chat lesen, Subs, Bits).
  - `class TwitchAuth { constructor(deps: { fetch: typeof fetch; now: () => number; getClientId(): string; loadTokens(): TwitchTokens|undefined; saveTokens(t: TwitchTokens|undefined): void; log?(...) }) ; beginDeviceLogin(): Promise<{ userCode: string; verificationUri: string; expiresIn: number }>; waitForLogin(signal?: AbortSignal): Promise<TwitchTokens>; getValidToken(): Promise<TwitchTokens>; logout(): Promise<void> }`
  - Fehlerklasse `TwitchReloginNoetig extends Error` (Refresh ungültig / Scopes fehlen).

- [ ] Step 1: Tests mit gefälschtem `fetch`: Device-Start liefert Code+URI; Polling behandelt „pending“ (weiter), „slow_down“ (Intervall erhöhen), „expired/denied“ (Fehler) — Statuscodes/Texte exakt aus Belege-Datei; nach Erfolg `validate` → `userId`/`login` gespeichert; `getValidToken` erneuert bei `expiresAt` < jetzt+60 s, speichert neues Refresh-Token (Einmal-Refresh-Token bei öffentlichen Clients!); gleichzeitige `getValidToken`-Aufrufe → nur EIN Refresh (In-flight-Guard wie Spotify); Refresh 400/invalid → `TwitchReloginNoetig` + Tokens gelöscht; `logout` ruft Revoke und löscht. Settings: `twitchTokens` wird verschlüsselt (steht nicht im Klartext-JSON), `SETTINGS_GET` liefert kein Token aber `twitchConnected:true`.
- [ ] Step 2: rot. Step 3: implementieren (Endpunkte, Parameter, `grant_type` exakt aus Belege-Datei; Tokens/Codes nie loggen). Step 4: typecheck+test = 0.
- [ ] Step 5: Commit `Twitch-Login per Gerätecode, Tokens verschlüsselt`.

### Task 3: Twitch-EventSub-Verbindung und Normalisierung

**Files:**
- Create: `apps/desktop/src/main/adapters/twitch-normalize.ts` (+ `.test.ts`)
- Create: `apps/desktop/src/main/adapters/twitch-adapter.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `TwitchAuth.getValidToken()`, `TwitchReloginNoetig` (Task 2); `StudioEvent`, `Plattform` (Task 1); `EventBus.publish`.
- Produces:
  - `normalizeTwitch(subscriptionType: string, event: unknown, now: number, bild?: (userId: string) => string|undefined): StudioEvent[]` — reine Funktion, Mapping:
    - `channel.follow` → `follow` · `channel.chat.message` → `chat` (Text, Emote-Fragmente → `sticker[]` mit CDN-Bild aus Belege-Vorlage, Badges → `isMod`/`isSub`, Broadcaster = Mod) · `channel.subscribe` → `sub` (`subMonths:1`, ohne Nachricht; bei `is_gift` nur wenn Belege das hergeben) · `channel.subscription.message` → `sub` (`subMonths` = kumulierte Monate, `text`) · `channel.subscription.gift` → `sub` mit `subGeschenk` (anonym → Nutzer „Anonym“) · `channel.cheer` → `cheer` (`cheer.bits`, `text`) · `channel.raid` → `raid` (`raid.viewers`, Nutzer = Raider-Kanal) · `stream.online`/`offline` → keine StudioEvents (Adapter-Status).
    - Jedes Ereignis: `plattform:'twitch'`, `user.id = 'twitch:'+id`, `user.userId` = Login.
  - `type TwitchStatus = 'aus' | 'verbinde' | 'verbunden' | 'getrennt' | 'neu-anmelden' | 'fehler'`; `interface TwitchStatusInfo { status: TwitchStatus; login?: string; live?: boolean; detail?: string }`
  - `class TwitchAdapter { constructor(deps: { auth: TwitchAuth; bus: { publish(e: StudioEvent): void }; fetch: typeof fetch; openSocket: (url: string) => WebSocketLike; now; log; onStatus(info: TwitchStatusInfo): void; setTimeout/clearTimeout? }); start(): Promise<void>; stop(): void; getStatus(): TwitchStatusInfo }` mit `WebSocketLike` analog `LiveConnectionLike`.
  - Verhalten: Welcome → Abos per Helix anlegen (Body/Header aus Belege) innerhalb der Frist; Keepalive-Wächter (Timeout = keepalive_timeout_seconds + Puffer → neu verbinden); `session_reconnect` → neue URL öffnen, alte erst nach Welcome der neuen schließen, Abos NICHT neu anlegen (laut Doku bleiben sie); Duplikate per `message_id` (Ringpuffer ~500) verwerfen; `revocation` loggen, Status; 401 bei Abo-Anlage → einmal Token erneuern, sonst `neu-anmelden`; Wiederverbinden mit wachsender Pause (max 60 s).
  - Profilbild-Zwischenspeicher: unbekannte Chatter-IDs sammeln, gebündelt (≤100) per Get Users nachladen, Bild für spätere Ereignisse liefern; Chat wird nicht verzögert.

- [ ] Step 1: Normalizer-Tests mit Beispiel-JSON aus der Belege-Datei (je Typ eins, plus: Chat mit 2 Emotes + Text dazwischen, leere Nachricht, anonymes Geschenk, fehlende Felder → kein Wurf).
- [ ] Step 2: Adapter-Tests mit Fake-Socket/Fake-fetch: Welcome → genau N Abo-POSTs mit `session_id`; Notification → `bus.publish`; Duplikat-`message_id` → einmal; Keepalive-Ausfall → Neuverbindung; `session_reconnect` → neue Verbindung, alte zu nach Welcome, keine neuen POSTs; 401 → Refresh einmal; `TwitchReloginNoetig` → Status `neu-anmelden`, kein Reconnect-Loop; `stop()` räumt Timer.
- [ ] Step 3: rot → implementieren → typecheck+test = 0.
- [ ] Step 4: Commit `Twitch-EventSub: Follow, Chat, Subs, Bits, Raid`.

### Task 4: Studio-Verdrahtung, IPC und Einstellungen-UI

**Files:**
- Modify: `apps/desktop/src/shared/constants.ts` (IPC `TWITCH_BEGIN_LOGIN`, `TWITCH_LOGOUT`, `TWITCH_GET_STATUS`, `TWITCH_STATUS` (push), `TWITCH_CONNECT`, `TWITCH_DISCONNECT`)
- Modify: `apps/desktop/src/preload.ts`, `apps/desktop/src/main.ts`, `apps/desktop/src/main/services/studio.ts`
- Modify: `apps/desktop/src/renderer/pages/SettingsPage.tsx` (Abschnitt „Twitch-Verbindung“, Muster Spotify-Abschnitt)
- Modify: `apps/desktop/src/renderer/components/SystemAmpel.tsx` (Twitch-Status, nur wenn Client-ID gesetzt)
- Test: `ipc-wiring.test.ts` muss grün sein; Studio-Test für Auto-Start falls Muster vorhanden.

**Interfaces:**
- Consumes: Tasks 2+3.
- Produces: `window.studio.twitchBeginLogin(): Promise<{userCode, verificationUri, expiresIn}>`, `twitchLogout()`, `twitchGetStatus()`, `onTwitchStatus(cb)`, `twitchConnect()`, `twitchDisconnect()`.

- [ ] Step 1: Studio baut `TwitchAuth`+`TwitchAdapter` (echtes `fetch`, `ws`), startet beim App-Start, wenn Tokens da und `twitchAutoConnect`; `beginLogin` öffnet `verificationUri` per `shell.openExternal` (nur https), wartet im Hintergrund auf Login und startet dann den Adapter; Status-Push an Renderer.
- [ ] Step 2: Einstellungen: Client-ID-Feld mit kurzer Anleitung (dev.twitch.tv/console, Client-Typ „Öffentlich“, Weiterleitungs-URL `http://localhost`), Knopf „Mit Twitch verbinden“ → zeigt den Code groß + „Im Browser bestätigen“, Status „Verbunden als <login>“, „Trennen“, Schalter „Beim Start automatisch verbinden“.
- [ ] Step 3: lint+typecheck+test = 0. Commit `Twitch in Einstellungen: verbinden, Status, Auto-Start`.

### Task 5: Overlays — Plattform-Auswahl, Twitch-Vorlage, Chat-Zeichen, Doku

**Files:**
- Modify: `apps/desktop/src/renderer/pages/OverlayPage.tsx` (Plattform-Auswahl je Overlay: „Alle / Nur TikTok / Nur Twitch“; Knopf „Twitch-Overlay (Querformat) anlegen“)
- Create: `apps/desktop/src/renderer/pages/twitch-vorlage.ts` (+ Test): `erzeugeTwitchVorlage(id: string, name?: string): OverlayLayout` — 1920×1080, `plattform:'twitch'`, Ebenen: `chat-box` (rechts), `herz-alarm` mit Ereignissen `follow` (Piraten-Orakel), `piraten-banner`, `follow-alert`; Props mit gültigen Standardwerten aus `widget-types.ts`; besteht `validateLayout`.
- Modify: `packages/widget-kit/chat-box.js` (+ Prop `plattformZeichen` boolean, Standard false → altes Aussehen unverändert; zeigt kleines TikTok/Twitch-Zeichen vor dem Namen) und `widget-types.ts` (Feld)
- Modify: `packages/widget-kit/follow-alert.js` nur falls nötig, damit Twitch-`follow` ankommt (prüfen, nicht umbauen).
- Docs: `CHANGELOG.md` „Unveröffentlicht“ → Abschnitt „Neu: Twitch“, `docs/twitch.md` (Einrichtung in 5 Schritten für Streamer), `docs/widgets.md` per Galerie-Skript neu, falls Widget-Props geändert.

- [ ] Step 1: Test `erzeugeTwitchVorlage` → `validateLayout` ok, `plattform==='twitch'`, Canvas 1920×1080, alle Ebenen innerhalb des Canvas.
- [ ] Step 2: implementieren; `node --check` für geänderte Widget-Dateien; `npm run widget-check`.
- [ ] Step 3: lint+typecheck+test+widget-check = 0. Commit `Twitch-Overlay-Vorlage, Plattform je Overlay, Plattform-Zeichen im Chat`.
