// useGiftCatalog — lädt den kompletten Gift-Katalog (mit Bildern) einmalig aus
// dem Main-Prozess und mischt ihn mit der eingebauten Master-Liste ALLER
// aktuellen TikTok-Gifts. So sind auch nie-erhaltene Gifts (z.B. neue Event-
// Gifts) vorab auswählbar. Genutzt von der Geschenke-Galerie und vom <GiftPicker>.
//
// Die Zusammenführung steckt in shared/gift-master.ts — DIESELBE Funktion nutzt
// der Overlay-Server für die Widgets. Vorher lag sie nur hier, weshalb das
// App-Fenster Bilder zeigte, die im Overlay fehlten.
import { useEffect, useState } from 'react';
import { mergeMitMaster, type KatalogEintrag } from '../../shared/gift-master';

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

export function useGiftCatalog(): { gifts: GiftEntry[]; loaded: boolean; reload: () => void } {
  const [gifts, setGifts] = useState<GiftEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cat = (await window.studio.getGiftCatalog()) as Record<string, KatalogEintrag>;
      if (!alive) return;
      setGifts(mergeMitMaster(cat) as GiftEntry[]);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [nonce]);

  return { gifts, loaded, reload: () => setNonce((n) => n + 1) };
}
