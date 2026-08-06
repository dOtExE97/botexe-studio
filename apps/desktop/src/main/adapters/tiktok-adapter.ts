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
import { kannFortsetzung } from '../services/session-continuity';
import { Artenbuch } from './tiktok-artenbuch';
import type { HostInfo } from './tiktok-cloud';
import { leseRangUpdate, type RangStand } from './tiktok-rank';
import { lesePkStand, lesePkRahmen, pkText, type PkStand, type PkRahmen } from './tiktok-pk';
import { lesePin, pinText, type PinEreignis } from './tiktok-pin';
import {
  normalizeChat,
  normalizeGift,
  normalizeLike,
  normalizeSocial,
  normalizeViewerCount,
  normalizeSub,
  normalizeEnvelope,
  normalizeSuperfan,
  normalizeEmote,
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
  /** Room-ID des Live (bei 'connected') — jeder Live hat eine neue. Wechsel =
   *  neuer Stream, robuster als freshStream für den „Letztes Live"-Reset. */
  roomId?: string;
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
  /** TikToks Live-Ranglisten („dein Platz") — Zustand, kein Bus-Ereignis. */
  onRank?: (staende: RangStand[]) => void;
  /** PK-Kampf: Punktestand-Update bzw. Start/Ende. Wie die Ranglisten ein
   *  ZUSTAND, kein Ereignis — der Punktestand ändert sich im Sekundentakt und
   *  gehört nicht als Einzelereignis auf den Bus. */
  onPk?: (info: { stand?: PkStand; rahmen?: PkRahmen }) => void;
  /** Angepinnte Nachricht — ebenfalls ZUSTAND: Sie bleibt stehen, bis der
   *  Streamer sie löst. Ein Ereignis auf dem Bus wäre falsch, weil ein
   *  Overlay, das später startet, den Pin sonst nie zu sehen bekäme. */
  onPin?: (pin: PinEreignis) => void;
  /** Geschenke-Galerie des Streamers (TikToks Sammel-Album), falls abrufbar. */
  onGiftGallery?: (galerie: unknown) => void;
  /** Name, Bild und Livetitel des Streamers, sobald TikTok sie schickt.
   *  Typ kommt aus tiktok-cloud.ts — EINE Quelle, damit ein neues Feld dort
   *  nicht hier nachgepflegt werden muss (nur ein Typ-Import, kein Zirkel). */
  onHostInfo?: (info: HostInfo) => void;
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

/** So lange darf es still bleiben, bevor die App das meldet. Großzügig: Ein
 *  kleiner ruhiger Stream soll keinen Fehlalarm auslösen — die Zuschauerzahl
 *  allein trifft normalerweise alle paar Sekunden ein. */
const STILLE_WACHE_MS = 120_000;
/** Ab hier gilt die Leitung als tot und wird von selbst erneuert.
 *
 *  Der Fall ist belegt: Im Log eines Streamers stand 45 Minuten lang sechsmal
 *  dieselbe Zeile — gleiche Zuschauerzahl, gleiche Like-Zahl, gleiche Chat-Zahl.
 *  Nach dem Neuverbinden von Hand waren es schlagartig 415 Likes mehr. Die
 *  Verbindung war ein Telefonhörer, der noch am Ohr klebt: kein Fehler, kein
 *  Abbruch, nur nichts mehr drin. Für die App sah alles gesund aus.
 *
 *  Fünf Minuten sind bewusst spät. Ein Neuverbinden kostet ein Stück des
 *  Gratis-Kontingents, und ein Fehlalarm wäre teurer als ein spätes Erkennen. */
const TOTE_LEITUNG_MS = 5 * 60_000;
/** Zwischen zwei Selbstheilungen. Bremst den Fall, dass jeder frische Anlauf
 *  ebenfalls still bleibt — sonst liefe die App in eine Endlosschleife und
 *  verbrauchte in einer Stunde das Tageskontingent. */
const SELBSTHEILUNG_ABSTAND_MS = 10 * 60_000;
/** Takt des Wächters. Grob genug, um nicht aufzufallen, fein genug, damit die
 *  Fünf-Minuten-Grenze nicht zu sieben Minuten wird. */
const WACH_TAKT_MS = 30_000;
/** Erst nach 10 Minuten vergeblichen Wartens den Nutzernamen in Verdacht ziehen —
 *  vorher ist „noch nicht live" schlicht der Normalfall. */
const LIVE_WATCH_HINWEIS_MS = 10 * 60_000;
const LIVE_WATCH_WIEDERHOLUNG_MS = 60 * 60_000;
/** So viele verworfene Combo-Stufen ohne ein einziges gezähltes Geschenk gelten
 *  als Verdacht — darunter ist es einfach eine normale laufende Combo. */
const COMBO_VERDACHT_AB = 20;

/** Wie es um eine stehende Leitung bestellt ist, allein anhand der Stille.
 *
 *  Bewusst eine reine Funktion: Die Regel „ab wann ist eine Leitung tot" ist das
 *  Wesentliche, der Timer drumherum nur Mechanik. So lässt sie sich prüfen, ohne
 *  in einem Test fünf Minuten zu warten.
 *
 *  @param stillMs         wie lange kein Ereignis mehr kam
 *  @param seitHeilungMs   wie lange die letzte Selbstheilung her ist
 *                         (Infinity, wenn es noch keine gab)
 */
export function leitungsUrteil(stillMs: number, seitHeilungMs: number): 'ok' | 'warnen' | 'heilen' {
  if (stillMs >= TOTE_LEITUNG_MS && seitHeilungMs >= SELBSTHEILUNG_ABSTAND_MS) return 'heilen';
  if (stillMs >= STILLE_WACHE_MS) return 'warnen';
  return 'ok';
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

/**
 * Zu welchem Ereignisnamen gehört eine Protokoll-Nachrichtenart?
 * (`WebcastChatMessage` → `chat`)
 *
 * Die Zuordnung wird BEI DER BIBLIOTHEK ERFRAGT, nicht nachgebaut. Eine eigene
 * Kopie wäre eine zweite handgepflegte Liste für dieselbe Sache — genau das
 * Muster, an dem diese App schon mehrfach still erblindet ist. Kennt die
 * Bibliothek die Tabelle nicht (ältere Fassung), gibt es eben keine Zuordnung;
 * dann steht die Art im Bericht unter „verworfen", was ehrlicher ist als eine
 * geratene Antwort.
 */
let eventMapCache: Record<string, string> | null | undefined;
export function ereignisNameFuer(typ: string): string | undefined {
  if (eventMapCache === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const lib = require('tiktok-live-connector') as { WebcastEventMap?: Record<string, string> };
      eventMapCache = lib.WebcastEventMap ?? null;
    } catch { eventMapCache = null; }
  }
  return eventMapCache?.[typ];
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
  private readonly onRank?: (staende: RangStand[]) => void;
  private readonly onPk?: (info: { stand?: PkStand; rahmen?: PkRahmen }) => void;
  private readonly onPin?: (pin: PinEreignis) => void;
  /** Letzter gemeldeter Punktestand je Kampf — gegen Log-Flut bei 62 Updates. */
  private pkZuletzt = new Map<string, string>();
  private readonly onHostInfo?: (info: HostInfo) => void;
  private readonly onGiftGallery?: (galerie: unknown) => void;
  private readonly maxReconnect: number;
  private readonly baseReconnectDelayMs: number;
  private readonly jitterMs: number;
  private readonly now: () => number;
  private autoConnect: boolean;
  private readonly livePollMs: number;
  private readonly checkLive: (username: string) => Promise<boolean>;
  private readonly getAuth: () => TikTokAuth;
  private liveWatchTimer: ReturnType<typeof setTimeout> | null = null;
  /** Wächter gegen die stille Leitung: Steht die Verbindung, kommt aber nichts
   *  an, sagt das Log heute nur „Verbunden" — und der Streamer sucht den Fehler
   *  bei seinen Widgets und Regeln, wo er nicht ist.
   *
   *  Läuft als Ticker statt als Einmal-Timer. Die frühere Fassung wurde beim
   *  ersten Ereignis abgeblasen und nie wieder aufgezogen — sie bewachte damit
   *  nur die ersten Sekunden nach dem Verbinden. Genau die Stunde danach ist
   *  aber die gefährliche: Da merkt niemand mehr, wenn die Leitung stirbt. */
  private wachTicker: ReturnType<typeof setInterval> | null = null;
  /** Wann zuletzt IRGENDEIN echtes Ereignis kam (0 = noch nie eines gesehen).
   *  Überlebt Trennen/Verbinden bewusst — daran erkennt die App, ob ein
   *  Handverbinden mitten in einen laufenden Stream fällt. */
  private letztesEreignisAt = 0;
  /** Ab wann der Wächter rechnet (Zeitpunkt des Verbindens). */
  private wacheSeit = 0;
  /** Führt Buch, was im DIREKT-Modus ankam (im Cloud-Weg macht das der Router).
   *  Gehört zum Adapter, nicht zur Verbindung: Er überlebt einen Reconnect,
   *  damit der Bericht den ganzen Stream beschreibt und nicht ein Bruchstück. */
  private readonly artenbuch = new Artenbuch();
  /** Füllt sich beim Verdrahten von selbst — siehe attachHandlers. */
  private readonly abonnierteEreignisse = new Set<string>();
  /** Verhindert, dass die Stille-Warnung im Takt des Wächters wiederholt wird. */
  private stilleGemeldet = false;
  private letzteSelbstheilungAt = 0;

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
  /** Dedup gegen Reconnect-Replay: Nach jedem Reconnect schickt die Euler-Cloud
   *  teils die letzten Nachrichten erneut. TikTok-Events tragen eine eindeutige
   *  common.msgId — schon gesehene werden verworfen (sonst liest der TTS eine
   *  Nachricht ein zweites Mal vor). Überlebt Reconnects (Instanz-Feld), TTL-Cleanup. */
  private readonly seenMsgIds = new Map<string, number>();
  /** Wie viele Replay-Nachrichten seit dem letzten Reconnect verworfen wurden.
   *  Pro Ereignis zu loggen wäre eine Flut — es geht als EINE Sammelzeile raus
   *  (siehe meldeReplayBilanz). Sonst wirkt es, als schlucke TikTok Nachrichten. */
  private verworfeneReplays = 0;
  /** Combo-Zwischenstufen ohne Abschluss (siehe gift-Handler). */
  private verworfeneComboStufen = 0;
  private gezaehlteGeschenke = 0;
  private replayTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(bus: EventBus, options: TikTokAdapterOptions = {}) {
    this.bus = bus;
    this.factory = options.factory ?? defaultFactory;
    this.onStatus = options.onStatus ?? (() => undefined);
    this.onAvailableGifts = options.onAvailableGifts;
    this.onRank = options.onRank;
    this.onPk = options.onPk;
    this.onPin = options.onPin;
    this.onHostInfo = options.onHostInfo;
    this.onGiftGallery = options.onGiftGallery;
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
  /** Verfügbare Gift-Liste (mit Bildern) laden — best-effort. Im Direkt-Modus
   *  kann die bestehende Verbindung das selbst; im Cloud-Modus (EulerStream-WS
   *  hat KEIN fetchAvailableGifts) holen wir sie über eine separate, leichte
   *  Direkt-Verbindung (signierter HTTP-Call, kein zweiter WS). Sonst fehlen im
   *  Cloud-Modus alle nie-gesendeten Gifts (z.B. Event-/Community-Fest-Gifts). */
  private loadAvailableGifts(conn: LiveConnectionLike, epoch: number): void {
    if (!this.onAvailableGifts) return;
    const cb = this.onAvailableGifts;
    const own = (conn as unknown as { fetchAvailableGifts?: () => Promise<unknown> }).fetchAvailableGifts;
    const fetchGifts = typeof own === 'function'
      ? () => own.call(conn)
      : () => this.fetchGiftsViaSeparateConnection();
    void fetchGifts()
      .then((gifts) => { if (epoch === this.epoch && gifts) { this.giftListStatus = 'ok'; cb(gifts); } })
      .catch((err: Error) => {
        const msg = err?.message ?? '';
        // Der gift/list-Abruf braucht einen kostenpflichtigen Euler-Plan. Mit
        // Gratis-Key erwartbar → einmalig & freundlich melden, nicht bei jedem
        // Connect als Warnung. Gesendete Gifts werden ohnehin lokal gecacht.
        if (/business plan|requires a .*plan/i.test(msg)) {
          this.giftListStatus = 'plan-noetig';
          if (!this.giftListPlanNoted) {
            this.giftListPlanNoted = true;
            log.info('TikTok', 'Komplette Gift-Liste vorab nur mit Euler-Bezahlplan abrufbar — gesendete Gifts werden trotzdem gespeichert.');
          }
        } else {
          this.giftListStatus = 'fehler';
          log.warn('TikTok', `Gift-Liste nicht abrufbar: ${msg}`);
        }
      });
  }
  private giftListPlanNoted = false;

  /**
   * Geschenke-GALERIE des Streamers holen (TikToks Sammel-Album).
   *
   * Die Bibliothek kann das seit 2.4 über `fetchRoomGiftGalleryFromEulerRoute`
   * — wir haben es nur nie aufgerufen. Ob der GRATIS-Key das darf, ist offen:
   * Die verwandte Gift-Listen-Route braucht einen Bezahlplan. Deshalb hier
   * derselbe ehrliche Umgang wie dort — klappt es, ist die Galerie da; kommt
   * „Bezahlplan nötig", steht das genauso im Log statt eines stummen
   * Fehlschlags. Nach dem nächsten echten Live wissen wir es sicher.
   */
  /**
   * Eine Euler-HTTP-Route aufrufen — mit den Clients einer kurzlebigen
   * Hilfsverbindung.
   *
   * Diese Routen brauchen `webClient` und `apiClient` einer Verbindung. Beim
   * ersten Anlauf wurde die Galerie ohne sie aufgerufen und scheiterte an
   * „Cannot read properties of undefined (reading 'cookieJar')" — ein Aufruf,
   * der IMMER fehlschlägt, ist schlimmer als keiner: Er setzt bei jedem Nutzer
   * eine Fehlerzeile ins Log, die nach einem echten Problem aussieht.
   *
   * MEHRERE Routen teilen sich hier EINE Verbindung. Vorher baute jeder Abruf
   * seine eigene auf; bei zwei Abrufen war das der doppelte Aufwand für
   * dieselbe Sache — und jede Verbindung kostet ein Stück Tageskontingent.
   */
  private async ueberHilfsverbindung<T>(
    routen: Array<(clients: { webClient: unknown; apiClient: unknown }) => Promise<T>>,
  ): Promise<Array<PromiseSettledResult<T>>> {
    const c = createDirectConnection(this.username, this.getAuth()) as unknown as {
      fetchRoomId?: () => Promise<unknown>;
      webClient?: unknown;
      apiClient?: unknown;
      disconnect?: () => void;
    };
    try {
      await c.fetchRoomId?.();
      if (!c.webClient || !c.apiClient) throw new Error('Verbindung liefert keine Clients');
      const clients = { webClient: c.webClient, apiClient: c.apiClient };
      // allSettled, nicht all: Scheitert die Galerie (Bezahlplan), soll die
      // Raum-Info trotzdem ankommen. Ein gemeinsamer Aufruf darf nicht heißen,
      // dass ein Fehler alles mitreißt.
      return await Promise.allSettled(routen.map((r) => r(clients)));
    } finally {
      try { void Promise.resolve(c.disconnect?.()).catch(() => undefined); } catch { /* egal */ }
    }
  }

  /**
   * Raum-Info des Streamers holen: Name, Bild, Livetitel — und zwei Angaben,
   * die es sonst NIRGENDS gibt: die echte Stream-STARTZEIT und die
   * FOLLOWER-Zahl.
   *
   * Belegt in node_modules/tiktok-live-api-sdk/dist/index.d.ts:
   *   room_info { title, start_time, current_viewers, total_viewers, is_live, … }
   *   user      { nickname, avatar_url, signature, followers, following, … }
   */
  private loadRoomInfo(epoch: number): void {
    if (!this.onHostInfo) return;
    const cb = this.onHostInfo;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const lib = require('tiktok-live-connector') as {
        fetchRoomInfoFromEulerRoute?: (args: Record<string, unknown>) => Promise<unknown>;
      };
      const route = lib.fetchRoomInfoFromEulerRoute;
      if (typeof route !== 'function') throw new Error('Route nicht vorhanden');
      const [erg] = await this.ueberHilfsverbindung([
        (cl) => route({ uniqueId: this.username, ...cl, options: {} }),
      ]);
      if (!erg) throw new Error('Kein Ergebnis');
      if (erg.status === 'rejected') throw erg.reason as Error;
      return erg.value;
    })()
      .then((antwort) => {
        if (epoch !== this.epoch) return;
        const d = (antwort as { data?: {
          room_info?: { title?: string; start_time?: number; total_viewers?: number };
          user?: { nickname?: string; avatar_url?: string; followers?: number };
        } })?.data;
        if (!d) return;
        const info = {
          ...(d.user?.nickname ? { nickname: d.user.nickname } : {}),
          ...(d.user?.avatar_url ? { avatar: d.user.avatar_url } : {}),
          ...(d.room_info?.title ? { titel: d.room_info.title } : {}),
          ...(typeof d.room_info?.start_time === 'number' && d.room_info.start_time > 0
            ? { startetAt: d.room_info.start_time * 1000 } : {}),
          ...(typeof d.user?.followers === 'number' ? { follower: d.user.followers } : {}),
        };
        if (Object.keys(info).length === 0) return;
        log.einmal('tiktok:raum-info', 'info', 'TikTok',
          `Raum-Info abgerufen: ${info.nickname ?? '(kein Name)'}`
          + `${info.follower !== undefined ? ` · ${info.follower.toLocaleString('de-DE')} Follower` : ''}`
          + `${info.startetAt ? ` · live seit ${new Date(info.startetAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}`);
        cb(info);
      })
      .catch((err: Error) => {
        log.einmal('tiktok:raum-info-fehler', 'info', 'TikTok',
          `Die Raum-Info ließ sich nicht abrufen: ${(err?.message ?? '').slice(0, 120)}. `
          + 'Name und Bild kommen dann aus der Live-Ansage, die TikTok beim Verbinden schickt — '
          + 'nur Startzeit und Follower-Zahl fehlen.');
      });
  }

  private loadGiftGallery(epoch: number): void {
    if (!this.onGiftGallery) return;
    const cb = this.onGiftGallery;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const lib = require('tiktok-live-connector') as {
        fetchRoomGiftGalleryFromEulerRoute?: (args: Record<string, unknown>) => Promise<unknown>;
      };
      const route = lib.fetchRoomGiftGalleryFromEulerRoute;
      if (typeof route !== 'function') throw new Error('Route nicht vorhanden');
      const [erg] = await this.ueberHilfsverbindung([
        (cl) => route({ uniqueId: this.username, ...cl, options: {} }),
      ]);
      if (!erg) throw new Error('Kein Ergebnis');
      if (erg.status === 'rejected') throw erg.reason as Error;
      return erg.value;
    })()
      .then((galerie) => {
        if (epoch !== this.epoch || !galerie) return;
        this.giftGalleryStatus = 'ok';
        log.info('TikTok', 'Geschenke-Galerie des Streamers abgerufen.');
        cb(galerie);
      })
      .catch((err: Error) => {
        const msg = err?.message ?? '';
        if (/business plan|requires a .*plan|premium/i.test(msg)) {
          this.giftGalleryStatus = 'plan-noetig';
          log.einmal('tiktok:galerie-plan', 'info', 'TikTok',
            'Die Geschenke-Galerie ist nur mit einem eulerstream-Bezahlplan abrufbar — '
            + 'die App kommt ohne sie aus, es fehlt nur die Sammel-Ansicht.');
        } else {
          this.giftGalleryStatus = 'fehler';
          log.einmal('tiktok:galerie-fehler', 'info', 'TikTok',
            `Die Geschenke-Galerie ließ sich nicht abrufen: ${msg.slice(0, 120)}. `
            + 'Das ist KEIN Fehler in deinem Setup — die App kommt ohne die Galerie aus, '
            + 'es fehlt nur die Sammel-Ansicht.');
        }
      });
  }

  private giftGalleryStatus: 'unbekannt' | 'ok' | 'plan-noetig' | 'fehler' = 'unbekannt';

  /** Ergebnis des letzten Galerie-Abrufs — damit die Oberfläche nicht rät. */
  getGiftGalleryStatus(): 'unbekannt' | 'ok' | 'plan-noetig' | 'fehler' {
    return this.giftGalleryStatus;
  }

  /** Ergebnis des letzten Gift-Listen-Abrufs. Nur hier bekannt, aber die
   *  Oberfläche MUSS es wissen: schlägt der Abruf fehl (Gratis-Key), bleiben im
   *  Katalog nur die Gifts, die wirklich jemand geschickt hat — alle anderen
   *  zeigen einen Platzhalter statt Bild. Ohne diese Auskunft sah das nach einem
   *  Fehler aus, und der Gift-Picker versprach fälschlich „dann sind alle da". */
  private giftListStatus: 'unbekannt' | 'ok' | 'plan-noetig' | 'fehler' = 'unbekannt';

  getGiftListStatus(): 'unbekannt' | 'ok' | 'plan-noetig' | 'fehler' {
    return this.giftListStatus;
  }

  /** Cloud-Modus: nur die Gift-Liste über eine Wegwerf-Direkt-Verbindung holen
   *  (fetchRoomId → fetchAvailableGifts, signiert via Euler-Key; kein Live-WS). */
  private async fetchGiftsViaSeparateConnection(): Promise<unknown> {
    const c = createDirectConnection(this.username, this.getAuth()) as unknown as {
      fetchRoomId?: () => Promise<unknown>;
      fetchAvailableGifts?: () => Promise<unknown>;
      disconnect?: () => void;
    };
    try {
      await c.fetchRoomId?.();
      return await c.fetchAvailableGifts?.();
    } finally {
      // Auch hier den Promise-Fall mitfangen: Der echte Direkt-Client liefert
      // aus disconnect() ein Promise, ein Reject liefe am try/catch vorbei.
      try { void Promise.resolve(c.disconnect?.()).catch(() => undefined); } catch { /* egal */ }
    }
  }

  private async defaultCheckLive(username: string): Promise<boolean> {
    try {
      const conn = this.factory(username, this.getAuth()) as unknown as {
        fetchIsLive?: () => Promise<boolean>;
        disconnect?: () => void;
      };
      const live = await conn.fetchIsLive?.();
      try { void Promise.resolve(conn.disconnect?.()).catch(() => undefined); } catch { /* egal */ }
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
    // Zum Schluss die Bilanz: was kam in diesem Stream an, wie oft, und was
    // davon werten wir aus. Eine Zeile statt „durchsuch mal die Logdatei".
    this.artenbuch.schreibeBericht();
    this.artenbuch.leeren();
    this.epoch++; // entwertet laufende Handler/Timer/Connect-Promises
    this.clearReconnectTimer();
    this.clearLiveWatch();
    this.stilleWacheAbblasen();
    this.replayBilanzAbblasen();
    this.cleanupConnection();
    this.emitStatus({ status: 'disconnected', isReconnect: false });
    log.info('TikTok', 'Getrennt (manuell)');
  }

  private async doConnect(epoch: number, isReconnect: boolean): Promise<void> {
    if (epoch !== this.epoch) return; // veraltete Generation

    // K2: alte Connection IMMER zuerst abräumen.
    this.clearReconnectTimer();
    this.clearLiveWatch();
    this.stilleWacheAbblasen();
    this.replayBilanzAbblasen();
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
        // Eine Zeile dazu, weil hektisches Doppelklicken auf „Verbinden" sonst
        // spurlos bleibt: Danach steht die App auf verbunden, ein Teil der
        // Ereignisse fehlt — und es sieht nach einem TikTok-Aussetzer aus.
        log.info('TikTok', 'Eine zweite Verbindung wurde aufgebaut, während die erste noch lief — '
          + 'die ältere wird verworfen, damit nichts doppelt gezählt oder doppelt vorgelesen wird.');
        conn.removeAllListeners();
        // Promise-Fall mitfangen (siehe cleanupConnection) — sonst wird aus einem
        // gescheiterten Trennen eine unbeschriftete unhandledRejection.
        void Promise.resolve(conn.disconnect()).catch(() => undefined);
        return;
      }
      this.reconnectAttempts = 0;
      // Neuer Stream = erster Connect ODER erneutes Live nach Stream-Ende
      // (pendingFresh vom Live-Watch). NICHT bei Reconnect nach kurzem Abriss.
      //
      // …und NICHT beim Handverbinden mitten im laufenden Stream. Der Fall stand
      // zweimal im Log desselben Abends: Der Streamer drückt „Trennen" und
      // „Verbinden", die App meldet „NEUER Stream — Zähler starten bei null",
      // obwohl derselbe Stream weiterlief (die Like-Zahl lief durch). Aus einem
      // Abend wurden drei Einträge in der Auswertung. Beim App-Neustart macht die
      // App es längst richtig — hier fehlte dieselbe Frage.
      //
      // Dieselbe Zeitgrenze wie dort, aus derselben Quelle (kannFortsetzung).
      const eben = this.letztesEreignisAt > 0 && kannFortsetzung(this.now() - this.letztesEreignisAt);
      const laeuftWeiter = eben && !this.streamEnded;
      const freshStream = (!isReconnect || this.pendingFresh) && !laeuftWeiter;
      if (laeuftWeiter && !isReconnect) {
        log.info('TikTok', 'Neu verbunden, aber es ist derselbe Stream (eben kamen noch Ereignisse) — '
          + 'die Zähler laufen weiter. Für einen echten Neuanfang: „Session zurücksetzen" auf der Live-Seite.');
      }
      this.pendingFresh = false;
      this.hasConnectedOnce = true;
      this.emitStatus({ status: 'connected', isReconnect, freshStream, roomId: state.roomId != null ? String(state.roomId) : undefined });
      log.info('TikTok', `Verbunden mit @${this.username}${state.roomId ? ` (Room ${state.roomId})` : ''}`);
      // Frisch verbunden = die alten „einmal"-Meldungen dürfen wieder. Sonst
      // bliebe ein Problem, das beim letzten Mal gemeldet wurde, für den Rest
      // des Abends stumm — auch wenn es erneut auftritt.
      log.merkerZuruecksetzen('tiktok:');
      this.verworfeneComboStufen = 0;
      this.gezaehlteGeschenke = 0;
      this.starteStilleWache(epoch);
      if (isReconnect) this.meldeReplayBilanz();

      // Gift-Katalog: komplette Gift-Liste (mit Bildern) abrufen — best-effort.
      this.loadAvailableGifts(conn, epoch);
      this.loadGiftGallery(epoch);
      this.loadRoomInfo(epoch);

      const viewers = typeof state.viewerCount === 'number' ? state.viewerCount : 0;
      if (viewers > 0) {
        this.bus.publish(normalizeViewerCount({ viewerCount: viewers }, this.now()));
      }
    } catch (err) {
      if (epoch !== this.epoch) return;
      // Der Versuch ist gescheitert — also darf auch keine halbfertige
      // Connection stehen bleiben. Sonst meldet isConnected() weiterhin „ja",
      // und Dinge, die daran hängen, laufen ins Leere weiter: Im Log eines
      // Streamers wurden nach dem Stream-Ende noch eine halbe Stunde lang
      // Zuschauerzahlen protokolliert, die längst eingefroren waren.
      this.stilleWacheAbblasen();
      this.cleanupConnection();
      const msg = (err as Error).message || '';
      // „(Noch) nicht live" ist KEIN Fehler (Stream-Ende / wartet aufs Live) →
      // als INFO loggen, nicht als alarmierendes ERROR. Echte Fehler bleiben ERROR.
      if (isOfflineError(msg)) {
        log.info('TikTok', `@${this.username} ist gerade nicht live — verbinde automatisch, sobald wieder live.`);
      } else {
        log.error('TikTok', 'Verbindung fehlgeschlagen', msg);
      }
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
      // „Noch nicht live" ist KEIN Abbruchfehler: statt nach 5 Versuchen aufzugeben,
      // auf das Live warten und automatisch verbinden (wie nach Stream-Ende) — der
      // Streamer muss nicht mehr manuell „Verbinden" klicken, wenn er live geht.
      // Dieser Fall wird VOR dem generischen Fehler behandelt, damit der rohe
      // „isn't online"-Text nicht als verwirrender Fehler-Toast aufpoppt.
      if (this.autoConnect && isOfflineError(msg)) {
        // Ohne Sign-Key ist das stille „warte auf Live" eine Sackgasse: sobald
        // der Streamer live geht, scheitert der Sign-Schritt ohnehin am
        // fehlenden Key. Beim Test (Streamer meist NICHT live) sähe ein neuer
        // User sonst nur ewig „RECONNECT…" ohne Grund. Darum: kein Key → sofort
        // der klare, handlungsfähige Key-Hinweis (löst einen Fehler-Toast aus).
        if (!this.getAuth().signApiKey) {
          this.pendingFresh = false;
          this.emitStatus({
            status: 'error',
            isReconnect,
            detail: `@${this.username} ist gerade nicht live — und es fehlt noch der kostenlose eulerstream-Key. Hol ihn dir gratis unter Einstellungen → TikTok-Verbindung; danach verbindet sich die App automatisch, sobald du (oder der Kanal) live ist.`,
          });
          return;
        }
        this.pendingFresh = true; // erstes Live = neuer Stream → Reset
        this.startLiveWatch(epoch); // emittiert selbst status 'reconnecting' (warte auf Live)
      } else {
        // Echter Verbindungsfehler → generischer Fehler-Toast + Reconnect.
        this.emitStatus({ status: 'error', isReconnect, detail: msg });
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
      if (e) {
        this.leitungLebt(); // es kommt etwas an — die Leitung ist gesund
        // Zwei stille Totalausfälle sichtbar machen. Beide entstehen, wenn
        // TikTok seine Datenfelder umbenennt (ist genau so schon passiert):
        // Ohne Absender bekommt niemand Punkte und keine Bestenliste füllt sich;
        // ohne Geschenknamen trifft KEINE Geschenk-Regel mehr. Vorher stand zu
        // beidem nichts im Log — der Streamer suchte bei seinen Regeln.
        // Je Verbindung nur einmal, sonst wären es hunderte Zeilen pro Minute.
        if (!e.user && e.type !== 'viewer_count' && e.type !== 'timer') {
          log.einmal('tiktok:ohne-absender', 'warn', 'TikTok',
            'Es kommen Ereignisse ohne erkennbaren Absender an (kein @-Name, keine ID) — dafür gibt es keine Punkte, '
            + 'keinen Eintrag in der Bestenliste und keinen Namen in Ansagen. Meist hat TikTok die Datenfelder umbenannt: '
            + 'in Einstellungen → TikTok-Verbindung den anderen Modus probieren.');
        }
        if (e.type === 'gift' && e.gift?.slug === 'gift') {
          log.einmal('tiktok:gift-ohne-namen', 'warn', 'TikTok',
            'Ein Geschenk kam ohne Namen an und läuft jetzt als „gift" — damit trifft es KEINE deiner Geschenk-Regeln: '
            + 'keine Animation, kein Sound. Das passiert, wenn TikTok die Geschenk-Felder umbenennt. '
            + 'In Einstellungen → TikTok-Verbindung den anderen Verbindungsmodus probieren.');
        }
        this.bus.publish(e);
      }
    };
    // Reconnect-Replay verwerfen: dieselbe common.msgId nicht zweimal
    // verarbeiten (sonst doppelte TTS-Ansage / doppelter Gift-Alert). Like-
    // Events sind Zähler-Batches ohne verlässliche Einzel-msgId → nicht dedupen.
    const dedup = (d: unknown): boolean => {
      const raw = (d as { common?: { msgId?: unknown }; msgId?: unknown } | null)?.common?.msgId
        ?? (d as { msgId?: unknown } | null)?.msgId;
      if (raw == null || raw === '' || raw === '0') return false;
      const key = String(raw);
      if (this.seenMsgIds.has(key)) { this.verworfeneReplays += 1; return true; }
      const now = this.now();
      this.seenMsgIds.set(key, now);
      if (this.seenMsgIds.size > 3000) { for (const [k, t] of this.seenMsgIds) if (now - t > 600_000) this.seenMsgIds.delete(k); }
      return false;
    };

    // `on` schreibt mit, was abonniert wurde. Damit gibt es KEINE zweite,
    // von Hand gepflegte Liste der ausgewerteten Ereignisse — die wäre genau
    // die Fehlerklasse, die diese App schon fünfmal getroffen hat: zwei Listen
    // für dieselbe Sache, die auseinanderlaufen, ohne dass es jemand merkt.
    const roh = conn.on.bind(conn) as (event: string, cb: (data: never) => void) => unknown;
    const on = (event: string, cb: (data: never) => void): unknown => {
      this.abonnierteEreignisse.add(event);
      return roh(event, cb);
    };
    on('chat', guard((d: Parameters<typeof normalizeChat>[0]) => { if (!dedup(d)) publish(normalizeChat(d, this.now())); }));
    on('gift', guard((d: Parameters<typeof normalizeGift>[0]) => {
      if (dedup(d)) return;
      const e = normalizeGift(d, this.now());
      // normalizeGift verwirft bewusst alle Combo-Zwischenstufen und zählt nur
      // das Abschluss-Ereignis. Schickt TikTok den Abschluss aber nicht (kommt
      // im Cloud-Weg vor), wird JEDES Geschenk verworfen — und es stand
      // nirgends, dass hier absichtlich nichts passiert. Der Streamer testet
      // dann zwanzigmal dieselbe Regel, während die App auf ein Combo-Ende
      // wartet, das nie kommt. Erst ab einer Schwelle melden, sonst feuert es
      // bei jeder ganz normalen Combo.
      if (!e) {
        this.verworfeneComboStufen += 1;
        if (this.verworfeneComboStufen >= COMBO_VERDACHT_AB && this.gezaehlteGeschenke === 0) {
          log.einmal('tiktok:combo-ohne-abschluss', 'warn', 'TikTok',
            `Bisher kamen ${this.verworfeneComboStufen} Zwischenstände von Combo-Geschenken an, aber kein einziger Abschluss — `
            + 'solange TikTok das Combo-Ende nicht schickt, wird bewusst nichts gezählt (sonst zählt jede Combo-Stufe doppelt). '
            + 'Wenn dir Geschenk-Alerts fehlen: das ist der Grund. In Einstellungen → TikTok-Verbindung den anderen Modus probieren.');
        }
        return;
      }
      this.gezaehlteGeschenke += 1;
      publish(e);
    }));
    on('like', guard((d: Parameters<typeof normalizeLike>[0]) => publish(normalizeLike(d, this.now()))));
    // Auch Social-Events dedupen (WebcastSocialMessage hat eine stabile msgId) —
    // sonst vergibt ein Reconnect-Replay doppelte Follow-Punkte + doppelte Ansage.
    on('follow', guard((d: Parameters<typeof normalizeSocial>[0]) => { if (!dedup(d)) publish(normalizeSocial(d, 'follow', this.now())); }));
    on('share', guard((d: Parameters<typeof normalizeSocial>[0]) => { if (!dedup(d)) publish(normalizeSocial(d, 'share', this.now())); }));
    on('member', guard((d: Parameters<typeof normalizeSocial>[0]) => { if (!dedup(d)) publish(normalizeSocial(d, 'join', this.now())); }));
    on('roomUser', guard((d: Parameters<typeof normalizeViewerCount>[0]) => publish(normalizeViewerCount(d, this.now()))));
    // Teamherz-Abo: Die App kannte den Ereignis-Typ 'sub' längst (inkl. fertiger
    // Trigger-Vorlage) — nur hat ihn nie etwas ausgelöst. Jetzt schon.
    on('subNotify', guard((d: Parameters<typeof normalizeSub>[0]) => { if (!dedup(d)) publish(normalizeSub(d, this.now())); }));
    // Coin-Kiste / Schatztruhe (auch die Superfan-Truhe).
    on('envelope', guard((d: Parameters<typeof normalizeEnvelope>[0]) => { if (!dedup(d)) publish(normalizeEnvelope(d, this.now())); }));
    // Superfan: TikTok trennt „neu beigetreten" von sonstigen Superfan-Meldungen.
    on('superFanJoin', guard((d: Parameters<typeof normalizeSuperfan>[0]) => { if (!dedup(d)) publish(normalizeSuperfan(d, true, this.now())); }));
    on('superFan', guard((d: Parameters<typeof normalizeSuperfan>[0]) => { if (!dedup(d)) publish(normalizeSuperfan(d, false, this.now())); }));
    on('emote', guard((d: Parameters<typeof normalizeEmote>[0]) => { if (!dedup(d)) publish(normalizeEmote(d, this.now())); }));
    // Name und Bild des Streamers selbst (aus dem roomInfo-Rahmen).
    on('hostInfo', guard((d: { nickname?: string; avatar?: string }) => this.onHostInfo?.(d)));
    // Ranglisten-Stand: nicht auf den Bus, sondern direkt an den Aufrufer —
    // es ist ein Zustand („Platz 12"), kein Vorfall, den Trigger auswerten müssten.
    if (this.onRank) {
      const melde = this.onRank;
      on('rankUpdate', guard((d: unknown) => {
        const staende = leseRangUpdate(d, this.now());
        if (staende.length) melde(staende);
      }));
    }

    // PK-KAMPF. Zwei Nachrichten, sehr unterschiedlich getaktet:
    //   linkMicBattle  ~2× je Kampf  (Start und Ende)
    //   linkMicArmies  ~62× je Kampf (der Punktestand, im Sekundentakt)
    // Deshalb wird der Punktestand nur ins Log geschrieben, wenn er sich
    // WIRKLICH geändert hat — sonst wären es 62 fast identische Zeilen für
    // einen einzigen Kampf, und der Rest des Logs ginge darin unter.
    on('linkMicBattle', guard((d: unknown) => {
      const rahmen = lesePkRahmen(d);
      if (!rahmen) return;
      this.onPk?.({ rahmen });
      if (rahmen.ergebnis) {
        log.info('TikTok', `PK-Kampf beendet (Kampf ${rahmen.battleId}).`);
        this.pkZuletzt.delete(rahmen.battleId);
      } else {
        const dauer = rahmen.dauerSek ? ` · ${Math.round(rahmen.dauerSek / 60)} Minuten` : '';
        log.info('TikTok', `PK-Kampf gestartet gegen ${rahmen.teilnehmer.length - 1 || 1} Gegner${dauer}. `
          + 'Der Punktestand steht ab jetzt im Log und im Cockpit.');
      }
    }));

    on('roomPin', guard((d: unknown) => {
      const pin = lesePin(d);
      if (!pin) return;
      this.onPin?.(pin);
      log.info('TikTok', pinText(pin));
    }));

    on('linkMicArmies', guard((d: unknown) => {
      const stand = lesePkStand(d);
      if (!stand) return;
      this.onPk?.({ stand });
      const text = pkText(stand);
      if (this.pkZuletzt.get(stand.battleId) === text) return; // nichts Neues
      this.pkZuletzt.set(stand.battleId, text);
      log.gedrosselt(`pk:${stand.battleId}`, 15_000, 'info', 'TikTok', `PK-Stand: ${text}`);
    }));

    // MITHÖREN, was wir noch nicht kennen.
    //
    // Der Adapter abonniert gezielt neun Ereignisse — alles andere erreicht ihn
    // im Direktmodus nie, auch nicht als Spur im Log. Die Bibliothek kennt aber
    // 61 Arten. Was TikTok Neues einführt, wäre damit für immer unsichtbar: Man
    // müsste ahnen, wonach man sucht, um es zu abonnieren, und um es zu ahnen,
    // müsste man es gesehen haben.
    //
    // `decodedData` ist der Mithör-Kanal der Bibliothek: JEDE dekodierte
    // Nachricht als {type, data}. Wir werten sie nicht aus — wir zählen nur
    // mit, damit der Bericht am Stream-Ende auch im Direktmodus vollständig
    // ist. Im Cloud-Weg macht das der Router selbst.
    on('decodedData', guard((d: unknown) => {
      const typ = (d as { type?: string } | undefined)?.type;
      if (typeof typ !== 'string' || !typ) return;
      // Ob wir die Art auswerten, sagt die Zuordnungstabelle der Bibliothek
      // selbst (WebcastChatMessage -> 'chat'). Sie zu befragen statt sie
      // nachzubauen heißt: Bei einem Update der Bibliothek stimmt der
      // Bericht weiter, ohne dass jemand daran denken muss.
      const ereignis = ereignisNameFuer(typ);
      this.artenbuch.verbuche(typ, !!ereignis && this.abonnierteEreignisse.has(ereignis));
    }));

    on('streamEnd', guard(() => {
      log.info('TikTok', 'Stream beendet');
      this.artenbuch.schreibeBericht();
      this.artenbuch.leeren();
      this.streamEnded = true;
      // TikFinity-Verhalten: auf das nächste Live warten und automatisch zurück.
      if (this.autoConnect) this.startLiveWatch(epoch);
      // Ohne Auto-Connect passiert ab hier bewusst GAR NICHTS mehr. Das sah
      // bisher nach einem hängenden Zustand aus — die Oberfläche stand weiter
      // auf grün, und der Streamer startete die App neu, obwohl ein Klick auf
      // „Verbinden" gereicht hätte.
      else {
        log.info('TikTok', 'Stream beendet — „Automatisch verbinden, wenn ich live gehe" ist ausgeschaltet, '
          + 'deshalb wartet die App NICHT auf dein nächstes Live. Wenn du gleich wieder sendest, '
          + 'drücke oben auf „Verbinden" oder schalte die Einstellung ein.');
      }
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
      // Sagt jetzt auch, was DANACH gilt: Es wird kein Live-Watch gestartet,
      // die App kommt also auch mit „Automatisch verbinden" nicht von allein
      // zurück. Ohne diesen Halbsatz wartet man vergeblich.
      log.error('TikTok', `Nach ${this.maxReconnect} Versuchen keine Verbindung mehr zustande gekommen — `
        + 'die App versucht es ab jetzt NICHT mehr von allein, auch nicht über „Automatisch verbinden". '
        + 'Bitte oben einmal auf „Verbinden" drücken.');
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
    // Ab hier lief das Warten bisher völlig lautlos: alle 30 s ein Poll, im Log
    // genau EINE Zeile vom Anfang. Ist der Nutzername falsch geschrieben,
    // wartet die App stundenlang — und der Streamer startet sie immer wieder
    // neu, weil sie hängengeblieben aussieht.
    const wartetSeit = this.now();
    let hinweisGegebenAt = 0;

    const tick = async (): Promise<void> => {
      this.liveWatchTimer = null;
      if (epoch !== this.epoch) return;
      let live = false;
      try {
        live = await this.checkLive(this.username);
      } catch (err) {
        log.warn('TikTok', 'Live-Check fehlgeschlagen', (err as Error).message);
      }
      // Nach 10 Minuten einmal den Verdacht aussprechen, danach höchstens
      // stündlich — bei totem Netz wären es sonst 480 Zeilen in 4 Stunden.
      const wartetMs = this.now() - wartetSeit;
      if (!live && wartetMs >= LIVE_WATCH_HINWEIS_MS && this.now() - hinweisGegebenAt >= LIVE_WATCH_WIEDERHOLUNG_MS) {
        hinweisGegebenAt = this.now();
        // Den Nutzernamen NUR verdächtigen, wenn diese App mit ihm noch nie
        // verbunden war. Waren wir vorhin noch dran, ist der Name bewiesen
        // richtig und der Hinweis schickt in die Irre — genau das ist einem
        // Streamer passiert, zehn Minuten nach seinem regulären Stream-Ende.
        const minuten = Math.round(wartetMs / 60_000);
        log.info('TikTok', this.hasConnectedOnce
          ? `Warte seit ${minuten} Minuten auf das nächste Live von @${this.username} — das ist der Normalfall `
            + 'nach einem Stream-Ende. Sobald du wieder sendest, verbindet die App von allein.'
          : `Warte jetzt seit ${minuten} Minuten darauf, dass @${this.username} live geht — TikTok meldet weiterhin `
            + '„nicht live". Wenn du tatsächlich gerade sendest, stimmt vermutlich der Nutzername nicht: '
            + 'oben im Feld genau den @-Namen aus deinem TikTok-Profil eintragen.');
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

  /** Nach dem Verbinden zwei Minuten lauschen: Kommt bis dahin KEIN einziges
   *  Ereignis, ist das eine Meldung wert. Zwei Minuten sind bewusst großzügig —
   *  ein ruhiger kleiner Stream ohne Chat soll keinen Fehlalarm auslösen, aber
   *  die Zuschauerzahl allein kommt in aller Regel früher. */
  /** Nach einem Reconnect spielt die Cloud die letzten Nachrichten erneut ein.
   *  Dass die verworfen werden, ist richtig — aber unsichtbar: Der Streamer
   *  sieht auf dem Handy Chats, die in der App fehlen, und vermutet einen
   *  TikTok-Aussetzer. Eine Sammelzeile ~5 s nach dem Verbinden beantwortet
   *  das; ohne Replay bleibt das Log still. */
  private meldeReplayBilanz(): void {
    if (this.replayTimer) clearTimeout(this.replayTimer);
    this.verworfeneReplays = 0;
    this.replayTimer = setTimeout(() => {
      this.replayTimer = null;
      if (this.verworfeneReplays <= 0) return;
      log.info('TikTok', `Nach dem Reconnect hat TikTok ${this.verworfeneReplays} bereits bekannte Nachrichten erneut geschickt — `
        + 'die wurden verworfen, damit nichts doppelt vorgelesen oder doppelt gezählt wird.');
      this.verworfeneReplays = 0;
    }, 5_000);
    this.replayTimer.unref?.();
  }

  private replayBilanzAbblasen(): void {
    if (this.replayTimer) { clearTimeout(this.replayTimer); this.replayTimer = null; }
  }

  private starteStilleWache(epoch: number): void {
    this.stilleWacheAbblasen();
    // BEWUSST getrennt von `letztesEreignisAt`: Der Wächter muss ab jetzt
    // rechnen (sonst schlüge er nach dem Verbinden sofort an), die Frage
    // „lief dieser Stream eben noch?" muss dagegen den ECHTEN letzten
    // Ereigniszeitpunkt kennen. Ein gemeinsames Feld würde eine der beiden
    // Antworten verfälschen.
    this.wacheSeit = this.now();
    this.stilleGemeldet = false;
    this.wachTicker = setInterval(() => {
      if (epoch !== this.epoch) return;
      const still = this.now() - Math.max(this.wacheSeit, this.letztesEreignisAt);
      const urteil = leitungsUrteil(
        still,
        this.letzteSelbstheilungAt === 0 ? Infinity : this.now() - this.letzteSelbstheilungAt,
      );

      if (urteil !== 'ok' && !this.stilleGemeldet) {
        this.stilleGemeldet = true;
        log.warn('TikTok', `Seit ${Math.round(still / 60_000)} Minuten kommt kein einziges Ereignis mehr an — kein Chat, `
          + 'kein Like, keine Zuschauerzahl. Die Leitung steht, liefert aber nichts. Such NICHT bei den Widgets: '
          + `Bleibt es dabei, verbindet die App in ${Math.round((TOTE_LEITUNG_MS - STILLE_WACHE_MS) / 60_000)} Minuten `
          + 'von allein neu.');
      }

      if (urteil === 'heilen') {
        this.letzteSelbstheilungAt = this.now();
        log.warn('TikTok', `Nach ${Math.round(still / 60_000)} Minuten ohne ein einziges Ereignis gilt die Leitung als tot — `
          + 'die App verbindet jetzt selbst neu. Die Zähler laufen dabei weiter, es geht nichts verloren. '
          + 'Passiert das öfter, liegt es meist am WLAN (Repeater, schwacher Empfang).');
        // Als Reconnect, NICHT als neuer Stream: sonst stünden Bestenliste und
        // Zähler nach jeder Selbstheilung auf null — die Reparatur täte dann
        // mehr weh als der Fehler.
        void this.doConnect(this.epoch, true);
      }
    }, WACH_TAKT_MS);
    // Der Wächter darf NICHTS am Leben halten. Ohne unref() hängt schon ein
    // Test, der eine Verbindung nicht ausdrücklich schließt, bis Node von selbst
    // aufgibt — und im echten Betrieb verzögert ein laufender Timer das Beenden
    // der App. Ein Wächter ist Beiwerk, kein Grund weiterzulaufen.
    this.wachTicker.unref?.();
  }

  /** Ein Ereignis ist angekommen — die Leitung lebt. */
  private leitungLebt(): void {
    this.letztesEreignisAt = this.now();
    this.stilleGemeldet = false;
  }

  private stilleWacheAbblasen(): void {
    if (this.wachTicker) { clearInterval(this.wachTicker); this.wachTicker = null; }
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
      // disconnect() darf laut Interface ein Promise liefern (der Direkt-Weg tut
      // das auch) — ein `void` davor verwirft zwar den Wert, fängt aber KEIN
      // Reject: das try/catch drumherum greift nur bei synchronen Würfen. Sonst
      // landet der Fehler als nacktes „unhandledRejection" im Log statt mit
      // dieser Erklärung. NICHT auf await umbauen: cleanupConnection läuft im
      // synchronen Teil von doConnect, ein await würde genau das Zeitfenster
      // aufreißen, gegen das die Epoch-Prüfung gebaut wurde.
      void Promise.resolve(old.disconnect()).catch((err: unknown) => {
        log.warn('TikTok', 'Fehler beim Trennen der alten Connection', (err as Error)?.message ?? String(err));
      });
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
