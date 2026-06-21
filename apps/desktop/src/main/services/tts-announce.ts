// tts-announce.ts — dedizierte Event-Ansagen per TTS (Follower / große Gifts),
// unabhängig vom Chat-Vorlesen. Jeder Block hat eigenen Text + eigene Stimme.

/** Ein Ansage-Block: an/aus, Vorlage, optionale eigene Stimme ('' = Standard). */
export interface AnnounceConfig {
  enabled: boolean;
  template: string;
  /** Stimm-ID; leer = die normale TTS-Stimme. */
  voice: string;
}

/** Gift-Ansage zusätzlich mit Coin-Schwelle. */
export interface GiftAnnounceConfig extends AnnounceConfig {
  minCoins: number;
}

/** Soll dieses Gift angesagt werden? (aktiv + ab Coin-Schwelle, inklusiv). */
export function shouldAnnounceGift(totalCoins: number, cfg: GiftAnnounceConfig): boolean {
  if (!cfg.enabled) return false;
  const min = Number.isFinite(cfg.minCoins) && cfg.minCoins > 0 ? cfg.minCoins : 0;
  return totalCoins >= min;
}
