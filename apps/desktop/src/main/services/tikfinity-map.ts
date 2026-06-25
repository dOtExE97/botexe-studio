// tikfinity-map.ts — übersetzt eine entschlüsselte TikFinity-Config in unser
// Modell (Trigger-Regeln, Chat-Befehle). Reine Funktion → testbar. Sounds werden
// vom Aufrufer vorab heruntergeladen; hier wird per URL→soundId-Lookup verknüpft.
import type { TriggerRule, TriggerAction, ChatCommand } from '@botexe/trigger-engine';
import type { TikfinityConfig } from './tikfinity-decrypt';

interface TfEvent {
  id?: string;
  active?: boolean;
  triggerTypeId?: number;
  whichUserId?: number;
  minBarsAmount?: number;
  minLikesAmount?: number;
  giftId?: number;
  giftName?: string;
  chatCmd?: string;
  actionIds?: number[];
}
interface TfAction {
  id?: number;
  name?: string;
  textToSpeech?: string;
  message?: string;
  audioUrl?: string;
  videoUrl?: string;
  animationUrl?: string;
  keystrokes?: string;
  obsSceneId?: string;
  streamerbotActionId?: string;
  dynamicConfig?: { cooldown?: number; userCooldown?: number; ttsVoice?: string };
}

export interface ImportReport {
  triggers: number;
  commands: number;
  soundActions: number;
  skipped: string[];
}

const parseJson = <T>(v: unknown, fb: T): T => {
  if (typeof v !== 'string') return (v as T) ?? fb;
  try { return JSON.parse(v) as T; } catch { return fb; }
};

/** Alle Sound-URLs der Config (für den Vorab-Download). */
export function collectSoundUrls(config: TikfinityConfig): string[] {
  const urls = new Set<string>();
  for (const a of (config.actions ?? []) as TfAction[]) {
    if (a.audioUrl && /^https?:\/\//i.test(a.audioUrl)) urls.add(a.audioUrl);
  }
  const sounds = parseJson<Array<{ soundUrl?: string }>>(config.dynamicSettings?.soundsdatasource, []);
  for (const s of sounds) if (s.soundUrl && /^https?:\/\//i.test(s.soundUrl)) urls.add(s.soundUrl);
  return [...urls];
}

/** triggerTypeId → unser Event-Typ (null = nicht als Trigger abbildbar). */
const EVENT_BY_TRIGGER: Record<number, TriggerRule['event'] | null> = {
  1: 'share', 3: 'gift', 4: 'gift', 6: 'join', 7: 'like', 9: 'follow', 10: 'sub', 11: 'chat', 13: 'chat',
};
const TRIGGER_LABEL: Record<number, string> = {
  1: 'Teilen', 2: 'Befehl', 3: 'Gift ab Coins', 4: 'bestimmtes Gift', 6: 'Beitritt', 7: 'Likes', 9: 'Follow', 10: 'Sub', 11: 'Chat', 13: 'Erste Aktivität',
};
const WHO_BY_USERID: Record<number, ChatCommand['who']> = { 3: 'subs', 4: 'mods', 5: 'followers' };

/** Eine TikFinity-Action → unsere TriggerAction[] (eine Action kann mehrere
 *  Sub-Aktionen tragen). soundIdForUrl liefert die lokale Sound-ID. */
function mapAction(a: TfAction, soundIdForUrl: (url: string) => string | undefined, skipped: string[]): TriggerAction[] {
  const out: TriggerAction[] = [];
  const voice = a.dynamicConfig?.ttsVoice;
  if (a.textToSpeech?.trim()) out.push({ kind: 'speak', template: a.textToSpeech, ...(voice ? { voice } : {}) });
  if (a.message?.trim()) out.push({ kind: 'send_chat', template: a.message });
  if (a.audioUrl && /^https?:\/\//i.test(a.audioUrl)) {
    const soundId = soundIdForUrl(a.audioUrl);
    if (soundId) out.push({ kind: 'play_sound', soundId });
    else skipped.push(`Sound nicht ladbar (${a.name ?? 'Aktion'})`);
  }
  if (a.obsSceneId) out.push({ kind: 'obs_scene', scene: a.obsSceneId });
  if (a.streamerbotActionId) out.push({ kind: 'streamerbot_action', action: a.streamerbotActionId });
  // Nicht abbildbar:
  if (a.animationUrl && !/^https?:\/\//i.test(a.animationUrl)) skipped.push(`Overlay-Animation „${a.name ?? ''}" (TikFinity-eigen)`);
  if (a.videoUrl) skipped.push(`Video-Overlay „${a.name ?? ''}" (manuell neu anlegen)`);
  if (a.keystrokes?.trim()) skipped.push(`Tastendruck-Aktion „${a.name ?? ''}" (nicht unterstützt)`);
  return out;
}

export function mapTikfinity(
  config: TikfinityConfig,
  soundIdForUrl: (url: string) => string | undefined,
  newId: () => string,
): { triggerRules: TriggerRule[]; chatCommands: ChatCommand[]; report: ImportReport } {
  const actionsById = new Map<number, TfAction>();
  for (const a of (config.actions ?? []) as TfAction[]) if (a.id != null) actionsById.set(a.id, a);
  const events = parseJson<TfEvent[]>(config.dynamicSettings?.events, []);

  const triggerRules: TriggerRule[] = [];
  const chatCommands: ChatCommand[] = [];
  const skipped: string[] = [];

  for (const e of events) {
    if (e.active === false) continue;
    const tt = e.triggerTypeId ?? 0;
    const acts = (e.actionIds ?? []).map((id) => actionsById.get(id)).filter((a): a is TfAction => !!a);
    const mappedActions = acts.flatMap((a) => mapAction(a, soundIdForUrl, skipped));
    const cooldownMs = (acts[0]?.dynamicConfig?.cooldown ?? 0) * 1000 || undefined;

    // Befehl (triggerTypeId 2) → unser Chat-Befehls-System
    if (tt === 2 && e.chatCmd) {
      const resp = acts.find((a) => a.message?.trim())?.message ?? acts.find((a) => a.textToSpeech?.trim())?.textToSpeech ?? '';
      chatCommands.push({
        id: newId(),
        command: e.chatCmd.replace(/^[!/]/, ''),
        response: resp,
        speak: acts.some((a) => a.textToSpeech?.trim()),
        sendToChat: acts.some((a) => a.message?.trim()),
        who: WHO_BY_USERID[e.whichUserId ?? 1] ?? 'all',
        ...(cooldownMs ? { cooldownMs } : {}),
        enabled: true,
      });
      continue;
    }

    const event = EVENT_BY_TRIGGER[tt];
    if (!event) { skipped.push(`Trigger „${TRIGGER_LABEL[tt] ?? tt}" (kein Gegenstück)`); continue; }
    if (mappedActions.length === 0) { skipped.push(`„${TRIGGER_LABEL[tt] ?? tt}" ohne übernehmbare Aktion`); continue; }

    const conditions: NonNullable<TriggerRule['conditions']> = [];
    if (tt === 3 && e.minBarsAmount) conditions.push({ kind: 'gift_coins_gte', value: e.minBarsAmount });
    if (tt === 4 && (e.giftName || e.giftId != null)) conditions.push({ kind: 'gift_slug_is', value: e.giftName ?? String(e.giftId) });
    if (tt === 13) conditions.push({ kind: 'chat_first_time' });

    triggerRules.push({
      id: newId(),
      name: `[TF] ${TRIGGER_LABEL[tt] ?? 'Trigger'}${e.giftName ? `: ${e.giftName}` : ''}`,
      event,
      ...(conditions.length ? { conditions } : {}),
      actions: mappedActions,
      ...(cooldownMs ? { cooldownMs } : {}),
      enabled: true,
    });
  }

  return {
    triggerRules,
    chatCommands,
    report: { triggers: triggerRules.length, commands: chatCommands.length, soundActions: triggerRules.reduce((n, r) => n + r.actions.filter((a) => a.kind === 'play_sound').length, 0), skipped: [...new Set(skipped)] },
  };
}
