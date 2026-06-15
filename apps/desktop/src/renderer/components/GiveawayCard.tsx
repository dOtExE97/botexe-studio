// GiveawayCard.tsx — Cockpit für Verlosungen: Beitritt aktivieren, Join-Wort +
// Eintrittskosten einstellen, Teilnehmer live zählen, Gewinner ziehen/zurücksetzen.
// Die Ziehung animiert im Overlay-Widget „Giveaway / Verlosung".
import { useEffect, useState } from 'react';
import { Gift, Dices, RotateCcw } from 'lucide-react';
import { toast } from './ToastHost';

interface State { enabled: boolean; joinWord: string; entryCost: number; count: number; lastWinner: string }

export default function GiveawayCard() {
  const [st, setSt] = useState<State>({ enabled: false, joinWord: '!join', entryCost: 0, count: 0, lastWinner: '' });
  const [drawing, setDrawing] = useState(false);

  const refresh = () => void window.studio.giveawayState().then((s) => setSt(s as State));
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 2000); // Teilnehmerzahl live mitzählen
    return () => clearInterval(iv);
  }, []);

  const patch = (p: Partial<State>) => {
    setSt((s) => ({ ...s, ...p }));
    void window.studio.giveawayConfig(p);
  };
  const draw = async () => {
    setDrawing(true);
    const res = (await window.studio.giveawayDraw()) as { ok: boolean; winner?: string };
    setDrawing(false);
    if (!res.ok) { toast('warn', 'Noch keine Teilnehmer — lass Zuschauer erst beitreten.'); return; }
    toast('success', `🎉 Gewinner: ${res.winner}`);
    refresh();
  };
  const reset = () => { void window.studio.giveawayReset(); toast('info', 'Verlosung zurückgesetzt.'); refresh(); };

  return (
    <section className="bx-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gift size={18} className="text-studio-teal" />
        <h3 className="font-display text-sm uppercase tracking-wider">Giveaway / Verlosung</h3>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={st.enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="accent-[#21e6c1]" />
          Beitritt aktiv
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] uppercase tracking-wider text-studio-muted">
          Join-Wort
          <input className="bx-input mt-1" value={st.joinWord}
            onChange={(e) => setSt((s) => ({ ...s, joinWord: e.target.value }))}
            onBlur={(e) => patch({ joinWord: e.target.value.trim() || '!join' })} />
        </label>
        <label className="text-[11px] uppercase tracking-wider text-studio-muted">
          Eintritt (Punkte)
          <input type="number" min={0} className="bx-input mt-1 font-mono" value={st.entryCost}
            onChange={(e) => setSt((s) => ({ ...s, entryCost: Math.max(0, Number(e.target.value)) }))}
            onBlur={(e) => patch({ entryCost: Math.max(0, Number(e.target.value)) })} />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="bx-pill px-4 py-2 font-display text-lg">
          <span className="text-studio-teal">{st.count}</span> <span className="text-xs text-studio-muted">Teilnehmer</span>
        </div>
        <button onClick={() => void draw()} disabled={drawing || st.count === 0}
          className="bx-pill flex items-center gap-2 px-4 py-2 font-display hover:text-studio-gold disabled:opacity-40">
          <Dices size={16} /> Gewinner ziehen
        </button>
        <button onClick={reset} title="Teilnehmer zurücksetzen"
          className="bx-pill flex items-center gap-2 px-3 py-2 hover:text-studio-accent">
          <RotateCcw size={15} />
        </button>
      </div>

      {st.lastWinner && <p className="mt-2 text-xs text-studio-muted">Letzter Gewinner: <b className="text-studio-gold">{st.lastWinner}</b></p>}
      <p className="mt-2 text-[11px] text-studio-muted/70">
        Zuschauer schreiben <b>{st.joinWord}</b> im Chat zum Beitreten{st.entryCost > 0 ? ` (kostet ${st.entryCost} Punkte)` : ''}.
        Füge im Editor das Widget „Giveaway / Verlosung" hinzu, damit die Ziehung im Overlay sichtbar ist.
      </p>
    </section>
  );
}
