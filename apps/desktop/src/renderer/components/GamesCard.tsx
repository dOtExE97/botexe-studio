// GamesCard — Steuerung der Chat-Spiele (Live-Seite). Spiel starten/stoppen,
// Quiz auflösen. Der Spielzustand lebt im Main-Prozess; das Overlay-Widget
// (quiz-game / hangman-game / …) rendert ihn live.
import { useState } from 'react';
import { Gamepad2, Play, Square, Eye } from 'lucide-react';
import { toast } from './ToastHost';

type Kind = 'quiz' | 'hangman' | 'tic-tac-toe' | 'connect-four';

export default function GamesCard() {
  const [active, setActive] = useState<Kind | null>(null);
  const [question, setQuestion] = useState('');
  const [opts, setOpts] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [word, setWord] = useState('');

  const start = async (kind: Kind, config?: unknown) => {
    const r = await window.studio.startGame(kind, config) as { ok: boolean; error?: string };
    if (r.ok) { setActive(kind); toast('success', `${LABEL[kind]} gestartet`); }
    else toast('error', r.error ?? 'Start fehlgeschlagen');
  };
  const stop = async () => { await window.studio.stopGame(); setActive(null); toast('info', 'Spiel beendet'); };
  const reveal = async () => { await window.studio.revealGame(); toast('info', 'Quiz aufgelöst'); };

  const startQuiz = () => {
    const options = opts.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || options.length < 2) { toast('warn', 'Frage + mind. 2 Antworten nötig'); return; }
    void start('quiz', { question: question.trim(), options, correctIndex: Math.min(correct, options.length - 1), winnerMode: 'first' });
  };

  return (
    <div className="bx-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Gamepad2 size={16} className="text-studio-accent" /> Chat-Spiele
        {active && <span className="ml-auto flex items-center gap-2 text-xs text-studio-teal">läuft: {LABEL[active]}
          {active === 'quiz' && <button onClick={() => void reveal()} className="rounded bg-studio-raised px-2 py-0.5 text-studio-gold hover:bg-studio-gold hover:text-black"><Eye size={11} className="inline" /> Auflösen</button>}
          <button onClick={() => void stop()} className="rounded bg-studio-raised px-2 py-0.5 hover:bg-studio-accent hover:text-black"><Square size={11} className="inline" /> Stop</button>
        </span>}
      </div>

      {/* Quiz */}
      <div className="mb-3 rounded-lg border border-studio-border p-2.5">
        <div className="mb-1.5 text-xs font-bold text-studio-muted">Quiz</div>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Frage…" className="bx-input mb-1.5 w-full text-sm" />
        <div className="grid grid-cols-2 gap-1.5">
          {opts.map((o, i) => (
            <label key={i} className={`flex items-center gap-1 rounded-md px-1 ${correct === i ? 'ring-1 ring-studio-teal' : ''}`}>
              <input type="radio" checked={correct === i} onChange={() => setCorrect(i)} title="richtige Antwort" />
              <input value={o} onChange={(e) => setOpts((p) => p.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`${'ABCD'[i]}…`} className="bx-input flex-1 text-xs" />
            </label>
          ))}
        </div>
        <button onClick={startQuiz} className="bx-btn-accent mt-2 w-full text-xs"><Play size={11} className="inline" /> Quiz starten</button>
      </div>

      {/* Galgenmännchen */}
      <div className="mb-3 flex items-end gap-2 rounded-lg border border-studio-border p-2.5">
        <label className="flex-1 text-xs font-bold text-studio-muted">Galgenmännchen
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="geheimes Wort…" className="bx-input mt-1 w-full text-sm" />
        </label>
        <button onClick={() => word.trim() ? void start('hangman', { word: word.trim() }) : toast('warn', 'Wort eingeben')} className="bx-btn-accent text-xs"><Play size={11} className="inline" /> Start</button>
      </div>

      {/* Duell-Spiele */}
      <div className="flex gap-2">
        <button onClick={() => void start('tic-tac-toe')} className="flex-1 rounded-lg border border-studio-border py-2 text-xs hover:border-studio-accent/50">⭕ Tic Tac Toe</button>
        <button onClick={() => void start('connect-four')} className="flex-1 rounded-lg border border-studio-border py-2 text-xs hover:border-studio-accent/50">🔴 4 Gewinnt</button>
      </div>
      <p className="mt-2 text-[10px] text-studio-muted">Duell-Spiele: Zuschauer schreiben „!join", dann Feld/Spalte als Zahl. Lege das passende Spiel-Widget ins Overlay.</p>
    </div>
  );
}

const LABEL: Record<Kind, string> = { quiz: 'Quiz', hangman: 'Galgenmännchen', 'tic-tac-toe': 'Tic Tac Toe', 'connect-four': '4 Gewinnt' };
