// TelemetryConsent — beim allerersten Start fragt die App EINMAL, ob sie
// anonyme Absturzberichte senden darf (Sentry). Erscheint nur, solange die
// Einstellung `telemetry === 'unset'` ist; jede Antwort speichert die Wahl.
// Danach jederzeit unter Einstellungen → „Feedback & Fehler melden" änderbar.
import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

export default function TelemetryConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    void window.studio
      ?.getSettings?.()
      .then((s: { telemetry?: 'unset' | 'on' | 'off' }) => setShow((s?.telemetry ?? 'unset') === 'unset'));
  }, []);

  if (!show) return null;

  const decide = (choice: 'on' | 'off') => {
    setShow(false);
    void window.studio.updateSettings({ telemetry: choice });
  };

  return (
    <div
      className="bx-card z-[1002] flex max-w-sm items-start gap-3 border-studio-teal/50 px-4 py-3 text-sm"
      style={{ position: 'fixed', bottom: '1rem', right: '1rem', animation: 'bx-toast-in 220ms cubic-bezier(.2,1.4,.35,1)' }}
    >
      <ShieldCheck size={18} className="mt-0.5 flex-none text-studio-teal" />
      <div className="flex-1">
        <div className="font-bold text-studio-text">Hilfst du mit, Fehler zu finden?</div>
        <div className="mt-0.5 text-xs text-studio-muted">
          bOtExE Studio kann bei einem Absturz eine anonyme Meldung senden.
          <b className="text-studio-text"> Keine persönlichen Daten, keine Keys</b> — alles Sensible
          wird vorher entfernt. Du kannst das jederzeit in den Einstellungen ändern.
        </div>
        {/* Wichtig zu sagen: Der Melder startet nur BEIM Programmstart mit — ein
            „Ja" wirkt also erst nach dem nächsten Öffnen. Ohne diesen Hinweis
            denkt man, es läuft sofort, und wundert sich über leere Berichte. */}
        <div className="mt-1.5 text-[11px] text-studio-muted/80">
          Ein „Ja" wird sofort gespeichert und greift beim nächsten App-Start.
        </div>
        <div className="mt-2.5 flex gap-2">
          <button onClick={() => decide('on')} className="bx-btn-accent text-xs">
            Ja, gerne
          </button>
          <button
            onClick={() => decide('off')}
            className="rounded-md bg-studio-raised px-3 py-1 text-xs font-bold text-studio-muted hover:text-studio-text"
          >
            Nein, danke
          </button>
        </div>
      </div>
      <button
        onClick={() => decide('off')}
        className="flex-none text-studio-muted hover:text-studio-text"
        title="Nein"
      >
        <X size={15} />
      </button>
    </div>
  );
}
