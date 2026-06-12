// @botexe/trigger-engine — deterministische Regel-Logik, keine Electron-/IO-Abhängigkeiten.
// Cooldowns rechnen mit event.ts (nicht Wanduhr) → Replay-Tests sind exakt reproduzierbar.

export type StudioEventType =
  | 'chat'
  | 'gift'
  | 'follow'
  | 'sub'
  | 'like'
  | 'share'
  | 'viewer_count'
  /** Periodischer Tick — Timer-Regeln (z.B. alle 10 Min. Socials einblenden). */
  | 'timer';

export interface StudioUser {
  id: string;
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
}

export type TriggerCondition =
  | { kind: 'gift_coins_gte'; value: number }
  | { kind: 'gift_count_gte'; value: number }
  | { kind: 'gift_slug_is'; value: string }
  | { kind: 'chat_keyword'; value: string }
  /** Nachricht beginnt mit dem Befehl (z.B. '!hype'), optional mit Argumenten. */
  | { kind: 'chat_command'; value: string }
  /** Allererste Nachricht dieses Zuschauers (über alle Streams) — Begrüßung. */
  | { kind: 'chat_first_time' }
  | { kind: 'viewer_count_gte'; value: number };

export type TriggerActionKind =
  | { kind: 'play_sound'; soundId: string; volume?: number }
  | { kind: 'fire_alert'; targetId: string; params?: Record<string, unknown> }
  | { kind: 'show_layer'; targetId: string; durationMs?: number }
  | { kind: 'hide_layer'; targetId: string }
  /** TTS-Ansage; template mit {user} {text} {gift} {count} {coins} platzhaltern. */
  | { kind: 'speak'; template: string; voice?: string }
  | { kind: 'spin_wheel'; targetId: string; cost?: number }
  /** Media-Widget abspielen (Bild einblenden / Video starten) — z.B. Begrüßungsclip. */
  | { kind: 'play_media'; targetId: string }
  /** Counter-Widget verändern (delta ±N, z.B. „Tode +1" per Hotkey/Befehl). */
  | { kind: 'counter_add'; targetId: string; delta: number };

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

  setRules(rules: TriggerRule[]): void {
    this.rules = rules;
  }

  resetCooldowns(): void {
    this.lastFired.clear();
  }

  evaluate(event: StudioEvent): TriggerMatch[] {
    const matches: TriggerMatch[] = [];
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.event !== event.type) continue;
      if (rule.event === 'timer') continue; // Timer laufen über evaluateTimer
      if (!(rule.conditions ?? []).every((c) => conditionHolds(c, event))) continue;
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

/** Füllt ein speak-Template mit Werten aus dem Event ({user} → Nickname usw.). */
export function renderSpeakTemplate(template: string, event: StudioEvent): string {
  return template
    .replace(/\{user\}/g, event.user?.nickname ?? 'Jemand')
    .replace(/\{text\}/g, event.text ?? '')
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
      return event.gift !== undefined && event.gift.slug.toLowerCase() === condition.value.toLowerCase();
    case 'chat_keyword':
      return (event.text ?? '').toLowerCase().includes(condition.value.toLowerCase()) && condition.value !== '';
    case 'chat_command':
      return commandMatches(event.text ?? '', condition.value);
    case 'chat_first_time':
      return event.firstOfUser === true;
    case 'viewer_count_gte':
      return event.viewerCount !== undefined && event.viewerCount >= condition.value;
  }
}
