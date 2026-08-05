// session-stats.ts — aggregierter Live-Zustand der Stream-Session:
// Totals (Coins, Gifts, Follows, Likes, …) + Top-Gifter-Leaderboard.
// Pure Logik; Persistenz (Crash-Recovery) und Broadcast macht der Service.
import type { StudioEvent, RaumPlatz } from '@botexe/trigger-engine';

export const STATS_SCHEMA_VERSION = 1;
const TOP_GIFTERS_LIMIT = 10;

/**
 * Wie viele Geschenke steckt EIN Gift-Ereignis? Antwort: die Stückzahl, nicht
 * eins — eine 50er-Rosen-Combo kommt als ein Ereignis mit `count: 50` an
 * (`normalizeGift` verwirft die Zwischenstufen), und `totalCoins` ist bereits
 * `coinsPerUnit × count`. Mit „+1" zählte dieselbe Combo als 1 Geschenk,
 * während die Coins um 50 stiegen: Ein „Geschenk-Ziel 100" füllte sich
 * praktisch nie, und der Gift-Chip zeigte weniger als der Geschenkzähler
 * direkt daneben (der zählt seit jeher `count`).
 *
 * Die Bedingung `totalCoins > 0` ist die Sicherung dagegen, dass daraus je eine
 * Doppelzählung wird: Die Combo-Zwischenstufen werden nur unterdrückt, wenn das
 * Ereignis die Gift-Details der Plattform trägt — und genau daher stammt auch
 * der Coin-Preis. Kommen (etwa von einem fremden Anbieter) Ereignisse OHNE
 * diese Details, rutschen alle Zwischenstufen durch und ihre `count`-Werte
 * summierten sich zu 1+2+3+… statt 50. Ohne Coins zählt deshalb jedes Ereignis
 * als genau ein Geschenk — so wie vorher.
 *
 * EINE Quelle für SessionStats und PointsStore. Das gift-counter-Widget zählt
 * ebenfalls `count` — allerdings ohne diese Coin-Bedingung; im Regelfall (echte
 * TikTok-Geschenke kosten mindestens 1 Coin) kommen beide auf dieselbe Zahl.
 */
export function giftStueckzahl(gift: { count?: number; totalCoins?: number }): number {
  if (!(Number(gift.totalCoins) > 0)) return 1;
  return Math.max(1, Math.floor(Number(gift.count) || 1));
}

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
  /** Superfan-VERLÄNGERUNGEN (Treue) in dieser Session. Bewusst getrennt von
   *  den neuen Superfans — eine Verlängerung ist kein Zuwachs. */
  subs?: number;
  /** Anzahl geworfener Coin-Kisten/Truhen. */
  envelopes?: number;
  /** Höchststand unsichtbarer Zuschauer (TikTok „anonymous"). */
  peakAnonymous?: number;
  /** Höchster von TikTok gemeldeter Beliebtheitswert des Raums.
   *
   *  TikToks eigene Zahl, nicht unsere: Sie kommt in jedem Zuschauer-Tick mit
   *  und wurde bis v0.49.0 weggeworfen. Als Gegenprobe zu den selbst gezählten
   *  Werten nützlich — und als das, was TikToks Empfehlungen vermutlich sehen. */
  peakBeliebtheit?: number;
  /** Beste Platzierung dieser Session in einer TikTok-Rangliste. Niedriger ist
   *  besser — „Platz 7" heißt, nur sechs waren im Zeitraum stärker. */
  bestePlatzierung?: number;
  /** Zu welcher Rangliste sie gehört (z.B. „Tages-Rangliste"). */
  besteRangArt?: string;
  /** NEUE Superfans in dieser Session — VERSCHIEDENE Personen.
   *
   *  Zwei Quellen melden dasselbe: die Abo-Nachricht (WebcastSubNotifyMessage)
   *  und die Banner-Meldung (superFanJoin). Ohne Abgleich stünde derselbe
   *  Mensch zweimal in der Zahl. Deshalb wird je Person nur EINMAL gezählt. */
  superfans?: number;
  /** Emotes/Sticker von Zuschauern — Beteiligung jenseits von Kommentaren. */
  emotes?: number;
  /** Coins, die in Truhen steckten.
   *
   *  BEWUSST NICHT in `coins` eingerechnet: Ob TikTok für eine Truhe ZUSÄTZLICH
   *  eine Geschenk-Nachricht schickt, ist ohne echten Live-Test nicht zu klären.
   *  Würden wir es einfach addieren und TikTok schickt beides, stünde in der
   *  Auswertung dauerhaft das Doppelte — ein Fehler, der später kaum auffällt
   *  und alle Vergleiche verdirbt. Deshalb getrennt ausweisen, bis es belegt ist. */
  envelopeCoins?: number;
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

/** Ein Messpunkt im Verlauf eines Abends.
 *
 *  Bis v0.50.0 speicherte die App nur ENDSTÄNDE. Damit ließ sich sagen, dass
 *  ein Abend 4.200 Coins hatte — aber nicht, ob sie gleichmäßig kamen oder in
 *  einer einzigen Minute. Für den Streamer ist genau das die interessantere
 *  Hälfte: „wann war was los".
 *
 *  BEWUSST SPARSAM: ein Punkt pro Minute, fünf Zahlen, und eine harte
 *  Obergrenze. Ein 12-Stunden-Stream kostet damit rund 20 KB — auf einem
 *  Rechner, dem der Speicher ausgeht, ist das der Unterschied zwischen einer
 *  netten Grafik und einem Problem. */
export interface VerlaufsPunkt {
  /** Minuten seit dem ersten Messpunkt. */
  m: number;
  coins: number;
  chats: number;
  likes: number;
  /** Zuschauer zu diesem Zeitpunkt. */
  viewers: number;
}

/** Höchstens so viele Messpunkte — danach wird jeder zweite verworfen und der
 *  Takt verdoppelt. So bleibt ein 20-Stunden-Stream genauso teuer wie ein
 *  10-Stunden-Stream, nur gröber aufgelöst. */
export const VERLAUF_MAX_PUNKTE = 720;

export interface StatsSnapshot {
  totals: StatsTotals;
  topGifters: GifterEntry[];
  topLikers: LikerEntry[];
  /** Wertvollstes Einzel-Gift der Session (nach Coins). */
  topGift?: GiftHighlight;
  /** Höchste Combo der Session (nach count). */
  topStreak?: GiftHighlight;
  /** TikToks EIGENE Raum-Bestenliste (Platz, Punktzahl, Zuschauer) — kommt in
   *  jedem Zuschauer-Tick mit und wurde bis v0.47 weggeworfen. Nützlich als
   *  Gegenprobe zur selbst gezählten Bestenliste. */
  raumBeste?: RaumPlatz[];
  /** Verlauf des Abends, ein Punkt je Takt (siehe VerlaufsPunkt). */
  verlauf?: VerlaufsPunkt[];
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
  return { coins: 0, gifts: 0, follows: 0, likes: 0, shares: 0, chats: 0, viewers: 0, peakViewers: 0, uniqueViewers: 0, subs: 0, envelopes: 0, envelopeCoins: 0, superfans: 0, emotes: 0 };
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
  /** TikToks eigene Raum-Bestenliste, zuletzt gemeldeter Stand (siehe apply). */
  private raumBeste: RaumPlatz[] = [];
  /** Verlauf des Abends. Wird von außen getaktet (siehe messeVerlauf) — die
   *  Stats-Klasse hat bewusst keinen eigenen Timer, damit sie in Tests
   *  vorhersagbar bleibt. */
  private verlauf: VerlaufsPunkt[] = [];
  /** Aktueller Takt in Minuten. Verdoppelt sich, wenn die Obergrenze reißt. */
  private verlaufTakt = 1;
  private verlaufStartMs = 0;

  /**
   * Einen Messpunkt setzen. Ruft der Aufrufer öfter als der Takt es vorsieht,
   * wird der Punkt verworfen — so darf die Uhr ruhig ungenau ticken.
   *
   * @param jetzt aktuelle Zeit (ms), injizierbar für Tests
   */
  messeVerlauf(jetzt: number): void {
    if (this.verlaufStartMs === 0) this.verlaufStartMs = jetzt;
    const m = Math.floor((jetzt - this.verlaufStartMs) / 60_000);
    const letzter = this.verlauf[this.verlauf.length - 1];
    if (letzter && m - letzter.m < this.verlaufTakt) return;
    this.verlauf.push({
      m,
      coins: this.totals.coins,
      chats: this.totals.chats,
      likes: this.totals.likes,
      viewers: this.totals.viewers,
    });
    // Obergrenze: jeden zweiten Punkt verwerfen und den Takt verdoppeln. Die
    // Kurve wird dadurch gröber, aber der Speicherbedarf bleibt gedeckelt —
    // und die Form bleibt erhalten, weil gleichmäßig ausgedünnt wird.
    if (this.verlauf.length > VERLAUF_MAX_PUNKTE) {
      this.verlauf = this.verlauf.filter((_, i) => i % 2 === 0);
      this.verlaufTakt *= 2;
    }
    this.dirty = true;
  }
  /** Wer in dieser Session schon als NEUER Superfan gezählt wurde (siehe apply). */
  private readonly neueSuperfans = new Set<string>();
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

  /** Eine Ranglisten-Platzierung verbuchen.
   *
   *  Kein Bus-Ereignis, sondern Zustand (siehe tiktok-rank.ts) — deshalb eine
   *  eigene Methode statt eines Falls in apply(). Gehalten wird nur die BESTE
   *  der Session: „Platz 7" heißt, nur sechs waren in dem Zeitraum besser.
   *  Niedriger ist besser, also das Minimum. */
  merkePlatzierung(platz: number, art: string): boolean {
    if (!Number.isFinite(platz) || platz <= 0) return false;
    if (this.totals.bestePlatzierung !== undefined && this.totals.bestePlatzierung <= platz) return false;
    this.totals.bestePlatzierung = platz;
    this.totals.besteRangArt = art;
    this.dirty = true;
    return true;
  }

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
        const stueck = giftStueckzahl(event.gift);
        // Coins über Number()+||0: Ein Ereignis von außen (Steuer-API) darf
        // `totalCoins` weglassen — ohne diese Absicherung würde die Summe zu
        // NaN und BLIEBE es für den Rest der Session (jede Anzeige „NaN Coins").
        const coins = Number(event.gift.totalCoins) || 0;
        this.totals.gifts += stueck;
        this.totals.coins += coins;
        const user = event.user;
        if (user) {
          const entry = this.gifters.get(user.id) ?? {
            id: user.id,
            nickname: user.nickname,
            coins: 0,
            gifts: 0,
          };
          entry.coins += coins;
          entry.gifts += stueck;
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
      case 'sub':
      case 'superfan': {
        // Verlängerung? Dann ist es Treue, kein Zuwachs — eigene Zahl.
        if (event.superfanNeu === false) {
          this.totals.subs = (this.totals.subs ?? 0) + 1;
          return true;
        }
        // Neuer Superfan: je PERSON nur einmal. Die Abo-Nachricht und die
        // Banner-Meldung berichten dasselbe Ereignis — ohne diesen Abgleich
        // stünde derselbe Mensch doppelt in der Auswertung.
        const wer = event.user?.id;
        if (wer && this.neueSuperfans.has(wer)) return false;
        if (wer) this.neueSuperfans.add(wer);
        this.totals.superfans = (this.totals.superfans ?? 0) + 1;
        return true;
      }
      case 'emote':
        this.totals.emotes = (this.totals.emotes ?? 0) + 1;
        return true;
      case 'envelope':
        this.totals.envelopes = (this.totals.envelopes ?? 0) + 1;
        this.totals.envelopeCoins = (this.totals.envelopeCoins ?? 0) + (event.envelope?.coins ?? 0);
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
        // Unsichtbare Zuschauer: nur den Höchststand merken — die Zahl
        // schwankt im Minutentakt, und interessant ist „wie viele waren
        // maximal da, die man nirgends sieht".
        if ((event.anonymousViewers ?? 0) > (this.totals.peakAnonymous ?? 0)) {
          this.totals.peakAnonymous = event.anonymousViewers;
        }
        // TikToks eigene Raum-Bestenliste: immer den ZULETZT gemeldeten Stand
        // halten (sie ist bereits kumulativ über den ganzen Stream).
        if (event.raumBeste && event.raumBeste.length > 0) this.raumBeste = event.raumBeste;
        // TikToks eigener Beliebtheitswert — nur der Höchststand. Er schwankt
        // im Sekundentakt; interessant ist, wie weit der Stream oben war.
        if ((event.beliebtheit ?? 0) > (this.totals.peakBeliebtheit ?? 0)) {
          this.totals.peakBeliebtheit = event.beliebtheit;
        }
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
      ...(this.raumBeste.length > 0 ? { raumBeste: this.raumBeste.map((p) => ({ ...p })) } : {}),
      ...(this.verlauf.length > 1 ? { verlauf: this.verlauf.map((p) => ({ ...p })) } : {}),
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
    this.neueSuperfans.clear();
    this.topGift = undefined;
    this.topStreak = undefined;
    // Auch die Raum-Bestenliste und der Verlauf gehören zur Session — bleiben
    // sie stehen, zeigt der nächste Stream die Kurve des vorherigen.
    this.raumBeste = [];
    this.verlauf = [];
    this.verlaufTakt = 1;
    this.verlaufStartMs = 0;
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
