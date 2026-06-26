// Tic Tac Toe — reines Logik-Modul für den Electron-Main-Prozess.
// Zwei Spieler aus dem Chat treten via "!join" bei (erste 2 verschiedene User
// werden X und O). Züge erfolgen über die Feld-Zahlen "1".."9" (3x3, 1 = oben links).
// KEIN DOM, KEIN Electron, KEIN React — nur deterministische Spiel-Logik.

/** Spieler-Symbol auf dem Brett. */
export type Mark = 'X' | 'O';

/** Eine einzelne Brett-Zelle: leer (null) oder ein Spieler-Symbol. */
export type Cell = Mark | null;

/** Identität eines Chat-Users, der einem Symbol zugeordnet ist. */
export interface Player {
  userId: string;
  nickname: string;
}

/** Lebenszyklus einer Partie. */
export type GameStatus = 'waiting' | 'playing' | 'won' | 'draw';

/** Vollständiger, serialisierbarer Spielzustand für das Overlay/Renderer. */
export interface TicTacToeState {
  /** 9 Zellen, Index 0 = oben links, Index 8 = unten rechts. */
  board: Cell[];
  /** Aktuell zugeordnete Spieler je Symbol. */
  players: { X?: Player; O?: Player };
  /** Wer ist als Nächstes am Zug (auch im Status 'waiting' relevant: startet immer X). */
  turn: Mark;
  status: GameStatus;
  /** Bei status === 'won' gesetzt: der gewinnende Spieler. */
  winner?: Player;
  /** Bei status === 'won' gesetzt: die drei Brett-Indizes der Gewinn-Linie. */
  winLine?: number[];
}

/** Welche Art von Aktion ein Chat-Kommando ausgelöst hat. */
export type ChatEvent = 'join' | 'move' | 'win' | 'draw';

/** Ergebnis von handleChat: ob das Kommando akzeptiert wurde und was passierte. */
export interface ChatResult {
  accepted: boolean;
  event?: ChatEvent;
}

/** Alle 8 möglichen Gewinn-Linien (Reihen, Spalten, Diagonalen) als Brett-Indizes. */
const WIN_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // Reihen
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // Spalten
  [0, 4, 8],
  [2, 4, 6], // Diagonalen
];

export class TicTacToeGame {
  private board: Cell[] = Array(9).fill(null);
  private playerX?: Player;
  private playerO?: Player;
  private currentTurn: Mark = 'X';
  private status: GameStatus = 'waiting';
  private winner?: Player;
  private winLine?: number[];

  /**
   * Verarbeitet eine Chat-Nachricht.
   * - "!join": fügt den User als nächsten freien Spieler hinzu (max 2, keine Duplikate).
   * - "1".."9": ein Zug — nur vom Spieler, der dran ist, und nur auf ein leeres Feld.
   * Whitespace wird getrimmt; alles andere wird ignoriert (accepted: false).
   */
  handleChat(userId: string, nickname: string, text: string): ChatResult {
    const command = text.trim().toLowerCase();

    if (command === '!join') {
      return this.handleJoin(userId, nickname);
    }

    // Feld-Zug: exakt eine Ziffer 1-9.
    if (/^[1-9]$/.test(command)) {
      const fieldIndex = Number(command) - 1;
      return this.handleMove(userId, fieldIndex);
    }

    return { accepted: false };
  }

  /** Fügt einen Spieler hinzu, sofern noch ein Slot frei und der User nicht bereits dabei ist. */
  private handleJoin(userId: string, nickname: string): ChatResult {
    // Beitritt nur, solange noch keine Partie läuft bzw. beendet ist.
    if (this.status !== 'waiting') {
      return { accepted: false };
    }
    // Bereits zugeordneter User darf nicht erneut joinen (auch nicht als zweites Symbol).
    if (this.playerX?.userId === userId || this.playerO?.userId === userId) {
      return { accepted: false };
    }

    if (!this.playerX) {
      this.playerX = { userId, nickname };
    } else if (!this.playerO) {
      this.playerO = { userId, nickname };
      // Beide Spieler stehen fest → Partie startet, X beginnt.
      this.status = 'playing';
      this.currentTurn = 'X';
    } else {
      // Beide Slots belegt.
      return { accepted: false };
    }

    return { accepted: true, event: 'join' };
  }

  /** Setzt einen Zug, prüft Berechtigung, Feld-Belegung und wertet Sieg/Unentschieden aus. */
  private handleMove(userId: string, fieldIndex: number): ChatResult {
    if (this.status !== 'playing') {
      return { accepted: false };
    }

    const activePlayer = this.currentTurn === 'X' ? this.playerX : this.playerO;
    // Nur der Spieler, der gerade am Zug ist, darf setzen.
    if (!activePlayer || activePlayer.userId !== userId) {
      return { accepted: false };
    }
    // Feld muss leer sein.
    if (this.board[fieldIndex] !== null) {
      return { accepted: false };
    }

    this.board[fieldIndex] = this.currentTurn;

    // Sieg prüfen.
    const line = this.findWinningLine(this.currentTurn);
    if (line) {
      this.status = 'won';
      this.winner = activePlayer;
      this.winLine = [...line];
      return { accepted: true, event: 'win' };
    }

    // Unentschieden: Brett voll, kein Sieger.
    if (this.board.every((cell) => cell !== null)) {
      this.status = 'draw';
      return { accepted: true, event: 'draw' };
    }

    // Regulärer Zug → Symbol wechselt.
    this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
    return { accepted: true, event: 'move' };
  }

  /** Liefert die Gewinn-Linie für ein Symbol oder undefined. */
  private findWinningLine(mark: Mark): readonly [number, number, number] | undefined {
    return WIN_LINES.find(
      ([a, b, c]) => this.board[a] === mark && this.board[b] === mark && this.board[c] === mark,
    );
  }

  /** Liefert eine Kopie des aktuellen Zustands (keine internen Referenzen nach außen). */
  getState(): TicTacToeState {
    return {
      board: [...this.board],
      players: {
        ...(this.playerX ? { X: { ...this.playerX } } : {}),
        ...(this.playerO ? { O: { ...this.playerO } } : {}),
      },
      turn: this.currentTurn,
      status: this.status,
      ...(this.winner ? { winner: { ...this.winner } } : {}),
      ...(this.winLine ? { winLine: [...this.winLine] } : {}),
    };
  }

  /** Setzt die Partie vollständig zurück (neues Spiel, keine Spieler). */
  reset(): void {
    this.board = Array(9).fill(null);
    this.playerX = undefined;
    this.playerO = undefined;
    this.currentTurn = 'X';
    this.status = 'waiting';
    this.winner = undefined;
    this.winLine = undefined;
  }
}
