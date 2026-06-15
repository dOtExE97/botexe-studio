// TriggerLogCard.tsx — Live-Protokoll: welcher Trigger wann warum gefeuert hat.
// Zeigt die letzten Auslösungen (Regel → Aktion, mit Grund + Uhrzeit) und hilft
// beim Debuggen („warum kam der Sound nicht?"). Speist sich aus onTriggerLog.
import { useEffect, useRef, useState } from 'react';
import { Zap, Trash2 } from 'lucide-react';

interface LogEntry { id: string; at: number; rule: string; action: string; reason: string }
const MAX = 60;

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export default function TriggerLogCard() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const off = window.studio.onTriggerLog((e) => {
      if (seen.current.has(e.id)) return; // Doppelte (OBS+TTLS doppelt) ignorieren
      seen.current.add(e.id);
      setEntries((cur) => [e, ...cur].slice(0, MAX));
    });
    return off;
  }, []);

  return (
    <section className="bx-card flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-studio-border px-4 py-2.5">
        <Zap size={14} className="text-studio-gold" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">Trigger-Protokoll</h2>
        {entries.length > 0 && (
          <button
            onClick={() => { seen.current.clear(); setEntries([]); }}
            className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-studio-muted hover:text-studio-accent"
            title="Protokoll leeren"
          >
            <Trash2 size={12} /> Leeren
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {entries.length === 0 && (
          <p className="py-8 text-center text-xs text-studio-muted">
            Noch nichts gefeuert. Sobald ein Trigger auslöst (oder du oben „Test" drückst), erscheint hier, was warum passiert ist.
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex items-baseline gap-2 px-1 py-0.5 text-[12px]">
            <span className="flex-none font-mono text-[10px] text-studio-muted">{clock(e.at)}</span>
            <span className="clip-slant flex-none bg-studio-accent/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-studio-accent">
              {e.action}
            </span>
            <span className="flex-none font-semibold text-studio-text/90">{e.rule}</span>
            <span className="min-w-0 truncate text-studio-muted">· {e.reason}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
