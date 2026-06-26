// Zentrale Eingabe-Validatoren (Audit P1) — prüfen IPC-/Import-Daten (vom Renderer
// ODER aus importierten Config-Dateien) gegen die echten Trigger-Engine-Typen,
// BEVOR sie verarbeitet/gespeichert werden. Rein, defensiv, ohne Seiteneffekte.
//
// Grundregel: alles ist `unknown`, bis es geprüft ist. Unbekannte Felder werden
// NICHT durchgereicht — der Output enthält nur valide, getypte Daten.

import type {
  TriggerRule,
  TriggerAction,
  ChatCommand,
  StudioEventType,
} from '@botexe/trigger-engine';

// ── Längen-Caps (gegen aufgeblähte/missbräuchliche Strings aus Importen) ──────
const CAP_TEMPLATE = 1000;
const CAP_VOICE = 100;
const CAP_ID = 200;
const CAP_NAME = 200;
const CAP_SHORT = 200; // soundId, scene, source, action, query …
const CAP_COMMAND = 200;
const CAP_RESPONSE = 1000;

const EVENT_TYPES: ReadonlySet<string> = new Set<StudioEventType>([
  'chat',
  'gift',
  'follow',
  'sub',
  'like',
  'share',
  'join',
  'viewer_count',
  'timer',
]);

const WHO_VALUES: ReadonlySet<string> = new Set(['all', 'followers', 'subs', 'mods']);
const SPOTIFY_CONTROLS: ReadonlySet<string> = new Set(['play', 'pause', 'next', 'previous']);

const CONDITION_KINDS: ReadonlySet<string> = new Set([
  'gift_coins_gte',
  'gift_count_gte',
  'gift_slug_is',
  'chat_keyword',
  'chat_command',
  'chat_first_time',
  'viewer_count_gte',
]);

// ── kleine Prüf-Helfer ───────────────────────────────────────────────────────

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** String mit Länge > 0 (nach trim) und ≤ cap. null = ungültig. */
function str(value: unknown, cap: number): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0) return null;
  return value.length > cap ? value.slice(0, cap) : value;
}

/** Wie str(), erlaubt aber Leer-String (z.B. response/template dürfen leer sein). */
function strAllowEmpty(value: unknown, cap: number): string | null {
  if (typeof value !== 'string') return null;
  return value.length > cap ? value.slice(0, cap) : value;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Endliche Zahl. null = ungültig (NaN/Infinity/Nicht-Zahl). */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Nicht-negative endliche Ganzzahl (für *Ms / count). */
function nonNegInt(value: unknown): number | null {
  const n = num(value);
  if (n === null) return null;
  if (n < 0) return null;
  return Math.floor(n);
}

// ── TriggerAction ─────────────────────────────────────────────────────────────

/**
 * Validiert eine einzelne Aktion. Gibt ein neu aufgebautes, getyptes Objekt
 * zurück (nur valide Felder) oder null bei unbekanntem kind / fehlenden
 * Pflichtfeldern / falschen Typen. delayMs wird – falls valide – übernommen.
 */
export function validateTriggerAction(input: unknown): TriggerAction | null {
  if (!isObject(input)) return null;
  const kind = input['kind'];
  if (typeof kind !== 'string') return null;

  let action: TriggerAction | null = null;

  switch (kind) {
    case 'play_sound': {
      const soundId = str(input['soundId'], CAP_SHORT);
      if (soundId === null) return null;
      const out: { kind: 'play_sound'; soundId: string; volume?: number } = { kind, soundId };
      const volume = num(input['volume']);
      if (volume !== null) out.volume = volume;
      action = out;
      break;
    }
    case 'fire_alert': {
      const targetId = str(input['targetId'], CAP_SHORT);
      if (targetId === null) return null;
      const out: { kind: 'fire_alert'; targetId: string; params?: Record<string, unknown> } = {
        kind,
        targetId,
      };
      if (isObject(input['params'])) out.params = input['params'];
      action = out;
      break;
    }
    case 'show_layer': {
      const targetId = str(input['targetId'], CAP_SHORT);
      if (targetId === null) return null;
      const out: { kind: 'show_layer'; targetId: string; durationMs?: number } = { kind, targetId };
      const durationMs = nonNegInt(input['durationMs']);
      if (durationMs !== null) out.durationMs = durationMs;
      action = out;
      break;
    }
    case 'hide_layer': {
      const targetId = str(input['targetId'], CAP_SHORT);
      if (targetId === null) return null;
      action = { kind, targetId };
      break;
    }
    case 'speak': {
      const template = strAllowEmpty(input['template'], CAP_TEMPLATE);
      if (template === null) return null;
      const out: { kind: 'speak'; template: string; voice?: string } = { kind, template };
      const voice = str(input['voice'], CAP_VOICE);
      if (voice !== null) out.voice = voice;
      action = out;
      break;
    }
    case 'spin_wheel': {
      const targetId = str(input['targetId'], CAP_SHORT);
      if (targetId === null) return null;
      const out: { kind: 'spin_wheel'; targetId: string; cost?: number } = { kind, targetId };
      const cost = num(input['cost']);
      if (cost !== null) out.cost = cost;
      action = out;
      break;
    }
    case 'play_media': {
      const targetId = str(input['targetId'], CAP_SHORT);
      if (targetId === null) return null;
      action = { kind, targetId };
      break;
    }
    case 'counter_add': {
      const targetId = str(input['targetId'], CAP_SHORT);
      const delta = num(input['delta']);
      if (targetId === null || delta === null) return null;
      action = { kind, targetId, delta };
      break;
    }
    case 'obs_scene': {
      const scene = str(input['scene'], CAP_SHORT);
      if (scene === null) return null;
      action = { kind, scene };
      break;
    }
    case 'obs_visibility': {
      const scene = str(input['scene'], CAP_SHORT);
      const source = str(input['source'], CAP_SHORT);
      const visible = bool(input['visible']);
      if (scene === null || source === null || visible === null) return null;
      action = { kind, scene, source, visible };
      break;
    }
    case 'send_chat': {
      const template = strAllowEmpty(input['template'], CAP_TEMPLATE);
      if (template === null) return null;
      action = { kind, template };
      break;
    }
    case 'streamerbot_action': {
      const actionName = str(input['action'], CAP_SHORT);
      if (actionName === null) return null;
      action = { kind, action: actionName };
      break;
    }
    case 'giveaway_draw': {
      // params optional; wenn vorhanden, defensiv neu aufbauen (nur valide Teile).
      const out: {
        kind: 'giveaway_draw';
        params?: { winner?: { nickname: string; avatar?: string }; names?: string[] };
      } = { kind };
      const rawParams = input['params'];
      if (isObject(rawParams)) {
        const params: { winner?: { nickname: string; avatar?: string }; names?: string[] } = {};
        const rawWinner = rawParams['winner'];
        if (isObject(rawWinner)) {
          const nickname = str(rawWinner['nickname'], CAP_NAME);
          if (nickname !== null) {
            const winner: { nickname: string; avatar?: string } = { nickname };
            const avatar = str(rawWinner['avatar'], CAP_SHORT);
            if (avatar !== null) winner.avatar = avatar;
            params.winner = winner;
          }
        }
        const rawNames = rawParams['names'];
        if (Array.isArray(rawNames)) {
          const names: string[] = [];
          for (const n of rawNames) {
            const name = str(n, CAP_NAME);
            if (name !== null) names.push(name);
          }
          params.names = names;
        }
        out.params = params;
      }
      action = out;
      break;
    }
    case 'giveaway_reset': {
      action = { kind };
      break;
    }
    case 'spotify_control': {
      const control = input['control'];
      if (typeof control !== 'string' || !SPOTIFY_CONTROLS.has(control)) return null;
      action = { kind, control: control as 'play' | 'pause' | 'next' | 'previous' };
      break;
    }
    case 'spotify_request': {
      const query = strAllowEmpty(input['query'], CAP_SHORT);
      if (query === null) return null;
      action = { kind, query };
      break;
    }
    default:
      return null; // unbekannter kind
  }

  if (action === null) return null;

  // delayMs ist auf jeder Aktion erlaubt (TriggerActionKind & { delayMs? }).
  const delayMs = nonNegInt(input['delayMs']);
  if (delayMs !== null) {
    return { ...action, delayMs };
  }
  return action;
}

// ── TriggerCondition (für TriggerRule.conditions) ─────────────────────────────

/**
 * Validiert eine einzelne Bedingung. null bei unbekanntem kind / fehlendem
 * value. Nur intern genutzt von validateTriggerRule.
 */
function validateCondition(
  input: unknown,
): NonNullable<TriggerRule['conditions']>[number] | null {
  if (!isObject(input)) return null;
  const kind = input['kind'];
  if (typeof kind !== 'string' || !CONDITION_KINDS.has(kind)) return null;

  switch (kind) {
    case 'gift_coins_gte':
    case 'gift_count_gte':
    case 'viewer_count_gte': {
      const value = num(input['value']);
      if (value === null) return null;
      return { kind, value };
    }
    case 'gift_slug_is':
    case 'chat_keyword':
    case 'chat_command': {
      const value = str(input['value'], CAP_SHORT);
      if (value === null) return null;
      return { kind, value };
    }
    case 'chat_first_time':
      return { kind };
    default:
      return null;
  }
}

// ── TriggerRule ───────────────────────────────────────────────────────────────

/**
 * Validiert eine Regel. null wenn id/name keine Strings sind, event kein
 * gültiger StudioEventType ist, actions kein Array ist ODER nach dem Filtern
 * KEINE gültige Aktion übrig bleibt. Unbekannte Felder werden weggelassen.
 */
export function validateTriggerRule(input: unknown): TriggerRule | null {
  if (!isObject(input)) return null;

  const id = str(input['id'], CAP_ID);
  const name = str(input['name'], CAP_NAME);
  if (id === null || name === null) return null;

  const event = input['event'];
  if (typeof event !== 'string' || !EVENT_TYPES.has(event)) return null;

  const rawActions = input['actions'];
  if (!Array.isArray(rawActions)) return null;
  const actions: TriggerAction[] = [];
  for (const a of rawActions) {
    const action = validateTriggerAction(a);
    if (action !== null) actions.push(action);
  }
  if (actions.length === 0) return null; // keine gültige Aktion → Regel verwerfen

  // enabled: fehlend wird defensiv als false behandelt (Regel-Pflichtfeld).
  const enabled = bool(input['enabled']) ?? false;

  const rule: TriggerRule = {
    id,
    name,
    event: event as StudioEventType,
    actions,
    enabled,
  };

  const rawConditions = input['conditions'];
  if (Array.isArray(rawConditions)) {
    const conditions: NonNullable<TriggerRule['conditions']> = [];
    for (const c of rawConditions) {
      const cond = validateCondition(c);
      if (cond !== null) conditions.push(cond);
    }
    rule.conditions = conditions;
  }

  const cooldownMs = nonNegInt(input['cooldownMs']);
  if (cooldownMs !== null) rule.cooldownMs = cooldownMs;

  return rule;
}

// ── ChatCommand ───────────────────────────────────────────────────────────────

/**
 * Validiert einen Chat-Befehl. null wenn id/command/response keine Strings sind
 * oder speak/sendToChat/enabled keine Booleans. who/cooldownMs optional;
 * ungültiges who wird weggelassen (Default 'all' regelt die Logik).
 */
export function validateChatCommand(input: unknown): ChatCommand | null {
  if (!isObject(input)) return null;

  const id = str(input['id'], CAP_ID);
  const command = str(input['command'], CAP_COMMAND);
  const response = strAllowEmpty(input['response'], CAP_RESPONSE);
  if (id === null || command === null || response === null) return null;

  const speak = bool(input['speak']);
  const sendToChat = bool(input['sendToChat']);
  const enabled = bool(input['enabled']);
  if (speak === null || sendToChat === null || enabled === null) return null;

  const cmd: ChatCommand = {
    id,
    command,
    response,
    speak,
    sendToChat,
    enabled,
  };

  const who = input['who'];
  if (typeof who === 'string' && WHO_VALUES.has(who)) {
    cmd.who = who as 'all' | 'followers' | 'subs' | 'mods';
  }

  const cooldownMs = nonNegInt(input['cooldownMs']);
  if (cooldownMs !== null) cmd.cooldownMs = cooldownMs;

  return cmd;
}

// ── Array-Validatoren (für Import/Bulk-IPC) ───────────────────────────────────

/** Erwartet ein Array; filtert ungültige Regeln raus. Kein Array → []. */
export function validateTriggerRules(input: unknown): TriggerRule[] {
  if (!Array.isArray(input)) return [];
  const out: TriggerRule[] = [];
  for (const item of input) {
    const rule = validateTriggerRule(item);
    if (rule !== null) out.push(rule);
  }
  return out;
}

/** Erwartet ein Array; filtert ungültige Befehle raus. Kein Array → []. */
export function validateChatCommands(input: unknown): ChatCommand[] {
  if (!Array.isArray(input)) return [];
  const out: ChatCommand[] = [];
  for (const item of input) {
    const cmd = validateChatCommand(item);
    if (cmd !== null) out.push(cmd);
  }
  return out;
}
