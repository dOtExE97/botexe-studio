// studio.ts — die Komposition: Adapter → Bus → Trigger-Engine → Aktionen.
// Hier steckt die Verdrahtung, die in der Alt-App über ein 1500-Zeilen-
// main.ts verschmiert war — main.ts bleibt dünn (Fenster + IPC).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TriggerEngine, renderSpeakTemplate, matchRedemption, matchChatCommand, type StudioEvent, type TriggerRule, type Redemption, type PanelButton, type TriggerAction, type ChatCommand } from '@botexe/trigger-engine';
import type { StatsSnapshot } from '../core/session-stats';
import { EventBus } from '../core/event-bus';
import { SessionStats } from '../core/session-stats';
import { EventRecorder, parseReplay, playReplay } from '../core/replay';
import { TikTokAdapter, type AdapterStatusInfo } from '../adapters/tiktok-adapter';
import { OverlayServer } from '../adapters/overlay-server';
import { SettingsStore, type GiveawaySettings } from './settings-store';
import { LayoutStore } from './layout-store';
import { SoundLibrary } from './sound-library';
import { MediaLibrary } from './media-library';
import { shouldReadChat, containsBlockedWord } from './tts-filter';
import { collectGiftSounds, findWheelSounds } from './widget-sounds';
import { PointsStore } from './points-store';
import { GiftCatalog } from './gift-catalog';
import { StatsHistory, type StatsRange, type StatsSummary } from './stats-history';
import { SportService } from './sport-service';
import type { SportProvider } from './sport-normalize';
import { ObsService, type ObsStatus } from './obs-service';
import { StreamerbotService, type StreamerbotStatus } from './streamerbot-service';
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
  /** OBS-Verbindungsstatus → Settings-UI. */
  onObsStatus?: (status: ObsStatus) => void;
  /** Streamer.bot-Verbindungsstatus → Settings-UI. */
  onStreamerbotStatus?: (status: StreamerbotStatus) => void;
}

export interface StudioPaths {
  userDataDir: string;
  runtimeDir: string;
  widgetDir: string;
}

const STATS_BROADCAST_MIN_MS = 250;
/** Mindestabstand zwischen zwei Chat-Sendungen — TikTok drosselt stark (~1/30s). */
const CHAT_SEND_MIN_INTERVAL_MS = 30_000;

/** Rechte-Prüfung für Chat-Befehle (App-VIPs immer erlaubt). */
function commandGroupOk(who: string, event: StudioEvent, isVip: boolean): boolean {
  if (who === 'all' || isVip) return true;
  const u = event.user;
  if (who === 'followers') return !!(u?.isFollower || u?.isSub || u?.isMod);
  if (who === 'subs') return !!(u?.isSub || u?.isMod);
  if (who === 'mods') return !!u?.isMod;
  return true;
}

export class Studio {
  readonly bus = new EventBus();
  readonly settings: SettingsStore;
  readonly layouts: LayoutStore;
  readonly sounds: SoundLibrary;
  readonly media: MediaLibrary;
  readonly tts: TTSService;
  readonly points: PointsStore;
  readonly giftCatalog: GiftCatalog;
  readonly statsHistory: StatsHistory;
  readonly sport: SportService;
  readonly obs: ObsService;
  readonly streamerbot: StreamerbotService;
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
  private lastChatSendAt = 0;
  /** Giveaway-Teilnehmer (userId → Anzeige) — dedupliziert, neuer Stream leert. */
  private giveawayParticipants = new Map<string, { nickname: string; avatar?: string }>();
  private lastGiveawayWinner = '';
  /** Wer in DIESER Session schon (erstmals) geschrieben hat — für Stammgast-Begrüßung. */
  private greetedThisSession = new Set<string>();
  /** redemptionId → event.ts der letzten Einlösung (globaler Cooldown). */
  private redemptionCooldowns = new Map<string, number>();
  private commandCooldowns = new Map<string, number>();

  constructor(paths: StudioPaths, hooks: StudioHooks) {
    this.hooks = hooks;
    this.settings = new SettingsStore(paths.userDataDir);
    this.layouts = new LayoutStore(paths.userDataDir);
    this.sounds = new SoundLibrary(paths.userDataDir);
    this.seedBundledSounds(paths.widgetDir);
    this.media = new MediaLibrary(paths.userDataDir);
    this.points = new PointsStore(paths.userDataDir);
    this.giftCatalog = new GiftCatalog(paths.userDataDir);
    this.statsHistory = new StatsHistory(paths.userDataDir);
    this.sport = new SportService(() => this.settings.get().sportApiKey ?? '');
    this.obs = new ObsService((status) => this.hooks.onObsStatus?.(status));
    this.streamerbot = new StreamerbotService((status) => this.hooks.onStreamerbotStatus?.(status));
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
      token: this.getOrCreateControlToken(),
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
        topWinners: this.points.topWinners(10),
        currencyName: this.settings.get().points.currencyName,
      }),
      onWidgetSound: (soundId) => this.playSound(soundId),
      onGameWin: (_winId, user) => this.recordGameWin(user),
      getGiftCatalog: () => this.giftCatalog.all(),
      getSportMatches: (provider, competition) => this.sport.getMatches(provider as SportProvider, competition),
      listPanelButtons: () => this.getPanelButtons().map((b) => ({ id: b.id, label: b.label })),
      firePanelButton: (id) => this.firePanelById(id),
    });

    this.adapter = new TikTokAdapter(this.bus, {
      // TikFinity-Verhalten: nach Stream-Ende auf das nächste Live warten und
      // automatisch wieder verbinden — Single-User-Tool, also default an.
      autoConnect: true,
      // Login fürs Chat-Senden (sessionid-Cookie + optionaler Sign-Key).
      getAuth: () => ({
        sessionId: this.settings.get().tiktokSessionId || undefined,
        ttTargetIdc: this.settings.get().tiktokTargetIdc || undefined,
        signApiKey: this.settings.get().tiktokSignApiKey || undefined,
      }),
      // Komplette Gift-Liste (mit Bildern) nach dem Connect in den Katalog —
      // so kennt z.B. das Bingo ALLE Gift-Bilder, bevor das erste Gift kommt.
      onAvailableGifts: (gifts) => this.importAvailableGifts(gifts),
      onStatus: (info) => {
        // Bei einem NEUEN Stream (erster Connect ODER erneutes Live nach Ende)
        // die Session frisch starten: alte Session sichern, dann Stats/Cooldowns
        // UND Overlay-Zähler/Top-Listen zurücksetzen. Bei einem Reconnect nach
        // kurzem Abriss (freshStream=false) bleibt alles stehen (Leaderboard
        // übersteht Drops).
        if (info.status === 'connected' && info.freshStream) {
          this.flushSessionToHistory();
          this.resetSession();
        }
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

      // 3b. Chat: Befehle (Bot) + Punkte-Einlösungen + Vorlesen (TikFinity-Style)
      if (e.type === 'chat') {
        this.maybeGreetReturning(e);
        this.maybeJoinGiveaway(e);
        this.maybeRunCommand(e);
        this.maybeRedeem(e);
        this.maybeReadChat(e);
      }

      // 3b2. Teamherz (Sub): persönliches Begrüßungs-Medium des Zuschauers spielen.
      if (e.type === 'sub' && e.user) this.maybePlayWelcomeMedia(e.user);

      // 3c. Widget-Sounds: Feuerwerk-Knall / Alert-Sound direkt am Widget
      // konfiguriert — gespielt LOKAL über die App (nie im Overlay).
      if (e.type === 'gift' && e.gift) {
        // Gift-Katalog: Bild + Coins jedes Gifts dauerhaft merken (Bingo/Galerie).
        // Erstsender wird im Katalog verewigt (count>0 + Sender).
        this.giftCatalog.record({
          slug: e.gift.slug,
          icon: e.gift.icon,
          coinsPerUnit: e.gift.coinsPerUnit,
          count: e.gift.count,
          sender: e.user ? { id: e.user.id, nickname: e.user.nickname } : undefined,
        });
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
    } else if (action.kind === 'obs_scene') {
      void this.obs.setScene(action.scene);
    } else if (action.kind === 'obs_visibility') {
      void this.obs.setSourceVisible(action.scene, action.source, action.visible);
    } else if (action.kind === 'send_chat') {
      void this.sendChat(renderSpeakTemplate(action.template, event));
    } else if (action.kind === 'streamerbot_action') {
      void this.streamerbot.doAction(action.action);
    } else if (action.kind === 'giveaway_draw') {
      this.drawGiveaway();
    } else if (action.kind === 'giveaway_reset') {
      this.resetGiveaway();
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
        topWinners: this.points.topWinners(10),
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
    this.obs.applyConfig(this.settings.get().obs); // OBS-Verbindung (falls aktiviert)
    this.streamerbot.applyConfig(this.settings.get().streamerbot); // Streamer.bot-Brücke
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
    this.flushSessionToHistory();
    this.points.save();
    this.giftCatalog.save();
    this.statsHistory.save();
    this.obs.dispose();
    this.streamerbot.dispose();
    await this.adapter.disconnect();
    await this.server.stop();
  }

  // ── OBS-Studio-Steuerung ──────────────────────────────────────────────
  /** OBS-Einstellungen setzen + Verbindung anwenden. */
  setObsConfig(cfg: { enabled: boolean; url: string; password: string }): void {
    this.settings.update({ obs: cfg });
    this.obs.applyConfig(cfg);
  }
  getObsStatus(): ObsStatus { return this.obs.getStatus(); }
  getObsScenes(): Promise<string[]> { return this.obs.getScenes(); }

  // ── Streamer.bot-Brücke ───────────────────────────────────────────────
  setStreamerbotConfig(cfg: { enabled: boolean; url: string }): void {
    this.settings.update({ streamerbot: cfg });
    this.streamerbot.applyConfig(cfg);
  }
  getStreamerbotStatus(): StreamerbotStatus { return this.streamerbot.getStatus(); }
  getStreamerbotActions(): Promise<{ id: string; name: string }[]> { return this.streamerbot.refreshActions(); }

  // ── TikTok-Login (Chat-Senden) ────────────────────────────────────────
  /** Login-Cookies setzen/löschen (aus dem Login-Fenster). Beide nötig zum Senden. */
  setTiktokSession(sessionId: string | undefined, ttTargetIdc?: string | undefined): void {
    this.settings.update({ tiktokSessionId: sessionId ?? '', tiktokTargetIdc: ttTargetIdc ?? '' });
  }
  isTiktokLoggedIn(): boolean {
    const s = this.settings.get();
    return (s.tiktokSessionId ?? '').length > 0 && (s.tiktokTargetIdc ?? '').length > 0;
  }

  /** Aktuelle Session-Totals (falls Aktivität) in die persistente Historie kippen. */
  private flushSessionToHistory(): void {
    this.statsHistory.record(this.stats.snapshot().totals, Date.now());
  }

  /** Stream-Historie als CSV (für Tabellen/Auswertung). */
  exportStatsCsv(): string {
    const head = 'Datum;Coins;Gifts;Follower;Likes;Shares;Kommentare;Peak-Zuschauer';
    const rows = this.statsHistory.all().map((e) => {
      const d = new Date(e.at).toISOString().slice(0, 16).replace('T', ' ');
      return [d, e.coins, e.gifts, e.follows, e.likes, e.shares, e.chats, e.peakViewers].join(';');
    });
    return [head, ...rows].join('\r\n');
  }

  /** Zeitraum-Zusammenfassung (Woche/Monat/Jahr) inkl. laufender Session. */
  getStatsHistory(range: StatsRange): StatsSummary {
    const sum = this.statsHistory.summary(range, Date.now());
    // Laufende (noch nicht geflushte) Session mit einrechnen.
    const t = this.stats.snapshot().totals;
    sum.coins += t.coins; sum.gifts += t.gifts; sum.follows += t.follows;
    sum.likes += t.likes; sum.shares += t.shares; sum.chats += t.chats;
    sum.peakViewers = Math.max(sum.peakViewers, t.peakViewers);
    if (t.coins + t.gifts + t.likes + t.chats > 0) sum.sessions += 1;
    return sum;
  }

  // ── Plattform ─────────────────────────────────────────────────────────

  async connect(username: string): Promise<void> {
    this.settings.update({ lastUsername: username });
    // Der eigentliche Reset passiert beim 'connected'-Status mit freshStream
    // (gilt einheitlich für manuellen Connect UND Auto-Connect ins nächste Live).
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

  /** Kompletter Gift-Katalog (mit Bildern) für die Geschenke-Galerie. */
  getGiftCatalog(): Record<string, import('./gift-catalog').GiftEntry> {
    return this.giftCatalog.all();
  }

  /** Favorit/eigenen Namen eines Gifts setzen (Galerie) → aktualisierter Katalog. */
  setGiftMeta(slug: string, patch: { favorite?: boolean; customName?: string }): Record<string, import('./gift-catalog').GiftEntry> {
    this.giftCatalog.setMeta(slug, patch);
    return this.giftCatalog.all();
  }

  /** Komplettes Konfig-Backup (Einstellungen, Trigger, Store, Panel, Overlays,
   *  Zuschauer/Punkte) als ein JSON-Objekt. Sounds/Medien liegen als Dateien
   *  im Datenordner und sind NICHT enthalten. */
  exportConfig(): Record<string, unknown> {
    return {
      schemaVersion: 1,
      settings: this.settings.get(),
      layouts: this.layouts.list(),
      viewers: this.points.exportEntries(),
    };
  }

  /** Backup einspielen. Liefert, wie viele Overlays/Zuschauer übernommen wurden. */
  importConfig(data: unknown): { ok: boolean; layouts: number; viewers: number; error?: string } {
    if (!data || typeof data !== 'object') return { ok: false, layouts: 0, viewers: 0, error: 'Ungültige Datei' };
    const d = data as { settings?: Record<string, unknown>; layouts?: unknown[]; viewers?: unknown[] };
    try {
      if (d.settings && typeof d.settings === 'object') {
        const rest = { ...(d.settings as Record<string, unknown>) };
        delete rest.schemaVersion; // Version nicht überschreiben
        this.settings.update(rest as Parameters<typeof this.settings.update>[0]);
        this.engine.setRules(this.settings.get().triggerRules);
        this.obs.applyConfig(this.settings.get().obs); // OBS-Verbindung aus Backup übernehmen
        this.streamerbot.applyConfig(this.settings.get().streamerbot);
      }
      let layouts = 0;
      if (Array.isArray(d.layouts)) {
        for (const l of d.layouts) if (this.layouts.save(l).ok) layouts++;
      }
      let viewers = 0;
      if (Array.isArray(d.viewers)) {
        this.points.importEntries(d.viewers as Parameters<typeof this.points.importEntries>[0]);
        viewers = d.viewers.length;
      }
      this.server.rebroadcastLayouts();
      this.scheduleStatsBroadcast();
      log.info('Backup', `Konfig importiert: ${layouts} Overlays, ${viewers} Zuschauer`);
      return { ok: true, layouts, viewers };
    } catch (err) {
      return { ok: false, layouts: 0, viewers: 0, error: (err as Error).message };
    }
  }

  /** Spiel-Sieg verbuchen (vom Overlay gemeldet) → Spiel-Leaderboard. */
  private recordGameWin(user: { id: string; nickname: string; profilePic?: string }): void {
    this.points.recordWin(user);
    log.info('Spiel', `Sieg für ${user.nickname} verbucht`);
    this.scheduleStatsBroadcast();
  }

  // ── Stammgast-Begrüßung ───────────────────────────────────────────────

  /** Beim ersten Chat eines wiederkehrenden Zuschauers in dieser Session per
   *  TTS begrüßen (ab minVisits Besuchen). Punkte/Besuche sind zu diesem
   *  Zeitpunkt schon fortgeschrieben (touchStats lief im Event-Handler davor). */
  private maybeGreetReturning(event: StudioEvent): void {
    if (event.type !== 'chat' || !event.user) return;
    if (this.greetedThisSession.has(event.user.id)) return;
    this.greetedThisSession.add(event.user.id);
    const g = this.settings.get().greetReturning;
    if (!g.enabled) return;
    const visits = this.points.visitCountOf(event.user.id);
    if (visits < g.minVisits) return;
    const tts = this.settings.get().tts;
    if (!tts.enabled) return;
    const text = TTSService.sanitize(
      g.template.replace(/\{user\}/g, event.user.nickname).replace(/\{visits\}/g, String(visits)),
      tts.maxTextLen,
    );
    if (text) this.tts.speak(text, tts.voice);
  }

  getGreetReturning(): import('./settings-store').GreetReturningSettings { return this.settings.get().greetReturning; }
  setGreetReturning(patch: Partial<import('./settings-store').GreetReturningSettings>): import('./settings-store').GreetReturningSettings {
    const cur = this.settings.get().greetReturning;
    const next = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled,
      minVisits: typeof patch.minVisits === 'number' && patch.minVisits >= 2 ? Math.floor(patch.minVisits) : cur.minVisits,
      template: typeof patch.template === 'string' && patch.template.trim() ? patch.template.slice(0, 200) : cur.template,
    };
    this.settings.update({ greetReturning: next });
    return next;
  }

  // ── Giveaway / Verlosung ──────────────────────────────────────────────

  /** Beitritt via Join-Wort: dedupliziert pro Zuschauer, optional Punkte-Eintritt. */
  private maybeJoinGiveaway(event: StudioEvent): void {
    const gw = this.settings.get().giveaway;
    if (!gw.enabled || event.type !== 'chat' || !event.user || !event.text) return;
    const norm = (s: string) => s.trim().toLowerCase().replace(/^!+/, '');
    if (norm(event.text) !== norm(gw.joinWord)) return;
    if (this.giveawayParticipants.has(event.user.id)) return; // schon dabei
    if (gw.entryCost > 0) {
      if (!this.points.spend(event.user.id, gw.entryCost)) return; // nicht genug Punkte
      this.scheduleStatsBroadcast();
    }
    this.giveawayParticipants.set(event.user.id, { nickname: event.user.nickname, avatar: event.user.profilePic });
  }

  giveawayState(): { enabled: boolean; joinWord: string; entryCost: number; count: number; lastWinner: string } {
    const gw = this.settings.get().giveaway;
    return { enabled: gw.enabled, joinWord: gw.joinWord, entryCost: gw.entryCost, count: this.giveawayParticipants.size, lastWinner: this.lastGiveawayWinner };
  }

  setGiveawayConfig(patch: Partial<GiveawaySettings>): GiveawaySettings {
    const cur = this.settings.get().giveaway;
    const next: GiveawaySettings = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled,
      joinWord: typeof patch.joinWord === 'string' && patch.joinWord.trim() ? patch.joinWord.trim().slice(0, 30) : cur.joinWord,
      entryCost: typeof patch.entryCost === 'number' && patch.entryCost >= 0 ? Math.floor(patch.entryCost) : cur.entryCost,
    };
    this.settings.update({ giveaway: next });
    return next;
  }

  /** Gewinner ziehen: zufällig aus den Teilnehmern, Widget animiert die Ziehung. */
  drawGiveaway(): { ok: boolean; winner?: string } {
    const list = [...this.giveawayParticipants.values()];
    if (list.length === 0) return { ok: false };
    const winner = list[Math.floor(Math.random() * list.length)]!;
    this.lastGiveawayWinner = winner.nickname;
    this.server.broadcast({ kind: 'action', ruleId: 'giveaway', action: { kind: 'giveaway_draw', params: { winner, names: list.map((p) => p.nickname) } } });
    return { ok: true, winner: winner.nickname };
  }

  resetGiveaway(): void {
    this.giveawayParticipants.clear();
    this.lastGiveawayWinner = '';
    this.server.broadcast({ kind: 'action', ruleId: 'giveaway', action: { kind: 'giveaway_reset' } });
  }

  // ── Chat-Befehle (Bot) ────────────────────────────────────────────────

  getChatCommands(): ChatCommand[] { return this.settings.get().chatCommands ?? []; }
  setChatCommands(commands: ChatCommand[]): void { this.settings.update({ chatCommands: commands }); }

  /** Chat-Nachricht gegen die Befehle prüfen → Antwort (Overlay/TTS/Chat). */
  private maybeRunCommand(event: StudioEvent): void {
    const cmds = this.getChatCommands();
    if (!cmds.length || !event.text) return;
    const cmd = matchChatCommand(cmds, event.text);
    if (!cmd) return;
    if (!commandGroupOk(cmd.who ?? 'all', event, event.user ? this.points.isVip(event.user.id) : false)) return;
    const now = event.ts;
    if (cmd.cooldownMs) {
      const last = this.commandCooldowns.get(cmd.id) ?? 0;
      if (now - last < cmd.cooldownMs) return; // noch im Cooldown
    }
    this.commandCooldowns.set(cmd.id, now);

    const text = renderSpeakTemplate(cmd.response, event);
    if (cmd.speak) this.speakForEvent(cmd.response, event);
    if (cmd.sendToChat) void this.sendChat(text);
    log.info('Befehl', `${cmd.command} von ${event.user?.nickname ?? '?'}`);
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

  /** Nachricht in den TikTok-Live-Chat senden (rate-limited gegen TikTok-Drossel). */
  async sendChat(text: string): Promise<{ ok: boolean; error?: string }> {
    const now = Date.now();
    if (now - this.lastChatSendAt < CHAT_SEND_MIN_INTERVAL_MS) {
      return { ok: false, error: `Bitte langsamer — max. 1 Nachricht alle ${CHAT_SEND_MIN_INTERVAL_MS / 1000}s (TikTok drosselt).` };
    }
    const res = await this.adapter.sendChat(text);
    if (res.ok) this.lastChatSendAt = now;
    else log.warn('Chat-Senden', res.error ?? 'fehlgeschlagen');
    return res;
  }

  /** Panel-Knopf per ID auslösen (z.B. vom Stream-Deck-Plugin). true = gefunden. */
  firePanelById(id: string): boolean {
    const btn = this.getPanelButtons().find((b) => b.id === id);
    if (!btn) return false;
    this.fireManual(btn.action);
    return true;
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
  setViewerWelcomeMedia(userId: string, mediaId: string | undefined) { this.points.setWelcomeMedia(userId, mediaId); }

  /** Session-Reset: Stats/Zähler/Widget-Inhalte auf null — räumt z.B.
   *  Test-Events weg. Loyalty-PUNKTE bleiben (das ist resetPoints). */
  resetSession(): void {
    this.stats.reset();
    this.engine.resetCooldowns();
    this.redemptionCooldowns.clear();
    this.commandCooldowns.clear();
    this.giveawayParticipants.clear();
    this.lastGiveawayWinner = '';
    this.greetedThisSession.clear();
    this.bus.clearLastValues();
    // Reset-Signal an die Overlay-Widgets: setzt auch persistente Zähler zurück
    // (counter/gift-counter via localStorage) — ein reines Re-Mount täte das nicht.
    this.server.broadcast({ kind: 'reset' });
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
    // Chat-Moderation: gesperrte Wörter nicht vorlesen.
    if (containsBlockedWord(raw, this.settings.get().moderation?.blockedWords ?? [])) return;

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

  /** Renderer meldet, dass ein Audio fertig ist → TTS-Sequencing freigeben. */
  notifySoundEnded(soundId: string): void {
    this.tts.notifyEnded(soundId);
  }

  /** Persönliches Begrüßungs-Medium eines Zuschauers (bei Teamherz) abspielen. */
  private maybePlayWelcomeMedia(user: { id: string }): void {
    const mediaId = this.points.welcomeMediaFor(user.id);
    if (!mediaId) return;
    const entry = this.media.list().find((m) => m.id === mediaId);
    if (!entry) return;
    // Erstes Trigger-Medium-Widget im aktiven Layout als Bühne nutzen.
    const layout = this.getActiveLayout();
    const layer = layout?.layers.find(
      (l) => l.widgetType === 'media' && l.visible && (l.props?.mode ?? 'trigger') !== 'static',
    );
    if (!layer) return;
    const action = {
      kind: 'play_media' as const,
      targetId: layer.id,
      params: { mediaUrl: this.mediaUrl(mediaId), kind: entry.kind },
    };
    this.server.broadcast({ kind: 'action', ruleId: 'welcome-media', action });
    log.info('Begrüßung', `Begrüßungs-Medium für Zuschauer ${user.id} abgespielt`);
  }

  /** Gift-Liste der Lib (untypisiert/variabel) defensiv in den Katalog laden. */
  private importAvailableGifts(gifts: unknown): void {
    const list: unknown[] = Array.isArray(gifts)
      ? gifts
      : typeof gifts === 'object' && gifts !== null
        ? Object.values(gifts as Record<string, unknown>).filter((v) => typeof v === 'object')
        : [];
    let imported = 0;
    const roomSlugs: string[] = [];
    for (const raw of list) {
      const g = raw as { name?: string; describe?: string; diamondCount?: number; diamond_count?: number; image?: { url_list?: string[]; urlList?: string[] }; icon?: { url_list?: string[]; urlList?: string[] } };
      const name = g.name || g.describe;
      if (!name) continue;
      const img = g.image ?? g.icon;
      const icon = img?.url_list?.[0] ?? img?.urlList?.[0];
      this.giftCatalog.record({ slug: name, icon, coinsPerUnit: g.diamondCount ?? g.diamond_count ?? 0, count: 0 });
      roomSlugs.push(name);
      imported++;
    }
    // „Letztes Live"-Ansicht der Galerie: genau diese Gifts markieren.
    if (roomSlugs.length) this.giftCatalog.markLastRoom(roomSlugs);
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

  /** Basis-URL + Token für externe Steuerung (Stream-Deck-Plugin, Web-Requests). */
  getControlInfo(): { url: string; token: string } {
    return { url: `http://127.0.0.1:${this.server.getPort()}`, token: this.server.getToken() };
  }

  /** Persistenten Steuer-Token aus den Settings holen — oder einmalig erzeugen. */
  private getOrCreateControlToken(): string {
    const existing = this.settings.get().controlToken;
    if (existing && existing.length >= 16) return existing;
    const token = crypto.randomBytes(32).toString('hex');
    this.settings.update({ controlToken: token });
    return token;
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
