// tts-filter.ts — wer wird beim Chat-Vorlesen berücksichtigt?
// Pure Logik (testbar): Gruppen-Filter (Teamherz/Mod/Follower/VIP) +
// optionaler Prefix-Modus („nur Nachrichten, die mit . beginnen").
import type { StudioEvent } from '@botexe/trigger-engine';

/** Mindest-Gruppe fürs Vorlesen — aufsteigend restriktiver.
 *  App-VIPs (von dir markiert) werden bei jeder Stufe vorgelesen. */
export type ReadWho = 'all' | 'followers' | 'subs' | 'mods' | 'vips';

export interface ReadDecision {
  read: boolean;
  /** Text fürs Vorlesen (Prefix bereits entfernt). */
  text: string;
}

export function shouldReadChat(
  event: StudioEvent,
  who: ReadWho,
  prefix: string,
  isAppVip: boolean,
): ReadDecision {
  const raw = event.text ?? '';

  // Prefix-Modus: nur Nachrichten, die mit dem Zeichen beginnen (wird entfernt).
  let text = raw;
  if (prefix) {
    if (!raw.startsWith(prefix)) return { read: false, text: raw };
    text = raw.slice(prefix.length).trim();
    if (!text) return { read: false, text: '' };
  }

  const u = event.user;
  const groupOk = (() => {
    if (isAppVip) return true; // von dir markierte VIPs immer
    switch (who) {
      case 'all':
        return true;
      case 'followers':
        return !!(u?.isFollower || u?.isSub || u?.isMod);
      case 'subs':
        return !!(u?.isSub || u?.isMod);
      case 'mods':
        return !!u?.isMod;
      case 'vips':
        return false; // nur App-VIPs (oben schon erlaubt)
    }
  })();

  return { read: groupOk, text };
}
