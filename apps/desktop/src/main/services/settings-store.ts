// settings-store.ts — persistente App-Einstellungen als JSON-File mit
// Schema-Version und atomarem Write (tmp + rename). Trigger-Regeln werden
// beim Laden gefiltert — eine kaputte Regel macht nicht alle Regeln kaputt.
import fs from 'node:fs';
import path from 'node:path';
import type { TriggerRule, Redemption, PanelButton, ChatCommand } from '@botexe/trigger-engine';
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
  /** Wer vorgelesen wird: alle / Follower+ / Teamherz+ / Mods / nur App-VIPs. */
  readWho: 'all' | 'followers' | 'subs' | 'mods' | 'vips';
  /** Nur Nachrichten mit diesem Start-Zeichen vorlesen ('' = aus), z.B. '.'. */
  readPrefix: string;
}

export interface StudioSettings {
  schemaVersion: number;
  lastUsername: string;
  soundVolume: number;
  /** Audio-Ausgabegerät für lokale Sounds/TTS (deviceId), '' = Standard. */
  audioOutputId: string;
  /** Label des gewählten Geräts — Fallback, falls die deviceId nach einem
   *  Neustart/Umstecken nicht mehr matcht (dann per Name wiederfinden). */
  audioOutputLabel: string;
  triggerRules: TriggerRule[];
  /** Punkte-Einlöse-Store: Chat-Befehl → Punkte ausgeben → Aktion. */
  redemptions: Redemption[];
  /** Manuelles Auslöse-Panel (Soundboard/Schnell-Aktionen) mit Hotkeys. */
  panelButtons: PanelButton[];
  /** Chat-Befehle (Bot): !befehl → Antwort (Overlay/TTS/Chat). */
  chatCommands: ChatCommand[];
  activeLayoutId: string | null;
  tts: TTSSettings;
  /** BYOK-Zugangsdaten pro Provider (lokal, klartext — single-user-tool). */
  ttsCredentials: Record<string, Record<string, string>>;
  points: PointsConfig;
  /** Chat-Moderation: gesperrte Wörter werden nicht vorgelesen. */
  moderation: ModerationSettings;
  /** Giveaway/Verlosung: Zuschauer treten per Join-Wort bei. */
  giveaway: GiveawaySettings;
  /** Stammgast-Begrüßung: wiederkehrende Zuschauer per TTS willkommen heißen. */
  greetReturning: GreetReturningSettings;
  /** football-data.org API-Key für den Sport-Liveticker (lokal). */
  sportApiKey: string;
  /** OBS-Studio-Steuerung (WebSocket) — Trigger können Szenen/Quellen schalten. */
  obs: ObsSettings;
  /** Persistenter Overlay-/Steuer-Token (stabil über Neustarts). */
  controlToken: string;
  /** TikTok „sessionid"-Cookie — schaltet das Chat-Senden frei (sensibel, lokal). */
  tiktokSessionId: string;
  /** TikTok „tt-target-idc"-Cookie — von der Lib zum Senden ZWINGEND verlangt. */
  tiktokTargetIdc: string;
  /** Euler-API-Key (Community gratis) — fürs Verbinden über den Cloud-WebSocket
   *  UND fürs zuverlässige Senden. */
  tiktokSignApiKey: string;
  /** Verbindungsweg: 'cloud' = Eulers gehosteter WebSocket (gratis, Standard),
   *  'direct' = selbst signieren via tiktok-live-connector (braucht Business-Key,
   *  kann dafür Chat senden). */
  tiktokConnectMode: 'cloud' | 'direct';
  /** Streamer.bot-Brücke (WebSocket-Client). */
  streamerbot: { enabled: boolean; url: string };
}

export interface ObsSettings {
  enabled: boolean;
  url: string;
  password: string;
}

export interface ModerationSettings {
  /** Wörter/Phrasen (kommagetrennt eingegeben) — Nachrichten damit werden vom TTS gesperrt. */
  blockedWords: string[];
}

export interface GiveawaySettings {
  /** Beitritt aktiv (sammelt Teilnehmer, sobald jemand das Join-Wort schreibt). */
  enabled: boolean;
  /** Wort/Befehl zum Beitreten, z.B. '!join' (führende ! egal). */
  joinWord: string;
  /** Eintritts-Kosten in Punkten (0 = gratis). Reicht's nicht, kein Beitritt. */
  entryCost: number;
}

export interface GreetReturningSettings {
  /** Stammgäste beim ersten Chat der Session per TTS begrüßen. */
  enabled: boolean;
  /** Ab dem wievielten Besuch begrüßt wird (2 = ab dem 2. Mal). */
  minVisits: number;
  /** Vorlage, {user} = Name, {visits} = Anzahl Besuche. */
  template: string;
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
  readWho: 'all',
  readPrefix: '',
};

const DEFAULTS: StudioSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  lastUsername: '',
  soundVolume: 0.7,
  audioOutputId: '',
  audioOutputLabel: '',
  triggerRules: [],
  redemptions: [],
  panelButtons: [],
  chatCommands: [],
  activeLayoutId: null,
  tts: TTS_DEFAULTS,
  ttsCredentials: {},
  points: DEFAULT_POINTS_CONFIG,
  moderation: { blockedWords: [] },
  giveaway: { enabled: false, joinWord: '!join', entryCost: 0 },
  greetReturning: { enabled: false, minVisits: 2, template: 'Willkommen zurück, {user}! Schön, dass du wieder dabei bist.' },
  sportApiKey: '',
  obs: { enabled: false, url: 'ws://127.0.0.1:4455', password: '' },
  controlToken: '',
  tiktokSessionId: '',
  tiktokTargetIdc: '',
  tiktokSignApiKey: '',
  tiktokConnectMode: 'cloud',
  streamerbot: { enabled: false, url: 'ws://127.0.0.1:8080/' },
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
      merged.audioOutputLabel = typeof raw.audioOutputLabel === 'string' ? raw.audioOutputLabel : '';
      const gw = raw.giveaway as Record<string, unknown> | undefined;
      merged.giveaway = {
        enabled: typeof gw?.enabled === 'boolean' ? gw.enabled : false,
        joinWord: typeof gw?.joinWord === 'string' && gw.joinWord.trim() ? gw.joinWord.trim().slice(0, 30) : '!join',
        entryCost: typeof gw?.entryCost === 'number' && gw.entryCost >= 0 ? Math.floor(gw.entryCost) : 0,
      };
      const gr = raw.greetReturning as Record<string, unknown> | undefined;
      merged.greetReturning = {
        enabled: typeof gr?.enabled === 'boolean' ? gr.enabled : false,
        minVisits: typeof gr?.minVisits === 'number' && gr.minVisits >= 2 ? Math.floor(gr.minVisits) : 2,
        template: typeof gr?.template === 'string' && gr.template.trim() ? gr.template.slice(0, 200) : DEFAULTS.greetReturning.template,
      };
      merged.panelButtons = (Array.isArray(raw.panelButtons) ? raw.panelButtons : []).filter(
        (b: unknown): b is PanelButton => {
          if (typeof b !== 'object' || b === null) return false;
          const r = b as Record<string, unknown>;
          return (
            typeof r.id === 'string' &&
            typeof r.label === 'string' &&
            typeof r.action === 'object' && r.action !== null &&
            (r.accelerator === undefined || typeof r.accelerator === 'string')
          );
        },
      );
      return merged;
    } catch (err) {
      log.error('Settings', 'settings.json nicht lesbar — Defaults', (err as Error).message);
      return { ...DEFAULTS };
    }
  }

  get(): StudioSettings {
    // Tiefe Kopie — sonst leakt der persistierte Cache als mutable Referenz
    // (eine In-Place-Mutation im Renderer/Engine würde still überleben).
    return structuredClone(this.cache);
  }

  update(patch: Partial<Omit<StudioSettings, 'schemaVersion'>>): StudioSettings {
    this.cache = { ...this.cache, ...patch, schemaVersion: SETTINGS_SCHEMA_VERSION };
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf-8');
    fs.renameSync(tmp, this.file);
    return this.get();
  }
}

/** Tiefe Kopie der Einstellungen OHNE Geheimnisse — für Konfig-Backups, die der
 *  Nutzer als Datei speichert/teilt. Sonst lägen TikTok-Session, Sign-Key,
 *  OBS-Passwort, TTS-API-Keys und der Steuer-Token im Klartext im Backup.
 *  Mutiert das Original NICHT. */
export function redactSecretsForExport(settings: StudioSettings): Record<string, unknown> {
  const copy = structuredClone(settings) as unknown as Record<string, unknown>;
  delete copy.tiktokSessionId;
  delete copy.tiktokTargetIdc;
  delete copy.tiktokSignApiKey;
  delete copy.ttsCredentials;
  delete copy.controlToken; // bleibt pro Maschine eigen
  delete copy.sportApiKey;
  if (copy.obs && typeof copy.obs === 'object') {
    delete (copy.obs as Record<string, unknown>).password;
  }
  return copy;
}
