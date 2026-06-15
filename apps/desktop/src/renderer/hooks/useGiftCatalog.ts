// useGiftCatalog — lädt den kompletten Gift-Katalog (mit Bildern) einmalig aus
// dem Main-Prozess und liefert ihn als sortierbares Array. Genutzt von der
// Geschenke-Galerie und vom <GiftPicker> auf der Trigger-/Bingo-Seite.
import { useEffect, useState } from 'react';

export interface GiftEntry {
  slug: string;
  icon?: string;
  coins: number;
  count: number;
  lastSeen?: number;
  firstSender?: { id: string; nickname: string };
  firstSenderAt?: number;
  inLastRoom?: boolean;
  favorite?: boolean;
  customName?: string;
}

export function useGiftCatalog(): { gifts: GiftEntry[]; loaded: boolean; reload: () => void } {
  const [gifts, setGifts] = useState<GiftEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cat = (await window.studio.getGiftCatalog()) as Record<string, GiftEntry>;
      if (!alive) return;
      setGifts(Object.values(cat));
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [nonce]);

  return { gifts, loaded, reload: () => setNonce((n) => n + 1) };
}
