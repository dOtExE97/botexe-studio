// galerie-sortierung.ts — die Reihenfolge der Geschenke-Galerie, DOM-frei.
//
// Warum ausgelagert: Der erste Anlauf sortierte bei einer Suche zuerst nach
// Relevanz und ließ danach die gewählte Sortierung (Coins/Name/Zuletzt) über
// dieselbe Liste laufen. Die bildet eine vollständige Ordnung über einen
// anderen Schlüssel und hat die Relevanz damit restlos überschrieben — die
// Rose stand bei Sortierung „Name" wieder mittendrin, obwohl der Fix als
// erledigt galt. In der Ansicht war das nicht prüfbar; hier ist es das.

export type GiftSort = 'coins' | 'name' | 'recent';

export interface SortierbaresGeschenk {
  slug: string;
  coins?: number;
  lastSeen?: number;
}

export interface SortierMittel<T> {
  /** Anzeigename (deutsch/englisch/eigener) — für die Namens-Sortierung. */
  anzeigeName: (g: T) => string;
  /** Trefferwert der Suche, 0 wenn nicht gesucht wird. */
  relevanz: (g: T) => number;
}

/**
 * Geschenke sortieren. Bei aktiver Suche zählt ZUERST die Trefferqualität —
 * die gewählte Sortierung entscheidet nur noch bei gleichwertigen Treffern.
 *
 * Das muss in DERSELBEN Vergleichsfunktion stecken, nicht in einem Durchgang
 * davor. Sonst gewinnt immer die zuletzt angewandte Ordnung.
 */
export function sortiereGeschenke<T extends SortierbaresGeschenk>(
  liste: T[],
  sort: GiftSort,
  mittel: SortierMittel<T>,
): T[] {
  const { anzeigeName, relevanz } = mittel;
  const nachRelevanz = (a: T, b: T) => relevanz(b) - relevanz(a);
  const nachName = (a: T, b: T) => anzeigeName(a).localeCompare(anzeigeName(b), 'de');

  return [...liste].sort((a, b) => {
    const rel = nachRelevanz(a, b);
    if (rel !== 0) return rel;
    if (sort === 'coins') return (b.coins || 0) - (a.coins || 0) || nachName(a, b);
    if (sort === 'name') return nachName(a, b);
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  });
}
