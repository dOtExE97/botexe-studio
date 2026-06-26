import test from 'node:test';
import assert from 'node:assert/strict';
import { TicTacToeGame } from './tic-tac-toe';

/** Hilfsfunktion: zwei Spieler joinen lassen → Partie startet. */
function startGame(): TicTacToeGame {
  const g = new TicTacToeGame();
  g.handleChat('u1', 'Alice', '!join');
  g.handleChat('u2', 'Bob', '!join');
  return g;
}

test('Startzustand: leeres Brett, waiting, X beginnt', () => {
  const g = new TicTacToeGame();
  const s = g.getState();
  assert.deepEqual(s.board, Array(9).fill(null));
  assert.equal(s.status, 'waiting');
  assert.equal(s.turn, 'X');
  assert.equal(s.players.X, undefined);
  assert.equal(s.players.O, undefined);
});

test('!join: erste 2 verschiedene User werden X und O, Partie startet', () => {
  const g = new TicTacToeGame();
  const r1 = g.handleChat('u1', 'Alice', '!join');
  assert.deepEqual(r1, { accepted: true, event: 'join' });
  assert.equal(g.getState().status, 'waiting'); // erst ein Spieler

  const r2 = g.handleChat('u2', 'Bob', '!join');
  assert.deepEqual(r2, { accepted: true, event: 'join' });

  const s = g.getState();
  assert.deepEqual(s.players.X, { userId: 'u1', nickname: 'Alice' });
  assert.deepEqual(s.players.O, { userId: 'u2', nickname: 'Bob' });
  assert.equal(s.status, 'playing');
  assert.equal(s.turn, 'X');
});

test('!join: max 2 Spieler, dritter User wird abgelehnt', () => {
  const g = startGame();
  const r3 = g.handleChat('u3', 'Cara', '!join');
  assert.equal(r3.accepted, false);
  assert.equal(g.getState().players.O?.userId, 'u2');
});

test('!join: derselbe User kann nicht zweimal joinen', () => {
  const g = new TicTacToeGame();
  g.handleChat('u1', 'Alice', '!join');
  const again = g.handleChat('u1', 'Alice', '!join');
  assert.equal(again.accepted, false);
  assert.equal(g.getState().players.O, undefined);
});

test('!join wird getrimmt und ist case-insensitive', () => {
  const g = new TicTacToeGame();
  const r = g.handleChat('u1', 'Alice', '  !JOIN  ');
  assert.deepEqual(r, { accepted: true, event: 'join' });
});

test('Zug nur vom Spieler der dran ist', () => {
  const g = startGame();
  // O versucht zu ziehen, obwohl X dran ist → abgelehnt.
  const wrong = g.handleChat('u2', 'Bob', '1');
  assert.equal(wrong.accepted, false);

  // X zieht korrekt.
  const ok = g.handleChat('u1', 'Alice', '1');
  assert.deepEqual(ok, { accepted: true, event: 'move' });
  assert.equal(g.getState().board[0], 'X');
});

test('Zug nur auf leeres Feld', () => {
  const g = startGame();
  g.handleChat('u1', 'Alice', '1'); // X auf Feld 1
  const blocked = g.handleChat('u2', 'Bob', '1'); // O will dasselbe Feld
  assert.equal(blocked.accepted, false);
  assert.equal(g.getState().board[0], 'X');
  assert.equal(g.getState().turn, 'O'); // Turn nicht verbraucht
});

test('Fremder User (kein Spieler) kann nicht ziehen', () => {
  const g = startGame();
  const r = g.handleChat('u3', 'Cara', '1');
  assert.equal(r.accepted, false);
});

test('Zug vor Spielstart (waiting) wird abgelehnt', () => {
  const g = new TicTacToeGame();
  g.handleChat('u1', 'Alice', '!join');
  const r = g.handleChat('u1', 'Alice', '1');
  assert.equal(r.accepted, false);
});

test('turn wechselt nach jedem gültigen Zug X→O→X', () => {
  const g = startGame();
  assert.equal(g.getState().turn, 'X');
  g.handleChat('u1', 'Alice', '1');
  assert.equal(g.getState().turn, 'O');
  g.handleChat('u2', 'Bob', '5');
  assert.equal(g.getState().turn, 'X');
});

test('ungültiger Text wird ignoriert (accepted false)', () => {
  const g = startGame();
  assert.equal(g.handleChat('u1', 'Alice', 'hallo').accepted, false);
  assert.equal(g.handleChat('u1', 'Alice', '0').accepted, false);
  assert.equal(g.handleChat('u1', 'Alice', '10').accepted, false);
  assert.equal(g.handleChat('u1', 'Alice', '12').accepted, false);
});

// --- Win-Detection: alle 8 Linien ---
// X spielt die Gewinn-Linie, O spielt belanglose Felder dazwischen.
const WIN_LINES: Array<{ name: string; xMoves: [number, number, number]; oFiller: [number, number] }> = [
  { name: 'Reihe oben', xMoves: [1, 2, 3], oFiller: [4, 5] },
  { name: 'Reihe mitte', xMoves: [4, 5, 6], oFiller: [1, 2] },
  { name: 'Reihe unten', xMoves: [7, 8, 9], oFiller: [1, 2] },
  { name: 'Spalte links', xMoves: [1, 4, 7], oFiller: [2, 3] },
  { name: 'Spalte mitte', xMoves: [2, 5, 8], oFiller: [1, 3] },
  { name: 'Spalte rechts', xMoves: [3, 6, 9], oFiller: [1, 2] },
  { name: 'Diagonale ↘', xMoves: [1, 5, 9], oFiller: [2, 3] },
  { name: 'Diagonale ↙', xMoves: [3, 5, 7], oFiller: [1, 2] },
];

for (const { name, xMoves, oFiller } of WIN_LINES) {
  test(`Win-Detection: ${name}`, () => {
    const g = startGame();
    // X1, O-filler1, X2, O-filler2, X3 → X gewinnt im 5. Zug.
    g.handleChat('u1', 'Alice', String(xMoves[0]));
    g.handleChat('u2', 'Bob', String(oFiller[0]));
    g.handleChat('u1', 'Alice', String(xMoves[1]));
    g.handleChat('u2', 'Bob', String(oFiller[1]));
    const winning = g.handleChat('u1', 'Alice', String(xMoves[2]));

    assert.deepEqual(winning, { accepted: true, event: 'win' });
    const s = g.getState();
    assert.equal(s.status, 'won');
    assert.deepEqual(s.winner, { userId: 'u1', nickname: 'Alice' });
    // winLine entspricht den 0-basierten Indizes der X-Felder.
    const expectedLine = xMoves.map((m) => m - 1).sort((a, b) => a - b);
    assert.deepEqual([...(s.winLine ?? [])].sort((a, b) => a - b), expectedLine);
  });
}

test('Nach Sieg sind keine weiteren Züge möglich', () => {
  const g = startGame();
  g.handleChat('u1', 'Alice', '1');
  g.handleChat('u2', 'Bob', '4');
  g.handleChat('u1', 'Alice', '2');
  g.handleChat('u2', 'Bob', '5');
  g.handleChat('u1', 'Alice', '3'); // X gewinnt oben
  const after = g.handleChat('u2', 'Bob', '6');
  assert.equal(after.accepted, false);
  assert.equal(g.getState().status, 'won');
});

test('Draw bei vollem Brett ohne Sieger', () => {
  const g = startGame();
  // Klassische Patt-Stellung:
  // X O X
  // X O O
  // O X X
  // Zugfolge (X beginnt): X1 O2 X3 O5 X4 O6 X8 O7 X9
  const moves: Array<['u1' | 'u2', string]> = [
    ['u1', '1'],
    ['u2', '2'],
    ['u1', '3'],
    ['u2', '5'],
    ['u1', '4'],
    ['u2', '6'],
    ['u1', '8'],
    ['u2', '7'],
    ['u1', '9'],
  ];
  let last;
  for (const [uid, field] of moves) {
    last = g.handleChat(uid, uid === 'u1' ? 'Alice' : 'Bob', field);
  }
  assert.deepEqual(last, { accepted: true, event: 'draw' });
  const s = g.getState();
  assert.equal(s.status, 'draw');
  assert.equal(s.winner, undefined);
  assert.ok(s.board.every((c) => c !== null));
});

test('reset stellt sauberen Startzustand wieder her', () => {
  const g = startGame();
  g.handleChat('u1', 'Alice', '1');
  g.reset();
  const s = g.getState();
  assert.deepEqual(s.board, Array(9).fill(null));
  assert.equal(s.status, 'waiting');
  assert.equal(s.players.X, undefined);
  assert.equal(s.turn, 'X');
});

test('getState liefert Kopien (keine internen Referenzen)', () => {
  const g = startGame();
  const s1 = g.getState();
  s1.board[0] = 'X';
  assert.equal(g.getState().board[0], null, 'externe Mutation darf Brett nicht ändern');
});
