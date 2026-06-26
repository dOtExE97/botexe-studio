// game-mastery.ts — Spiele-Meister-Level-System auf Basis von Game-Wins.
// Reine Logik (Main-Prozess): kein DOM, kein Electron, kein React. Aus den
// gesammelten Siegen eines Spiels wird ein Mastery-Level abgeleitet und bei
// Bedarf ein Premium-Einblender ('game-level-up') als MomentPayload gebaut.
import { randomUUID } from 'node:crypto';
import type { MomentPayload } from '@botexe/overlay-engine';

/** Ein Eintrag der Level-Leiter: ab `wins` Siegen gilt `value`/`title`. */
export interface MasteryLevel {
  value: number;
  title: string;
  /** Mindest-Siege, um dieses Level zu erreichen (inklusive). */
  wins: number;
}

/** Default-Leiter. Aufsteigend nach `wins` sortiert — darauf bauen alle
 *  Suchen unten auf. Wer eine eigene Leiter übergibt, muss das einhalten. */
export const DEFAULT_MASTERY_LEVELS: readonly MasteryLevel[] = [
  { value: 1, title: 'Rookie', wins: 1 },
  { value: 2, title: 'Taktiker', wins: 3 },
  { value: 3, title: 'Champion', wins: 7 },
  { value: 4, title: 'Legende', wins: 15 },
  { value: 5, title: 'Spiele-Meister', wins: 30 },
];

/** Höchstes erreichtes Level für eine Sieg-Anzahl. Unter dem ersten
 *  Schwellwert (z. B. 0 Siege) gilt das niedrigste Level als „noch nicht
 *  erreicht" — wir geben dann ein Level-0-„Neuling"-Objekt zurück. */
export function levelForWins(
  wins: number,
  levels: readonly MasteryLevel[] = DEFAULT_MASTERY_LEVELS,
): MasteryLevel {
  let current: MasteryLevel = { value: 0, title: 'Neuling', wins: 0 };
  for (const lvl of levels) {
    if (wins >= lvl.wins) current = lvl;
    else break;
  }
  return current;
}

/** Nächstes noch nicht erreichtes Level — oder null, wenn schon das höchste
 *  Level erreicht ist. */
export function nextLevelForWins(
  wins: number,
  levels: readonly MasteryLevel[] = DEFAULT_MASTERY_LEVELS,
): MasteryLevel | null {
  for (const lvl of levels) {
    if (wins < lvl.wins) return lvl;
  }
  return null;
}

/** Ob durch den Sprung von `beforeWins` auf `afterWins` ein neues Level
 *  erreicht wurde (höherer Level-Wert als vorher). Rückschritte zählen nie. */
export function didLevelUp(
  beforeWins: number,
  afterWins: number,
  levels: readonly MasteryLevel[] = DEFAULT_MASTERY_LEVELS,
): boolean {
  return levelForWins(afterWins, levels).value > levelForWins(beforeWins, levels).value;
}

/** Fortschritt innerhalb des aktuellen Levels in Richtung des nächsten Levels.
 *  - current: Siege im aktuellen Level (ab dessen Schwellwert).
 *  - next: Siege, die das nächste Level braucht — oder null bei Max-Level.
 *  - pct: 0..100, am Max-Level immer 100. */
export function progressForWins(
  wins: number,
  levels: readonly MasteryLevel[] = DEFAULT_MASTERY_LEVELS,
): { current: number; next: number | null; pct: number } {
  const now = levelForWins(wins, levels);
  const next = nextLevelForWins(wins, levels);
  if (next === null) {
    return { current: wins, next: null, pct: 100 };
  }
  const span = next.wins - now.wins;
  const done = wins - now.wins;
  const pct = span <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((done / span) * 100)));
  return { current: wins, next: next.wins, pct };
}

/** Priorität eines Mastery-Moments: das Top-Level (Spiele-Meister) ist 95,
 *  alle anderen 80. */
const MASTERY_PRIORITY_TOP = 95;
const MASTERY_PRIORITY_DEFAULT = 80;

/** Anzeige-Dauer eines Mastery-Moments in Millisekunden. */
const MASTERY_DURATION_MS = 5000;

/** Baut einen 'game-level-up'-Moment für das aktuell erreichte Level. Wird
 *  typischerweise nur aufgerufen, wenn `didLevelUp` true ergab. */
export function masteryMoment(
  user: { id: string; nickname: string; profilePic?: string },
  wins: number,
  levels: readonly MasteryLevel[] = DEFAULT_MASTERY_LEVELS,
): MomentPayload {
  const lvl = levelForWins(wins, levels);
  const next = nextLevelForWins(wins, levels);
  const isTop = next === null;

  return {
    id: randomUUID(),
    channel: 'mastery',
    type: 'game-level-up',
    priority: isTop ? MASTERY_PRIORITY_TOP : MASTERY_PRIORITY_DEFAULT,
    durationMs: MASTERY_DURATION_MS,
    user: { id: user.id, nickname: user.nickname, ...(user.profilePic ? { profilePic: user.profilePic } : {}) },
    title: `${user.nickname} → ${lvl.title}!`,
    level: {
      value: lvl.value,
      title: lvl.title,
      currentWins: wins,
      ...(next ? { nextWins: next.wins } : {}),
    },
  };
}
