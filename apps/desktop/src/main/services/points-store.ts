// points-store.ts — persistentes Loyalty-/Punkte-System über Streams hinweg.
// Zuschauer sammeln Punkte durch Aktivität (Chat, Follow, Like, Gift-Coins).
// Basis für die Punkte-Bestenliste und das spätere Stream-Kartenspiel.
// JSON-Persistenz mit schemaVersion + atomarem Write (tmp+rename).
import fs from 'node:fs';
import path from 'node:path';
import type { StudioEvent } from '@botexe/trigger-engine';
import { log } from '../core/logger';

export const POINTS_SCHEMA_VERSION = 2;

export interface PointsConfig {
  enabled: boolean;
  perChat: number;
  perFollow: number;
  perLike: number;
  /** Punkte pro Coin eines Gifts. */
  perCoin: number;
  /** Anzeigename der Währung (z.B. „Punkte", „Coins", „XP"). */
  currencyName: string;
}

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  enabled: true,
  perChat: 1,
  perFollow: 50,
  perLike: 0,
  perCoin: 1,
  currencyName: 'Punkte',
};

export interface PointsEntry {
  id: string;
  nickname: string;
  profilePic?: string;
  points: number;
  // Zuschauer-Verwaltung
  vip?: boolean;
  muted?: boolean; // von TTS ausgeschlossen
  gifts?: number;
  coins?: number;
  likes?: number;
  totalChats?: number; // Gesamt-Kommentare dieser Person (für VIP-Karten/Stats)
  firstSeen?: number;
  lastSeen?: number;
  /** Eigene TTS-Stimme für diesen Zuschauer (überschreibt Default). */
  voice?: string;
  /** Gewonnene Spiel-Runden (z.B. Zahlen-Raten) — fürs Spiel-Leaderboard. */
  gameWins?: number;
  /** Eigenes Begrüßungs-Medium (Media-ID) — spielt z.B. beim Teamherz. */
  welcomeMediaId?: string;
  /** Wie oft dieser Zuschauer schon da war (Besuche, Lücke ≥ RETURN_GAP_MS = neuer). */
  visitCount?: number;
}

/** Abstand, ab dem ein erneuter Kontakt als NEUER Besuch zählt (4 h → neuer Stream). */
export const RETURN_GAP_MS = 4 * 3600 * 1000;

/** Erster Kontakt ODER nach längerer Pause = neuer Besuch (für Stammgast-Zähler). */
export function isNewVisit(lastSeen: number | undefined, ts: number, gapMs: number): boolean {
  return lastSeen === undefined || ts - lastSeen > gapMs;
}

export type ViewerFlag = 'vip' | 'muted';

interface Serialized {
  schemaVersion: number;
  viewers: PointsEntry[];
}

export class PointsStore {
  private readonly file: string;
  private viewers = new Map<string, PointsEntry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.file = path.join(userDataDir, 'points.json');
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.file)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<Serialized>;
      // v1 und v2 lesbar (v1-einträge haben einfach keine flags/stats)
      if ((data.schemaVersion !== 1 && data.schemaVersion !== POINTS_SCHEMA_VERSION) || !Array.isArray(data.viewers)) return;
      for (const v of data.viewers) {
        if (v && typeof v.id === 'string') this.viewers.set(v.id, { ...v });
      }
    } catch (err) {
      log.warn('Points', 'points.json nicht lesbar — leer gestartet', (err as Error).message);
    }
  }

  award(userId: string, nickname: string, points: number, profilePic?: string): void {
    if (!userId || points === 0) return;
    const entry = this.viewers.get(userId) ?? { id: userId, nickname, points: 0 };
    entry.points = Math.max(0, entry.points + points);
    entry.nickname = nickname || entry.nickname;
    if (profilePic) entry.profilePic = profilePic;
    this.viewers.set(userId, entry);
    this.scheduleSave();
  }

  /** Punkte für ein Event gemäß Config vergeben; liefert die vergebene Menge. */
  recordEvent(event: StudioEvent, cfg: PointsConfig): number {
    if (!cfg.enabled || !event.user) return 0;
    let pts = 0;
    switch (event.type) {
      case 'chat':
        pts = cfg.perChat;
        break;
      case 'follow':
      case 'share':
        pts = cfg.perFollow;
        break;
      case 'sub':
        pts = cfg.perFollow * 2;
        break;
      case 'like':
        pts = cfg.perLike * (event.likeCount ?? 0);
        break;
      case 'gift':
        pts = cfg.perCoin * (event.gift?.totalCoins ?? 0);
        break;
      default:
        return 0;
    }
    this.touchStats(event);
    if (pts <= 0) return 0;
    this.award(event.user.id, event.user.nickname, pts, event.user.profilePic);
    return pts;
  }

  /** Aktivitäts-Statistik pro Zuschauer fortschreiben (auch ohne Punkte). */
  private touchStats(event: StudioEvent): void {
    const user = event.user;
    if (!user) return;
    const e = this.viewers.get(user.id) ?? { id: user.id, nickname: user.nickname, points: 0 };
    e.nickname = user.nickname || e.nickname;
    if (user.profilePic) e.profilePic = user.profilePic;
    // Besuche zählen, bevor lastSeen aktualisiert wird (Lücke ≥ 4h = neuer Besuch).
    if (isNewVisit(e.lastSeen, event.ts, RETURN_GAP_MS)) e.visitCount = (e.visitCount ?? 0) + 1;
    e.firstSeen = e.firstSeen ?? event.ts;
    e.lastSeen = event.ts;
    if (event.type === 'gift' && event.gift) {
      e.gifts = (e.gifts ?? 0) + 1;
      e.coins = (e.coins ?? 0) + event.gift.totalCoins;
    } else if (event.type === 'like') {
      e.likes = (event.totalLikes && event.totalLikes > (e.likes ?? 0)) ? event.totalLikes : (e.likes ?? 0) + (event.likeCount ?? 0);
    } else if (event.type === 'chat') {
      e.totalChats = (e.totalChats ?? 0) + 1;
    }
    this.viewers.set(user.id, e);
    this.scheduleSave();
  }

  setFlag(userId: string, flag: ViewerFlag, value: boolean): void {
    const e = this.viewers.get(userId) ?? { id: userId, nickname: userId, points: 0 };
    e[flag] = value;
    this.viewers.set(userId, e);
    this.scheduleSave();
  }

  setVoice(userId: string, voice: string | undefined): void {
    const e = this.viewers.get(userId);
    if (!e) return;
    e.voice = voice;
    this.scheduleSave();
  }

  isMuted(userId: string): boolean { return this.viewers.get(userId)?.muted === true; }
  isVip(userId: string): boolean { return this.viewers.get(userId)?.vip === true; }
  /** Wie oft dieser Zuschauer schon da war (für Stammgast-Begrüßung). */
  visitCountOf(userId: string): number { return this.viewers.get(userId)?.visitCount ?? 0; }
  voiceFor(userId: string): string | undefined { return this.viewers.get(userId)?.voice; }

  /** Punkte manuell ändern (auch negativ); legt Eintrag an falls nötig. */
  grant(userId: string, delta: number): void {
    const e = this.viewers.get(userId) ?? { id: userId, nickname: userId, points: 0 };
    e.points = Math.max(0, e.points + delta);
    this.viewers.set(userId, e);
    this.scheduleSave();
  }

  search(query: string, limit: number): PointsEntry[] {
    const q = query.trim().toLowerCase();
    return Array.from(this.viewers.values())
      .filter((e) => !q || e.nickname.toLowerCase().includes(q))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  count(): number { return this.viewers.size; }

  /** Punkte abziehen (für künftige Einlösungen); false wenn zu wenig. */
  spend(userId: string, points: number): boolean {
    const entry = this.viewers.get(userId);
    if (!entry || entry.points < points) return false;
    entry.points -= points;
    this.scheduleSave();
    return true;
  }

  get(userId: string): PointsEntry | undefined {
    const e = this.viewers.get(userId);
    return e ? { ...e } : undefined;
  }

  top(limit: number): PointsEntry[] {
    return Array.from(this.viewers.values())
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  /** Einen Spiel-Sieg für diesen Zuschauer verbuchen (Zahlen-Raten etc.). */
  recordWin(user: { id: string; nickname: string; profilePic?: string }): void {
    if (!user?.id) return;
    const e = this.viewers.get(user.id) ?? { id: user.id, nickname: user.nickname, points: 0 };
    e.gameWins = (e.gameWins ?? 0) + 1;
    e.nickname = user.nickname || e.nickname;
    if (user.profilePic) e.profilePic = user.profilePic;
    this.viewers.set(user.id, e);
    this.scheduleSave();
  }

  /** Spiel-Leaderboard: meiste Siege zuerst (nur User mit ≥1 Sieg). */
  topWinners(limit: number): PointsEntry[] {
    return Array.from(this.viewers.values())
      .filter((e) => (e.gameWins ?? 0) > 0)
      .sort((a, b) => (b.gameWins ?? 0) - (a.gameWins ?? 0))
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  /** Begrüßungs-Medium eines Zuschauers setzen/entfernen. */
  setWelcomeMedia(userId: string, mediaId: string | undefined): void {
    const e = this.viewers.get(userId) ?? { id: userId, nickname: userId, points: 0 };
    e.welcomeMediaId = mediaId || undefined;
    this.viewers.set(userId, e);
    this.scheduleSave();
  }

  welcomeMediaFor(userId: string): string | undefined {
    return this.viewers.get(userId)?.welcomeMediaId;
  }

  /** Alle Einträge fürs Backup-Export. */
  exportEntries(): PointsEntry[] {
    return Array.from(this.viewers.values()).map((e) => ({ ...e }));
  }

  /** Einträge aus einem Backup laden (überschreibt gleiche IDs). */
  importEntries(entries: PointsEntry[]): void {
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      if (e && typeof e.id === 'string') this.viewers.set(e.id, { ...e });
    }
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    // Gebündelt schreiben — Gift-Bombing soll nicht 100×/s auf Disk schreiben.
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 3000);
  }

  save(): void {
    const data: Serialized = {
      schemaVersion: POINTS_SCHEMA_VERSION,
      viewers: Array.from(this.viewers.values()),
    };
    const tmp = `${this.file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      log.error('Points', 'Speichern fehlgeschlagen', (err as Error).message);
    }
  }
}
