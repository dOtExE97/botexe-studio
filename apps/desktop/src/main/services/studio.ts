// studio.ts — die Komposition: Adapter → Bus → Trigger-Engine → Aktionen.
// Hier steckt die Verdrahtung, die in der Alt-App über ein 1500-Zeilen-
// main.ts verschmiert war — main.ts bleibt dünn (Fenster + IPC).
import path from 'node:path';
import { TriggerEngine, renderSpeakTemplate, type StudioEvent, type TriggerRule } from '@botexe/trigger-engine';
import type { StatsSnapshot } from '../core/session-stats';
import { EventBus } from '../core/event-bus';
import { SessionStats } from '../core/session-stats';
import { EventRecorder, parseReplay, playReplay } from '../core/replay';
import { TikTokAdapter, type AdapterStatusInfo } from '../adapters/tiktok-adapter';
import { OverlayServer } from '../adapters/overlay-server';
import { SettingsStore } from './settings-store';
import { LayoutStore } from './layout-store';
import { SoundLibrary } from './sound-library';
import { PointsStore } from './points-store';
import { TTSService } from './tts-service';
import { log } from '../core/logger';

export interface SoundCommand {
  soundId: string;
  url: string;
  volume: number;
}

export interface StudioHooks {
  /** Sound LOKAL abspielen — geht an den App-Renderer, nie ans Overlay. */
  onSoundPlay: (cmd: SoundCommand) => void;
  onStatus: (info: AdapterStatusInfo) => void;
  /** Live-Feed für die App-Shell (gedeckelt im Renderer). */
  onBusEvent: (e: StudioEvent) => void;
  onStats: (stats: StatsSnapshot) => void;
}

export interface StudioPaths {
  userDataDir: string;
  runtimeDir: string;
  widgetDir: string;
}

const STATS_BROADCAST_MIN_MS = 250;

export class Studio {
  readonly bus = new EventBus();
  readonly settings: SettingsStore;
  readonly layouts: LayoutStore;
  readonly sounds: SoundLibrary;
  readonly tts: TTSService;
  readonly points: PointsStore;
  readonly stats = new SessionStats();

  private readonly engine = new TriggerEngine();
  private readonly adapter: TikTokAdapter;
  private readonly server: OverlayServer;
  private readonly hooks: StudioHooks;

  private recorder: EventRecorder | null = null;
  private replayAbort: AbortController | null = null;
  private statsTimer: ReturnType<typeof setTimeout> | null = null;
  private statsDirty = false;
  private timerTicker: ReturnType<typeof setInterval> | null = null;

  constructor(paths: StudioPaths, hooks: StudioHooks) {
    this.hooks = hooks;
    this.settings = new SettingsStore(paths.userDataDir);
    this.layouts = new LayoutStore(paths.userDataDir);
    this.sounds = new SoundLibrary(paths.userDataDir);
    this.points = new PointsStore(paths.userDataDir);
    this.tts = new TTSService(
      paths.userDataDir,
      (playback) => {
        const tts = this.settings.get().tts;
        const url = `http://127.0.0.1:${this.server.getPort()}/tts/${playback.fileId}?token=${this.server.getToken()}`;
        this.hooks.onSoundPlay({ soundId: playback.fileId, url, volume: tts.volume });
      },
      () => this.settings.get().ttsCredentials,
    );

    this.server = new OverlayServer(this.bus, {
      port: 27415,
      runtimeDir: paths.runtimeDir,
      widgetDir: paths.widgetDir,
      soundsDir: this.sounds.getDir(),
      ttsDir: this.tts.getCacheDir(),
      // Profile = einzelne Layouts; jedes hat seinen eigenen Overlay-Link.
      getLayout: (id) => (id ? this.layouts.get(id) : this.getActiveLayout()),
      getDefaultLayoutId: () => this.settings.get().activeLayoutId,
      getStats: () => ({
        ...this.stats.snapshot(),
        topPoints: this.points.top(10),
        currencyName: this.settings.get().points.currencyName,
      }),
    });

    this.adapter = new TikTokAdapter(this.bus, {
      onStatus: (info) => {
        // K1-Lehre: bei JEDEM echten (Re-)Connect definierter Zustand.
        // Session-Stats bleiben bewusst stehen (Leaderboard übersteht Drops),
        // Trigger-Cooldowns ebenso — nur ein NEUER Stream (connect()-Aufruf
        // des Users) setzt zurück, siehe connect().
        this.hooks.onStatus(info);
      },
    });

    this.engine.setRules(this.settings.get().triggerRules);
    this.wireBus();
  }

  private wireBus(): void {
    this.bus.subscribeAll((e) => {
      // 1. Aufnahme (falls aktiv)
      this.recorder?.record(e);

      // 2. Loyalty-Punkte (persistent über Streams) + Session-Statistik
      this.points.recordEvent(e, this.settings.get().points);
      if (this.stats.apply(e)) this.scheduleStatsBroadcast();

      // 3. Trigger-Engine: Regeln auswerten, Aktionen ausführen
      for (const match of this.engine.evaluate(e)) {
        this.runAction(match.ruleId, match.action, e);
      }

      // 3b. Chat vorlesen (TikFinity-Style), wenn aktiviert
      if (e.type === 'chat') this.maybeReadChat(e);

      // 4. Live-Feed an die App-Shell
      this.hooks.onBusEvent(e);
    });
  }

  /** Eine Trigger-Aktion ausführen — gemeinsamer Pfad für Events und Timer. */
  private runAction(ruleId: string, action: import('@botexe/trigger-engine').TriggerAction, event: StudioEvent): void {
    if (action.kind === 'play_sound') {
      this.playSound(action.soundId, action.volume);
    } else if (action.kind === 'speak') {
      this.speakForEvent(action.template, event, action.voice);
    } else {
      this.server.broadcast({ kind: 'action', ruleId, action });
    }
  }

  private scheduleStatsBroadcast(): void {
    // Throttle: Gift-Bombing erzeugt hunderte Updates/s — Overlay und UI
    // brauchen maximal ~4/s (H6-Geist: nie ungebremst durchreichen).
    if (this.statsTimer) {
      this.statsDirty = true;
      return;
    }
    const send = () => {
      const cfg = this.settings.get().points;
      const snapshot = {
        ...this.stats.snapshot(),
        topPoints: this.points.top(10),
        currencyName: cfg.currencyName,
      };
      this.server.broadcast({ kind: 'stats', stats: snapshot });
      this.hooks.onStats(snapshot);
    };
    send();
    this.statsTimer = setTimeout(() => {
      this.statsTimer = null;
      if (this.statsDirty) {
        this.statsDirty = false;
        this.scheduleStatsBroadcast();
      }
    }, STATS_BROADCAST_MIN_MS);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.server.start();
    // Timer-Regeln: jede Sekunde prüfen, ob ein Intervall abgelaufen ist.
    // Synthetisches timer-Event als Kontext (für speak-Templates ohne user).
    this.timerTicker = setInterval(() => {
      const ts = Date.now();
      const tickEvent: StudioEvent = { type: 'timer', ts };
      for (const match of this.engine.evaluateTimer(ts)) {
        this.runAction(match.ruleId, match.action, tickEvent);
      }
    }, 1000);
  }

  async stop(): Promise<void> {
    this.replayAbort?.abort();
    if (this.statsTimer) clearTimeout(this.statsTimer);
    if (this.timerTicker) clearInterval(this.timerTicker);
    this.points.save();
    await this.adapter.disconnect();
    await this.server.stop();
  }

  // ── Plattform ─────────────────────────────────────────────────────────

  async connect(username: string): Promise<void> {
    // Neuer Stream = frische Session: Stats + Cooldowns zurück auf null.
    this.stats.reset();
    this.engine.resetCooldowns();
    this.scheduleStatsBroadcast();
    this.settings.update({ lastUsername: username });
    await this.adapter.connect(username);
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  // ── Trigger-Regeln ────────────────────────────────────────────────────

  getRules(): TriggerRule[] {
    return this.settings.get().triggerRules;
  }

  setRules(rules: TriggerRule[]): void {
    this.settings.update({ triggerRules: rules });
    this.engine.setRules(rules);
  }

  // ── Layout ────────────────────────────────────────────────────────────

  getActiveLayout() {
    const id = this.settings.get().activeLayoutId;
    return id ? this.layouts.get(id) : null;
  }

  /** Setzt das Default-Profil (für den Link ohne profile-Param). */
  setActiveLayout(id: string | null): void {
    this.settings.update({ activeLayoutId: id });
    if (id) this.server.broadcastLayout(id);
  }

  /** Nach jedem Save eines Profils dessen Clients live aktualisieren. */
  notifyLayoutSaved(layoutId: string): void {
    this.server.broadcastLayout(layoutId);
  }

  resetPoints(): void {
    // Punkte komplett leeren: Store neu mit leerem Stand überschreiben.
    for (const e of this.points.top(100000)) this.points.spend(e.id, e.points);
    this.points.save();
  }

  /** Overlay-Link eines bestimmten Profils (für „Link kopieren" pro Profil). */
  getProfileLink(layoutId: string): string {
    return this.server.getOverlayUrl(layoutId);
  }

  // ── TTS ───────────────────────────────────────────────────────────────

  private speakForEvent(template: string, event: StudioEvent, voiceOverride?: string): void {
    const tts = this.settings.get().tts;
    if (!tts.enabled) return;
    const text = TTSService.sanitize(renderSpeakTemplate(template, event), tts.maxTextLen);
    if (!text) return;
    const voice =
      voiceOverride ||
      (tts.chatVoiceMode === 'perUser' && event.user
        ? this.tts.voiceForUser(event.user.id, tts.voice)
        : tts.voice);
    this.tts.speak(text, voice);
  }

  private maybeReadChat(event: StudioEvent): void {
    const tts = this.settings.get().tts;
    if (!tts.enabled || !tts.readChat) return;
    const raw = event.text ?? '';
    if (!raw.trim()) return;
    if (tts.skipCommands && raw.trimStart().startsWith('!')) return;
    this.speakForEvent(tts.chatTemplate, event);
  }

  /** BYOK-Zugangsdaten setzen (leeres feld = löschen). Keys verlassen den Main nie zurück. */
  setTtsCredentials(provider: string, fields: Record<string, string>): void {
    const all = { ...this.settings.get().ttsCredentials };
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
    }
    if (Object.keys(clean).length === 0) delete all[provider];
    else all[provider] = clean;
    this.settings.update({ ttsCredentials: all });
  }

  /** Nur Status (welche provider konfiguriert) — NIE die keys selbst. */
  ttsCredentialStatus(): Record<string, boolean> {
    const creds = this.settings.get().ttsCredentials;
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(creds)) {
      out[k] = Object.values(v).some((x) => x.trim().length > 0);
    }
    return out;
  }

  /** Test aus der UI: beliebigen Text mit gewählter Stimme sprechen. */
  speakTest(text: string, voice?: string): void {
    const tts = this.settings.get().tts;
    const clean = TTSService.sanitize(text, tts.maxTextLen);
    if (clean) this.tts.speak(clean, voice || tts.voice);
  }

  // ── Sound ─────────────────────────────────────────────────────────────

  playSound(soundId: string, volume?: number): void {
    const vol = volume ?? this.settings.get().soundVolume;
    const url = `http://127.0.0.1:${this.server.getPort()}/sounds/${encodeURIComponent(soundId)}?token=${this.server.getToken()}`;
    this.hooks.onSoundPlay({ soundId, url, volume: vol });
  }

  // ── Replay & Test-Events ──────────────────────────────────────────────

  startRecording(): void {
    this.recorder = new EventRecorder();
    log.info('Replay', 'Aufnahme gestartet');
  }

  stopRecording(): string {
    const jsonl = this.recorder?.toJsonl() ?? '';
    const count = this.recorder?.count ?? 0;
    this.recorder = null;
    log.info('Replay', `Aufnahme beendet (${count} events)`);
    return jsonl;
  }

  async playReplayJsonl(jsonl: string, speed: number): Promise<number> {
    this.replayAbort?.abort();
    this.replayAbort = new AbortController();
    const entries = parseReplay(jsonl);
    log.info('Replay', `Wiedergabe: ${entries.length} events, speed ${speed}`);
    return playReplay(entries, (e) => this.bus.publish(e), {
      speed,
      signal: this.replayAbort.signal,
    });
  }

  stopReplay(): void {
    this.replayAbort?.abort();
  }

  /** Einzelnes Test-Event aus der UI (z.B. "Test-Gift 100 Coins"). */
  injectTestEvent(event: StudioEvent): void {
    this.bus.publish({ ...event, ts: Date.now() });
  }

  // ── Info ──────────────────────────────────────────────────────────────

  getOverlayInfo(): { url: string; port: number; connected: boolean } {
    return {
      url: this.server.getOverlayUrl(),
      port: this.server.getPort(),
      connected: this.adapter.isConnected(),
    };
  }

  static resolvePaths(appPath: string, resourcesPath: string | undefined, isPackaged: boolean, userDataDir: string): StudioPaths {
    if (isPackaged && resourcesPath) {
      return {
        userDataDir,
        runtimeDir: path.join(resourcesPath, 'runtime'),
        widgetDir: path.join(resourcesPath, 'widget-kit'),
      };
    }
    // Dev: Monorepo-Pfade relativ zu apps/desktop
    return {
      userDataDir,
      runtimeDir: path.join(appPath, '../../packages/overlay-engine/runtime'),
      widgetDir: path.join(appPath, '../../packages/widget-kit'),
    };
  }
}
