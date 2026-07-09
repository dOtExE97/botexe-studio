// api-actions.ts — Validierung/Normalisierung der Aktionen, die über die lokale
// Steuer-API (POST /api/action) reinkommen. REINE Funktion, kein Seiteneffekt →
// TDD-getestet. Der Studio-Dispatcher ruft parseApiAction() und führt nur ein
// explizit erlaubtes, sauber typisiertes Ergebnis aus (Whitelist, Defense-in-Depth
// hinter der Token-Auth). Alles Unbekannte/Fehlerhafte wird abgelehnt.

import type { GameKind } from './game-service';

const GAME_KINDS: GameKind[] = ['quiz', 'hangman', 'tic-tac-toe', 'connect-four'];

/** Die erlaubten Steuer-Aktionen (nach Validierung). */
export type ApiAction =
  | { kind: 'play_sound'; soundId: string; volume?: number }
  | { kind: 'speak'; text: string; voice?: string }
  | { kind: 'start_game'; game: GameKind; config?: Record<string, unknown> }
  | { kind: 'stop_game' }
  | { kind: 'reveal_game' }
  | { kind: 'start_boss' }
  | { kind: 'stop_boss' };

/** Kurzliste der erlaubten kinds — auch für die Selbstauskunft der API (GET). */
export const API_ACTION_KINDS = [
  'play_sound', 'speak', 'start_game', 'stop_game', 'reveal_game', 'start_boss', 'stop_boss',
] as const;

export type ParseResult = { action: ApiAction } | { error: string };

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Rohes Request-Body → validierte Aktion ODER klare Fehlermeldung. */
export function parseApiAction(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { error: 'Body muss ein Objekt mit "kind" sein.' };
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (typeof kind !== 'string') return { error: '"kind" fehlt.' };

  switch (kind) {
    case 'play_sound': {
      const soundId = typeof o.soundId === 'string' ? o.soundId.trim() : '';
      if (!soundId) return { error: 'play_sound braucht "soundId".' };
      const action: ApiAction = { kind, soundId };
      if (typeof o.volume === 'number' && Number.isFinite(o.volume)) action.volume = clamp01(o.volume);
      return { action };
    }
    case 'speak': {
      const text = typeof o.text === 'string' ? o.text.trim() : '';
      if (!text) return { error: 'speak braucht "text".' };
      if (text.length > 500) return { error: 'speak "text" ist zu lang (max. 500 Zeichen).' };
      const action: ApiAction = { kind, text };
      if (typeof o.voice === 'string' && o.voice.trim()) action.voice = o.voice.trim();
      return { action };
    }
    case 'start_game': {
      const game = o.game;
      if (typeof game !== 'string' || !GAME_KINDS.includes(game as GameKind)) {
        return { error: `start_game "game" muss eins von ${GAME_KINDS.join(', ')} sein.` };
      }
      const action: ApiAction = { kind, game: game as GameKind };
      if (o.config && typeof o.config === 'object') action.config = o.config as Record<string, unknown>;
      return { action };
    }
    case 'stop_game':
    case 'reveal_game':
    case 'start_boss':
    case 'stop_boss':
      return { action: { kind } as ApiAction };
    default:
      return { error: `Unbekannte Aktion "${kind}". Erlaubt: ${API_ACTION_KINDS.join(', ')}.` };
  }
}
