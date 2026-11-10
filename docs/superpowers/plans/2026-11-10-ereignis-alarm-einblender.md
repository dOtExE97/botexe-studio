# Ereignis-Alarm + Einblender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TikTok-Banner (Level-Ups, Superfan-Abos) werden zu App-Ereignissen, der Herz-Alarm bekommt einen Modus „Ereignisse" mit live gerenderten Premium-Animationen + Warteschlange, und ein neues Widget „Einblender" spielt Werbe-Spots (zeitgesteuert, per Regel, automatisch bei Like-Flaute).

**Architecture:** Main-Prozess: `WebcastBarrageMessage` wird gemappt und in `tiktok-normalize.ts` zu `level_up`/`superfan` normalisiert; ein reiner `LevelUpWaechter` liefert den Abzeichen-Ersatzweg und das Dedup. Overlay: neues Modul `alarm-anim.js` mit Canvas-Renderern (portiert aus den abgenommenen Proben), `ereignis-alarm.js` als Klasse, an die `herz-alarm.js` nur bei `modus:'ereignisse'` delegiert; `einblender.js` als eigenes Widget.

**Tech Stack:** Electron/TypeScript (main), Vanilla-ES-Module + Canvas 2D (widget-kit), node:test.

**Spec:** `docs/superpowers/specs/2026-11-10-ereignis-alarm-einblender-design.md` (inkl. Abschnitt „Belege aus dem Live-Mitschnitt" — der ersetzt widersprechende Stellen davor). Proben: `docs/superpowers/specs/2026-11-10-proben/`.

## Global Constraints

- Bestehende Overlays dürfen sich nie verändern: Herz-Alarm ohne `modus` (oder `modus:'klassisch'`) verhält sich exakt wie heute. Widget-Standard `modus: 'klassisch'`.
- Nach jeder `.js`-Änderung in `packages/widget-kit/`: `node --check <datei>`.
- Verifikation nur per Exit-Code: `npm run lint`, `npm run typecheck`, `npm test`, `npm run widget-check` — alle 0.
- Logzeilen in Alltagssprache, gedrosselt über `log.einmal`/`log.gedrosselt` (`apps/desktop/src/main/core/logger.ts`); nie Token/URLs mit Query/ganze Objekte loggen.
- „Nicht raten": Feldnamen nur wie im Spec-Abschnitt „Belege" (msgType als Zahl, `userGradeParam`/`fansLevelParam`, `piecesList`, `envelopeInfo.*`). Unbelegtes (msgType 4/7) defensiv: Zahl ODER Text.
- Sprache: Deutsch in UI, Logs, Kommentaren. Commit-Messages über Datei (`git commit -F`), mit den Attribution-Zeilen.
- Kein Release, kein Push ohne Alex' ausdrückliche Freigabe. Die drei uncommitteten Dateien (`tiktok-adapter.ts`, `tiktok-adapter.test.ts`, `studio.ts`) gehören zu einer früheren Arbeit — beim Bearbeiten derselben Dateien NICHT mit-committen, was nicht zur Aufgabe gehört (`git add -p`).
- Animationen müssen den Proben gleichwertig aussehen und deren Zeitachsen exakt halten (Sounds sind darauf getaktet).

## Review Focus

1. **Bestehender Herz-Alarm-Layer ohne `modus`** → spielt wie bisher (Abbruch statt Warteschlange, gleiche Motive). Wächter-Test in Task 8.
2. **Ereignis ohne Profilbild / Bild-URL lädt nicht (CORS, abgelaufen)** → Initiale statt leerem Kreis oder Absturz; Animation läuft durch. Test in Task 6.
3. **Banner mit unbekanntem msgType oder fehlendem `user`** → kein Ereignis, eine Logzeile je msgType und Verbindung, kein Wurf. Test in Task 1.
4. **Ereignis-Flut (10 Level-Ups in 2 s, Stream-Reconnect mit `sticky`)** → max. 10 wartend, Überlauf geloggt, `sticky` ignoriert. Test in Task 8.
5. **Widget in ausgeblendeter Ebene / Box 40×30 / nach `destroy()`** → kein NaN-Zeichnen, keine Timer-Leichen (AGENTS.md). Abgedeckt durch `widget-belastung` in Task 10 und eigenen Test in Task 6.

---

### Task 1: Banner normalisieren (`level_up`, Superfan-Abo, Superfan betritt)

**Files:**
- Modify: `packages/trigger-engine/src/index.ts` (Union Z.~23 um `'level_up'`; `StudioEvent` um `levelUp?: { art: 'team' | 'gifter'; neu: number }`, `superfanArt?: 'abo_neu' | 'abo_verlaengert' | 'betritt'`; `envelope` um `businessType?: number; envelopeId?: string`)
- Modify: `apps/desktop/src/main/adapters/tiktok-normalize.ts` (neu `normalizeBarrage`; `normalizeEnvelope` füllt `businessType`, `envelopeId`; `normalizeSuperfan` setzt `superfanArt`)
- Test: `apps/desktop/src/main/adapters/tiktok-normalize.test.ts`

**Interfaces:**
- Produces: `export function normalizeBarrage(data: RawBarrage, ts: number): StudioEvent | null` — `RawBarrage = { msgType?: number | string; subType?: string; userGradeParam?: { currentGrade?: number | string; user?: RawUser }; fansLevelParam?: { currentGrade?: number | string; user?: RawUser }; content?: Bausteine; commonBarrageContent?: Bausteine }`.
  - msgType 10 / `'FANS_LEVEL_UPGRADE'` → `{ type:'level_up', user (mit teamLevel=neu), levelUp:{art:'team', neu} }`
  - msgType 8 / `'USER_UPGRADE'` → `{ type:'level_up', user (mit gifterLevel=neu), levelUp:{art:'gifter', neu} }`
  - msgType 4/7 / `'SUBSCRIBE'`/`'SUBSCRIBE_GIFT'` → `{ type:'superfan', user, superfanNeu:true, superfanArt:'abo_neu' }` (Nutzer aus `user` → `piecesList[].userValue.user` → `fansLevelParam.user`)
  - msgType 11 → `{ type:'superfan', user, superfanNeu:false, superfanArt:'betritt' }`
  - sonst, oder kein Nutzer, oder `neu` ≤ 0 → `null`
- Produces: `export const BARRAGE_TYPEN = { SUBSCRIBE: 4, SUBSCRIBE_GIFT: 7, USER_UPGRADE: 8, GRADE_USER_ENTRANCE: 9, FANS_LEVEL_UPGRADE: 10, FANS_LEVEL_ENTRANCE: 11 } as const`
- `normalizeSuperfan(data, beigetreten, ts)`: `superfanArt` = `beigetreten ? 'abo_neu' : 'betritt'`.
- `normalizeSub`: ergänzt `superfanArt` NICHT (Typ bleibt `sub`); Feld bleibt unverändert.

- [ ] **Step 1: Failing tests** — Fixtures als minimale Objekte im Format des Mitschnitts (keine echten Namen/IDs):
  - `normalizeBarrage({msgType:10, fansLevelParam:{currentGrade:12, user:{userId:'1', nickname:'Mia'}}}, 5)` → `type 'level_up'`, `levelUp {art:'team', neu:12}`, `user.nickname 'Mia'`, `user.teamLevel 12`.
  - `msgType:8, userGradeParam:{currentGrade:32, user:{userId:'2', nickname:'Steffi', profilePicture:{url:['https://x/a.webp']}}}` → `art 'gifter'`, `neu 32`, `user.profilePic 'https://x/a.webp'`.
  - `msgType:'FANS_LEVEL_UPGRADE'` (Text) → wie Zahl 10.
  - `msgType:4, commonBarrageContent:{piecesList:[{userValue:{user:{userId:'3', nickname:'Abo'}}}]}` → `type 'superfan'`, `superfanNeu true`, `superfanArt 'abo_neu'`.
  - `msgType:11, fansLevelParam:{currentGrade:22, user:{userId:'4', nickname:'Hay'}}` → `superfanArt 'betritt'`, `superfanNeu false`.
  - Echtform aus dem Mitschnitt: `msgType:10, subType:'fans_upgrade', fansLevelParam:{currentGrade:12, user:{userId:'5', nickname:'Alex'}}` → `level_up` team 12.
  - `msgType:9` → `null`; `msgType:10` ohne Nutzer → `null`; `msgType:10, currentGrade:0` → `null`; `{}` → `null`.
  - `normalizeEnvelope({envelopeInfo:{envelopeId:'77', businessType:1, sendUserName:'dotexe97', sendUserId:'9', diamondCount:20, peopleCount:16, sendUserAvatar:{url:['https://x/b.webp']}}}, 1)` → `envelope.businessType 1`, `envelope.envelopeId '77'`, `user.profilePic 'https://x/b.webp'`, `envelope.coins 20`.
- [ ] **Step 2:** `npm test -w apps/desktop -- --test-name-pattern Barrage` (bzw. der im Repo übliche Einzeltest-Aufruf) → FAIL (`normalizeBarrage` nicht exportiert).
- [ ] **Step 3:** Implementieren. `toUser` wiederverwenden (liest `profilePicture.url`); Stufe über vorhandenes `ersteZahl`.
- [ ] **Step 4:** Tests → PASS; `npm run typecheck` → 0.
- [ ] **Step 5:** Commit `feat(tiktok): Banner zu level_up/Superfan-Abo normalisieren`.

### Task 2: Banner + Truhen im Cloud-Weg verdrahten, Logzeilen

**Files:**
- Modify: `apps/desktop/src/main/adapters/tiktok-cloud.ts` (`TYPE_TO_EVENT`: `WebcastBarrageMessage: 'barrage'`, `barrage: 'barrage'`; `CloudEmitEvent` um `'barrage'`; alten Kommentar ~186–197 durch Verweis auf Spec-Belege ersetzen)
- Modify: `apps/desktop/src/main/adapters/tiktok-adapter.ts` (~Z. 974–979: `on('barrage', …)` → `normalizeBarrage`; `null` → `log.einmal(\`tiktok:barrage:${msgType}\`, 'info', 'TikTok', \`Banner-Art ${msgType} (${subType}) erkannt — die App wertet sie (noch) nicht aus.\`)`; Dedup Superfan-Abo: gleicher `user.id` + `superfan` mit `superfanArt` abo_* innerhalb 60 s → nur einmal publizieren, auch über `sub` hinweg)
- Modify: `apps/desktop/src/main/services/studio.ts` (beim Ereignis-Eingang neben der Gift-Logzeile ~Z. 728: Logzeilen für `level_up`, `superfan` (je Art), `envelope`)
- Test: `apps/desktop/src/main/adapters/tiktok-cloud.test.ts`, `tiktok-adapter.test.ts`

**Interfaces:**
- Consumes: `normalizeBarrage`, `BARRAGE_TYPEN` (Task 1).
- Logtexte (exakt):
  - `Teamherz-Level-Up: ${name} → Stufe ${neu}` / `Geschenke-Stufe-Level-Up: ${name} → Stufe ${neu}`
  - `Neuer Superfan (Abo): ${name}` / `Superfan-Abo verlängert: ${name}` / `Superfan betritt das Live: ${name}` (letzteres `log.gedrosselt` je Nutzer 10 min)
  - `Schatztruhe von ${name}: ${coins} Coins, ${winners} Leute (Art ${businessType})`
- **Belegt: „Superfan betritt" kommt DOPPELT** — als Kurzname `superFan` UND als `WebcastBarrageMessage` msgType 11, gleiche Millisekunde. Dedup: `superfanArt:'betritt'` desselben `user.id` innerhalb 5 s → ein Publish. Teamherz-Level-Up (msgType 10, `subType 'fans_upgrade'`, Text „reached member Lv.{0:string}") kam im Mitschnitt nur einmal.


- [ ] **Step 1: Failing tests:** `mapCloudMessage('WebcastBarrageMessage', {msgType:10})` → `{kind:'event', event:'barrage'}`; Adapter: zwei Abo-Meldungen (Banner 4 + `subNotify`) desselben Nutzers in 1 s → genau ein `superfan`-Publish plus das `sub`-Ereignis bleibt erhalten (klassischer Herz-Alarm hört weiter auf `sub`).
- [ ] **Step 2:** Tests laufen → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS; `lint`/`typecheck` → 0.
- [ ] **Step 5:** Commit `feat(tiktok): Banner und Truhen auswerten und lesbar loggen` (nur die eigenen Hunks: `git add -p`).

### Task 2b: LIVE-Ziel + VIP betritt (Main-Prozess)

**Files:**
- Modify: `packages/trigger-engine/src/index.ts` (Union um `'live_ziel' | 'vip_betritt'`; `StudioEvent` um `ziel?: { id: string; beschreibung?: string; fortschritt: number; ziel: number; geschenk?: { name: string; id?: string }; erreicht: boolean }`, `vip?: { stufe: number }`)
- Modify: `apps/desktop/src/main/adapters/tiktok-normalize.ts` (`normalizeBarrage`: msgType 9 → `vip_betritt`; neu `normalizeGoalUpdate`)
- Modify: `apps/desktop/src/main/adapters/tiktok-cloud.ts` (`WebcastGoalUpdateMessage`/`goalUpdate` → neues CloudEmitEvent `'goalUpdate'`; `WebcastInRoomBannerMessage`: weiter verworfen, aber Feldnamen `log.einmal` je Stream auch OHNE Diagnose-Modus)
- Modify: `apps/desktop/src/main/adapters/tiktok-adapter.ts` (`on('goalUpdate')`; VIP-Dedup: je `user.id` einmal pro Verbindung)
- Modify: `apps/desktop/src/main/services/studio.ts` (Logzeilen: `VIP betritt das Live: ${name} (Geschenke-Stufe ${stufe})` gedrosselt je Nutzer; `LIVE-Ziel: ${fortschritt}/${ziel} ${geschenk} — Beitrag von ${name}` gedrosselt 30 s; `LIVE-Ziel erreicht: …` immer)
- Tests: `tiktok-normalize.test.ts`, `tiktok-cloud.test.ts`, `tiktok-adapter.test.ts`

**Interfaces:**
- Produces: `normalizeGoalUpdate(data: RawGoalUpdate, ts: number): StudioEvent | null` → `{ type:'live_ziel', ts, user?: {id: contributorIdStr ?? contributorId, nickname: contributorDisplayId}, ziel }`; `fortschritt`/`ziel` = Summe `progress`/`target` aller `goal.subGoals`; `geschenk` = erstes `subGoals[].gift` mit Name; `beschreibung` = `goal.description`; kein `goal.id` → `null`.
- `normalizeBarrage` msgType 9 / `'GRADE_USER_ENTRANCE_NOTIFICATION'` → `{ type:'vip_betritt', user (gifterLevel=stufe), vip:{stufe} }` (Stufe 0 / kein Nutzer → null).

- [ ] **Step 1: Failing tests:** GoalUpdate-Fixture im Mitschnitt-Format (`goal:{id:'g1', description:'Sende…', subGoals:[{id:'7934', progress:'35', target:'50', gift:{name:'Heart Me'}}]}, contributorIdStr:'9', contributorDisplayId:'Alex'`) → `ziel {id:'g1', fortschritt:35, ziel:50, erreicht:false, geschenk:{name:'Heart Me'}}`, `user.nickname 'Alex'`; progress '50' → `erreicht true`; zwei subGoals summiert; ohne `goal.id` → null. Barrage 9 mit `userGradeParam{currentGrade:32, user}` → `vip_betritt`, `vip.stufe 32`. Adapter: gleicher VIP zweimal → ein Publish.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** PASS; lint/typecheck/test 0.
- [ ] **Step 5:** Commit `feat(tiktok): LIVE-Ziel und VIP-Eintritt als Ereignisse`.

### Task 3: Teamherz-Level-Up über Abzeichen (Ersatzweg) + Dedup

**Files:**
- Create: `apps/desktop/src/main/core/level-up-waechter.ts`
- Test: `apps/desktop/src/main/core/level-up-waechter.test.ts`
- Modify: `apps/desktop/src/main/services/studio.ts` (beim Eingang jedes Ereignisses mit `user.teamLevel`; Reset in `resetSession()`)

**Interfaces:**
- Produces:
  ```ts
  export class LevelUpWaechter {
    /** Abzeichen gesehen. Liefert die neue Stufe, wenn sie gegenüber der letzten
     *  Sichtung in dieser Sitzung gestiegen ist; Erstsichtung → null. */
    sieheStufe(userId: string, stufe: number, ts: number): number | null;
    /** Banner-Level-Up gemeldet; merkt sich (userId, stufe, ts) fürs Dedup und als letzte Stufe. */
    vonBanner(userId: string, stufe: number, ts: number): void;
    /** true, wenn für userId+stufe in den letzten 60 000 ms schon ein Level-Up lief. */
    istDoppelt(userId: string, stufe: number, ts: number): boolean;
    reset(): void;
  }
  ```
- studio.ts: Banner-`level_up` (art 'team') → `vonBanner` VOR dem Weiterreichen; verworfen, wenn `istDoppelt`. Abzeichen-Anstieg → `istDoppelt`? sonst synthetisch `{type:'level_up', ts, user, levelUp:{art:'team', neu}}` über denselben Weg wie Adapter-Ereignisse publizieren (NICHT als `synthetic` markieren — das bedeutet „Test"). Ereignisse mit `sticky` und `synthetic` füttern den Wächter nicht.

- [ ] **Step 1: Failing tests:** Erstsichtung (5) → `null`; danach 6 → `6`; danach 6 → `null`; 5 → `null` (kein Abstieg); `vonBanner('a',7,1000)` dann `istDoppelt('a',7,50_000)` → `true`, bei `61_001` → `false`; `sieheStufe` nach `vonBanner('a',7)` mit 7 → `null`; `reset()` macht nächste Sichtung zur Erstsichtung.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** PASS + typecheck 0.
- [ ] **Step 5:** Commit `feat: Teamherz-Level-Up auch über Abzeichen erkennen`.

### Task 4: Trigger-Engine `level_up`

**Files:**
- Modify: `packages/trigger-engine/src/index.ts` (Bedingungen `{ kind:'level_art_ist'; value:'team'|'gifter' }`, `{ kind:'level_neu_gte'; value:number }`, Auswertung ~Z. 583–637)
- Modify: `apps/desktop/src/main/services/validators.ts` (`EVENT_TYPES` + `CONDITION_KINDS` + Wertprüfung)
- Zusätzlich (Erweiterung): Ereignistypen `live_ziel` (Bedingung `{ kind:'ziel_erreicht' }` → nur wenn `ziel.erreicht`) und `vip_betritt` (Bedingung `{ kind:'vip_stufe_gte'; value:number }`); `EVENT_OPTIONS`-Labels `'🎯 TikTok-LIVE-Ziel'`, `'👑 VIP betritt das Live'`.
- Modify: `apps/desktop/src/renderer/pages/TriggersPage.tsx` (`EVENT_OPTIONS`: `{ value:'level_up', label:'⬆️ Level-Up (Teamherz / Geschenke-Stufe)' }`, Bedingungsliste, Beschreibungstexte; „Neuer Sub (Teamherz)"-Texte → „Neuer Superfan (Abo)")
- Modify: `apps/desktop/src/main/adapters/overlay-server.ts` Test-Event-Route + `test-event-allowlist.test.ts` (Felder `levelUp`, `superfanArt`)
- Test: `packages/trigger-engine/src/engine.test.ts`

- [ ] **Step 1: Failing tests:** Regel `event:'level_up'` + `level_art_ist:'team'` + `level_neu_gte:10` feuert bei `{levelUp:{art:'team',neu:12}}`, nicht bei `neu:9`, nicht bei `art:'gifter'`; Validator lässt beide Bedingungen durch, verwirft `level_neu_gte` mit `value:-1`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** PASS; lint/typecheck/test 0.
- [ ] **Step 5:** Commit `feat(trigger): Ereignis Level-Up mit Bedingungen`.

### Task 5: Schrift + Standard-Sounds bündeln

**Files:**
- Create: `packages/widget-kit/inter-black.woff2` (aus `docs/superpowers/specs/2026-11-10-proben/Inter-Black.ttf`, z. B. `pyftsubset … --flavor=woff2` mit Latin + Latin-1 + `→★♥✓`)
- Create: `packages/widget-kit/sounds/botexe-levelup-herzschlag.wav`, `-goldherz.wav`, `-neon.wav`, `-tiktok.wav`, `-tiktok-neon.wav` (= `sfx1…5.ogg`), `botexe-superfan.wav` (`sfx_sf2`), `botexe-truhe.wav` (`sfx_tr2`), `botexe-einblender.wav` (`sfx_spot2`) — per `ffmpeg -i X.ogg -ar 48000 -ac 2 Y.wav`
- Modify: `THIRD-PARTY-LICENSES.md` (Inter, SIL OFL 1.1)

- [ ] **Step 1:** Prüfen, wie `studio.ts` ~Z. 3117 `widget-kit/sounds` in die Sound-Bibliothek übernimmt (Dateiendungen, Überschreiben) — Ergebnis als Kommentar im Commit notieren.
- [ ] **Step 2:** Dateien erzeugen; `find . -name "*.webp" -not -path "./node_modules/*" | wc -l` → `0`.
- [ ] **Step 3:** `npm test` → 0 (Asset-Wächter).
- [ ] **Step 4:** Commit `chore(widget-kit): Inter Black + Standard-Sounds für Alarm-Animationen`.

### Task 6: `alarm-anim.js` — Renderer-Gerüst + Level-Up (5 Stile + Gifter-Farbschema)

**Files:**
- Create: `packages/widget-kit/alarm-anim.js`
- Create: `packages/widget-kit/alarm-anim.test.ts`
- Create: `tools/alarm-vorschau.mjs` (rendert eine Animation Bild für Bild über headless Chrome wie `render.mjs` der Proben → MP4, für den Sichtvergleich)
- Referenz: `docs/superpowers/specs/2026-11-10-proben/levelup-v1-v3.html`, `levelup-v4-v5.html`

**Interfaces:**
- Produces:
  ```js
  /** Katalog: id → { label, fuer: Array<'teamherz'|'level_team'|'level_gifter'|'superfan'|'superfan_betritt'|'truhe'>, dauer: Sekunden, sound: 'botexe-….wav' } */
  export const ANIMATIONEN;           // ids: 'lvl-herzschlag','lvl-goldherz','lvl-neon','lvl-tiktok','lvl-tiktok-neon','superfan-premium','truhe-premium'
  /** daten: { name: string, bild?: string, alt?: number, neu?: number, coins?: number,
   *           art?: 'team'|'gifter', unterzeile?: string } */
  export function erzeugeRenderer(id, daten): { dauer: number, zeichne(ctx, t, w, h): void, destroy(): void };
  export function initiale(name): string;     // erstes sichtbares Zeichen, Emoji-sicher, Fallback '?'
  export function ladeSchrift(baseUrl): Promise<void>; // FontFace 'BxInter' aus inter-black.woff2, einmalig
  ```
- Zeichnet in eine Designfläche 1080×1920, skaliert mittig auf `w×h` (contain). Zufall nur über den Seed-PRNG der Proben (deterministisch). `bild` wird als `Image` (crossOrigin='anonymous' NICHT setzen — nur zeichnen, nie auslesen) geladen; bis/ohne Laden: Initiale.
- Gifter-Schema: Gold `#ffc93c`/Blau `#2fd8ff` statt Pink/Cyan, Unterzeile `GESCHENKE-STUFE ${alt} → ${neu}`, Plakette mit Stufenzahl statt Herz-Kachel. `alt` fehlt → `neu-1`.

- [ ] **Step 1: Failing tests** (node:test mit Fake-Canvas-Kontext, der alle Aufrufe schluckt und NaN-Argumente zählt): jede Level-Up-id rendert t ∈ {0, 1.9, 3, dauer} ohne Wurf und ohne NaN; `w=0,h=0` → `zeichne` tut nichts; `initiale('🖤Mary')` → `'🖤'`, `initiale('')` → `'?'`; `ANIMATIONEN['lvl-tiktok-neon'].dauer === 5.8`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Proben-Code in Renderer überführen (je Stil eine Funktion, gemeinsame Helfer einmal). Teure Glows einmalig in Offscreen-Canvas vorbacken (Spec „Leistung vs. Aussehen").
- [ ] **Step 4:** `node --check packages/widget-kit/alarm-anim.js`; Tests PASS.
- [ ] **Step 5:** `node tools/alarm-vorschau.mjs lvl-tiktok-neon` (und je Stil) → MP4 öffnen und neben `LevelUp_V5b_TikTok-Neon.mp4`/Probe legen: gleiche Abfolge, gleiche Optik. Abweichungen beheben.
- [ ] **Step 6:** Commit `feat(widget-kit): Live-Renderer Level-Up (5 Stile)`.

### Task 7: `alarm-anim.js` — Superfan-Premium + Schatztruhe-Premium

**Files:**
- Modify: `packages/widget-kit/alarm-anim.js`, `alarm-anim.test.ts`
- Referenz: `docs/superpowers/specs/2026-11-10-proben/superfan-truhe.html`

**Interfaces:**
- `superfan-premium`: `dauer 7.6`; `daten.unterzeile` Standard `'WILLKOMMEN IM SUPERFAN-CLUB'`, Varianten vom Alarm: `'SUPERFAN VERLÄNGERT'`, `'SUPERFAN IST DA'`; Kopfzeile „NEUER" nur bei Neu-Abo (`daten.neuAbo === true`).
- `vip-gold`: Superfan-Premium-Renderer im Gold-Schema (Gold/Bernstein statt Violett, Diamant golden-orange), Titel `'VIP IST DA'` statt NEUER/SUPERFAN, Unterzeile `GESCHENKE-STUFE ${neu}`; `dauer 7.6`; Sound `botexe-superfan.wav`.
- `ziel-erreicht`: TikTok-Neon-Renderer (Task 6) mit Titel `'ZIEL ERREICHT!'`, Pille `${fortschritt}/${ziel}` statt Stufenrolle, Unterzeile Geschenkname bzw. gekürzte Beschreibung (max. 28 Zeichen + „…"), Kachel am Profilbild = Häkchen; `dauer 5.8`; Sound `botexe-levelup-tiktok-neon.wav`.
- `truhe-premium`: `dauer 6.8`; Titel `'SCHATZTRUHE!'`, Zähler `daten.coins` (fehlt → Zähler ausblenden), Unterzeile Standard `'COINS ZUM SCHNAPPEN'`, bei Superfan-Truhe `'SUPERFAN-TRUHE'`.

- [ ] **Step 1:** Failing tests wie Task 6 für beide ids; `coins: undefined` wirft nicht.
- [ ] **Step 2–4:** FAIL → portieren → `node --check` + PASS.
- [ ] **Step 5:** Sichtvergleich gegen `Alert_Superfan_v2.mp4` / `Alert_Schatztruhe_v2.mp4` (Vorschau-MP4 aus Task 6-Werkzeug).
- [ ] **Step 6:** Commit `feat(widget-kit): Live-Renderer Superfan + Schatztruhe`.

### Task 8: Ereignis-Alarm (Modus im Herz-Alarm)

**Files:**
- Create: `packages/widget-kit/ereignis-alarm.js`
- Modify: `packages/widget-kit/herz-alarm.js` (Konstruktor: `props.modus === 'ereignisse'` → `return new EreignisAlarm(root, props, ctx)`-Delegation über Feld `this.impl`, alle Methoden reichen weiter; sonst unverändert)
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (Herz-Alarm-Eintrag Z. ~303: `modus` vorne; alte Felder `showIf: p => (p.modus ?? 'klassisch') === 'klassisch'`; neue Felder `showIf` auf Modus ereignisse)
- Modify: `packages/widget-kit/herz-alarm.test.ts`; Create `packages/widget-kit/ereignis-alarm.test.ts`

**Interfaces:**
- Consumes: `ANIMATIONEN`, `erzeugeRenderer`, `ladeSchrift` (Task 6/7); bestehende `MOTIVE`, `baueUrl`, `baueUserText`, `trifftAusloeser` aus `herz-alarm.js`.
- Produces (reine, exportierte Helfer):
  ```js
  /** Ordnet ein Ereignis einer Alarm-Art zu (oder null). cfg = normalisierte Props. */
  export function alarmArt(event, cfg): 'teamherz'|'level_team'|'level_gifter'|'superfan'|'superfan_betritt'|'truhe'|'vip'|'ziel'|null;
  export class Warteschlange { constructor(max = 10); rein(eintrag): boolean /* false = übergelaufen */; raus(); get laenge(); leeren(); }
  ```
  `alarmArt`: teamherz = `trifftAusloeser(e,'teamherz',cfg.minLevel)` aber OHNE `type:'sub'` (sub = Superfan-Abo); level_team/gifter = `type:'level_up'` + art + `neu ≥ cfg.minLevelUp`; superfan = `type:'superfan'` mit `superfanArt` abo_neu (oder abo_verlaengert, wenn `cfg.superfanVerlaengert`) ODER `type:'sub'` (Status 0, bzw. 1 bei Verlängerung); superfan_betritt = `superfanArt:'betritt'`; truhe = `type:'envelope'`. vip = `type:'vip_betritt'` mit `vip.stufe ≥ cfg.minVip` (Standard 20); ziel = `type:'live_ziel'` mit `ziel.erreicht`, einmal je `ziel.id` (Merker wie Truhen-Dedup). Nur Arten in `cfg.ereignisse`. Truhen-Dedup über `envelope.envelopeId` (sonst Name+Coins 30 s).
- Neue Props (Standardwerte in `widget-types.ts`): `modus:'klassisch'`, `ereignisse:['teamherz','level_team','superfan','truhe','ziel']` (vip, superfan_betritt, level_gifter standardmäßig aus), `anim_vip:'vip-gold'`, `anim_ziel:'ziel-erreicht'`, `minVip:20`, `anim_teamherz:'motiv'` (= bisherige Motiv-Logik), `anim_level_team:'lvl-tiktok-neon'`, `anim_level_gifter:'lvl-tiktok-neon'`, `anim_superfan:'superfan-premium'`, `anim_superfan_betritt:'superfan-premium'`, `anim_truhe:'truhe-premium'`, je Art `media_<art>:''` (Feldtyp `media`, sichtbar bei `anim_<art>==='eigen'`), `sound_<art>:'standard'|'custom'|'off'` + `soundId_<art>`, `minLevelUp:0`, `superfanVerlaengert:true`, `qualitaet:'voll'|'leicht'`. Select-Optionen je Art: passende `ANIMATIONEN`-ids + Herz-Motive (`motiv:<id>`) + `'eigen'`.
- Abspielen: Canvas-Renderer per rAF (Rumpf in try/catch; im Fehler Sperre lösen, Eintrag verwerfen, `this.ctx` Meldung), WebM-Motive über das vorhandene `<video>`, eigene Datei `/media/<id>` als `<video>` bzw. `<img>` (GIF, Dauer 6 s) mit HTML-Namensleiste. Sound `standard` → `ctx.playSound(ANIMATIONEN[id].sound)`; Motive mit `standard` = Original-Ton im Video.
- Vorschau: reihum Demo der gewählten Arten mit Demo-Daten (`'Mia'`, Stufe 12, 500 Coins), stumm, Schleife.

- [ ] **Step 1: Failing tests:**
  - Wächter: `new HerzAlarm(root, {motiv:'royal', event:'teamherz'}, ctx)` delegiert NICHT (kein `impl`), Verhalten wie bisheriger Test; `{modus:'klassisch'}` ebenso.
  - `alarmArt({type:'level_up', levelUp:{art:'team',neu:5}}, cfg mit minLevelUp 6)` → `null`; mit 5 → `'level_team'`.
  - `alarmArt({type:'sub', …}, cfg)` → `'superfan'`; `{type:'superfan', superfanArt:'betritt'}` ohne `superfan_betritt` in `ereignisse` → `null`.
  - `alarmArt({type:'envelope', envelope:{envelopeId:'7'}})` zweimal → zweites Mal `null` (Dedup über Instanz-Merker — Helfer bekommt Merker als Parameter).
  - `Warteschlange(10)`: 11. `rein` → `false`.
  - `sticky`-Ereignis → nichts eingereiht.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** `node --check` beide Dateien; Tests PASS; `npm test` 0 (inkl. `widget-props-parity.test.ts`).
- [ ] **Step 5:** In der App (oder headless) Herz-Alarm auf „Ereignisse" stellen, Test-Ereignisse `level_up`, `sub`, `envelope` schicken → Video/Screenshot ansehen: Reihenfolge nacheinander, Name/Bild/Level stimmen.
- [ ] **Step 6:** Commit `feat(herz-alarm): Modus Ereignisse mit Warteschlange und Premium-Animationen`.

### Task 9: Einblender-Widget + Like-Flaute

**Files:**
- Create: `packages/widget-kit/einblender.js`, `packages/widget-kit/einblender.test.ts`
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (neuer Eintrag), `palette-gruppen.ts` (`CATEGORY_OF`, ggf. `RELATED_OF`), dann `npm run galerie` (aktualisiert `docs/widgets.md`)
- Referenz: `docs/superpowers/specs/2026-11-10-proben/einblender-spot.html`

**Interfaces:**
- Registrierung: `type:'einblender'`, `label:'Einblender'`, `desc:'Ein kurzer Werbe-Spot, der reinwischt und wieder verschwindet: „Ihr wollt supporten?" → Tippen, Teilen, Folgen. Läuft nach Zeitplan, per Regel oder von allein, wenn kaum jemand liked.'`, `w:1080, h:560`, Props `{ look:'neon', szenen:['tippen','teilen','folgen'], intro:'IHR WOLLT SUPPORTEN?', abschluss:'DANKE', handle:'', intervallMin:0, auto:false, autoMinZuschauer:5, autoMinuten:3, autoLikesUnter:50, autoPauseMin:10, sound:'standard', soundId:'' }`.
- Produces:
  ```js
  /** Reine Rechnung. likes: Array<{ts, anzahl}> der letzten Zeit; jetzt: ms. */
  export function likeFlaute({ likes, zuschauer, jetzt, letzterSpot, cfg }): boolean;
  export default class Einblender { onEvent(e); onAction(action); destroy(); }
  ```
  `likeFlaute` = `zuschauer >= cfg.autoMinZuschauer` UND Summe `anzahl` mit `ts ≥ jetzt − autoMinuten·60000` `< autoLikesUnter` UND `jetzt − letzterSpot ≥ autoPauseMin·60000` UND seit Verbindungsbeginn mindestens `autoMinuten` vergangen (sonst feuert es direkt beim Start). Quelle: `like`-Ereignisse `likeCount`, `viewer_count`-Ereignisse `viewerCount`. Prüfung alle 15 s per Timer.
- Abspielen: Design 1080×560 in Box skalieren (contain); Szenen nur die gewählten (Nummern „01 / 0N" passen sich an); `onAction` mit `action.type==='fire_alert'` spielt sofort (läuft schon einer → ignorieren); Intervall >0 → alle N Minuten; Ton `standard` → `botexe-einblender.wav`.

- [ ] **Step 1: Failing tests:** `likeFlaute` mit 6 Zuschauern, 20 Likes in 3 min, letzter Spot vor 11 min → `true`; 4 Zuschauer → `false`; 60 Likes → `false`; letzter Spot vor 5 min → `false`; Likes älter als 3 min zählen nicht; Verbindung erst 1 min alt → `false`. Rendern: jede Szenen-Kombination (`['teilen']`, alle drei) t∈{0, 3, dauer} ohne Wurf/NaN.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren (Renderer aus der Probe, Helfer aus `alarm-anim.js` wiederverwenden). **Step 4:** `node --check`; Tests PASS; `npm test` 0; `npm run widget-check` 0.
- [ ] **Step 5:** Vorschau-MP4 neben `Einblender_V2_neon/gold.mp4` legen → gleiche Optik.
- [ ] **Step 6:** Commit `feat: Widget Einblender mit Auto-Modus Like-Flaute`.

### Task 9b: Ziel-Leiste folgt dem TikTok-LIVE-Ziel

**Files:**
- Modify: `packages/widget-kit/goal-bar.js` (neue Metrik `'tiktok-ziel'`: Wert/Ziel aus dem letzten `live_ziel`-Ereignis, Beschriftung = `props.label` oder Geschenkname bzw. „LIVE-Ziel"; bis zum ersten Ereignis „Warte auf TikTok-Ziel…" bzw. in der Vorschau Demo 35/50 „Heart Me")
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (Metrik-Option `{ value:'tiktok-ziel', label:'🎯 TikTok-LIVE-Ziel (automatisch)' }`; `target`-Feld bei dieser Metrik ausblenden)
- Test: `packages/widget-kit/goal-bar.test.ts` (anlegen, falls nicht vorhanden)

- [ ] **Step 1: Failing test:** Instanz mit `metric:'tiktok-ziel'`, `onEvent({type:'live_ziel', ziel:{id:'g', fortschritt:35, ziel:50, erreicht:false, geschenk:{name:'Heart Me'}}})` → angezeigte Zahlen `35` und `50`, Beschriftung `Heart Me`; andere Metriken ignorieren `live_ziel` (Wächter: bestehendes Verhalten unverändert).
- [ ] **Step 2–4:** FAIL → implementieren → `node --check` + PASS + widget-check 0.
- [ ] **Step 5:** Commit `feat(goal-bar): Metrik TikTok-LIVE-Ziel`.

### Task 10: Gesamtprüfung, Leistung, Doku (kein Release)

**Files:**
- Modify: `CHANGELOG.md` (neuer Abschnitt „Unveröffentlicht" in Nutzersprache: was Alex merkt + Ursache des fehlenden Superfan-Alarms)
- Modify: `docs/tiktok-datenquellen.md` (`npm run inventar`) falls betroffen; `AGENTS.md` Abschnitt „Was TikTok liefert": Satz zu Banner-Belegen + Superfan-Bedeutung
- Wissensbasis: `/home/dotexe/Dokumente/KI Home Wissen/` `CURRENT-STATE.md`, `TASKBOARD.md` (T266), `ki-gedaechtnis/botexe-studio-offene-punkte.md`

- [ ] **Step 1:** `npm run lint; npm run typecheck; npm test; npm run widget-check` → je `0`; `npm run widget-belastung` → `0`.
- [ ] **Step 2:** `npm --prefix apps/desktop run package` → 0; `SKIP_BUILD=1 bash apps/desktop/scripts/run-smoke.sh` → 0.
- [ ] **Step 3:** Leistung: Overlay-URL auf dem Stream-PC (SSH, `runbooks/access.md`) im Browser öffnen, Test-Ereignisse level_up/superfan/envelope + Einblender auslösen, Bildrate messen (`performance.now()`-Zähler im Renderer, Log über `/log` o. Ä. nur temporär) → ≥ 30 fps; sonst Qualität „leicht" nachschärfen.
- [ ] **Step 4:** Doku aktualisieren; Commit `docs: Ereignis-Alarm + Einblender`.
- [ ] **Step 5:** Alex Ergebnis zeigen (Videos aus der echten App) und **auf Release-Freigabe warten**.
