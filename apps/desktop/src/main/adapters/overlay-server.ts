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
  | { kind: 'hello'; version: string } // App-Version → Runtime lädt bei Wechsel neu
  | { kind: 'layout'; layout: OverlayLayout }
  | { kind: 'event'; event: StudioEvent }
  | { kind: 'action'; ruleId: string; action: TriggerAction }
  | { kind: 'stats'; stats: unknown }
  | { kind: 'reset' }; // neuer Stream → Overlay-Zähler/Top-Listen zurücksetzen

export interface OverlayServerOptions {
  /** 0 = freier Port (Tests); sonst Wunsch-Port mit Fallback +1…+10. */
  port: number;
  host?: string;
  /** Fester Auth-Token (persistent über Neustarts). Leer = zufällig generiert. */
  token?: string;
  /** Verzeichnis mit overlay.html + runtime.js (overlay-engine/runtime). */
  runtimeDir: string;
  /** Verzeichnis mit Widget-JS/CSS (widget-kit). */
  widgetDir: string;
  /** 0 = Heartbeat aus (Tests); Default 30s. */
  heartbeatMs?: number;
  /** App-Version — beim Connect an die Runtime gesendet; wechselt sie (Update),
   *  lädt die Browser-Quelle automatisch neu und holt den frischen Overlay-Code. */
  appVersion?: string;
  /** Layout zu einer Profil-ID (undefined = Default-Profil). */
  getLayout: (id?: string) => OverlayLayout | null;
  /** ID des Default-Profils (für den Link ohne profile-Param). */
  getDefaultLayoutId: () => string | null;
  /** Initial-Stats für Late-Joiner (Leaderboard/Goal nicht leer nach Overlay-Reload). */
  getStats?: () => unknown;
  /** Sound-Files (mp3/wav/ogg/m4a) — NUR ausgeliefert, abgespielt wird im App-Renderer. */
  soundsDir?: string;
  /** TTS-Cache (mp3) — gleiche Schiene wie Sounds, Wiedergabe im App-Renderer. */
  ttsDir?: string;
  /** Eigene Medien (Bilder/Videos) — fürs Media-Widget im Overlay. */
  mediaDir?: string;
  /** Spiel-Widgets (Bingo/Zahlenraten) lösen Sounds über die App aus. */
  onWidgetSound?: (soundId: string) => void;
  /** Spiel-Sieg (z.B. Zahlen-Raten) — winId dedupliziert über OBS+TTLS+Vorschau. */
  onGameWin?: (winId: string, user: { id: string; nickname: string; profilePic?: string }) => void;
  /** Gift-Katalog (slug → Bild/Coins) — fürs Bingo & die Galerie. */
  getGiftCatalog?: () => Record<string, unknown>;
  /** Sport-Liveticker: Spiele eines Wettbewerbs (gecacht im Main). */
  getSportMatches?: (provider: string, competition: string) => Promise<unknown>;
  getSportStandings?: (provider: string, competition: string) => Promise<unknown>;
  /** Stream-Deck/Fernsteuerung: Panel-Knöpfe auflisten + per ID auslösen. */
  listPanelButtons?: () => Array<{ id: string; label: string }>;
  firePanelButton?: (id: string) => boolean;
}

const FILE_NAME_RE = /^[a-zA-Z0-9_.-]+\.(js|css|html|woff2?)$/;
/** Ab diesem Send-Buffer-Stand werden Event-Messages gedroppt (H6). */
const BACKPRESSURE_BYTES = 512 * 1024;

interface TrackedClient {
  ws: WebSocket;
  isAlive: boolean;
  /** Welches Profil dieser Client anzeigt — Layout-Broadcasts sind profil-gefiltert. */
  profileId: string;
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
  /** soundId → letzter Abspiel-Zeitpunkt (Dedup über mehrere Overlay-Clients). */
  private soundDedup = new Map<string, number>();
  private gameWinDedup = new Map<string, number>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private unsubBus: (() => void) | null = null;
  private droppedMessages = 0;

  constructor(bus: EventBus, options: OverlayServerOptions) {
    this.bus = bus;
    this.options = options;
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port;
    // Persistenter Token (über Neustarts stabil → OBS-Links/Stream-Deck bleiben
    // gültig). Fällt auf einen zufälligen zurück, wenn keiner übergeben wurde.
    this.token = options.token || crypto.randomBytes(32).toString('hex');
    this.expressApp = express();
    this.expressApp.use(express.json({ limit: '256kb' }));
    this.server = createServer(this.expressApp);
    // maxPayload deckelt eingehende WS-Frames (Default 100 MB → Memory-DoS).
    this.wss = new WebSocketServer({ server: this.server, path: '/ws', maxPayload: 64 * 1024 });
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

    this.expressApp.get('/overlay', auth, (req, res) => {
      const htmlPath = path.join(this.options.runtimeDir, 'overlay.html');
      if (!fs.existsSync(htmlPath)) {
        res.status(500).send('overlay.html nicht gefunden');
        return;
      }
      const profileRaw = req.query.profile;
      const profileId = typeof profileRaw === 'string' ? profileRaw : '';
      // Vorschau-Modus (Editor-iframe): Runtime erzeugt lokal Demo-Daten.
      const preview = req.query.preview === '1';
      // Schnell-Modus (TTLS-Browser ohne GPU): Blur/Effekte reduziert.
      const perf = req.query.perf === '1';
      // Einzel-Widget-Vorschau (Palette-Schaufenster): KEIN WS, das Layout kommt
      // per postMessage vom Editor, Widget führt sich mit Demo-Daten selbst vor.
      const single = req.query.single === '1';
      let html = fs.readFileSync(htmlPath, 'utf-8');
      // WS-/Asset-URLs über DENSELBEN Host ausliefern, über den die Seite
      // geladen wurde (z.B. localtest.me für TikTok Live Studio) — sonst lädt
      // die Seite, aber WS/Widgets zeigen auf 127.0.0.1 und werden vom
      // TTLS-Browser geblockt → unsichtbares Overlay. Whitelist gegen
      // Host-Header-Spoofing.
      const reqHost = String(req.headers.host ?? '');
      const hostOk = /^(127\.0\.0\.1|localhost|localtest\.me)(:\d+)?$/.test(reqHost);
      const origin = hostOk ? reqHost : `${this.host}:${this.port}`;
      const wsBase = `ws://${origin}/ws?token=${this.token}`;
      // Runtime-Config injizieren: WS-URL inkl. Token + Profil, damit die
      // Runtime ohne Hardcoding genau dieses Profil-Layout zieht.
      const cfg = `<script>window.BOTEXE_OVERLAY = ${JSON.stringify({
        wsUrl: profileId ? `${wsBase}&profile=${encodeURIComponent(profileId)}` : wsBase,
        baseUrl: `http://${origin}`,
        token: this.token,
        preview,
        perf,
        single,
      })};</script>`;
      html = html.includes('</head>') ? html.replace('</head>', `${cfg}\n</head>`) : cfg + html;
      // Relativer script-src würde auf /runtime.js zeigen (404, kein Token) —
      // auf die tokenisierte Runtime-Route umschreiben.
      html = html.replace('src="runtime.js"', `src="/runtime/runtime.js?token=${this.token}"`);
      html = html.replace('href="widget-base.css"', `href="/widgets/widget-base.css?token=${this.token}"`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    });

    this.expressApp.get('/runtime/:filename', auth, (req, res) => {
      this.serveStatic(this.options.runtimeDir, req, res);
    });

    this.expressApp.get('/widgets/:filename', auth, (req, res) => {
      this.serveStatic(this.options.widgetDir, req, res);
    });

    // Gift-Katalog: echte Gift-Bilder für Bingo-Zellen & Galerie.
    this.expressApp.get('/gift-catalog', auth, (_req, res) => {
      res.json(this.options.getGiftCatalog?.() ?? {});
    });

    // Sport-Liveticker: das Widget pollt hier, der Main holt+cacht von der API.
    this.expressApp.get('/sport', auth, (req, res) => {
      const provider = String(req.query.provider ?? 'football-data');
      const competition = String(req.query.competition ?? '');
      if (!this.options.getSportMatches || !competition) {
        res.json({ matches: [] });
        return;
      }
      this.options
        .getSportMatches(provider, competition)
        .then((matches) => res.json({ matches: matches ?? [] }))
        .catch(() => res.json({ matches: [] }));
    });

    // Tabelle/Standings desselben Wettbewerbs (für die Tabellen-Ansicht des Tickers).
    this.expressApp.get('/sport/standings', auth, (req, res) => {
      const provider = String(req.query.provider ?? 'football-data');
      const competition = String(req.query.competition ?? '');
      if (!this.options.getSportStandings || !competition) {
        res.json({ standings: [] });
        return;
      }
      this.options
        .getSportStandings(provider, competition)
        .then((standings) => res.json({ standings: standings ?? [] }))
        .catch(() => res.json({ standings: [] }));
    });

    // Fernsteuerung (Stream-Deck-Plugin & Web-Requests): Panel-Knöpfe auflisten
    // + per ID auslösen. Token-geschützt wie alles andere.
    this.expressApp.get('/api/panel', auth, (_req, res) => {
      res.json({ buttons: this.options.listPanelButtons?.() ?? [] });
    });
    this.expressApp.post('/api/panel/fire', auth, (req, res) => {
      const id = String((req.body as { id?: unknown })?.id ?? '');
      const ok = id ? (this.options.firePanelButton?.(id) ?? false) : false;
      res.status(ok ? 200 : 404).json({ ok });
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
      if (!target.startsWith(dir) || !fs.existsSync(target)) {
        res.status(404).send('Not found');
        return;
      }
      res.setHeader('Content-Type', filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
      fs.createReadStream(target).pipe(res);
    });

    // Vorhör-Proxy: holt eine MyInstants-mp3 server-seitig und reicht sie über
    // 127.0.0.1 durch — so kann der Renderer sie CSP-konform abspielen (media-src
    // erlaubt nur 'self'/127.0.0.1), OHNE sie in die Bibliothek herunterzuladen.
    this.expressApp.get('/preview', auth, (req, res) => {
      void this.streamPreview(String(req.query.url ?? ''), res);
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
      if (!target.startsWith(dir) || !fs.existsSync(target)) {
        res.status(404).send('Not found');
        return;
      }
      res.setHeader('Content-Type', mime[ext]);
      res.setHeader('Cache-Control', 'public, max-age=300');
      fs.createReadStream(target).pipe(res);
    });

    // Eigene Medien (Bilder/Videos) fürs Media-Widget. Videos brauchen
    // HTTP-Range, damit der <video>-Tag seeken/streamen kann.
    this.expressApp.get('/media/:filename', auth, (req, res) => {
      const dir = this.options.mediaDir;
      if (!dir) {
        res.status(404).send('Medien nicht konfiguriert');
        return;
      }
      const raw = req.params.filename;
      const filename = path.basename(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
      const ext = path.extname(filename).toLowerCase();
      const mime: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
      };
      if (!mime[ext]) {
        res.status(400).send('Invalid extension');
        return;
      }
      const target = path.join(dir, filename);
      if (!target.startsWith(dir) || !fs.existsSync(target)) {
        res.status(404).send('Not found');
        return;
      }
      const size = fs.statSync(target).size;
      res.setHeader('Content-Type', mime[ext]);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Accept-Ranges', 'bytes');
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
        if (start >= size || end >= size || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', end - start + 1);
        fs.createReadStream(target, { start, end }).pipe(res);
        return;
      }
      res.setHeader('Content-Length', size);
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
      // Nur bekannte StudioEvent-Felder übernehmen — keine beliebigen Fremdfelder
      // in den Bus spreizen (Defense-in-Depth, auch wenn token-auth davorsteht).
      const clean: StudioEvent = {
        type: e.type as StudioEvent['type'],
        ts: Date.now(),
        ...(e.user ? { user: e.user } : {}),
        ...(typeof e.text === 'string' ? { text: e.text } : {}),
        ...(e.gift ? { gift: e.gift } : {}),
        ...(typeof e.likeCount === 'number' ? { likeCount: e.likeCount } : {}),
        ...(typeof e.totalLikes === 'number' ? { totalLikes: e.totalLikes } : {}),
        ...(typeof e.viewerCount === 'number' ? { viewerCount: e.viewerCount } : {}),
        ...(typeof e.firstOfUser === 'boolean' ? { firstOfUser: e.firstOfUser } : {}),
      };
      this.bus.publish(clean);
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
    const ext = path.extname(filename);
    res.setHeader('Content-Type', `${types[ext] ?? 'application/octet-stream'}; charset=utf-8`);
    // Overlay-Code (runtime.js/widget-base.css/Widget-Module) NICHT lange cachen —
    // nach einem Update muss die Browser-Quelle den frischen Code holen (zusammen
    // mit dem Auto-Reload via hello-Version). ETag-Revalidierung bleibt aktiv.
    if (ext === '.js' || ext === '.css' || ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (ext === '.css') {
      // Relative Font-URLs (url('x.woff2')) brauchen den Token — sonst 403.
      let css = fs.readFileSync(target, 'utf-8');
      css = css.replace(/url\((['"]?)([\w.-]+\.woff2?)\1\)/g, (_m, q, name) => `url(${q}${name}?token=${this.token}${q})`);
      res.send(css);
      return;
    }
    if (ext === '.js') {
      // Relative ES-Modul-Imports (import … from './combo.js') verlieren den
      // Token bei der Browser-Auflösung → sonst 403. Token anhängen (wie bei CSS).
      let js = fs.readFileSync(target, 'utf-8');
      js = js.replace(
        /(\bfrom\s*['"]|\bimport\s*\(\s*['"])(\.\/[\w.-]+\.js)(['"])/g,
        (_m, pre, spec, q) => `${pre}${spec}?token=${this.token}${q}`,
      );
      res.send(js);
      return;
    }
    res.send(fs.readFileSync(target));
  }

  /** MyInstants-mp3 server-seitig holen und durchreichen (Vorhören ohne Import).
   *  Allowlist gegen SSRF, Größen-Cap, kein Caching. */
  private async streamPreview(url: string, res: Response): Promise<void> {
    // Host-basierte Allowlist (robust gegen Tricks wie myinstants.com.evil.tld) + .mp3.
    let parsed: URL;
    try { parsed = new URL(url); } catch { res.status(400).send('bad url'); return; }
    const host = parsed.hostname.toLowerCase();
    if ((host !== 'www.myinstants.com' && host !== 'myinstants.com') || parsed.protocol !== 'https:' || !/\.mp3$/i.test(parsed.pathname)) {
      res.status(400).send('bad url');
      return;
    }
    const MAX = 5 * 1024 * 1024;
    try {
      // redirect:'manual' → KEIN Folgen auf interne IPs (SSRF). Timeout gegen Hänger.
      const upstream = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
      if (upstream.status >= 300 && upstream.status < 400) { res.status(502).send('redirect blocked'); return; }
      if (!upstream.ok || !upstream.body) { res.status(502).send('upstream'); return; }
      if (Number(upstream.headers.get('content-length') || 0) > MAX) { res.status(413).send('too large'); return; }
      // Gestreamt mitzählen → Abbruch bei >5MB, auch ohne content-length-Header.
      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX) { try { await reader.cancel(); } catch { /* egal */ } res.status(413).end(); return; }
        chunks.push(value);
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(Buffer.concat(chunks));
    } catch {
      res.status(502).send('fetch failed');
    }
  }

  // ── WebSocket ───────────────────────────────────────────────────────────

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url ?? '', `http://${this.host}`);
      if (url.searchParams.get('token') !== this.token) {
        ws.close(4003, 'Invalid token');
        return;
      }

      const profileId = url.searchParams.get('profile') || this.options.getDefaultLayoutId() || '';
      const client: TrackedClient = { ws, isAlive: true, profileId };
      this.clients.add(client);
      log.info('Overlay', `Client verbunden, Profil "${profileId}" (${this.clients.size} aktiv)`);

      ws.on('pong', () => {
        client.isAlive = true;
      });
      // Rückkanal: Widget-/Runtime-Fehler aus dem TTLS-Browser ins zentrale Log.
      // Gehärtet: Längen-Cap, Newline-Strip (Log-Injection), simples Rate-Limit.
      let logWindowStart = 0;
      let logCount = 0;
      const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, max);
      ws.on('message', (raw) => {
        const str = String(raw);
        if (str.length > 4096) return;
        try {
          const msg = JSON.parse(str) as {
            kind?: string; scope?: string; message?: string; soundId?: string;
            winId?: string; user?: { id?: string; nickname?: string; profilePic?: string };
          };
          const now = Date.now();
          // Spiel-Sieg: winId (layerId+Runde) ist auf allen Clients gleich →
          // genau EINMAL zählen, egal wie viele Overlays offen sind.
          if (msg.kind === 'gamewin' && typeof msg.winId === 'string' && msg.winId.length < 120 && msg.user?.id) {
            const last = this.gameWinDedup.get(msg.winId) ?? 0;
            if (now - last > 30_000) {
              this.gameWinDedup.set(msg.winId, now);
              if (this.gameWinDedup.size > 200) {
                for (const [k, t] of this.gameWinDedup) if (now - t > 60_000) this.gameWinDedup.delete(k);
              }
              this.options.onGameWin?.(msg.winId, {
                id: String(msg.user.id),
                nickname: String(msg.user.nickname ?? '?'),
                profilePic: msg.user.profilePic ? String(msg.user.profilePic) : undefined,
              });
            }
            return;
          }
          // Spiel-Widget-Sound (Bingo-Treffer, Zahlenraten-Gewinn): über die
          // App abspielen — Dedup, weil OBS+TTLS dasselbe Widget zeigen können.
          if (msg.kind === 'sound' && typeof msg.soundId === 'string' && msg.soundId.length < 120) {
            const last = this.soundDedup.get(msg.soundId) ?? 0;
            if (now - last > 600) {
              this.soundDedup.set(msg.soundId, now);
              if (this.soundDedup.size > 200) {
                for (const [k, t] of this.soundDedup) if (now - t > 5_000) this.soundDedup.delete(k);
              }
              this.options.onWidgetSound?.(msg.soundId);
            }
            return;
          }
          if (msg.kind !== 'clientlog' || !msg.message) return;
          if (now - logWindowStart > 1000) { logWindowStart = now; logCount = 0; }
          if (++logCount > 5) return; // max 5 Client-Logs/s pro Client → kein Flooding
          log.warn('Overlay-Widget', `[${profileId || 'default'}] ${clean(msg.scope, 60)} ${clean(msg.message, 300)}`.trim());
        } catch {
          /* nicht-JSON ignorieren */
        }
      });
      ws.on('close', () => {
        this.clients.delete(client);
        log.info('Overlay', `Client getrennt (${this.clients.size} aktiv)`);
      });
      ws.on('error', (err) => {
        log.warn('Overlay', 'WS-Client-Fehler', err.message);
      });

      // Allererste Nachricht: App-Version. Hat die Runtime schon eine ANDERE
      // Version gesehen (= App wurde aktualisiert, Server neu gestartet), lädt
      // sie die Seite neu und holt den frischen Overlay-/Widget-Code.
      this.sendTo(client, { kind: 'hello', version: this.options.appVersion ?? '' }, true);

      // Initial-Zustand: aktives Layout + sticky last-values, damit der
      // Overlay-Canvas nicht leer startet (Late-Joiner).
      const layout = this.options.getLayout(profileId || undefined);
      if (layout) this.sendTo(client, { kind: 'layout', layout }, true);
      const stats = this.options.getStats?.();
      if (stats) this.sendTo(client, { kind: 'stats', stats }, true);
      for (const e of this.bus.getAllLastValues()) {
        this.sendTo(client, { kind: 'event', event: e }, true);
      }
    });
  }

  /** Session-Reset: jedem Client sein Layout neu senden — die Runtime baut
   *  alle Widgets neu auf (Feeds/Alerts/Glas starten leer). */
  rebroadcastLayouts(): void {
    for (const client of this.clients) {
      const layout = this.options.getLayout(client.profileId || undefined);
      if (layout) this.sendTo(client, { kind: 'layout', layout }, true);
    }
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

  /** Aktuelles Layout eines Profils an genau dessen Clients pushen (nach Save). */
  broadcastLayout(profileId: string): void {
    const layout = this.options.getLayout(profileId);
    if (!layout) return;
    for (const client of this.clients) {
      if (client.profileId === profileId) this.sendTo(client, { kind: 'layout', layout }, true);
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

  getOverlayUrl(profileId?: string): string {
    const base = `http://${this.host}:${this.port}/overlay?token=${this.token}`;
    return profileId ? `${base}&profile=${encodeURIComponent(profileId)}` : base;
  }

  getWsUrl(): string {
    return `ws://${this.host}:${this.port}/ws?token=${this.token}`;
  }
}
