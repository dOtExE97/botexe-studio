// GamesCard — Steuerung der Chat-Spiele (Live-Seite). Das Quiz läuft
// VOLLAUTOMATISCH: Thema wählen, Start — danach laufen Fragen von selbst durch
// (Frage → Sammelzeit → Auflösen → nächste), Antworten kommen per Chat (A/B/C/D).
import { useEffect, useState } from 'react';
import { Gamepad2, Play, Square, Sparkles, Skull } from 'lucide-react';
import { toast } from './ToastHost';

type Kind = 'quiz' | 'hangman' | 'tic-tac-toe' | 'connect-four';
type Theme = { id: string; label: string; count: number };

export default function GamesCard() {
  const [active, setActive] = useState<Kind | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [theme, setTheme] = useState('mix');
  const [rounds, setRounds] = useState(8);
  const [seconds, setSeconds] = useState(20);
  const [word, setWord] = useState('');
  const [bossOn, setBossOn] = useState(false);

  const toggleBoss = async () => {
    if (bossOn) { await window.studio.stopBoss(); setBossOn(false); toast('info', 'Boss-Modus aus'); }
    else { await window.studio.startBoss(); setBossOn(true); toast('success', 'Boss-Modus an — Gifts = Schaden! 💀'); }
  };

  useEffect(() => {
    void (window.studio.quizThemes() as Promise<Theme[]>).then(setThemes).catch(() => { /* Themen-Liste optional */ });
  }, []);

  const start = async (kind: Kind, config?: unknown) => {
    const r = await window.studio.startGame(kind, config) as { ok: boolean; error?: string };
    if (r.ok) { setActive(kind); toast('success', `${LABEL[kind]} gestartet`); }
    else toast('error', r.error ?? 'Start fehlgeschlagen');
  };
  const stop = async () => { await window.studio.stopGame(); setActive(null); toast('info', 'Spiel beendet'); };

  const startQuiz = async () => {
    const r = await window.studio.startQuizAuto(theme, { rounds, questionMs: seconds * 1000 }) as { ok: boolean; error?: string };
    if (r.ok) { setActive('quiz'); toast('success', `Auto-Quiz „${themes.find((t) => t.id === theme)?.label ?? theme}" läuft`); }
    else toast('error', r.error ?? 'Quiz konnte nicht starten');
  };

  return (
    <div className="bx-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Gamepad2 size={16} className="text-studio-accent" /> Chat-Spiele
        {active && <span className="ml-auto flex items-center gap-2 text-xs text-studio-teal">läuft: {LABEL[active]}
          <button onClick={() => void stop()} className="rounded bg-studio-raised px-2 py-0.5 hover:bg-studio-accent hover:text-black"><Square size={11} className="inline" /> Stop</button>
        </span>}
      </div>

      {/* Auto-Quiz */}
      <div className="mb-3 rounded-lg border border-studio-border p-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-studio-muted"><Sparkles size={12} className="text-studio-gold" /> Auto-Quiz — läuft von selbst, Chat antwortet mit A/B/C/D</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-studio-muted">Thema
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="bx-input mt-1 w-full text-sm">
              {themes.map((t) => <option key={t.id} value={t.id}>{t.label} ({t.count})</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-studio-muted">Fragen
              <input type="number" min={1} max={50} value={rounds} onChange={(e) => setRounds(Math.max(1, +e.target.value || 1))} className="bx-input mt-1 w-full text-sm" />
            </label>
            <label className="text-[11px] text-studio-muted">Sek/Frage
              <input type="number" min={5} max={120} value={seconds} onChange={(e) => setSeconds(Math.max(5, +e.target.value || 5))} className="bx-input mt-1 w-full text-sm" />
            </label>
          </div>
        </div>
        <button onClick={() => void startQuiz()} disabled={!themes.length} className="bx-btn-accent mt-2 w-full text-xs disabled:opacity-50"><Play size={11} className="inline" /> Auto-Quiz starten</button>
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

      {/* Stream-Boss */}
      <button onClick={() => void toggleBoss()} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition ${bossOn ? 'bg-studio-accent text-black' : 'border border-studio-border hover:border-studio-accent/50'}`}>
        <Skull size={13} /> {bossOn ? 'Boss-Modus läuft — aus' : 'Stream-Boss starten (Gifts = Schaden)'}
      </button>
      <p className="mt-1.5 text-[10px] text-studio-muted">Boss-Modus: jedes Gift macht Schaden (nach Coins). Bei Kill gibt's einen Moment + stärkeren Boss. „Stream-Boss"-Widget ins Overlay legen.</p>
    </div>
  );
}

const LABEL: Record<Kind, string> = { quiz: 'Quiz', hangman: 'Galgenmännchen', 'tic-tac-toe': 'Tic Tac Toe', 'connect-four': '4 Gewinnt' };
