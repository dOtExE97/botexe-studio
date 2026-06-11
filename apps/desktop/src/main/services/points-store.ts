// points-store.ts — persistentes Loyalty-/Punkte-System über Streams hinweg.
// Zuschauer sammeln Punkte durch Aktivität (Chat, Follow, Like, Gift-Coins).
// Basis für die Punkte-Bestenliste und das spätere Stream-Kartenspiel.
// JSON-Persistenz mit schemaVersion + atomarem Write (tmp+rename).
import fs from 'node:fs';
import path from 'node:path';
import type { StudioEvent } from '@botexe/trigger-engine';
import { log } from '../core/logger';

export const POINTS_SCHEMA_VERSION = 1;

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
}

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
      if (data.schemaVersion !== POINTS_SCHEMA_VERSION || !Array.isArray(data.viewers)) return;
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
    if (pts <= 0) return 0;
    this.award(event.user.id, event.user.nickname, pts, event.user.profilePic);
    return pts;
  }

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
