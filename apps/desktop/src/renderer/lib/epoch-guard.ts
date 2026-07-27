// epoch-guard.ts — kleine "nur die neueste Anfrage gewinnt"-Wächter-Klasse.
//
// Hintergrund (P1-4, KeyWizard.tsx): wenn zwei asynchrone Prüfungen für
// UNTERSCHIEDLICHE Werte parallel laufen (z.B. Clipboard-Poll erkennt einen
// neuen Key, während noch die Prüfung des manuell eingetippten Werts läuft),
// kann die ÄLTERE, langsamere Anfrage NACH der neueren fertig werden und ihr
// Ergebnis überschreiben — dabei würde ein veralteter Wert gespeichert/
// angezeigt. Gleiches Muster wie `epoch` in tiktok-adapter.ts, hier als kleine
// wiederverwendbare, DOM-freie Klasse (separat testbar — siehe Repo-Konvention
// in OverlayHealthBanner.test.ts: reine Entscheidungs-Logik ohne React-Render).
export class EpochGuard {
  private epoch = 0;

  /** Neue Runde beginnt JETZT die aktuellste zu sein — gibt ihre Kennung zurück,
   *  die man sich lokal merkt und später an isCurrent() übergibt. */
  start(): number {
    return ++this.epoch;
  }

  /** True, wenn seit start() keine neuere Runde begonnen hat — nur dann darf
   *  das Ergebnis dieser Runde angewendet werden (State setzen, speichern etc.). */
  isCurrent(id: number): boolean {
    return id === this.epoch;
  }

  /** Alle laufenden Runden hart entwerten (z.B. beim Schließen/Neuöffnen eines
   *  Dialogs) — ohne dass noch eine `start()`-Kennung gültig bleiben könnte. */
  invalidate(): void {
    this.epoch++;
  }
}
