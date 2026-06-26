import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectFourGame, type Disc } from './connect-four';

/** Lässt R und Y beitreten, gibt das gestartete Spiel zurück. */
function started(): ConnectFourGame {
  const g = new ConnectFourGame();
  g.handleChat('u1', 'Rot', '!join');
  g.handleChat('u2', 'Gelb', '!join');
  return g;
}

test('join: maximal 2 Spieler, dritter wird abgelehnt, Spiel startet bei 2', () => {
  const g = new ConnectFourGame();
  assert.equal(g.getState().status, 'waiting');

  const a = g.handleChat('u1', 'Rot', '!join');
  assert.deepEqual(a, { accepted: true, event: 'join' });
  assert.equal(g.getState().status, 'waiting');

  const b = g.handleChat('u2', 'Gelb', '!join');
  assert.deepEqual(b, { accepted: true, event: 'join' });
  assert.equal(g.getState().status, 'playing');
  assert.equal(g.getState().players.R?.userId, 'u1');
  assert.equal(g.getState().players.Y?.userId, 'u2');

  // Dritter abgelehnt.
  const c = g.handleChat('u3', 'Grün', '!join');
  assert.equal(c.accepted, false);
  // Doppel-Join desselben Users abgelehnt.
  assert.equal(g.handleChat('u1', 'Rot', '!join').accepted, false);
});

test('Drop-Mechanik: Stein landet ganz unten (Reihe 5)', () => {
  const g = started();
  const r = g.handleChat('u1', 'Rot', '4'); // Spalte 4 → Index 3
  assert.deepEqual(r, { accepted: true, event: 'move' });

  const board = g.getState().board;
  assert.equal(board[5]?.[3], 'R', 'liegt auf unterster Reihe');
  assert.equal(board[4]?.[3], null, 'darüber noch leer');

  // Zweiter Stein in dieselbe Spalte stapelt darauf.
  g.handleChat('u2', 'Gelb', '4');
  assert.equal(g.getState().board[4]?.[3], 'Y');
  assert.equal(g.getState().board[5]?.[3], 'R');
});

test('nur der Spieler am Zug darf setzen; fremder Zug abgelehnt', () => {
  const g = started();
  assert.equal(g.getState().turn, 'R');
  // Y versucht zu setzen, obwohl R dran ist.
  assert.equal(g.handleChat('u2', 'Gelb', '1').accepted, false);
  // R setzt korrekt → danach ist Y dran.
  assert.equal(g.handleChat('u1', 'Rot', '1').event, 'move');
  assert.equal(g.getState().turn, 'Y');
});

test('volle Spalte wird abgelehnt', () => {
  const g = started();
  // Spalte 1 (Index 0) sechsmal füllen, abwechselnd.
  const users = ['u1', 'u2'];
  for (let i = 0; i < 6; i++) {
    const turn = g.getState().turn;
    const uid = turn === 'R' ? users[0]! : users[1]!;
    const res = g.handleChat(uid, 'x', '1');
    assert.equal(res.accepted, true, `Wurf ${i} sollte greifen`);
  }
  // Brett-Spalte 0 ist voll.
  const board = g.getState().board;
  for (let r = 0; r < 6; r++) assert.notEqual(board[r]?.[0], null);

  // Siebter Wurf in dieselbe Spalte → abgelehnt.
  const turn = g.getState().turn;
  const uid = turn === 'R' ? 'u1' : 'u2';
  assert.equal(g.handleChat(uid, 'x', '1').accepted, false);
});

test('Win horizontal: R legt vier nebeneinander', () => {
  const g = started();
  // R: Spalten 1,2,3,4 — Y dazwischen in oberer Lage (Spalte 1..3 erneut,
  // landet jeweils auf Reihe 4, stört die untere R-Reihe nicht).
  // Zugfolge: R1, Y1, R2, Y2, R3, Y3, R4 → vier R auf Reihe 5.
  g.handleChat('u1', 'Rot', '1');
  g.handleChat('u2', 'Gelb', '1');
  g.handleChat('u1', 'Rot', '2');
  g.handleChat('u2', 'Gelb', '2');
  g.handleChat('u1', 'Rot', '3');
  g.handleChat('u2', 'Gelb', '3');
  const win = g.handleChat('u1', 'Rot', '4');

  assert.deepEqual(win, { accepted: true, event: 'win' });
  const st = g.getState();
  assert.equal(st.status, 'won');
  assert.equal(st.winner?.userId, 'u1');
  assert.equal(st.winCells?.length, 4);
  // Alle Gewinn-Zellen auf Reihe 5, Spalten 0..3.
  const cols = (st.winCells ?? []).map((c) => c[1]).sort((a, b) => a - b);
  assert.deepEqual(cols, [0, 1, 2, 3]);
  assert.ok((st.winCells ?? []).every((c) => c[0] === 5));

  // Nach Gewinn keine weiteren Züge.
  assert.equal(g.handleChat('u2', 'Gelb', '5').accepted, false);
});

test('Win vertikal: R stapelt vier in einer Spalte', () => {
  const g = started();
  // R immer Spalte 3, Y immer Spalte 5 (stört nicht).
  g.handleChat('u1', 'Rot', '3');
  g.handleChat('u2', 'Gelb', '5');
  g.handleChat('u1', 'Rot', '3');
  g.handleChat('u2', 'Gelb', '5');
  g.handleChat('u1', 'Rot', '3');
  g.handleChat('u2', 'Gelb', '5');
  const win = g.handleChat('u1', 'Rot', '3');

  assert.equal(win.event, 'win');
  const st = g.getState();
  assert.equal(st.winner?.userId, 'u1');
  // Vier in Spalte 2 (Index), Reihen 5,4,3,2.
  const rows = (st.winCells ?? []).map((c) => c[0]).sort((a, b) => a - b);
  assert.deepEqual(rows, [2, 3, 4, 5]);
  assert.ok((st.winCells ?? []).every((c) => c[1] === 2));
});

test('Win diagonal: R bildet aufsteigende Diagonale ↗', () => {
  const g = started();
  // Aufbau einer Diagonale R bei (5,0),(4,1),(3,2),(2,3).
  // R, Y wechseln sich ab; Y-Steine bilden den „Unterbau".
  g.handleChat('u1', 'Rot', '1'); // R (5,0)
  g.handleChat('u2', 'Gelb', '2'); // Y (5,1)
  g.handleChat('u1', 'Rot', '2'); // R (4,1)
  g.handleChat('u2', 'Gelb', '3'); // Y (5,2)
  g.handleChat('u1', 'Rot', '4'); // R (5,3) – wird gleich überdeckt
  g.handleChat('u2', 'Gelb', '3'); // Y (4,2)
  g.handleChat('u1', 'Rot', '3'); // R (3,2)
  g.handleChat('u2', 'Gelb', '4'); // Y (4,3)
  g.handleChat('u1', 'Rot', '4'); // R (3,3) – Füllstein
  g.handleChat('u2', 'Gelb', '5'); // Y irgendwo (5,4)
  const win = g.handleChat('u1', 'Rot', '4'); // R (2,3) schließt Diagonale

  assert.equal(win.event, 'win', 'Diagonale sollte gewinnen');
  const st = g.getState();
  assert.equal(st.winner?.userId, 'u1');
  assert.equal(st.winCells?.length, 4);
  // Erwartete Diagonale (5,0),(4,1),(3,2),(2,3).
  const sorted = (st.winCells ?? [])
    .map((c) => `${c[0]},${c[1]}`)
    .sort();
  assert.deepEqual(sorted, ['2,3', '3,2', '4,1', '5,0']);
});

test('Draw: volles Brett ohne Gewinner', () => {
  const g = started();
  // Ein vorab verifiziertes volles Brett OHNE jede Viererreihe und mit
  // ausgeglichener Steinzahl (21×R, 21×Y), sodass strikte R/Y-Alternation es
  // tatsächlich aufbauen kann. Pro Spalte von UNTEN (Index 0) nach OBEN (5).
  const colPattern: Record<number, Disc[]> = {
    0: ['R', 'Y', 'R', 'Y', 'R', 'Y'],
    1: ['Y', 'R', 'R', 'Y', 'R', 'R'],
    2: ['R', 'R', 'Y', 'R', 'R', 'Y'],
    3: ['R', 'R', 'Y', 'Y', 'Y', 'R'],
    4: ['Y', 'Y', 'R', 'R', 'R', 'Y'],
    5: ['Y', 'Y', 'R', 'Y', 'Y', 'Y'],
    6: ['Y', 'Y', 'R', 'R', 'R', 'Y'],
  };

  // Wir treiben das Brett direkt über die öffentliche API in den gewünschten
  // Zustand. Da handleChat strikte Zugreihenfolge erzwingt, bauen wir einen
  // Sonder-Spielverlauf: für jeden gewünschten Stein lassen wir den jeweils
  // am Zug befindlichen Spieler in die Zielspalte werfen – die Zielspalten
  // sind so gewählt, dass die Farbe pro Wurf zur Reihenfolge passt.
  // Einfacher und robust: wir spielen Spalte für Spalte von unten nach oben
  // und nutzen, dass handleChat alternierend R/Y vergibt. Damit die Farbe
  // stimmt, ordnen wir die Würfe global in R/Y-Alternation an.

  // Sammle alle (col, disc, rowFromBottom) Wünsche.
  type Drop = { col: number; disc: Disc; height: number };
  const drops: Drop[] = [];
  for (let col = 0; col < 7; col++) {
    const pat = colPattern[col]!;
    for (let h = 0; h < 6; h++) {
      drops.push({ col, disc: pat[h]!, height: h });
    }
  }
  // Pro Spalte müssen Würfe von unten (h=0) nach oben (h=5) erfolgen.
  // Wir verarbeiten in Runden: solange noch Steine fehlen, sucht der Spieler
  // am Zug eine Spalte, deren nächster benötigter Stein seine Farbe hat.
  const placed: number[] = Array.from({ length: 7 }, () => 0); // Höhe je Spalte
  const total = 42;
  let safety = 0;
  while (placed.reduce((a, b) => a + b, 0) < total && safety < 500) {
    safety++;
    const turn = g.getState().turn;
    const uid = turn === 'R' ? 'u1' : 'u2';
    // Finde Spalte, deren nächster Stein (Höhe placed[col]) == turn.
    let chosen = -1;
    for (let col = 0; col < 7; col++) {
      if (placed[col]! >= 6) continue;
      const needed = colPattern[col]![placed[col]!]!;
      if (needed === turn) {
        chosen = col;
        break;
      }
    }
    assert.notEqual(chosen, -1, 'es muss immer einen passenden Zug geben');
    const res = g.handleChat(uid, 'x', String(chosen + 1));
    assert.equal(res.accepted, true);
    placed[chosen]!++;
    // Sobald das Brett voll ist, muss das letzte Event 'draw' sein.
    if (placed.reduce((a, b) => a + b, 0) === total) {
      assert.equal(res.event, 'draw', 'volles Brett ohne Vierer → draw');
    } else {
      assert.notEqual(res.event, 'win', 'kein vorzeitiger Gewinn erwartet');
    }
  }

  const st = g.getState();
  assert.equal(st.status, 'draw');
  assert.equal(st.winner, undefined);
  // Brett wirklich voll.
  assert.ok(st.board.every((row) => row.every((cell) => cell !== null)));
});
