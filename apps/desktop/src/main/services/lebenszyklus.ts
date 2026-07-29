// Wann darf sich die App beenden, wenn kein Fenster mehr offen ist?
//
// Klingt nach einer Zeile, hat aber vier Beteiligte, die sich gegenseitig ins
// Gehege kommen — und jeder Fehler hier ist maximal ärgerlich: Entweder beendet
// sich die App, während der Streamer noch sendet (alle Overlays in OBS weg),
// oder sie lässt sich nicht mehr beenden.
//
// Die Fälle:
//  - Das Startbild ist ein echtes Fenster. Schließt es sich, bevor das
//    Hauptfenster steht, ist die Fensterzahl 0 — die App würde sich beenden,
//    ohne je sichtbar gewesen zu sein.
//  - Mit Infobereich-Symbol läuft die App absichtlich ohne Fenster weiter.
//  - Ohne Symbol (Linux ohne Leiste) muss das alte Verhalten greifen, sonst
//    bleibt ein Prozess übrig, den niemand mehr loswird.
//  - „Beenden" muss immer gewinnen.

export interface FensterLage {
  /** Wurde das Hauptfenster überhaupt schon erzeugt? */
  hauptfensterErzeugt: boolean;
  /** Hat der Nutzer „Beenden" gewählt (Menü, Tray, Herunterfahren)? */
  beendetWirklich: boolean;
  /** Ist ein Symbol im Infobereich aktiv? */
  trayLaeuft: boolean;
  /** Einstellung „Beim Schließen weiterlaufen lassen". */
  minimizeToTray: boolean;
  /** macOS lässt Apps grundsätzlich ohne Fenster weiterlaufen. */
  istMac: boolean;
}

/** true = jetzt wirklich beenden. */
export function darfBeenden(l: FensterLage): boolean {
  if (l.beendetWirklich) return true;
  if (l.istMac) return false;
  if (!l.hauptfensterErzeugt) return false;
  if (l.trayLaeuft && l.minimizeToTray) return false;
  return true;
}
