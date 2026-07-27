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
    // P2-3-Audit: onUpdateStatus liefert nur PUSHES vom main-Prozess. Der
    // Push „downloaded" kommt oft VOR diesem Mount (Auto-Update läuft im
    // Hintergrund, während der Renderer neu erzeugt wird — z.B. nach einem
    // Reload oder wenn das Fenster neu geöffnet wird) und geht dann ins
    // Leere: kein Banner, obwohl main den Zustand längst kennt (`updateState`
    // in main.ts). Der Streamer erfährt so nie, dass ein Neustart ansteht.
    // Fix (analog zum Platform-Status-Pull in useStudio.ts, commit 65c3a35):
    // zusätzlich zum Push den Ist-Stand EINMAL abholen (Pull), mit demselben
    // „pushedSincePull"-Wächter — kommt zwischen Subscribe und Pull-Antwort
    // noch ein echter Push rein, gewinnt IMMER der (neuere) Push.
    let pushedSincePull = false;
    const off = window.studio?.onUpdateStatus?.((s) => {
      pushedSincePull = true;
      if (s.state === 'downloaded') {
        setVersion(s.version ?? '');
        setDismissed(false); // neues Update → Banner wieder zeigen
      }
    });
    void window.studio?.getUpdateStatus?.().then((s) => {
      if (pushedSincePull || !s || s.state !== 'downloaded') return;
      setVersion(s.version ?? '');
      setDismissed(false);
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
