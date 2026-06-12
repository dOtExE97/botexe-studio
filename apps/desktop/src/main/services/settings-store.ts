// settings-store.ts — persistente App-Einstellungen als JSON-File mit
// Schema-Version und atomarem Write (tmp + rename). Trigger-Regeln werden
// beim Laden gefiltert — eine kaputte Regel macht nicht alle Regeln kaputt.
import fs from 'node:fs';
import path from 'node:path';
import type { TriggerRule, Redemption } from '@botexe/trigger-engine';
import { DEFAULT_POINTS_CONFIG, type PointsConfig } from './points-store';
import { log } from '../core/logger';

export const SETTINGS_SCHEMA_VERSION = 5;

export interface TTSSettings {
  enabled: boolean;
  voice: string;
  volume: number;
  readChat: boolean;
  /** 'fixed' = eine Stimme für alle · 'perUser' = stabile Zufalls-Stimme pro User */
  chatVoiceMode: 'fixed' | 'perUser';
  /** Nachrichten, die mit ! beginnen, nicht vorlesen (Befehle). */
  skipCommands: boolean;
  maxTextLen: number;
  /** Vorlese-Format, z.B. '{user} sagt: {text}' */
  chatTemplate: string;
}

export interface StudioSettings {
  schemaVersion: number;
  lastUsername: string;
  soundVolume: number;
  /** Audio-Ausgabegerät für lokale Sounds/TTS (deviceId), '' = Standard. */
  audioOutputId: string;
  triggerRules: TriggerRule[];
  /** Punkte-Einlöse-Store: Chat-Befehl → Punkte ausgeben → Aktion. */
  redemptions: Redemption[];
  activeLayoutId: string | null;
  tts: TTSSettings;
  /** BYOK-Zugangsdaten pro Provider (lokal, klartext — single-user-tool). */
  ttsCredentials: Record<string, Record<string, string>>;
  points: PointsConfig;
}

const TTS_DEFAULTS: TTSSettings = {
  enabled: true,
  voice: 'de-DE-KatjaNeural',
  volume: 0.8,
  readChat: false,
  chatVoiceMode: 'perUser',
  skipCommands: true,
  maxTextLen: 200,
  chatTemplate: '{user} sagt: {text}',
};

const DEFAULTS: StudioSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  lastUsername: '',
  soundVolume: 0.7,
  audioOutputId: '',
  triggerRules: [],
  redemptions: [],
  activeLayoutId: null,
  tts: TTS_DEFAULTS,
  ttsCredentials: {},
  points: DEFAULT_POINTS_CONFIG,
};

function isValidRule(rule: unknown): rule is TriggerRule {
  if (typeof rule !== 'object' || rule === null) return false;
  const r = rule as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.event === 'string' &&
    Array.isArray(r.actions) &&
    typeof r.enabled === 'boolean'
  );
}

function isValidRedemption(red: unknown): red is Redemption {
  if (typeof red !== 'object' || red === null) return false;
  const r = red as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.command === 'string' &&
    typeof r.cost === 'number' &&
    Array.isArray(r.actions) &&
    typeof r.enabled === 'boolean'
  );
}

export class SettingsStore {
  private readonly file: string;
  private cache: StudioSettings;

  constructor(userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.file = path.join(userDataDir, 'settings.json');
    this.cache = this.load();
  }

  private load(): StudioSettings {
    if (!fs.existsSync(this.file)) return { ...DEFAULTS };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<StudioSettings>;
      if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SETTINGS_SCHEMA_VERSION) {
        // Neuere Version (Downgrade-Szenario): nichts kaputt-migrieren,
        // bekannte Felder defensiv übernehmen.
        log.warn('Settings', `Settings-Version ${raw.schemaVersion} ist neuer als ${SETTINGS_SCHEMA_VERSION}`);
      }
      const merged: StudioSettings = { ...DEFAULTS, ...raw, schemaVersion: SETTINGS_SCHEMA_VERSION };
      // Migration v1→v2: tts-block ergänzen; defensiv mergen falls teilweise da.
      merged.tts = { ...TTS_DEFAULTS, ...(typeof raw.tts === 'object' && raw.tts !== null ? raw.tts : {}) };
      // Migration v2→v3: credentials-block ergänzen.
      merged.ttsCredentials =
        typeof raw.ttsCredentials === 'object' && raw.ttsCredentials !== null ? raw.ttsCredentials : {};
      // Migration v3→v4: points-config ergänzen.
      merged.points = { ...DEFAULT_POINTS_CONFIG, ...(typeof raw.points === 'object' && raw.points !== null ? raw.points : {}) };
      merged.triggerRules = (Array.isArray(raw.triggerRules) ? raw.triggerRules : []).filter(
        (r: unknown): r is TriggerRule => {
          const ok = isValidRule(r);
          if (!ok) log.warn('Settings', 'Ungültige Trigger-Regel beim Laden verworfen');
          return ok;
        },
      );
      // Migration v4→v5: Einlöse-Store + Audio-Output ergänzen.
      merged.redemptions = (Array.isArray(raw.redemptions) ? raw.redemptions : []).filter(
        (r: unknown): r is Redemption => {
          const ok = isValidRedemption(r);
          if (!ok) log.warn('Settings', 'Ungültige Einlösung beim Laden verworfen');
          return ok;
        },
      );
      merged.audioOutputId = typeof raw.audioOutputId === 'string' ? raw.audioOutputId : '';
      return merged;
    } catch (err) {
      log.error('Settings', 'settings.json nicht lesbar — Defaults', (err as Error).message);
      return { ...DEFAULTS };
    }
  }

  get(): StudioSettings {
    return { ...this.cache, triggerRules: [...this.cache.triggerRules] };
  }

  update(patch: Partial<Omit<StudioSettings, 'schemaVersion'>>): StudioSettings {
    this.cache = { ...this.cache, ...patch, schemaVersion: SETTINGS_SCHEMA_VERSION };
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf-8');
    fs.renameSync(tmp, this.file);
    return this.get();
  }
}
