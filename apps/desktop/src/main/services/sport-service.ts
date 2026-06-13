// sport-service.ts — holt Fußball-Spiele von football-data.org (BYOK, deckt WM
// + große Ligen) oder OpenLigaDB (keyless, deutsche Ligen). Cacht pro
// (Provider+Wettbewerb), damit das Overlay-Polling die API nicht überrennt
// (football-data Free: 10 Anfragen/min). Der API-Key bleibt im Main-Prozess.
//
// Selbst-Drosselung (vom football-data-Team empfohlen): wir lesen die Rate-
// Limit-Header aus und legen eine Pause ein, wenn das Minuten-Kontingent leer
// ist (oder bei HTTP 429) — so reißt der Ticker das Limit nicht.
import { log } from '../core/logger';
import { normalizeMatches, type SportMatch, type SportProvider } from './sport-normalize';

const CACHE_TTL_MS = 20_000;

export class SportService {
  private cache = new Map<string, { at: number; matches: SportMatch[] }>();
  private readonly getApiKey: () => string;
  private readonly now: () => number;
  private readonly fetchFn: typeof fetch;
  /** Bis zu diesem Zeitpunkt KEINE football-data-Anfragen (Rate-Limit-Pause). */
  private fdBackoffUntil = 0;

  constructor(getApiKey: () => string, now: () => number = Date.now, fetchFn: typeof fetch = fetch) {
    this.getApiKey = getApiKey;
    this.now = now;
    this.fetchFn = fetchFn;
  }

  /** Spiele eines Wettbewerbs — gecacht. Bei Fehler/Drosselung bleibt der letzte Stand. */
  async getMatches(provider: SportProvider, competition: string): Promise<SportMatch[]> {
    const key = `${provider}:${competition}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < CACHE_TTL_MS) return cached.matches;
    // Während der Rate-Limit-Pause gar nicht erst anfragen.
    if (provider === 'football-data' && this.now() < this.fdBackoffUntil) {
      return cached?.matches ?? [];
    }
    try {
      const matches = await this.fetchMatches(provider, competition);
      this.cache.set(key, { at: this.now(), matches });
      return matches;
    } catch (err) {
      log.warn('Sport', `Abruf fehlgeschlagen (${key})`, (err as Error).message);
      return cached?.matches ?? [];
    }
  }

  private async fetchMatches(provider: SportProvider, competition: string): Promise<SportMatch[]> {
    if (provider === 'football-data') {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('Kein football-data.org API-Key (Einstellungen → Sport)');
      const url = `https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/matches`;
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

  /** Rate-Limit-Header von football-data auswerten und ggf. eine Pause setzen. */
  private applyRateLimit(res: Response): void {
    const reset = Number(res.headers.get('X-RequestCounter-Reset')) || 0; // Sek. bis Zähler-Reset
    if (res.status === 429) {
      this.fdBackoffUntil = this.now() + (reset > 0 ? reset : 60) * 1000;
      log.warn('Sport', `football-data Rate-Limit — Pause ${reset || 60}s`);
      return;
    }
    const available = res.headers.get('X-Requests-Available-Minute');
    if (available !== null && Number(available) <= 0) {
      // Kontingent leer → bis zum Reset (oder 60s) keine weiteren Anfragen.
      this.fdBackoffUntil = this.now() + (reset > 0 ? reset : 60) * 1000;
    }
  }
}
