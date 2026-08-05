// tiktok-artenbuch.ts — führt Buch darüber, WAS in einem Stream wirklich ankam.
//
// WARUM ES DAS GIBT
// Die Frage „was schickt TikTok uns eigentlich?" wurde bisher beantwortet, indem
// jemand eine Logdatei nach „Unbekannte TikTok-Nachrichtenart" durchsuchte und
// die Treffer von Hand auszählte. Das ist mühsam, unvollständig (jede Art steht
// nur EINMAL im Log, die Häufigkeit fehlt völlig) und wurde nach jedem Stream
// aufs Neue gemacht.
//
// Das Artenbuch zählt stattdessen mit und gibt am Ende EINEN Bericht aus:
// welche Arten kamen, wie oft, und welche davon die App auswertet. Damit ist ein
// einziger Stream mit eingeschaltetem Diagnose-Modus eine vollständige Antwort —
// statt einer Zettelwirtschaft.
//
// WAS ES BEWUSST NICHT TUT: Werte protokollieren. Nur Namen und Zahlen. In den
// Nachrichten stecken Raum- und Sitzungsdaten, und Logdateien gibt man weiter.

import { log } from '../core/logger';

/** Zählstand einer Nachrichtenart. */
interface Eintrag {
  anzahl: number;
  /** Wertet die App diese Art aus, oder fällt sie durch? */
  genutzt: boolean;
}

/**
 * Ein Artenbuch gehört zu GENAU EINER Verbindung.
 *
 * Bewusst kein Modul-Singleton: Der Auto-Connect prüft alle 30 Sekunden mit
 * einer eigenen, kurzlebigen Verbindung, ob der Streamer live ist. Mit einem
 * gemeinsamen Buch hätte jeder dieser Checks beim Trennen den Bericht eines
 * laufenden Streams ausgegeben und den Zählstand gelöscht.
 */
export class Artenbuch {
  private readonly buch = new Map<string, Eintrag>();

  /** Eine angekommene Nachricht verbuchen. */
  verbuche(type: string, genutzt: boolean): void {
    const da = this.buch.get(type);
    if (da) { da.anzahl += 1; if (genutzt) da.genutzt = true; return; }
    this.buch.set(type, { anzahl: 1, genutzt });
  }

  /** Der aktuelle Stand, sortiert nach Häufigkeit. */
  stand(): Array<{ type: string; anzahl: number; genutzt: boolean }> {
    return [...this.buch.entries()]
      .map(([type, e]) => ({ type, ...e }))
      .sort((a, b) => b.anzahl - a.anzahl);
  }

  leeren(): void {
    this.buch.clear();
  }

  /**
   * Den Bericht formulieren. Getrennt vom Ausgeben, damit ein Test den Text
   * prüfen kann, ohne das Log abzuhören.
   *
   * null, wenn nichts zu berichten ist — dann soll auch keine leere Zeile im
   * Log stehen. Genau das trifft auf die Live-Check-Verbindungen zu, die nie
   * eine Nachricht sehen.
   */
  bericht(): string | null {
    const stand = this.stand();
    if (stand.length === 0) return null;

    const genutzt = stand.filter((e) => e.genutzt);
    const verworfen = stand.filter((e) => !e.genutzt);
    const summe = stand.reduce((s, e) => s + e.anzahl, 0);

    const liste = (arr: typeof stand, max: number): string => arr
      .slice(0, max)
      .map((e) => `${e.type} ×${e.anzahl}`)
      .join(' · ') + (arr.length > max ? ` … und ${arr.length - max} weitere` : '');

    const zeilen = [
      `Bilanz dieses Streams: ${summe} Nachrichten in ${stand.length} Arten.`,
      `AUSGEWERTET (${genutzt.length}): ${genutzt.length ? liste(genutzt, 20) : '— nichts! Das ist ein Fehler.'}`,
    ];
    if (verworfen.length) {
      zeilen.push(`VERWORFEN (${verworfen.length}): ${liste(verworfen, 20)}`);
      zeilen.push('Verworfen heißt: Die App kennt diese Arten nicht und überspringt sie. Das ist meistens '
        + 'in Ordnung — aber genau hier stünde auch eine Gattung, die TikTok umbenannt hat, oder eine, '
        + 'die sich auszuwerten lohnt.');
    }
    return zeilen.join('\n           ');
  }

  /** Den Bericht ins Log schreiben (beim Trennen / Stream-Ende). */
  schreibeBericht(): void {
    const text = this.bericht();
    if (text) log.info('TikTok', text);
  }
}
