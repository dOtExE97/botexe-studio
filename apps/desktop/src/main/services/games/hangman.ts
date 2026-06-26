// hangman.ts — Galgenmännchen/Wort-Raten als reines Logik-Modul (Main-Prozess).
// Kein DOM, kein Electron, keine Seiteneffekte. Chat steuert das Spiel ein.

/** Konfiguration für eine Hangman-Runde. */
export interface HangmanConfig {
  /** Das zu erratende Wort (wird intern uppercase normalisiert). */
  word: string;
  /** Maximale Fehlversuche bis "lost". Default: 6. */
  maxWrong?: number;
}

/** Spielstatus einer Runde. */
export type HangmanStatus = 'playing' | 'won' | 'lost';

/** Wer zuletzt einen gültigen Tipp abgegeben hat. */
export interface HangmanGuesser {
  userId: string;
  nickname: string;
}

/** Vollständiger, serialisierbarer Zustand für UI/Overlay. */
export interface HangmanState {
  /** Maskiertes Wort, Zeichen durch Leerzeichen getrennt, z.B. "_ A _ _ E". */
  masked: string;
  /** Anzahl bisheriger Fehlversuche. */
  wrong: number;
  /** Erlaubte Fehlversuche. */
  maxWrong: number;
  /** Bereits geratene Einzelbuchstaben (uppercase, in Rate-Reihenfolge). */
  guessed: string[];
  status: HangmanStatus;
  /** Letzter Spieler, dessen Tipp akzeptiert wurde (Treffer, Fehler oder !guess). */
  lastGuesser?: HangmanGuesser;
}

/** Ergebnis eines Chat-Inputs. */
export interface HangmanChatResult {
  /** true, wenn der Input das Spiel verändert hat (gewertet wurde). */
  accepted: boolean;
  /** Bei akzeptiertem Buchstaben/Wort: ob er getroffen hat. */
  hit?: boolean;
}

// Nur Buchstaben gelten als ratbare Positionen; alles andere bleibt sichtbar.
const istBuchstabe = (zeichen: string): boolean => /^[A-ZÄÖÜ]$/u.test(zeichen);

/**
 * Galgenmännchen-Spiel. Eine Instanz hält genau eine laufende Runde.
 * Neuer Aufruf von start() setzt die Runde zurück.
 */
export class HangmanGame {
  // Zielwort, uppercase. Enthält ggf. Nicht-Buchstaben (Bindestrich, Leerzeichen).
  private word = '';
  private maxWrong = 6;
  private wrong = 0;
  // Geratene Einzelbuchstaben in Reihenfolge (uppercase).
  private guessed: string[] = [];
  // Per !guess komplett aufgedeckt?
  private solvedByGuess = false;
  private lastGuesser: HangmanGuesser | undefined;

  /** Startet/erneuert eine Runde. Wort wird uppercase normalisiert. */
  start(config: HangmanConfig): void {
    this.word = (config.word ?? '').toUpperCase();
    this.maxWrong = config.maxWrong ?? 6;
    this.wrong = 0;
    this.guessed = [];
    this.solvedByGuess = false;
    this.lastGuesser = undefined;
  }

  /**
   * Verarbeitet eine Chat-Nachricht: einzelner Buchstabe ODER "!guess WORT".
   * Während status !== 'playing' wird nichts mehr akzeptiert.
   */
  handleChat(userId: string, nickname: string, text: string): HangmanChatResult {
    if (this.getStatus() !== 'playing') return { accepted: false };

    const roh = (text ?? '').trim();
    if (roh.length === 0) return { accepted: false };

    // !guess WORT — kompletter Lösungsversuch.
    const guessMatch = /^!guess\s+(.+)$/iu.exec(roh);
    if (guessMatch) {
      const versuch = (guessMatch[1] ?? '').trim().toUpperCase();
      const treffer = versuch === this.word;
      if (treffer) {
        this.solvedByGuess = true;
      } else {
        this.wrong += 1;
      }
      this.lastGuesser = { userId, nickname };
      return { accepted: true, hit: treffer };
    }

    // Einzelner Buchstabe.
    const buchstabe = roh.toUpperCase();
    if (buchstabe.length !== 1 || !istBuchstabe(buchstabe)) {
      return { accepted: false };
    }
    // Bereits geraten → ignorieren.
    if (this.guessed.includes(buchstabe)) {
      return { accepted: false };
    }

    this.guessed.push(buchstabe);
    const treffer = this.word.includes(buchstabe);
    if (!treffer) {
      this.wrong += 1;
    }
    this.lastGuesser = { userId, nickname };
    return { accepted: true, hit: treffer };
  }

  /** Liefert den aktuellen, serialisierbaren Zustand. */
  getState(): HangmanState {
    const state: HangmanState = {
      masked: this.buildMasked(),
      wrong: this.wrong,
      maxWrong: this.maxWrong,
      guessed: [...this.guessed],
      status: this.getStatus(),
    };
    if (this.lastGuesser) state.lastGuesser = { ...this.lastGuesser };
    return state;
  }

  // Maskierte Darstellung: aufgedeckte Buchstaben/Nicht-Buchstaben sichtbar, sonst "_".
  // Bei won (egal wie) wird das volle Wort gezeigt.
  private buildMasked(): string {
    const aufgedeckt = this.getStatus() === 'won';
    const zeichen = [...this.word].map((c) => {
      if (!istBuchstabe(c)) return c; // Bindestrich/Leerzeichen immer sichtbar
      if (aufgedeckt || this.guessed.includes(c)) return c;
      return '_';
    });
    return zeichen.join(' ');
  }

  // Alle ratbaren Buchstaben aufgedeckt?
  private allesAufgedeckt(): boolean {
    if (this.word.length === 0) return false;
    for (const c of this.word) {
      if (istBuchstabe(c) && !this.guessed.includes(c)) return false;
    }
    return true;
  }

  private getStatus(): HangmanStatus {
    if (this.solvedByGuess || this.allesAufgedeckt()) return 'won';
    if (this.wrong >= this.maxWrong) return 'lost';
    return 'playing';
  }
}
