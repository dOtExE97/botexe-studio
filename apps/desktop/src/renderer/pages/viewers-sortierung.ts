// viewers-sortierung.ts — Sortier- und Anzeige-Logik der Zuschauer-Seite,
// bewusst DOM-frei, damit sie prüfbar ist.
//
// Der springende Punkt bei allen Angaben hier: FEHLT ein Wert, ist er
// UNBEKANNT — nicht null. Wer „—" mit „0 Tage" verwechselt, sortiert einen
// Fremden zwischen die Stammgäste und behauptet in der Anzeige etwas, das
// TikTok nie gesagt hat.

export interface ViewerSortierbar {
  nickname: string;
  points: number;
  folgtSeitTagen?: number;
  fanclubSeitTagen?: number;
  followerCount?: number;
  lastSeen?: number;
}

export type SortSchluessel = 'punkte' | 'treue' | 'groesse' | 'zuletzt' | 'name';

export const SORT_LABELS: { id: SortSchluessel; label: string }[] = [
  { id: 'punkte', label: 'Punkte' },
  { id: 'treue', label: 'Folgt am längsten' },
  { id: 'groesse', label: 'Eigene Follower' },
  { id: 'zuletzt', label: 'Zuletzt gesehen' },
  { id: 'name', label: 'Name' },
];

/** Sortieren. Wer zu einem Kriterium keine Angabe hat, landet IMMER hinten —
 *  egal ob auf- oder absteigend gedacht. */
export function sortiereZuschauer<T extends ViewerSortierbar>(liste: T[], nach: SortSchluessel): T[] {
  const kopie = [...liste];
  if (nach === 'name') return kopie.sort((a, b) => a.nickname.localeCompare(b.nickname, 'de'));

  const wert = (v: T): number | undefined => {
    switch (nach) {
      case 'treue': return v.folgtSeitTagen;
      case 'groesse': return v.followerCount;
      case 'zuletzt': return v.lastSeen;
      default: return v.points;
    }
  };

  return kopie.sort((a, b) => {
    const wa = wert(a);
    const wb = wert(b);
    // Ohne Angabe nach hinten — nicht als 0 einsortieren.
    if (wa === undefined && wb === undefined) return a.nickname.localeCompare(b.nickname, 'de');
    if (wa === undefined) return 1;
    if (wb === undefined) return -1;
    return wb - wa;
  });
}

/** Die Treue-Zeile unter dem Namen. Leer, wenn TikTok nichts geliefert hat —
 *  dann steht dort gar nichts statt einer erfundenen Null. */
export function treueZeile(v: {
  folgtSeitTagen?: number;
  fanclubSeitTagen?: number;
  superfanSeitMonaten?: number;
  istTopGifter?: boolean;
  followerCount?: number;
}): string {
  const teile: string[] = [];
  if (v.folgtSeitTagen) teile.push(`folgt seit ${jahreOderTage(v.folgtSeitTagen)}`);
  if (v.fanclubSeitTagen) teile.push(`Teamherz ${jahreOderTage(v.fanclubSeitTagen)}`);
  if (v.superfanSeitMonaten) teile.push(`Superfan ${v.superfanSeitMonaten} Mon.`);
  if (v.istTopGifter) teile.push('Top-Schenker');
  if (v.followerCount) teile.push(`${v.followerCount.toLocaleString('de-DE')} Follower`);
  return teile.join(' · ');
}

/** „437 Tage" ist schwer zu greifen, „1,2 Jahre" nicht. Ab einem Jahr umrechnen. */
export function jahreOderTage(tage: number): string {
  if (tage < 365) return `${tage} Tagen`;
  const jahre = tage / 365;
  return `${jahre.toFixed(1).replace('.', ',')} Jahren`;
}
