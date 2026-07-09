// mixer.ts — App-interner Sound-Mixer: Lautstärke, Mute und (optional) eigenes
// Ausgabegerät PRO Sound-Kategorie. Plattformneutral (kein DOM, kein Node), damit
// Main (studio/settings) und Renderer (SoundPlayer/MixerPage) dieselbe Logik teilen.
//
// Kategorien = die vier Quellen, aus denen bOtExE Ton erzeugt:
//   tts        – vorgelesene Chat-/Ansage-Stimme
//   alert      – Gift-/Follow-/Alert-Sounds
//   soundboard – manuell/über Trigger ausgelöste Sounds
//   game       – Widget-/Spiel-Sounds (Quiz-Reveal, Rad, Feuerwerk, Gewinner)

export type SoundCategory = 'tts' | 'alert' | 'soundboard' | 'game';

export const SOUND_CATEGORIES: SoundCategory[] = ['tts', 'alert', 'soundboard', 'game'];

/** Anzeigenamen für die UI (deutsch, streamer-verständlich). */
export const CATEGORY_LABEL: Record<SoundCategory, string> = {
  tts: 'Vorlese-Stimme',
  alert: 'Alerts & Gifts',
  soundboard: 'Soundboard',
  game: 'Spiele',
};

export interface MixerChannel {
  /** 0..1 — multiplikativ auf die Basis-Lautstärke des Sounds. */
  volume: number;
  /** true = dieser Kanal ist stummgeschaltet. */
  muted: boolean;
  /** Eigenes Ausgabegerät (deviceId), '' = globales Standard-Gerät nutzen. */
  sinkId: string;
  /** Label des Kanal-Geräts (robuster Fallback, wenn die deviceId wechselt). */
  sinkLabel: string;
}

export interface MixerSettings {
  /** Master-Regler über ALLE Kanäle, 0..1. */
  master: number;
  channels: Record<SoundCategory, MixerChannel>;
}

const clamp01 = (n: unknown): number => {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, x));
};

function defaultChannel(): MixerChannel {
  return { volume: 1, muted: false, sinkId: '', sinkLabel: '' };
}

export const DEFAULT_MIXER: MixerSettings = {
  master: 1,
  channels: {
    tts: defaultChannel(),
    alert: defaultChannel(),
    soundboard: defaultChannel(),
    game: defaultChannel(),
  },
};

/** Effektiver Gain-Faktor eines Kanals: Master × Kanal-Lautstärke, 0 wenn stumm. */
export function channelGain(mixer: MixerSettings, category: SoundCategory): number {
  const ch = mixer.channels[category] ?? defaultChannel();
  if (ch.muted) return 0;
  return clamp01(mixer.master) * clamp01(ch.volume);
}

/** Ausgabegerät eines Kanals: eigenes wenn gesetzt, sonst das globale Gerät. */
export function channelSinkId(mixer: MixerSettings, category: SoundCategory, globalSinkId: string): string {
  const ch = mixer.channels[category];
  return ch && ch.sinkId ? ch.sinkId : globalSinkId;
}

/** Label des Kanal-Geräts (für den deviceId-Fallback nach Umstecken/Neustart). */
export function channelSinkLabel(mixer: MixerSettings, category: SoundCategory, globalSinkLabel: string): string {
  const ch = mixer.channels[category];
  return ch && ch.sinkId ? ch.sinkLabel : globalSinkLabel;
}

/** Kategorie eines Sound-Kommandos robust bestimmen. Fällt für Alt-Kommandos
 *  ohne Kategorie auf das „tts-"-Namensschema zurück, sonst Soundboard. */
export function categoryOf(cmd: { category?: SoundCategory; soundId: string }): SoundCategory {
  if (cmd.category && SOUND_CATEGORIES.includes(cmd.category)) return cmd.category;
  if (String(cmd.soundId).startsWith('tts-')) return 'tts';
  return 'soundboard';
}

/** Rohes (evtl. unvollständiges/kaputtes) Objekt → vollständiges MixerSettings.
 *  Nutzt Defaults für fehlende Felder und klemmt Zahlen auf 0..1 — damit
 *  gespeicherte oder migrierte Einstellungen nie eine kaputte Ausgabe erzeugen. */
export function normalizeMixer(raw: unknown): MixerSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<MixerSettings>;
  const rawChannels = (r.channels && typeof r.channels === 'object' ? r.channels : {}) as Partial<
    Record<SoundCategory, Partial<MixerChannel>>
  >;
  const channels = {} as Record<SoundCategory, MixerChannel>;
  for (const c of SOUND_CATEGORIES) {
    const rc = rawChannels[c] ?? {};
    channels[c] = {
      volume: clamp01(rc.volume ?? 1),
      muted: rc.muted === true,
      sinkId: typeof rc.sinkId === 'string' ? rc.sinkId : '',
      sinkLabel: typeof rc.sinkLabel === 'string' ? rc.sinkLabel : '',
    };
  }
  return { master: clamp01(r.master ?? 1), channels };
}
