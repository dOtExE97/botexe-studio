// Wächter: Die Anleitung nennt Chat-Befehle. Ändert sich die Spiel-Logik, muss
// der Text mitziehen — sonst schreiben Zuschauer einen Befehl, den es nicht mehr
// gibt, und das Spiel wirkt kaputt.
//
// Dieselbe Fehlerklasse wie überall heute: dasselbe Wissen an zwei Stellen.
// Hier lässt es sich nicht zu EINER Quelle zusammenführen (Prosa vs. Regex),
// also prüft der Test, dass die genannten Befehle in der Logik wirklich vorkommen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SPIEL_ANLEITUNGEN } from './GameGuide';
import { parseVote } from '../../main/services/games/quiz';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');
const SPIELE = join(SRC, 'main', 'services', 'games');

function logik(datei: string): string {
  const p = join(SPIELE, `${datei}.ts`);
  return existsSync(p) ? readFileSync(p, 'utf-8') : '';
}

test('Quiz: jede erklärte Antwort-Eingabe wird wirklich als Stimme gewertet', () => {
  // Echt geprüft statt im Quelltext gesucht: Das Quiz erkennt Stimmen über ein
  // Muster, die einzelnen Buchstaben stehen nirgends wörtlich im Code. Eine
  // Textsuche hätte hier fälschlich Alarm geschlagen.
  const erklaert = SPIEL_ANLEITUNGEN.quiz?.chat.flatMap((c) => c.befehl.split(/\s+/)) ?? [];
  for (const eingabe of erklaert) {
    assert.notEqual(parseVote(eingabe, 4), null, `„${eingabe}" steht in der Anleitung, zählt aber nicht als Stimme`);
  }
  // Gegenprobe: Unsinn zählt weiterhin nicht.
  assert.equal(parseVote('vielleicht', 4), null);
  assert.equal(parseVote('!e', 4), null, 'nur so viele Optionen wie es gibt');
});

test('die übrigen Spiele: jeder erklärte !-Befehl kommt in der Logik vor', () => {
  const fehlend: string[] = [];
  for (const [spiel, a] of Object.entries(SPIEL_ANLEITUNGEN)) {
    if (spiel === 'quiz') continue;   // oben schon echt geprüft
    const quelle = logik(spiel);
    if (!quelle) continue;            // boss hat keine eigene Datei
    for (const c of a.chat) {
      for (const befehl of c.befehl.split(/\s+/).filter((w) => w.startsWith('!'))) {
        if (!quelle.toLowerCase().includes(befehl.toLowerCase())) fehlend.push(`${spiel}: ${befehl}`);
      }
    }
  }
  assert.deepEqual(
    fehlend,
    [],
    `Diese Befehle stehen in der Anleitung, aber nicht mehr in der Spiel-Logik:\n  ${fehlend.join('\n  ')}`,
  );
});

test('jedes Spiel mit eigener Logik hat eine Anleitung', () => {
  const ohne = ['quiz', 'hangman', 'tic-tac-toe', 'connect-four'].filter((s) => !SPIEL_ANLEITUNGEN[s]);
  assert.deepEqual(ohne, [], `Diesen Spielen fehlt die Anleitung: ${ohne.join(', ')}`);
});

test('jede Anleitung nennt Start, Chat, Widget und Ablauf', () => {
  for (const [spiel, a] of Object.entries(SPIEL_ANLEITUNGEN)) {
    assert.ok(a.start.length > 20, `${spiel}: Start-Erklärung zu knapp`);
    assert.ok(a.chat.length > 0, `${spiel}: keine Chat-Zeile`);
    assert.ok(a.widget.length > 0, `${spiel}: kein Widget genannt`);
    assert.ok(a.ablauf.length > 30, `${spiel}: Ablauf zu knapp`);
  }
});
