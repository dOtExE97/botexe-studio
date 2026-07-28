// tts-filter.ts — wer wird beim Chat-Vorlesen berücksichtigt?
// Pure Logik (testbar): Gruppen-Filter (Teamherz/Mod/Follower/VIP) +
// optionaler Prefix-Modus („nur Nachrichten, die mit . beginnen").
import type { StudioEvent } from '@botexe/trigger-engine';

/** Ankreuzbare Gruppen fürs Vorlesen (Multi-Select, ODER-verknüpft).
 *  App-VIPs (von dir markiert) werden immer vorgelesen. */
export type ReadGroup = 'all' | 'followers' | 'subs' | 'mods' | 'vips';

/** Legacy: alte Einzel-Stufe (vor dem Multi-Select). Nur noch für die Migration. */
export type ReadWho = ReadGroup;

/** Alte hierarchische Einzel-Einstellung → neues Gruppen-Array, so dass das
 *  bisherige Verhalten erhalten bleibt (z.B. „followers" schloss subs+mods ein). */
export function migrateReadWho(who: string): ReadGroup[] {
  switch (who) {
    case 'all': return ['all'];
    case 'followers': return ['followers', 'subs', 'mods'];
    case 'subs': return ['subs', 'mods'];
    case 'mods': return ['mods'];
    case 'vips': return ['vips'];
    default: return ['all'];
  }
}

function groupMatches(group: ReadGroup, u: StudioEvent['user'], teamMinLevel = 0): boolean {
  switch (group) {
    case 'all': return true;
    case 'mods': return !!u?.isMod;
    case 'subs': {
      if (!u?.isSub) return false;
      // Mindest-Stufe: TikTok schickt die Teamherz-Stufe mit (Fan-Club-Level).
      // 0 = keine Schwelle, jedes Teamherz zählt.
      if (teamMinLevel <= 0) return true;
      // Stufe unbekannt (nicht jedes Ereignis trägt Abzeichen-Daten) → zulassen.
      // Lieber einmal zu viel vorlesen als einen echten Unterstützer stumm
      // schalten, nur weil TikTok die Stufe gerade nicht mitgeschickt hat.
      if (u.teamLevel === undefined) return true;
      return u.teamLevel >= teamMinLevel;
    }
    case 'followers': return !!u?.isFollower;
    case 'vips': return false; // nur App-VIPs (separat behandelt)
  }
}

export interface ReadDecision {
  read: boolean;
  /** Text fürs Vorlesen (Prefix bereits entfernt). */
  text: string;
  /** Wenn nicht vorgelesen: warum? 'prefix' = Start-Zeichen fehlt (gilt auch für
   *  Mods/Follower!), 'group' = in keiner gewählten Gruppe. Für klares Logging. */
  reason?: 'prefix' | 'group';
}

/** Enthält der Text ein gesperrtes Wort? (case-insensitiv, Teilwort-Match). */
export function containsBlockedWord(text: string, blockedWords: string[]): boolean {
  if (!text || !blockedWords?.length) return false;
  const lower = text.toLowerCase();
  return blockedWords.some((w) => {
    const t = w.trim().toLowerCase();
    return t.length > 0 && lower.includes(t);
  });
}

export function shouldReadChat(
  event: StudioEvent,
  groups: ReadGroup[],
  prefix: string,
  isAppVip: boolean,
  /** Mindest-Teamherz-Stufe für die Gruppe „Teamherz" (0 = egal). */
  teamMinLevel = 0,
): ReadDecision {
  const raw = event.text ?? '';

  // Prefix-Modus: nur Nachrichten, die mit dem Zeichen beginnen (wird entfernt).
  let text = raw;
  if (prefix) {
    if (!raw.startsWith(prefix)) return { read: false, text: raw, reason: 'prefix' };
    text = raw.slice(prefix.length).trim();
    if (!text) return { read: false, text: '', reason: 'prefix' };
  }

  // App-VIPs (von dir markiert) immer; sonst: in mind. einer angekreuzten Gruppe.
  const u = event.user;
  const groupOk = isAppVip || groups.some((g) => groupMatches(g, u, teamMinLevel));

  return groupOk ? { read: true, text } : { read: false, text, reason: 'group' };
}
