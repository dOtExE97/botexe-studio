// useStickerCatalog — lädt die gesehenen Sticker aus dem Hauptprozess.
//
// Anders als beim Gift-Katalog gibt es hier NICHTS zum Dazumischen: TikTok gibt
// die Sticker-Liste eines Kanals nicht heraus (untersucht am 20.08.2026, siehe
// main/services/sticker-catalog.ts). Was hier steht, ist genau das, was im
// Stream durchgekommen ist.
import { useCallback, useEffect, useState } from 'react';

export interface StickerEintrag {
  id: string;
  /** Fertige Adresse — lokale Kopie, sonst TikToks (noch gültige) Adresse. */
  bild: string;
  animiert: boolean;
  paket?: string;
  farbe?: string;
  anzahl: number;
  erstGesehen: number;
  zuletztGesehen: number;
  eigenerName?: string;
}

export function useStickerCatalog(): {
  sticker: StickerEintrag[];
  geladen: boolean;
  neuLaden: () => void;
} {
  const [sticker, setSticker] = useState<StickerEintrag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const liste = (await window.studio.getStickerCatalog()) as StickerEintrag[];
      if (!aktiv) return;
      setSticker(Array.isArray(liste) ? liste : []);
      setGeladen(true);
    })();
    return () => { aktiv = false; };
  }, [nonce]);

  const neuLaden = useCallback(() => setNonce((n) => n + 1), []);
  return { sticker, geladen, neuLaden };
}

/** Wie der Sticker heißen soll: eigener Name, sonst die Nummer.
 *
 *  TikTok liefert keinen Namen mit — auch TikFinity zeigt deshalb nur „#<id>". */
export function stickerName(e: { eigenerName?: string; id: string }): string {
  return e.eigenerName?.trim() || `#${e.id}`;
}
