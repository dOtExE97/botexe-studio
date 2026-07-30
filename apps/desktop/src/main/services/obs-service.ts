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
  /** Laufende Verbindungsversuche durchnummerieren. Zwei applyConfig-Aufrufe
   *  (die Einstellungsseite feuert je einmal beim Verlassen des URL- UND des
   *  Passwort-Feldes) starten sonst überlappende Versuche, und der ältere setzt
   *  hinterher noch Status/Retry für eine Konfiguration, die es nicht mehr gibt. */
  private connectSeq = 0;
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
      this.connectSeq++; // hängenden Verbindungsversuch entwerten
      this.clearRetry();
      void this.obs.disconnect().catch(() => undefined);
      this.setStatus('off');
    }
  }

  private async connect(): Promise<void> {
    if (!this.wantConnected) return;
    const gen = ++this.connectSeq;
    this.clearRetry();
    this.setStatus('connecting');
    try {
      await this.obs.connect(this.config.url, this.config.password || undefined);
      // Ein neuerer Versuch besitzt den Socket bereits — dieser hier hat nichts
      // mehr zu melden (und darf vor allem nicht trennen).
      if (gen !== this.connectSeq) return;
      // Während des await könnte OBS deaktiviert worden sein (wantConnected=false) —
      // dann nicht fälschlich „connected" melden, sondern sauber wieder trennen.
      if (!this.wantConnected) { await this.obs.disconnect().catch(() => { /* egal */ }); return; }
      this.setStatus('connected');
      // WICHTIG: obs.connect() schließt intern zuerst einen bestehenden Socket.
      // Das löst unseren ConnectionClosed-Handler aus, der einen 8-s-Retry legt
      // — der würde die gerade aufgebaute Verbindung 8 Sekunden später wieder
      // abreißen, immer und immer wieder. Ein einziger Klick ins URL-Feld der
      // Einstellungen genügte, damit OBS für den Rest des Streams im
      // 8-Sekunden-Takt trennt und Szenenwechsel zufällig verpuffen.
      this.clearRetry();
      log.info('OBS', 'Verbunden');
    } catch (err) {
      // Veralteter Versuch (neue Konfiguration läuft schon) oder OBS wurde
      // inzwischen abgeschaltet: kein „Fehler" melden, sonst steht die Pille
      // dauerhaft rot, obwohl das Feature aus ist bzw. gerade neu verbindet.
      if (gen !== this.connectSeq || !this.wantConnected) return;
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
