// edge-dauerleitung.ts — EINE offene Leitung zu Microsofts Sprachdienst,
// statt für jede Ansage eine neue aufzubauen.
//
// WARUM DAS EXISTIERT
// Die Bibliothek `node-edge-tts` öffnet pro Ansage einen frischen WebSocket
// und schließt ihn danach wieder (edge-tts.js:33 und :112). Bei gutem Netz
// fällt das nicht auf. Bei schwachem WLAN besteht ein Verbindungsaufbau aus
// TLS-Handschlag plus WebSocket-Aufstieg — geht dabei EIN Paket verloren,
// wartet das Betriebssystem stur 1, 2, 4, 8 Sekunden. Gemessen an einem echten
// Aufbau: 6 Ansagen = 6 volle Handschläge, 473–791 ms jeder. Vier Paketverluste
// und die 12 Sekunden Budget sind weg, ohne dass je ein Ton kam. Genau das war
// bei einem Nutzer im Keller der Dauerzustand: 32 Ausfälle an einem Abend.
//
// Mit einer offenen Leitung kostet nur die ERSTE Ansage den Aufbau. Danach ist
// jede weitere ein Datenpaket auf einer stehenden Verbindung — dasselbe, was
// den Google-Weg so viel robuster macht (der poolt seine Verbindungen selbst).
//
// WAS HIER BEWUSST ANDERS IST ALS IN DER BIBLIOTHEK
//   • Ein hartes Zeitlimit für die AUFBAU-Phase. Die Bibliothek hat keins: ihr
//     Timeout beginnt erst NACH dem Verbindungsaufbau (edge-tts.js:95/:99), und
//     `ws` bekommt kein `handshakeTimeout`. Gegen einen toten Port hängt sie
//     deshalb ~127 Sekunden, bis das Betriebssystem aufgibt.
//   • Aufgeben heißt `terminate()`, nicht `close()`. Ein sauberes Schließen
//     braucht selbst noch eine Antwort der Gegenstelle — die man bei einer
//     toten Leitung nie bekommt.
//   • Mehrere Ansagen gleichzeitig werden über die `X-RequestId` auseinander-
//     gehalten, die Microsoft in jeder Antwort mitschickt.
import { WebSocket } from 'ws';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dns from 'node:dns';
import { log } from '../core/logger';

/** Wie lange darf allein der VERBINDUNGSAUFBAU dauern? Kurz halten: Klappt er
 *  nicht schnell, klappt er auf dieser Leitung meist gar nicht — und jede
 *  Sekunde hier ist Stille im Stream. */
const AUFBAU_TIMEOUT_MS = 4_000;
/** Zeitlimit für EINE Ansage auf einer bereits stehenden Leitung. */
const ANSAGE_TIMEOUT_MS = 10_000;
/** Nach so langer Untätigkeit die Leitung schließen. Microsofts Zugangsmarke
 *  läuft nach einigen Minuten ab; eine ewig offene Leitung stirbt dann
 *  irgendwann lautlos und die nächste Ansage fällt in den Timeout. Lieber
 *  vorher aufräumen und beim nächsten Mal frisch aufbauen. */
const LEERLAUF_MS = 4 * 60_000;

export interface EdgeLeitungOptionen {
  /** Nur für Tests: eigene WebSocket-Fabrik. */
  wsFactory?: (url: string, opts: Record<string, unknown>) => WsAehnlich;
  /** Nur für Tests: Zeitgeber. */
  jetzt?: () => number;
}

/** Das Minimum, das wir von einem WebSocket brauchen — in Tests ersetzbar. */
export interface WsAehnlich {
  on(ereignis: string, cb: (...args: never[]) => void): unknown;
  send(daten: string): void;
  close(): void;
  terminate?(): void;
  removeAllListeners?(): void;
  readyState?: number;
}

interface OffeneAnsage {
  fertig: (fehler?: Error) => void;
  stream: fs.WriteStream;
  timer: ReturnType<typeof setTimeout>;
}

/** Kopfzeilen eines Microsoft-Rahmens auslesen (`Schlüssel:Wert\r\n`). */
export function leseKopf(rohtext: string): Record<string, string> {
  const kopf: Record<string, string> = {};
  for (const zeile of rohtext.split('\r\n')) {
    if (!zeile) break; // Leerzeile trennt Kopf von Inhalt
    const trenner = zeile.indexOf(':');
    if (trenner > 0) kopf[zeile.slice(0, trenner).toLowerCase()] = zeile.slice(trenner + 1);
  }
  return kopf;
}

/** SSML für eine Ansage bauen (Tempo/Tonhöhe/Lautstärke wie in den Einstellungen). */
export function baueSsml(text: string, stimme: string, tuning?: Record<string, number | string>): string {
  const sprache = stimme.split('-').slice(0, 2).join('-');
  const vz = (n: number, einheit: string) => `${n >= 0 ? '+' : ''}${Math.round(n)}${einheit}`;
  const rate = vz(Math.max(-50, Math.min(50, Number(tuning?.rate ?? 0))), '%');
  const pitch = vz(Math.max(-20, Math.min(20, Number(tuning?.pitch ?? 0))), 'Hz');
  const volume = vz(Math.max(-50, Math.min(50, Number(tuning?.volume ?? 0))), '%');
  // Steuerzeichen entschärfen — sonst zerlegt ein „&" im Nicknamen das SSML.
  const sicher = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${sprache}'>`
    + `<voice name='${stimme}'><prosody rate='${rate}' pitch='${pitch}' volume='${volume}'>`
    + `${sicher}</prosody></voice></speak>`;
}

/**
 * Hält EINE Leitung zu Microsoft offen und schickt Ansagen darüber.
 *
 * Automatischer Neuaufbau: Fällt die Leitung weg (Microsoft trennt, WLAN weg,
 * Marke abgelaufen), wird sie beim nächsten Aufruf einfach neu aufgebaut. Es
 * gibt bewusst KEINE Wiederverbindungs-Schleife im Hintergrund — sie würde bei
 * totem Netz nur sinnlos Verbindungen aufmachen. Gebraucht wird die Leitung
 * genau dann, wenn eine Ansage ansteht.
 */
export class EdgeDauerleitung {
  private ws: WsAehnlich | null = null;
  private verbinden: Promise<WsAehnlich> | null = null;
  private readonly offen = new Map<string, OffeneAnsage>();
  private leerlaufTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly wsFactory: NonNullable<EdgeLeitungOptionen['wsFactory']>;
  /** Wie viele Ansagen diese Leitung schon getragen hat — fürs Log. */
  private getragen = 0;

  constructor(private readonly opts: EdgeLeitungOptionen = {}) {
    this.wsFactory = opts.wsFactory ?? ((url, o) => new WebSocket(url, o) as unknown as WsAehnlich);
  }

  /** Ansage erzeugen und nach `ziel` schreiben. Wirft bei Fehlschlag. */
  async synthetisiere(
    text: string,
    stimme: string,
    ziel: string,
    tuning?: Record<string, number | string>,
  ): Promise<void> {
    const ws = await this.hole();
    const anfrageId = crypto.randomBytes(16).toString('hex');
    const stream = fs.createWriteStream(ziel);

    return new Promise<void>((erfuellen, ablehnen) => {
      let erledigt = false;
      const fertig = (fehler?: Error) => {
        if (erledigt) return;
        erledigt = true;
        clearTimeout(eintrag.timer);
        this.offen.delete(anfrageId);
        this.planeLeerlauf();
        if (fehler) {
          stream.destroy();
          ablehnen(fehler);
          return;
        }
        stream.end(() => erfuellen());
      };
      const timer = setTimeout(() => fertig(new Error('TTS-Timeout')), ANSAGE_TIMEOUT_MS);
      const eintrag: OffeneAnsage = { fertig, stream, timer };
      this.offen.set(anfrageId, eintrag);

      try {
        ws.send(
          `X-RequestId:${anfrageId}\r\nContent-Type:application/ssml+xml\r\n`
          + `X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n`
          + baueSsml(text, stimme, tuning),
        );
        this.getragen += 1;
      } catch (err) {
        fertig(err as Error);
      }
    });
  }

  /** Leitung schließen (App-Ende, Stimmenwechsel, Aufräumen). */
  schliesse(): void {
    if (this.leerlaufTimer) { clearTimeout(this.leerlaufTimer); this.leerlaufTimer = null; }
    for (const eintrag of [...this.offen.values()]) eintrag.fertig(new Error('Leitung geschlossen'));
    this.offen.clear();
    this.wegwerfen();
  }

  /** Nur für Diagnose/Tests: steht die Leitung gerade? */
  get steht(): boolean {
    return this.ws !== null;
  }

  private wegwerfen(): void {
    const ws = this.ws;
    this.ws = null;
    this.verbinden = null;
    if (!ws) return;
    // terminate() statt close(): Ein sauberes Schließen wartet auf eine Antwort
    // der Gegenstelle — die bei einer toten Leitung nie kommt.
    try { ws.removeAllListeners?.(); (ws.terminate ?? ws.close).call(ws); } catch { /* egal */ }
  }

  private planeLeerlauf(): void {
    if (this.leerlaufTimer) clearTimeout(this.leerlaufTimer);
    if (this.offen.size > 0) return; // es läuft noch etwas
    this.leerlaufTimer = setTimeout(() => {
      this.leerlaufTimer = null;
      if (this.offen.size === 0) this.wegwerfen();
    }, LEERLAUF_MS);
    this.leerlaufTimer.unref?.();
  }

  private hole(): Promise<WsAehnlich> {
    if (this.ws) return Promise.resolve(this.ws);
    // Läuft schon ein Aufbau? Dann NICHT einen zweiten starten — sonst öffnet
    // ein Ansagen-Schwall bei langsamer Leitung mehrere Verbindungen auf
    // einmal und macht genau das Problem schlimmer, das wir lösen wollen.
    if (this.verbinden) return this.verbinden;
    this.verbinden = this.baueAuf().finally(() => { this.verbinden = null; });
    return this.verbinden;
  }

  private baueAuf(): Promise<WsAehnlich> {
    return new Promise<WsAehnlich>((erfuellen, ablehnen) => {
      let entschieden = false;
      const ws = this.wsFactory(baueUrl(), {
        host: 'speech.platform.bing.com',
        origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        headers: {
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache',
          'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) `
            + `Chrome/${CHROME_HAUPTVERSION}.0.0.0 Safari/537.36 Edg/${CHROME_HAUPTVERSION}.0.0.0`,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        // Der Riegel, der der Bibliothek fehlt: begrenzt schon den AUFSTIEG,
        // nicht erst die Zeit danach.
        handshakeTimeout: AUFBAU_TIMEOUT_MS,
        lookup: aufloesenMitGedaechtnis,
      });

      // Zweiter Riegel für den Fall davor: Bleibt schon der TCP-Aufbau hängen,
      // greift handshakeTimeout nicht — dann wartet man ohne diesen Wecker
      // ~127 Sekunden auf das Betriebssystem.
      const wecker = setTimeout(() => {
        if (entschieden) return;
        entschieden = true;
        try { (ws.terminate ?? ws.close).call(ws); } catch { /* egal */ }
        ablehnen(new Error('TTS-Timeout'));
      }, AUFBAU_TIMEOUT_MS);

      ws.on('open', (() => {
        if (entschieden) return;
        entschieden = true;
        clearTimeout(wecker);
        // Einmal pro Leitung das Ausgabeformat festlegen — nicht pro Ansage.
        ws.send(
          'Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n'
          + '{"context":{"synthesis":{"audio":{"metadataoptions":'
          + '{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},'
          + `"outputFormat":"${AUSGABEFORMAT}"}}}}`,
        );
        this.ws = ws;
        this.getragen = 0;
        erfuellen(ws);
      }) as never);

      ws.on('message', ((daten: Buffer | string, binaer?: boolean) => {
        this.verarbeite(daten, binaer);
      }) as never);

      const wegBei = (grund: string) => (() => {
        clearTimeout(wecker);
        // Alle offenen Ansagen dieser Leitung scheitern lassen — sonst warten
        // sie bis in ihr eigenes Zeitlimit, obwohl längst klar ist, dass
        // nichts mehr kommt.
        for (const eintrag of [...this.offen.values()]) eintrag.fertig(new Error(grund));
        this.offen.clear();
        this.wegwerfen();
        if (!entschieden) { entschieden = true; ablehnen(new Error(grund)); }
      }) as never;
      ws.on('close', wegBei('Leitung geschlossen'));
      ws.on('error', wegBei('Leitung gestört'));
    });
  }

  /** Eine Antwort von Microsoft der richtigen Ansage zuordnen. */
  private verarbeite(daten: Buffer | string, binaer?: boolean): void {
    if (binaer || Buffer.isBuffer(daten)) {
      const puffer = daten as Buffer;
      // Aufbau: 2 Byte Kopflänge, dann Kopf, dann Audio.
      const kopfLaenge = puffer.readUInt16BE(0);
      const kopf = leseKopf(puffer.subarray(2, 2 + kopfLaenge).toString('utf-8'));
      const eintrag = this.offen.get(kopf['x-requestid'] ?? '');
      if (eintrag) eintrag.stream.write(puffer.subarray(2 + kopfLaenge));
      return;
    }
    const text = String(daten);
    const kopf = leseKopf(text);
    if (!kopf['path']?.includes('turn.end')) return;
    this.offen.get(kopf['x-requestid'] ?? '')?.fertig();
  }
}

/** Ausgabeformat — dasselbe wie in der Bibliothek, damit die Dateien passen. */
const AUSGABEFORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const CHROME_HAUPTVERSION = '130';
const VERTRAUENSMARKE = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

/** Zuletzt erfolgreich aufgelöste Adresse des Sprachdienstes.
 *
 *  WARUM: Node merkt sich aufgelöste Namen NICHT — jeder Verbindungsaufbau
 *  fragt neu beim Betriebssystem nach. Hängt das WLAN an einem Repeater, fällt
 *  genau diese Namensauflösung immer wieder kurz aus; im Log eines Nutzers
 *  stand dann „getaddrinfo ENOTFOUND speech.platform.bing.com". Der Server war
 *  erreichbar — nur sein NAME war es gerade nicht.
 *
 *  Deshalb: Die einmal gefundene Adresse behalten und beim nächsten Aussetzer
 *  weiterverwenden. Adressen großer Dienste ändern sich selten; und falls die
 *  gemerkte doch nicht mehr stimmt, scheitert der Versuch wie vorher — mehr
 *  kaputtmachen kann es also nicht. */
let letzteAdresse: { adresse: string; familie: number } | null = null;

/** Namensauflösung mit Gedächtnis. Wird an `ws` durchgereicht. */
export function aufloesenMitGedaechtnis(
  hostname: string,
  optionen: unknown,
  rueckruf: (fehler: Error | null, adresse?: string, familie?: number) => void,
): void {
  dns.lookup(hostname, (fehler, adresse, familie) => {
    if (!fehler && adresse) {
      letzteAdresse = { adresse, familie };
      rueckruf(null, adresse, familie);
      return;
    }
    if (letzteAdresse) {
      log.gedrosselt('tts:dns-gedaechtnis', 5 * 60_000, 'info', 'TTS',
        'Der Name des Sprachdienstes ließ sich gerade nicht auflösen (typisch bei WLAN über einen Repeater) — '
        + 'die App nimmt die zuletzt bekannte Adresse. Das ist kein Fehler in deinem Setup.');
      rueckruf(null, letzteAdresse.adresse, letzteAdresse.familie);
      return;
    }
    rueckruf(fehler);
  });
}

/** Adresse samt Zugangsmarke. Die Marke wird aus der Uhrzeit abgeleitet und
 *  läuft ab — deshalb pro Verbindungsaufbau neu berechnet. */
function baueUrl(): string {
  return 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
    + `?TrustedClientToken=${VERTRAUENSMARKE}`
    + `&Sec-MS-GEC=${marke()}&Sec-MS-GEC-Version=1-${CHROME_HAUPTVERSION}.0.0.0`;
}

/** Microsofts Zugangsmarke: Zeit seit 1601 in 300-Sekunden-Schritten, gehasht. */
export function marke(jetztMs = Date.now()): string {
  const ticks = Math.floor((jetztMs / 1000 + 11644473600) / 300) * 300 * 1e7;
  return crypto.createHash('sha256').update(`${ticks}${VERTRAUENSMARKE}`).digest('hex').toUpperCase();
}
