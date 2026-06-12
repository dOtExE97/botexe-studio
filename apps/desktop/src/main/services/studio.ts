// studio.ts — die Komposition: Adapter → Bus → Trigger-Engine → Aktionen.
// Hier steckt die Verdrahtung, die in der Alt-App über ein 1500-Zeilen-
// main.ts verschmiert war — main.ts bleibt dünn (Fenster + IPC).
import fs from 'node:fs';
import path from 'node:path';
import { TriggerEngine, renderSpeakTemplate, matchRedemption, type StudioEvent, type TriggerRule, type Redemption, type PanelButton, type TriggerAction } from '@botexe/trigger-engine';
import type { StatsSnapshot } from '../core/session-stats';
import { EventBus } from '../core/event-bus';
import { SessionStats } from '../core/session-stats';
import { EventRecorder, parseReplay, playReplay } from '../core/replay';
import { TikTokAdapter, type AdapterStatusInfo } from '../adapters/tiktok-adapter';
import { OverlayServer } from '../adapters/overlay-server';
import { SettingsStore } from './settings-store';
import { LayoutStore } from './layout-store';
import { SoundLibrary } from './sound-library';
import { MediaLibrary } from './media-library';
import { shouldReadChat } from './tts-filter';
import { collectGiftSounds, findWheelSounds } from './widget-sounds';
import { PointsStore } from './points-store';
import { GiftCatalog } from './gift-catalog';
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
  /** Nutzer-sichtbare Meldung (Fehler/Hinweis) → Toast im Renderer. */
  onToast?: (toast: { type: 'error' | 'warn' | 'info'; message: string }) => void;
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
  readonly media: MediaLibrary;
  readonly tts: TTSService;
  readonly points: PointsStore;
  readonly giftCatalog: GiftCatalog;
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
  /** Laufende verzögerte Aktionen (Combo-Sequenzen) — beim Stop aufräumen. */
  private actionTimers = new Set<ReturnType<typeof setTimeout>>();
  /** redemptionId → event.ts der letzten Einlösung (globaler Cooldown). */
  private redemptionCooldowns = new Map<string, number>();

  constructor(paths: StudioPaths, hooks: StudioHooks) {
    this.hooks = hooks;
    this.settings = new SettingsStore(paths.userDataDir);
    this.layouts = new LayoutStore(paths.userDataDir);
    this.sounds = new SoundLibrary(paths.userDataDir);
    this.seedBundledSounds(paths.widgetDir);
    this.media = new MediaLibrary(paths.userDataDir);
    this.points = new PointsStore(paths.userDataDir);
    this.giftCatalog = new GiftCatalog(paths.userDataDir);
    this.tts = new TTSService(
      paths.userDataDir,
      (playback) => {
        const tts = this.settings.get().tts;
        const url = `http://127.0.0.1:${this.server.getPort()}/tts/${playback.fileId}?token=${this.server.getToken()}`;
        this.hooks.onSoundPlay({ soundId: playback.fileId, url, volume: tts.volume });
      },
      () => this.settings.get().ttsCredentials,
      (message) => this.hooks.onToast?.({ type: 'error', message }),
    );

    this.server = new OverlayServer(this.bus, {
      port: 27415,
      runtimeDir: paths.runtimeDir,
      widgetDir: paths.widgetDir,
      soundsDir: this.sounds.getDir(),
      mediaDir: this.media.getDir(),
      ttsDir: this.tts.getCacheDir(),
      // Profile = einzelne Layouts; jedes hat seinen eigenen Overlay-Link.
      getLayout: (id) => (id ? this.layouts.get(id) : this.getActiveLayout()),
      getDefaultLayoutId: () => this.settings.get().activeLayoutId,
      getStats: () => ({
        ...this.stats.snapshot(),
        topPoints: this.points.top(10),
        currencyName: this.settings.get().points.currencyName,
      }),
      onWidgetSound: (soundId) => this.playSound(soundId),
      getGiftCatalog: () => this.giftCatalog.all(),
    });

    this.adapter = new TikTokAdapter(this.bus, {
      // Komplette Gift-Liste (mit Bildern) nach dem Connect in den Katalog —
      // so kennt z.B. das Bingo ALLE Gift-Bilder, bevor das erste Gift kommt.
      onAvailableGifts: (gifts) => this.importAvailableGifts(gifts),
      onStatus: (info) => {
        // K1-Lehre: bei JEDEM echten (Re-)Connect definierter Zustand.
        // Session-Stats bleiben bewusst stehen (Leaderboard übersteht Drops),
        // Trigger-Cooldowns ebenso — nur ein NEUER Stream (connect()-Aufruf
        // des Users) setzt zurück, siehe connect().
        this.hooks.onStatus(info);
        if (info.status === 'error') {
          this.hooks.onToast?.({ type: 'error', message: `Verbindung fehlgeschlagen${info.detail ? `: ${info.detail}` : ''}` });
        }
      },
    });

    this.engine.setRules(this.settings.get().triggerRules);
    this.wireBus();
  }

  private wireBus(): void {
    this.bus.subscribeAll((e) => {
      // 0. Anreichern: allererster Auftritt dieses Zuschauers? (für die
      // „Erste Nachricht"-Begrüßung — VOR recordEvent, das legt den Eintrag an.)
      if (e.user && !this.points.get(e.user.id)) e.firstOfUser = true;

      // 1. Aufnahme (falls aktiv)
      this.recorder?.record(e);

      // 2. Loyalty-Punkte (persistent über Streams) + Session-Statistik
      this.points.recordEvent(e, this.settings.get().points);
      if (this.stats.apply(e)) this.scheduleStatsBroadcast();

      // 3. Trigger-Engine: Regeln auswerten, Aktionen ausführen (mit Sequenz-Delay)
      for (const match of this.engine.evaluate(e)) {
        this.dispatchAction(match.ruleId, match.action, e);
      }

      // 3b. Chat: Punkte-Einlösungen + Vorlesen (TikFinity-Style)
      if (e.type === 'chat') {
        this.maybeRedeem(e);
        this.maybeReadChat(e);
      }

      // 3c. Widget-Sounds: Feuerwerk-Knall / Alert-Sound direkt am Widget
      // konfiguriert — gespielt LOKAL über die App (nie im Overlay).
      if (e.type === 'gift' && e.gift) {
        // Gift-Katalog: Bild + Coins jedes Gifts dauerhaft merken (Bingo/Galerie).
        this.giftCatalog.record({ slug: e.gift.slug, icon: e.gift.icon, coinsPerUnit: e.gift.coinsPerUnit, count: e.gift.count });
        for (const soundId of collectGiftSounds(this.layouts.list(), e.gift.totalCoins)) {
          this.playSound(soundId);
        }
      }

      // 4. Live-Feed an die App-Shell
      this.hooks.onBusEvent(e);
    });
  }

  /** Aktion einplanen — mit Verzögerung (Combo-Sequenz) oder sofort. */
  private dispatchAction(ruleId: string, action: import('@botexe/trigger-engine').TriggerAction, event: StudioEvent): void {
    // Clamp: schützt vor setTimeout-Overflow (>2^31 ms feuert sofort statt nie).
    const delay = Math.min(Math.max(0, action.delayMs ?? 0), 600_000);
    if (delay > 0) {
      const timer = setTimeout(() => {
        this.actionTimers.delete(timer);
        this.runAction(ruleId, action, event);
      }, delay);
      this.actionTimers.add(timer);
    } else {
      this.runAction(ruleId, action, event);
    }
  }

  /** Punkte-Einlösung prüfen: Chat-Befehl → Punkte abziehen → Aktion(en). */
  private maybeRedeem(event: StudioEvent): void {
    if (event.type !== 'chat' || !event.user) return;
    const red = matchRedemption(this.settings.get().redemptions ?? [], event.text ?? '');
    if (!red) return;
    // Globaler Cooldown
    if (red.cooldownMs) {
      const last = this.redemptionCooldowns.get(red.id);
      if (last !== undefined && event.ts - last < red.cooldownMs) return;
    }
    // Punkte abziehen — nicht genug → leise abbrechen (kein Spam)
    if (red.cost > 0 && !this.points.spend(event.user.id, red.cost)) return;
    if (red.cooldownMs) this.redemptionCooldowns.set(red.id, event.ts);
    if (red.cost > 0) this.scheduleStatsBroadcast();
    for (const action of red.actions) {
      // Die Einlösung hat schon kassiert — ein Spin-Rad als Belohnung darf NICHT
      // ein zweites Mal Punkte abziehen (sonst doppelter Abzug).
      const a = action.kind === 'spin_wheel' ? { ...action, cost: 0 } : action;
      this.dispatchAction(red.id, a, event);
    }
  }

  /** Eine Trigger-Aktion ausführen — gemeinsamer Pfad für Events und Timer. */
  private runAction(ruleId: string, action: import('@botexe/trigger-engine').TriggerAction, event: StudioEvent): void {
    if (action.kind === 'play_sound') {
      this.playSound(action.soundId, action.volume);
    } else if (action.kind === 'speak') {
      this.speakForEvent(action.template, event, action.voice);
    } else if (action.kind === 'spin_wheel') {
      // Punkte-Economy: kostet der Spin etwas, vom Zuschauer abziehen.
      const cost = action.cost ?? 0;
      if (cost > 0 && event.user) {
        if (!this.points.spend(event.user.id, cost)) return; // nicht genug Punkte → kein Spin
        this.scheduleStatsBroadcast();
      }
      this.server.broadcast({ kind: 'action', ruleId, action });
      // Rad-Sounds (am Widget konfiguriert): Drehen sofort, Gewinn nach spinMs.
      const ws = findWheelSounds(this.layouts.list(), action.targetId);
      if (ws) {
        if (ws.spin) this.playSound(ws.spin);
        if (ws.result) {
          const timer = setTimeout(() => {
            this.actionTimers.delete(timer);
            this.playSound(ws.result);
          }, ws.spinMs);
          this.actionTimers.add(timer);
        }
      }
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
        this.dispatchAction(match.ruleId, match.action, tickEvent);
      }
    }, 1000);
  }

  async stop(): Promise<void> {
    this.replayAbort?.abort();
    if (this.statsTimer) clearTimeout(this.statsTimer);
    if (this.timerTicker) clearInterval(this.timerTicker);
    for (const t of this.actionTimers) clearTimeout(t);
    this.actionTimers.clear();
    this.points.save();
    this.giftCatalog.save();
    await this.adapter.disconnect();
    await this.server.stop();
  }

  // ── Plattform ─────────────────────────────────────────────────────────

  async connect(username: string): Promise<void> {
    // Neuer Stream = frische Session: Stats + Cooldowns zurück auf null.
    this.stats.reset();
    this.engine.resetCooldowns();
    this.redemptionCooldowns.clear();
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

  // ── Einlöse-Store ─────────────────────────────────────────────────────

  getRedemptions(): Redemption[] {
    return this.settings.get().redemptions ?? [];
  }

  setRedemptions(redemptions: Redemption[]): void {
    this.settings.update({ redemptions });
  }

  // ── Manuelles Auslöse-Panel ───────────────────────────────────────────

  getPanelButtons(): PanelButton[] {
    return this.settings.get().panelButtons ?? [];
  }

  setPanelButtons(buttons: PanelButton[]): void {
    this.settings.update({ panelButtons: buttons });
  }

  /** Aktion manuell auslösen (Panel-Klick oder Hotkey) — ohne Zuschauer-Kontext. */
  fireManual(action: TriggerAction): void {
    this.dispatchAction('manual', action, { type: 'timer', ts: Date.now() });
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

  // ── Zuschauer-Verwaltung ──────────────────────────────────────────────
  listViewers(query: string, limit = 100) { return this.points.search(query, limit); }
  viewerCount() { return this.points.count(); }
  setViewerFlag(userId: string, flag: 'vip' | 'muted', value: boolean) { this.points.setFlag(userId, flag, value); }
  grantPoints(userId: string, delta: number) { this.points.grant(userId, delta); }
  setViewerVoice(userId: string, voice: string | undefined) { this.points.setVoice(userId, voice); }

  /** Session-Reset: Stats/Zähler/Widget-Inhalte auf null — räumt z.B.
   *  Test-Events weg. Loyalty-PUNKTE bleiben (das ist resetPoints). */
  resetSession(): void {
    this.stats.reset();
    this.engine.resetCooldowns();
    this.redemptionCooldowns.clear();
    this.bus.clearLastValues();
    this.scheduleStatsBroadcast();
    this.server.rebroadcastLayouts();
    log.info('Studio', 'Session zurückgesetzt (Stats, Cooldowns, Overlay-Inhalte)');
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
    const ownVoice = event.user ? this.points.voiceFor(event.user.id) : undefined;
    const voice =
      voiceOverride ||
      ownVoice ||
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
    if (event.user && this.points.isMuted(event.user.id)) return; // Troll-Sperre

    // Wer-Filter (Teamherz/Mod/Follower/VIP) + optionaler Prefix-Modus.
    const isVip = event.user ? this.points.isVip(event.user.id) : false;
    const decision = shouldReadChat(event, tts.readWho ?? 'all', tts.readPrefix ?? '', isVip);
    if (!decision.read) return;

    // Prefix-bereinigten Text fürs Template nutzen (Original-Event unangetastet).
    const speakEvent = decision.text === raw ? event : { ...event, text: decision.text };
    this.speakForEvent(tts.chatTemplate, speakEvent);
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

  /** Gift-Liste der Lib (untypisiert/variabel) defensiv in den Katalog laden. */
  private importAvailableGifts(gifts: unknown): void {
    const list: unknown[] = Array.isArray(gifts)
      ? gifts
      : typeof gifts === 'object' && gifts !== null
        ? Object.values(gifts as Record<string, unknown>).filter((v) => typeof v === 'object')
        : [];
    let imported = 0;
    for (const raw of list) {
      const g = raw as { name?: string; describe?: string; diamondCount?: number; diamond_count?: number; image?: { url_list?: string[]; urlList?: string[] }; icon?: { url_list?: string[]; urlList?: string[] } };
      const name = g.name || g.describe;
      if (!name) continue;
      const img = g.image ?? g.icon;
      const icon = img?.url_list?.[0] ?? img?.urlList?.[0];
      this.giftCatalog.record({ slug: name, icon, coinsPerUnit: g.diamondCount ?? g.diamond_count ?? 0, count: 0 });
      imported++;
    }
    if (imported > 0) log.info('GiftCatalog', `${imported} Gifts (mit Bildern) aus der Room-Liste übernommen`);
  }

  /** Mitgelieferte Widget-Sounds (Feuerwerk/Rad/Gewinn/Alert) einmalig in die
   *  Sound-Bibliothek kopieren — danach ganz normale, austauschbare Sounds. */
  private seedBundledSounds(widgetDir: string): void {
    try {
      const src = path.join(widgetDir, 'sounds');
      if (!fs.existsSync(src)) return;
      for (const f of fs.readdirSync(src)) {
        if (!f.endsWith('.wav') && !f.endsWith('.mp3')) continue;
        const target = path.join(this.sounds.getDir(), f);
        if (!fs.existsSync(target)) fs.copyFileSync(path.join(src, f), target);
      }
    } catch (err) {
      log.warn('Sounds', 'Mitgelieferte Sounds nicht kopierbar', (err as Error).message);
    }
  }

  // ── Medien ────────────────────────────────────────────────────────────

  /** Token-authentifizierte URL eines Mediums (fürs Overlay & Editor-Vorschau). */
  mediaUrl(id: string): string {
    return `http://127.0.0.1:${this.server.getPort()}/media/${encodeURIComponent(id)}?token=${this.server.getToken()}`;
  }

  /** Medienliste fürs UI — inkl. fertiger URL für Thumbnails/Vorschau. */
  listMedia(): Array<{ id: string; filename: string; kind: string; sizeBytes: number; url: string }> {
    return this.media.list().map((e) => ({ ...e, url: this.mediaUrl(e.id) }));
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
