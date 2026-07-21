// game-service.ts — orchestriert die Chat-Spiele im Main-Prozess (der State
// lebt hier, das Overlay rendert nur). Wertet Chat-Events aus, broadcastet den
// Spielzustand an die Spiel-Widgets und meldet Siege an Studio (→ Punkte/Level).
import type { StudioEvent } from '@botexe/trigger-engine';
import { log } from '../core/logger';
import { QuizGame, type QuizConfig } from './games/quiz';
import { HangmanGame, type HangmanConfig } from './games/hangman';
import { TicTacToeGame } from './games/tic-tac-toe';
import { ConnectFourGame } from './games/connect-four';

export type GameKind = 'quiz' | 'hangman' | 'tic-tac-toe' | 'connect-four';

const LABEL: Record<GameKind, string> = {
  quiz: 'Quiz', hangman: 'Galgenmännchen', 'tic-tac-toe': 'Tic Tac Toe', 'connect-four': '4 Gewinnt',
};

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
  private quizRefill?: () => AutoQuizQuestion[];
  private autoOpts: Required<QuizAutoOptions> = { questionMs: 20000, pauseMs: 6000, winnerMode: 'first' };
  /** Hängt ein (manuell gestartetes) Spiel so lange ohne Eingabe rum, wird es
   *  automatisch beendet — sonst bleibt ein totes Widget im Overlay stehen. */
  private idleMs = 120000;
  /** Wie lange der Endstand (Sieg/Unentschieden) stehen bleibt, bevor bei einem
   *  Duell automatisch eine neue Runde öffnet (bzw. Einzelspiele enden). */
  private resultMs = 12000;
  private autoMode = false;

  constructor(private readonly broadcast: Broadcast, private readonly onWin: (user: WinUser) => void) {}

  /** Quiz VOLLAUTOMATISCH: läuft eine Fragenliste durch — Frage zeigen →
   *  Sammelzeit (questionMs) → automatisch auflösen → Pause (pauseMs) → nächste.
   *  Endet von selbst nach der letzten Frage. Antworten kommen wie gehabt per
   *  Chat (A/B/C/D), kein manuelles Auflösen nötig. */
  startQuizAuto(questions: AutoQuizQuestion[], opts?: QuizAutoOptions, refill?: () => AutoQuizQuestion[]): { ok: boolean; error?: string } {
    if (!questions.length) return { ok: false, error: 'Keine Fragen vorhanden' };
    this.resetPending();
    this.autoMode = true;
    this.autoQueue = [...questions];
    // Optionaler Nachschub: Sind alle Fragen durch, zieht der Callback frische —
    // damit das Quiz endlos weiterläuft, bis der Streamer „Stop" drückt.
    this.quizRefill = refill;
    this.autoOpts = {
      questionMs: Math.max(5000, opts?.questionMs ?? 20000),
      pauseMs: Math.max(2000, opts?.pauseMs ?? 6000),
      winnerMode: opts?.winnerMode ?? 'first',
    };
    this.askNext();
    return { ok: true };
  }

  private askNext(): void {
    // Fragen alle? Nachschub ziehen (Endlos-Quiz), sonst sauber beenden.
    if (this.autoQueue.length === 0 && this.quizRefill) {
      const more = this.quizRefill();
      if (more.length) { this.autoQueue.push(...more); this.logQuiz('neue Runde Fragen gezogen'); }
    }
    const q = this.autoQueue.shift();
    if (!q) { this.stop(); return; }
    const g = new QuizGame();
    g.start({ question: q.q, options: q.options, correctIndex: q.correct, winnerMode: this.autoOpts.winnerMode });
    this.active = { kind: 'quiz', game: g as unknown as GameInstance };
    this.winReported = false;
    this.push();
    this.logQuiz(`Frage „${q.q}" (${this.autoQueue.length} weitere in der Runde)`);
    this.timer = setTimeout(() => {
      this.reveal();
      this.timer = setTimeout(() => this.askNext(), this.autoOpts.pauseMs);
    }, this.autoOpts.questionMs);
  }

  private clearTimer(): void { if (this.timer) { clearTimeout(this.timer); this.timer = undefined; } }

  /** ALLE anstehenden Timer + Auto-Quiz-Zustand verwerfen. Muss VOR jedem
   *  Spielwechsel/Stop laufen, sonst kapert ein alter Timer (Auto-Quiz-Loop oder
   *  Rundenende-Restart) Sekunden später das gerade gestartete Spiel. */
  private resetPending(): void {
    this.clearTimer();
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = undefined; }
    this.autoMode = false;
    this.autoQueue = [];
    this.quizRefill = undefined;
  }

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
    this.resetPending(); // alte Timer/Auto-Quiz-Queue weg, bevor das neue Spiel aktiv wird
    this.active = { kind, game };
    this.winReported = false;
    this.resetIdle();
    this.push();
    const duell = kind === 'tic-tac-toe' || kind === 'connect-four';
    log.info('Spiel', `${LABEL[kind]} gestartet${duell ? ' — „!join" zum Mitspielen' : ''}`);
    return { ok: true };
  }

  /** Inaktivitäts-Timer (neu) starten — nur für manuell gestartete Spiele; das
   *  Auto-Quiz steuert sich über seinen eigenen Takt. */
  private resetIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.autoMode) return;
    this.idleTimer = setTimeout(() => this.onIdle(), this.idleMs);
  }

  /** Inaktivität abgelaufen: Duell-Spiele (Tic Tac Toe / 4 Gewinnt) NICHT beenden,
   *  sondern eine frische Runde öffnen — so bleibt das Widget sichtbar und offen
   *  für neue „!join", ohne dass man es manuell neu starten muss. Einzelspiele
   *  (Galgenmännchen) enden wie bisher. */
  private onIdle(): void {
    const kind = this.active?.kind;
    if (kind === 'tic-tac-toe' || kind === 'connect-four') {
      log.info('Spiel', `${LABEL[kind]}: Inaktivität → frische Runde geöffnet (bleibt im Overlay)`);
      this.start(kind); // öffnet neue Runde + re-armt den Idle-Timer
    } else {
      this.stop();
    }
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
    this.logQuiz(`aufgelöst — Gewinner: ${r.winner ? r.winner.nickname : 'niemand richtig'}`);
    if (r.winner && !this.winReported) {
      this.winReported = true;
      this.onWin({ id: r.winner.userId, nickname: r.winner.nickname });
    }
  }

  stop(): void {
    const kind = this.active?.kind; // vor dem Nullen merken, damit das Clear das
    this.resetPending();            // richtige Widget erreicht (Widgets filtern nach gameKind)
    this.active = null;
    this.broadcast({ kind: 'game-state', gameKind: kind ?? '', state: null });
  }

  /** Auto-Quiz-Ereignisse fürs Log (Frage/Reveal). */
  private logQuiz(msg: string): void { log.info('Spiel', `Quiz: ${msg}`); }

  /** Chat-Event ans aktive Spiel geben; bei State-Änderung broadcasten, bei
   *  Gewinn den Sieger einmalig melden, nach Rundenende automatisch aufräumen. */
  handleChat(event: StudioEvent): void {
    if (!this.active || event.type !== 'chat' || !event.user || !event.text) return;
    const kind = this.active.kind;
    const isJoin = event.text.trim().toLowerCase() === '!join';
    const r = this.active.game.handleChat(event.user.id, event.user.nickname, event.text);
    if (!r?.accepted) {
      // Abgelehntes „!join" bei einem Duell → Feedback (sonst wirkt es, als
      // würde !join gar nicht erkannt — genau der gemeldete Bug).
      if (isJoin && (kind === 'tic-tac-toe' || kind === 'connect-four')) {
        this.broadcast({ kind: 'game-event', gameKind: kind, event: 'join-full', payload: { nickname: event.user.nickname } });
        log.info('Spiel', `${LABEL[kind]}: „!join" von ${event.user.nickname} abgelehnt (Tisch belegt — läuft schon eine Runde)`);
      }
      return;
    }
    this.resetIdle();
    this.push();
    if (r.event === 'join') log.info('Spiel', `${LABEL[kind]}: ${event.user.nickname} macht mit`);

    const st = this.active.game.getState();
    const terminal = st.status === 'won' || st.status === 'draw' || st.status === 'lost';
    if (st.status === 'won' && st.winner && !this.winReported) {
      this.winReported = true;
      const w = st.winner;
      this.onWin({ id: w.userId ?? '', nickname: w.nickname, profilePic: w.profilePic });
      this.broadcast({ kind: 'game-event', gameKind: kind, event: 'win', payload: { winner: w } });
      log.info('Spiel', `${LABEL[kind]}: ${w.nickname} gewinnt 🏆`);
    } else if (terminal) {
      log.info('Spiel', `${LABEL[kind]}: Runde vorbei (${st.status === 'draw' ? 'unentschieden' : st.status})`);
    }
    // Rundenende → NICHT einfrieren: Endstand kurz zeigen, dann bei Duellen
    // automatisch neue Runde öffnen (neue Spieler können „!join"'en), sonst enden.
    if (terminal) this.scheduleAfterRound(kind);
  }

  /** Nach dem Rundenende: Endstand `resultMs` stehen lassen, dann bei Duellen
   *  eine frische Runde öffnen, sonst das Spiel sauber beenden. */
  private scheduleAfterRound(kind: GameKind): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = undefined; }
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (kind === 'tic-tac-toe' || kind === 'connect-four') this.start(kind); // neue Runde, offen für alle
      else { this.stop(); log.info('Spiel', `${LABEL[kind]}: beendet`); }
    }, this.resultMs);
  }

  getState(): { kind: GameKind; state: unknown } | null {
    return this.active ? { kind: this.active.kind, state: this.active.game.getState() } : null;
  }

  private push(): void {
    if (this.active) this.broadcast({ kind: 'game-state', gameKind: this.active.kind, state: this.active.game.getState() });
  }
}
