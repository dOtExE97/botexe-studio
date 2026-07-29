// Wächter: Ein Dateiformat muss an DREI Stellen bekannt sein, sonst scheitert
// es an einer davon — und zwar unterschiedlich hässlich:
//   • Datei-Dialog (main.ts): fehlt es, kann man die Datei nicht mal auswählen
//   • Bibliothek (media-library.ts): fehlt es, wird der Import still verworfen
//   • Server (overlay-server.ts): fehlt der MIME-Typ, lädt das Video im
//     Overlay nicht — und das merkt man erst im Stream
//
// Genau daran hing, dass MOV-Dateien sich nicht hinzufügen ließen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

const mainQuelle = readFileSync(join(SRC, 'main.ts'), 'utf-8');
const bibliothek = readFileSync(join(SRC, 'main', 'services', 'media-library.ts'), 'utf-8');
const server = readFileSync(join(SRC, 'main', 'adapters', 'overlay-server.ts'), 'utf-8');

/** Endungen aus einem `new Set([...])` im Quelltext lesen. */
function endungenAus(quelle: string, variable: string): string[] {
  const m = new RegExp(`${variable} = new Set\\(\\[([^\\]]*)\\]`).exec(quelle);
  if (!m?.[1]) return [];
  return [...m[1].matchAll(/'\.(\w+)'/g)].map((x) => x[1] as string);
}

test('jedes Format der Bibliothek steht auch im Datei-Dialog', () => {
  const alle = [...endungenAus(bibliothek, 'IMAGE_EXT'), ...endungenAus(bibliothek, 'VIDEO_EXT')];
  assert.ok(alle.length >= 6, `nur ${alle.length} Formate gefunden — Auslesen kaputt?`);

  const dialog = /extensions: \[([^\]]*)\]/.exec(mainQuelle.slice(mainQuelle.indexOf("name: 'Medien'")));
  const imDialog = [...(dialog?.[1] ?? '').matchAll(/'(\w+)'/g)].map((x) => x[1]);

  const fehlend = alle.filter((e) => !imDialog.includes(e));
  assert.deepEqual(fehlend, [], `Diese Formate akzeptiert die Bibliothek, aber der Datei-Dialog zeigt sie nicht: ${fehlend.join(', ')}`);
});

test('jedes Video-Format hat einen MIME-Typ im Server', () => {
  // Ohne MIME-Typ liefert der Server das Video als „application/octet-stream"
  // aus — der Browser weigert sich dann, es abzuspielen.
  const videos = endungenAus(bibliothek, 'VIDEO_EXT');
  const fehlend = videos.filter((e) => !new RegExp(`'\\.${e}': 'video/`).test(server));
  assert.deepEqual(fehlend, [], `Diesen Video-Formaten fehlt der MIME-Typ im Server: ${fehlend.join(', ')}`);
});

test('MOV ist erlaubt — der Fall, der die Lücke aufgedeckt hat', () => {
  assert.ok(endungenAus(bibliothek, 'VIDEO_EXT').includes('mov'));
  assert.match(server, /'\.mov': 'video\/quicktime'/);
});
