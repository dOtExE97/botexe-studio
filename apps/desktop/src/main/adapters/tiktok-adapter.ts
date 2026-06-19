// tiktok-adapter.ts — verbindet TikTok-Live (tiktok-live-connector v2-API),
// normalisiert Events und publisht sie auf den EventBus.
//
// Audit-Fixes der Alt-App fest eingebaut:
// • K2: Vor JEDEM (Re-)Connect wird die alte Connection abgeräumt
//   (removeAllListeners + disconnect) und ein Epoch-Token entwertet alle
//   Handler/Timer der Vorgänger-Generation → keine Doppel-Connections,
//   keine Doppel-Events, auch wenn der User während eines laufenden
//   Auto-Reconnects manuell neu verbindet.
// • K1: 'connected' wird mit isReconnect-Flag gemeldet — die Verdrahtung
//   entscheidet pro Service, was bei einem Re-Connect zurückgesetzt wird.
import type { StudioEvent } from '@botexe/trigger-engine';
import type { EventBus } from '../core/event-bus';
import { log } from '../core/logger';
import {
  normalizeChat,
  normalizeGift,
  normalizeLike,
  normalizeSocial,
  normalizeViewerCount,
} from './tiktok-normalize';

export type AdapterStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface AdapterStatusInfo {
  status: AdapterStatus;
  isReconnect: boolean;
  attempt?: number;
  detail?: string;
  /** true beim Connect zu einem NEUEN Stream (erster Connect ODER erneutes Live
   *  nach Stream-Ende) — NICHT bei einem Reconnect nach kurzem Verbindungsabriss.
   *  Signal für „Session zurücksetzen" (Zähler/Top-Listen im Overlay). */
  freshStream?: boolean;
}

/** Minimal-Interface der Live-Connection — in Tests durch Fake ersetzt. */
export interface LiveConnectionLike {
  connect(): Promise<Record<string, unknown>>;
  disconnect(): void | Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, cb: (...args: any[]) => void): unknown;
  removeAllListeners(): unknown;
  /** Nachricht in den Live-Chat senden (braucht sessionId). Optional in Tests. */
  sendMessage?(content: string, options?: Record<string, unknown>): Promise<unknown>;
}

export interface TikTokAuth {
  sessionId?: string;
  ttTargetIdc?: string;
  signApiKey?: string;
}

export type ConnectionFactory = (username: string, auth: TikTokAuth) => LiveConnectionLike;

export interface TikTokAdapterOptions {
  factory?: ConnectionFactory;
  onStatus?: (info: AdapterStatusInfo) => void;
  /** Komplette Gift-Liste des Rooms (mit Bildern) nach dem Connect. */
  onAvailableGifts?: (gifts: unknown) => void;
  maxReconnect?: number;
  baseReconnectDelayMs?: number;
  jitterMs?: number;
  now?: () => number;
  /** Wie TikFinity: nach Stream-Ende auf das nächste Live warten & automatisch verbinden. */
  autoConnect?: boolean;
  /** Poll-Intervall des Live-Watches (ms). */
  livePollMs?: number;
  /** Prüft, ob @username gerade live ist (in Tests injizierbar). */
  checkLive?: (username: string) => Promise<boolean>;
  /** Login-Daten fürs Chat-Senden (sessionid-Cookie + optionaler Sign-Key). */
  getAuth?: () => TikTokAuth;
}

const DEFAULTS = {
  maxReconnect: 5,
  baseReconnectDelayMs: 3_000,
  jitterMs: 1_000,
  // Auto-Connect-Live-Watch: Im Cloud-Modus öffnet jeder Tick eine echte Cloud-WS
  // (Live-Check). 30s schont das Gratis-Kontingent (10 WS / 1000 Req/Tag) deutlich,
  // ohne dass das Auto-Verbinden spürbar träge wird.
  livePollMs: 30_000,
};

/** Direkter Weg: tiktok-live-connector signiert selbst (braucht Business-Key),
 *  kann dafür auch Chat senden. Exportiert, damit die Verdrahtung je nach
 *  Verbindungsmodus zwischen diesem und dem Cloud-Weg wählen kann. */
export function createDirectConnection(username: string, auth: TikTokAuth): LiveConnectionLike {
  return defaultFactory(username, auth);
}

function defaultFactory(username: string, auth: TikTokAuth): LiveConnectionLike {
  // Lazy import: hält Tests und Startpfad frei von der schweren Lib.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TikTokLiveConnection } = require('tiktok-live-connector');
  return new TikTokLiveConnection(username, {
    processInitialData: true,
    enableExtendedGiftInfo: true,
    fetchRoomInfoOnConnect: true,
    // WICHTIG: sessionId hier NICHT setzen — die Lib verlangt dann zwingend
    // ttTargetIdc, sonst wirft der Konstruktor und JEDER Connect crasht.
    // Die Login-Daten geben wir stattdessen explizit beim sendMessage() mit.
    ...(auth.signApiKey ? { signApiKey: auth.signApiKey } : {}),
  });
}

export class TikTokAdapter {
  private readonly bus: EventBus;
  private readonly factory: ConnectionFactory;
  private readonly onStatus: (info: AdapterStatusInfo) => void;
  private readonly onAvailableGifts?: (gifts: unknown) => void;
  private readonly maxReconnect: number;
  private readonly baseReconnectDelayMs: number;
  private readonly jitterMs: number;
  private readonly now: () => number;
  private autoConnect: boolean;
  private readonly livePollMs: number;
  private readonly checkLive: (username: string) => Promise<boolean>;
  private readonly getAuth: () => TikTokAuth;
  private liveWatchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Generation-Token: jede connect()/disconnect()-Entscheidung erhöht es —
   * Handler und Timer älterer Generationen erkennen sich als veraltet. */
  private epoch = 0;
  private connection: LiveConnectionLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private username = '';
  private streamEnded = false;
  private hasConnectedOnce = false;
  /** Markiert den nächsten erfolgreichen Connect als „neuer Stream" (→ Reset).
   *  Gesetzt vom Live-Watch (erneutes Live nach Stream-Ende / nach „nicht online"). */
  private pendingFresh = false;

  constructor(bus: EventBus, options: TikTokAdapterOptions = {}) {
    this.bus = bus;
    this.factory = options.factory ?? defaultFactory;
    this.onStatus = options.onStatus ?? (() => undefined);
    this.onAvailableGifts = options.onAvailableGifts;
    this.maxReconnect = options.maxReconnect ?? DEFAULTS.maxReconnect;
    this.baseReconnectDelayMs = options.baseReconnectDelayMs ?? DEFAULTS.baseReconnectDelayMs;
    this.jitterMs = options.jitterMs ?? DEFAULTS.jitterMs;
    this.now = options.now ?? Date.now;
    this.autoConnect = options.autoConnect ?? false;
    this.livePollMs = options.livePollMs ?? DEFAULTS.livePollMs;
    this.checkLive = options.checkLive ?? ((u) => this.defaultCheckLive(u));
    this.getAuth = options.getAuth ?? (() => ({}));
  }

  /** Nachricht in den Live-Chat senden — Login explizit übergeben, damit es auch
   *  funktioniert, wenn man sich NACH dem Verbinden eingeloggt hat. */
  async sendChat(text: string): Promise<{ ok: boolean; error?: string }> {
    const clean = text.trim().slice(0, 150);
    if (!clean) return { ok: false, error: 'leer' };
    if (!this.connection) return { ok: false, error: 'nicht verbunden — erst mit deinem Live verbinden' };
    // Cloud-Verbindung kann grundsätzlich kein Chat-Senden (nur Empfangen) →
    // klare Meldung, BEVOR wir den Login bemängeln.
    if (typeof this.connection.sendMessage !== 'function') {
      return { ok: false, error: 'Chat-Senden geht im Cloud-Modus (gratis) nicht — in Einstellungen → TikTok-Verbindung auf „Direkt" umstellen (braucht Business-Sign-Key).' };
    }
    const auth = this.getAuth();
    if (!auth.sessionId || !auth.ttTargetIdc) {
      return { ok: false, error: 'kein vollständiger TikTok-Login — in den Einstellungen neu „Mit TikTok anmelden"' };
    }
    try {
      await this.connection.sendMessage(clean, { sessionId: auth.sessionId, ttTargetIdc: auth.ttTargetIdc });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Auto-Connect (Live-Watch) zur Laufzeit umschalten. */
  setAutoConnect(enabled: boolean): void {
    this.autoConnect = enabled;
    if (!enabled) this.clearLiveWatch();
  }

  /** Default-Live-Check: leichte Wegwerf-Connection, fragt fetchIsLive(). */
  private async defaultCheckLive(username: string): Promise<boolean> {
    try {
      const conn = this.factory(username, this.getAuth()) as unknown as {
        fetchIsLive?: () => Promise<boolean>;
        disconnect?: () => void;
      };
      const live = await conn.fetchIsLive?.();
      try { conn.disconnect?.(); } catch { /* egal */ }
      return Boolean(live);
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.hasConnectedOnce;
  }

  async connect(username: string): Promise<void> {
    this.username = username.replace(/^@/, '');
    this.reconnectAttempts = 0;
    this.streamEnded = false;
    this.hasConnectedOnce = false;
    await this.doConnect(++this.epoch, false);
  }

  /** Ohne sofortigen Connect-Versuch auf das nächste Live warten und dann
   *  automatisch verbinden — für „erkenne beim App-Start, wenn ich live gehe".
   *  Nutzt den (billigen) checkLive-Poll, verbrennt also kein Sign-Kontingent. */
  watchForLive(username: string): void {
    this.username = username.replace(/^@/, '');
    this.reconnectAttempts = 0;
    this.streamEnded = false;
    this.hasConnectedOnce = false;
    this.pendingFresh = true; // erstes Live = neuer Stream → Session-Reset
    const epoch = ++this.epoch;
    this.clearReconnectTimer();
    this.cleanupConnection();
    this.startLiveWatch(epoch);
  }

  async disconnect(): Promise<void> {
    this.epoch++; // entwertet laufende Handler/Timer/Connect-Promises
    this.clearReconnectTimer();
    this.clearLiveWatch();
    this.cleanupConnection();
    this.emitStatus({ status: 'disconnected', isReconnect: false });
    log.info('TikTok', 'Getrennt (manuell)');
  }

  private async doConnect(epoch: number, isReconnect: boolean): Promise<void> {
    if (epoch !== this.epoch) return; // veraltete Generation

    // K2: alte Connection IMMER zuerst abräumen.
    this.clearReconnectTimer();
    this.clearLiveWatch();
    this.cleanupConnection();

    this.emitStatus({ status: isReconnect ? 'reconnecting' : 'connecting', isReconnect });
    log.info('TikTok', `${isReconnect ? 'Re-Connect' : 'Verbinde'} mit @${this.username}…`);

    const conn = this.factory(this.username, this.getAuth());
    this.connection = conn;
    this.attachHandlers(conn, epoch);

    try {
      const state = await conn.connect();
      if (epoch !== this.epoch) {
        // Während des Connects kam ein neuer connect()/disconnect() — diese
        // Connection ist schon wieder Geschichte.
        conn.removeAllListeners();
        void conn.disconnect();
        return;
      }
      this.reconnectAttempts = 0;
      // Neuer Stream = erster Connect ODER erneutes Live nach Stream-Ende
      // (pendingFresh vom Live-Watch). NICHT bei Reconnect nach kurzem Abriss.
      const freshStream = !isReconnect || this.pendingFresh;
      this.pendingFresh = false;
      this.hasConnectedOnce = true;
      this.emitStatus({ status: 'connected', isReconnect, freshStream });
      log.info('TikTok', `Verbunden! Room: ${String(state.roomId ?? '?')}`);

      // Gift-Katalog: komplette Gift-Liste (mit Bildern) abrufen — best-effort.
      if (this.onAvailableGifts) {
        const cb = this.onAvailableGifts;
        void (conn as unknown as { fetchAvailableGifts?: () => Promise<unknown> })
          .fetchAvailableGifts?.()
          ?.then((gifts) => {
            if (epoch === this.epoch && gifts) cb(gifts);
          })
          .catch((err: Error) => log.warn('TikTok', 'Gift-Liste nicht abrufbar', err.message));
      }

      const viewers = typeof state.viewerCount === 'number' ? state.viewerCount : 0;
      if (viewers > 0) {
        this.bus.publish(normalizeViewerCount({ viewerCount: viewers }, this.now()));
      }
    } catch (err) {
      if (epoch !== this.epoch) return;
      const msg = (err as Error).message || '';
      log.error('TikTok', 'Verbindung fehlgeschlagen', msg);
      // Externer Sign-Server (eulerstream) lehnt ab → Retry ist zwecklos und
      // verbrennt nur Kontingent. Sofort aufgeben mit klarer, handlungsfähiger
      // Meldung (Sign-Key nötig).
      if (isSignServerError(msg)) {
        this.pendingFresh = false;
        log.error('TikTok', 'eulerstream-Sign verweigert — kein Reconnect. Lösung: gratis Sign-Key unter Einstellungen → TikTok-Sign-Key.');
        this.emitStatus({
          status: 'error',
          isReconnect,
          detail: 'Verbindung verweigert vom TikTok-Sign-Server (eulerstream). Der kostenlose Webcast-Sign braucht jetzt einen API-Key: gratis Community-Key auf eulerstream.com holen → Einstellungen → TikTok-Sign-Key eintragen.',
        });
        return;
      }
      this.emitStatus({ status: 'error', isReconnect, detail: msg });
      // „Noch nicht live" ist KEIN Abbruchfehler: statt nach 5 Versuchen aufzugeben,
      // auf das Live warten und automatisch verbinden (wie nach Stream-Ende) — der
      // Streamer muss nicht mehr manuell „Verbinden" klicken, wenn er live geht.
      if (this.autoConnect && isOfflineError(msg)) {
        this.pendingFresh = true; // erstes Live = neuer Stream → Reset
        this.startLiveWatch(epoch);
      } else {
        // Kurz-Abriss-Reconnect: ein evtl. gesetztes pendingFresh NICHT
        // verschleppen (sonst löst der nächste Reconnect fälschlich Reset aus).
        this.pendingFresh = false;
        this.scheduleReconnect(epoch);
      }
    }
  }

  private attachHandlers(conn: LiveConnectionLike, epoch: number): void {
    // Doppelter Schutz: Epoch-Vergleich UND Identitäts-Check — Events einer
    // ersetzten Connection werden verworfen, selbst wenn removeAllListeners
    // irgendwo nicht griff.
    const guard = <T>(fn: (data: T) => void) => {
      return (data: T) => {
        if (epoch !== this.epoch || conn !== this.connection) return;
        fn(data);
      };
    };
    const publish = (e: StudioEvent | null) => {
      if (e) this.bus.publish(e);
    };

    const on = conn.on.bind(conn) as (event: string, cb: (data: never) => void) => unknown;
    on('chat', guard((d: Parameters<typeof normalizeChat>[0]) => publish(normalizeChat(d, this.now()))));
    on('gift', guard((d: Parameters<typeof normalizeGift>[0]) => publish(normalizeGift(d, this.now()))));
    on('like', guard((d: Parameters<typeof normalizeLike>[0]) => publish(normalizeLike(d, this.now()))));
    on('follow', guard((d: Parameters<typeof normalizeSocial>[0]) => publish(normalizeSocial(d, 'follow', this.now()))));
    on('share', guard((d: Parameters<typeof normalizeSocial>[0]) => publish(normalizeSocial(d, 'share', this.now()))));
    on('member', guard((d: Parameters<typeof normalizeSocial>[0]) => publish(normalizeSocial(d, 'join', this.now()))));
    on('roomUser', guard((d: Parameters<typeof normalizeViewerCount>[0]) => publish(normalizeViewerCount(d, this.now()))));

    on('streamEnd', guard(() => {
      log.info('TikTok', 'Stream beendet');
      this.streamEnded = true;
      // TikFinity-Verhalten: auf das nächste Live warten und automatisch zurück.
      if (this.autoConnect) this.startLiveWatch(epoch);
    }));

    on('disconnected', guard(() => {
      log.warn('TikTok', 'Verbindung getrennt');
      this.emitStatus({ status: 'disconnected', isReconnect: false });
      if (!this.streamEnded) {
        this.scheduleReconnect(epoch);
      }
    }));

    on('error', guard((err: { message?: string; info?: string } | undefined) => {
      // Die Lib feuert hier oft ein nacktes Objekt ohne .message → früher stand
      // „[object Object]" im Log. Nur message/info loggen — NICHT das ganze Objekt
      // serialisieren: es kann sessionId/Keys enthalten, die sonst in der
      // (teilbaren) Logdatei landen würden.
      const detail = err?.message ?? err?.info ?? (err ? 'Fehler-Objekt ohne Details (Secrets nicht geloggt)' : 'unbekannt');
      log.error('TikTok', 'Connection-Fehler', detail);
    }));
  }

  private scheduleReconnect(epoch: number): void {
    if (epoch !== this.epoch) return;
    if (this.reconnectTimer) return; // bereits geplant
    if (this.reconnectAttempts >= this.maxReconnect) {
      log.error('TikTok', `Max. Reconnect-Versuche (${this.maxReconnect}) erreicht — gebe auf`);
      this.emitStatus({ status: 'error', isReconnect: true, detail: 'max-reconnect erreicht' });
      return;
    }

    this.reconnectAttempts++;
    const attempt = this.reconnectAttempts;
    const delay =
      this.baseReconnectDelayMs * Math.pow(2, attempt - 1) + Math.random() * this.jitterMs;
    log.info('TikTok', `Reconnect #${attempt} in ${(delay / 1000).toFixed(1)}s`);
    this.emitStatus({ status: 'reconnecting', isReconnect: true, attempt });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.doConnect(epoch, true);
    }, delay);
  }

  /** Pollt periodisch, ob @username wieder live ist — dann automatisch verbinden. */
  private startLiveWatch(epoch: number): void {
    if (epoch !== this.epoch) return;
    if (this.liveWatchTimer) return; // läuft schon
    log.info('TikTok', `Auto-Connect: warte, bis @${this.username} wieder live geht…`);
    this.emitStatus({ status: 'reconnecting', isReconnect: true, detail: 'warte auf Live' });

    const tick = async (): Promise<void> => {
      this.liveWatchTimer = null;
      if (epoch !== this.epoch) return;
      let live = false;
      try {
        live = await this.checkLive(this.username);
      } catch (err) {
        log.warn('TikTok', 'Live-Check fehlgeschlagen', (err as Error).message);
      }
      if (epoch !== this.epoch) return; // zwischenzeitlich manuell ge-connectet/getrennt
      if (live) {
        log.info('TikTok', `@${this.username} ist wieder live → verbinde automatisch`);
        this.streamEnded = false;
        this.pendingFresh = true; // erneutes Live = neuer Stream → Session-Reset
        void this.doConnect(epoch, true);
      } else {
        this.liveWatchTimer = setTimeout(() => void tick(), this.livePollMs);
      }
    };
    this.liveWatchTimer = setTimeout(() => void tick(), this.livePollMs);
  }

  private clearLiveWatch(): void {
    if (this.liveWatchTimer) {
      clearTimeout(this.liveWatchTimer);
      this.liveWatchTimer = null;
    }
  }

  private cleanupConnection(): void {
    if (!this.connection) return;
    const old = this.connection;
    this.connection = null;
    old.removeAllListeners();
    try {
      void old.disconnect();
    } catch (err) {
      log.warn('TikTok', 'Fehler beim Trennen der alten Connection', (err as Error).message);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emitStatus(info: AdapterStatusInfo): void {
    try {
      this.onStatus(info);
    } catch (err) {
      log.error('TikTok', 'onStatus-Callback warf', (err as Error).message);
    }
  }
}

/** „Streamer ist (noch) nicht live" — kein Fehler zum Aufgeben, sondern Anlass,
 *  auf das Live zu warten. Deckt die TikTok-Lib-Meldungen ab. */
export function isOfflineError(msg: string): boolean {
  // Konservativ: nur eindeutige „nicht live"-Meldungen. NICHT „room not found"
  // o.Ä. (mehrdeutig: Tippfehler im Namen, Auth-/Sign-Fehler) — sonst würde die
  // App ewig auf ein Live warten, das nie kommt, statt normal zu reconnecten.
  return /isn'?t online|is not online|not online|user_offline|user is offline|live (has )?ended|isn'?t live/i
    .test(String(msg || ''));
}

/** Fehler vom externen Sign-Server (eulerstream): Retry zwecklos, braucht einen
 *  API-Key/Plan. Klar abgrenzen von „offline" o.Ä. */
export function isSignServerError(msg: string): boolean {
  return /sign a request|eulerstream|business plan|signature/i.test(String(msg || ''));
}
