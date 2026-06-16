// sport-service.ts — holt Fußball-Spiele von football-data.org (BYOK, deckt WM
// + große Ligen) oder OpenLigaDB (keyless, deutsche Ligen). Cacht pro
// (Provider+Wettbewerb), damit das Overlay-Polling die API nicht überrennt
// (football-data Free: 10 Anfragen/min). Der API-Key bleibt im Main-Prozess.
//
// Selbst-Drosselung (vom football-data-Team empfohlen): wir lesen die Rate-
// Limit-Header aus und legen eine Pause ein, wenn das Minuten-Kontingent leer
// ist (oder bei HTTP 429) — so reißt der Ticker das Limit nicht.
import { log } from '../core/logger';
import { normalizeMatches, normalizeStandings, type SportMatch, type SportStandingRow, type SportProvider } from './sport-normalize';

const CACHE_TTL_MS = 20_000;
const STANDINGS_TTL_MS = 120_000; // Tabellen ändern sich selten → länger cachen

export class SportService {
  private cache = new Map<string, { at: number; matches: SportMatch[] }>();
  private standingsCache = new Map<string, { at: number; rows: SportStandingRow[] }>();
  private readonly getApiKey: () => string;
  private readonly now: () => number;
  private readonly fetchFn: typeof fetch;
  private readonly logWarn: (scope: string, msg: string, detail?: string) => void;
  /** Bis zu diesem Zeitpunkt KEINE football-data-Anfragen (Rate-Limit-Pause). */
  private fdBackoffUntil = 0;
  /** Wann zuletzt vor fehlendem Key gewarnt wurde — drosselt den Hinweis auf 1/60s. */
  private noKeyNotifiedAt = Number.NEGATIVE_INFINITY;

  constructor(
    getApiKey: () => string,
    now: () => number = Date.now,
    fetchFn: typeof fetch = fetch,
    logWarn: (scope: string, msg: string, detail?: string) => void = (s, m, d) => log.warn(s, m, d),
  ) {
    this.getApiKey = getApiKey;
    this.now = now;
    this.fetchFn = fetchFn;
    this.logWarn = logWarn;
  }

  /** Spiele eines Wettbewerbs — gecacht. Bei Fehler/Drosselung bleibt der letzte Stand. */
  async getMatches(provider: SportProvider, competition: string): Promise<SportMatch[]> {
    const key = `${provider}:${competition}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < CACHE_TTL_MS) return cached.matches;
    // Kein football-data-Key → nicht bei jedem Poll spammen: höchstens 1 Hinweis/60s,
    // und gar keine Anfrage (separat von der Rate-Limit-Pause, damit ein später
    // eingetragener Key sofort greift).
    if (provider === 'football-data' && !this.getApiKey()) {
      if (this.now() - this.noKeyNotifiedAt >= 60_000) {
        this.noKeyNotifiedAt = this.now();
        this.logWarn('Sport', `Übersprungen (${key}) — Kein football-data.org API-Key (Einstellungen → Sport)`);
      }
      return cached?.matches ?? [];
    }
    // Während der Rate-Limit-Pause gar nicht erst anfragen.
    if (provider === 'football-data' && this.now() < this.fdBackoffUntil) {
      return cached?.matches ?? [];
    }
    try {
      const matches = await this.fetchMatches(provider, competition);
      this.cache.set(key, { at: this.now(), matches });
      return matches;
    } catch (err) {
      this.logWarn('Sport', `Abruf fehlgeschlagen (${key})`, (err as Error).message);
      return cached?.matches ?? [];
    }
  }

  private async fetchMatches(provider: SportProvider, competition: string): Promise<SportMatch[]> {
    if (provider === 'football-data') {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('Kein football-data.org API-Key (Einstellungen → Sport)');
      // Datum-Fenster: nur die relevanten Spiele (heute + nächste Tage) holen —
      // sonst lädt z.B. die WM ALLE 104 Spiele auf einmal → Timeout auf langsamer
      // Leitung („fetch failed") + langsamer Ticker.
      const { from, to } = this.dateRange();
      const url = `https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/matches?dateFrom=${from}&dateTo=${to}`;
      const res = await this.fetchFn(url, { headers: { 'X-Auth-Token': apiKey } });
      this.applyRateLimit(res);
      if (res.status === 429) throw new Error('Rate-Limit erreicht — Pause');
      if (!res.ok) throw new Error(`football-data HTTP ${res.status}`);
      return normalizeMatches('football-data', await res.json());
    }
    // OpenLigaDB: competition = Liga-Kürzel (z.B. 'bl1') → aktueller Spieltag.
    const url = `https://api.openligadb.de/getmatchdata/${encodeURIComponent(competition)}`;
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`openligadb HTTP ${res.status}`);
    return normalizeMatches('openligadb', await res.json());
  }

  /** Aktuelle Tabelle eines Wettbewerbs — gecacht (ändert sich selten). */
  async getStandings(provider: SportProvider, competition: string): Promise<SportStandingRow[]> {
    const key = `${provider}:${competition}`;
    const cached = this.standingsCache.get(key);
    if (cached && this.now() - cached.at < STANDINGS_TTL_MS) return cached.rows;
    if (provider === 'football-data' && !this.getApiKey()) return cached?.rows ?? [];
    if (provider === 'football-data' && this.now() < this.fdBackoffUntil) return cached?.rows ?? [];
    try {
      const rows = await this.fetchStandings(provider, competition);
      this.standingsCache.set(key, { at: this.now(), rows });
      return rows;
    } catch (err) {
      this.logWarn('Sport', `Tabelle fehlgeschlagen (${key})`, (err as Error).message);
      return cached?.rows ?? [];
    }
  }

  private async fetchStandings(provider: SportProvider, competition: string): Promise<SportStandingRow[]> {
    if (provider === 'football-data') {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('Kein football-data.org API-Key (Einstellungen → Sport)');
      const url = `https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/standings`;
      const res = await this.fetchFn(url, { headers: { 'X-Auth-Token': apiKey } });
      this.applyRateLimit(res);
      if (res.status === 429) throw new Error('Rate-Limit erreicht — Pause');
      if (!res.ok) throw new Error(`football-data HTTP ${res.status}`);
      return normalizeStandings('football-data', await res.json());
    }
    // OpenLigaDB: getbltable braucht Liga + Saison (Aug–Jun → Startjahr).
    const url = `https://api.openligadb.de/getbltable/${encodeURIComponent(competition)}/${this.season()}`;
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`openligadb HTTP ${res.status}`);
    return normalizeStandings('openligadb', await res.json());
  }

  /** Datum-Fenster (YYYY-MM-DD) für die Spiele-Abfrage: heute … +8 Tage. */
  private dateRange(): { from: string; to: string } {
    const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    return { from: ymd(this.now()), to: ymd(this.now() + 8 * 86_400_000) };
  }

  /** Aktuelle Saison als Startjahr (z.B. 2025 für 2025/26), für OpenLigaDB-Tabelle. */
  private season(): number {
    const d = new Date(this.now());
    return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  }

  /** Rate-Limit-Header von football-data auswerten und ggf. eine Pause setzen. */
  private applyRateLimit(res: Response): void {
    const reset = Number(res.headers.get('X-RequestCounter-Reset')) || 0; // Sek. bis Zähler-Reset
    if (res.status === 429) {
      this.fdBackoffUntil = this.now() + (reset > 0 ? reset : 60) * 1000;
      this.logWarn('Sport', `football-data Rate-Limit — Pause ${reset || 60}s`);
      return;
    }
    const available = res.headers.get('X-Requests-Available-Minute');
    if (available !== null && Number(available) <= 0) {
      // Kontingent leer → bis zum Reset (oder 60s) keine weiteren Anfragen.
      this.fdBackoffUntil = this.now() + (reset > 0 ? reset : 60) * 1000;
    }
  }
}
