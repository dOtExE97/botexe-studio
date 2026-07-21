// tikfinity-map.ts — übersetzt eine entschlüsselte TikFinity-Config in unser
// Modell (Trigger-Regeln, Chat-Befehle). Reine Funktion → testbar. Sounds werden
// vom Aufrufer vorab heruntergeladen; hier wird per URL→soundId-Lookup verknüpft.
import type { TriggerRule, TriggerAction, ChatCommand } from '@botexe/trigger-engine';
import type { OverlayLayer } from '@botexe/overlay-engine';
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

interface TfWheelSeg { text?: string; order?: number }
interface TfSocial { platform?: string; username?: string }

/** TikFinity-Schriftname → unser fontFamily-Options-Wert (leer = Standard). */
const FONT_MAP: Record<string, string> = {
  'luckiest guy': 'luckiest', 'bebas neue': 'bebas', 'anton': 'anton', 'bungee': 'bungee',
  'lilita one': 'lilita', 'baloo 2': 'baloo', 'baloo': 'baloo', 'fredoka': 'fredoka', 'fredoka one': 'fredoka',
  'russo one': 'russo', 'righteous': 'righteous', 'permanent marker': 'marker', 'pacifico': 'pacifico',
  'press start 2p': 'pressstart',
};
const mapFont = (tf: unknown): string => FONT_MAP[String(tf ?? '').trim().toLowerCase()] ?? '';
/** TikFinity-Titeleffekt → unser Theme, wo die Namen zusammenpassen (sonst glas). */
const mapTheme = (effect: unknown): string => (String(effect ?? '').trim().toLowerCase() === 'aurora' ? 'aurora' : 'glas');

// TikFinity-Standardtitel der Ziel-Widgets — nur ABWEICHENDE gelten als „genutzt".
const DEFAULT_GOAL_TITLES = new Set(['your title', 'earned coins', 'earned points', 'follower', 'like goal', 'share goal', 'sub goal', 'viewer goal', '']);
const EXO = 'exo 2'; // TikFinity-Standardschrift → Signal, dass ein Widget NICHT angefasst wurde

/** Widgets → Overlay-Layer. TikFinity v4 exportiert die vollen Widget-Designs in
 *  dynamicSettings (Schrift/Farben/Ziele) — wir übernehmen die Widgets mit klarem
 *  Nutzungssignal (echte Inhalte oder vom Standard abweichende Gestaltung) und
 *  platzieren sie in einem aufgeräumten Standard-Layout (TikFinity hat KEINE
 *  Positionsdaten — dort ist jedes Widget eine eigene Browser-Quelle). */
export function mapWidgets(config: TikfinityConfig, newId: () => string): { layers: OverlayLayer[]; report: string[] } {
  const ds = config.dynamicSettings ?? {};
  const layers: OverlayLayer[] = [];
  const report: string[] = [];
  const s = (key: string): string => { const v = ds[key]; return v == null ? '' : String(v); };
  const add = (widgetType: string, name: string, x: number, y: number, w: number, h: number, props: Record<string, unknown>) => {
    layers.push({ id: newId(), widgetType, name, x, y, w, h, z: layers.length + 1, visible: true, props });
  };

  // Glücksrad — Segmente aus widget_wheelofactions_wheels (JSON-String).
  const wheels = parseJson<Array<{ name?: string; segments?: TfWheelSeg[] }>>(ds.widget_wheelofactions_wheels, []);
  const wheel = wheels.find((w) => w.segments?.length);
  if (wheel?.segments?.length) {
    const segments = [...wheel.segments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((seg) => String(seg.text ?? '').trim()).filter(Boolean).join('|');
    if (segments) { add('wheel', wheel.name || 'Glücksrad', 300, 680, 480, 560, { segments, title: wheel.name || 'Glücksrad', style: 'classic' }); report.push(`Glücksrad (${wheel.segments.length} Segmente)`); }
  }

  // Coin-Glas („Tüte") — Signatur-Widget der Gift-Streamer, praktisch immer genutzt.
  if ('widget_coinjar_gifttype' in ds || 'widget_coinjar_scale' in ds) {
    add('gift-jar', 'Coin-Glas', 620, 360, 440, 520, {
      shape: 'glas', showToast: s('widget_coinjar_displayalert') !== 'false', label: '', accent: '#ffd23e',
    });
    report.push('Coin-Glas (gift-jar)');
  }

  // Chat-Box — Farben/Schrift übernehmen (nur wenn vorhanden).
  if ('widget_chat_backgroundnormal' in ds || 'widget_chat_usernamecolornormal' in ds) {
    add('chat-box', 'Chat', 30, 1500, 420, 380, {
      style: 'glas',
      max: 8,
      hideAfterMs: (Number(s('widget_chat_hideafter')) || 0) * 1000,
      accent: s('widget_chat_usernamecolormod') || s('widget_chat_usernamecolornormal') || '#ff5436',
      textColor: s('widget_chat_commentcolornormal') || '',
      fontFamily: mapFont(s('widget_chat_fonttype')),
    });
    report.push('Chat-Box');
  }

  // Ziel-Balken — je konfiguriertem TikFinity-Ziel (Titel weicht vom Standard ab),
  // gemappt auf unsere Metriken coins/likes/follows/gifts.
  const GOALS: { tf: string; metric: string; label: string }[] = [
    { tf: 'coins', metric: 'coins', label: 'Coins' },
    { tf: 'likes', metric: 'likes', label: 'Likes' },
    { tf: 'follows', metric: 'follows', label: 'Follower' },
    { tf: 'shares', metric: 'gifts', label: 'Shares' },
  ];
  let goalY = 40;
  for (const g of GOALS) {
    const title = s(`goal_${g.tf}_title`).trim();
    if (!title || DEFAULT_GOAL_TITLES.has(title.toLowerCase())) continue; // nur wirklich angepasste Ziele
    if (g.metric === 'gifts') continue; // shares hat bei uns keine eigene Metrik → auslassen statt falsch mappen
    const value = Number(s(`goal_${g.tf}_value`)) || 1000;
    add('goal-bar', `Ziel: ${title}`, 260, goalY, 560, 80, {
      style: 'glas', metric: g.metric, target: value, label: title,
      accent: s(`widget_goal${g.tf}_progress1color`) || '#21a179',
      textColor: s(`widget_goal${g.tf}_fontcolor`) || '',
      theme: mapTheme(s(`widget_goal${g.tf}_titleeffect`)),
      fontFamily: mapFont(s(`widget_goal${g.tf}_fonttype`)),
    });
    report.push(`Ziel-Balken „${title}"`);
    goalY += 96;
  }

  // Top-Gifter-Liste — nur wenn gestalterisch angefasst (Schrift ≠ Standard).
  const topFont = s('widget_topgifter_fonttype').toLowerCase();
  if (topFont && topFont !== EXO) {
    add('leaderboard', 'Top Gifter', 160, 160, 760, 180, {
      source: 'gifts', limit: 5, title: '',
      style: s('widget_topgifter_showcrown') !== 'false' ? 'royal' : 'arcade',
      accent: s('widget_topgifter_pointscolor') || '#ffd23e',
      textColor: s('widget_topgifter_usernamecolor') || '',
      fontFamily: mapFont(s('widget_topgifter_fonttype')),
    });
    report.push('Top-Gifter-Liste');
  }

  // Social-Media-Rotator — Kanäle aus widget_socialmediarotator_socials.
  const socials = parseJson<TfSocial[]>(ds.widget_socialmediarotator_socials, []);
  const channels = socials.filter((sc) => sc.platform && sc.username).map((sc) => `${sc.platform}:${sc.username}`).join(' | ');
  if (channels) { add('social-rotator', 'Social-Media', 270, 1780, 540, 120, { channels, style: 'pill' }); report.push(`Social-Rotator (${socials.length} Kanäle)`); }

  return { layers, report };
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
    const userCooldownMs = (acts[0]?.dynamicConfig?.userCooldown ?? 0) * 1000 || undefined;

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
    // Bestimmtes Gift: über die STABILE giftId matchen (der giftName ist
    // lokalisiert — „Goldenes Gamepad" würde gegen den englischen Slug nie
    // greifen). giftName wandert in den Regelnamen als Klartext.
    if (tt === 4) {
      if (e.giftId != null) conditions.push({ kind: 'gift_id_is', value: e.giftId });
      else if (e.giftName) conditions.push({ kind: 'gift_slug_is', value: e.giftName });
    }
    // Like-Schwelle: TikFinitys minLikesAmount → feuert beim KREUZEN der Schwelle
    // (sonst würde die Regel bei jedem Like-Batch auslösen).
    if (tt === 7 && e.minLikesAmount) conditions.push({ kind: 'like_count_gte', value: e.minLikesAmount });
    if (tt === 13) conditions.push({ kind: 'chat_first_time' });

    triggerRules.push({
      id: newId(),
      name: `[TF] ${TRIGGER_LABEL[tt] ?? 'Trigger'}${e.giftName ? `: ${e.giftName}` : ''}`,
      event,
      ...(conditions.length ? { conditions } : {}),
      actions: mappedActions,
      ...(cooldownMs ? { cooldownMs } : {}),
      ...(userCooldownMs ? { userCooldownMs } : {}),
      enabled: true,
    });
  }

  return {
    triggerRules,
    chatCommands,
    report: { triggers: triggerRules.length, commands: chatCommands.length, soundActions: triggerRules.reduce((n, r) => n + r.actions.filter((a) => a.kind === 'play_sound').length, 0), skipped: [...new Set(skipped)] },
  };
}
