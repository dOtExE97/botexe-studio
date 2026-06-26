// quiz.ts — Quiz-Spiel als reiner State-Automat (kein DOM, kein Electron).
// Der Stream-Chat stimmt mit A/B/C/D bzw. !a..!d ab; nach reveal() wird der
// Gewinner ermittelt. Math.random ist über einen injizierbaren rng testbar.
//
// State-Maschine:
//   idle ──start()──▶ question ──reveal()──▶ reveal ──cooldown()──▶ cooldown
//     ▲                                                                 │
//     └──────────────────── reset()/stop() ◀────────────────────────────┘
//
// Votes werden NUR im 'question'-State angenommen; pro User zählt die erste
// Antwort. voteCounts verrät vor reveal() NICHT, welche Option richtig ist.

/** Mögliche Zustände des Quiz-Automaten. */
export type QuizState = 'idle' | 'question' | 'locked' | 'reveal' | 'cooldown';

/** Gewinner-Auswahl: erster richtiger Vote oder ein zufälliger unter den Richtigen. */
export type QuizWinnerMode = 'first' | 'random';

/** Konfiguration einer Quiz-Runde. 2–4 Optionen, correctIndex zeigt auf die richtige. */
export interface QuizConfig {
  question: string;
  options: string[];
  correctIndex: number;
  winnerMode: QuizWinnerMode;
}

/** Eine abgegebene Stimme (erste Antwort eines Users zählt). */
export interface QuizVote {
  userId: string;
  nickname: string;
  /** 0-basierter Options-Index (A=0, B=1, …). */
  optionIndex: number;
}

/** Ein Gewinner — minimaler User-Bezug fürs spätere Moment/Overlay. */
export interface QuizWinner {
  userId: string;
  nickname: string;
}

/** Rückgabe von handleChat(): wurde die Nachricht als Vote gewertet? */
export interface QuizChatResult {
  accepted: boolean;
}

/** Rückgabe von reveal(): aufgedeckte richtige Antwort + Gewinner (oder null). */
export interface QuizRevealResult {
  state: QuizState;
  correctIndex: number;
  winner: QuizWinner | null;
}

/** Öffentlicher Zustand fürs UI. voteCounts pro Option, ohne die richtige zu verraten. */
export interface QuizPublicState {
  state: QuizState;
  question: string;
  options: string[];
  totalVotes: number;
  voteCounts: number[];
}

/** Injizierbarer Zufallsgenerator (Default: Math.random), liefert [0,1). */
export type QuizRng = () => number;

/** Parst eine Chat-Nachricht zu einem Options-Index (A/B/C/D bzw. !a..!d).
 *  Case-insensitiv, führende/folgende Leerzeichen erlaubt. Sonst null. */
export function parseVote(text: string, optionCount: number): number | null {
  // Erlaubt: "A", " a ", "!A", "!a". Genau ein Buchstabe, optional mit '!'.
  const match = /^\s*!?\s*([a-d])\s*$/i.exec(text);
  if (!match) return null;
  const letter = match[1];
  if (letter === undefined) return null;
  const index = letter.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0); // a→0 … d→3
  if (index < 0 || index >= optionCount) return null; // nur existierende Optionen
  return index;
}

/** Quiz-Spiel: reiner State-Automat. Keine Seiteneffekte außer internem State. */
export class QuizGame {
  private state: QuizState = 'idle';
  private config: QuizConfig | null = null;
  /** Erste Antwort pro userId (spätere Antworten werden ignoriert). */
  private readonly votes = new Map<string, QuizVote>();
  private readonly rng: QuizRng;

  constructor(rng: QuizRng = Math.random) {
    this.rng = rng;
  }

  /** Startet eine Runde mit der gegebenen Config und wechselt nach 'question'. */
  start(config: QuizConfig): void {
    if (config.options.length < 2 || config.options.length > 4) {
      throw new Error('QuizConfig: options müssen 2–4 Einträge haben');
    }
    if (config.correctIndex < 0 || config.correctIndex >= config.options.length) {
      throw new Error('QuizConfig: correctIndex liegt außerhalb der Optionen');
    }
    this.config = config;
    this.votes.clear();
    this.state = 'question';
  }

  /** Wertet eine Chat-Nachricht aus. Nimmt Votes nur im 'question'-State an;
   *  pro User zählt die erste gültige Antwort. */
  handleChat(userId: string, nickname: string, text: string): QuizChatResult {
    if (this.state !== 'question' || this.config === null) return { accepted: false };
    const optionIndex = parseVote(text, this.config.options.length);
    if (optionIndex === null) return { accepted: false };
    if (this.votes.has(userId)) return { accepted: false }; // erste Antwort zählt
    this.votes.set(userId, { userId, nickname, optionIndex });
    return { accepted: true };
  }

  /** Deckt die richtige Antwort auf, ermittelt den Gewinner und wechselt nach
   *  'reveal'. Optionaler rng überschreibt für diesen Aufruf den Default. */
  reveal(rng?: QuizRng): QuizRevealResult {
    if (this.config === null) {
      return { state: this.state, correctIndex: -1, winner: null };
    }
    const correctIndex = this.config.correctIndex;
    const correctVotes = [...this.votes.values()].filter((v) => v.optionIndex === correctIndex);
    const winner = this.pickWinner(correctVotes, rng ?? this.rng);
    this.state = 'reveal';
    return { state: this.state, correctIndex, winner };
  }

  /** Wählt den Gewinner gemäß winnerMode. 'first' = erster richtiger Vote
   *  (Map bewahrt Einfügereihenfolge), 'random' = einer der Richtigen via rng. */
  private pickWinner(correctVotes: QuizVote[], rng: QuizRng): QuizWinner | null {
    if (correctVotes.length === 0) return null;
    const mode = this.config?.winnerMode ?? 'first';
    if (mode === 'first') {
      const first = correctVotes[0];
      return first ? { userId: first.userId, nickname: first.nickname } : null;
    }
    // 'random': Index aus [0, length) — rng auf gültigen Bereich klemmen.
    const raw = rng();
    const bounded = raw >= 1 ? 0.999999 : raw < 0 ? 0 : raw;
    const idx = Math.floor(bounded * correctVotes.length);
    const pick = correctVotes[idx];
    return pick ? { userId: pick.userId, nickname: pick.nickname } : null;
  }

  /** Wechselt nach 'cooldown' (z.B. kurze Pause vor der nächsten Runde). */
  cooldown(): void {
    if (this.state === 'reveal') this.state = 'cooldown';
  }

  /** Öffentlicher Zustand fürs UI. voteCounts pro Option in Options-Reihenfolge. */
  getState(): QuizPublicState {
    const options = this.config?.options ?? [];
    const voteCounts = options.map(() => 0);
    for (const vote of this.votes.values()) {
      const current = voteCounts[vote.optionIndex];
      if (current !== undefined) voteCounts[vote.optionIndex] = current + 1;
    }
    return {
      state: this.state,
      question: this.config?.question ?? '',
      options: [...options],
      totalVotes: this.votes.size,
      voteCounts,
    };
  }

  /** Setzt das Spiel komplett zurück (zurück nach 'idle', Config + Votes weg). */
  reset(): void {
    this.state = 'idle';
    this.config = null;
    this.votes.clear();
  }

  /** Alias für reset() — beendet die laufende Runde. */
  stop(): void {
    this.reset();
  }
}
