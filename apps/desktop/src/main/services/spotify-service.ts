// spotify-service.ts — Spotify-Anbindung über die Web-API (OAuth Authorization
// Code + PKCE, KEIN Client-Secret → passt für eine verteilte Desktop-App).
// Liefert „was läuft gerade" fürs Overlay-Widget und steuert die Wiedergabe
// (Play/Pause/Skip/Queue). Tokens bleiben im Main-Prozess (Secret).
//
// Voraussetzung: Spotify Premium (für Steuerung) + eine vom Nutzer registrierte
// Spotify-App (Client-ID). Redirect-URI: http://127.0.0.1:<port>/spotify/callback
// (Loopback-IP ist nach Spotifys Nov-2025-Umstellung weiter erlaubt).
import crypto from 'node:crypto';
import { log } from '../core/logger';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
export const SPOTIFY_SCOPES = ['user-read-currently-playing', 'user-read-playback-state', 'user-modify-playback-state'];

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  /** Ablaufzeitpunkt (ms-Epoch) des Access-Tokens. */
  expiresAt: number;
}

export interface NowPlaying {
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  durationMs: number;
  progressMs: number;
  trackId: string;
}

// ── Pure Helfer (testbar) ───────────────────────────────────────────────────

/** Zufälliger PKCE code_verifier (43–128 Zeichen, URL-safe). */
export function randomVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/** PKCE code_challenge = base64url(SHA256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthUrl(clientId: string, redirectUri: string, challenge: string, state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES.join(' '),
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

/** Spotifys /me/player(-Currently-Playing)-Antwort → schlankes Now-Playing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseNowPlaying(d: any): NowPlaying | null {
  const it = d?.item;
  if (!it || !it.name) return null;
  return {
    isPlaying: !!d.is_playing,
    title: String(it.name),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    artist: (Array.isArray(it.artists) ? it.artists : []).map((a: any) => a?.name).filter(Boolean).join(', '),
    album: it.album?.name ?? '',
    albumArt: it.album?.images?.[0]?.url ?? '',
    durationMs: Number(it.duration_ms ?? 0),
    progressMs: Number(d.progress_ms ?? 0),
    trackId: String(it.id ?? ''),
  };
}

// ── Service ─────────────────────────────────────────────────────────────────

export interface SpotifyDeps {
  getClientId: () => string;
  getTokens: () => SpotifyTokens | null;
  saveTokens: (t: SpotifyTokens | null) => void;
  /** http://127.0.0.1:<port>/spotify/callback */
  redirectUri: () => string;
  onState?: (np: NowPlaying | null) => void;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export class SpotifyService {
  private readonly deps: SpotifyDeps;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private pendingVerifier: string | null = null;
  private pendingState: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: SpotifyDeps) {
    this.deps = deps;
    this.fetchFn = deps.fetchFn ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  isConnected(): boolean {
    return !!this.deps.getTokens()?.refreshToken;
  }

  /** Startet den Login: liefert die Authorize-URL (im Browser öffnen). Merkt sich
   *  verifier+state für den Callback. */
  beginAuth(): { url: string; ok: boolean; error?: string } {
    const clientId = this.deps.getClientId().trim();
    if (!clientId) return { url: '', ok: false, error: 'Keine Spotify-Client-ID gesetzt (Einstellungen → Spotify).' };
    this.pendingVerifier = randomVerifier();
    this.pendingState = crypto.randomBytes(8).toString('hex');
    const url = buildAuthUrl(clientId, this.deps.redirectUri(), pkceChallenge(this.pendingVerifier), this.pendingState);
    return { url, ok: true };
  }

  /** Callback vom Redirect: Code gegen Tokens tauschen (PKCE). */
  async completeAuth(code: string, state: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.pendingVerifier || state !== this.pendingState) return { ok: false, error: 'Ungültiger Auth-State' };
    const verifier = this.pendingVerifier;
    this.pendingVerifier = null;
    this.pendingState = null;
    try {
      const res = await this.fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.deps.redirectUri(),
          client_id: this.deps.getClientId().trim(),
          code_verifier: verifier,
        }).toString(),
      });
      if (!res.ok) return { ok: false, error: `Token-Tausch fehlgeschlagen (HTTP ${res.status})` };
      const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
      this.deps.saveTokens({
        accessToken: j.access_token,
        refreshToken: j.refresh_token,
        expiresAt: this.now() + (j.expires_in - 60) * 1000,
      });
      log.info('Spotify', 'Verbunden (OAuth abgeschlossen).');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  logout(): void {
    this.deps.saveTokens(null);
    this.stopPolling();
    this.deps.onState?.(null);
  }

  /** Gültiges Access-Token holen — bei Bedarf per Refresh erneuern. */
  private async accessToken(): Promise<string | null> {
    const t = this.deps.getTokens();
    if (!t?.refreshToken) return null;
    if (t.accessToken && this.now() < t.expiresAt) return t.accessToken;
    try {
      const res = await this.fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: t.refreshToken,
          client_id: this.deps.getClientId().trim(),
        }).toString(),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
      const next: SpotifyTokens = {
        accessToken: j.access_token,
        refreshToken: j.refresh_token || t.refreshToken, // Spotify rotiert manchmal
        expiresAt: this.now() + (j.expires_in - 60) * 1000,
      };
      this.deps.saveTokens(next);
      return next.accessToken;
    } catch {
      return null;
    }
  }

  private async api(path: string, method = 'GET', body?: unknown): Promise<Response | null> {
    const token = await this.accessToken();
    if (!token) return null;
    try {
      return await this.fetchFn(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      log.warn('Spotify', `API ${method} ${path} fehlgeschlagen`, (err as Error).message);
      return null;
    }
  }

  async getNowPlaying(): Promise<NowPlaying | null> {
    const res = await this.api('/me/player/currently-playing');
    if (!res || res.status === 204 || !res.ok) return null;
    try { return parseNowPlaying(await res.json()); } catch { return null; }
  }

  async play(): Promise<boolean> { return (await this.api('/me/player/play', 'PUT'))?.ok ?? false; }
  async pause(): Promise<boolean> { return (await this.api('/me/player/pause', 'PUT'))?.ok ?? false; }
  async next(): Promise<boolean> { return (await this.api('/me/player/next', 'POST'))?.ok ?? false; }
  async previous(): Promise<boolean> { return (await this.api('/me/player/previous', 'POST'))?.ok ?? false; }

  /** Track suchen → erste Treffer (für Song-Requests). */
  async search(query: string): Promise<Array<{ uri: string; title: string; artist: string }>> {
    const res = await this.api(`/search?type=track&limit=5&q=${encodeURIComponent(query)}`);
    if (!res?.ok) return [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = (await res.json())?.tracks?.items ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return items.map((t: any) => ({ uri: t.uri, title: t.name, artist: (t.artists ?? []).map((a: any) => a.name).join(', ') }));
    } catch { return []; }
  }

  /** Track in die Wiedergabe-Queue hängen (Song-Request). */
  async addToQueue(uri: string): Promise<boolean> {
    return (await this.api(`/me/player/queue?uri=${encodeURIComponent(uri)}`, 'POST'))?.ok ?? false;
  }

  /** Now-Playing periodisch pollen und per onState melden (fürs Overlay). */
  startPolling(intervalMs = 4000): void {
    this.stopPolling();
    const tick = async (): Promise<void> => {
      if (!this.isConnected()) return;
      this.deps.onState?.(await this.getNowPlaying());
    };
    void tick();
    this.pollTimer = setInterval(() => void tick(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  dispose(): void { this.stopPolling(); }
}
