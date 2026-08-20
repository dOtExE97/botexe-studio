// tts-verdrahtung.test.ts — sind die Schutzmechanismen auch EINGEBAUT?
//
// WARUM ES DIESE DATEI GIBT
// Die Filter in tts-filter.ts sind reine Funktionen und einzeln gut getestet.
// Nur sagt ein grüner Test dort nichts darüber, ob die Funktion überhaupt
// AUFGERUFEN wird. Genau das ist beim Bauen passiert: Der Nachlieferungs-Schutz
// wurde in studio.ts versuchsweise abgeklemmt — alle 31 Filtertests blieben
// grün. Ein Schutz, den niemand aufruft, ist keiner.
//
// Dieselbe Lehre wie bei bus-reihenfolge.test.ts. Deshalb hier Prüfungen auf
// den QUELLTEXT: Sie beantworten die Frage „wird es benutzt?", die ein
// Funktionstest nicht beantworten kann.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

/** Quelltext ohne Kommentarzeilen — ein auskommentierter Aufruf enthält die
 *  gesuchte Zeichenkette weiterhin und käme bei reiner Textsuche durch. */
function echterCode(datei: string): string {
  return readFileSync(datei, 'utf-8')
    .split('\n')
    .filter((z) => !z.trim().startsWith('//') && !z.trim().startsWith('*'))
    .join('\n');
}

test('der Nachlieferungs-Schutz wird beim Chat-Vorlesen wirklich aufgerufen', () => {
  const studio = echterCode(join(SRC, 'main', 'services', 'studio.ts'));
  assert.match(studio, /istNachlieferung\(this\.verbundenSeit/,
    'Ohne diesen Aufruf liest die App nach jedem Neuverbinden den nachgelieferten '
    + 'Chat vor — eine halbe Minute Nachrichten von vor fünf Minuten.');
  assert.match(studio, /this\.verbundenSeit = Date\.now\(\)/,
    'Der Zeitpunkt muss beim Verbinden gesetzt werden, sonst greift der Schutz nie.');
});

test('die Sperre der Sprach-Leitung wird wirklich abgefragt', () => {
  const prov = echterCode(join(SRC, 'main', 'services', 'tts-providers.ts'));
  assert.match(prov, /if \(leitungGesperrtBis > Date\.now\(\)\)/,
    'Ohne diese Abfrage kostet JEDE Ansage erneut bis zu 10 Sekunden Wartezeit '
    + 'auf eine Leitung, die nachweislich nicht antwortet.');
  assert.match(prov, /leitungGesperrtBis = Date\.now\(\) \+ LEITUNG_SPERRE_MS/,
    'Die Sperre muss auch gesetzt werden, nicht nur abgefragt.');
});

test('der Herzschlag der TikTok-Leitung wird beim Verbinden gestartet', () => {
  const cloud = echterCode(join(SRC, 'main', 'adapters', 'tiktok-cloud.ts'));
  assert.match(cloud, /this\.starteHerzschlag\(ws\)/,
    'Ohne Start bleibt es beim alten Zustand: Ein Abriss fällt erst nach fünf '
    + 'Minuten auf, statt nach Sekunden.');
  // Und er muss auch wieder aufhören — sonst bleibt ein Timer zurück.
  assert.match(cloud, /disconnect\(\): void \{\s*\n\s*this\.stoppeHerzschlag\(\);/,
    'Beim Trennen muss der Takt gestoppt werden.');
});

test('der Herzschlag der Sprach-Leitung wird beim Verbinden gestartet', () => {
  const dauer = echterCode(join(SRC, 'main', 'services', 'edge-dauerleitung.ts'));
  assert.match(dauer, /this\.planeHerzschlag\(ws\)/,
    'Sonst räumen Router und Anbieter die stille Leitung weg, und die nächste '
    + 'Ansage muss neu aufbauen.');
  assert.match(dauer, /this\.stoppeHerzschlag\(\)/,
    'Beim Wegwerfen der Leitung muss der Takt aufhören.');
});
