// game-service.ts — orchestriert die Chat-Spiele im Main-Prozess (der State
// lebt hier, das Overlay rendert nur). Wertet Chat-Events aus, broadcastet den
// Spielzustand an die Spiel-Widgets und meldet Siege an Studio (→ Punkte/Level).
import type { StudioEvent } from '@botexe/trigger-engine';
import { QuizGame, type QuizConfig } from './games/quiz';
import { HangmanGame, type HangmanConfig } from './games/hangman';
import { TicTacToeGame } from './games/tic-tac-toe';
import { ConnectFourGame } from './games/connect-four';

export type GameKind = 'quiz' | 'hangman' | 'tic-tac-toe' | 'connect-four';

/** Eine Quiz-Frage (entkoppelt von quiz-questions.ts, damit der Service ohne die
 *  generierten Fragenpools kompiliert). */
export interface AutoQuizQuestion { q: string; options: string[]; correct: number }
export interface QuizAutoOptions { questionMs?: number; pauseMs?: number; winnerMode?: 'first' | 'random' }

/** Gemeinsamer Nenner aller Spiel-Klassen, den der Service nutzt. */
interface GameInstance {
  handleChat(userId: string, nickname: string, text: string): { accepted: boolean; event?: string };
  getState(): { status?: string; winner?: { userId?: string; nickname: string; profilePic?: string } } & Record<string, unknown>;
}

type Broadcast = (msg:
  | { kind: 'game-state'; gameKind: string; state: unknown }
  | { kind: 'game-event'; gameKind: string; event: string; payload?: unknown }) => void;
type WinUser = { id: string; nickname: string; profilePic?: string };

export class GameService {
  private active: { kind: GameKind; game: GameInstance } | null = null;
  private winReported = false;
  private timer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private autoQueue: AutoQuizQuestion[] = [];
  private autoOpts: Required<QuizAutoOptions> = { questionMs: 20000, pauseMs: 6000, winnerMode: 'first' };
  /** Hängt ein (manuell gestartetes) Spiel so lange ohne Eingabe rum, wird es
   *  automatisch beendet — sonst bleibt ein totes Widget im Overlay stehen. */
  private idleMs = 120000;
  private autoMode = false;

  constructor(private readonly broadcast: Broadcast, private readonly onWin: (user: WinUser) => void) {}

  /** Quiz VOLLAUTOMATISCH: läuft eine Fragenliste durch — Frage zeigen →
   *  Sammelzeit (questionMs) → automatisch auflösen → Pause (pauseMs) → nächste.
   *  Endet von selbst nach der letzten Frage. Antworten kommen wie gehabt per
   *  Chat (A/B/C/D), kein manuelles Auflösen nötig. */
  startQuizAuto(questions: AutoQuizQuestion[], opts?: QuizAutoOptions): { ok: boolean; error?: string } {
    if (!questions.length) return { ok: false, error: 'Keine Fragen vorhanden' };
    this.clearTimer();
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = undefined; }
    this.autoMode = true;
    this.autoQueue = [...questions];
    this.autoOpts = {
      questionMs: Math.max(5000, opts?.questionMs ?? 20000),
      pauseMs: Math.max(2000, opts?.pauseMs ?? 6000),
      winnerMode: opts?.winnerMode ?? 'first',
    };
    this.askNext();
    return { ok: true };
  }

  private askNext(): void {
    const q = this.autoQueue.shift();
    if (!q) { this.stop(); return; }
    const g = new QuizGame();
    g.start({ question: q.q, options: q.options, correctIndex: q.correct, winnerMode: this.autoOpts.winnerMode });
    this.active = { kind: 'quiz', game: g as unknown as GameInstance };
    this.winReported = false;
    this.push();
    this.timer = setTimeout(() => {
      this.reveal();
      this.timer = setTimeout(() => this.askNext(), this.autoOpts.pauseMs);
    }, this.autoOpts.questionMs);
  }

  private clearTimer(): void { if (this.timer) { clearTimeout(this.timer); this.timer = undefined; } }

  /** Spiel starten (ersetzt ein laufendes). config je nach Spiel (quiz/hangman). */
  start(kind: GameKind, config?: unknown): { ok: boolean; error?: string } {
    let game: GameInstance;
    try {
      if (kind === 'quiz') { const g = new QuizGame(); g.start(config as QuizConfig); game = g as unknown as GameInstance; }
      else if (kind === 'hangman') { const g = new HangmanGame(); g.start(config as HangmanConfig); game = g as unknown as GameInstance; }
      else if (kind === 'tic-tac-toe') game = new TicTacToeGame() as unknown as GameInstance;
      else if (kind === 'connect-four') game = new ConnectFourGame() as unknown as GameInstance;
      else return { ok: false, error: 'Unbekanntes Spiel' };
    } catch (err) { return { ok: false, error: (err as Error).message }; }
    this.active = { kind, game };
    this.winReported = false;
    this.autoMode = false;
    this.resetIdle();
    this.push();
    return { ok: true };
  }

  /** Inaktivitäts-Timer (neu) starten — nur für manuell gestartete Spiele; das
   *  Auto-Quiz steuert sich über seinen eigenen Takt. */
  private resetIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.autoMode) return;
    this.idleTimer = setTimeout(() => this.stop(), this.idleMs);
  }

  /** Quiz auflösen (eigener Schritt, da das Quiz nicht von selbst gewinnt). */
  reveal(): void {
    if (this.active?.kind !== 'quiz') return;
    const g = this.active.game as unknown as QuizGame;
    const r = g.reveal();
    this.broadcast({ kind: 'game-event', gameKind: 'quiz', event: 'reveal', payload: r });
    // getState() versteckt correctIndex/winner absichtlich (damit sie vor dem
    // Auflösen nicht durchsickern) — beim Reveal reichern wir den game-state
    // damit an, sonst zeigt das Widget die richtige Antwort + Gewinner nicht.
    this.broadcast({ kind: 'game-state', gameKind: 'quiz', state: { ...g.getState(), correctIndex: r.correctIndex, winner: r.winner } });
    // Sieg nur EINMAL melden (sonst doppelte Punkte/Level bei wiederholtem
    // reveal, z.B. Doppelklick auf „Auflösen") — gleicher Guard wie handleChat.
    if (r.winner && !this.winReported) {
      this.winReported = true;
      this.onWin({ id: r.winner.userId, nickname: r.winner.nickname });
    }
  }

  stop(): void {
    this.clearTimer();
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = undefined; }
    this.autoMode = false;
    this.autoQueue = [];
    this.active = null;
    this.broadcast({ kind: 'game-state', gameKind: '', state: null });
  }

  /** Chat-Event ans aktive Spiel geben; bei State-Änderung broadcasten, bei
   *  Gewinn (status 'won') den Sieger einmalig melden. */
  handleChat(event: StudioEvent): void {
    if (!this.active || event.type !== 'chat' || !event.user || !event.text) return;
    const r = this.active.game.handleChat(event.user.id, event.user.nickname, event.text);
    if (!r?.accepted) return;
    this.resetIdle();
    this.push();
    const st = this.active.game.getState();
    // Spiel entschieden → Inaktivitäts-Timer aus (Ergebnis bleibt stehen, bis
    // ein neues Spiel startet oder manuell gestoppt wird).
    if ((st.status === 'won' || st.status === 'draw') && this.idleTimer) {
      clearTimeout(this.idleTimer); this.idleTimer = undefined;
    }
    if (st.status === 'won' && st.winner && !this.winReported) {
      this.winReported = true;
      const w = st.winner;
      this.onWin({ id: w.userId ?? '', nickname: w.nickname, profilePic: w.profilePic });
      this.broadcast({ kind: 'game-event', gameKind: this.active.kind, event: 'win', payload: { winner: w } });
    }
  }

  getState(): { kind: GameKind; state: unknown } | null {
    return this.active ? { kind: this.active.kind, state: this.active.game.getState() } : null;
  }

  private push(): void {
    if (this.active) this.broadcast({ kind: 'game-state', gameKind: this.active.kind, state: this.active.game.getState() });
  }
}
