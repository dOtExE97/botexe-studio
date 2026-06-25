// UpdateBanner — sobald ein Update heruntergeladen wurde (Auto-Update im
// Hintergrund), erscheint unten rechts ein persistentes Banner: direkt neu
// starten (installiert + öffnet wieder) oder „Später" (Update greift beim
// nächsten regulären Schließen). Ersetzt den früheren, flüchtigen Toast.
import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

export default function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const off = window.studio?.onUpdateStatus?.((s) => {
      if (s.state === 'downloaded') {
        setVersion(s.version ?? '');
        setDismissed(false); // neues Update → Banner wieder zeigen
      }
    });
    return () => off?.();
  }, []);

  if (version === null || dismissed) return null;

  const label = version ? `Update bereit${/^v/i.test(version) ? ` (${version})` : ` (v${version})`}` : 'Update bereit';

  return (
    <div
      className="bx-card fixed bottom-4 right-4 z-[1001] flex max-w-sm items-start gap-3 border-studio-accent/50 px-4 py-3 text-sm"
      style={{ animation: 'bx-toast-in 220ms cubic-bezier(.2,1.4,.35,1)' }}
    >
      <Sparkles size={18} className="mt-0.5 flex-none text-studio-accent" />
      <div className="flex-1">
        <div className="font-bold text-studio-text">{label}</div>
        <div className="mt-0.5 text-xs text-studio-muted">
          Jetzt neu starten, um die neue Version zu nutzen — oder später beim Schließen.
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() => { setRestarting(true); void window.studio.installUpdate(); }}
            disabled={restarting}
            className="bx-btn-accent text-xs disabled:opacity-60"
          >
            {restarting ? 'Starte neu…' : 'Jetzt neu starten'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-md bg-studio-raised px-3 py-1 text-xs font-bold text-studio-muted hover:text-studio-text"
          >
            Später
          </button>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="flex-none text-studio-muted hover:text-studio-text"
        title="Ausblenden"
      >
        <X size={15} />
      </button>
    </div>
  );
}
