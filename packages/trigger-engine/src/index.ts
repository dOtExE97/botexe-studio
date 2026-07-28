// @botexe/trigger-engine — deterministische Regel-Logik, keine Electron-/IO-Abhängigkeiten.
// Cooldowns rechnen mit event.ts (nicht Wanduhr) → Replay-Tests sind exakt reproduzierbar.

export { giftRuleId, findGiftRule, upsertGiftRule, otherGiftRules, orderedGiftKeys, type GiftKey } from './gift-mapping';
// giftKey nach außen: JEDER Vergleich „ist das dieses Geschenk?" muss ihn
// benutzen. Die Widget-Bindungen (Rad/Automat/Lucky-Card) verglichen die
// Namen vorher buchstabengenau und verfehlten dadurch dasselbe Geschenk in
// anderer Schreibweise — obwohl die Trigger-Engine daneben korrekt matchte.
export { giftKey } from '../../widget-kit/gift-rules.js';
// giftKey ist EINZIGE Quelle in packages/widget-kit/gift-rules.js (DOM-freies
// reines JS, allowJs übernimmt es unverändert — s. tsconfig.json und der
// bestehende itemsFromRules-Import in gift-mapping.ts). Vorher hatte diese
// Datei eine eigene, textidentische Kopie von giftKey — 4. unabhängige Kopie
// im Repo (neben gift-rules.js selbst, gift-counter.js und dem impliziten
// Vertrag über orderedGiftKeys). Ändert sich die Normalisierungsregel künftig
// (z.B. Unicode-Normalisierung für Emoji-Gift-Namen) nur an EINER Stelle,
// drifteten Trigger-Matching (hier) und Rad/Slot/Tafel (gift-rules.js)
// lautlos auseinander.
import { giftKey } from '../../widget-kit/gift-rules.js';

export type StudioEventType =
  | 'chat'
  | 'gift'
  | 'follow'
  | 'sub'
  | 'like'
  | 'share'
  /** Zuschauer betritt den Stream (TikTok „member"/join). */
  | 'join'
  | 'viewer_count'
  /** Periodischer Tick — Timer-Regeln (z.B. alle 10 Min. Socials einblenden). */
  | 'timer';

export interface StudioUser {
  id: string;
  /** Rohe numerische TikTok-userId (falls abweichend von id) — als zweiter,
   *  stabiler Schlüssel fürs Rollen-Gedächtnis, da TikTok mal uniqueId, mal nur
   *  userId liefert. */
  userId?: string;
  nickname: string;
  profilePic?: string;
  /** TikTok-Rollen (bei Chat-Events mitgeliefert): Teamherz-Mitglied. */
  isSub?: boolean;
  /** Moderator dieses Streams. */
  isMod?: boolean;
  /** Folgt dem Streamer. */
  isFollower?: boolean;
}

export interface StudioGift {
  slug: string;
  giftId?: number;
  count: number;
  coinsPerUnit: number;
  totalCoins: number;
  /** Offizielles TikTok-Gift-Bild (aus giftDetails), für Alerts/Feeds. */
  icon?: string;
}

/** Normalisiertes Live-Event — vom TikTok-Adapter erzeugt, von Engine/Overlays konsumiert. */
export interface StudioEvent {
  type: StudioEventType;
  ts: number;
  user?: StudioUser;
  text?: string;
  gift?: StudioGift;
  likeCount?: number;
  totalLikes?: number;
  viewerCount?: number;
  /** true = dieser Zuschauer ist zum allerersten Mal aktiv (Studio reichert an). */
  firstOfUser?: boolean;
  /** true = dieser Zuschauer folgt zum ersten Mal (seit die App ihn kennt) —
   *  kein Re-Follow. Studio reichert an; nur bei type === 'follow' relevant. */
  firstFollow?: boolean;
  /** true = Test-/Replay-Event (Vorschau) — löst Overlay/TTS aus, wird aber NICHT
   *  persistent verbucht (keine echten Punkte/Coins/Likes, kein Gift-Katalog). */
  synthetic?: boolean;
  /** true = Sticky-Replay beim (Re-)Connect einer Overlay-Quelle: das letzte
   *  Event pro Typ wird zum Rehydrieren erneut gesendet. Effekt-/Zähler-Widgets
   *  MÜSSEN das überspringen (sonst Geister-Alerts + Doppelzählung); nur
   *  idempotente Anzeigen (Top-Gift/Top-Streak) dürfen es verarbeiten. */
  sticky?: boolean;
}

export type TriggerCondition =
  | { kind: 'gift_coins_gte'; value: number }
  | { kind: 'gift_count_gte'; value: number }
  | { kind: 'gift_slug_is'; value: string }
  /** Bestimmtes Gift über die STABILE TikTok-Gift-ID (sprachunabhängig — anders
   *  als der lokalisierte Anzeigename). Fürs TikFinity-Import robust. */
  | { kind: 'gift_id_is'; value: number }
  | { kind: 'chat_keyword'; value: string }
  /** Nachricht beginnt mit dem Befehl (z.B. '!hype'), optional mit Argumenten. */
  | { kind: 'chat_command'; value: string }
  /** Allererste Nachricht dieses Zuschauers (über alle Streams) — Begrüßung. */
  | { kind: 'chat_first_time' }
  /** Erst-Follow (kein Re-Follow) — z.B. Jumpscare nur beim ersten Mal. */
  | { kind: 'follow_first_time' }
  /** Raumweite Like-Meilensteine: feuert, wenn totalLikes die Schwelle KREUZT
   *  (nicht bei jedem Batch darüber) — für „bei 1000 Likes Feuerwerk". */
  | { kind: 'like_count_gte'; value: number }
  | { kind: 'viewer_count_gte'; value: number };

export type TriggerActionKind =
  | { kind: 'play_sound'; soundId: string; volume?: number }
  | { kind: 'fire_alert'; targetId: string; params?: Record<string, unknown> }
  | { kind: 'show_layer'; targetId: string; durationMs?: number }
  | { kind: 'hide_layer'; targetId: string }
  /** TTS-Ansage; template mit {user} {text} {gift} {count} {coins} platzhaltern. */
  | { kind: 'speak'; template: string; voice?: string }
  /** roll (0..1) würfelt der SERVER beim Broadcast — alle Overlay-Quellen
   *  (OBS + TTLS) zeigen so denselben Gewinner. segmentIndex = fester Zielwert. */
  | { kind: 'spin_wheel'; targetId: string; cost?: number; segmentIndex?: number; roll?: number }
  /** Gambling-Automat: win/winnerIndex/roll würfelt der SERVER zentral beim
   *  Geschenk-Empfang (planSlotOutcome in slot-gift.ts) — alle Overlay-
   *  Quellen zeigen so dasselbe Ergebnis. */
  | { kind: 'spin_slot'; targetId: string; win?: boolean; winnerIndex?: number; roll?: number }
  /** Media-Widget abspielen (Bild einblenden / Video starten) — z.B. Begrüßungsclip. */
  | { kind: 'play_media'; targetId: string }
  /** Counter-Widget verändern (delta ±N, z.B. „Tode +1" per Hotkey/Befehl). */
  | { kind: 'counter_add'; targetId: string; delta: number }
  /** OBS-Szene wechseln (braucht OBS-WebSocket-Verbindung). */
  | { kind: 'obs_scene'; scene: string }
  /** OBS-Quelle in einer Szene ein-/ausblenden. */
  | { kind: 'obs_visibility'; scene: string; source: string; visible: boolean }
  /** Nachricht in den TikTok-Live-Chat senden (braucht Login; rate-limited). */
  | { kind: 'send_chat'; template: string }
  /** Streamer.bot-Aktion auslösen (per Name oder ID). */
  | { kind: 'streamerbot_action'; action: string }
  /** Giveaway: Gewinner aus den !join-Teilnehmern ziehen (App wählt, Widget
   *  animiert). params werden von der App gesetzt (winner + names). */
  | { kind: 'giveaway_draw'; params?: { winner?: { nickname: string; avatar?: string }; names?: string[] } }
  /** Giveaway zurücksetzen (Teilnehmerliste leeren, Widget auf Idle). */
  | { kind: 'giveaway_reset' }
  /** Spotify steuern (braucht verbundenes Spotify Premium + aktives Gerät). */
  | { kind: 'spotify_control'; control: 'play' | 'pause' | 'next' | 'previous' }
  /** Song-Request: query (Template, z.B. {args} = Chat-Text nach dem Befehl) →
   *  Spotify-Suche → erster Treffer in die Wiedergabe-Queue. */
  | { kind: 'spotify_request'; query: string }
  /** Reine Anzeige-Aktion (kein Gift-Event, keine Coin-/Zähler-Nebenwirkung):
   *  startet auf dem Geschenke-Slider (gift-menu) die Challenge des per slug
   *  benannten Geschenks — z.B. wenn der Gambling-Automat dieses Geschenk als
   *  Gewinner auslost (siehe slot-gift.ts planSlotSpins). Kann auf dem
   *  gift-menu-Widget nie erneut den Automaten auslösen. */
  | { kind: 'start_gift_challenge'; targetId: string; slug: string; who?: string }
  /** Lucky-Card: der Geschenke-Slider (gift-menu) shuffelt die Karten durch
   *  und landet auf winnerIndex — win/winnerIndex/roll würfelt der SERVER
   *  (Task 2, noch offen); das Widget entscheidet NIE selbst über
   *  Gewinn/Niete, es spielt nur die Animation und löst bei Gewinn die
   *  Challenge der gezogenen Karte aus (celebrate). */
  | { kind: 'lucky_draw'; targetId: string; win?: boolean; winnerIndex?: number; roll?: number; who?: string };

/** Eine Aktion mit optionaler Verzögerung (Combo-Sequenz: Alert jetzt,
 *  Sound +0,5s, Ansage +2s …). delayMs = Versatz ab Auslösung der Regel. */
export type TriggerAction = TriggerActionKind & { delayMs?: number };

/** Punkte-Einlösung: Zuschauer gibt per Chat-Befehl Punkte aus → Aktion(en). */
export interface Redemption {
  id: string;
  name: string;
  /** Chat-Befehl, z.B. '!airhorn' (mit oder ohne führendes !). */
  command: string;
  /** Punkte-Kosten pro Einlösung. */
  cost: number;
  actions: TriggerAction[];
  enabled: boolean;
  /** Globaler Mindestabstand zwischen zwei Einlösungen (ms). */
  cooldownMs?: number;
}

/** Manuell auslösbarer Knopf (Soundboard/Schnell-Aktion) mit optionalem Hotkey. */
export interface PanelButton {
  id: string;
  label: string;
  action: TriggerAction;
  /** Electron-Accelerator, z.B. 'CommandOrControl+Shift+1' (leer = kein Hotkey). */
  accelerator?: string;
}

export interface TriggerRule {
  id: string;
  name: string;
  event: StudioEventType;
  /** UND-verknüpft; keine/leere Liste = matcht jedes Event des Typs. */
  conditions?: TriggerCondition[];
  actions: TriggerAction[];
  /** Mindestabstand zwischen zwei Auslösungen dieser Regel (über event.ts gemessen). */
  cooldownMs?: number;
  /** Mindestabstand PRO ZUSCHAUER (event.user.id) — begrenzt Spam durch einzelne
   *  Nutzer, ohne die Regel global zu drosseln. Aus TikFinitys userCooldown. */
  userCooldownMs?: number;
  enabled: boolean;
}

export interface TriggerMatch {
  ruleId: string;
  action: TriggerAction;
}

export class TriggerEngine {
  private rules: TriggerRule[] = [];
  /** ruleId → event.ts der letzten Auslösung. Überlebt setRules() bewusst. */
  private lastFired = new Map<string, number>();
  /** ruleId → (userId → event.ts) für den Cooldown pro Zuschauer. */
  private lastFiredPerUser = new Map<string, Map<string, number>>();

  setRules(rules: TriggerRule[]): void {
    this.rules = rules;
  }

  /** Gibt es mind. eine aktive Timer-Regel? — damit der 1s-Ticker nur läuft,
   *  wenn er auch etwas auswerten kann (sonst reine Leerlauf-Last). */
  hasTimerRules(): boolean {
    return this.rules.some((r) => r.enabled && r.event === 'timer');
  }

  resetCooldowns(): void {
    this.lastFired.clear();
    this.lastFiredPerUser.clear();
  }

  evaluate(event: StudioEvent): TriggerMatch[] {
    const matches: TriggerMatch[] = [];
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.event !== event.type) continue;
      if (rule.event === 'timer') continue; // Timer laufen über evaluateTimer
      if (!(rule.conditions ?? []).every((c) => conditionHolds(c, event))) continue;
      // Cooldown pro Zuschauer VOR dem globalen prüfen (sonst würde ein
      // gedrosselter Nutzer den globalen Timer trotzdem zurücksetzen).
      const userId = event.user?.id;
      if (rule.userCooldownMs !== undefined && userId) {
        let perUser = this.lastFiredPerUser.get(rule.id);
        const lastU = perUser?.get(userId);
        if (lastU !== undefined && event.ts - lastU < rule.userCooldownMs) continue;
        if (!perUser) { perUser = new Map(); this.lastFiredPerUser.set(rule.id, perUser); }
        perUser.set(userId, event.ts);
      }
      if (rule.cooldownMs !== undefined) {
        const last = this.lastFired.get(rule.id);
        if (last !== undefined && event.ts - last < rule.cooldownMs) continue;
        this.lastFired.set(rule.id, event.ts);
      }
      for (const action of rule.actions) {
        matches.push({ ruleId: rule.id, action });
      }
    }
    return matches;
  }

  /**
   * Timer-Regeln auswerten — pro Tick aufgerufen (z.B. jede Sekunde).
   * cooldownMs ist das Intervall; ohne cooldownMs feuert die Regel jeden Tick.
   */
  evaluateTimer(ts: number): TriggerMatch[] {
    const matches: TriggerMatch[] = [];
    for (const rule of this.rules) {
      if (!rule.enabled || rule.event !== 'timer') continue;
      if (rule.cooldownMs !== undefined) {
        const last = this.lastFired.get(rule.id);
        if (last !== undefined && ts - last < rule.cooldownMs) continue;
        this.lastFired.set(rule.id, ts);
      }
      for (const action of rule.actions) {
        matches.push({ ruleId: rule.id, action });
      }
    }
    return matches;
  }
}

/** Prüft, ob eine Nachricht mit dem Befehl beginnt (am Anfang, dann Ende oder
 *  Leerzeichen) — case-insensitive, führende ! egal. */
export function commandMatches(message: string, command: string): boolean {
  const cmd = command.trim().toLowerCase().replace(/^!*/, '');
  if (!cmd) return false;
  const msg = (message ?? '').trim().toLowerCase();
  return msg === `!${cmd}` || msg.startsWith(`!${cmd} `);
}

/** Erste aktivierte Einlösung, deren Befehl auf die Nachricht passt. */
export function matchRedemption(redemptions: Redemption[], message: string): Redemption | null {
  for (const r of redemptions) {
    if (r.enabled && commandMatches(message, r.command)) return r;
  }
  return null;
}

/** Chat-Befehl („Bot"): !befehl → Antwort (Overlay/TTS/Chat). */
export interface ChatCommand {
  id: string;
  /** Auslöse-Befehl, z.B. '!discord' (führende ! egal). */
  command: string;
  /** Antworttext mit Platzhaltern ({user} {text} …). */
  response: string;
  /** Antwort per TTS vorlesen. */
  speak: boolean;
  /** Antwort in den TikTok-Chat schreiben (braucht Login). */
  sendToChat: boolean;
  /** Mindest-Gruppe (Standard 'all'). */
  who?: 'all' | 'followers' | 'subs' | 'mods';
  /** Globaler Mindestabstand zwischen zwei Auslösungen (ms). */
  cooldownMs?: number;
  enabled: boolean;
}

/** Erster aktivierter Befehl, der auf die Nachricht passt. */
export function matchChatCommand(commands: ChatCommand[], message: string): ChatCommand | null {
  for (const c of commands) {
    if (c.enabled && commandMatches(message, c.command)) return c;
  }
  return null;
}

/** Füllt ein speak-Template mit Werten aus dem Event ({user} → Nickname usw.). */
export function renderSpeakTemplate(template: string, event: StudioEvent): string {
  return template
    .replace(/\{user\}/g, event.user?.nickname ?? 'Jemand')
    .replace(/\{text\}/g, event.text ?? '')
    // {args} = Chat-Text NACH dem ersten Wort (dem Befehl) — z.B. "!sr Song" → "Song".
    .replace(/\{args\}/g, (event.text ?? '').replace(/^\s*\S+\s*/, ''))
    .replace(/\{gift\}/g, event.gift?.slug ?? '')
    .replace(/\{count\}/g, String(event.gift?.count ?? ''))
    .replace(/\{coins\}/g, String(event.gift?.totalCoins ?? ''));
}

function conditionHolds(condition: TriggerCondition, event: StudioEvent): boolean {
  switch (condition.kind) {
    case 'gift_coins_gte':
      return event.gift !== undefined && event.gift.totalCoins >= condition.value;
    case 'gift_count_gte':
      return event.gift !== undefined && event.gift.count >= condition.value;
    case 'gift_slug_is':
      // Normalisiert (nur Buchstaben/Ziffern) — tolerant gegen Apostroph/Leer-
      // zeichen/Schreibweise, damit ein vorab gewähltes Gift sicher matcht.
      return event.gift !== undefined && giftKey(event.gift.slug) === giftKey(condition.value);
    case 'gift_id_is':
      return event.gift?.giftId === condition.value;
    case 'chat_keyword':
      return (event.text ?? '').toLowerCase().includes(condition.value.toLowerCase()) && condition.value !== '';
    case 'chat_command':
      return commandMatches(event.text ?? '', condition.value);
    case 'chat_first_time':
      return event.firstOfUser === true;
    case 'follow_first_time':
      return event.firstFollow === true;
    case 'like_count_gte': {
      // Feuert genau beim KREUZEN der Schwelle (vorher darunter, jetzt darüber) —
      // nicht bei jedem weiteren Like-Batch oberhalb (sonst Alert-Spam).
      if (event.totalLikes === undefined) return false;
      const before = event.totalLikes - (event.likeCount ?? 0);
      return event.totalLikes >= condition.value && before < condition.value;
    }
    case 'viewer_count_gte':
      return event.viewerCount !== undefined && event.viewerCount >= condition.value;
  }
}
