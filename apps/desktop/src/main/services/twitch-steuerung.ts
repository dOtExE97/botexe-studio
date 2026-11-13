// twitch-steuerung.ts — hält Twitch-Login (TwitchAuth) und Twitch-Leitung
// (TwitchAdapter) zusammen: wann verbunden wird, was beim Anmelden passiert,
// was der Renderer als Status sieht.
//
// Bewusst ohne `electron`-Import (wie secret-box.ts) — nur so ist es unter
// `node:test` prüfbar. Den Browser öffnet ein hereingereichtes `openExternal`.
//
// Was hier entschieden wird:
// • Auto-Start nur mit Tokens UND Schalter „automatisch verbinden" UND
//   gültiger Client-ID.
// • Anmelden: Gerätecode holen → die Bestätigungs-Adresse NUR öffnen, wenn sie
//   wirklich zu Twitch gehört (https, twitch.tv) → im Hintergrund auf die
//   Bestätigung warten → danach die Leitung (neu) starten. Ein zweiter Versuch
//   bricht den ersten ab; das ist kein Fehler und wird auch nicht so gemeldet.
// • Der Code, den der Streamer im Browser eintippt, steht im Rückgabewert für
//   die Oberfläche — aber NIE im Log.
import type { TwitchAuth } from './twitch-auth';
import type { TwitchAdapter, TwitchStatusInfo } from '../adapters/twitch-adapter';
import { istGueltigeTwitchClientId, sindTwitchTokens } from './twitch-auth';

/** Der Ausschnitt der Einstellungen, den Twitch braucht. */
export interface TwitchEinstellungen {
  twitchClientId: string;
  twitchTokens?: unknown;
  twitchAutoConnect: boolean;
}

/** Was der Renderer sieht (Push TWITCH_STATUS und Pull TWITCH_GET_STATUS).
 *  Enthält nie Tokens — nur, OB angemeldet ist, und den Kanalnamen. */
export interface TwitchUiStatus extends TwitchStatusInfo {
  /** Gültige Client-ID eingetragen? (Ampel zeigt Twitch nur dann.) */
  clientIdGesetzt: boolean;
  /** Tokens vorhanden — „Trennen" ergibt Sinn. */
  angemeldet: boolean;
  /** Wartet gerade auf die Bestätigung im Browser. */
  anmeldungLaeuft: boolean;
  /** Warum die letzte Anmeldung scheiterte (deutsch, für die Oberfläche). */
  loginFehler?: string;
}

export interface TwitchSteuerungDeps {
  auth: Pick<TwitchAuth, 'beginDeviceLogin' | 'waitForLogin' | 'logout'>;
  adapter: Pick<TwitchAdapter, 'start' | 'stop' | 'getStatus'>;
  getEinstellungen(): TwitchEinstellungen;
  openExternal(url: string): void;
  onStatus(info: TwitchUiStatus): void;
  log: { info(scope: string, text: string): void; warn(scope: string, text: string): void };
}

/** Darf diese Adresse im Browser geöffnet werden? Nur https auf twitch.tv
 *  oder einer Unteradresse davon (www.twitch.tv/activate laut Belege 1.2) —
 *  ohne Zugangsdaten oder Sonder-Port in der Adresse. Schützt davor, dass eine
 *  manipulierte Antwort den Browser irgendwohin schickt. */
export function istTwitchBestaetigungsUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return host === 'twitch.tv' || host.endsWith('.twitch.tv');
}

/** Beim App-Start automatisch verbinden? */
export function sollTwitchAutoStarten(s: TwitchEinstellungen): boolean {
  return sindTwitchTokens(s.twitchTokens)
    && s.twitchAutoConnect !== false
    && istGueltigeTwitchClientId((s.twitchClientId ?? '').trim());
}

function istAbbruch(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export class TwitchSteuerung {
  private readonly deps: TwitchSteuerungDeps;
  /** Abbruch für die laufende Anmeldung; null = keine läuft. */
  private loginAbbruch: AbortController | null = null;
  /** Gerätecode-Anfragen laufen nacheinander: Sonst könnte eine langsame
   *  ältere Antwort den Code der neueren in TwitchAuth überschreiben. */
  private beginKette: Promise<void> = Promise.resolve();
  private loginFehler: string | undefined;

  constructor(deps: TwitchSteuerungDeps) {
    this.deps = deps;
  }

  /** Aktueller Stand für den Renderer. */
  status(): TwitchUiStatus {
    return this.anreichern(this.deps.adapter.getStatus());
  }

  /** Vom Adapter (onStatus): Stand weiterreichen. Ein neuer Leitungsstand
   *  ersetzt eine alte Login-Fehlermeldung. */
  adapterStatus(info: TwitchStatusInfo): void {
    this.loginFehler = undefined;
    this.melde(info);
  }

  private anreichern(info: TwitchStatusInfo): TwitchUiStatus {
    const s = this.deps.getEinstellungen();
    const tokens = sindTwitchTokens(s.twitchTokens) ? s.twitchTokens : undefined;
    const login = info.login ?? tokens?.login;
    return {
      status: info.status,
      ...(login ? { login } : {}),
      ...(info.live !== undefined ? { live: info.live } : {}),
      ...(info.detail ? { detail: info.detail } : {}),
      clientIdGesetzt: istGueltigeTwitchClientId((s.twitchClientId ?? '').trim()),
      angemeldet: !!tokens,
      anmeldungLaeuft: this.loginAbbruch !== null,
      ...(this.loginFehler ? { loginFehler: this.loginFehler } : {}),
    };
  }

  private melde(info: TwitchStatusInfo = this.deps.adapter.getStatus()): void {
    try { this.deps.onStatus(this.anreichern(info)); } catch { /* Empfängerfehler stören Twitch nicht */ }
  }

  /** Beim App-Start: verbinden, wenn angemeldet und gewünscht. */
  async autoStart(): Promise<boolean> {
    const s = this.deps.getEinstellungen();
    if (!sollTwitchAutoStarten(s)) {
      if (sindTwitchTokens(s.twitchTokens) && s.twitchAutoConnect === false) {
        this.deps.log.info('Twitch', 'Twitch ist angemeldet, verbindet beim Start aber nicht von selbst '
          + '(Einstellungen → Twitch → „Beim Start automatisch verbinden").');
      }
      return false;
    }
    this.deps.log.info('Twitch', 'Verbinde beim Start automatisch mit Twitch.');
    try {
      await this.deps.adapter.start();
    } catch (err) {
      this.deps.log.warn('Twitch', `Twitch-Verbindung beim Start fehlgeschlagen: ${(err as Error).message}`);
    }
    return true;
  }

  /** „Mit Twitch verbinden": Code holen, Browser öffnen, im Hintergrund warten. */
  async beginLogin(): Promise<{ userCode: string; verificationUri: string; expiresIn: number }> {
    if (!istGueltigeTwitchClientId((this.deps.getEinstellungen().twitchClientId ?? '').trim())) {
      throw new Error('Bitte zuerst eine gültige Twitch-Client-ID eintragen (nur Buchstaben und Ziffern).');
    }
    // Ein laufender Versuch gilt ab jetzt nicht mehr.
    this.loginAbbruch?.abort();
    const ac = new AbortController();
    this.loginAbbruch = ac;
    this.loginFehler = undefined;

    const vorher = this.beginKette;
    let fertig!: () => void;
    this.beginKette = new Promise<void>((r) => { fertig = r; });
    let start: { userCode: string; verificationUri: string; expiresIn: number };
    try {
      await vorher;
      if (ac.signal.aborted) throw new Error('Diese Twitch-Anmeldung wurde durch eine neue ersetzt.');
      start = await this.deps.auth.beginDeviceLogin();
    } catch (err) {
      if (this.loginAbbruch === ac) this.loginAbbruch = null;
      this.melde();
      throw err;
    } finally {
      fertig();
    }
    if (ac.signal.aborted) throw new Error('Diese Twitch-Anmeldung wurde durch eine neue ersetzt.');

    if (!istTwitchBestaetigungsUrl(start.verificationUri)) {
      ac.abort();
      if (this.loginAbbruch === ac) this.loginAbbruch = null;
      this.deps.log.warn('Twitch', 'Twitch hat eine Bestätigungs-Adresse geschickt, die nicht zu twitch.tv gehört — '
        + 'aus Sicherheitsgründen nicht geöffnet, Anmeldung abgebrochen.');
      this.melde();
      throw new Error('Twitch hat eine unerwartete Bestätigungs-Adresse geschickt — sie wurde aus Sicherheitsgründen nicht geöffnet.');
    }
    try {
      this.deps.openExternal(start.verificationUri);
    } catch (err) {
      this.deps.log.warn('Twitch', `Browser ließ sich nicht öffnen (${(err as Error).message}) — `
        + 'bitte die Adresse aus den Einstellungen von Hand öffnen.');
    }
    this.melde();
    void this.warteAufLogin(ac);
    return { userCode: start.userCode, verificationUri: start.verificationUri, expiresIn: start.expiresIn };
  }

  private async warteAufLogin(ac: AbortController): Promise<void> {
    try {
      const t = await this.deps.auth.waitForLogin(ac.signal);
      if (this.loginAbbruch !== ac || ac.signal.aborted) return;
      this.loginAbbruch = null;
      this.deps.log.info('Twitch', `Mit Twitch angemeldet als ${t.login} — verbinde.`);
      // Neue Anmeldung = evtl. anderer Kanal → Leitung frisch aufbauen.
      if (this.deps.adapter.getStatus().status !== 'aus') this.deps.adapter.stop();
      await this.deps.adapter.start();
    } catch (err) {
      // Bewusst abgebrochen (neuer Versuch, Trennen, Beenden) — kein Fehler.
      if (ac.signal.aborted || this.loginAbbruch !== ac || istAbbruch(err)) return;
      this.loginAbbruch = null;
      const grund = (err as Error)?.message?.slice(0, 200) || 'unbekannter Grund';
      this.loginFehler = `Twitch-Anmeldung hat nicht geklappt: ${grund}`;
      this.deps.log.warn('Twitch', this.loginFehler);
      this.melde();
    }
  }

  private brichLoginAb(): void {
    this.loginAbbruch?.abort();
    this.loginAbbruch = null;
  }

  /** „Trennen" in den Einstellungen: abmelden (Token widerrufen) und Leitung zu. */
  async logout(): Promise<void> {
    this.brichLoginAb();
    this.loginFehler = undefined;
    this.deps.adapter.stop();
    await this.deps.auth.logout();
    this.melde();
  }

  /** Von Hand verbinden (angemeldet vorausgesetzt). */
  async connect(): Promise<void> {
    const s = this.deps.getEinstellungen();
    if (!istGueltigeTwitchClientId((s.twitchClientId ?? '').trim())) {
      throw new Error('Bitte zuerst eine gültige Twitch-Client-ID eintragen.');
    }
    if (!sindTwitchTokens(s.twitchTokens)) {
      throw new Error('Noch nicht angemeldet — bitte zuerst „Mit Twitch verbinden".');
    }
    await this.deps.adapter.start();
  }

  /** Leitung zu, Anmeldung bleibt. */
  disconnect(): void {
    this.deps.adapter.stop();
  }

  /** Die Client-ID wurde geändert (die alten Tokens hat der SettingsStore
   *  schon verworfen): Leitung und laufende Anmeldung gehören zur alten ID. */
  clientIdGeaendert(): void {
    this.brichLoginAb();
    this.loginFehler = undefined;
    this.deps.adapter.stop();
    this.melde();
  }

  /** App wird beendet. */
  beenden(): void {
    this.brichLoginAb();
    this.deps.adapter.stop();
  }
}
