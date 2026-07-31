// atomar-schreiben.ts — EINE Stelle für „Datei sicher ersetzen".
//
// Bis hierher stand dasselbe Muster (erst .tmp schreiben, dann umbenennen) in
// sieben Stores kopiert — und war bereits auseinandergelaufen: Eine Kopie
// schrieb ohne .tmp direkt ins Ziel und verschluckte ihren Fehler. Genau die
// Fehlerklasse, die dieses Projekt am häufigsten getroffen hat.
//
// Zwei Zusagen, und der Unterschied zwischen ihnen ist wichtig:
//  · Das Umbenennen ist ein einziger Schritt — die Zieldatei ist danach
//    entweder komplett alt oder komplett neu, nie halb geschrieben. Das
//    schützt gegen einen Absturz der App.
//  · `flush: true` erzwingt zusätzlich, dass die Daten wirklich auf der Platte
//    landen und nicht nur im Schreibpuffer des Betriebssystems liegen. Ohne
//    das schützt tmp+rename NICHT gegen Stromausfall oder Bluescreen.
//    Die Option gibt es bei writeFileSync erst ab Node 21 — darunter wird sie
//    stillschweigend ignoriert, ohne Fehler. Genau deshalb verlangt dieses
//    Projekt in package.json (engines) Node 24 und fährt seine CI darauf: Das
//    ist die Laufzeit, die auch in der ausgelieferten App steckt (Electron 43).
//    Läuft hier je wieder etwas Älteres, wäre dieser Schutz still weg.
import fs from 'node:fs';

/**
 * Text atomar in `ziel` schreiben. Wirft im Fehlerfall weiter — die Aufrufer
 * entscheiden selbst, ob sie das melden oder nur protokollieren.
 */
export function schreibeAtomar(ziel: string, inhalt: string): void {
  const tmp = `${ziel}.tmp`;
  try {
    fs.writeFileSync(tmp, inhalt, { encoding: 'utf-8', flush: true });
    fs.renameSync(tmp, ziel);
  } catch (err) {
    // Angefangene Zwischendatei wegräumen. Ohne das bleibt bei jedem
    // gescheiterten Versuch eine Waise liegen (unter Windows z.B., wenn ein
    // Backup-Programm die Zieldatei offen hält) — und beim nächsten Blick in
    // den Ordner steht da eine „.tmp", die niemand einordnen kann.
    try { fs.rmSync(tmp, { force: true }); } catch { /* dann eben nicht */ }
    throw err;
  }
}
