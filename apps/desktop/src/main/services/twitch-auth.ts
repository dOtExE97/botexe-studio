// twitch-auth.ts — Twitch-Login per Gerätecode (Device Code Grant Flow,
// öffentlicher Client, KEIN Client-Secret) und die Token-Verwaltung.
//
// Ablauf: beginDeviceLogin() holt einen kurzen Code + Adresse. Der Streamer
// öffnet die Adresse, bestätigt im Browser — währenddessen fragt
// waitForLogin() im vorgegebenen Takt nach, bis Twitch die Tokens herausgibt.
// Danach liefert getValidToken() immer ein gültiges Access-Token und erneuert
// es bei Bedarf.
//
// Alle Endpunkte, Parameter und Fehlertexte stammen aus
// docs/twitch-api-belege.md (Abschnitte 1.2–1.9). Was dort „unbelegt" ist,
// steht hier ausdrücklich dabei.
//
// Tokens, device_code und der Nutzer-Code landen NIE im Log. (Der Nutzer-Code
// darf in der Oberfläche stehen — dafür ist er da —, aber nicht in Logdateien,
// die Leute in Foren posten.)

export const TWITCH_DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
export const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
export const TWITCH_VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
export const TWITCH_REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';

/** Belegt (1.4): grant_type beim Abholen der Tokens per Gerätecode. */
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

/** Lese-Rechte für die Ereignisse (Belege 5.10, 11.6): Chat lesen, Follows,
 *  Subs/Resubs/Geschenke, Cheers, Kanalpunkte-Einlösungen. Raid und
 *  stream.online/offline brauchen keinen Scope. */
export const TWITCH_LESE_SCOPES: readonly string[] = Object.freeze([
  'user:read:chat',
  'moderator:read:followers',
  'channel:read:subscriptions',
  'bits:read',
  'channel:read:redemptions',
]);

/** Schreib-Rechte für die Streamer-Aktionen (Belege 10.7) — je Aktion genau
 *  der eine Scope, den die Docs verlangen. Get Chat Settings und Get Users
 *  brauchen keinen. */
export const TWITCH_AKTIONS_SCOPES = Object.freeze({
  clip: 'clips:edit',
  marker: 'channel:manage:broadcast',
  werbung: 'channel:edit:commercial',
  shoutout: 'moderator:manage:shoutouts',
  chatModus: 'moderator:manage:chat_settings',
  /** Belege 8/11.3: Antworten der App in den Twitch-Chat. */
  chat: 'user:write:chat',
} as const);

/** Alle Rechte, um die die App bittet. Kommt ein Scope dazu, müssen sich alle
 *  Streamer neu anmelden: validate() (beim Start und stündlich) merkt die
 *  fehlenden Rechte und meldet „neu-anmelden". */
export const TWITCH_SCOPES: readonly string[] = Object.freeze([
  ...TWITCH_LESE_SCOPES,
  ...Object.values(TWITCH_AKTIONS_SCOPES),
]);

/** So früh vor Ablauf wird das Access-Token erneuert. */
const ERNEUERN_VOR_MS = 60_000;
/** Belegt (1.2) ist nur das Beispiel „interval": 5 — falls das Feld fehlt. */
const STANDARD_INTERVALL_S = 5;
/** Unbelegt: Twitch dokumentiert kein `slow_down`. Kommt es doch, wird nach
 *  RFC 8628 die Pause um 5 Sekunden verlängert. */
const SLOW_DOWN_PLUS_MS = 5_000;
/** Fehlt `expires_in` in der Token-Antwort (sollte laut Belege 1.4/1.7 nie
 *  passieren): Access-Tokens leben laut Belege 1.6 4 Stunden. Wir nehmen
 *  vorsichtig 1 Stunde an — zu früh erneuern schadet nicht, „jeder Aufruf
 *  erneuert" (expiresAt = jetzt) wäre ein Refresh-Sturm. */
const ERSATZ_LEBENSDAUER_S = 3600;
/** Zeitlimit je Anfrage an Twitch. Ohne bliebe ein hängender Refresh bis zu
 *  ~5 Minuten offen — und alle getValidToken()-Aufrufer warten daran mit. */
export const TWITCH_ANFRAGE_TIMEOUT_MS = 15_000;
/** Kurze Wiederholungen, wenn /validate direkt nach dem Login nicht erreichbar
 *  ist — der Gerätecode ist dann schon verbraucht, Aufgeben hieße „nochmal". */
const LOGIN_PRUEF_VERSUCHE = 3;
const LOGIN_PRUEF_PAUSE_MS = 2_000;

export interface TwitchTokens {
  accessToken: string;
  refreshToken: string;
  /** Ablaufzeitpunkt (ms-Epoch) des Access-Tokens. */
  expiresAt: number;
  /** Von Twitch tatsächlich gewährte Scopes. */
  scopes: string[];
  /** Twitch-Nutzer-ID des angemeldeten Kanals (aus /oauth2/validate). */
  userId: string;
  /** Kleingeschriebener Login-Name (aus /oauth2/validate). */
  login: string;
}

/** Die Anmeldung ist nicht mehr zu retten (Refresh-Token ungültig, App in
 *  Twitch getrennt, Rechte fehlen) — der Streamer muss sich neu verbinden. */
export class TwitchReloginNoetig extends Error {
  constructor(message = 'Die Twitch-Anmeldung ist nicht mehr gültig — bitte in den Einstellungen neu mit Twitch verbinden.') {
    super(message);
    this.name = 'TwitchReloginNoetig';
  }
}

/** Twitch-Client-IDs bestehen aus Buchstaben und Ziffern. Alles andere wird
 *  abgelehnt, damit über das Feld nichts in die Formular-Bodies rutscht. */
export function istGueltigeTwitchClientId(id: string): boolean {
  return /^[a-z0-9]{1,64}$/i.test(id);
}

export interface TwitchAuthDeps {
  fetch: typeof fetch;
  now: () => number;
  getClientId(): string;
  loadTokens(): TwitchTokens | undefined;
  saveTokens(t: TwitchTokens | undefined): void;
  log?(stufe: 'info' | 'warn', text: string): void;
  /** Nur für Tests: Warten zwischen den Abfragen (Standard: setTimeout). */
  sleep?(ms: number, signal?: AbortSignal): Promise<void>;
}

interface Ausstehend {
  deviceCode: string;
  intervallMs: number;
  /** Bis wann der Code gilt (ms-Epoch, aus expires_in). */
  bis: number;
}

type Pruefung =
  | { ergebnis: 'ok'; userId: string; login: string; scopes: string[]; clientId?: string }
  | { ergebnis: 'ungueltig' }
  | { ergebnis: 'unklar' };

function abbruchFehler(signal?: AbortSignal): Error {
  const grund: unknown = signal?.reason;
  if (grund instanceof Error) return grund;
  const e = new Error('Twitch-Anmeldung abgebrochen.');
  e.name = 'AbortError';
  return e;
}

function standardSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abbruchFehler(signal)); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', weg); resolve(); }, ms);
    const weg = () => { clearTimeout(timer); reject(abbruchFehler(signal)); };
    signal?.addEventListener('abort', weg, { once: true });
  });
}

/** `scope` ist laut Tabelle ein String, im JSON-Beispiel ein Array (Belege
 *  1.4) — beides verstehen. Fehlt es, `undefined`. */
/** Lebensdauer aus der Antwort (Sekunden) — mit Ersatzwert, falls sie fehlt. */
function lebensdauerS(roh: unknown): number {
  return typeof roh === 'number' && Number.isFinite(roh) && roh > 0 ? roh : ERSATZ_LEBENSDAUER_S;
}

/** Gehören die gespeicherten Tokens noch zu demselben Stand wie `t`? */
function gleicheTokens(a: TwitchTokens | undefined, b: TwitchTokens): boolean {
  return !!a && a.accessToken === b.accessToken && a.refreshToken === b.refreshToken;
}

function leseScopes(roh: unknown): string[] | undefined {
  if (Array.isArray(roh)) return roh.filter((s): s is string => typeof s === 'string');
  if (typeof roh === 'string') return roh.split(/\s+/).filter(Boolean);
  return undefined;
}

function fehlendeScopes(gewaehrt: readonly string[]): string[] {
  return TWITCH_SCOPES.filter((s) => !gewaehrt.includes(s));
}

async function leseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const j: unknown = await res.json();
    return typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Vollständige, brauchbare Tokens? (Handbearbeitete settings.json o. Ä.
 *  → nein.) Auch für das `twitchConnected`-Flag im Renderer. */
export function sindTwitchTokens(t: unknown): t is TwitchTokens {
  if (typeof t !== 'object' || t === null) return false;
  const o = t as Record<string, unknown>;
  return typeof o.accessToken === 'string' && o.accessToken.length > 0
    && typeof o.refreshToken === 'string' && o.refreshToken.length > 0
    && typeof o.expiresAt === 'number' && Number.isFinite(o.expiresAt)
    && Array.isArray(o.scopes)
    && typeof o.userId === 'string'
    && typeof o.login === 'string';
}

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

export class TwitchAuth {
  private readonly deps: TwitchAuthDeps;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private ausstehend: Ausstehend | null = null;
  /** Laufender Refresh — weitere Aufrufer warten mit. Pflicht, denn bei
   *  öffentlichen Clients ist jedes Refresh-Token nur EINMAL verwendbar
   *  (Belege 1.6): ein zweiter, paralleler Refresh mit demselben Token würde
   *  scheitern und die frische Anmeldung wegwerfen. */
  private refreshLaeuft: Promise<TwitchTokens> | null = null;

  constructor(deps: TwitchAuthDeps) {
    this.deps = deps;
    this.sleep = deps.sleep ?? standardSleep;
  }

  private log(stufe: 'info' | 'warn', text: string): void {
    this.deps.log?.(stufe, text);
  }

  /** Eingetragene Client-ID. `relogin`: fehlt sie bei bestehender Anmeldung,
   *  ist das kein vorübergehender Fehler, sondern „neu verbinden". */
  private clientId(relogin = false): string {
    const id = this.deps.getClientId().trim();
    if (!istGueltigeTwitchClientId(id)) {
      const text = 'Keine gültige Twitch-Client-ID eingetragen (Einstellungen → Twitch). '
        + 'Sie besteht nur aus Buchstaben und Ziffern.';
      throw relogin ? new TwitchReloginNoetig(text) : new Error(text);
    }
    return id;
  }

  private tokens(): TwitchTokens | undefined {
    const t = this.deps.loadTokens();
    return sindTwitchTokens(t) ? t : undefined;
  }

  /** Tokens löschen — aber NUR, wenn noch genau der Stand gespeichert ist,
   *  mit dem die Prüfung begann. Sonst würde eine langsame alte Antwort einen
   *  frischen Neu-Login wegwerfen. */
  private loescheWennNoch(t: TwitchTokens): void {
    if (gleicheTokens(this.deps.loadTokens(), t)) this.deps.saveTokens(undefined);
  }

  /** fetch mit Zeitlimit (und optionalem Abbruch durch den Aufrufer). */
  private anfrage(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const zeit = AbortSignal.timeout(TWITCH_ANFRAGE_TIMEOUT_MS);
    return this.deps.fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, zeit]) : zeit });
  }

  // ── Login per Gerätecode ──────────────────────────────────────────────────

  /** Schritt 1 (Belege 1.2): Gerätecode anfordern. Liefert den Code, den der
   *  Streamer im Browser bestätigt, und die Adresse dafür. */
  async beginDeviceLogin(): Promise<{ userCode: string; verificationUri: string; expiresIn: number }> {
    const clientId = this.clientId();
    this.ausstehend = null; // ein älterer, noch wartender Login gilt nicht mehr
    // Content-Type x-www-form-urlencoded: Die Docs zeigen hier nur
    // `curl --form`; die Live-Gegenprobe vom 13.11.2026 (Ende von
    // docs/twitch-api-belege.md) hat urlencoded für /device und das Polling
    // bestätigt. Für Refresh und Revoke ist es ohnehin belegt.
    const res = await this.anfrage(TWITCH_DEVICE_URL, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ client_id: clientId, scopes: TWITCH_SCOPES.join(' ') }).toString(),
    });
    const j = await leseJson(res);
    if (!res.ok) {
      const text = typeof j.message === 'string' ? j.message.slice(0, 120) : '';
      this.log('warn', `Twitch hat keinen Anmelde-Code herausgegeben (HTTP ${res.status}${text ? `: ${text}` : ''}) — `
        + 'stimmt die Client-ID, und ist die App in der Twitch-Konsole als „Öffentlich" angelegt?');
      throw new Error(`Twitch-Anmeldung konnte nicht gestartet werden (HTTP ${res.status}).`);
    }
    const deviceCode = j.device_code;
    const userCode = j.user_code;
    const uri = j.verification_uri;
    // Einheit von expires_in/interval nennen die Docs nicht; das Beispiel
    // (1800 / 5) passt zu Sekunden (Offene Punkte 3).
    const expiresIn = typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 0;
    const intervall = typeof j.interval === 'number' && j.interval > 0 ? j.interval : STANDARD_INTERVALL_S;
    if (typeof deviceCode !== 'string' || !deviceCode
      || typeof userCode !== 'string' || !userCode
      || typeof uri !== 'string' || !uri.startsWith('https://')
      || expiresIn <= 0) {
      throw new Error('Twitch hat eine unerwartete Antwort auf die Anmeldung geschickt.');
    }
    this.ausstehend = { deviceCode, intervallMs: intervall * 1000, bis: this.deps.now() + expiresIn * 1000 };
    this.log('info', `Twitch-Anmeldung gestartet — der Code gilt ${Math.round(expiresIn / 60)} Minuten.`);
    return { userCode, verificationUri: uri, expiresIn };
  }

  /** Schritt 3 (Belege 1.4/1.5): im Takt von `interval` nachfragen, bis der
   *  Streamer bestätigt hat. Danach validieren (Nutzer-ID, Login, Scopes) und
   *  speichern. */
  async waitForLogin(signal?: AbortSignal): Promise<TwitchTokens> {
    const a = this.ausstehend;
    if (!a) throw new Error('Es läuft keine Twitch-Anmeldung — zuerst „Mit Twitch verbinden" drücken.');
    const clientId = this.clientId();
    const nochAktuell = () => this.ausstehend === a;
    /** Wirft, wenn abgebrochen oder durch Abmelden/Neustart ersetzt. */
    const pruefeWeiter = () => {
      if (signal?.aborted) throw abbruchFehler(signal);
      if (!nochAktuell()) throw new Error('Diese Twitch-Anmeldung wurde abgebrochen oder durch eine neue ersetzt.');
    };
    try {
      for (;;) {
        pruefeWeiter();
        await this.sleep(a.intervallMs, signal);
        pruefeWeiter();
        if (this.deps.now() >= a.bis) {
          throw new Error('Der Twitch-Code ist abgelaufen, ohne dass er bestätigt wurde — bitte noch einmal verbinden.');
        }
        let res: Response;
        try {
          res = await this.anfrage(TWITCH_TOKEN_URL, {
            method: 'POST',
            headers: FORM,
            body: new URLSearchParams({
              client_id: clientId,
              scopes: TWITCH_SCOPES.join(' '),
              device_code: a.deviceCode,
              grant_type: DEVICE_GRANT_TYPE,
            }).toString(),
          }, signal);
        } catch (err) {
          if (signal?.aborted) throw abbruchFehler(signal);
          // Netzaussetzer/Zeitlimit: weiterfragen — die Frist (expires_in) begrenzt das.
          this.log('warn', `Twitch-Anmeldung: Abfrage fehlgeschlagen (${(err as Error).message}) — versuche es weiter.`);
          continue;
        }
        if (res.ok) {
          return await this.uebernimmLogin(await leseJson(res), pruefeWeiter, signal);
        }
        const j = await leseJson(res);
        const message = typeof j.message === 'string' ? j.message : '';
        if (res.status === 400) {
          // Belegt: „authorization_pending" = noch nicht bestätigt, weiter.
          if (message === 'authorization_pending') continue;
          // Unbelegt (Offene Punkte 1/2): „slow_down" kennt die Twitch-Doku
          // nicht. Sicherheitshalber langsamer werden statt aufzugeben.
          if (message.includes('slow_down')) { a.intervallMs += SLOW_DOWN_PLUS_MS; continue; }
          // Belegt ist nur „invalid device code". Abgelehnt/abgelaufen sind
          // unbelegt — jeder andere 400er beendet den Versuch.
          this.log('warn', `Twitch hat die Anmeldung beendet (${message.slice(0, 120) || 'ohne Begründung'}).`);
          throw new Error(`Twitch hat die Anmeldung nicht bestätigt (${message.slice(0, 120) || `HTTP ${res.status}`}).`);
        }
        if (res.status === 429 || res.status >= 500) {
          // Unbelegt: vorübergehend — weiter im Takt, die Frist begrenzt es.
          this.log('warn', `Twitch-Anmeldung: Twitch antwortet gerade mit HTTP ${res.status} — versuche es weiter.`);
          continue;
        }
        // 401/403/404 & Co. werden nicht von selbst besser (z. B. falsche
        // Client-ID) — 30 Minuten weiterfragen hilft niemandem.
        this.log('warn', `Twitch hat die Anmeldung mit HTTP ${res.status} abgelehnt.`);
        throw new Error(`Twitch hat die Anmeldung abgelehnt (HTTP ${res.status}) — stimmt die Client-ID?`);
      }
    } finally {
      // Der Code ist einmalig verwendbar (Belege 1.6) — ob Erfolg oder Ende,
      // er ist verbraucht. Nur aufräumen, wenn kein neuer Login ihn ersetzt hat.
      if (nochAktuell()) this.ausstehend = null;
    }
  }

  private async uebernimmLogin(
    j: Record<string, unknown>,
    pruefeWeiter: () => void,
    signal?: AbortSignal,
  ): Promise<TwitchTokens> {
    const accessToken = j.access_token;
    const refreshToken = j.refresh_token;
    if (typeof accessToken !== 'string' || !accessToken || typeof refreshToken !== 'string' || !refreshToken) {
      throw new Error('Twitch hat bei der Anmeldung keine vollständigen Tokens geschickt.');
    }
    const expiresAt = this.deps.now() + lebensdauerS(j.expires_in) * 1000;
    let pruefung: Pruefung = { ergebnis: 'unklar' };
    for (let versuch = 1; versuch <= LOGIN_PRUEF_VERSUCHE; versuch++) {
      pruefeWeiter();
      pruefung = await this.pruefe(accessToken, signal);
      if (pruefung.ergebnis !== 'unklar') break;
      if (versuch < LOGIN_PRUEF_VERSUCHE) await this.sleep(LOGIN_PRUEF_PAUSE_MS, signal);
    }
    pruefeWeiter(); // abgebrochen/abgemeldet, während geprüft wurde → nichts speichern
    if (pruefung.ergebnis !== 'ok') {
      throw new Error('Twitch hat das frische Token nicht bestätigt — bitte noch einmal verbinden.');
    }
    const fehlen = fehlendeScopes(pruefung.scopes);
    if (fehlen.length > 0) {
      this.log('warn', `Twitch hat nicht alle nötigen Rechte erteilt (fehlt: ${fehlen.join(', ')}).`);
      throw new TwitchReloginNoetig(`Twitch hat nicht alle nötigen Rechte erteilt (fehlt: ${fehlen.join(', ')}) — bitte neu verbinden.`);
    }
    const tokens: TwitchTokens = {
      accessToken,
      refreshToken,
      expiresAt,
      scopes: pruefung.scopes,
      userId: pruefung.userId,
      login: pruefung.login,
    };
    this.deps.saveTokens(tokens);
    this.log('info', `Mit Twitch verbunden als „${tokens.login}".`);
    return tokens;
  }

  // ── Token-Verwaltung ──────────────────────────────────────────────────────

  /** Ein gültiges Access-Token — erneuert es, wenn es in < 60 s abläuft.
   *
   *  `abgelehntesToken`: Ein API-Aufruf kam mit 401 zurück (die Docs raten,
   *  reaktiv auf 401 zu erneuern, Belege 1.6). Dann wird erneuert, auch wenn
   *  das Ablaufdatum noch in der Zukunft liegt — aber nur, wenn genau dieses
   *  Token noch das aktuelle ist. Sonst hat ein anderer schon erneuert.
   *
   *  Wirft `TwitchReloginNoetig`, wenn nicht (mehr) angemeldet; einen normalen
   *  Error bei vorübergehenden Problemen (Netz, 5xx, Zeitlimit). */
  async getValidToken(opts: { abgelehntesToken?: string } = {}): Promise<TwitchTokens> {
    if (this.refreshLaeuft) return this.refreshLaeuft;
    const t = this.tokens();
    if (!t) throw new TwitchReloginNoetig('Nicht mit Twitch verbunden.');
    const abgelehnt = opts.abgelehntesToken !== undefined && opts.abgelehntesToken === t.accessToken;
    if (!abgelehnt && t.expiresAt > this.deps.now() + ERNEUERN_VOR_MS) return t;
    this.refreshLaeuft = this.erneuere(t).finally(() => { this.refreshLaeuft = null; });
    return this.refreshLaeuft;
  }

  /** Was gilt, wenn während eines Refreshs jemand anderes die Tokens
   *  geändert hat (Abmelden, Neu-Login, Client-ID gewechselt)? Dann zählt der
   *  neue Stand, nicht die alte Antwort. */
  private aktuellerStandStatt(t: TwitchTokens): TwitchTokens | undefined {
    const jetzt = this.tokens();
    if (gleicheTokens(jetzt, t)) return undefined; // nichts geändert
    if (!jetzt) throw new TwitchReloginNoetig('Nicht mit Twitch verbunden.');
    return jetzt;
  }

  /** Belege 1.7: Refresh ohne client_secret (öffentlicher Client). */
  private async erneuere(t: TwitchTokens): Promise<TwitchTokens> {
    const clientId = this.clientId(true);
    // URLSearchParams kodiert das Refresh-Token — die Docs verlangen das
    // ausdrücklich, sonst droht „Invalid refresh token".
    const res = await this.anfrage(TWITCH_TOKEN_URL, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: t.refreshToken,
      }).toString(),
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        // Belegt: 400 „Invalid refresh token" (schon benutzt/abgelaufen) und
        // 401 (nicht mehr gültig) → nur neu anmelden hilft. Tokens wegwerfen,
        // sonst stünde für immer „verbunden" da und jeder Start klopft
        // erfolglos an. Nur wenn das abgelehnte Token noch das aktuelle ist.
        const anders = this.aktuellerStandStatt(t);
        if (anders) return anders;
        this.loescheWennNoch(t);
        this.log('warn', `Twitch hat die gespeicherte Anmeldung abgelehnt (HTTP ${res.status}) — bitte in den Einstellungen neu verbinden.`);
        throw new TwitchReloginNoetig();
      }
      // 429/5xx: vorübergehend. Anmeldung behalten, der nächste Versuch klappt vielleicht.
      throw new Error(`Twitch-Token konnte gerade nicht erneuert werden (HTTP ${res.status}).`);
    }
    const j = await leseJson(res);
    const accessToken = j.access_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('Twitch hat beim Erneuern kein Access-Token geschickt.');
    }
    const neuesRefresh = typeof j.refresh_token === 'string' && j.refresh_token ? j.refresh_token : t.refreshToken;
    const next: TwitchTokens = {
      accessToken,
      refreshToken: neuesRefresh,
      expiresAt: this.deps.now() + lebensdauerS(j.expires_in) * 1000,
      scopes: leseScopes(j.scope) ?? t.scopes,
      userId: t.userId,
      login: t.login,
    };
    // Während der Anfrage abgemeldet oder neu angemeldet? Dann darf die alte
    // Antwort den neuen Stand NICHT überschreiben (sonst lebt eine
    // abgemeldete Verbindung wieder auf).
    const anders = this.aktuellerStandStatt(t);
    if (anders) return anders;
    const fehlen = fehlendeScopes(next.scopes);
    if (fehlen.length > 0) {
      this.loescheWennNoch(t);
      this.log('warn', `Der Twitch-Anmeldung fehlen Rechte (${fehlen.join(', ')}) — bitte neu verbinden.`);
      throw new TwitchReloginNoetig(`Der Twitch-Anmeldung fehlen Rechte (${fehlen.join(', ')}) — bitte neu verbinden.`);
    }
    // ZUERST speichern, dann benutzen: Das alte Refresh-Token ist ab jetzt
    // ungültig (Einmal-Token). Ginge das neue verloren, müsste sich der
    // Streamer neu anmelden.
    this.deps.saveTokens(next);
    return next;
  }

  /** Belege 1.8: Pflicht beim Start und danach stündlich.
   *
   *  `true`  = Anmeldung steht — bestätigt ODER Twitch gerade nicht
   *            erreichbar (Netz, 5xx, Zeitlimit). Ein Schluckauf bei Twitch
   *            soll den Streamer nicht abmelden; die nächste Prüfung holt es nach.
   *  `false` = nicht angemeldet (keine Tokens).
   *  Wirft `TwitchReloginNoetig`, wenn die Anmeldung tot ist (App in Twitch
   *  getrennt, Rechte fehlen, Token gehört zu einer anderen Client-ID) — die
   *  Tokens sind dann gelöscht. */
  async validate(): Promise<boolean> {
    const t = this.tokens();
    if (!t) return false;
    let aktuell = t;
    let p = await this.pruefe(t.accessToken);
    if (p.ergebnis === 'ungueltig') {
      // Access-Token tot — einmal erneuern (wirft TwitchReloginNoetig, wenn
      // auch das Refresh-Token nicht mehr gilt), dann das neue prüfen.
      try {
        aktuell = await this.getValidToken({ abgelehntesToken: t.accessToken });
      } catch (err) {
        if (err instanceof TwitchReloginNoetig) throw err;
        return true; // vorübergehend (Netz/5xx) — Anmeldung bleibt
      }
      p = await this.pruefe(aktuell.accessToken);
      if (p.ergebnis === 'ungueltig') {
        this.loescheWennNoch(aktuell);
        this.log('warn', 'Twitch erkennt die Anmeldung nicht mehr an — bitte in den Einstellungen neu verbinden.');
        throw new TwitchReloginNoetig();
      }
    }
    if (p.ergebnis === 'unklar') return true;
    // Zwischendurch abgemeldet/neu angemeldet? Dann gilt diese Prüfung nicht mehr.
    if (!gleicheTokens(this.deps.loadTokens(), aktuell)) return this.tokens() !== undefined;
    const eingetragen = this.deps.getClientId().trim().toLowerCase();
    if (p.clientId && eingetragen && p.clientId.toLowerCase() !== eingetragen) {
      this.loescheWennNoch(aktuell);
      this.log('warn', 'Die Twitch-Anmeldung gehört zu einer anderen Client-ID — bitte neu verbinden.');
      throw new TwitchReloginNoetig('Die Twitch-Anmeldung gehört zu einer anderen Client-ID — bitte neu verbinden.');
    }
    const fehlen = fehlendeScopes(p.scopes);
    if (fehlen.length > 0) {
      this.loescheWennNoch(aktuell);
      this.log('warn', `Der Twitch-Anmeldung fehlen Rechte (${fehlen.join(', ')}) — bitte neu verbinden.`);
      throw new TwitchReloginNoetig(`Der Twitch-Anmeldung fehlen Rechte (${fehlen.join(', ')}) — bitte neu verbinden.`);
    }
    if (p.userId !== aktuell.userId || p.login !== aktuell.login
      || p.scopes.length !== aktuell.scopes.length || p.scopes.some((s) => !aktuell.scopes.includes(s))) {
      // z. B. Kanal umbenannt.
      this.deps.saveTokens({ ...aktuell, userId: p.userId, login: p.login, scopes: p.scopes });
    }
    return true;
  }

  /** GET /oauth2/validate — 200 = gültig, 401 = ungültig, sonst unklar. */
  private async pruefe(accessToken: string, signal?: AbortSignal): Promise<Pruefung> {
    let res: Response;
    try {
      res = await this.anfrage(TWITCH_VALIDATE_URL, { method: 'GET', headers: { Authorization: `OAuth ${accessToken}` } }, signal);
    } catch (err) {
      if (signal?.aborted) throw abbruchFehler(signal);
      this.log('warn', `Twitch-Anmeldung konnte nicht geprüft werden (${(err as Error).message}).`);
      return { ergebnis: 'unklar' };
    }
    if (res.status === 401) return { ergebnis: 'ungueltig' };
    if (!res.ok) {
      this.log('warn', `Twitch-Anmeldung konnte nicht geprüft werden (HTTP ${res.status}).`);
      return { ergebnis: 'unklar' };
    }
    const j = await leseJson(res);
    const userId = j.user_id;
    const login = j.login;
    if (typeof userId !== 'string' || !userId || typeof login !== 'string') {
      // login/user_id sind bei App-Tokens null (Belege 1.8) — hier unbrauchbar.
      return { ergebnis: 'ungueltig' };
    }
    return {
      ergebnis: 'ok',
      userId,
      login,
      scopes: leseScopes(j.scopes) ?? [],
      ...(typeof j.client_id === 'string' && j.client_id ? { clientId: j.client_id } : {}),
    };
  }

  /** Abmelden: Access-Token bei Twitch widerrufen (Belege 1.9) und lokal
   *  löschen. Das Löschen passiert SOFORT (vor dem Widerruf) und auch, wenn
   *  der Widerruf scheitert. (Refresh-Token-Widerruf ist unbelegt, Offene
   *  Punkte 7.) */
  async logout(): Promise<void> {
    this.ausstehend = null;
    const t = this.tokens();
    this.deps.saveTokens(undefined);
    try {
      if (t) {
        const res = await this.anfrage(TWITCH_REVOKE_URL, {
          method: 'POST',
          headers: FORM,
          body: new URLSearchParams({ client_id: this.clientId(), token: t.accessToken }).toString(),
        });
        if (!res.ok) this.log('warn', `Twitch-Abmeldung: Widerruf mit HTTP ${res.status} abgelehnt — lokal trotzdem abgemeldet.`);
      }
    } catch (err) {
      this.log('warn', `Twitch-Abmeldung: Widerruf nicht möglich (${(err as Error).message}) — lokal trotzdem abgemeldet.`);
    }
    this.log('info', 'Von Twitch abgemeldet.');
  }
}
