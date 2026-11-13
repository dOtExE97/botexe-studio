// befehl-pause.ts — Abklingzeiten der Chat-Befehle: global (der Befehl
// antwortet höchstens alle N s) und je Zuschauer (einer allein kann ihn nicht
// spammen). Rein und mit event.ts gerechnet — wie die Regel-Cooldowns.
import type { ChatCommand } from './index';

export interface BefehlsPausen {
  /** Befehl-ID → Zeitpunkt der letzten Antwort. */
  global: Map<string, number>;
  /** `${Befehl-ID}|${Zuschauer}` → Zeitpunkt seiner letzten Antwort. */
  jeUser: Map<string, number>;
}

export type BefehlsPausenErgebnis =
  | { ok: true }
  | { ok: false; grund: 'global' | 'user'; restMs: number };

/** Mehr Einträge als das → abgelaufene wegräumen (ein langer Stream mit vielen Zuschauern). */
const AUFRAEUMEN_AB = 2000;

/**
 * Darf der Befehl jetzt antworten? Bei `ok` wird die Auslösung vermerkt
 * (nur dort, wo es eine Pause gibt). Gesperrt → nichts wird vermerkt, sonst
 * verlängerte jeder Spam-Versuch die eigene Sperre.
 */
export function pruefeBefehlsPause(
  cmd: Pick<ChatCommand, 'id' | 'cooldownMs' | 'userCooldownMs'>,
  zuschauer: string | undefined,
  jetzt: number,
  p: BefehlsPausen,
): BefehlsPausenErgebnis {
  const g = cmd.cooldownMs ?? 0;
  const u = cmd.userCooldownMs ?? 0;
  if (g > 0) {
    const last = p.global.get(cmd.id);
    if (last !== undefined && jetzt - last < g) return { ok: false, grund: 'global', restMs: g - (jetzt - last) };
  }
  const key = zuschauer ? `${cmd.id}|${zuschauer}` : '';
  if (u > 0 && key) {
    const last = p.jeUser.get(key);
    if (last !== undefined && jetzt - last < u) return { ok: false, grund: 'user', restMs: u - (jetzt - last) };
  }
  if (g > 0) p.global.set(cmd.id, jetzt);
  if (u > 0 && key) {
    p.jeUser.set(key, jetzt);
    if (p.jeUser.size > AUFRAEUMEN_AB) {
      for (const [k, t] of p.jeUser) if (jetzt - t > 60 * 60_000) p.jeUser.delete(k);
    }
  }
  return { ok: true };
}
