// SetupChecklist — „So geht's los" mit ECHTEN Häkchen statt statischem Text.
// Die 4 Schritte prüfen sich alle paar Sekunden selbst über getDiagnostics:
// Key gespeichert? Widgets im Overlay? Browser-Quelle verbunden? TikTok dran?
// Jeder offene Schritt hat den EINEN Knopf, der ihn löst. Zusätzlich wacht die
// Komponente im Live-Betrieb: verbunden + Widgets da + 0 Quellen = das Overlay
// ist im Stream unsichtbar → roter Alarm (unabhängig vom Ausblenden der Liste).
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, X, Copy, AlertTriangle } from 'lucide-react';
import { toast } from './ToastHost';

interface Diag {
  keySet: boolean;
  activeLayers: number;
  clientCount: number;
  overlayUrl: string;
}

const DISMISS_KEY = 'bx-setup-dismissed';

export default function SetupChecklist({ connected }: { connected: boolean }) {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [alarmIgnored, setAlarmIgnored] = useState(() => sessionStorage.getItem('bx-source-alarm-ignored') === '1');
  // Alarm erst nach 2 Messungen in Folge — sonst flackert er bei jedem
  // OBS-Szenenwechsel/Reconnect der Browser-Quelle kurz auf.
  const zeroStreak = useRef(0);
  const [alarm, setAlarm] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void (window.studio.getDiagnostics() as Promise<Diag>).then((d) => {
        if (!alive) return;
        setDiag(d);
        const invisible = connected && d.activeLayers > 0 && d.clientCount === 0;
        zeroStreak.current = invisible ? zeroStreak.current + 1 : 0;
        setAlarm(zeroStreak.current >= 2);
      }).catch(() => { /* Diagnose optional */ });
    };
    load();
    const t = setInterval(load, 4000);
    // Key-Assistent hat gespeichert → Häkchen sofort, nicht erst beim nächsten Tick.
    const onKeySaved = () => load();
    window.addEventListener('bx-key-saved', onKeySaved);
    // „?" im Seitenkopf blendet die ausgeblendete Liste wieder ein.
    const onShow = () => { setDismissed(false); localStorage.removeItem(DISMISS_KEY); };
    window.addEventListener('bx-setup-show', onShow);
    return () => { alive = false; clearInterval(t); window.removeEventListener('bx-key-saved', onKeySaved); window.removeEventListener('bx-setup-show', onShow); };
  }, [connected]);

  if (!diag) return null;

  const steps: { done: boolean; label: string; action?: { label: string; run: () => void }; hint?: string }[] = [
    {
      done: diag.keySet,
      label: 'Gratis-Key holen (einmalig, 2 Min)',
      action: { label: '🔑 Key-Assistent', run: () => window.dispatchEvent(new CustomEvent('bx-key-wizard')) },
    },
    {
      done: diag.activeLayers > 0,
      label: 'Widgets ins Overlay legen',
      action: { label: 'Zum Overlay →', run: () => window.dispatchEvent(new CustomEvent('bx-navigate', { detail: 'overlay' })) },
    },
    {
      done: diag.clientCount > 0,
      label: 'Overlay-Link als Browser-Quelle in OBS / TikTok Live Studio',
      action: {
        label: 'Link kopieren',
        run: () => { void window.studio.copyText(diag.overlayUrl); toast('success', 'Link kopiert — in OBS/Live Studio als Browser-Quelle einfügen. Der Haken kommt, sobald die Quelle verbunden ist.'); },
      },
      hint: diag.clientCount === 0 ? 'hakt sich automatisch ab, sobald OBS/Live Studio den Link offen hat' : undefined,
    },
    {
      done: connected,
      label: 'Oben mit TikTok verbinden (@Name eintragen)',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <>
      {/* Roter Live-Alarm: Overlay im Stream unsichtbar — zeigt sich IMMER, auch bei ausgeblendeter Liste */}
      {alarm && !alarmIgnored && (
        <div className="flex items-center gap-3 rounded-lg border border-studio-accent/60 bg-studio-accent/10 px-4 py-3">
          <AlertTriangle size={18} className="flex-none text-studio-accent" />
          <div className="flex-1 text-xs">
            <b>Dein Overlay ist im Stream nicht sichtbar!</b> Du bist verbunden, aber keine Browser-Quelle (OBS/Live Studio) hat deinen Overlay-Link offen — Zuschauer sehen keine Alerts.
          </div>
          <button
            onClick={() => { void window.studio.copyText(diag.overlayUrl); toast('success', 'Overlay-Link kopiert'); }}
            className="bx-pill flex-none text-[11px] hover:text-studio-teal"
          >
            <Copy size={12} /> Link kopieren
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('bx-navigate', { detail: 'diagnose' }))}
            className="bx-btn-accent flex-none px-3 py-1.5 text-[11px]"
          >
            Diagnose öffnen
          </button>
          <button
            onClick={() => { setAlarmIgnored(true); sessionStorage.setItem('bx-source-alarm-ignored', '1'); }}
            title="Für diese Session ausblenden"
            className="flex-none text-studio-muted hover:text-studio-text"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Startklar-Checkliste */}
      {!dismissed && (
        <div className="bx-card px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="font-display text-[11px] uppercase tracking-[0.25em] text-studio-gold">
              {allDone ? '✓ Alles startklar!' : `Startklar-Check ${doneCount}/${steps.length}`}
            </span>
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-studio-raised">
              <div className="h-full rounded-full bg-studio-teal transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <div className="flex-1" />
            <button
              onClick={() => { setDismissed(true); localStorage.setItem(DISMISS_KEY, '1'); }}
              title="Checkliste ausblenden (übers ? oben wieder einblendbar)"
              className="text-studio-muted hover:text-studio-text"
            >
              <X size={16} />
            </button>
          </div>
          {!allDone && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
              {steps.map((s, i) => (
                <span key={i} className={`flex items-center gap-1.5 text-xs ${s.done ? 'text-studio-muted line-through decoration-studio-teal/60' : ''}`}>
                  {s.done
                    ? <CheckCircle2 size={14} className="flex-none text-studio-teal" />
                    : <Circle size={14} className="flex-none text-studio-muted" />}
                  <b>{i + 1}.</b> {s.label}
                  {!s.done && s.action && (
                    <button onClick={s.action.run} className="bx-pill ml-1 !px-2.5 !py-1 text-[11px] text-studio-accent hover:border-studio-accent">
                      {s.action.label}
                    </button>
                  )}
                  {!s.done && s.hint && <span className="text-[10px] text-studio-muted">({s.hint})</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
