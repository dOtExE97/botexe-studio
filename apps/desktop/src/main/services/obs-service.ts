// obs-service.ts — steuert OBS Studio über dessen eingebauten WebSocket
// (obs-websocket v5, OBS ≥ 28). Trigger können damit Szenen wechseln oder
// Quellen ein-/ausblenden. Verbindung ist optional & selbstheilend: läuft OBS
// nicht, scheitert der Connect leise und wird periodisch neu versucht.
import OBSWebSocketClient from 'obs-websocket-js';
import { log } from '../core/logger';

export interface ObsConfig {
  enabled: boolean;
  url: string; // z.B. ws://127.0.0.1:4455
  password: string;
}

export type ObsStatus = 'off' | 'connecting' | 'connected' | 'error';

export class ObsService {
  private obs = new OBSWebSocketClient();
  private config: ObsConfig = { enabled: false, url: 'ws://127.0.0.1:4455', password: '' };
  private status: ObsStatus = 'off';
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wantConnected = false;
  private readonly onStatus: (s: ObsStatus, detail?: string) => void;

  constructor(onStatus: (s: ObsStatus, detail?: string) => void = () => undefined) {
    this.onStatus = onStatus;
    this.obs.on('ConnectionClosed', () => {
      if (this.status === 'connected') log.info('OBS', 'Verbindung getrennt');
      this.setStatus(this.wantConnected ? 'connecting' : 'off');
      if (this.wantConnected) this.scheduleRetry();
    });
  }

  getStatus(): ObsStatus {
    return this.status;
  }

  /** Konfiguration anwenden (aus den Settings) — verbindet oder trennt. */
  applyConfig(cfg: ObsConfig): void {
    this.config = { ...cfg };
    if (cfg.enabled && cfg.url) {
      this.wantConnected = true;
      void this.connect();
    } else {
      this.wantConnected = false;
      this.clearRetry();
      void this.obs.disconnect().catch(() => undefined);
      this.setStatus('off');
    }
  }

  private async connect(): Promise<void> {
    if (!this.wantConnected) return;
    this.clearRetry();
    this.setStatus('connecting');
    try {
      await this.obs.connect(this.config.url, this.config.password || undefined);
      this.setStatus('connected');
      log.info('OBS', 'Verbunden');
    } catch (err) {
      this.setStatus('error', (err as Error).message);
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || !this.wantConnected) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, 8000);
  }

  private clearRetry(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  private setStatus(s: ObsStatus, detail?: string): void {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s, detail);
  }

  /** Liste der Szenennamen (für die Trigger-Auswahl). Leer, wenn nicht verbunden. */
  async getScenes(): Promise<string[]> {
    if (this.status !== 'connected') return [];
    try {
      const res = await this.obs.call('GetSceneList');
      return (res.scenes as { sceneName: string }[]).map((s) => s.sceneName);
    } catch {
      return [];
    }
  }

  /** Programm-Szene wechseln. */
  async setScene(sceneName: string): Promise<void> {
    if (this.status !== 'connected' || !sceneName) return;
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
    } catch (err) {
      log.warn('OBS', `Szenenwechsel fehlgeschlagen (${sceneName})`, (err as Error).message);
    }
  }

  /** Quelle in einer Szene ein-/ausblenden. */
  async setSourceVisible(sceneName: string, sourceName: string, visible: boolean): Promise<void> {
    if (this.status !== 'connected' || !sceneName || !sourceName) return;
    try {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName, sourceName });
      await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: visible });
    } catch (err) {
      log.warn('OBS', `Quelle schalten fehlgeschlagen (${sceneName}/${sourceName})`, (err as Error).message);
    }
  }

  dispose(): void {
    this.wantConnected = false;
    this.clearRetry();
    void this.obs.disconnect().catch(() => undefined);
  }
}
