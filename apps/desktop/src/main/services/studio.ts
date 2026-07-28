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
import { SessionRoles } from '../core/session-roles';
import { shouldAnnounceGift } from './tts-announce';
import { TikTokAdapter, createDirectConnection, type AdapterStatusInfo } from '../adapters/tiktok-adapter';
import { EulerCloudConnection } from '../adapters/tiktok-cloud';
import { OverlayServer } from '../adapters/overlay-server';
import {
  SettingsStore,
  redactSecretsForExport,
  stripSecretFieldsForImport,
  sanitizeSettingsPatch,
  type GiveawaySettings,
} from './settings-store';
import type { SoundCategory } from '../../shared/mixer';
import { OVERLAY_PORT } from '../../shared/constants';
import { mergeMitMasterAlsMap, masterIcon, type KatalogEintrag } from '../../shared/gift-master';
import { giftDisplayName } from '../../shared/gift-names-de';
import { parseApiAction, API_ACTION_KINDS } from './api-actions';
import { LayoutStore } from './layout-store';
import { SoundLibrary } from './sound-library';
import { MediaLibrary } from './media-library';
import { shouldReadChat, containsBlockedWord } from './tts-filter';
import { collectGiftSounds, findWheelSounds } from './widget-sounds';
import { planWheelSpins } from './wheel-gift';
import { planSlotSpins } from './slot-gift';
import { matchingLuckyLayers, matchLuckyCommand, planLuckyDraws, type LuckyLayer } from './lucky-draw';
import { PointsStore } from './points-store';
import { GiftCatalog } from './gift-catalog';
import { ProfileStore, type ProfileMeta } from './profile-store';
import { decryptTfc } from './tikfinity-decrypt';
import { mapTikfinity, collectSoundUrls, mapWidgets } from './tikfinity-map';
import { downloadMyInstants, isAllowedImportSound } from './myinstants';
import { didLevelUp, levelForWins, masteryMoment } from './game-mastery';
import { ViewerCardService, type ViewerInfo } from './viewer-card';
import { GameService, type GameKind } from './game-service';
import { pickQuestions, QUIZ_THEMES } from './games/quiz-questions';
import { BossService, bossKillMoment } from './boss';
import { validateTriggerRules, validateChatCommands, validateRedemptions, validatePanelButtons } from './validators';
import { SpotifyService, type NowPlaying } from './spotify-service';
import { StatsHistory, type StatsRange, type StatsSummary } from './stats-history';
import { SportService } from './sport-service';
import type { SportProvider } from './sport-normalize';
import { ObsService, type ObsStatus } from './obs-service';
import { StreamerbotService, type StreamerbotStatus } from './streamerbot-service';
import { TTSService } from './tts-service';
import { resolveTuning } from './tts-tuning';
import { log } from '../core/logger';

export interface SoundCommand {
  soundId: string;
  url: string;
  volume: number;
  /** Mixer-Kategorie — steuert Kanal-Lautstärke/Mute/Gerät im SoundPlayer. */
  category?: SoundCategory;
}

/** Eine Zeile im Trigger-Live-Protokoll. */
export interface TriggerLogEntry {
  id: string;
  at: number;
  /** Name der Regel (oder „Manuell/Test", „Einlösung …"). */
  rule: string;
  /** Was passiert ist — lesbares Aktions-Label (z.B. „Sound", „Alert"). */
  action: string;
  /** Warum — Auslöser-Zusammenfassung (z.B. „Gift Rose ×5 von Mia"). */
  reason: string;
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
  /** Live-Protokoll: ein Trigger hat gefeuert (für die Live-Seite). */
  onTriggerLog?: (entry: TriggerLogEntry) => void;
  /** OBS-Verbindungsstatus → Settings-UI. */
  onObsStatus?: (status: ObsStatus) => void;
  /** Streamer.bot-Verbindungsstatus → Settings-UI. */
  onStreamerbotStatus?: (status: StreamerbotStatus) => void;
  /** Spotify Now-Playing → an den Renderer (Steuerleiste/Status). */
  onSpotifyState?: (np: NowPlaying | null) => void;
}

export interface StudioPaths {
  userDataDir: string;
  runtimeDir: string;
  widgetDir: string;
  /** App-Version → an die Overlay-Runtime, die bei Wechsel automatisch neu lädt. */
  appVersion?: string;
}

const STATS_BROADCAST_MIN_MS = 250;

/** Lesbare Labels der Aktions-Typen fürs Trigger-Live-Protokoll. */
const ACTION_LABELS: Record<string, string> = {
  play_sound: 'Sound',
  fire_alert: 'Alert',
  show_layer: 'Layer zeigen',
  hide_layer: 'Layer verstecken',
  speak: 'TTS-Ansage',
  spin_wheel: 'Glücksrad',
  spin_slot: 'Spielautomat',
  lucky_draw: 'Karten-Ziehung (Geschenke-Slider)',
  play_media: 'Media',
  counter_add: 'Zähler',
  obs_scene: 'OBS-Szene',
  obs_visibility: 'OBS-Quelle',
  send_chat: 'Chat senden',
  streamerbot_action: 'Streamer.bot',
  spotify_control: 'Spotify',
  spotify_request: 'Song-Request',
  start_gift_challenge: 'Challenge (Geschenke-Slider)',
  giveaway_draw: 'Verlosung ziehen',
  giveaway_reset: 'Verlosung reset',
};
/** Mindestabstand zwischen zwei Chat-Sendungen — TikTok drosselt stark (~1/30s). */
const CHAT_SEND_MIN_INTERVAL_MS = 30_000;

/** Rechte-Prüfung für Chat-Befehle (App-VIPs immer erlaubt). */
function commandGroupOk(who: string, event: StudioEvent, isVip: boolean): boolean {
  if (who === 'all' || isVip) return true;
  const u = event.user;
  if (who === 'followers') return !!(u?.isFollower || u?.isSub || u?.isMod);
  if (who === 'subs') return !!(u?.isSub || u?.isMod);
  if (who === 'mods') return !!u?.isMod;
  return false; // unbekannte/ungültige Gruppe → sicher verweigern (kein Bypass)
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
  readonly profiles: ProfileStore;
  readonly spotify: SpotifyService;
  /** Letzter Now-Playing-Stand (für Late-Joiner + Renderer). */
  private lastSpotify: NowPlaying | null = null;
  readonly statsHistory: StatsHistory;
  readonly sport: SportService;
  readonly obs: ObsService;
  readonly streamerbot: StreamerbotService;
  private stats: SessionStats;
  /** Persistenz der laufenden Session-Stats (überlebt App-Update/Neustart). */
  private statsFile = '';
  private statsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** true, wenn beim Start eine laufende Session aus der Datei wiederhergestellt
   *  wurde → der ERSTE Connect danach ist eine Fortsetzung (App-Update mitten im
   *  Stream), kein neuer Stream → NICHT resetten. */
  private restoredStatsValid = false;

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
  private lastSpotifyRequestAt = 0;
  /** Giveaway-Teilnehmer (userId → Anzeige) — dedupliziert, neuer Stream leert. */
  private giveawayParticipants = new Map<string, { nickname: string; avatar?: string }>();
  private lastGiveawayWinner = '';
  private triggerLogSeq = 0;
  /** Wer in DIESER Session schon (erstmals) geschrieben hat — für Stammgast-Begrüßung. */
  private greetedThisSession = new Set<string>();
  private momentShownSession = new Set<string>();
  private readonly viewerCard = new ViewerCardService();
  private readonly games: GameService;
  private readonly boss = new BossService();
  private bossActive = false;
  private lastPlatformStatus: { status: string; detail?: string; at: number } = { status: 'disconnected', at: 0 };
  /** Voller letzter Status (P1-3) — separat von lastPlatformStatus (das ist die
   *  abgespeckte Diagnose-Projektion), damit getPlatformStatus() dem Renderer
   *  GENAU dasselbe Objekt liefern kann, das sonst per PLATFORM_STATUS gepusht
   *  wird. Wird per IPC-Pull abgeholt (useStudio.ts beim Mount), falls der
   *  Push (z.B. Auto-Live-Watch beim App-Start, VOR dem Fenster) verpasst wurde. */
  private lastPlatformStatusInfo: AdapterStatusInfo = { status: 'disconnected', isReconnect: false };
  /** Rollen-Gedächtnis (Mod/Teamherz/Follower) pro Stream — einmal erkannt =
   *  für die Session gemerkt, da TikTok Rollen nicht in jeder Nachricht liefert. */
  private sessionRoles = new SessionRoles();
  /** Diagnose-Logging: Rollen-Erkennung 1× pro User/Rolle loggen (kein Spam). */
  private loggedRoleUsers = new Set<string>();
  private loggedFollowerOnce = false;
  /** Drossel für TTS-Entscheidungs-Logs (vorgelesen/übersprungen). */
  private lastTtsDecisionLogAt = 0;
  /** soundId → letzter Gift-Sound (Gift-Sound-Bremse, settings.giftSoundGapSec). */
  private giftSoundLastAt = new Map<string, number>();
  /** Watch-Time-Tick (1×/Minute solange verbunden): Zuschauzeit-Punkte. */
  private watchTimeTimer: ReturnType<typeof setInterval> | null = null;
  /** Periodische Stream-Eckdaten ins Log. */
  private statsLogTimer: ReturnType<typeof setInterval> | null = null;
  /** redemptionId → event.ts der letzten Einlösung (globaler Cooldown). */
  private redemptionCooldowns = new Map<string, number>();
  private commandCooldowns = new Map<string, number>();
  /** layerId → event.ts der letzten per Chat-Befehl ausgelösten Lucky-Ziehung
   *  (Stück 4, Task 3) — verhindert Spam-Überlagerung, s. maybeLuckyDrawByCommand(). */
  private luckyDrawCooldowns = new Map<string, number>();

  constructor(paths: StudioPaths, hooks: StudioHooks) {
    this.hooks = hooks;
    this.settings = new SettingsStore(paths.userDataDir);
    this.layouts = new LayoutStore(paths.userDataDir);
    this.sounds = new SoundLibrary(paths.userDataDir);
    this.seedBundledSounds(paths.widgetDir);
    this.media = new MediaLibrary(paths.userDataDir);
    this.points = new PointsStore(paths.userDataDir);
    this.giftCatalog = new GiftCatalog(paths.userDataDir);
    this.profiles = new ProfileStore(paths.userDataDir);
    this.statsHistory = new StatsHistory(paths.userDataDir);
    // Laufende Session-Stats wiederherstellen (z.B. nach Update-Neustart), damit
    // Follower-Zahl + Gift-Summen im Overlay nicht auf 0 zurückfallen.
    this.statsFile = path.join(paths.userDataDir, 'session-stats.json');
    this.stats = this.restoreSessionStats();
    this.sport = new SportService(() => this.settings.get().sportApiKey ?? '');
    this.obs = new ObsService((status) => this.hooks.onObsStatus?.(status));
    this.streamerbot = new StreamerbotService((status) => this.hooks.onStreamerbotStatus?.(status));
    this.tts = new TTSService(
      paths.userDataDir,
      (playback) => {
        const tts = this.settings.get().tts;
        const url = `http://127.0.0.1:${this.server.getPort()}/tts/${playback.fileId}?token=${this.server.getToken()}`;
        this.hooks.onSoundPlay({ soundId: playback.fileId, url, volume: tts.volume, category: 'tts' });
      },
      () => this.settings.get().ttsCredentials,
      (message) => this.hooks.onToast?.({ type: 'error', message }),
      (provider) => resolveTuning(provider, this.settings.peek().tts.tuning?.[provider]),
    );

    this.server = new OverlayServer(this.bus, {
      // Vorher hartcodiertes Literal, unabhängig von OVERLAY_PORT
      // (shared/constants.ts) — das Overlay-Health-Banner im Renderer prüfte
      // gegen die Konstante, während der ECHTE Server-Start am Literal hing.
      // Beide identisch, aber strukturell entkoppelt: eine künftige
      // Port-Änderung in constants.ts hätte den Server NICHT mitgezogen.
      port: OVERLAY_PORT,
      token: this.getOrCreateControlToken(),
      appVersion: paths.appVersion,
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
      onClientCountChange: () => this.refreshSpotifyPolling(),
      onWidgetSound: (soundId) => this.playSound(soundId, undefined, 'game'),
      onGameWin: (_winId, user) => this.recordGameWin(user),
      giftImagesDir: this.giftCatalog.getImagesDir(),
      getGiftCatalog: () => this.getGiftCatalog(),
      getTriggerRules: () => this.getRulesForOverlay(),
      onSpotifyCallback: (code, state) => this.onSpotifyCallback(code, state),
      getSpotifyState: () => this.lastSpotify,
      // P3c-Audit: laufendes Chat-Spiel + Boss-Kampf für Overlay-Reconnects
      // (Late-Joiner UND App-Update-Reload während des Streams) — siehe
      // Kommentar an der Rehydrierungsstelle in overlay-server.ts.
      getGameState: () => this.games.getState(),
      getBossState: () => this.getBossState(),
      getSportMatches: (provider, competition) => this.sport.getMatches(provider as SportProvider, competition),
      getSportStandings: (provider, competition) => this.sport.getStandings(provider as SportProvider, competition),
      listPanelButtons: () => this.getPanelButtons().map((b) => ({ id: b.id, label: b.label })),
      firePanelButton: (id) => this.firePanelById(id),
      getApiStatus: () => this.getApiStatus(),
      runApiAction: (action) => this.runApiAction(action),
    });
    this.games = new GameService((msg) => this.server.broadcast(msg), (user) => this.recordGameWin(user));

    this.adapter = new TikTokAdapter(this.bus, {
      // TikFinity-Verhalten: nach Stream-Ende auf das nächste Live warten und
      // automatisch wieder verbinden. An das autoLiveWatch-Setting gekoppelt.
      autoConnect: this.settings.get().autoLiveWatch !== false,
      // Live-Check BILLIG halten (HTML-Scrape via tiktok-live-connector, ohne
      // Sign-Key/Kontingent) — wichtig fürs dauerhafte „warte auf Live"-Pollen,
      // damit nicht jeder Tick eine Cloud-WS-Verbindung verbrennt.
      checkLive: (username) => this.checkLiveCheap(username),
      // Verbindungsweg wählen: Standard ist Eulers gratis Cloud-WebSocket
      // (funktioniert mit dem kostenlosen Community-Key). Nur wenn der User
      // bewusst auf 'direct' stellt (Business-Key + Chat-Senden), geht's über
      // tiktok-live-connector. Ohne Key bleibt nur der Direkt-Weg übrig.
      factory: (username, auth) => {
        const mode = this.settings.get().tiktokConnectMode ?? 'cloud';
        if (mode === 'cloud' && auth.signApiKey) {
          return new EulerCloudConnection(username, { apiKey: auth.signApiKey });
        }
        return createDirectConnection(username, auth);
      },
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
        // Watch-Time: Tick läuft nur, solange verbunden.
        if (info.status === 'connected' && !this.watchTimeTimer) {
          this.watchTimeTimer = setInterval(() => {
            const cfg = this.settings.peek().points;
            const n = this.points.awardWatchTime(cfg, Date.now());
            if (n > 0) this.scheduleStatsBroadcast();
          }, 60_000);
        } else if (info.status !== 'connected' && this.watchTimeTimer) {
          clearInterval(this.watchTimeTimer);
          this.watchTimeTimer = null;
        }
        if (info.status === 'connected' && info.freshStream) {
          if (this.restoredStatsValid) {
            // App wurde mitten in der Session neugestartet (Update) → fortsetzen,
            // NICHT resetten (sonst wären die wiederhergestellten Stats sofort weg).
            this.restoredStatsValid = false;
          } else {
            this.flushSessionToHistory();
            this.resetSession();
          }
        }
        // „Letztes Live"-Gift-Markierung an der ROOM-ID festmachen (robust): jeder
        // Live ist ein neuer Raum. Wechselt die Room-ID gegenüber dem persistierten
        // Wert, ist es ein neuer Stream → Markierung leeren. So sammelt sich die
        // Galerie NICHT über Streams an, auch wenn freshStream mal nicht feuert
        // (App blieb offen, neuer Stream zählte als Reconnect). Gleiche Room-ID
        // nach Neustart → kein Reset (Fortsetzung).
        if (info.status === 'connected' && info.roomId && info.roomId !== this.settings.peek().lastLiveRoomId) {
          this.giftCatalog.resetLastRoom();
          this.settings.update({ lastLiveRoomId: info.roomId });
        }
        if (info.status === 'connected') {
          const mode = this.settings.get().tiktokConnectMode ?? 'cloud';
          log.info('TikTok', `Verbindungsmodus: ${mode === 'cloud' ? 'Cloud (Euler)' : 'Direkt'}`);
        }
        this.lastPlatformStatus = { status: info.status, detail: info.detail, at: Date.now() };
        this.lastPlatformStatusInfo = info;
        this.hooks.onStatus(info);
        if (info.status === 'error') {
          this.hooks.onToast?.({ type: 'error', message: `Verbindung fehlgeschlagen${info.detail ? `: ${info.detail}` : ''}` });
        }
      },
    });

    this.spotify = new SpotifyService({
      getClientId: () => this.settings.get().spotifyClientId || '',
      getTokens: () => this.settings.get().spotifyTokens,
      saveTokens: (t) => this.settings.update({ spotifyTokens: t }),
      redirectUri: () => `http://127.0.0.1:${this.server.getPort()}/spotify/callback`,
      onState: (np) => {
        this.lastSpotify = np;
        this.server.broadcast({ kind: 'spotify', state: np });
        this.hooks.onSpotifyState?.(np);
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

      // 0a. Fehlendes Geschenk-Bild ergänzen — MUSS hier ganz oben stehen, vor
      // jedem Verbraucher (Katalog, Widgets, Overlay-Broadcast).
      //
      // Zehn Widgets (Coin-Glas, Feuerwerk, Kanone, Alert, Feed …) zeigen das
      // Bild AUS DEM EREIGNIS und holen keinen Katalog. Liefert TikTok im
      // Ereignis kein Bild — was vorkommt, je nach Verbindungsart und Gift —,
      // zeigten sie einen faden Platzhalter, obwohl die App das Bild längst
      // kennt. Einmal hier nachschlagen versorgt alle zehn auf einen Schlag.
      if (e.type === 'gift' && e.gift) {
        if (!e.gift.icon) {
          const bild = this.giftBildFuer(e.gift.slug, e.gift.giftId);
          if (bild) e.gift.icon = bild;
        }
        // 0b. Anzeigename für die Widgets — nur wenn der Nutzer es will
        // (Einstellung „Geschenknamen im Overlay"). Der Originalname bleibt in
        // `slug` und bleibt die Grundlage JEDER Zuordnung; hier kommt bloß ein
        // zweites Feld für die Anzeige dazu.
        if (this.settings.peek().giftNameLang === 'de') {
          const eigen = this.giftCatalog.all()[e.gift.slug.trim().toLowerCase()]?.customName;
          const anzeige = giftDisplayName(e.gift.slug, 'de', eigen);
          if (anzeige && anzeige !== e.gift.slug) e.gift.displayName = anzeige;
        }
      }

      // 0b. Rollen-Gedächtnis: Live-Follow macht zum Follower; erkannte Rollen
      // (Mod/Teamherz/Follower) für die Session merken UND anwenden — TikTok
      // liefert sie nicht in jeder Nachricht, sonst flackert das Vorlesen.
      // VOR allen Konsumenten (Stats, Trigger, TTS-Filter).
      if (e.type === 'follow' && e.user) {
        e.user.isFollower = true;
        // Erst-Follow vs. Re-Follow: nur ECHTE Events verändern den Store; Test-/
        // Replay-Events gelten als „erstes Mal", ohne das echte Gedächtnis zu verbrauchen.
        e.firstFollow = e.synthetic ? true : this.points.markFollowed(e.user.id, e.user.nickname);
      }
      if (e.user) {
        this.sessionRoles.remember(e.user);
        this.sessionRoles.apply(e.user);
        this.logRoleDetection(e.user);
      }

      // 1. Aufnahme (falls aktiv) — Test-/Replay-Events NICHT mitschneiden.
      if (!e.synthetic) this.recorder?.record(e);

      // 2. Loyalty-Punkte (persistent über Streams) + Session-Statistik.
      //    Test-/Replay-Events (synthetic) dürfen die echte Punkte-DB NICHT
      //    verändern (sonst kriegen echte User-IDs beim Testen Punkte gutgeschrieben).
      if (!e.synthetic) this.points.recordEvent(e, this.settings.peek().points);
      if (this.stats.apply(e)) { this.scheduleStatsBroadcast(); this.scheduleStatsSave(); }

      // 3. Trigger-Engine: Regeln auswerten, Aktionen ausführen (mit Sequenz-Delay)
      // Dabei merken, ob eine Regel für DIESES Ereignis schon vorliest — sonst
      // sagt die automatische Gift-Ansage weiter unten dasselbe ein zweites Mal
      // an (bei einem Nutzer real: Trigger „…" → TTS-Ansage UND Gift-Ansage).
      let regelLiestVor = false;
      for (const match of this.engine.evaluate(e)) {
        if (match.action.kind === 'speak') regelLiestVor = true;
        this.dispatchAction(match.ruleId, match.action, e);
      }

      // 3b. Chat: Befehle (Bot) + Punkte-Einlösungen + Vorlesen (TikFinity-Style)
      if (e.type === 'chat') {
        this.maybeGreetReturning(e);
        this.maybeViewerMoment(e);
        this.games.handleChat(e);
        this.maybeJoinGiveaway(e);
        this.maybeRunCommand(e);
        this.maybeLuckyDrawByCommand(e);
        this.maybeRedeem(e);
        this.maybeReadChat(e);
      }

      // 3b2. Teamherz (Sub): persönliches Begrüßungs-Medium des Zuschauers spielen.
      if (e.type === 'sub' && e.user) this.maybePlayWelcomeMedia(e.user);

      // 3b3. Event-Ansagen per TTS (unabhängig vom Chat-Vorlesen).
      if (e.type === 'follow') this.maybeAnnounceFollow(e, regelLiestVor);

      // 3c. Widget-Sounds: Feuerwerk-Knall / Alert-Sound direkt am Widget
      // konfiguriert — gespielt LOKAL über die App (nie im Overlay).
      if (e.type === 'gift' && e.gift) {
        // Stream-Boss: Gift-Coins = Schaden (wenn Boss-Modus aktiv).
        if (this.bossActive && e.user) this.damageBoss({ id: e.user.id, nickname: e.user.nickname }, e.gift.totalCoins);
        // Jedes Gift ins Log — so ist nachvollziehbar, welcher Gift-„slug" (Name)
        // wirklich ankommt und mit welcher Anzahl. Wichtig fürs Debuggen von
        // Gift-Zähler-/Trigger-Widgets (matchen exakt auf diesen slug).
        // „⚠ ohne Namen" = nur giftId kam an → Zähler/Trigger per Name greifen nicht.
        log.info('Gift', `${e.gift.slug} ×${e.gift.count}${e.gift.giftId != null ? ` (id ${e.gift.giftId})` : ''} · ${e.gift.totalCoins}💎 von ${e.user?.nickname ?? '—'}${e.gift.slug === 'gift' ? ' [⚠ ohne Namen]' : ''}`);
        // Gift-Katalog: Bild + Coins jedes Gifts dauerhaft merken (Bingo/Galerie).
        // Erstsender wird im Katalog verewigt (count>0 + Sender). Test-/Replay-
        // Gifts (synthetic) NICHT dauerhaft in den Katalog schreiben.
        if (!e.synthetic) this.giftCatalog.record({
          slug: e.gift.slug,
          giftId: e.gift.giftId,
          icon: e.gift.icon,
          coinsPerUnit: e.gift.coinsPerUnit,
          count: e.gift.count,
          sender: e.user ? { id: e.user.id, nickname: e.user.nickname } : undefined,
        });
        for (const soundId of collectGiftSounds(this.layouts.list(), e.gift.totalCoins)) {
          // Gift-Sound-Bremse: bei „Rosen-Regen" nicht 50× denselben Sound feuern.
          const gapMs = (this.settings.peek().giftSoundGapSec ?? 0) * 1000;
          const last = this.giftSoundLastAt.get(soundId) ?? 0;
          if (gapMs > 0 && e.ts - last < gapMs) continue;
          this.giftSoundLastAt.set(soundId, e.ts);
          this.playSound(soundId, undefined, 'alert');
        }
        // Rad-Bindung „Bei welchem Geschenk drehen?": passendes Rad-Widget
        // (spinGift-Prop) automatisch drehen — serverseitig, keine Regel nötig.
        // planWheelSpins() (wheel-gift.ts) entscheidet ALLES (auch Auto-Feuern,
        // Task 3) rein/testbar; hier wird nur noch gefeuert, was geplant wurde.
        const layers = this.layouts.list().flatMap((layout) => layout.layers);
        for (const { ruleId, action } of planWheelSpins(layers, e.gift.slug, this.getRules())) {
          this.dispatchAction(ruleId, action, e);
        }
        // Automat-Bindung „Bei welchem Geschenk drehen?": passendes
        // slot-machine-Widget (spinGift-Prop, nur source:'trigger' — Parität
        // s. matchingSlotLayers) dreht — Gewinn/Niete + Gewinner-Symbol
        // würfelt der SERVER zentral (planSlotOutcome), damit alle Overlay-
        // Quellen (OBS + TTLS) dasselbe Ergebnis zeigen. planSlotSpins()
        // (slot-gift.ts) entscheidet ALLES (auch das Auslösen der gewonnenen
        // Gift-Aktion, Task 3) rein/testbar; hier wird nur noch gefeuert, was
        // geplant wurde — pro Automat genau 1 Spin, bei Gewinn genau 1 Satz
        // Aktionen (verzögert um spinMs) UND (Stück 3, Teil C) je 1
        // start_gift_challenge pro sichtbarem Geschenke-Slider — der Slider
        // startet damit die Challenge des Gewinner-Geschenks, exakt als wäre
        // es gesendet worden (ohne Coin-/Zähler-Nebenwirkung, s. slot-gift.ts).
        for (const { ruleId, action } of planSlotSpins(layers, e.gift.slug, this.getRules(), Math.random, e.user?.nickname)) {
          this.dispatchAction(ruleId, action, e);
        }
        // Lucky-Card-Bindung „Bei welchem Geschenk ziehen?" (Stück 4, Task 2):
        // passender Geschenke-Slider (gift-menu, luckyMode+luckyGift-Prop)
        // shuffelt seine Karten durch — Gewinn/Niete + Gewinner-Karte würfelt
        // der SERVER zentral (planSlotOutcome, wiederverwendet aus
        // slot-gift.ts), damit alle Overlay-Quellen dasselbe Ergebnis zeigen.
        // planLuckyDraws() (lucky-draw.ts) entscheidet ALLES (auch das
        // Auslösen der gewonnenen Gift-Aktion bei source:'trigger') rein/
        // testbar; hier wird nur noch gefeuert, was geplant wurde — pro
        // Slider genau 1 Draw, bei Gewinn höchstens 1 Satz Aktionen
        // (verzögert um luckyDrawMs). Die Layer-Auswahl passiert HIER per
        // matchingLuckyLayers() — planLuckyDraws() selbst kennt den Auslöser
        // nicht mehr (siehe maybeLuckyDrawByCommand() für den zweiten
        // Auslöser per Chat-Befehl, Task 3, derselbe Dispatch-Pfad).
        for (const { ruleId, action } of planLuckyDraws(matchingLuckyLayers(layers, e.gift.slug), this.getRules(), Math.random, e.user?.nickname)) {
          this.dispatchAction(ruleId, action, e);
        }
        // TTS-Ansage ab Coin-Schwelle — aber nur, wenn nicht ohnehin schon eine
        // Trigger-Regel für dieses Geschenk vorliest (sonst doppelt).
        this.maybeAnnounceGift(e, regelLiestVor);
      }

      // 4. Live-Feed an die App-Shell
      this.hooks.onBusEvent(e);
    });
  }

  /** Aktion einplanen — mit Verzögerung (Combo-Sequenz) oder sofort. */
  private dispatchAction(ruleId: string, action: import('@botexe/trigger-engine').TriggerAction, event: StudioEvent): void {
    // P2-2-Audit: defensiv, auch wenn die Boundary (IPC/Backup) inzwischen
    // validiert — eine einzelne malformte Aktion (z.B. `null` aus einer alten,
    // schon-auf-Disk liegenden settings.json) darf NIE den ganzen synchronen
    // Event-Handler (wireBus) per TypeError abreißen und damit nachfolgende
    // Schritte (Chat-Befehle, TTS, Stats...) für dieses Ereignis verschlucken.
    if (!action || typeof action !== 'object' || typeof (action as { kind?: unknown }).kind !== 'string') {
      log.warn('Trigger', `„${this.ruleLabel(ruleId)}": ungültige Aktion übersprungen (kein kind)`);
      return;
    }
    this.logTrigger(ruleId, action, event);
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

  /** Eine gefeuerte Aktion ins Live-Protokoll schreiben (Live-Seite). */
  private logTrigger(ruleId: string, action: import('@botexe/trigger-engine').TriggerAction, event: StudioEvent): void {
    // Auch ins Datei-Log — so ist bei einer späteren Diagnose sichtbar, ob und
    // welche Trigger live gefeuert haben (nicht nur in der UI-Karte).
    log.info('Trigger', `„${this.ruleLabel(ruleId)}" → ${ACTION_LABELS[action.kind] ?? action.kind} (${this.eventReason(event)})`);
    if (!this.hooks.onTriggerLog) return;
    this.hooks.onTriggerLog({
      id: `tl-${Date.now().toString(36)}-${this.triggerLogSeq++}`,
      at: Date.now(),
      rule: this.ruleLabel(ruleId),
      action: ACTION_LABELS[action.kind] ?? action.kind,
      reason: this.eventReason(event),
    });
  }

  private ruleLabel(ruleId: string): string {
    if (ruleId === 'manual') return 'Manuell / Test';
    if (ruleId === 'giveaway') return 'Verlosung';
    if (ruleId === 'welcome-media') return 'Begrüßungs-Video';
    const rule = this.settings.peek().triggerRules.find((r) => r.id === ruleId);
    if (rule) return rule.name;
    const red = (this.settings.peek().redemptions ?? []).find((r) => r.id === ruleId);
    if (red) return `Einlösung: ${red.name}`;
    return ruleId;
  }

  private eventReason(event: StudioEvent): string {
    const who = event.user?.nickname ? ` von ${event.user.nickname}` : '';
    switch (event.type) {
      case 'gift': {
        const g = event.gift;
        return g ? `Gift ${g.slug}${g.count && g.count > 1 ? ` ×${g.count}` : ''}${who}` : `Gift${who}`;
      }
      case 'chat': return `Chat „${(event.text ?? '').slice(0, 40)}"${who}`;
      case 'follow': return `Follow${who}`;
      case 'sub': return `Sub${who}`;
      case 'like': return `Likes${who}`;
      case 'share': return `Share${who}`;
      case 'join': return `Beitritt${who}`;
      case 'timer': return 'Timer';
      default: return event.type + who;
    }
  }

  /** Punkte-Einlösung prüfen: Chat-Befehl → Punkte abziehen → Aktion(en). */
  private maybeRedeem(event: StudioEvent): void {
    if (event.type !== 'chat' || !event.user) return;
    const red = matchRedemption(this.settings.peek().redemptions ?? [], event.text ?? '');
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
      // Defensiv (P2-2-Audit): `action.kind` hier liest VOR dispatchAction()
      // zu — eine malformte Aktion (z.B. `null`) würde sonst schon hier
      // (nicht erst im Dispatcher) eine TypeError werfen und den ganzen
      // Event-Handler für dieses Ereignis abreißen.
      if (!action || typeof action !== 'object') continue;
      // Die Einlösung hat schon kassiert — ein Spin-Rad als Belohnung darf NICHT
      // ein zweites Mal Punkte abziehen (sonst doppelter Abzug).
      const a = action.kind === 'spin_wheel' ? { ...action, cost: 0 } : action;
      this.dispatchAction(red.id, a, event);
    }
  }

  /** Eine Trigger-Aktion ausführen — gemeinsamer Pfad für Events und Timer. */
  private runAction(ruleId: string, action: import('@botexe/trigger-engine').TriggerAction, event: StudioEvent): void {
    if (action.kind === 'play_sound') {
      this.playSound(action.soundId, action.volume, 'soundboard');
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
    } else if (action.kind === 'spotify_control') {
      void this.spotifyControl(action.control);
    } else if (action.kind === 'spotify_request') {
      const q = renderSpeakTemplate(action.query || '{args}', event).trim();
      if (q) void this.spotifyRequest(q);
    } else if (action.kind === 'speak') {
      this.speakForEvent(action.template, event, action.voice);
    } else if (action.kind === 'spin_wheel') {
      // Punkte-Economy: kostet der Spin etwas, vom Zuschauer abziehen.
      const cost = action.cost ?? 0;
      if (cost > 0 && event.user) {
        if (!this.points.spend(event.user.id, cost)) return; // nicht genug Punkte → kein Spin
      }
      // roll zentral würfeln: alle Overlay-Quellen (OBS + TTLS) zeigen denselben
      // Gewinner — sonst würfelt jede Quelle lokal ein eigenes Ergebnis.
      this.server.broadcast({ kind: 'action', ruleId, action: { ...action, roll: Math.random() } });
      // Stats anstoßen (gedeckelt) — auch beim Gratis-Spin, damit Overlay-Listen
      // konsistent bleiben statt einzufrieren.
      this.scheduleStatsBroadcast();
      // Rad-Sounds (am Widget konfiguriert): Drehen sofort, Gewinn nach spinMs.
      const ws = findWheelSounds(this.layouts.list(), action.targetId);
      if (ws) {
        if (ws.spin) this.playSound(ws.spin, undefined, 'game');
        if (ws.result) {
          const timer = setTimeout(() => {
            this.actionTimers.delete(timer);
            this.playSound(ws.result, undefined, 'game');
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
    this.ensureDefaultProfile(); // immer ein aktives Profil (sichert beim Wechsel)
    this.obs.applyConfig(this.settings.get().obs); // OBS-Verbindung (falls aktiviert)
    this.streamerbot.applyConfig(this.settings.get().streamerbot); // Streamer.bot-Brücke
    // Timer-Regeln: 1s-Ticker NUR starten, wenn es überhaupt Timer-Regeln gibt
    // (sonst lief er die ganze App-Laufzeit im Leerlauf).
    this.refreshTimerTicker();

    // Auto-Live-Watch (wie TikFinity): wenn aktiviert + ein letzter Account bekannt
    // ist, schon beim Start auf das nächste Live warten und automatisch verbinden —
    // ohne dass der User „Verbinden" drücken muss.
    const s = this.settings.get();
    if (s.autoLiveWatch && s.lastUsername.trim()) {
      log.info('TikTok', `Auto-Live-Watch: beobachte @${s.lastUsername} — verbinde automatisch, sobald live`);
      this.adapter.watchForLive(s.lastUsername.trim());
    }

    // Spotify: Polling nur, wenn es auch jemand sieht (Client + Widget).
    this.refreshSpotifyPolling();

    // Stream-Eckdaten alle 5 Min ins Log (nur während verbunden) — Überblick ohne Spam.
    this.statsLogTimer = setInterval(() => {
      if (!this.adapter.isConnected()) return;
      const t = this.stats.snapshot().totals;
      log.info('Stats', `${t.viewers} Zuschauer (Peak ${t.peakViewers}) · ${t.uniqueViewers} gesamt dabei · ${t.likes} Likes · ${t.gifts} Gifts · ${t.coins} Coins · ${t.chats} Chats`);
    }, 5 * 60 * 1000);
  }

  /** 1s-Timer-Ticker an/aus je nachdem, ob aktive Timer-Regeln existieren.
   *  Bei jeder Regeländerung neu bewerten. */
  private refreshTimerTicker(): void {
    const want = this.engine.hasTimerRules();
    if (want && !this.timerTicker) {
      this.timerTicker = setInterval(() => {
        const ts = Date.now();
        const tickEvent: StudioEvent = { type: 'timer', ts };
        for (const match of this.engine.evaluateTimer(ts)) {
          this.dispatchAction(match.ruleId, match.action, tickEvent);
        }
      }, 1000);
    } else if (!want && this.timerTicker) {
      clearInterval(this.timerTicker);
      this.timerTicker = null;
    }
  }

  async stop(): Promise<void> {
    this.replayAbort?.abort();
    if (this.statsTimer) clearTimeout(this.statsTimer);
    if (this.timerTicker) clearInterval(this.timerTicker);
    if (this.statsLogTimer) { clearInterval(this.statsLogTimer); this.statsLogTimer = null; }
    for (const t of this.actionTimers) clearTimeout(t);
    this.actionTimers.clear();
    this.flushSessionToHistory();
    if (this.statsSaveTimer) { clearTimeout(this.statsSaveTimer); this.statsSaveTimer = null; }
    this.saveSessionStats();
    this.points.save();
    this.giftCatalog.save();
    this.statsHistory.save();
    this.obs.dispose();
    this.streamerbot.dispose();
    this.spotify.dispose();
    await this.adapter.disconnect();
    await this.server.stop();
  }

  // ── OBS-Studio-Steuerung ──────────────────────────────────────────────
  /** OBS-Einstellungen setzen + Verbindung anwenden. Leeres Passwort = das
   *  gespeicherte behalten (die UI bekommt das Passwort nie zurück, das Feld ist
   *  beim Bearbeiten leer — sonst würde Speichern es versehentlich löschen). */
  setObsConfig(cfg: { enabled: boolean; url: string; password: string }): void {
    const cur = this.settings.get().obs;
    const next = { enabled: cfg.enabled, url: cfg.url, password: cfg.password ? cfg.password : cur.password };
    this.settings.update({ obs: next });
    this.obs.applyConfig(next);
  }
  /** Konnte die komplette Gift-Liste des Rooms geholt werden? Entscheidet, ob
   *  im Katalog Bilder für NIE geschickte Gifts stehen können (siehe Kommentar
   *  in tiktok-adapter.ts) — die Oberfläche erklärt damit fehlende Bilder. */
  getGiftListStatus(): 'unbekannt' | 'ok' | 'plan-noetig' | 'fehler' { return this.adapter.getGiftListStatus(); }
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

  /** Aktuellen Verbindungs-Status ABHOLEN (P1-3) — für den Renderer-Pull beim
   *  Mount, siehe lastPlatformStatusInfo. */
  getPlatformStatus(): AdapterStatusInfo {
    return this.lastPlatformStatusInfo;
  }

  async connect(username: string): Promise<void> {
    this.settings.update({ lastUsername: username });
    // Der eigentliche Reset passiert beim 'connected'-Status mit freshStream
    // (gilt einheitlich für manuellen Connect UND Auto-Connect ins nächste Live).
    await this.adapter.connect(username);
  }

  /** „Automatisch verbinden wenn ich live gehe" zur Laufzeit umschalten — wirkt
   *  sofort (nicht erst beim Neustart). */
  setAutoLiveWatch(enabled: boolean): void {
    this.adapter.setAutoConnect(enabled); // false → stoppt auch den laufenden Watch
    const last = this.settings.get().lastUsername.trim();
    if (enabled && last && !this.adapter.isConnected()) {
      this.adapter.watchForLive(last);
    }
  }

  /** Billiger Live-Check (HTML-Scrape via tiktok-live-connector, KEIN Sign-Key/
   *  Kontingent) — fürs dauerhafte „warte auf Live"-Pollen. */
  private async checkLiveCheap(username: string): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { TikTokLiveConnection } = require('tiktok-live-connector');
      const conn = new TikTokLiveConnection(username.replace(/^@/, ''), { disableEulerFallbacks: true });
      // Timeout: die Lib hat selbst keinen — eine hängende TikTok-Antwort darf den
      // Live-Watch nicht einschläfern (sonst pollt er nie wieder).
      const live = await Promise.race([
        conn.fetchIsLive() as Promise<boolean>,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 9000)),
      ]);
      try { conn.disconnect?.(); } catch { /* egal */ }
      return !!live;
    } catch {
      return false;
    }
  }

  // ── Spotify ──────────────────────────────────────────────────────────────

  /** Now-Playing nur pollen, wenn es auch jemand sieht: verbunden + mind. ein
   *  Overlay-Client + irgendwo ein Spotify-Widget im Layout. Sonst lief der
   *  4s-Poll die ganze App-Laufzeit ins Leere (auch ohne Stream/Widget). */
  private hasSpotifyWidget(): boolean {
    return this.layouts.list().some((layout) =>
      layout.layers.some((l) => l.widgetType === 'spotify-now-playing' && l.visible),
    );
  }

  refreshSpotifyPolling(): void {
    const want = this.spotify.isConnected() && this.server.getClientCount() > 0 && this.hasSpotifyWidget();
    if (want && !this.spotify.isPolling()) this.spotify.startPolling();
    else if (!want && this.spotify.isPolling()) this.spotify.stopPolling();
  }

  /** Login starten — liefert die Authorize-URL (Renderer öffnet sie im Browser). */
  spotifyBeginAuth(): { url: string; ok: boolean; error?: string } {
    return this.spotify.beginAuth();
  }

  /** OAuth-Redirect-Callback (vom lokalen Server) → Tokens holen, einmal frisch
   *  anzeigen + bedarfsabhängiges Polling neu bewerten. */
  private async onSpotifyCallback(code: string, state: string): Promise<{ ok: boolean; error?: string }> {
    const r = await this.spotify.completeAuth(code, state);
    if (r.ok) { void this.spotify.pollOnce(); this.refreshSpotifyPolling(); }
    return r;
  }

  spotifyStatus(): { connected: boolean; clientIdSet: boolean; redirectUri: string; nowPlaying: NowPlaying | null } {
    return {
      connected: this.spotify.isConnected(),
      clientIdSet: !!(this.settings.get().spotifyClientId || '').trim(),
      redirectUri: `http://127.0.0.1:${this.server.getPort()}/spotify/callback`,
      nowPlaying: this.lastSpotify,
    };
  }

  async spotifyControl(action: 'play' | 'pause' | 'next' | 'previous'): Promise<boolean> {
    const ok = action === 'play' ? await this.spotify.play()
      : action === 'pause' ? await this.spotify.pause()
        : action === 'next' ? await this.spotify.next()
          : await this.spotify.previous();
    // Sofort einmal frisch holen, damit die Anzeige nach der Aktion stimmt —
    // ohne ein Dauer-Polling zu erzwingen (das steuert refreshSpotifyPolling).
    void this.spotify.pollOnce();
    return ok;
  }

  /** Song-Request: suchen + ersten Treffer in die Queue (für Chat-/Gift-Trigger).
   *  Eigene Drossel (gegen API-Rate-Limit, falls jede Chat-Nachricht triggert). */
  async spotifyRequest(query: string): Promise<{ ok: boolean; title?: string; artist?: string }> {
    const now = Date.now();
    if (now - this.lastSpotifyRequestAt < 2500) return { ok: false };
    this.lastSpotifyRequestAt = now;
    if (!this.spotify.isConnected()) { this.hooks.onToast?.({ type: 'warn', message: 'Song-Request: Spotify nicht verbunden (Einstellungen → Spotify).' }); return { ok: false }; }
    const hits = await this.spotify.search(query);
    const first = hits[0];
    if (!first) { log.info('Spotify', `Song-Request „${query.slice(0, 40)}" — kein Treffer`); return { ok: false }; }
    const ok = await this.spotify.addToQueue(first.uri);
    if (!ok) this.hooks.onToast?.({ type: 'warn', message: 'Song-Request fehlgeschlagen (Spotify Premium + aktives Gerät nötig).' });
    return { ok, title: first.title, artist: first.artist };
  }

  spotifyLogout(): void {
    this.spotify.logout();
    this.lastSpotify = null;
    this.refreshSpotifyPolling(); // stoppt das Polling (nicht mehr verbunden)
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  // ── Trigger-Regeln ────────────────────────────────────────────────────

  getRules(): TriggerRule[] {
    return this.settings.get().triggerRules;
  }

  /** Geschenk-Regeln in abgespeckter Form für das Geschenk-Menü im Overlay.
   *  Das Widget baut daraus die Tafel „welches Geschenk löst was aus" und
   *  braucht dafür nur den Regelnamen, die Gift-Bedingung und die ART der
   *  Aktionen. Die Aktions-PARAMETER bleiben bewusst hier: darin stehen
   *  Sound-Pfade, OBS-Szenen und Streamer.bot-IDs, die im Overlay (und damit
   *  potenziell in einer Bildschirmaufnahme) nichts zu suchen haben. */
  getRulesForOverlay(): unknown[] {
    return this.getRules()
      .filter((r) => r.event === 'gift')
      .map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled !== false,
        event: r.event,
        conditions: (r.conditions ?? [])
          .filter((c) => c.kind === 'gift_slug_is' || c.kind === 'gift_id_is')
          .map((c) => ({ kind: c.kind, value: (c as { value?: unknown }).value })),
        actions: (r.actions ?? []).map((a) => ({ kind: a.kind })),
      }));
  }

  setRules(rules: TriggerRule[]): void {
    this.settings.update({ triggerRules: rules });
    this.engine.setRules(rules);
    this.refreshTimerTicker(); // Timer-Regel hinzugekommen/entfernt → Ticker neu bewerten
  }

  /**
   * Bild-Adresse für ein Geschenk — in der Reihenfolge, in der sie am
   * verlässlichsten ist:
   *   1. lokal gesicherte Datei (überlebt abgelaufene TikTok-Adressen, lädt offline)
   *   2. Adresse aus dem eigenen Katalog (zuletzt gesehene TikTok-Adresse)
   *   3. eingebaute Master-Liste (kennt auch nie erhaltene Geschenke)
   * Leerer String, wenn nichts passt — dann bleibt der Platzhalter.
   */
  private giftBildFuer(slug: string, giftId?: number): string {
    const eigen = this.giftCatalog.all()[slug.trim().toLowerCase()];
    if (eigen) {
      const datei = this.giftCatalog.localIconFile(eigen);
      if (datei) {
        return `http://127.0.0.1:${this.server.getPort()}/gift-img/${encodeURIComponent(datei)}?token=${this.server.getToken()}`;
      }
      if (eigen.icon) return eigen.icon;
    }
    return masterIcon(slug, giftId);
  }

  /** Kompletter Gift-Katalog für Galerie + Overlay-Widgets. Lokal gespeicherte
   *  Gift-Bilder werden auf eine 127.0.0.1-URL umgeschrieben (überleben ablaufende
   *  CDN-Links + laden offline); ohne lokale Datei bleibt die CDN-URL als Fallback.
   *
   *  Enthält seit v0.41 AUCH die eingebaute Master-Liste aller TikTok-Geschenke.
   *  Vorher mischte nur das App-Fenster sie dazu — die Overlay-Widgets bekamen
   *  bloß die selbst gesammelten. Deshalb ließ sich ein Geschenk im Fenster mit
   *  Bild auswählen, während dasselbe Geschenk im Stream als grauer Platzhalter
   *  erschien. Beide Seiten nutzen jetzt dieselbe Zusammenführung. */
  getGiftCatalog(): Record<string, import('./gift-catalog').GiftEntry> {
    const cat = mergeMitMasterAlsMap(
      this.giftCatalog.all() as unknown as Record<string, KatalogEintrag>,
    ) as unknown as Record<string, import('./gift-catalog').GiftEntry>;
    const base = `http://127.0.0.1:${this.server.getPort()}`;
    const token = this.server.getToken();
    for (const e of Object.values(cat)) {
      const file = this.giftCatalog.localIconFile(e);
      if (file) {
        e.icon = `${base}/gift-img/${encodeURIComponent(file)}?token=${token}`;
        // Auch selbst hinterlegte Bilder als iconFile melden: Widgets bauen die
        // URL daraus relativ zu IHRER Basis. Über den TikTok-Live-Studio-Link
        // läuft das Overlay nicht auf 127.0.0.1 — die absolute Adresse oben
        // wäre dort eine fremde Herkunft, die relative funktioniert immer.
        e.iconFile = file;
      }
    }
    return cat;
  }

  /** Favorit/eigenen Namen eines Gifts setzen (Galerie) → aktualisierter Katalog. */
  setGiftMeta(slug: string, patch: { favorite?: boolean; customName?: string }): Record<string, import('./gift-catalog').GiftEntry> {
    this.giftCatalog.setMeta(slug, patch);
    return this.giftCatalog.all();
  }

  /** Komplettes Konfig-Backup (Einstellungen, Trigger, Store, Panel, Overlays,
   *  Zuschauer/Punkte) als ein JSON-Objekt. Sounds/Medien liegen als Dateien
   *  im Datenordner und sind NICHT enthalten.
   *  SICHERHEIT: sensible Geheimnisse (TikTok-Session, Sign-Key, OBS-Passwort,
   *  TTS-API-Keys, Steuer-Token) werden NICHT exportiert — sonst lägen sie im
   *  Klartext in der teilbaren Backup-Datei. Nach dem Import einmal neu eintragen. */
  exportConfig(): Record<string, unknown> {
    return {
      schemaVersion: 1,
      settings: redactSecretsForExport(this.settings.get()),
      layouts: this.layouts.list(),
      viewers: this.points.exportEntries(),
    };
  }

  // ── Profile (umschaltbare Konfigurations-Sets) ─────────────────────────────

  /** Beim Start: existiert noch kein Profil, den aktuellen Stand als „Mein
   *  Setup" sichern und aktivieren. Sorgt dafür, dass IMMER ein aktives Profil
   *  existiert (in das beim Umschalten gesichert wird). */
  ensureDefaultProfile(): void {
    if (this.profiles.list().length === 0) {
      const p = this.profiles.create('Mein Setup', this.exportConfig(), Date.now());
      this.profiles.setActiveId(p.id);
    } else if (!this.profiles.getActiveId()) {
      this.profiles.setActiveId(this.profiles.list()[0]?.id ?? null);
    }
  }

  listProfiles(): { profiles: ProfileMeta[]; activeId: string | null } {
    return { profiles: this.profiles.list(), activeId: this.profiles.getActiveId() };
  }

  /** Neues Profil aus dem AKTUELLEN Stand (Snapshot). Ändert nichts am Aktiven. */
  createProfile(name: string, source?: string): ProfileMeta {
    const p = this.profiles.create(name, this.exportConfig(), Date.now(), source);
    return { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, source: p.source };
  }

  /** Profil wechseln: aktuellen Stand ins bisher aktive Profil sichern (kein
   *  Datenverlust), dann das Ziel-Profil laden + aktiv setzen.
   *
   *  P2-1-Audit: der LayoutStore ist EIN gemeinsames Verzeichnis für alle
   *  Profile (siehe layout-store.ts). importConfig() SCHREIBT nur die Layouts
   *  des Ziel-Profils, LÖSCHT aber nie die des vorherigen — ohne pruneExcept()
   *  blieben dessen Layout-Dateien global sichtbar (this.layouts.list() zeigt
   *  Layouts BEIDER Profile) und würden beim nächsten Zurückwechseln über
   *  exportConfig()/saveBundle() (Zeile oben) ins falsche, gerade verlassene
   *  Profil-Bundle zurückgeschrieben. Daher NACH dem Import auf genau die
   *  Layout-IDs des Ziel-Profils zuschneiden. */
  switchProfile(id: string): { ok: boolean; error?: string } {
    const target = this.profiles.get(id);
    if (!target) return { ok: false, error: 'Profil nicht gefunden' };
    const activeId = this.profiles.getActiveId();
    if (activeId && activeId !== id) this.profiles.saveBundle(activeId, this.exportConfig(), Date.now());
    this.importConfig(target.bundle);
    const targetLayoutIds = new Set(
      (Array.isArray(target.bundle.layouts) ? target.bundle.layouts : [])
        .map((l) => (l && typeof l === 'object' ? (l as { id?: unknown }).id : undefined))
        .filter((v): v is string => typeof v === 'string'),
    );
    this.layouts.pruneExcept(targetLayoutIds);
    this.profiles.setActiveId(id);
    log.info('Profil', `Gewechselt zu „${target.name}"`);
    return { ok: true };
  }

  renameProfile(id: string, name: string): { ok: boolean } {
    return { ok: this.profiles.rename(id, name, Date.now()) };
  }

  /** Profil löschen (nicht das aktive — vorher umschalten). */
  deleteProfile(id: string): { ok: boolean; error?: string } {
    if (this.profiles.getActiveId() === id) return { ok: false, error: 'Aktives Profil kann nicht gelöscht werden' };
    if (this.profiles.list().length <= 1) return { ok: false, error: 'Das letzte Profil kann nicht gelöscht werden' };
    this.profiles.delete(id);
    return { ok: true };
  }

  /** Einen „Moment" (Premium-Einblender) an alle action-screen-Widgets senden. */
  emitMoment(moment: import('@botexe/overlay-engine').MomentPayload): void {
    this.server.broadcast({ kind: 'moment', moment });
  }

  /** Diagnose-Schnappschuss („Warum sehe ich mein Overlay nicht?"). */
  getDiagnostics(): Record<string, unknown> {
    const s = this.settings.get();
    return {
      ...this.server.getDiagnostics(),
      keySet: !!s.tiktokSignApiKey,
      connectMode: s.tiktokConnectMode ?? 'cloud',
      username: s.lastUsername ?? '',
      layoutCount: this.layouts.list().length,
      activeLayoutId: s.activeLayoutId ?? '',
      // Für Startklar-Check + Spiel-Wächter: Was liegt wirklich im aktiven Layout?
      ...(() => {
        const all = this.layouts.list();
        const active = all.find((l) => l.id === s.activeLayoutId) ?? all[0];
        return {
          activeLayers: active?.layers.length ?? 0,
          activeWidgetTypes: [...new Set((active?.layers ?? []).map((l) => l.widgetType))],
        };
      })(),
      // Verbindungsstatus als Snapshot (nicht auf ein Live-Event angewiesen).
      platformStatus: this.lastPlatformStatus.status,
      platformConnected: this.lastPlatformStatus.status === 'connected',
      lastStatusDetail: this.lastPlatformStatus.detail ?? '',
    };
  }

  // ── Steuer-API / KI ─────────────────────────────────────────────────────────
  /** Aggregierter, SECRET-FREIER Zustand für die lokale Steuer-API (GET /api/status).
   *  Enthält nur „gesetzt"-Flags statt echter Keys/Passwörter (getDiagnostics maskiert). */
  getApiStatus(): Record<string, unknown> {
    const diag = this.getDiagnostics();
    const t = this.stats.snapshot().totals;
    const game = this.getGameState();
    return {
      connected: diag.platformConnected ?? false,
      platformStatus: diag.platformStatus ?? 'disconnected',
      username: diag.username ?? '',
      keySet: diag.keySet ?? false,
      overlayClients: diag.clientCount ?? 0,
      stats: {
        viewers: t.viewers, likes: t.likes, gifts: t.gifts,
        coins: t.coins, follows: t.follows, comments: t.chats,
      },
      game: game ? { kind: game.kind, state: game.state } : null,
      boss: { active: this.bossActive },
      actions: API_ACTION_KINDS, // Selbstauskunft: welche POST /api/action-Aktionen es gibt
    };
  }

  /** Eine Aktion der Steuer-API ausführen (POST /api/action). Nur die per
   *  parseApiAction validierten, erlaubten Aktionen — alles andere wird abgelehnt. */
  runApiAction(raw: unknown): { ok: boolean; error?: string } {
    const parsed = parseApiAction(raw);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    const a = parsed.action;
    switch (a.kind) {
      case 'play_sound': this.playSound(a.soundId, a.volume, 'soundboard'); return { ok: true };
      case 'speak': {
        const tts = this.settings.get().tts;
        const clean = TTSService.sanitize(a.text, tts.maxTextLen);
        if (clean && !this.moderationBlocked(clean)) this.tts.speak(clean, a.voice || tts.voice);
        return { ok: true };
      }
      case 'start_game': return this.startGame(a.game, a.config);
      case 'stop_game': return this.stopGame();
      case 'reveal_game': return this.revealGame();
      case 'start_boss': return this.startBoss();
      case 'stop_boss': return this.stopBoss();
    }
  }

  // ── Chat-Spiele ────────────────────────────────────────────────────────────
  startGame(kind: GameKind, config?: unknown): { ok: boolean; error?: string } { return this.games.start(kind, config); }
  stopGame(): { ok: boolean } { this.games.stop(); return { ok: true }; }
  revealGame(): { ok: boolean } { this.games.reveal(); return { ok: true }; }
  getGameState(): { kind: GameKind; state: unknown } | null { return this.games.getState(); }

  /** Verfügbare Quiz-Themen (für die UI). */
  listQuizThemes(): Array<{ id: string; label: string; count: number }> {
    return QUIZ_THEMES.map((t) => ({ id: t.id, label: t.label, count: t.questions.length }));
  }

  /** Quiz VOLLAUTOMATISCH starten: zieht `rounds` zufällige Fragen aus dem Thema
   *  und läuft sie selbsttätig durch (Frage → Sammelzeit → Auflösen → nächste). */
  startQuizAuto(themeId: string, opts?: { rounds?: number; questionMs?: number; pauseMs?: number; winnerMode?: 'first' | 'random' }): { ok: boolean; error?: string } {
    const rounds = opts?.rounds ?? 8;
    const questions = pickQuestions(themeId, rounds);
    // Nachschub-Callback → das Quiz läuft endlos (immer neue Zufallsfragen des
    // Themas), bis der Streamer „Stop" drückt.
    return this.games.startQuizAuto(questions, { questionMs: opts?.questionMs, pauseMs: opts?.pauseMs, winnerMode: opts?.winnerMode }, () => pickQuestions(themeId, rounds));
  }

  // ── Stream-Boss ──────────────────────────────────────────────────────────
  /** Boss-Modus an: Gifts (nach Coins) fügen dem Boss Schaden zu, bei Kill gibt
   *  es einen Boss-Kill-Moment und der nächste (stärkere) Boss spawnt. */
  startBoss(): { ok: boolean; alreadyActive?: boolean } {
    // Idempotent: läuft der Boss schon, NICHT neu spawnen (sonst gehen HP + Top-
    // Damager der laufenden Runde verloren) — nur den aktuellen Stand broadcasten.
    if (this.bossActive) { this.broadcastBoss(); log.info('Boss', 'Start ignoriert — läuft bereits'); return { ok: true, alreadyActive: true }; }
    this.bossActive = true; this.boss.spawn(); this.broadcastBoss();
    log.info('Boss', `Boss-Modus AN — HP ${this.boss.getState().maxHp}, Gifts = Schaden`);
    return { ok: true };
  }
  stopBoss(): { ok: boolean } { this.bossActive = false; this.server.broadcast({ kind: 'game-state', gameKind: 'boss', state: null }); log.info('Boss', 'Boss-Modus AUS'); return { ok: true }; }
  getBossState(): unknown { return this.bossActive ? this.boss.getState() : null; }

  private broadcastBoss(): void {
    this.server.broadcast({ kind: 'game-state', gameKind: 'boss', state: this.boss.getState() });
  }

  /** Schaden am Boss (aus Gifts) — broadcastet neuen Stand, bei Kill Moment +
   *  nächster Spawn. */
  private damageBoss(source: { id: string; nickname: string }, amount: number): void {
    if (!this.bossActive || amount <= 0) return;
    const r = this.boss.damage(source, amount);
    this.broadcastBoss();
    if (r.killed) {
      const st = this.boss.getState();
      log.info('Boss', `BESIEGT (Level ${st.level})! Top-Schaden: ${st.topDamagers.slice(0, 3).map((d) => `${d.nickname} (${d.damage})`).join(', ') || '—'}`);
      this.emitMoment(bossKillMoment(st, st.topDamagers));
      this.boss.onKill();
      this.boss.spawn();
      this.broadcastBoss();
      log.info('Boss', `Neuer Boss gespawnt — HP ${this.boss.getState().maxHp}`);
    }
  }

  /** TikFinity-`.tfc` importieren → entschlüsseln, Sounds laden, übersetzen,
   *  als neues Profil ablegen. Ändert das aktive Profil NICHT (die UI bietet
   *  „jetzt aktivieren" an). Liefert einen strukturierten Bericht für den Dialog. */
  async importTikfinity(fileContent: string): Promise<{
    ok: boolean; profileId?: string; profileName?: string; error?: string;
    summary?: { triggers: number; commands: number; sounds: number; widgets: number };
    imported?: string[]; skipped?: string[];
  }> {
    let cfg;
    try { cfg = decryptTfc(fileContent); }
    catch { return { ok: false, error: 'Keine gültige TikFinity-Profildatei (.tfc). Prüfe, ob es die richtige Datei ist (TikFinity → Einstellungen → Profil exportieren).' }; }

    // Sounds vorab laden: myinstants.com + eigene TikFinity-CDN-Uploads (SSRF-eng).
    // url → lokale Sound-ID. Nicht ladbare landen im „skipped"-Bericht.
    const soundMap = new Map<string, string>();
    const soundFails: string[] = [];
    for (const url of collectSoundUrls(cfg)) {
      if (!isAllowedImportSound(url)) { soundFails.push(url); continue; }
      try {
        const name = await downloadMyInstants(url, decodeURIComponent(url.split('/').pop() ?? 'sound'), this.sounds.getDir(), true);
        soundMap.set(url, name);
      } catch { soundFails.push(url); }
    }

    // Widgets ZUERST — mapWidgets legt u.a. Gift-/Follow-Alert an; deren Layer-
    // IDs brauchen die Trigger, um visuelle TikFinity-Aktionen durch unseren
    // Alert zu ersetzen (sonst „connecten" die Gift-Trigger nicht sichtbar).
    const { layers, report: widgetReport } = mapWidgets(cfg, () => crypto.randomUUID());
    const alerts = {
      gift: layers.find((l) => l.widgetType === 'gift-alert')?.id,
      follow: layers.find((l) => l.widgetType === 'follow-alert')?.id,
    };
    const { triggerRules, chatCommands, report } = mapTikfinity(cfg, (u) => soundMap.get(u), () => crypto.randomUUID(), alerts);

    // Bundle = aktueller Stand als valide Basis, mit den importierten Regeln/
    // Befehlen + (falls vorhanden) einem Overlay aus den übernehmbaren Widgets.
    const base = this.exportConfig();
    const now = new Date().toISOString();
    const importLayoutId = crypto.randomUUID();
    const layouts = layers.length
      ? [{ schemaVersion: 1 as const, id: importLayoutId, name: 'TikFinity Overlay', canvas: { width: 1080, height: 1920, background: 'transparent' as const }, layers, createdAt: now, updatedAt: now }]
      : (base.layouts as unknown[]);
    // WICHTIG: das importierte Layout auch AKTIV setzen — sonst zeigt das neue
    // Profil ein leeres Overlay (activeLayoutId zeigte sonst auf ein Layout des
    // alten Profils, das hier gar nicht existiert).
    const bundle = {
      ...base,
      settings: {
        ...(base.settings as Record<string, unknown>),
        triggerRules,
        chatCommands,
        ...(layers.length ? { activeLayoutId: importLayoutId } : {}),
      },
      layouts,
    };
    const p = this.profiles.create('TikFinity-Import', bundle, Date.now(), 'tikfinity');

    const imported = [
      `${report.triggers} Trigger-Regeln`,
      `${report.commands} Chat-Befehle`,
      `${soundMap.size} Sounds`,
      ...widgetReport,
    ];
    const skipped = [...report.skipped];
    if (soundFails.length) skipped.push(`${soundFails.length} Sound(s) nicht ladbar (nicht mehr online?)`);
    const summary = { triggers: report.triggers, commands: report.commands, sounds: soundMap.size, widgets: layers.length };
    log.info('Import', `TikFinity → Profil „${p.name}": ${JSON.stringify(summary)}, ${skipped.length} übersprungen`);
    return { ok: true, profileId: p.id, profileName: p.name, summary, imported, skipped };
  }

  /** Backup einspielen. Liefert, wie viele Overlays/Zuschauer übernommen wurden. */
  importConfig(data: unknown): { ok: boolean; layouts: number; viewers: number; error?: string } {
    if (!data || typeof data !== 'object') return { ok: false, layouts: 0, viewers: 0, error: 'Ungültige Datei' };
    const d = data as { settings?: Record<string, unknown>; layouts?: unknown[]; viewers?: unknown[] };
    try {
      if (d.settings && typeof d.settings === 'object') {
        // Backups dürfen KEINE Geheimnisse/Tokens unterschieben (ein manipuliertes
        // ODER einfach altes Backup könnte sonst fremde/veraltete Spotify-/TikTok-
        // Tokens, den KI-Key oder den Steuer-Token setzen). Eine gemeinsame Liste
        // mit dem Export nutzen (P1-Audit: aiApiKey fehlte hier vorher von Hand
        // gepflegt in dieser Kopie — siehe stripSecretFieldsForImport).
        const rest = stripSecretFieldsForImport(d.settings as Record<string, unknown>);
        // Trigger-Regeln + Chat-Befehle aus dem Backup hart validieren (whitelist-
        // basierter Rebuild): ein manipuliertes Backup darf keine ungültigen oder
        // mit Fremdfeldern (Prototype-Pollution) versehenen Strukturen einschleusen.
        if ('triggerRules' in rest) rest.triggerRules = validateTriggerRules(rest.triggerRules);
        if ('chatCommands' in rest) rest.chatCommands = validateChatCommands(rest.chatCommands);
        // P2-2-Audit: Redemptions/Panel-Buttons wurden hier bisher UNGEPRÜFT
        // durchgereicht (isValidRedemption in settings-store.ts prüft nur beim
        // Laden von settings.json, nicht bei diesem Import-Pfad, und selbst dort
        // nur `Array.isArray(actions)`, nie die einzelnen Aktionen). Ein
        // manipuliertes/kaputtes Backup mit z.B. `actions: [null]` riss sonst
        // beim nächsten Chat-Event den kompletten Event-Handler ab (siehe
        // dispatchAction/maybeRedeem). Gleiche strenge Validierung wie oben.
        if ('redemptions' in rest) rest.redemptions = validateRedemptions(rest.redemptions);
        if ('panelButtons' in rest) rest.panelButtons = validatePanelButtons(rest.panelButtons);
        // P3a-Audit: ALLE anderen Felder (mixer, tts, points, giveaway, obs,
        // moderation, streamerbot, …) gingen bisher UNGEPRÜFT in
        // settings.update() — dieselbe Lücke wie der actions:[null]-Crash
        // oben, nur an einem zweiten, ungepatchten Eingang zum selben Store.
        // Ein altes/manipuliertes Backup mit z.B. mixer.master:"laut" oder
        // points.perChat:"10" (String statt Zahl) überschrieb den Live-Cache
        // ungeprüft. Dieselbe Allowlist-Härtung wie IPC.SETTINGS_UPDATE nutzen
        // (sanitizeSettingsPatch), damit es nur EINE Härtung für den Store gibt.
        const sanitized = sanitizeSettingsPatch(rest, this.settings.get());
        this.settings.update(sanitized);
        this.engine.setRules(this.settings.get().triggerRules);
        this.refreshTimerTicker(); // Backup könnte Timer-Regeln mitbringen/entfernen
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
    const before = this.points.get(user.id)?.gameWins ?? 0;
    this.points.recordWin(user);
    const after = this.points.get(user.id)?.gameWins ?? 0;
    log.info('Spiel', `Sieg für ${user.nickname} verbucht`);
    // Spiele-Meister: bei neuem Level einen Premium-Moment (Action-Screen) zeigen.
    if (didLevelUp(before, after)) {
      this.emitMoment(masteryMoment(user, after));
      log.info('Spiel', `${user.nickname} Level-Up → „${levelForWins(after).title}"`);
    }
    this.scheduleStatsBroadcast();
  }

  /** Beim ersten Chat eines Zuschauers in der Session ggf. einen VIP-Welcome-
   *  oder Stammgast-Moment auf den Action-Screens zeigen (Cooldowns in der
   *  ViewerCardService-Logik). */
  private maybeViewerMoment(event: StudioEvent): void {
    if (event.type !== 'chat' || !event.user) return;
    if (this.momentShownSession.has(event.user.id)) return;
    this.momentShownSession.add(event.user.id);
    const e = this.points.get(event.user.id);
    const isVip = this.points.isVip(event.user.id);
    const visits = this.points.visitCountOf(event.user.id);
    const kind = isVip ? 'vip-welcome' : visits >= 5 ? 'returning-viewer' : null;
    if (!kind) return;
    const info: ViewerInfo = {
      id: event.user.id, nickname: event.user.nickname, profilePic: event.user.profilePic,
      isVip, visits, points: e?.points, coins: e?.coins, likes: e?.likes,
      totalChats: e?.totalChats, gifts: e?.gifts, gameWins: e?.gameWins,
    };
    const moment = this.viewerCard.buildMoment(kind, info, Date.now());
    if (moment) this.emitMoment(moment);
  }

  // ── Stammgast-Begrüßung ───────────────────────────────────────────────

  /** Beim ersten Chat eines wiederkehrenden Zuschauers in dieser Session per
   *  TTS begrüßen (ab minVisits Besuchen). Punkte/Besuche sind zu diesem
   *  Zeitpunkt schon fortgeschrieben (touchStats lief im Event-Handler davor). */
  private maybeGreetReturning(event: StudioEvent): void {
    if (event.type !== 'chat' || !event.user) return;
    if (this.greetedThisSession.has(event.user.id)) return;
    this.greetedThisSession.add(event.user.id);
    const g = this.settings.peek().greetReturning;
    if (!g.enabled) return;
    const visits = this.points.visitCountOf(event.user.id);
    if (visits < g.minVisits) return;
    const tts = this.settings.get().tts;
    if (!tts.enabled) return;
    const text = TTSService.sanitize(
      g.template.replace(/\{user\}/g, event.user.nickname).replace(/\{visits\}/g, String(visits)),
      tts.maxTextLen,
    );
    if (text && !this.moderationBlocked(text)) this.tts.speak(text, tts.voice);
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
    const gw = this.settings.peek().giveaway;
    if (!gw.enabled || event.type !== 'chat' || !event.user || !event.text) return;
    const norm = (s: string) => s.trim().toLowerCase().replace(/^!+/, '');
    if (norm(event.text) !== norm(gw.joinWord)) return;
    if (this.giveawayParticipants.has(event.user.id)) return; // schon dabei
    if (gw.entryCost > 0) {
      if (!this.points.spend(event.user.id, gw.entryCost)) return; // nicht genug Punkte
    }
    this.giveawayParticipants.set(event.user.id, { nickname: event.user.nickname, avatar: event.user.profilePic });
    // Auch bei Gratis-Eintritt (entryCost=0) muss der Teilnehmer-Zähler im
    // Cockpit/Overlay aktualisiert werden — sonst hängt die Anzeige fest.
    this.scheduleStatsBroadcast();
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
    const winner = list[Math.floor(Math.random() * list.length)];
    if (!winner) return { ok: false };
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
      this.commandCooldowns.set(cmd.id, now); // nur tracken, wenn es einen Cooldown gibt
    }

    const text = renderSpeakTemplate(cmd.response, event);
    if (cmd.speak) this.speakForEvent(cmd.response, event);
    if (cmd.sendToChat) void this.sendChat(text);
    log.info('Befehl', `${cmd.command} von ${event.user?.nickname ?? '?'}`);
  }

  /**
   * Lucky-Card, zweiter Auslöser (Stück 4, Task 3): passender Geschenke-
   * Slider (gift-menu, luckyMode+luckyCommand-Prop) zieht auch OHNE Geschenk,
   * wenn im Chat der konfigurierte Befehl auftaucht — matchLuckyCommand()
   * wählt die Layer aus, planLuckyDraws() (lucky-draw.ts) übernimmt danach
   * GENAU denselben Dispatch-Pfad wie der Gift-Auslöser (kein zweiter Roll,
   * keine doppelte Aktions-Logik).
   *
   * Cooldown: ein Chat-Befehl lässt sich beliebig oft spammen — ohne Bremse
   * würden mehrere Ziehungen für denselben Slider überlappen (Karten
   * shuffeln erneut, während die vorherige Ziehung noch läuft). Darum pro
   * Layer ein Cooldown in Höhe der Zieh-Dauer (luckyDrawMs, Fallback 3000ms —
   * derselbe Fallback wie in planLuckyDraws()/gift-menu.js): erst wenn die
   * vorherige Ziehung sichtbar abgeschlossen ist, darf die nächste per Befehl
   * starten. Ein eigenes Cooldown-Feld ist NICHT nötig — die Zieh-Dauer ist
   * bereits die sinnvolle Sperrzeit.
   */
  private maybeLuckyDrawByCommand(event: StudioEvent): void {
    if (!event.text) return;
    const layers = this.layouts.list().flatMap((layout) => layout.layers) as LuckyLayer[];
    const matched = matchLuckyCommand(layers, event.text);
    if (!matched.length) return;
    const now = event.ts;
    const eligible = matched.filter((l) => {
      const last = this.luckyDrawCooldowns.get(l.id) ?? 0;
      const cooldownMs = Math.max(600, Number(l.props?.luckyDrawMs ?? 3000));
      return now - last >= cooldownMs;
    });
    if (!eligible.length) return;
    for (const l of eligible) this.luckyDrawCooldowns.set(l.id, now);
    for (const { ruleId, action } of planLuckyDraws(eligible, this.getRules(), Math.random, event.user?.nickname)) {
      this.dispatchAction(ruleId, action, event);
    }
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
    // Ein Spotify-Widget könnte hinzugekommen/entfernt worden sein → Polling neu bewerten.
    this.refreshSpotifyPolling();
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
  /** Laufende Session-Stats von der Platte holen — nur frische Sessions (<6h),
   *  sonst aufersteht nach langer Pause eine uralte Session. */
  private restoreSessionStats(): SessionStats {
    try {
      if (fs.existsSync(this.statsFile)) {
        const ageMs = Date.now() - fs.statSync(this.statsFile).mtimeMs;
        if (ageMs < 6 * 3_600_000) {
          const restored = SessionStats.fromJSON(fs.readFileSync(this.statsFile, 'utf-8'));
          if (restored) {
            log.info('Studio', 'Laufende Session-Stats wiederhergestellt (Update/Neustart)');
            this.restoredStatsValid = true; // erster Connect = Fortsetzung, kein Reset
            return restored;
          }
        }
      }
    } catch (err) {
      log.warn('Studio', 'Session-Stats-Restore fehlgeschlagen', (err as Error).message);
    }
    return new SessionStats();
  }

  private scheduleStatsSave(): void {
    if (this.statsSaveTimer) return;
    this.statsSaveTimer = setTimeout(() => {
      this.statsSaveTimer = null;
      this.saveSessionStats();
    }, 5_000);
  }

  private saveSessionStats(): void {
    try {
      // Atomar (tmp + rename) wie die anderen Stores — ein Crash mitten im Write
      // darf die laufende Session-Datei nicht korrupt zurücklassen.
      const tmp = `${this.statsFile}.tmp`;
      fs.writeFileSync(tmp, this.stats.toJSON());
      fs.renameSync(tmp, this.statsFile);
    } catch (err) {
      log.warn('Studio', 'Session-Stats speichern fehlgeschlagen', (err as Error).message);
    }
  }

  resetSession(): void {
    this.stats.reset();
    // Neuer Stream → „Letztes Live"-Gift-Markierung leeren (NUR hier, an freshStream
    // gekoppelt — NICHT bei jedem Reconnect, sonst verschwinden mitten im Stream
    // alle bereits erhaltenen Gifts aus der Galerie).
    this.giftCatalog.resetLastRoom();
    // Neuer Stream → persistierten Stand verwerfen (sonst kommt er beim nächsten
    // Start zurück). Laufenden Save-Timer abbrechen.
    if (this.statsSaveTimer) { clearTimeout(this.statsSaveTimer); this.statsSaveTimer = null; }
    try { fs.rmSync(this.statsFile, { force: true }); } catch { /* egal */ }
    this.engine.resetCooldowns();
    this.redemptionCooldowns.clear();
    this.commandCooldowns.clear();
    this.luckyDrawCooldowns.clear();
    this.giveawayParticipants.clear();
    this.lastGiveawayWinner = '';
    this.greetedThisSession.clear();
    this.momentShownSession.clear();
    // Laufende Chat-Spiele + Boss-Modus beenden — sonst reagiert ein altes Spiel
    // (oder der Boss) im NEUEN Stream weiter auf Chat/Gifts und bleibt im Overlay.
    this.games.stop();
    if (this.bossActive) this.stopBoss();
    this.sessionRoles.clear();
    this.loggedRoleUsers.clear();
    this.loggedFollowerOnce = false;
    this.bus.clearLastValues();
    // Reset-Signal an die Overlay-Widgets: setzt auch persistente Zähler zurück
    // (counter/gift-counter via localStorage) — ein reines Re-Mount täte das nicht.
    this.server.broadcastReset();
    this.scheduleStatsBroadcast();
    this.server.rebroadcastLayouts();
    log.info('Studio', 'Session zurückgesetzt (Stats, Cooldowns, Overlay-Inhalte)');
  }

  resetPoints(): void {
    // Punkte komplett leeren: Store neu mit leerem Stand überschreiben. NUR die
    // Loyalty-Punkte — Level/Wins/Besuche/Coins bleiben (das ist Absicht).
    const affected = this.points.top(100000);
    const sum = affected.reduce((n, e) => n + e.points, 0);
    for (const e of affected) this.points.spend(e.id, e.points);
    this.points.save();
    log.info('Punkte', `Loyalty-Punkte zurückgesetzt: ${affected.length} Zuschauer, ${sum} Punkte gelöscht (Level/Wins/Stats bleiben)`);
    // Overlay + App sofort aktualisieren, sonst bleibt die alte Bestenliste
    // sichtbar, bis zufällig das nächste Event einen Broadcast auslöst.
    this.scheduleStatsBroadcast();
    this.server.rebroadcastLayouts();
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
    if (!text || this.moderationBlocked(text)) return;
    const ownVoice = event.user ? this.points.voiceFor(event.user.id) : undefined;
    const voice =
      voiceOverride ||
      ownVoice ||
      (tts.chatVoiceMode === 'perUser' && event.user
        ? this.tts.voiceForUser(event.user.id, tts.voice)
        : tts.voice);
    this.tts.speak(text, voice);
  }

  /** Zentraler Moderations-Wächter für ALLE TTS-Ausgaben — auch Ansagen/
   *  Begrüßungen (dort fließt der Nickname ins Template; ein Slur im Namen
   *  würde sonst laut vorgelesen). */
  private moderationBlocked(text: string): boolean {
    return containsBlockedWord(text, this.settings.peek().moderation?.blockedWords ?? []);
  }

  private maybeReadChat(event: StudioEvent): void {
    const tts = this.settings.get().tts;
    if (!tts.enabled || !tts.readChat) return;
    const raw = event.text ?? '';
    if (!raw.trim()) return;
    if (tts.skipCommands && raw.trimStart().startsWith('!')) return;
    const nick = event.user?.nickname ?? '—';
    if (event.user && this.points.isMuted(event.user.id)) { this.logTtsDecision(`übersprungen: ${nick} (stummgeschaltet)`); return; }
    // Chat-Moderation: gesperrte Wörter nicht vorlesen.
    if (containsBlockedWord(raw, this.settings.peek().moderation?.blockedWords ?? [])) { this.logTtsDecision(`übersprungen: ${nick} (gesperrtes Wort)`); return; }

    // Wer-Filter (Teamherz/Mod/Follower/VIP) + optionaler Prefix-Modus.
    const isVip = event.user ? this.points.isVip(event.user.id) : false;
    const prefix = tts.readPrefix ?? '';
    const decision = shouldReadChat(event, tts.readGroups ?? ['all'], prefix, isVip, tts.teamMinLevel ?? 0);
    if (!decision.read) {
      // Klarer Grund: Prefix fehlt (gilt AUCH für Mods/Follower!) vs. nicht in
      // gewählter Gruppe — sonst führt das Log auf die falsche Fährte.
      const grund = decision.reason === 'prefix' ? `kein „${prefix}" davor` : 'nicht in gewählter Gruppe';
      // Das ist das NORMALE Filter-Verhalten (bei Prefix-Modus praktisch jede
      // Chat-Nachricht) → nur Debug, sonst besteht das Stream-Log zu ~70% daraus.
      this.logTtsDecision(`übersprungen: ${nick} (${grund})`, 'debug');
      return;
    }

    // Prefix-bereinigten Text fürs Template nutzen (Original-Event unangetastet).
    const roles = [event.user?.isMod && 'mod', event.user?.isSub && 'teamherz', event.user?.isFollower && 'follower', isVip && 'vip'].filter(Boolean).join(',');
    this.logTtsDecision(`vorgelesen: ${nick}${roles ? ` [${roles}]` : ''}`);
    const speakEvent = decision.text === raw ? event : { ...event, text: decision.text };
    this.speakForEvent(tts.chatTemplate, speakEvent);
  }

  /** Rollen-Erkennung ins Log — 1× pro User/Rolle (beantwortet u.a. die Frage,
   *  ob im Cloud-Modus Mods/Teamherz überhaupt erkannt werden). */
  private logRoleDetection(user: NonNullable<StudioEvent['user']>): void {
    if (user.isMod && !this.loggedRoleUsers.has(`mod:${user.id}`)) {
      this.loggedRoleUsers.add(`mod:${user.id}`);
      log.info('TikTok', `Mod erkannt: ${user.nickname}`);
    }
    if (user.isSub && !this.loggedRoleUsers.has(`sub:${user.id}`)) {
      this.loggedRoleUsers.add(`sub:${user.id}`);
      // Stufe mitschreiben: Erst ein echter Stream zeigt, ob TikTok sie
      // wirklich liefert. „Stufe unbekannt" heißt nicht, dass jemand keine hat
      // — nicht jede Nachrichtenart trägt die Abzeichen-Daten mit.
      const stufe = user.teamLevel ? `Stufe ${user.teamLevel}` : 'Stufe nicht mitgeliefert';
      log.info('TikTok', `Teamherz erkannt: ${user.nickname} (${stufe})`);
    }
    if (user.gifterLevel && !this.loggedRoleUsers.has(`grade:${user.id}`)) {
      this.loggedRoleUsers.add(`grade:${user.id}`);
      log.info('TikTok', `Geschenke-Stufe erkannt: ${user.nickname} → ${user.gifterLevel}`);
    }
    if (user.isFollower && !this.loggedFollowerOnce) {
      this.loggedFollowerOnce = true;
      log.info('TikTok', `Follower-Erkennung läuft (z.B. ${user.nickname})`);
    }
  }

  /** TTS-Entscheidung ins Log — gedrosselt (max 1/2s), damit es nicht flutet. */
  private logTtsDecision(msg: string, level: 'info' | 'debug' = 'info'): void {
    // Debug-Entscheidungen (Filter-Spam) gehen leise raus und berühren die
    // Drossel NICHT — sonst würde ein Skip ein folgendes „vorgelesen" verschlucken.
    if (level === 'debug') { log.debug('TTS', msg); return; }
    const now = Date.now();
    if (now - this.lastTtsDecisionLogAt < 2000) return;
    this.lastTtsDecisionLogAt = now;
    log.info('TTS', msg);
  }

  /** Ansage „neuer Follower" — eigener Schalter/Text/Stimme, unabhängig vom Chat. */
  private maybeAnnounceFollow(event: StudioEvent, regelLiestSchonVor = false): void {
    const cfg = this.settings.peek().tts.announceFollow;
    if (!cfg?.enabled) return;
    // Wie bei Geschenken: liest schon eine Trigger-Regel vor, nicht doppeln.
    if (regelLiestSchonVor) {
      log.info('TTS', 'Follower-Ansage übersprungen — eine Trigger-Regel liest diesen Follow bereits vor');
      return;
    }
    log.info('TTS', `Follower-Ansage: ${event.user?.nickname ?? '—'}`);
    this.speakForEvent(cfg.template, event, cfg.voice || undefined);
  }

  /** Ansage „großes Gift" ab eingestellter Coin-Schwelle. */
  private maybeAnnounceGift(event: StudioEvent, regelLiestSchonVor = false): void {
    const cfg = this.settings.peek().tts.announceGift;
    if (!cfg?.enabled || !event.gift) return;
    if (!shouldAnnounceGift(event.gift.totalCoins, cfg)) return;
    // Eine Trigger-Regel liest dieses Geschenk bereits vor → nicht doppelt ansagen.
    if (regelLiestSchonVor) {
      log.info('TTS', 'Gift-Ansage übersprungen — eine Trigger-Regel liest dieses Geschenk bereits vor');
      return;
    }
    log.info('TTS', `Gift-Ansage: ${event.user?.nickname ?? '—'} (${event.gift.totalCoins} Coins)`);
    this.speakForEvent(cfg.template, event, cfg.voice || undefined);
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

  playSound(soundId: string, volume?: number, category: SoundCategory = 'soundboard'): void {
    // `vol` ist die PRO-SOUND-Lautstärke (Standard 1). Die globale Skalierung
    // macht der Mixer im Renderer (Master × Kanal) — deshalb hier KEIN
    // soundVolume mehr (das war der zweite Master, siehe Migration v6→v7).
    const vol = volume ?? 1;
    const url = `http://127.0.0.1:${this.server.getPort()}/sounds/${encodeURIComponent(soundId)}?token=${this.server.getToken()}`;
    this.hooks.onSoundPlay({ soundId, url, volume: vol, category });
  }

  /** MyInstants-Treffer vorhören (ohne Import): über den lokalen /preview-Proxy,
   *  damit es CSP-konform über dasselbe Audio-System wie alle Sounds läuft. */
  previewSound(mp3Url: string): void {
    const url = `http://127.0.0.1:${this.server.getPort()}/preview?url=${encodeURIComponent(mp3Url)}&token=${this.server.getToken()}`;
    // Vorhören auf Master-Lautstärke, damit es so laut klingt wie im echten Betrieb.
    this.hooks.onSoundPlay({ soundId: 'preview', url, volume: this.settings.get().mixer.master });
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
    // Hinweis: „Letztes Live" wird in resetSession() (an freshStream gekoppelt)
    // geleert — NICHT hier, weil onAvailableGifts auch bei jedem Reconnect läuft.
    let imported = 0;
    for (const raw of list) {
      const g = raw as { id?: number; gift_id?: number; name?: string; describe?: string; diamondCount?: number; diamond_count?: number; image?: { url_list?: string[]; urlList?: string[] }; icon?: { url_list?: string[]; urlList?: string[] } };
      const name = g.name || g.describe;
      if (!name) continue;
      const img = g.image ?? g.icon;
      const icon = img?.url_list?.[0] ?? img?.urlList?.[0];
      // count:0 → nur Bild/Coins in den Katalog, markiert NICHT als „erhalten".
      this.giftCatalog.record({ slug: name, giftId: g.id ?? g.gift_id, icon, coinsPerUnit: g.diamondCount ?? g.diamond_count ?? 0, count: 0 });
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
    return playReplay(entries, (e) => this.bus.publish({ ...e, synthetic: true }), {
      speed,
      signal: this.replayAbort.signal,
    });
  }

  stopReplay(): void {
    this.replayAbort?.abort();
  }

  /** Einzelnes Test-Event aus der UI (z.B. "Test-Gift 100 Coins"). */
  injectTestEvent(event: StudioEvent): void {
    this.bus.publish({ ...event, ts: Date.now(), synthetic: true });
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
