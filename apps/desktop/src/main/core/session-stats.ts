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
  /** Wie viele VERSCHIEDENE Zuschauer in der Session da/aktiv waren (inkl. Beitritte). */
  uniqueViewers: number;
}

/** Highlight eines einzelnen Gift-Events (für Top-Gift / Top-Streak-Widgets). */
export interface GiftHighlight {
  userId: string;
  nickname: string;
  profilePic?: string;
  giftSlug: string;
  giftIcon?: string;
  count: number;
  coins: number;
}

export interface StatsSnapshot {
  totals: StatsTotals;
  topGifters: GifterEntry[];
  topLikers: LikerEntry[];
  /** Wertvollstes Einzel-Gift der Session (nach Coins). */
  topGift?: GiftHighlight;
  /** Höchste Combo der Session (nach count). */
  topStreak?: GiftHighlight;
}

interface SerializedStats {
  schemaVersion: number;
  totals: StatsTotals;
  gifters: GifterEntry[];
  likers?: LikerEntry[];
  topGift?: GiftHighlight;
  topStreak?: GiftHighlight;
  /** Alle gesehenen Zuschauer-IDs — damit uniqueViewers nach Neustart korrekt
   *  weiterzählt (optional → alte Backups bleiben lesbar). */
  seenUsers?: string[];
}

function emptyTotals(): StatsTotals {
  return { coins: 0, gifts: 0, follows: 0, likes: 0, shares: 0, chats: 0, viewers: 0, peakViewers: 0, uniqueViewers: 0 };
}

/** Klon ohne undefined-Felder — damit In-Memory- und JSON-Roundtrip-Snapshot gleich sind. */
function cleanHighlight(h: GiftHighlight): GiftHighlight {
  const out: GiftHighlight = {
    userId: h.userId,
    nickname: h.nickname,
    giftSlug: h.giftSlug,
    count: h.count,
    coins: h.coins,
  };
  if (h.profilePic) out.profilePic = h.profilePic;
  if (h.giftIcon) out.giftIcon = h.giftIcon;
  return out;
}

export class SessionStats {
  private totals = emptyTotals();
  private gifters = new Map<string, GifterEntry>();
  private likers = new Map<string, LikerEntry>();
  private topGift?: GiftHighlight;
  private topStreak?: GiftHighlight;
  /** Alle je gesehenen Zuschauer-IDs der Session → uniqueViewers (= „wie viele
   *  verschiedene Leute waren da", inkl. reiner Beitritte). */
  private seenUsers = new Set<string>();
  /** Memoize: snapshot() sortiert die komplette Gifter-/Liker-Map. Bei vielen
   *  tausend Likern wäre das 4×/s (Stats-Throttle) + pro Client-Connect teuer.
   *  Cache gilt, bis ein Event den Zustand tatsächlich ändert (apply→true). */
  private dirty = true;
  private cached?: StatsSnapshot;

  /** Verarbeitet ein Event; liefert true, wenn sich der Zustand geändert hat. */
  apply(event: StudioEvent): boolean {
    const userNew = this.trackViewer(event.user?.id);
    const changed = this.applyInner(event) || userNew;
    if (changed) this.dirty = true;
    return changed;
  }

  /** Eine Zuschauer-ID erstmals erfassen → uniqueViewers. true, wenn neu. */
  private trackViewer(id: string | undefined): boolean {
    if (!id || this.seenUsers.has(id)) return false;
    this.seenUsers.add(id);
    this.totals.uniqueViewers = this.seenUsers.size;
    return true;
  }

  private applyInner(event: StudioEvent): boolean {
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
        // Top-Gift (wertvollstes Einzel-Gift) & Top-Streak (höchste Combo).
        const highlight: GiftHighlight = {
          userId: user?.id ?? '',
          nickname: user?.nickname ?? '?',
          profilePic: user?.profilePic,
          giftSlug: event.gift.slug,
          giftIcon: event.gift.icon,
          count: event.gift.count,
          coins: event.gift.totalCoins,
        };
        if (!this.topGift || highlight.coins > this.topGift.coins) this.topGift = highlight;
        if (!this.topStreak || highlight.count > this.topStreak.count) this.topStreak = highlight;
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
    if (!this.dirty && this.cached) return this.cached;
    const topGifters = Array.from(this.gifters.values())
      .sort((a, b) => b.coins - a.coins || b.gifts - a.gifts)
      .slice(0, TOP_GIFTERS_LIMIT)
      .map((g) => ({ ...g }));
    const topLikers = Array.from(this.likers.values())
      .sort((a, b) => b.likes - a.likes)
      .slice(0, TOP_GIFTERS_LIMIT)
      .map((l) => ({ ...l }));
    this.cached = {
      totals: { ...this.totals },
      topGifters,
      topLikers,
      ...(this.topGift ? { topGift: cleanHighlight(this.topGift) } : {}),
      ...(this.topStreak ? { topStreak: cleanHighlight(this.topStreak) } : {}),
    };
    this.dirty = false;
    return this.cached;
  }

  reset(): void {
    this.totals = emptyTotals();
    this.gifters.clear();
    this.likers.clear();
    this.seenUsers.clear();
    this.topGift = undefined;
    this.topStreak = undefined;
    this.dirty = true;
  }

  toJSON(): string {
    const data: SerializedStats = {
      schemaVersion: STATS_SCHEMA_VERSION,
      totals: { ...this.totals },
      gifters: Array.from(this.gifters.values()),
      likers: Array.from(this.likers.values()),
      topGift: this.topGift,
      topStreak: this.topStreak,
      seenUsers: Array.from(this.seenUsers),
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
      for (const id of data.seenUsers ?? []) stats.seenUsers.add(id);
      // uniqueViewers konsistent zum wiederhergestellten Set halten.
      stats.totals.uniqueViewers = stats.seenUsers.size || stats.totals.uniqueViewers;
      if (data.topGift) stats.topGift = { ...data.topGift };
      if (data.topStreak) stats.topStreak = { ...data.topStreak };
      return stats;
    } catch {
      return null;
    }
  }
}
