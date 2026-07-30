// session-continuity.ts — „Ist die gespeicherte Session DIESELBE?"
//
// Die App legt die laufenden Session-Zahlen (Coins, Gifts, Top-Gifter …) als
// `session-stats.json` ab, damit ein Neustart mitten im Stream sie nicht
// wegwirft — genau das passiert bei jedem automatischen Update. Beim nächsten
// Start stellt sich die Frage: FORTSETZEN oder ist der Stream vorbei?
//
// Nur EIN Zeitfenster beantwortet das, und zwar an genau EINER Stelle (beim
// App-Start, siehe Studio.restoreSessionStats). Frühere Fassungen hatten zwei
// Fenster an zwei Stellen — die liefen prompt auseinander und konnten einen
// fertigen Stream sowohl doppelt in die Historie schreiben als auch ganz
// verlieren.
//
// Warum ausgerechnet 15 Minuten: Ein Update- oder Absturz-Neustart dauert
// Sekunden. Wer dagegen abends um 19:05 die App schließt und um 21:00 einen
// NEUEN Stream startet, darf nicht mit den Zahlen des vorherigen Streams
// beginnen — Coin-Glas und Ziel-Balken standen vor den Zuschauern sonst schon
// halb voll.
//
// Dazu, falls bekannt, die Room-ID als Veto: eine andere Room-ID ist immer ein
// neuer Stream. Der Cloud-Modus liefert keine Room-ID — deshalb darf sie das
// Zeitkriterium nur einschränken, nicht ersetzen.

/** So lange nach dem letzten Speichern gilt eine Session als fortsetzbar. */
export const SESSION_CONTINUE_MAX_MS = 15 * 60_000;

/**
 * Kommt die gespeicherte Session überhaupt noch als Fortsetzung in Frage?
 *
 * Ein NEGATIVES Alter (die Datei liegt in der Zukunft) heißt nicht „uralt",
 * sondern „die Uhr wurde verstellt" — beim Systemstart mit falscher RTC oder
 * nach einer NTP-Korrektur reichen Sekunden. Solche Werte werden bewusst als
 * frisch behandelt: Im Zweifel weiterlaufen lassen ist harmlos, den laufenden
 * Stream als beendet abzuräumen dagegen nicht.
 */
export function kannFortsetzung(ageMs: number): boolean {
  if (!Number.isFinite(ageMs)) return false;
  return Math.max(0, ageMs) < SESSION_CONTINUE_MAX_MS;
}

/**
 * Gilt die wiederhergestellte Session beim ersten „Live" als Fortsetzung — also
 * KEIN Reset?
 *
 * @param ageMs        Alter der Session-Daten JETZT (nicht beim App-Start —
 *                     zwischen Start und „Live" liegen oft Stunden).
 * @param roomId       Room-ID des neuen Live (fehlt im Cloud-Modus).
 * @param letzteRoomId Room-ID, die beim letzten Live gespeichert wurde.
 */
export function istFortsetzung(ageMs: number, roomId?: string, letzteRoomId?: string): boolean {
  if (!kannFortsetzung(ageMs)) return false;
  // Room-ID nur als Veto: sind beide bekannt und verschieden, ist es sicher ein
  // anderer Stream. Fehlt eine (Cloud-Modus, erster Start), entscheidet die Zeit.
  if (roomId && letzteRoomId && roomId !== letzteRoomId) return false;
  return true;
}
