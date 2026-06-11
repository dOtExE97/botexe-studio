// settings-store.ts — persistente App-Einstellungen als JSON-File mit
// Schema-Version und atomarem Write (tmp + rename). Trigger-Regeln werden
// beim Laden gefiltert — eine kaputte Regel macht nicht alle Regeln kaputt.
import fs from 'node:fs';
import path from 'node:path';
import type { TriggerRule } from '@botexe/trigger-engine';
import { log } from '../core/logger';

export const SETTINGS_SCHEMA_VERSION = 1;

export interface StudioSettings {
  schemaVersion: number;
  lastUsername: string;
  soundVolume: number;
  triggerRules: TriggerRule[];
  activeLayoutId: string | null;
}

const DEFAULTS: StudioSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  lastUsername: '',
  soundVolume: 0.7,
  triggerRules: [],
  activeLayoutId: null,
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
      merged.triggerRules = (Array.isArray(raw.triggerRules) ? raw.triggerRules : []).filter(
        (r: unknown): r is TriggerRule => {
          const ok = isValidRule(r);
          if (!ok) log.warn('Settings', 'Ungültige Trigger-Regel beim Laden verworfen');
          return ok;
        },
      );
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
