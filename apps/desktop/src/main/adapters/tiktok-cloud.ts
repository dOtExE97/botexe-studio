// tiktok-cloud.ts — GRATIS Verbindungsweg über Eulers „Cloud WebSocket".
//
// Hintergrund: tiktok-live-connector signiert die Webcast-Verbindung selbst und
// braucht dafür Eulers Webcast-Signatur — die ist im Gratis-Plan gesperrt
// („requires a Business plan"). Euler hostet die Verbindung aber ALTERNATIV
// selbst („Cloud WebSocket", 10 Stück im Community-Free-Plan). Man verbindet
// sich nur zu wss://ws.eulerstream.com, Euler signiert intern.
//
// Trick für minimale Divergenz: EulerCloudConnection emittiert EXAKT die
// gleichen High-Level-Events ('chat','gift','like','follow','share','member',
// 'roomUser','streamEnd','disconnected','error') wie tiktok-live-connector.
// Dadurch funktioniert der komplette bestehende TikTokAdapter unverändert —
// nur die Factory wird getauscht.
import { EventEmitter } from 'node:events';
import { log } from '../core/logger';
import type { LiveConnectionLike } from './tiktok-adapter';

const CLOUD_BASE_URL = 'wss://ws.eulerstream.com';

/** @username/URL-Form → reiner uniqueId (gleiche Regeln wie das Euler-SDK). */
export function normalizeUniqueId(uniqueId: string): string {
  return uniqueId
    .replace('https://www.tiktok.com/', '')
    .replace('/live', '')
    .replace('@', '')
    .trim();
}

export function buildCloudUrl(opts: { uniqueId: string; apiKey: string; baseUrl?: string }): string {
  const params = new URLSearchParams({
    uniqueId: normalizeUniqueId(opts.uniqueId),
    apiKey: opts.apiKey,
    // Gebündelte, bereits dekodierte JSON-Events (kein Protobuf im Client).
    'features.bundleEvents': 'true',
  });
  return `${opts.baseUrl ?? CLOUD_BASE_URL}?${params.toString()}`;
}

export type CloudEmitEvent = 'chat' | 'gift' | 'like' | 'follow' | 'share' | 'member' | 'roomUser';

export type CloudEmit =
  | { kind: 'event'; event: CloudEmitEvent; data: unknown }
  | { kind: 'connected' }
  | { kind: 'streamEnd' }
  | { kind: 'disconnected' };

/** Direkte Typ→Event-Tabelle (entspricht tiktok-live-connector WebcastEventMap). */
const TYPE_TO_EVENT: Record<string, CloudEmitEvent> = {
  WebcastChatMessage: 'chat',
  WebcastGiftMessage: 'gift',
  WebcastLikeMessage: 'like',
  WebcastMemberMessage: 'member',
  WebcastRoomUserSeqMessage: 'roomUser',
};

// Stream-Ende laut ControlAction (3 = ENDED, 4 = SUSPENDED).
const CONTROL_STREAM_ENDED = 3;
const CONTROL_STREAM_SUSPENDED = 4;

/**
 * Reiner Router: bildet eine dekodierte Cloud-Nachricht {type,data} auf ein
 * High-Level-Event ab — oder auf ein Verbindungs-Signal. null = ignorieren.
 * Spiegelt die Routing-Logik von tiktok-live-connector (inkl. Social-Split).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapCloudMessage(type: string, data: any): CloudEmit | null {
  const direct = TYPE_TO_EVENT[type];
  if (direct) return { kind: 'event', event: direct, data };

  switch (type) {
    case 'WebcastSocialMessage': {
      const dt: string = data?.common?.displayText?.displayType ?? '';
      if (dt.includes('follow')) return { kind: 'event', event: 'follow', data };
      if (dt.includes('share')) return { kind: 'event', event: 'share', data };
      return null; // sonstige Social-Nachrichten interessieren uns nicht
    }
    case 'WebcastControlMessage':
      return data?.action === CONTROL_STREAM_ENDED || data?.action === CONTROL_STREAM_SUSPENDED
        ? { kind: 'streamEnd' }
        : null;
    // Euler-Custom-Frames (kein Webcast-Protobuf):
    case 'tiktok.connect':
    case 'roomInfo':
      return { kind: 'connected' };
    case 'tiktok.disconnect':
      return { kind: 'disconnected' };
    default:
      return null; // workerInfo, decodeError, SyntheticPresence, unbekannt …
  }
}

/** Minimal-Interface eines WebSocket — in Tests durch Fake ersetzt. */
export interface CloudWsLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, cb: (...args: any[]) => void): unknown;
  close(): void;
  /** Beim Trennen die WS-Handler abräumen (die echte ws-Lib kann das). */
  removeAllListeners?(): void;
}

export type CloudWsFactory = (url: string) => CloudWsLike;

export interface EulerCloudOptions {
  apiKey: string;
  wsFactory?: CloudWsFactory;
  baseUrl?: string;
  connectTimeoutMs?: number;
}

function defaultWsFactory(url: string): CloudWsLike {
  // Lazy import: hält Tests/Startpfad frei von der ws-Lib.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const WebSocket = require('ws');
  return new WebSocket(url) as CloudWsLike;
}

/** Schließt einen Close-Code in eine Fehlermeldung um, deren Wortlaut die
 *  Klassifizierung im TikTokAdapter (isOfflineError / isSignServerError) trifft. */
function closeRejectMessage(code: number, reason: string): string {
  switch (code) {
    case 4404: // NOT_LIVE → als „offline" werten (App wartet ggf. auf Live)
      return `Streamer ist nicht live (isn't live): ${reason || 'noch nicht online'}`;
    case 4401: // INVALID_AUTH
    case 4403: // NO_PERMISSION
      return `eulerstream Cloud-Sign abgelehnt (Code ${code}, API-Key/Plan): ${reason}`;
    default:
      return `Cloud-WS geschlossen (Code ${code})${reason ? `: ${reason}` : ''}`;
  }
}

const STREAM_END_CLOSE_CODES = new Set([4005 /* STREAM_END */]);

/**
 * Verbindung über Eulers Cloud-WebSocket, getarnt als LiveConnectionLike, damit
 * der bestehende TikTokAdapter sie 1:1 wie eine tiktok-live-connector-Connection
 * nutzen kann.
 */
export class EulerCloudConnection extends EventEmitter implements LiveConnectionLike {
  private readonly url: string;
  private readonly wsFactory: CloudWsFactory;
  private readonly connectTimeoutMs: number;
  private ws: CloudWsLike | null = null;
  private settled = false;
  private connectedOnce = false;
  /** true ab disconnect() → unterdrückt Geister-Events eines selbst ausgelösten Close. */
  private closing = false;

  constructor(username: string, opts: EulerCloudOptions) {
    super();
    this.url = buildCloudUrl({ uniqueId: username, apiKey: opts.apiKey, baseUrl: opts.baseUrl });
    this.wsFactory = opts.wsFactory ?? defaultWsFactory;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 20_000;
  }

  connect(): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.settled = false;
      this.closing = false;
      // Doppel-connect()/Alt-WS schützen: eine evtl. bestehende WS sauber schließen
      // (sonst leakt sie gegen das 10-Cloud-WS-Limit).
      if (this.ws) { try { this.ws.removeAllListeners?.(); this.ws.close(); } catch { /* egal */ } this.ws = null; }
      const ws = this.wsFactory(this.url);
      this.ws = ws;

      const timer = setTimeout(() => {
        if (this.settled) return;
        this.settled = true;
        try { ws.close(); } catch { /* egal */ }
        reject(new Error('Cloud-WS antwortet nicht (Timeout)'));
      }, this.connectTimeoutMs);

      const settleOk = () => {
        if (this.settled) return;
        this.settled = true;
        this.connectedOnce = true;
        clearTimeout(timer);
        resolve({});
      };

      ws.on('message', (raw: unknown) => {
        for (const m of parseFrames(raw)) {
          const r = mapCloudMessage(m.type, m.data);
          if (!r) continue;
          if (r.kind === 'event') { settleOk(); this.emit(r.event, r.data); }
          else if (r.kind === 'connected') settleOk();
          else if (r.kind === 'streamEnd') this.emit('streamEnd', {});
          else if (r.kind === 'disconnected') this.emit('disconnected');
        }
      });

      ws.on('close', (code: number, reasonBuf: unknown) => {
        const reason = reasonBuf ? String(reasonBuf) : '';
        if (!this.settled) {
          this.settled = true;
          clearTimeout(timer);
          reject(new Error(closeRejectMessage(Number(code), reason)));
          return;
        }
        // Selbst ausgelöster Close (disconnect) → keine Geister-Events.
        if (this.closing) return;
        if (STREAM_END_CLOSE_CODES.has(Number(code))) this.emit('streamEnd', {});
        this.emit('disconnected');
      });

      ws.on('error', (err: { message?: string } | undefined) => {
        // Nur message loggen — niemals das ganze Objekt (kann den Key enthalten).
        log.warn('TikTokCloud', 'WS-Fehler', err?.message ?? 'unbekannt');
        this.emit('error', { message: err?.message });
      });
    });
  }

  disconnect(): void {
    this.closing = true;
    if (this.ws) {
      // Erst Handler abräumen (kein Geister-'disconnected'/'streamEnd' nach close),
      // dann schließen.
      try { this.ws.removeAllListeners?.(); this.ws.close(); } catch { /* egal */ }
      this.ws = null;
    }
  }

  /** Live-Check für den Auto-Connect-Watch: kurz verbinden, sofort wieder
   *  trennen. connect() löst nur bei echtem Live auf, sonst (Close 4404) reject. */
  async fetchIsLive(): Promise<boolean> {
    try {
      await this.connect();
      this.disconnect();
      return true;
    } catch {
      this.disconnect();
      return false;
    }
  }

  /** Ob bereits einmal eine Live-Verbindung stand (für Diagnose/Tests). */
  get isLive(): boolean {
    return this.connectedOnce;
  }
}

/** Ein WS-Frame kann ein Bündel ({messages:[…]}) oder eine einzelne Nachricht sein. */
function parseFrames(raw: unknown): Array<{ type: string; data: unknown }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    return [];
  }
  const obj = parsed as { messages?: Array<{ type: string; data: unknown }>; type?: string; data?: unknown };
  if (Array.isArray(obj.messages)) return obj.messages.filter((m) => m && typeof m.type === 'string');
  if (typeof obj.type === 'string') return [{ type: obj.type, data: obj.data }];
  return [];
}
