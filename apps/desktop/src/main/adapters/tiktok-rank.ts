// tiktok-rank.ts — TikToks Live-Ranglisten („dein Platz") aus dem rankUpdate-
// Ereignis lesen. Pure Umwandlung, kein I/O — testbar.
//
// Bewusst KEIN neues Bus-Ereignis: Der Platz ist ein Zustand, kein Vorfall.
// Als Ereignis müsste ihn die Trigger-Engine kennen, und jede Rangänderung
// liefe durch die ganze Auswertungskette — für eine Zahl, die sich anzeigt.
//
// TikTok liefert den Platz als Text ("12"), die Restzeit als Sekunden-Text,
// und die Art als Zahl (Stunden-/Wochen-/Tages-Rangliste). Alles kann fehlen.

/** Ranglisten-Arten laut Protokoll (tiktok-live-proto/v3, ProfitRankType).
 *  Nur die, die für einen Streamer sichtbar Sinn ergeben. */
const RANG_ARTEN: Record<number, string> = {
  0: 'Stunden-Rangliste',
  1: 'Wochen-Rangliste',
  2: 'Stunden-Sterne',
  3: 'Aufsteiger (Aktion)',
  4: 'Aufsteiger der Woche',
  5: 'Newcomer der Woche',
  8: 'Tages-Rangliste',
  9: 'Erstes Geschenk',
  10: 'Spiele-Rangliste',
  11: 'Tages-Spiele',
};

export interface RangStand {
  /** Wie die Rangliste heißt (verständlich, nicht die rohe Zahl). */
  art: string;
  /** Rohe Art-Nummer — für die Anzeige uninteressant, fürs Debuggen nützlich. */
  artNr: number;
  /** Eigener Platz. 0 = TikTok meldet keine Platzierung (z.B. außerhalb der Liste). */
  platz: number;
  /** Restsekunden bis Rundenende, 0 wenn TikTok keine mitschickt. */
  restSek: number;
  /** Wann zuletzt aktualisiert. */
  at: number;
}

/** Eine Zahl aus einem Wert lesen, der Text ODER Zahl sein kann. */
function zahl(w: unknown): number {
  const n = typeof w === 'string' ? parseInt(w, 10) : typeof w === 'number' ? w : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * rankUpdate-Rohdaten → Liste von Rang-Ständen (TikTok schickt oft mehrere
 * Ranglisten in einer Nachricht). Leeres Array, wenn nichts Brauchbares dabei ist.
 */
export function leseRangUpdate(daten: unknown, jetzt: number): RangStand[] {
  const d = daten as { updates?: unknown[] } | undefined;
  const updates = Array.isArray(d?.updates) ? d.updates : [];
  const out: RangStand[] = [];
  for (const roh of updates) {
    // Fremde Daten: Ein einzelner kaputter Eintrag darf nicht die ganze
    // Auswertung mitreissen — das Ereignis kommt aus dem Netz, nicht von uns.
    if (typeof roh !== 'object' || roh === null) continue;
    const u = roh as { rankType?: unknown; ownRank?: unknown; countdown?: unknown };
    const platz = zahl(u.ownRank);
    // Ohne Platzierung ist der Eintrag für die Anzeige wertlos — TikTok schickt
    // solche Einträge z.B. für Ranglisten, in denen man gar nicht auftaucht.
    if (platz <= 0) continue;
    const artNr = zahl(u.rankType);
    out.push({
      art: RANG_ARTEN[artNr] ?? `Rangliste ${artNr}`,
      artNr,
      platz,
      restSek: zahl(u.countdown),
      at: jetzt,
    });
  }
  return out;
}

/**
 * Aus mehreren Ranglisten die interessanteste wählen: die mit dem BESTEN
 * (kleinsten) Platz. Steht man in der Stundenliste auf 3 und in der Wochenliste
 * auf 240, ist die 3 die Nachricht des Tages.
 */
export function besterRang(staende: RangStand[]): RangStand | null {
  if (staende.length === 0) return null;
  return staende.reduce((a, b) => (b.platz < a.platz ? b : a));
}
