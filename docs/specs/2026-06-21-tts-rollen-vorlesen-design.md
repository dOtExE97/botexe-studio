# TTS: Rollen-Erkennung + einstellbares Vorlesen

Datum: 2026-06-21 · Status: in Umsetzung

## Problem
Der TTS-Filter liest „nur Mods/Follower" nicht zuverlässig vor (z.B. Mod „itz felix"
wird übersprungen), weil die Rollen-Flags (`isMod`/`isFollower`/`isSub`) im Event
oft nicht gesetzt sind. Außerdem ist der Filter eine einzelne Stufe (kein
Mehrfach-Ankreuzen), und es gibt keine dedizierten Event-Ansagen.

## Befund (nach Mehr-Agenten-Check)
- `userIdentity.isXOfAnchor` (camelCase) existiert in der Lib im **Direkt-Modus** und
  ist die beste Mod/Sub-Quelle. Im **Cloud-Modus** (Euler) ist unklar, ob die Felder
  ankommen — dort ist das Follow-Gedächtnis die verlässliche Follower-Quelle; Mod/Sub
  bleiben im Cloud-Modus evtl. nur erkennbar, wenn die Person chattet (Flag am Chat).
- **Kein eigenes Sub-Event** wird erzeugt → ein „Teamherz ansagen"-Ereignisblock
  würde nie auslösen. Teamherz nur im Chat-Filter abbilden.
- „Top-Gifter" hat keine Datenbasis am User → vorerst weglassen (YAGNI).
- IPC-`SETTINGS_UPDATE` hat eine Feld-Allowlist für `tts` → neue Felder dort freischalten,
  sonst speichert die UI still nicht.
- TTS-UI liegt in `TtsPage.tsx` (nicht SettingsPage).
- Doppel-Vorlesen-Risiko: bestehende `speak`-Trigger auf follow/gift + neue Ansagen →
  UI-Hinweis.

## Umfang
### 1. Rollen-Erkennung (Bug-Fix)
- Pure `detectRoles(data)` (neben `tiktok-normalize`): Mod/Sub/Follower mehrgleisig per OR
  (userIdentity-Flags + `followInfo.followStatus>=1` + direktes `isFollower`).
- Follow-Gedächtnis (stateful in `studio.ts`): live-Follow-Event → Set von Follower-IDs
  (userId **und** uniqueId cachen, gegen ID-Divergenz), geleert in `resetSession()`.
  Chat-Events von gemerkten Followern werden als `isFollower` angereichert.

### 2. Chat-Vorlesen: Multi-Select
- `TTSSettings.readWho` → `readGroups: ReadGroup[]` (`all`/`mods`/`subs`/`followers`/`vips`).
- Migration in `settings-store.load()`: legacy `readWho` → Gruppen-Array (hierarchisch
  aufgelöst: `followers` → [followers,subs,mods], etc.).
- `shouldReadChat`: liest, wenn der User in **mind. einer** Gruppe ist (OR) oder App-VIP.

### 3. Event-Ansagen (2 Blöcke, je enabled/template/voice)
- `announceFollow {enabled, template, voice}` → bei follow-Event.
- `announceGift {enabled, minCoins, template, voice}` → bei gift-Event mit `totalCoins>=minCoins`.
- Wiederverwendung von `speakForEvent(template, event, voiceOverride)`.
- (Teamherz-Ansage bewusst NICHT — kein Sub-Event.)

### 4. IPC + UI
- `main.ts` SETTINGS_UPDATE-Allowlist um `readGroups`, `announceFollow`, `announceGift` erweitern.
- `TtsPage.tsx`: Checkbox-Gruppe (Wer) + 2 Ansage-Blöcke (Schalter + Text + Stimme-Dropdown,
  Muster wiederverwenden). Kurzer Hinweis zu Doppel-Vorlesen mit eigenen Triggern.

## Platzhalter
`{user}` (alle), `{gift}`/`{count}`/`{coins}` (gift), `{text}` (chat).

## Tests (TDD)
- `detectRoles`: jede Quelle einzeln + Kombinationen + leere Daten.
- Follow-Gedächtnis: Anreicherung + Reset + ID-Divergenz.
- `shouldReadChat` Multi-Select: OR-Logik, VIP-Always, Prefix.
- Migration legacy `readWho` → `readGroups`.
- Ansage-Auslöser: Coins-Schwelle, follow-Template.
