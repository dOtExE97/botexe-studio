// twitch-adapter.ts — verbindet sich per EventSub-WebSocket mit Twitch, legt
// die Abos an und publiziert normalisierte Ereignisse auf den EventBus.
//
// Ablauf (alle Regeln aus docs/twitch-api-belege.md, Abschnitte 3, 4, 7, 9):
// • Verbinden → `session_welcome` → innerhalb von 10 s die Abos per Helix
//   anlegen (parallel). Ein abgelehntes Abo (403, z. B. fehlendes Recht)
//   reißt die anderen nicht mit.
// • Keepalive-Wächter: Kommt länger als `keepalive_timeout_seconds` (+ Puffer)
//   weder Notification noch Keepalive, ist die Leitung tot → frisch verbinden
//   und neu abonnieren (Belege 3.4, 3.1: Abos sterben mit der Verbindung).
// • `session_reconnect` → die mitgeschickte URL unverändert öffnen, die alte
//   Leitung erst nach dem Welcome der neuen schließen, Abos NICHT neu anlegen
//   (Belege 3.7: die neue Verbindung hat dieselben Abos).
// • Doppelte `message_id` werden verworfen — beim Leitungswechsel können
//   beide Leitungen dasselbe liefern (Belege, Offene Punkte 12).
// • 401 beim Anlegen → einmal Token erneuern; geht das nicht → „neu anmelden",
//   KEINE Wiederhol-Schleife.
// • Profilbilder: Twitch-Ereignisse tragen keine. Unbekannte Nutzer-IDs werden
//   gesammelt und gebündelt (≤100 je Anfrage, Belege 7) nachgeladen — das
//   Ereignis selbst wartet nie darauf.
//
// Tokens landen nie im Log.
import type { StudioEvent } from '@botexe/trigger-engine';
import type { log as appLog } from '../core/logger';
import type { TwitchAuth, TwitchTokens } from '../services/twitch-auth';
import { TwitchReloginNoetig, TWITCH_ANFRAGE_TIMEOUT_MS } from '../services/twitch-auth';
import { normalizeTwitch, istGeschenkAbo, TWITCH_ID_PRAEFIX } from './twitch-normalize';

/** Belege 3.1. 30 s statt der Vorgabe 10 s: weniger Fehlalarme bei kurzem
 *  Netz-Schluckauf, der Wächter erkennt eine tote Leitung trotzdem zügig. */
export const TWITCH_EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';
export const TWITCH_SUBSCRIPTIONS_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';
export const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users';
/** Belege 11.1: Get Channel Followers — die App liest nur `total`. */
export const TWITCH_FOLLOWERS_URL = 'https://api.twitch.tv/helix/channels/followers';
/** So oft wird die Follower-Zahl bei Twitch abgeglichen (dazwischen +1 je Follow). */
export const FOLLOWER_TAKT_MS = 10 * 60_000;

/** Puffer auf die Keepalive-Frist, bevor die Leitung als tot gilt. */
const KEEPALIVE_PUFFER_MS = 5_000;
/** Belege 3.3: ohne Angabe 10 s. */
const KEEPALIVE_STANDARD_S = 10;
/** Belege 3.7: die alte Leitung schließt 30 s nach `session_reconnect`. Kommt
 *  bis dahin kein Welcome auf der neuen, wird frisch verbunden. */
const UEBERNAHME_FRIST_MS = 30_000;
/** Wiederverbinden mit wachsender Pause: 1, 2, 4 … höchstens 60 s. */
const PAUSE_START_MS = 1_000;
const PAUSE_MAX_MS = 60_000;
/** Belege 1.8: validieren beim Start und danach stündlich. */
const VALIDATE_TAKT_MS = 60 * 60_000;
/** So viele `message_id` werden gegen Doppelte gemerkt. */
const DUPLIKAT_PUFFER = 500;
/** Belege 7: höchstens 100 IDs je Get-Users-Anfrage. */
const BILD_BUENDEL = 100;
/** Kurz sammeln, damit ein voller Chat EINE Anfrage auslöst statt zwanzig. */
const BILD_SAMMEL_MS = 250;
/** Nach einem Fehlschlag so lange keine Profilbilder anfragen (Rate-Limit,
 *  Netz) — sonst würde jede Chat-Zeile erneut anklopfen. */
const BILD_PAUSE_MS = 60_000;
const BILD_CACHE_MAX = 5_000;

/** Die Abos für den eigenen Kanal — Typ, Version und Condition exakt nach
 *  Belege 5.1–5.8. `id` ist die Twitch-Nutzer-ID des angemeldeten Kanals. */
export function twitchAbos(id: string): Array<{ type: string; version: string; condition: Record<string, string> }> {
  return [
    { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: id, moderator_user_id: id } },
    { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: id, user_id: id } },
    { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: id } },
    { type: 'channel.subscription.message', version: '1', condition: { broadcaster_user_id: id } },
    { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: id } },
    { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: id } },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: id } },
    { type: 'stream.online', version: '1', condition: { broadcaster_user_id: id } },
    { type: 'stream.offline', version: '1', condition: { broadcaster_user_id: id } },
  ];
}

/** Belege 3.9 — für eine verständliche Log-Zeile. */
const CLOSE_GRUENDE: Record<number, string> = {
  4000: 'Serverproblem bei Twitch',
  4001: 'die App hat etwas gesendet, was Twitch nicht erlaubt',
  4002: 'Ping nicht beantwortet',
  4003: 'kein Abo rechtzeitig angelegt',
  4004: 'Leitungswechsel nicht rechtzeitig abgeschlossen',
  4005: 'Netz-Zeitüberschreitung',
  4006: 'Netzwerkfehler',
  4007: 'ungültige Wechsel-Adresse',
};

export type TwitchStatus = 'aus' | 'verbinde' | 'verbunden' | 'getrennt' | 'neu-anmelden' | 'fehler';

export interface TwitchStatusInfo {
  status: TwitchStatus;
  login?: string;
  live?: boolean;
  detail?: string;
}

/** Minimal-Ausschnitt eines WebSockets (Paket `ws`) — in Tests gefälscht. */
export interface WebSocketLike {
  on(event: 'open', cb: () => void): unknown;
  on(event: 'message', cb: (data: unknown) => void): unknown;
  on(event: 'close', cb: (code: number, reason?: unknown) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  close(code?: number, reason?: string): void;
}

type TimerHandle = unknown;

export type TwitchLog = Pick<typeof appLog, 'debug' | 'info' | 'warn' | 'error' | 'einmal' | 'merkerZuruecksetzen'>;

export interface TwitchAdapterDeps {
  auth: Pick<TwitchAuth, 'getValidToken' | 'validate'>;
  bus: { publish(e: StudioEvent): void };
  fetch: typeof fetch;
  openSocket: (url: string) => WebSocketLike;
  /** Eingetragene Client-ID — Helix verlangt sie im Header `Client-Id`
   *  (Belege 4/7). Dieselbe Quelle wie bei TwitchAuth (Einstellungen). */
  getClientId: () => string;
  now: () => number;
  log: TwitchLog;
  onStatus(info: TwitchStatusInfo): void;
  setTimeout?: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout?: (h: TimerHandle) => void;
}

interface Leitung {
  ws: WebSocketLike;
  /** Über `reconnect_url` geöffnet → Abos bestehen schon. */
  uebernahme: boolean;
  sessionId?: string;
  wache?: TimerHandle;
  uebernahmeFrist?: TimerHandle;
}

type AboErgebnis = 'ok' | 'abgelehnt-401' | 'aus';

function obj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Rohdaten einer `ws`-Nachricht (Buffer, Buffer[], ArrayBuffer oder String) als Text. */
function alsText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data.filter((d): d is Buffer => Buffer.isBuffer(d))).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return '';
}

/** Belege 9: bei 429 bis `Ratelimit-Reset` (Unix-Sekunden) warten. Fehlt der
 *  Kopf oder ist er unplausibel (Vergangenheit, > 10 min), `undefined` → die
 *  pauschale Pause greift. */
export function rateLimitEnde(kopf: string | null, jetzt: number): number | undefined {
  const s = kopf !== null && /^\d+$/.test(kopf.trim()) ? Number(kopf.trim()) : NaN;
  if (!Number.isFinite(s)) return undefined;
  const ms = s * 1000;
  return ms > jetzt && ms - jetzt <= 10 * 60_000 ? ms : undefined;
}

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 160) : 'unbekannter Fehler';
}

export class TwitchAdapter {
  private readonly deps: TwitchAdapterDeps;
  private readonly setT: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearT: (h: TimerHandle) => void;

  private status: TwitchStatusInfo = { status: 'aus' };
  private laeuft = false;
  /** Jede start/stop-Entscheidung erhöht die Generation — Handler, Timer und
   *  laufende Anfragen älterer Generationen erkennen sich als veraltet. */
  private epoch = 0;
  private aktiv: Leitung | null = null;
  /** Neue Leitung während eines `session_reconnect`, bis ihr Welcome kommt. */
  private neu: Leitung | null = null;
  /** Alte Leitungen nach dem Wechsel: von uns geschlossen, aber bis zu ihrem
   *  Close können noch Benachrichtigungen ankommen, die Twitch kurz vor dem
   *  Umschalten abschickte. Die werden angenommen — die message_id-Prüfung
   *  verwirft, was über beide Leitungen kam. */
  private readonly auslaufend = new Set<Leitung>();
  private versuche = 0;
  private wiederTimer: TimerHandle | null = null;
  private validateTimer: TimerHandle | null = null;
  private userId = '';

  private readonly gesehen = new Set<string>();
  private readonly gesehenReihe: string[] = [];

  private readonly bilder = new Map<string, string | null>();
  private readonly bildWartend = new Set<string>();
  private bildTimer: TimerHandle | null = null;
  private bildLaeuft = false;
  private bildPauseBis = 0;

  /** Letzte bekannte Follower-Zahl (null = noch nie erfolgreich abgefragt —
   *  dann wird bei einem Follow auch nicht hochgezählt). */
  private followerStand: number | null = null;
  private followerTimer: TimerHandle | null = null;
  private followerLaeuft = false;

  constructor(deps: TwitchAdapterDeps) {
    this.deps = deps;
    this.setT = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearT = deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  getStatus(): TwitchStatusInfo {
    return { ...this.status };
  }

  private setStatus(info: TwitchStatusInfo): void {
    this.status = info;
    try { this.deps.onStatus({ ...info }); } catch { /* Empfängerfehler dürfen die Leitung nicht stören */ }
  }

  private statusMit(status: TwitchStatus, detail?: string): void {
    this.setStatus({
      status,
      ...(this.status.login ? { login: this.status.login } : {}),
      ...(this.status.live !== undefined ? { live: this.status.live } : {}),
      ...(detail ? { detail } : {}),
    });
  }

  // ── Start / Stopp ─────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.laeuft) return;
    this.laeuft = true;
    const epoch = ++this.epoch;
    this.versuche = 0;
    this.followerStand = null; // evtl. anderer Kanal — frisch abfragen
    this.setStatus({ status: 'verbinde' });
    // Den Stunden-Takt UNABHÄNGIG vom ersten Verbindungsversuch starten:
    // Scheitert der erste Token-Abruf vorübergehend, liefen alle weiteren
    // Versuche sonst ohne stündliche Prüfung (Twitch-Pflicht, Belege 1.8).
    this.starteValidateTakt(epoch);
    await this.verbinde(epoch, true);
  }

  stop(): void {
    const warAn = this.laeuft;
    this.laeuft = false;
    this.epoch++;
    this.aufraeumen();
    this.setStatus({ status: 'aus' });
    if (warAn) this.deps.log.info('Twitch', 'Twitch-Verbindung getrennt (von Hand).');
  }

  private aufraeumen(): void {
    if (this.wiederTimer !== null) { this.clearT(this.wiederTimer); this.wiederTimer = null; }
    if (this.validateTimer !== null) { this.clearT(this.validateTimer); this.validateTimer = null; }
    if (this.bildTimer !== null) { this.clearT(this.bildTimer); this.bildTimer = null; }
    if (this.followerTimer !== null) { this.clearT(this.followerTimer); this.followerTimer = null; }
    this.bildWartend.clear();
    for (const l of this.auslaufend) this.schliesse(l);
    this.auslaufend.clear();
    this.schliesse(this.aktiv);
    this.schliesse(this.neu);
    this.aktiv = null;
    this.neu = null;
  }

  private schliesse(l: Leitung | null): void {
    if (!l) return;
    if (l.wache !== undefined) this.clearT(l.wache);
    if (l.uebernahmeFrist !== undefined) this.clearT(l.uebernahmeFrist);
    l.wache = undefined;
    l.uebernahmeFrist = undefined;
    try { l.ws.close(1000); } catch { /* schon zu */ }
  }

  /** Die Anmeldung ist tot — alles anhalten, KEIN Wiederverbinden. Der
   *  Streamer muss sich in den Einstellungen neu verbinden. */
  private neuAnmelden(detail?: string): void {
    this.laeuft = false;
    this.epoch++;
    this.aufraeumen();
    const text = detail ?? 'Die Twitch-Anmeldung ist nicht mehr gültig — bitte in den Einstellungen neu mit Twitch verbinden.';
    this.deps.log.warn('Twitch', text);
    this.statusMit('neu-anmelden', text);
  }

  // ── Verbinden ─────────────────────────────────────────────────────────────

  private async verbinde(epoch: number, mitPruefung: boolean): Promise<void> {
    let tokens: TwitchTokens;
    try {
      // Belege 1.8: beim Start validieren. `true` = gültig ODER Twitch gerade
      // nicht erreichbar (dann trotzdem versuchen); `false` = gar nicht
      // angemeldet; wirft TwitchReloginNoetig, wenn die Anmeldung tot ist.
      if (mitPruefung && !(await this.deps.auth.validate())) {
        if (epoch !== this.epoch) return;
        this.neuAnmelden('Nicht mit Twitch verbunden — bitte in den Einstellungen „Mit Twitch verbinden".');
        return;
      }
      if (epoch !== this.epoch) return;
      tokens = await this.deps.auth.getValidToken();
    } catch (err) {
      if (epoch !== this.epoch) return;
      if (err instanceof TwitchReloginNoetig) { this.neuAnmelden(err.message); return; }
      this.deps.log.warn('Twitch', `Twitch-Anmeldung gerade nicht prüfbar (${fehlerText(err)}) — neuer Versuch gleich.`);
      this.planeNeuverbindung(epoch, 'Anmeldung nicht prüfbar');
      return;
    }
    if (epoch !== this.epoch) return;
    this.userId = tokens.userId;
    this.status = { ...this.status, login: tokens.login };
    this.oeffne(epoch, TWITCH_EVENTSUB_URL, false);
  }

  private oeffne(epoch: number, url: string, uebernahme: boolean): void {
    let ws: WebSocketLike;
    try {
      ws = this.deps.openSocket(url);
    } catch (err) {
      this.deps.log.warn('Twitch', `Twitch-Leitung ließ sich nicht öffnen (${fehlerText(err)}).`);
      this.planeNeuverbindung(epoch, 'Leitung nicht zu öffnen');
      return;
    }
    const l: Leitung = { ws, uebernahme };
    if (uebernahme) {
      this.neu = l;
      l.uebernahmeFrist = this.setT(() => {
        if (epoch !== this.epoch || this.neu !== l) return;
        this.deps.log.warn('Twitch', 'Twitch wollte die Leitung wechseln, aber die neue meldete sich nicht rechtzeitig — verbinde frisch.');
        this.verloren(epoch, 'Leitungswechsel gescheitert');
      }, UEBERNAHME_FRIST_MS);
    } else {
      this.aktiv = l;
    }
    const meins = () => epoch === this.epoch && (this.aktiv === l || this.neu === l || this.auslaufend.has(l));
    ws.on('open', () => { if (meins()) this.deps.log.debug('Twitch', 'EventSub-Leitung offen, warte auf Begrüßung.'); });
    ws.on('message', (data) => {
      if (!meins()) return;
      try {
        this.nachricht(epoch, l, alsText(data));
      } catch (err) {
        this.deps.log.einmal('twitch:nachricht-fehler', 'warn', 'Twitch',
          `Eine Twitch-Nachricht ließ sich nicht verarbeiten (${fehlerText(err)}) — sie wird übersprungen.`);
      }
    });
    ws.on('error', (err) => {
      if (!meins()) return;
      this.deps.log.einmal('twitch:leitung-fehler', 'warn', 'Twitch', `Twitch-Leitung meldet einen Fehler: ${fehlerText(err)}`);
    });
    ws.on('close', (code) => {
      if (!meins()) return;
      if (this.auslaufend.delete(l)) return; // alte Leitung nach dem Wechsel — erwartet
      const grund = CLOSE_GRUENDE[code] ?? `Code ${code}`;
      if (this.neu === l) {
        this.neu = null;
        this.schliesse(l);
        this.deps.log.warn('Twitch', `Die neue Twitch-Leitung ist vor der Übernahme abgerissen (${grund}) — verbinde frisch.`);
      } else if (this.neu) {
        // Die alte Leitung geht während des Wechsels zu — auf die neue warten
        // (die Übernahme-Frist bewacht das), nicht alles frisch verbinden.
        this.aktiv = null;
        this.schliesse(l);
        this.deps.log.info('Twitch', `Alte Twitch-Leitung geschlossen (${grund}) — die neue übernimmt.`);
        return;
      } else {
        this.deps.log.warn('Twitch', `Twitch-Leitung getrennt (${grund}) — verbinde neu und lege die Abos neu an.`);
      }
      this.verloren(epoch, grund);
    });
  }

  /** Leitung verloren: alles schließen, mit Pause frisch verbinden. */
  private verloren(epoch: number, grund: string): void {
    if (epoch !== this.epoch) return;
    this.schliesse(this.aktiv);
    this.schliesse(this.neu);
    this.aktiv = null;
    this.neu = null;
    this.planeNeuverbindung(epoch, grund);
  }

  private planeNeuverbindung(epoch: number, grund: string): void {
    if (epoch !== this.epoch || !this.laeuft) return;
    if (this.wiederTimer !== null) this.clearT(this.wiederTimer);
    const pause = Math.min(PAUSE_MAX_MS, PAUSE_START_MS * 2 ** Math.min(this.versuche, 16));
    this.versuche++;
    this.statusMit('getrennt', `${grund} — neuer Versuch in ${Math.round(pause / 1000)} s`);
    this.wiederTimer = this.setT(() => {
      this.wiederTimer = null;
      if (epoch !== this.epoch || !this.laeuft) return;
      this.statusMit('verbinde');
      void this.verbinde(epoch, false);
    }, pause);
  }

  private starteValidateTakt(epoch: number): void {
    if (this.validateTimer !== null) this.clearT(this.validateTimer);
    this.validateTimer = this.setT(() => {
      this.validateTimer = null;
      if (epoch !== this.epoch) return;
      void this.deps.auth.validate()
        .then((angemeldet) => {
          if (epoch !== this.epoch) return;
          // false = keine Tokens mehr (z. B. abgemeldet) — nicht weiterlaufen.
          if (!angemeldet) { this.neuAnmelden('Die Twitch-Anmeldung ist weg — bitte in den Einstellungen neu mit Twitch verbinden.'); return; }
          this.starteValidateTakt(epoch);
        })
        .catch((err: unknown) => {
          if (epoch !== this.epoch) return;
          if (err instanceof TwitchReloginNoetig) { this.neuAnmelden(err.message); return; }
          this.deps.log.warn('Twitch', `Stündliche Prüfung der Twitch-Anmeldung fehlgeschlagen (${fehlerText(err)}) — nächster Versuch in einer Stunde.`);
          this.starteValidateTakt(epoch);
        });
    }, VALIDATE_TAKT_MS);
  }

  private bewache(epoch: number, l: Leitung, ms: number): void {
    if (l.wache !== undefined) this.clearT(l.wache);
    l.wache = this.setT(() => {
      l.wache = undefined;
      if (epoch !== this.epoch || this.aktiv !== l) return;
      this.deps.log.warn('Twitch', `Twitch schweigt seit ${Math.round(ms / 1000)} s (kein Keepalive) — die Leitung gilt als tot, verbinde neu.`);
      this.verloren(epoch, 'kein Lebenszeichen von Twitch');
    }, ms);
  }

  private keepaliveMs = (KEEPALIVE_STANDARD_S * 1000) + KEEPALIVE_PUFFER_MS;

  // ── Nachrichten ───────────────────────────────────────────────────────────

  private nachricht(epoch: number, l: Leitung, text: string): void {
    let roh: unknown;
    try { roh = JSON.parse(text); } catch {
      this.deps.log.einmal('twitch:unlesbar', 'warn', 'Twitch', 'Twitch hat eine unlesbare Nachricht geschickt — sie wird übersprungen.');
      return;
    }
    const m = obj(roh);
    const meta = obj(m?.metadata);
    const payload = obj(m?.payload);
    const art = meta?.message_type;
    // Eine auslaufende Leitung liefert nur noch Nachzügler-Ereignisse.
    if (this.auslaufend.has(l) && art !== 'notification') return;
    switch (art) {
      case 'session_welcome': this.begruessung(epoch, l, obj(payload?.session)); return;
      case 'session_keepalive': if (this.aktiv === l && !this.neu) this.bewache(epoch, l, this.keepaliveMs); return;
      case 'notification': this.benachrichtigung(epoch, l, meta, payload); return;
      case 'session_reconnect': this.wechsel(epoch, l, obj(payload?.session)); return;
      case 'revocation': this.widerruf(meta, payload); return;
      default:
        this.deps.log.einmal(`twitch:art:${String(art)}`, 'info', 'Twitch',
          `Unbekannte Twitch-Nachrichtenart „${String(art).slice(0, 40)}" — wird ignoriert.`);
    }
  }

  private begruessung(epoch: number, l: Leitung, session: Record<string, unknown> | undefined): void {
    const id = session?.id;
    if (typeof id !== 'string' || !id) {
      this.deps.log.warn('Twitch', 'Twitch hat bei der Begrüßung keine Sitzungs-ID geschickt — verbinde neu.');
      this.verloren(epoch, 'Begrüßung ohne Sitzung');
      return;
    }
    l.sessionId = id;
    const s = session?.keepalive_timeout_seconds;
    this.keepaliveMs = (typeof s === 'number' && s > 0 ? s : KEEPALIVE_STANDARD_S) * 1000 + KEEPALIVE_PUFFER_MS;
    if (l.uebernahme) {
      if (this.neu !== l) return;
      // Erst JETZT die alte Leitung schließen (Belege 3.7).
      if (l.uebernahmeFrist !== undefined) { this.clearT(l.uebernahmeFrist); l.uebernahmeFrist = undefined; }
      const alt = this.aktiv;
      this.aktiv = l;
      this.neu = null;
      if (alt) { this.auslaufend.add(alt); this.schliesse(alt); }
      this.bewache(epoch, l, this.keepaliveMs);
      this.deps.log.info('Twitch', 'Twitch hat die Leitung gewechselt — die Abos laufen weiter.');
      return;
    }
    if (this.aktiv !== l) return;
    // Neuer Abschnitt: einmal-Meldungen dürfen wieder erscheinen.
    this.deps.log.merkerZuruecksetzen('twitch:');
    this.bewache(epoch, l, this.keepaliveMs);
    void this.abonniere(epoch, l, id).catch((err: unknown) => {
      if (epoch !== this.epoch) return;
      this.deps.log.warn('Twitch', `Twitch-Abos ließen sich nicht anlegen (${fehlerText(err)}).`);
      this.verloren(epoch, 'Abos nicht angelegt');
    });
  }

  /** Belege 4: alle Abos parallel anlegen. Ein Fehlschlag bei einem Typ lässt
   *  die anderen unberührt. */
  private async abonniere(epoch: number, l: Leitung, sessionId: string): Promise<void> {
    const gueltig = () => epoch === this.epoch && this.aktiv === l;
    let tokens: TwitchTokens;
    try {
      tokens = await this.deps.auth.getValidToken();
    } catch (err) {
      if (!gueltig()) return;
      if (err instanceof TwitchReloginNoetig) { this.neuAnmelden(err.message); return; }
      throw err;
    }
    if (!gueltig()) return;
    let clientId: string;
    try { clientId = this.deps.getClientId().trim(); } catch (err) { this.neuAnmelden(fehlerText(err)); return; }
    const abos = twitchAbos(tokens.userId || this.userId);
    const ergebnisse = await Promise.all(abos.map((a) => this.legeAboAn(a, tokens.accessToken, clientId, sessionId)));
    if (!gueltig()) return;

    let ok = ergebnisse.filter((e) => e === 'ok').length;
    const abgelehnt = abos.filter((_, i) => ergebnisse[i] === 'abgelehnt-401');
    if (abgelehnt.length > 0) {
      // Belege 4: 401 = Token ungültig. Genau EINMAL erneuern.
      let frisch: TwitchTokens;
      try {
        frisch = await this.deps.auth.getValidToken({ abgelehntesToken: tokens.accessToken });
      } catch (err) {
        if (!gueltig()) return;
        if (err instanceof TwitchReloginNoetig) { this.neuAnmelden(err.message); return; }
        throw err;
      }
      if (!gueltig()) return;
      const zweite = await Promise.all(abgelehnt.map((a) => this.legeAboAn(a, frisch.accessToken, clientId, sessionId)));
      if (!gueltig()) return;
      if (zweite.some((e) => e === 'abgelehnt-401')) {
        this.neuAnmelden('Twitch lehnt die Anmeldung auch nach dem Erneuern ab (stimmt die Client-ID?) — bitte in den Einstellungen neu mit Twitch verbinden.');
        return;
      }
      ok += zweite.filter((e) => e === 'ok').length;
    }
    if (ok === 0) {
      // Twitch schließt die Leitung gleich mit 4003 — dann greift das
      // Wiederverbinden mit wachsender Pause.
      this.statusMit('fehler', 'Twitch hat kein einziges Abo angenommen — Details im Log.');
      return;
    }
    this.versuche = 0;
    this.deps.log.info('Twitch', `Mit Twitch verbunden${this.status.login ? ` als „${this.status.login}"` : ''} — ${ok} von ${abos.length} Ereignisarten aktiv.`);
    this.statusMit('verbunden');
    // Follower-Zahl gleich holen und danach alle 10 Minuten abgleichen.
    void this.ladeFollowerStand(epoch);
  }

  private async legeAboAn(
    abo: { type: string; version: string; condition: Record<string, string> },
    accessToken: string, clientId: string, sessionId: string,
  ): Promise<AboErgebnis> {
    let res: Response;
    try {
      res = await this.deps.fetch(TWITCH_SUBSCRIPTIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': clientId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...abo, transport: { method: 'websocket', session_id: sessionId } }),
        signal: AbortSignal.timeout(TWITCH_ANFRAGE_TIMEOUT_MS),
      });
    } catch (err) {
      this.deps.log.einmal(`twitch:abo-netz:${abo.type}`, 'warn', 'Twitch',
        `Twitch-Abo „${abo.type}" nicht angelegt — keine Verbindung zu Twitch (${fehlerText(err)}).`);
      return 'aus';
    }
    if (res.status === 202 || res.ok) return 'ok';
    // 409: gibt es auf dieser Sitzung schon — zählt als angelegt.
    if (res.status === 409) return 'ok';
    if (res.status === 401) return 'abgelehnt-401';
    if (res.status === 403) {
      this.deps.log.einmal(`twitch:abo-403:${abo.type}`, 'warn', 'Twitch',
        `Twitch erlaubt das Abo „${abo.type}" für diesen Kanal nicht (fehlendes Recht) — diese Ereignisart kommt nicht an, alle anderen laufen weiter.`);
      return 'aus';
    }
    this.deps.log.einmal(`twitch:abo-${res.status}:${abo.type}`, 'warn', 'Twitch',
      `Twitch hat das Abo „${abo.type}" abgelehnt (HTTP ${res.status}) — diese Ereignisart kommt nicht an, alle anderen laufen weiter.`);
    return 'aus';
  }

  private istDoppelt(id: unknown): boolean {
    if (typeof id !== 'string' || !id) return false;
    if (this.gesehen.has(id)) return true;
    this.gesehen.add(id);
    this.gesehenReihe.push(id);
    if (this.gesehenReihe.length > DUPLIKAT_PUFFER) {
      const alt = this.gesehenReihe.shift();
      if (alt !== undefined) this.gesehen.delete(alt);
    }
    return false;
  }

  private benachrichtigung(
    epoch: number, l: Leitung,
    meta: Record<string, unknown> | undefined, payload: Record<string, unknown> | undefined,
  ): void {
    if (this.aktiv === l && !this.neu) this.bewache(epoch, l, this.keepaliveMs);
    if (this.istDoppelt(meta?.message_id)) {
      this.deps.log.debug('Twitch', 'Doppelte Twitch-Nachricht verworfen (kam über beide Leitungen).');
      return;
    }
    const typRoh = meta?.subscription_type ?? obj(payload?.subscription)?.type;
    const typ = typeof typRoh === 'string' ? typRoh : '';
    const event = payload?.event;
    if (typ === 'stream.online' || typ === 'stream.offline') {
      const live = typ === 'stream.online';
      this.deps.log.info('Twitch', live ? 'Twitch meldet: Du bist live.' : 'Twitch meldet: Stream beendet.');
      this.status = { ...this.status, live };
      this.statusMit(this.status.status);
      return;
    }
    if (istGeschenkAbo(typ, event)) {
      this.deps.log.einmal('twitch:geschenk-abo-einzeln', 'info', 'Twitch',
        'Einzelne verschenkte Abos werden nicht extra gemeldet — das Geschenk zählt einmal als Ganzes (mit Anzahl).');
      return;
    }
    const ereignisse = normalizeTwitch(typ, event, this.deps.now(), (id) => this.bilder.get(id) ?? undefined);
    if (ereignisse.length === 0) {
      this.deps.log.einmal(`twitch:leer:${typ}`, 'info', 'Twitch', `Twitch-Ereignis „${typ.slice(0, 60)}" wird (noch) nicht ausgewertet.`);
      return;
    }
    for (const e of ereignisse) {
      this.deps.bus.publish(e);
      this.merkeFuerBild(epoch, e);
    }
    // Ein echter Follow zählt sofort +1 — bis zum nächsten Abgleich.
    if (typ === 'channel.follow' && this.followerStand !== null) {
      this.followerStand++;
      this.meldeFollowerStand();
    }
  }

  private wechsel(epoch: number, l: Leitung, session: Record<string, unknown> | undefined): void {
    if (this.aktiv !== l) return;
    const url = session?.reconnect_url;
    if (typeof url !== 'string' || !/^wss:\/\//i.test(url)) {
      this.deps.log.warn('Twitch', 'Twitch will die Leitung wechseln, schickt aber keine brauchbare Adresse — verbinde frisch, sobald die alte schließt.');
      return;
    }
    if (this.neu) { const vorher = this.neu; this.neu = null; this.schliesse(vorher); }
    // Die alte Leitung schließt in 30 s ohnehin — ihr Wächter würde sonst
    // mitten im Wechsel „tot" rufen und alles frisch verbinden.
    if (l.wache !== undefined) { this.clearT(l.wache); l.wache = undefined; }
    this.deps.log.info('Twitch', 'Twitch wechselt die Leitung (Wartung) — baue die neue auf, die alte bleibt bis dahin offen.');
    // „as is; do not modify it" (Belege 3.7).
    this.oeffne(epoch, url, true);
  }

  private widerruf(meta: Record<string, unknown> | undefined, payload: Record<string, unknown> | undefined): void {
    const sub = obj(payload?.subscription);
    const typ = String(meta?.subscription_type ?? sub?.type ?? '?').slice(0, 60);
    const grund = String(sub?.status ?? 'ohne Angabe').slice(0, 60);
    if (grund === 'authorization_revoked') {
      this.neuAnmelden(`Twitch hat der App die Rechte entzogen (Abo „${typ}" widerrufen) — bitte in den Einstellungen neu mit Twitch verbinden.`);
      return;
    }
    this.deps.log.warn('Twitch', `Twitch hat das Abo „${typ}" beendet (Grund: ${grund}) — diese Ereignisart kommt nicht mehr an.`);
    this.statusMit(this.status.status, `Abo „${typ}" von Twitch beendet (${grund})`);
  }

  // ── Follower-Zahl ─────────────────────────────────────────────────────────

  /** Nach „Session zurücksetzen" sind die Sticky-Werte weg — den bekannten
   *  Stand erneut melden, damit ein Ziel-Balken nach dem Neuladen nicht leer
   *  bleibt. Ohne bekannten Stand: nichts. */
  followerStandErneutMelden(): void {
    if (this.laeuft && this.followerStand !== null) this.meldeFollowerStand();
  }

  private meldeFollowerStand(): void {
    if (this.followerStand === null) return;
    this.deps.bus.publish({
      type: 'follower_stand', ts: this.deps.now(), plattform: 'twitch',
      followerStand: { anzahl: this.followerStand },
    });
  }

  private planeFollowerStand(epoch: number): void {
    if (this.followerTimer !== null) this.clearT(this.followerTimer);
    this.followerTimer = this.setT(() => {
      this.followerTimer = null;
      if (epoch !== this.epoch || !this.laeuft) return;
      void this.ladeFollowerStand(epoch);
    }, FOLLOWER_TAKT_MS);
  }

  /** Belege 11.1: GET /helix/channels/followers?broadcaster_id=…&first=1 →
   *  `total`. Ein Fehlschlag kostet nichts außer einer Log-Zeile; der nächste
   *  Versuch kommt mit dem Takt. */
  private async ladeFollowerStand(epoch: number): Promise<void> {
    if (this.followerLaeuft) return;
    this.followerLaeuft = true;
    try {
      const tokens = await this.deps.auth.getValidToken();
      if (epoch !== this.epoch) return;
      const clientId = this.deps.getClientId().trim();
      const id = tokens.userId || this.userId;
      const res = await this.deps.fetch(`${TWITCH_FOLLOWERS_URL}?broadcaster_id=${encodeURIComponent(id)}&first=1`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Client-Id': clientId },
        signal: AbortSignal.timeout(TWITCH_ANFRAGE_TIMEOUT_MS),
      });
      if (epoch !== this.epoch) return;
      if (!res.ok) {
        if (res.status === 401) void this.deps.auth.getValidToken({ abgelehntesToken: tokens.accessToken }).catch(() => undefined);
        throw new Error(`HTTP ${res.status}`);
      }
      const j = obj(await res.json().catch(() => undefined));
      const total = j?.total;
      if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) throw new Error('Antwort ohne Follower-Zahl');
      const neu = Math.floor(total);
      if (this.followerStand === null) this.deps.log.info('Twitch', `Twitch-Follower: ${neu} — wird alle 10 Minuten abgeglichen.`);
      this.followerStand = neu;
      this.meldeFollowerStand();
    } catch (err) {
      if (epoch !== this.epoch) return;
      if (err instanceof TwitchReloginNoetig) { this.followerLaeuft = false; this.neuAnmelden(err.message); return; }
      this.deps.log.einmal('twitch:follower-stand', 'info', 'Twitch',
        `Twitch-Follower-Zahl gerade nicht abrufbar (${fehlerText(err)}) — nächster Versuch in 10 Minuten.`);
    } finally {
      this.followerLaeuft = false;
      if (epoch === this.epoch && this.laeuft) this.planeFollowerStand(epoch);
    }
  }

  // ── Profilbilder ──────────────────────────────────────────────────────────

  private merkeFuerBild(epoch: number, e: StudioEvent): void {
    const uid = e.user?.id;
    if (!uid?.startsWith(TWITCH_ID_PRAEFIX)) return;
    const roh = uid.slice(TWITCH_ID_PRAEFIX.length);
    if (!roh || roh === 'anonym' || this.bilder.has(roh) || this.bildWartend.has(roh)) return;
    if (this.deps.now() < this.bildPauseBis) return;
    this.bildWartend.add(roh);
    this.planeBilder(epoch);
  }

  private planeBilder(epoch: number): void {
    if (this.bildTimer !== null || this.bildLaeuft) return;
    this.bildTimer = this.setT(() => {
      this.bildTimer = null;
      if (epoch !== this.epoch) return;
      void this.ladeBilder(epoch);
    }, BILD_SAMMEL_MS);
  }

  /** Belege 7: GET /helix/users?id=…&id=… (≤100). Fehlende Konten (gesperrt,
   *  gelöscht) kommen nicht zurück — die merken wir als „kein Bild". */
  private async ladeBilder(epoch: number): Promise<void> {
    const ids = [...this.bildWartend].slice(0, BILD_BUENDEL);
    for (const id of ids) this.bildWartend.delete(id);
    if (ids.length === 0) return;
    this.bildLaeuft = true;
    let pauseBis: number | undefined;
    try {
      const tokens = await this.deps.auth.getValidToken();
      const clientId = this.deps.getClientId().trim();
      const query = ids.map((id) => `id=${encodeURIComponent(id)}`).join('&');
      const res = await this.deps.fetch(`${TWITCH_USERS_URL}?${query}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Client-Id': clientId },
        signal: AbortSignal.timeout(TWITCH_ANFRAGE_TIMEOUT_MS),
      });
      if (!res.ok) {
        // 401: beim nächsten Mal mit erneuertem Token (einmal anstoßen).
        if (res.status === 401) void this.deps.auth.getValidToken({ abgelehntesToken: tokens.accessToken }).catch(() => undefined);
        if (res.status === 429) pauseBis = rateLimitEnde(res.headers.get('Ratelimit-Reset'), this.deps.now());
        throw new Error(`HTTP ${res.status}`);
      }
      const j = obj(await res.json().catch(() => undefined));
      const daten = Array.isArray(j?.data) ? j.data : [];
      const gefunden = new Set<string>();
      for (const roh of daten) {
        const u = obj(roh);
        const id = u?.id;
        const bild = u?.profile_image_url;
        if (typeof id !== 'string') continue;
        gefunden.add(id);
        this.merkeBild(id, typeof bild === 'string' && /^https:\/\//i.test(bild) ? bild : null);
      }
      for (const id of ids) if (!gefunden.has(id)) this.merkeBild(id, null);
    } catch (err) {
      if (err instanceof TwitchReloginNoetig) {
        this.bildLaeuft = false;
        if (epoch === this.epoch) this.neuAnmelden(err.message);
        return;
      }
      this.bildPauseBis = pauseBis ?? this.deps.now() + BILD_PAUSE_MS;
      this.bildWartend.clear();
      this.deps.log.einmal('twitch:profilbild', 'info', 'Twitch',
        `Twitch-Profilbilder gerade nicht abrufbar (${fehlerText(err)}) — der Chat läuft ohne Bilder weiter.`);
    } finally {
      this.bildLaeuft = false;
    }
    if (epoch === this.epoch && this.bildWartend.size > 0) this.planeBilder(epoch);
  }

  private merkeBild(id: string, bild: string | null): void {
    if (this.bilder.size >= BILD_CACHE_MAX) {
      const aeltester = this.bilder.keys().next().value;
      if (aeltester !== undefined) this.bilder.delete(aeltester);
    }
    this.bilder.set(id, bild);
  }
}
