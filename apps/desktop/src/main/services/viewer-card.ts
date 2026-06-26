// viewer-card.ts — reine Logik, ob/welcher Viewer-Moment gezeigt wird und wie
// die zugehörige MomentPayload aussieht. Kein State-Store, kein Date.now intern:
// die aktuelle Zeit kommt immer als `now`-Parameter rein (testbar). Cooldowns
// werden lediglich als Map im Service gehalten — per-User und global.
import type { MomentPayload } from '@botexe/overlay-engine';

/** Was wir über einen Viewer wissen, um daraus einen Moment zu bauen. Alle
 *  Zähl-Felder sind optional — fehlt etwas, taucht es einfach nicht in `stats`
 *  auf. */
export interface ViewerInfo {
  id: string;
  nickname: string;
  profilePic?: string;
  isVip?: boolean;
  visits?: number;
  points?: number;
  coins?: number;
  gifts?: number;
  gameWins?: number;
}

/** Welche Art Viewer-Moment gebaut werden soll. 'manual-card' ignoriert
 *  bewusst alle Cooldowns (vom Streamer per Knopfdruck ausgelöst). */
export type ViewerCardKind = 'vip-welcome' | 'returning-viewer' | 'manual-card';

export interface ViewerCardOptions {
  /** Sperrzeit pro Viewer, bevor derselbe wieder einen Moment bekommt. */
  perUserCooldownMs?: number;
  /** Mindestabstand zwischen zwei beliebigen Viewer-Momenten (Rate-Limit). */
  globalMinGapMs?: number;
  /** Ab so vielen Besuchen gilt ein Viewer als „returning". */
  returningMinVisits?: number;
}

const DEFAULT_PER_USER_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_GLOBAL_MIN_GAP_MS = 8_000;
const DEFAULT_RETURNING_MIN_VISITS = 5;

// Anzeigedauer der Einblender (~4,5 s) — bewusst je Art leicht variiert.
const DURATION_MS: Record<ViewerCardKind, number> = {
  'vip-welcome': 4_500,
  'returning-viewer': 4_500,
  'manual-card': 4_500,
};

// Priorität: VIP sticht raus, manuell darunter, returning am unauffälligsten.
const PRIORITY: Record<ViewerCardKind, number> = {
  'vip-welcome': 70,
  'returning-viewer': 40,
  'manual-card': 50,
};

// Channel-Zuordnung — steuert, welcher Action-Screen den Moment anzeigt.
const CHANNEL: Record<ViewerCardKind, MomentPayload['channel']> = {
  'vip-welcome': 'vip',
  'returning-viewer': 'viewer',
  'manual-card': 'manual',
};

export class ViewerCardService {
  private readonly perUserCooldownMs: number;
  private readonly globalMinGapMs: number;
  private readonly returningMinVisits: number;

  /** Zeitpunkt des letzten gezeigten Moments je Viewer-ID (ms). */
  private readonly lastShownPerUser = new Map<string, number>();
  /** Zeitpunkt des zuletzt überhaupt gezeigten Viewer-Moments (ms). */
  private lastShownGlobal: number | null = null;

  constructor(opts: ViewerCardOptions = {}) {
    this.perUserCooldownMs = opts.perUserCooldownMs ?? DEFAULT_PER_USER_COOLDOWN_MS;
    this.globalMinGapMs = opts.globalMinGapMs ?? DEFAULT_GLOBAL_MIN_GAP_MS;
    this.returningMinVisits = opts.returningMinVisits ?? DEFAULT_RETURNING_MIN_VISITS;
  }

  /** Baut den Moment für `kind`/`v` zur Zeit `now` — oder null, wenn ein
   *  Cooldown/Rate-Limit greift bzw. die Voraussetzungen nicht erfüllt sind.
   *  'manual-card' ignoriert alle Cooldowns und liefert immer einen Moment. */
  buildMoment(kind: ViewerCardKind, v: ViewerInfo, now: number): MomentPayload | null {
    if (kind === 'manual-card') {
      // Manuell ausgelöst: keine Gate-Prüfung, aber wir notieren die Zeit,
      // damit ein direkt folgender automatischer Moment am Gap scheitert.
      const moment = this.compose(kind, v);
      this.markShown(v.id, now);
      return moment;
    }

    // Returning-Viewer braucht genug Besuche, sonst ist es kein Moment wert.
    if (kind === 'returning-viewer') {
      const visits = v.visits ?? 0;
      if (visits < this.returningMinVisits) {
        return null;
      }
    }

    // Globales Rate-Limit: zu kurz seit dem letzten Moment? → blockieren.
    if (this.lastShownGlobal !== null && now - this.lastShownGlobal < this.globalMinGapMs) {
      return null;
    }

    // Per-User-Cooldown: dieser Viewer hatte kürzlich schon einen Moment.
    const lastForUser = this.lastShownPerUser.get(v.id);
    if (lastForUser !== undefined && now - lastForUser < this.perUserCooldownMs) {
      return null;
    }

    const moment = this.compose(kind, v);
    this.markShown(v.id, now);
    return moment;
  }

  /** Merkt sich, dass für `userId` zur Zeit `now` ein Moment gezeigt wurde —
   *  aktualisiert sowohl per-User- als auch globalen Cooldown. */
  private markShown(userId: string, now: number): void {
    this.lastShownPerUser.set(userId, now);
    this.lastShownGlobal = now;
  }

  /** Setzt die reine Payload zusammen — ohne jede Gate-Logik. */
  private compose(kind: ViewerCardKind, v: ViewerInfo): MomentPayload {
    return {
      id: `viewer-${kind}-${v.id}`,
      channel: CHANNEL[kind],
      type: kind,
      priority: PRIORITY[kind],
      durationMs: DURATION_MS[kind],
      user: { id: v.id, nickname: v.nickname, profilePic: v.profilePic },
      title: this.buildTitle(kind, v),
      subtitle: this.buildSubtitle(kind, v),
      stats: this.buildStats(v),
    };
  }

  private buildTitle(kind: ViewerCardKind, v: ViewerInfo): string {
    switch (kind) {
      case 'vip-welcome':
        return `VIP ${v.nickname}`;
      case 'returning-viewer':
        return `${v.nickname} ist zurück`;
      case 'manual-card':
        return v.nickname;
    }
  }

  private buildSubtitle(kind: ViewerCardKind, v: ViewerInfo): string | undefined {
    switch (kind) {
      case 'vip-welcome':
        return 'Willkommen zurück im Stream!';
      case 'returning-viewer': {
        const visits = v.visits ?? 0;
        return `${visits}. Besuch`;
      }
      case 'manual-card':
        return undefined;
    }
  }

  /** Baut die Stats-Map aus den vorhandenen Zählwerten. Nur gesetzte Felder
   *  landen drin, damit das Overlay keine Null-Werte rendert. */
  private buildStats(v: ViewerInfo): Record<string, number> | undefined {
    const stats: Record<string, number> = {};
    if (v.visits !== undefined) stats['Besuche'] = v.visits;
    if (v.coins !== undefined) stats['Coins'] = v.coins;
    if (v.points !== undefined) stats['Punkte'] = v.points;
    if (v.gifts !== undefined) stats['Gifts'] = v.gifts;
    if (v.gameWins !== undefined) stats['Wins'] = v.gameWins;
    return Object.keys(stats).length > 0 ? stats : undefined;
  }
}
