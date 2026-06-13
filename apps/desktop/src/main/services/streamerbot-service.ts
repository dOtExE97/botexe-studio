// streamerbot-service.ts — verbindet sich als CLIENT mit dem WebSocket-Server
// von Streamer.bot (Standard ws://127.0.0.1:8080/). Damit können botexe-Trigger
// Streamer.bot-Aktionen auslösen (DoAction) — wie die TikFinity↔Streamer.bot-
// Brücke. Verbindung optional & selbstheilend.
import WebSocket from 'ws';
import { log } from '../core/logger';

export interface StreamerbotConfig {
  enabled: boolean;
  url: string; // ws://127.0.0.1:8080/
}

export type StreamerbotStatus = 'off' | 'connecting' | 'connected' | 'error';

interface SbAction { id: string; name: string }

export class StreamerbotService {
  private ws: WebSocket | null = null;
  private config: StreamerbotConfig = { enabled: false, url: 'ws://127.0.0.1:8080/' };
  private status: StreamerbotStatus = 'off';
  private wantConnected = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private actions: SbAction[] = [];
  private reqSeq = 0;
  private pending = new Map<string, (data: unknown) => void>();
  private readonly onStatus: (s: StreamerbotStatus) => void;

  constructor(onStatus: (s: StreamerbotStatus) => void = () => undefined) {
    this.onStatus = onStatus;
  }

  getStatus(): StreamerbotStatus { return this.status; }

  applyConfig(cfg: StreamerbotConfig): void {
    this.config = { ...cfg };
    if (cfg.enabled && cfg.url) { this.wantConnected = true; this.connect(); }
    else { this.wantConnected = false; this.clearRetry(); this.close(); this.setStatus('off'); }
  }

  private connect(): void {
    if (!this.wantConnected) return;
    this.clearRetry();
    this.close();
    this.setStatus('connecting');
    try {
      const ws = new WebSocket(this.config.url);
      this.ws = ws;
      ws.on('open', () => { this.setStatus('connected'); log.info('Streamerbot', 'Verbunden'); void this.refreshActions(); });
      ws.on('message', (raw) => this.onMessage(String(raw)));
      ws.on('close', () => { this.setStatus(this.wantConnected ? 'connecting' : 'off'); if (this.wantConnected) this.scheduleRetry(); });
      ws.on('error', (err) => { this.setStatus('error'); log.warn('Streamerbot', 'WS-Fehler', (err as Error).message); });
    } catch (err) {
      this.setStatus('error'); log.warn('Streamerbot', 'Connect-Fehler', (err as Error).message);
      this.scheduleRetry();
    }
  }

  private onMessage(str: string): void {
    let msg: { id?: string; status?: string; actions?: SbAction[] };
    try { msg = JSON.parse(str); } catch { return; }
    if (msg.id && this.pending.has(msg.id)) {
      this.pending.get(msg.id)?.(msg);
      this.pending.delete(msg.id);
    }
  }

  private send(request: string, extra: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve) => {
      if (!this.ws || this.status !== 'connected') { resolve(null); return; }
      const id = `bx-${++this.reqSeq}`;
      this.pending.set(id, resolve);
      try { this.ws.send(JSON.stringify({ request, id, ...extra })); }
      catch { this.pending.delete(id); resolve(null); }
      setTimeout(() => { if (this.pending.delete(id)) resolve(null); }, 4000); // Timeout
    });
  }

  /** Aktionsliste von Streamer.bot holen (für die Trigger-Auswahl). */
  async refreshActions(): Promise<SbAction[]> {
    const res = (await this.send('GetActions')) as { actions?: SbAction[] } | null;
    if (res?.actions) this.actions = res.actions.map((a) => ({ id: a.id, name: a.name }));
    else if (this.status === 'connected') {
      log.warn('Streamerbot', 'GetActions ohne Antwort — verlangt der WebSocket-Server eine Authentifizierung? (in Streamer.bot Auth deaktivieren)');
    }
    return this.actions;
  }

  getActions(): SbAction[] { return [...this.actions]; }

  /** Streamer.bot-Aktion per Name (oder GUID) auslösen. */
  doAction(nameOrId: string): void {
    if (this.status !== 'connected' || !nameOrId) return;
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(nameOrId);
    void this.send('DoAction', { action: byId ? { id: nameOrId } : { name: nameOrId } });
  }

  private scheduleRetry(): void {
    if (this.retryTimer || !this.wantConnected) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.connect(); }, 8000);
  }
  private clearRetry(): void { if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; } }
  private close(): void { try { this.ws?.removeAllListeners?.(); this.ws?.close(); } catch { /* egal */ } this.ws = null; }
  private setStatus(s: StreamerbotStatus): void { if (this.status === s) return; this.status = s; this.onStatus(s); }

  dispose(): void { this.wantConnected = false; this.clearRetry(); this.close(); }
}
