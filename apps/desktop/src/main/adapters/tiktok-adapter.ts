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
}

/** Minimal-Interface der Live-Connection — in Tests durch Fake ersetzt. */
export interface LiveConnectionLike {
  connect(): Promise<Record<string, unknown>>;
  disconnect(): void | Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, cb: (...args: any[]) => void): unknown;
  removeAllListeners(): unknown;
}

export type ConnectionFactory = (username: string) => LiveConnectionLike;

export interface TikTokAdapterOptions {
  factory?: ConnectionFactory;
  onStatus?: (info: AdapterStatusInfo) => void;
  /** Komplette Gift-Liste des Rooms (mit Bildern) nach dem Connect. */
  onAvailableGifts?: (gifts: unknown) => void;
  maxReconnect?: number;
  baseReconnectDelayMs?: number;
  jitterMs?: number;
  now?: () => number;
}

const DEFAULTS = {
  maxReconnect: 5,
  baseReconnectDelayMs: 3_000,
  jitterMs: 1_000,
};

function defaultFactory(username: string): LiveConnectionLike {
  // Lazy import: hält Tests und Startpfad frei von der schweren Lib.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TikTokLiveConnection } = require('tiktok-live-connector');
  return new TikTokLiveConnection(username, {
    processInitialData: true,
    enableExtendedGiftInfo: true,
    fetchRoomInfoOnConnect: true,
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

  /** Generation-Token: jede connect()/disconnect()-Entscheidung erhöht es —
   * Handler und Timer älterer Generationen erkennen sich als veraltet. */
  private epoch = 0;
  private connection: LiveConnectionLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private username = '';
  private streamEnded = false;
  private hasConnectedOnce = false;

  constructor(bus: EventBus, options: TikTokAdapterOptions = {}) {
    this.bus = bus;
    this.factory = options.factory ?? defaultFactory;
    this.onStatus = options.onStatus ?? (() => undefined);
    this.onAvailableGifts = options.onAvailableGifts;
    this.maxReconnect = options.maxReconnect ?? DEFAULTS.maxReconnect;
    this.baseReconnectDelayMs = options.baseReconnectDelayMs ?? DEFAULTS.baseReconnectDelayMs;
    this.jitterMs = options.jitterMs ?? DEFAULTS.jitterMs;
    this.now = options.now ?? Date.now;
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

  async disconnect(): Promise<void> {
    this.epoch++; // entwertet laufende Handler/Timer/Connect-Promises
    this.clearReconnectTimer();
    this.cleanupConnection();
    this.emitStatus({ status: 'disconnected', isReconnect: false });
    log.info('TikTok', 'Getrennt (manuell)');
  }

  private async doConnect(epoch: number, isReconnect: boolean): Promise<void> {
    if (epoch !== this.epoch) return; // veraltete Generation

    // K2: alte Connection IMMER zuerst abräumen.
    this.clearReconnectTimer();
    this.cleanupConnection();

    this.emitStatus({ status: isReconnect ? 'reconnecting' : 'connecting', isReconnect });
    log.info('TikTok', `${isReconnect ? 'Re-Connect' : 'Verbinde'} mit @${this.username}…`);

    const conn = this.factory(this.username);
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
      this.hasConnectedOnce = true;
      this.emitStatus({ status: 'connected', isReconnect });
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
      log.error('TikTok', 'Verbindung fehlgeschlagen', (err as Error).message);
      this.emitStatus({ status: 'error', isReconnect, detail: (err as Error).message });
      this.scheduleReconnect(epoch);
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
    on('roomUser', guard((d: Parameters<typeof normalizeViewerCount>[0]) => publish(normalizeViewerCount(d, this.now()))));

    on('streamEnd', guard(() => {
      log.info('TikTok', 'Stream beendet');
      this.streamEnded = true;
    }));

    on('disconnected', guard(() => {
      log.warn('TikTok', 'Verbindung getrennt');
      this.emitStatus({ status: 'disconnected', isReconnect: false });
      if (!this.streamEnded) {
        this.scheduleReconnect(epoch);
      }
    }));

    on('error', guard((err: { message?: string }) => {
      log.error('TikTok', 'Connection-Fehler', err?.message ?? String(err));
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
