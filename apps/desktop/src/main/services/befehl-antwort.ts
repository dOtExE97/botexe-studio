// befehl-antwort.ts — was ein Chat-Befehl antwortet und wohin. Rein und
// testbar; Studio sammelt nur die Werte (Song, Laufzeit, Kiste …) und führt
// den Plan aus.
//
// Zwei Stufen, in dieser Reihenfolge:
// 1. Befehls-Platzhalter ({song} {kiste} {uptime} …) → `vorlage`. Die
//    Ereignis-Platzhalter ({user} {args} …) bleiben stehen, damit der
//    Sprechweg {user} aussprechbar machen kann (speakForEvent).
// 2. renderSpeakTemplate füllt {user} & Co. → `chatText`.
// Die Antwort geht in den Chat der Plattform, aus der der Befehl kam.
import { fuelleBefehlsVariablen, renderSpeakTemplate, type BefehlsWerte, type ChatCommand, type Plattform, type StudioEvent } from '@botexe/trigger-engine';
import { chatZiel } from './aktion-nachricht';

export interface BefehlsAntwortPlan {
  /** Vorlage mit eingesetzten Befehls-Platzhaltern (für den Sprechweg). */
  vorlage: string;
  /** Fertiger Text für den Chat. */
  chatText: string;
  /** Wohin geschrieben wird — null: nicht in den Chat. */
  chat: Plattform | null;
  /** Vorlesen? */
  sprechen: boolean;
}

export function planeBefehlsAntwort(
  cmd: Pick<ChatCommand, 'speak' | 'sendToChat'>,
  antwort: string,
  event: StudioEvent,
  werte: BefehlsWerte,
): BefehlsAntwortPlan {
  const vorlage = fuelleBefehlsVariablen(antwort, event.text, werte);
  return {
    vorlage,
    chatText: renderSpeakTemplate(vorlage, event),
    chat: cmd.sendToChat ? chatZiel(event) : null,
    sprechen: cmd.speak,
  };
}

/** Song-Wunsch: Text nach dem Befehl („!sr Seemannslied" → „Seemannslied"). */
export function songWunsch(text: string | undefined): string {
  return (text ?? '').replace(/^\s*\S+\s*/, '').trim().slice(0, 100);
}

export function srOhneWunsch(befehl: string): string {
  const b = `!${befehl.trim().replace(/^!*/, '') || 'sr'}`;
  return `@{user} Welchen Song? Zum Beispiel: ${b} Seemannslied 🏴‍☠️`;
}
export const SR_NUR_EXPLICIT = '@{user} Dazu finde ich nur Explicit-Songs — die laufen hier nicht. Versuch einen anderen 🏴‍☠️';

/** Welchen Suchtreffer der Song-Wunsch nimmt: den ersten — bei
 *  `ohneExplicit` den ersten NICHT-expliziten. 'nur-explicit': es gab
 *  Treffer, aber alle explicit. null: gar kein Treffer. */
export function waehleSongTreffer<T extends { explicit?: boolean }>(hits: T[], ohneExplicit: boolean): T | 'nur-explicit' | null {
  if (!hits.length) return null;
  if (!ohneExplicit) return hits[0] ?? null;
  return hits.find((h) => h.explicit !== true) ?? 'nur-explicit';
}

export const SR_FEHLGESCHLAGEN = '@{user} Den Song konnte ich gerade nicht in die Warteschlange legen 🏴‍☠️';
