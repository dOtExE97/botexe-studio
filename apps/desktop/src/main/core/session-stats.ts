// session-stats.ts — aggregierter Live-Zustand der Stream-Session:
// Totals (Coins, Gifts, Follows, Likes, …) + Top-Gifter-Leaderboard.
// Pure Logik; Persistenz (Crash-Recovery) und Broadcast macht der Service.
import type { StudioEvent } from '@botexe/trigger-engine';

export const STATS_SCHEMA_VERSION = 1;
const TOP_GIFTERS_LIMIT = 10;

export interface GifterEntry {
  id: string;
  nickname: string;
  profilePic?: string;
  coins: number;
  gifts: number;
}

export interface LikerEntry {
  id: string;
  nickname: string;
  profilePic?: string;
  likes: number;
}

export interface StatsTotals {
  coins: number;
  gifts: number;
  follows: number;
  likes: number;
  shares: number;
  chats: number;
  viewers: number;
  peakViewers: number;
}

export interface StatsSnapshot {
  totals: StatsTotals;
  topGifters: GifterEntry[];
  topLikers: LikerEntry[];
}

interface SerializedStats {
  schemaVersion: number;
  totals: StatsTotals;
  gifters: GifterEntry[];
  likers?: LikerEntry[];
}

function emptyTotals(): StatsTotals {
  return { coins: 0, gifts: 0, follows: 0, likes: 0, shares: 0, chats: 0, viewers: 0, peakViewers: 0 };
}

export class SessionStats {
  private totals = emptyTotals();
  private gifters = new Map<string, GifterEntry>();
  private likers = new Map<string, LikerEntry>();

  /** Verarbeitet ein Event; liefert true, wenn sich der Zustand geändert hat. */
  apply(event: StudioEvent): boolean {
    switch (event.type) {
      case 'gift': {
        if (!event.gift) return false;
        this.totals.gifts += 1;
        this.totals.coins += event.gift.totalCoins;
        const user = event.user;
        if (user) {
          const entry = this.gifters.get(user.id) ?? {
            id: user.id,
            nickname: user.nickname,
            coins: 0,
            gifts: 0,
          };
          entry.coins += event.gift.totalCoins;
          entry.gifts += 1;
          entry.nickname = user.nickname;
          if (user.profilePic) entry.profilePic = user.profilePic;
          this.gifters.set(user.id, entry);
        }
        return true;
      }
      case 'follow':
        this.totals.follows += 1;
        return true;
      case 'share':
        this.totals.shares += 1;
        return true;
      case 'chat':
        this.totals.chats += 1;
        return true;
      case 'like': {
        // Plattform-Gesamtzähler hat Vorrang (monoton); Fallback: aufaddieren.
        const next =
          event.totalLikes && event.totalLikes > 0
            ? event.totalLikes
            : this.totals.likes + (event.likeCount ?? 1);
        let changed = next !== this.totals.likes;
        this.totals.likes = next;
        const user = event.user;
        if (user && (event.likeCount ?? 0) > 0) {
          const entry = this.likers.get(user.id) ?? { id: user.id, nickname: user.nickname, likes: 0 };
          entry.likes += event.likeCount ?? 0;
          entry.nickname = user.nickname;
          if (user.profilePic) entry.profilePic = user.profilePic;
          this.likers.set(user.id, entry);
          changed = true;
        }
        return changed;
      }
      case 'viewer_count': {
        const count = event.viewerCount ?? 0;
        const changed = count !== this.totals.viewers;
        this.totals.viewers = count;
        if (count > this.totals.peakViewers) this.totals.peakViewers = count;
        return changed;
      }
      default:
        return false;
    }
  }

  snapshot(): StatsSnapshot {
    const topGifters = Array.from(this.gifters.values())
      .sort((a, b) => b.coins - a.coins || b.gifts - a.gifts)
      .slice(0, TOP_GIFTERS_LIMIT)
      .map((g) => ({ ...g }));
    const topLikers = Array.from(this.likers.values())
      .sort((a, b) => b.likes - a.likes)
      .slice(0, TOP_GIFTERS_LIMIT)
      .map((l) => ({ ...l }));
    return { totals: { ...this.totals }, topGifters, topLikers };
  }

  reset(): void {
    this.totals = emptyTotals();
    this.gifters.clear();
    this.likers.clear();
  }

  toJSON(): string {
    const data: SerializedStats = {
      schemaVersion: STATS_SCHEMA_VERSION,
      totals: { ...this.totals },
      gifters: Array.from(this.gifters.values()),
      likers: Array.from(this.likers.values()),
    };
    return JSON.stringify(data);
  }

  static fromJSON(json: string): SessionStats | null {
    try {
      const data = JSON.parse(json) as Partial<SerializedStats>;
      if (data.schemaVersion !== STATS_SCHEMA_VERSION) return null;
      if (!data.totals || !Array.isArray(data.gifters)) return null;
      const stats = new SessionStats();
      stats.totals = { ...emptyTotals(), ...data.totals };
      for (const g of data.gifters) stats.gifters.set(g.id, { ...g });
      for (const l of data.likers ?? []) stats.likers.set(l.id, { ...l });
      return stats;
    } catch {
      return null;
    }
  }
}
