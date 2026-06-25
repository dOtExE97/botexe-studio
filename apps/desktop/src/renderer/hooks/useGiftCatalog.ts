// useGiftCatalog — lädt den kompletten Gift-Katalog (mit Bildern) einmalig aus
// dem Main-Prozess und mischt ihn mit der eingebauten Master-Liste ALLER
// aktuellen TikTok-Gifts. So sind auch nie-erhaltene Gifts (z.B. neue Event-
// Gifts) vorab auswählbar. Genutzt von der Geschenke-Galerie und vom <GiftPicker>.
import { useEffect, useState } from 'react';
import GIFT_MASTER from '../lib/gift-master.json';

export interface GiftEntry {
  slug: string;
  icon?: string;
  coins: number;
  count: number;
  /** Deutscher Anzeigename (falls bekannt) — TikTok liefert nur englische Namen. */
  de?: string;
  lastSeen?: number;
  firstSender?: { id: string; nickname: string };
  firstSenderAt?: number;
  inLastRoom?: boolean;
  favorite?: boolean;
  customName?: string;
}

interface MasterGift { name: string; key: string; coins?: number; de?: string; giftId?: number }
const MASTER = GIFT_MASTER as MasterGift[];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const DE_BY_KEY = new Map(MASTER.filter((m) => m.de).map((m) => [m.key, m.de as string]));

export function useGiftCatalog(): { gifts: GiftEntry[]; loaded: boolean; reload: () => void } {
  const [gifts, setGifts] = useState<GiftEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cat = (await window.studio.getGiftCatalog()) as Record<string, GiftEntry>;
      if (!alive) return;
      // Erhaltene Gifts (echte Daten + Bild) zuerst; deutschen Namen ergänzen.
      const received = Object.values(cat).map((g) => ({ ...g, de: g.de ?? DE_BY_KEY.get(norm(g.slug)) }));
      const seen = new Set(received.map((g) => norm(g.slug)));
      // Alle übrigen aktuellen Gifts aus der Master-Liste — wählbar; Bild/Coins
      // kommen automatisch beim ersten Empfang dazu.
      const extra: GiftEntry[] = MASTER.filter((m) => !seen.has(m.key)).map((m) => ({
        slug: m.name,
        coins: m.coins ?? 0,
        count: 0,
        de: m.de,
      }));
      setGifts([...received, ...extra]);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [nonce]);

  return { gifts, loaded, reload: () => setNonce((n) => n + 1) };
}
