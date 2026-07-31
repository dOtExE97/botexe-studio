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

/** So lange darf ein Verbindungsaufbau höchstens dauern. Großzügig gewählt:
 *  OBS auf demselben Rechner antwortet in Millisekunden, über WLAN zu einem
 *  zweiten PC darf es auch mal ein paar Sekunden sein. */
const CONNECT_TIMEOUT_MS = 12_000;

/** Normaler Wiederholungs-Takt: OBS wird oft erst nach der App gestartet. */
const RETRY_MS = 8_000;
/** Takt, nachdem OBS die Verbindung ausdrücklich abgelehnt hat — es hilft
 *  nichts, im Sekundentakt zu klopfen, aber aufhören darf die App auch nicht:
 *  Der Streamer repariert das in OBS, und danach soll sie von selbst zurück. */
const RETRY_LANGSAM_MS = 60_000;

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
  /** Aktueller Wiederholungs-Takt (wird nach einer Ablehnung gestreckt). */
  private retryMs = RETRY_MS;
  /** Damit die Ablehnung nur EINMAL im Log steht, nicht jede Minute neu. */
  private abgelehntGemeldet = false;
  private readonly onStatus: (s: ObsStatus, detail?: string) => void;

  constructor(onStatus: (s: ObsStatus, detail?: string) => void = () => undefined) {
    this.onStatus = onStatus;
    this.obs.on('ConnectionClosed', (err) => {
      if (this.status === 'connected') log.info('OBS', 'Verbindung getrennt');
      // Hat OBS die Verbindung ausdrücklich abgelehnt, ist ein Versuch alle
      // 8 Sekunden sinnlos — er scheitert genauso, den Rest des Streams.
      // Das Ereignis liefert dafür einen OBSWebSocketError mit Code
      // (obs-websocket-js 5.0.8: `ConnectionClosed: OBSWebSocketError`,
      // `code: number`) — 4009 = Authentifizierung fehlgeschlagen (Passwort),
      // 4011 = die Sitzung wurde beendet, weil OBS diesen Client aus seiner
      // Sitzungsliste geworfen hat. Beides muss der Streamer in OBS beheben.
      const code = (err as { code?: number } | undefined)?.code;
      const abgelehnt = code === 4009 || code === 4011;
      if (abgelehnt) {
        // NICHT aufgeben, nur ausbremsen. Aufgeben wäre schlimmer als das
        // 8-Sekunden-Klopfen: Der Streamer repariert so etwas IN OBS (Passwort
        // ändern, Authentifizierung abschalten) — und danach müsste die App von
        // selbst zurückfinden. Täte sie es nicht, käme OBS erst beim nächsten
        // App-Start wieder, und in der Oberfläche gibt es keinen Knopf dafür.
        this.retryMs = RETRY_LANGSAM_MS;
        if (!this.abgelehntGemeldet) {
          this.abgelehntGemeldet = true;
          log.warn('OBS', code === 4009
            ? 'OBS hat das Passwort abgelehnt — in OBS unter Werkzeuge → WebSocket-Servereinstellungen prüfen. Weitere Versuche jetzt im Minutentakt.'
            : 'OBS hat die Sitzung beendet — weitere Versuche jetzt im Minutentakt.');
        }
      } else {
        this.retryMs = RETRY_MS;
      }
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
      // Mit Zeitlimit: Antwortet die Gegenstelle NIE (Firewall verwirft die
      // Pakete stumm, oder auf dem Port sitzt etwas, das TCP annimmt aber kein
      // OBS ist), kommt obs.connect() nie zurück. Ohne dieses Limit bliebe die
      // App für immer auf „Verbinde…" stehen — der einzige Wiederholungs-Timer
      // wurde eine Zeile darüber gerade abgeräumt. OBS wäre damit für den Rest
      // des Streams tot, ohne dass irgendwo etwas darauf hindeutet.
      await this.mitZeitlimit(this.obs.connect(this.config.url, this.config.password || undefined));
      // Ein neuerer Versuch besitzt den Socket bereits — dieser hier hat nichts
      // mehr zu melden (und darf vor allem nicht trennen).
      if (gen !== this.connectSeq) return;
      // Während des await könnte OBS deaktiviert worden sein (wantConnected=false) —
      // dann nicht fälschlich „connected" melden, sondern sauber wieder trennen.
      if (!this.wantConnected) { await this.obs.disconnect().catch(() => { /* egal */ }); return; }
      this.setStatus('connected');
      // Zurück auf den schnellen Takt — die Ablehnung ist offensichtlich behoben.
      this.retryMs = RETRY_MS;
      this.abgelehntGemeldet = false;
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

  /** Auf den Verbindungsaufbau warten, aber nicht ewig. Läuft die Zeit ab, wird
   *  der halb offene Socket weggeräumt — sonst könnte er Minuten später doch
   *  noch zustande kommen und einen längst veralteten Zustand melden. */
  private async mitZeitlimit(p: Promise<unknown>): Promise<void> {
    let wecker: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        p,
        new Promise((_, reject) => {
          wecker = setTimeout(
            () => reject(new Error(`OBS antwortet nicht (${Math.round(CONNECT_TIMEOUT_MS / 1000)} s) — läuft der WebSocket-Server, und stimmt die Adresse?`)),
            CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      void Promise.resolve(this.obs.disconnect()).catch(() => undefined);
      throw err;
    } finally {
      if (wecker) clearTimeout(wecker);
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || !this.wantConnected) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, this.retryMs);
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
    if (!sceneName) return;
    if (this.status !== 'connected') {
      // Der Szenenwechsel verpuffte bisher lautlos: Die Regel feuert, im Log
      // steht „Regel → OBS-Szene", und in OBS passiert nichts.
      log.gedrosselt(`obs:keine-verbindung:${sceneName}`, 60_000, 'warn', 'OBS',
        `Die Szene „${sceneName}" wurde NICHT geschaltet — es besteht gerade keine Verbindung zu OBS (Status: ${this.status}). `
        + (this.status === 'off'
          ? 'Die OBS-Steuerung ist in den Einstellungen ausgeschaltet.'
          : 'Die App versucht weiter zu verbinden.'));
      return;
    }
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
    } catch (err) {
      log.warn('OBS', `Szenenwechsel fehlgeschlagen (${sceneName})`, (err as Error).message);
    }
  }

  /** Quelle in einer Szene ein-/ausblenden. */
  async setSourceVisible(sceneName: string, sourceName: string, visible: boolean): Promise<void> {
    if (!sceneName || !sourceName) return;
    if (this.status !== 'connected') {
      log.gedrosselt(`obs:quelle-ohne-verbindung:${sceneName}/${sourceName}`, 60_000, 'warn', 'OBS',
        `Die Quelle „${sourceName}" in Szene „${sceneName}" wurde NICHT geschaltet — es besteht gerade keine Verbindung `
        + `zu OBS (Status: ${this.status}).`);
      return;
    }
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
