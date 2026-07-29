// Was beim Ruhezustand des Rechners passieren soll.
//
// Warum: Geht der Stream-PC in den Standby (oder klappt der Laptop zu), reißt
// die WebSocket-Verbindung zu TikTok — aber die App merkt davon nichts
// Ordentliches. Beim Aufwachen hing sie dann in einem Zustand, der „verbunden"
// aussah, aber keine Events mehr bekam: Widgets bleiben still, und der
// Streamer sieht das erst, wenn das erste Geschenk nicht ankommt.
//
// Jetzt: Vor dem Einschlafen sauber trennen und MERKEN, dass wir verbunden
// waren. Nach dem Aufwachen kurz warten (das WLAN braucht ein paar Sekunden)
// und wieder verbinden.
//
// Die Entscheidung steckt hier als reine Funktion, damit sie prüfbar ist, ohne
// einen Rechner schlafen zu legen.

export interface StandbyLage {
  /** War die App beim Einschlafen mit TikTok verbunden? */
  warVerbunden: boolean;
  /** Nutzername, mit dem verbunden war (leer = nichts zum Wiederverbinden). */
  username: string;
  /** Ist die App JETZT (nach dem Aufwachen) schon wieder verbunden? Dann hat
   *  der normale Reconnect des Adapters schneller gegriffen als wir. */
  jetztVerbunden: boolean;
}

export type StandbyEntscheidung =
  | { tu: 'nichts'; grund: string }
  | { tu: 'wiederverbinden'; username: string };

/** Nach dem Aufwachen: neu verbinden oder in Ruhe lassen? */
export function nachDemAufwachen(lage: StandbyLage): StandbyEntscheidung {
  if (!lage.warVerbunden) return { tu: 'nichts', grund: 'war vorher nicht verbunden' };
  if (lage.jetztVerbunden) return { tu: 'nichts', grund: 'ist von selbst wieder verbunden' };
  const name = lage.username.trim();
  if (!name) return { tu: 'nichts', grund: 'kein Nutzername gemerkt' };
  return { tu: 'wiederverbinden', username: name };
}

/** Wartezeit nach dem Aufwachen, bevor wir es mit dem Netz versuchen.
 *  Sofort nach 'resume' ist das WLAN meist noch nicht wieder da — ein Versuch
 *  in dem Moment scheitert und verbrennt einen Verbindungs-Anlauf. */
export const AUFWACH_WARTEZEIT_MS = 8000;
