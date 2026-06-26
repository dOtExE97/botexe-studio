// connect-four.ts — reines Spiel-Logik-Modul für „4 Gewinnt" im Chat.
// Kein DOM, kein Electron, kein React — nur deterministische TypeScript-Logik
// für den Main-Prozess. Die Integration (IPC, Overlay, Chat-Routing) macht der
// Hauptentwickler später; dieses Modul kennt nur Brett, Spieler und Züge.
//
// Brett: 7 Spalten × 6 Reihen. Reihe 0 = OBEN, Reihe 5 = UNTEN.
// Steine fallen also in die höchste freie Reihe (größter Index) einer Spalte.

/** Spielstein-Farbe bzw. Spieler. R beginnt immer. */
export type Disc = 'R' | 'Y';

/** Eine Brett-Zelle: leer (null) oder belegt durch einen Spieler. */
export type Cell = Disc | null;

/** Spielstatus über den gesamten Lebenszyklus einer Partie. */
export type GameStatus = 'waiting' | 'playing' | 'won' | 'draw';

/** Ein angemeldeter Spieler — identifiziert über die Chat-User-ID. */
export interface Player {
  userId: string;
  nickname: string;
}

/** Eine Brett-Position als [Reihe, Spalte]. */
export type CellRef = [row: number, col: number];

/** Vollständiger, serialisierbarer Zustand für UI/Overlay. */
export interface ConnectFourState {
  /** board[Reihe][Spalte], Reihe 0 = oben. 6 Reihen × 7 Spalten. */
  board: Cell[][];
  /** Belegte Sitze. R wird zuerst vergeben, dann Y. */
  players: { R?: Player; Y?: Player };
  /** Wer aktuell am Zug ist (auch im Wartezustand definiert, dann R). */
  turn: Disc;
  status: GameStatus;
  /** Gesetzt sobald status === 'won'. */
  winner?: Player;
  /** Die vier (oder mehr) Gewinn-Zellen, gesetzt sobald status === 'won'. */
  winCells?: CellRef[];
}

/** Ergebnis-Event eines verarbeiteten Chat-Befehls. */
export type ChatEvent = 'join' | 'move' | 'win' | 'draw';

/** Rückgabe von handleChat: ob der Befehl griff und was er auslöste. */
export interface ChatResult {
  accepted: boolean;
  event?: ChatEvent;
}

const COLS = 7;
const ROWS = 6;
const NEED = 4; // wie viele Steine in Folge zum Gewinn

/** Vier Suchrichtungen (die jeweilige Gegenrichtung wird mitgeprüft):
 *  horizontal, vertikal, Diagonale ↘, Diagonale ↙. */
const DIRECTIONS: ReadonlyArray<CellRef> = [
  [0, 1], // →
  [1, 0], // ↓
  [1, 1], // ↘
  [1, -1], // ↙
];

export class ConnectFourGame {
  private board: Cell[][];
  private playerR?: Player;
  private playerY?: Player;
  private turn: Disc = 'R';
  private status: GameStatus = 'waiting';
  private winner?: Player;
  private winCells?: CellRef[];

  constructor() {
    this.board = ConnectFourGame.emptyBoard();
  }

  private static emptyBoard(): Cell[][] {
    return Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => null as Cell),
    );
  }

  /** Verarbeitet eine Chat-Zeile. Erkennt „!join" und reine Spaltenzahlen
   *  („1".."7"). Alles andere wird ignoriert (accepted: false). */
  handleChat(userId: string, nickname: string, text: string): ChatResult {
    const trimmed = text.trim().toLowerCase();

    if (trimmed === '!join') {
      return this.tryJoin(userId, nickname);
    }

    // Spalte 1..7 (1-basiert im Chat) → 0-basiert intern.
    if (/^[1-7]$/.test(trimmed)) {
      const col = Number(trimmed) - 1;
      return this.tryMove(userId, col);
    }

    return { accepted: false };
  }

  private tryJoin(userId: string, nickname: string): ChatResult {
    // Nur im Wartezustand kann man beitreten.
    if (this.status !== 'waiting') return { accepted: false };
    // Wer schon sitzt, joint nicht doppelt.
    if (this.playerR?.userId === userId || this.playerY?.userId === userId) {
      return { accepted: false };
    }

    if (!this.playerR) {
      this.playerR = { userId, nickname };
    } else if (!this.playerY) {
      this.playerY = { userId, nickname };
      // Zweiter Spieler komplett → Partie startet, R beginnt.
      this.status = 'playing';
      this.turn = 'R';
    } else {
      // Beide Sitze belegt → max. 2.
      return { accepted: false };
    }

    return { accepted: true, event: 'join' };
  }

  private tryMove(userId: string, col: number): ChatResult {
    if (this.status !== 'playing') return { accepted: false };

    // Nur der Spieler, der am Zug ist, darf setzen.
    const active = this.turn === 'R' ? this.playerR : this.playerY;
    if (!active || active.userId !== userId) return { accepted: false };

    const row = this.lowestEmptyRow(col);
    if (row === -1) return { accepted: false }; // Spalte voll

    const boardRow = this.board[row];
    if (!boardRow) return { accepted: false };
    boardRow[col] = this.turn;

    // Gewinn rund um den gerade gesetzten Stein prüfen.
    const win = this.findWin(row, col, this.turn);
    if (win) {
      this.status = 'won';
      this.winner = active;
      this.winCells = win;
      return { accepted: true, event: 'win' };
    }

    if (this.isBoardFull()) {
      this.status = 'draw';
      return { accepted: true, event: 'draw' };
    }

    // Zugwechsel.
    this.turn = this.turn === 'R' ? 'Y' : 'R';
    return { accepted: true, event: 'move' };
  }

  /** Höchster freier Reihenindex (von unten gefüllt) oder -1 wenn Spalte voll. */
  private lowestEmptyRow(col: number): number {
    for (let r = ROWS - 1; r >= 0; r--) {
      const boardRow = this.board[r];
      if (boardRow && boardRow[col] === null) return r;
    }
    return -1;
  }

  private isBoardFull(): boolean {
    const top = this.board[0];
    if (!top) return false;
    return top.every((cell) => cell !== null);
  }

  /** Sucht durch (row,col) verlaufende Viererreihen in allen vier Achsen.
   *  Gibt die belegten Gewinn-Zellen zurück oder null. */
  private findWin(row: number, col: number, disc: Disc): CellRef[] | null {
    for (const [dr, dc] of DIRECTIONS) {
      const line: CellRef[] = [[row, col]];

      // In Richtung verlängern.
      this.extend(line, row, col, dr, dc, disc);
      // In Gegenrichtung verlängern.
      this.extend(line, row, col, -dr, -dc, disc);

      if (line.length >= NEED) return line;
    }
    return null;
  }

  /** Hängt fortlaufend gleichfarbige Zellen ab (row,col) in Richtung (dr,dc) an. */
  private extend(
    line: CellRef[],
    row: number,
    col: number,
    dr: number,
    dc: number,
    disc: Disc,
  ): void {
    let r = row + dr;
    let c = col + dc;
    while (this.cellAt(r, c) === disc) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }
  }

  /** Sichere Brett-Abfrage; außerhalb des Bretts → null. */
  private cellAt(row: number, col: number): Cell {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    const boardRow = this.board[row];
    return boardRow ? boardRow[col] ?? null : null;
  }

  /** Tiefe Kopie des aktuellen Zustands (kein Leak interner Referenzen). */
  getState(): ConnectFourState {
    const state: ConnectFourState = {
      board: this.board.map((r) => r.slice()),
      players: {
        ...(this.playerR ? { R: { ...this.playerR } } : {}),
        ...(this.playerY ? { Y: { ...this.playerY } } : {}),
      },
      turn: this.turn,
      status: this.status,
    };
    if (this.winner) state.winner = { ...this.winner };
    if (this.winCells) state.winCells = this.winCells.map((c) => [c[0], c[1]]);
    return state;
  }
}
