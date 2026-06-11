// overlay-server.ts — hostet den EINEN Overlay-Link für TikTok Live Studio:
//   http://127.0.0.1:<port>/overlay?token=…  (transparenter Canvas, 1920×1080)
// plus WebSocket (/ws) für Live-Events/Layout/Actions und statische Files
// (Overlay-Runtime + Widget-Kit).
//
// Übernommen aus botexe-app, mit Fixes:
// • H8: Ping/Pong-Heartbeat — tote TTLS-Verbindungen werden terminiert.
// • H8-Leak: EIN persistenter Bus-Subscribe, der über das Client-Set iteriert
//   (statt einer Subscribe-Closure pro Client gegen MaxListeners).
// • H6: Backpressure — Clients mit vollem Send-Buffer bekommen Event-
//   Nachrichten gedroppt statt unbegrenzt gepuffert.
// • Kein Electron-Import — Pfade kommen rein, dadurch ohne Electron testbar.
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { OverlayLayout } from '@botexe/overlay-engine';
import type { StudioEvent, TriggerAction } from '@botexe/trigger-engine';
import type { EventBus } from '../core/event-bus';
import { log } from '../core/logger';

export type OverlayMessage =
  | { kind: 'layout'; layout: OverlayLayout }
  | { kind: 'event'; event: StudioEvent }
  | { kind: 'action'; ruleId: string; action: TriggerAction }
  | { kind: 'stats'; stats: unknown };

export interface OverlayServerOptions {
  /** 0 = freier Port (Tests); sonst Wunsch-Port mit Fallback +1…+10. */
  port: number;
  host?: string;
  /** Verzeichnis mit overlay.html + runtime.js (overlay-engine/runtime). */
  runtimeDir: string;
  /** Verzeichnis mit Widget-JS/CSS (widget-kit). */
  widgetDir: string;
  /** 0 = Heartbeat aus (Tests); Default 30s. */
  heartbeatMs?: number;
  getActiveLayout: () => OverlayLayout | null;
  /** Initial-Stats für Late-Joiner (Leaderboard/Goal nicht leer nach Overlay-Reload). */
  getStats?: () => unknown;
  /** Sound-Files (mp3/wav/ogg/m4a) — NUR ausgeliefert, abgespielt wird im App-Renderer. */
  soundsDir?: string;
  /** TTS-Cache (mp3) — gleiche Schiene wie Sounds, Wiedergabe im App-Renderer. */
  ttsDir?: string;
}

const FILE_NAME_RE = /^[a-zA-Z0-9_.-]+\.(js|css|html|woff2?)$/;
/** Ab diesem Send-Buffer-Stand werden Event-Messages gedroppt (H6). */
const BACKPRESSURE_BYTES = 512 * 1024;

interface TrackedClient {
  ws: WebSocket;
  isAlive: boolean;
}

export class OverlayServer {
  private readonly bus: EventBus;
  private readonly options: OverlayServerOptions;
  private readonly expressApp: Express;
  private readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly token: string;
  private readonly host: string;
  private port: number;
  private clients = new Set<TrackedClient>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private unsubBus: (() => void) | null = null;
  private droppedMessages = 0;

  constructor(bus: EventBus, options: OverlayServerOptions) {
    this.bus = bus;
    this.options = options;
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port;
    this.token = crypto.randomBytes(32).toString('hex');
    this.expressApp = express();
    this.expressApp.use(express.json({ limit: '256kb' }));
    this.server = createServer(this.expressApp);
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });
    this.setupRoutes();
    this.setupWebSocket();
  }

  // ── HTTP ────────────────────────────────────────────────────────────────

  private setupRoutes(): void {
    const auth = (req: Request, res: Response, next: NextFunction): void => {
      if ((req.query.token as string) !== this.token) {
        res.status(403).json({ error: 'Invalid token' });
        return;
      }
      next();
    };

    this.expressApp.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    this.expressApp.get('/overlay', auth, (_req, res) => {
      const htmlPath = path.join(this.options.runtimeDir, 'overlay.html');
      if (!fs.existsSync(htmlPath)) {
        res.status(500).send('overlay.html nicht gefunden');
        return;
      }
      let html = fs.readFileSync(htmlPath, 'utf-8');
      // Runtime-Config injizieren: WS-URL inkl. Token, damit die Runtime
      // ohne Hardcoding verbinden kann.
      const cfg = `<script>window.BOTEXE_OVERLAY = ${JSON.stringify({
        wsUrl: this.getWsUrl(),
        baseUrl: `http://${this.host}:${this.port}`,
        token: this.token,
      })};</script>`;
      html = html.includes('</head>') ? html.replace('</head>', `${cfg}\n</head>`) : cfg + html;
      // Relativer script-src würde auf /runtime.js zeigen (404, kein Token) —
      // auf die tokenisierte Runtime-Route umschreiben.
      html = html.replace('src="runtime.js"', `src="/runtime/runtime.js?token=${this.token}"`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    });

    this.expressApp.get('/runtime/:filename', auth, (req, res) => {
      this.serveStatic(this.options.runtimeDir, req, res);
    });

    this.expressApp.get('/widgets/:filename', auth, (req, res) => {
      this.serveStatic(this.options.widgetDir, req, res);
    });

    this.setupTestEventRoute(auth);

    this.expressApp.get('/tts/:filename', auth, (req, res) => {
      const dir = this.options.ttsDir;
      if (!dir) {
        res.status(404).send('TTS nicht konfiguriert');
        return;
      }
      const raw = req.params.filename;
      const filename = path.basename(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
      if (!/^tts-[a-f0-9]+\.(mp3|wav)$/.test(filename)) {
        res.status(400).send('Invalid filename');
        return;
      }
      const target = path.join(dir, filename);
      if (!fs.existsSync(target)) {
        res.status(404).send('Not found');
        return;
      }
      res.setHeader('Content-Type', filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
      fs.createReadStream(target).pipe(res);
    });

    // Sound-Streaming für den App-Renderer (<audio src>). Bewusst NICHT vom
    // Overlay genutzt — TTLS-Browser-Audio ist unzuverlässig (Spec §5).
    this.expressApp.get('/sounds/:filename', auth, (req, res) => {
      const dir = this.options.soundsDir;
      if (!dir) {
        res.status(404).send('Sounds nicht konfiguriert');
        return;
      }
      const raw = req.params.filename;
      const filename = path.basename(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
      const ext = path.extname(filename).toLowerCase();
      const mime: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
      };
      if (!mime[ext]) {
        res.status(400).send('Invalid extension');
        return;
      }
      const target = path.join(dir, filename);
      if (!fs.existsSync(target)) {
        res.status(404).send('Not found');
        return;
      }
      res.setHeader('Content-Type', mime[ext]);
      res.setHeader('Cache-Control', 'public, max-age=300');
      fs.createReadStream(target).pipe(res);
    });
  }

  /** Test-Event von außen einspeisen (curl/Tools) — gleiche Token-Auth,
   *  läuft durch die komplette Kette (Trigger, Stats, Overlay, Sounds). */
  private setupTestEventRoute(auth: (req: Request, res: Response, next: NextFunction) => void): void {
    this.expressApp.post('/api/test-event', auth, (req, res) => {
      const e = req.body as Partial<StudioEvent> | undefined;
      if (!e || typeof e.type !== 'string') {
        res.status(400).json({ ok: false, error: 'StudioEvent erwartet ({type, …})' });
        return;
      }
      this.bus.publish({ ...e, ts: Date.now() } as StudioEvent);
      res.json({ ok: true });
    });
  }

  private serveStatic(dir: string, req: Request, res: Response): void {
    const raw = req.params.filename;
    const filename = path.basename(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
    if (!FILE_NAME_RE.test(filename)) {
      res.status(400).send('Invalid filename');
      return;
    }
    const target = path.join(dir, filename);
    if (!target.startsWith(dir) || !fs.existsSync(target)) {
      res.status(404).send('Not found');
      return;
    }
    const types: Record<string, string> = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };
    res.setHeader('Content-Type', `${types[path.extname(filename)] ?? 'application/octet-stream'}; charset=utf-8`);
    res.send(fs.readFileSync(target));
  }

  // ── WebSocket ───────────────────────────────────────────────────────────

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url ?? '', `http://${this.host}`);
      if (url.searchParams.get('token') !== this.token) {
        ws.close(4003, 'Invalid token');
        return;
      }

      const client: TrackedClient = { ws, isAlive: true };
      this.clients.add(client);
      log.info('Overlay', `Client verbunden (${this.clients.size} aktiv)`);

      ws.on('pong', () => {
        client.isAlive = true;
      });
      ws.on('close', () => {
        this.clients.delete(client);
        log.info('Overlay', `Client getrennt (${this.clients.size} aktiv)`);
      });
      ws.on('error', (err) => {
        log.warn('Overlay', 'WS-Client-Fehler', err.message);
      });

      // Initial-Zustand: aktives Layout + sticky last-values, damit der
      // Overlay-Canvas nicht leer startet (Late-Joiner).
      const layout = this.options.getActiveLayout();
      if (layout) this.sendTo(client, { kind: 'layout', layout }, true);
      const stats = this.options.getStats?.();
      if (stats) this.sendTo(client, { kind: 'stats', stats }, true);
      for (const e of this.bus.getAllLastValues()) {
        this.sendTo(client, { kind: 'event', event: e }, true);
      }
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // H8-Leak-Fix: genau EINE Bus-Subscription für alle Clients.
    this.unsubBus = this.bus.subscribeAll((e) => {
      this.broadcast({ kind: 'event', event: e });
    });

    const heartbeatMs = this.options.heartbeatMs ?? 30_000;
    if (heartbeatMs > 0) {
      this.heartbeatTimer = setInterval(() => this.heartbeat(), heartbeatMs);
    }

    await this.listenWithFallback(this.port);
    log.info('Overlay', `Server läuft: http://${this.host}:${this.port}`);
  }

  private listenWithFallback(startPort: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const tryListen = (port: number) => {
        const onError = (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE' && startPort !== 0 && attempts < 10) {
            attempts++;
            log.warn('Overlay', `Port ${port} belegt, versuche ${port + 1}…`);
            tryListen(port + 1);
          } else {
            reject(err);
          }
        };
        this.server.once('error', onError);
        this.server.listen(port, this.host, () => {
          this.server.removeListener('error', onError);
          const addr = this.server.address();
          if (addr && typeof addr === 'object') this.port = addr.port;
          resolve();
        });
      };
      tryListen(startPort);
    });
  }

  /** H8: Clients, die auf den letzten Ping nicht geantwortet haben, fliegen raus. */
  private heartbeat(): void {
    for (const client of this.clients) {
      if (!client.isAlive) {
        log.warn('Overlay', 'Toter Client — terminate');
        client.ws.terminate();
        this.clients.delete(client);
        continue;
      }
      client.isAlive = false;
      try {
        client.ws.ping();
      } catch {
        client.ws.terminate();
        this.clients.delete(client);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.unsubBus?.();
    this.unsubBus = null;
    for (const client of this.clients) client.ws.terminate();
    this.clients.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    // Keep-Alive-Sockets (z.B. von fetch) würden close() ewig blockieren.
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // ── Senden ──────────────────────────────────────────────────────────────

  broadcast(message: OverlayMessage): void {
    for (const client of this.clients) {
      this.sendTo(client, message);
    }
  }

  private sendTo(client: TrackedClient, message: OverlayMessage, critical = false): void {
    if (client.ws.readyState !== 1) return;
    // H6: Event-Spam (gift-bombing) darf den Buffer toter/langsamer Clients
    // nicht unbegrenzt füllen. Layout/Initial-Messages gelten als kritisch.
    if (!critical && message.kind === 'event' && client.ws.bufferedAmount > BACKPRESSURE_BYTES) {
      this.droppedMessages++;
      if (this.droppedMessages % 100 === 1) {
        log.warn('Overlay', `Backpressure: ${this.droppedMessages} event-messages gedroppt`);
      }
      return;
    }
    client.ws.send(JSON.stringify(message));
  }

  // ── Info ────────────────────────────────────────────────────────────────

  getPort(): number {
    return this.port;
  }

  getToken(): string {
    return this.token;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getOverlayUrl(): string {
    return `http://${this.host}:${this.port}/overlay?token=${this.token}`;
  }

  getWsUrl(): string {
    return `ws://${this.host}:${this.port}/ws?token=${this.token}`;
  }
}
