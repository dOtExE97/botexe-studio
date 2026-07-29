// SystemAmpel — beantwortet in einem Blick: „Sieht mein Publikum gerade alles?"
//
// Warum: Wenn im Stream etwas fehlt, ist die Ursache fast immer eine von drei
// Sachen — das Overlay hängt nicht dran, die Sprachausgabe ist aus, oder die
// TikTok-Verbindung steht nicht. Bisher musste man das an drei verschiedenen
// Stellen nachsehen (oder im Log suchen).
//
// Bewusst zurückhaltend: Solange alles läuft, ist die Ampel unauffällig grün.
// Sie soll nur auffallen, wenn wirklich etwas fehlt.
import { useEffect, useState } from 'react';
import { Monitor, Mic, Radio } from 'lucide-react';

interface Lampe {
  label: string;
  ok: boolean;
  /** Was los ist — als Erklärung beim Draufzeigen. */
  hinweis: string;
  icon: typeof Monitor;
}

export default function SystemAmpel({ verbunden }: { verbunden: boolean }) {
  const [overlayClients, setOverlayClients] = useState<number | null>(null);
  const [ttsAn, setTtsAn] = useState<boolean | null>(null);

  useEffect(() => {
    const laden = () => {
      void window.studio.getDiagnostics()
        .then((d) => {
          const dd = d as { overlayClients?: number };
          setOverlayClients(typeof dd.overlayClients === 'number' ? dd.overlayClients : null);
        })
        .catch(() => setOverlayClients(null));
      void window.studio.getSettings()
        .then((s) => setTtsAn(!!(s as { tts?: { enabled?: boolean } }).tts?.enabled))
        .catch(() => setTtsAn(null));
    };
    laden();
    // Alle 5 s nachsehen: Eine Browser-Quelle kann jederzeit weggehen, und
    // genau das merkt man sonst erst, wenn Zuschauer sich beschweren.
    const t = setInterval(laden, 5000);
    return () => clearInterval(t);
  }, []);

  const lampen: Lampe[] = [
    {
      label: 'Live',
      ok: verbunden,
      hinweis: verbunden ? 'Mit TikTok verbunden.' : 'Nicht verbunden — es kommen keine Ereignisse an.',
      icon: Radio,
    },
    {
      label: 'Overlay',
      ok: (overlayClients ?? 0) > 0,
      hinweis: overlayClients === null
        ? 'Zustand unbekannt.'
        : overlayClients > 0
          ? `${overlayClients} Browser-Quelle${overlayClients === 1 ? '' : 'n'} verbunden — deine Zuschauer sehen die Widgets.`
          : 'Keine Browser-Quelle verbunden! Widgets laufen zwar, aber NIEMAND sieht sie. Overlay-Link in OBS bzw. TikTok Live Studio prüfen.',
      icon: Monitor,
    },
    {
      label: 'Ansagen',
      ok: ttsAn !== false,
      hinweis: ttsAn === false
        ? 'Sprachausgabe ist ausgeschaltet — es wird nichts vorgelesen.'
        : 'Sprachausgabe ist an.',
      icon: Mic,
    },
  ];

  return (
    <div className="bx-card flex items-center gap-4 px-4 py-3">
      {lampen.map((l) => {
        const Icon = l.icon;
        return (
          <div key={l.label} className="flex items-center gap-1.5" title={l.hinweis}>
            <span className={`h-2 w-2 flex-none rounded-full ${l.ok ? 'bg-studio-teal' : 'bg-studio-accent'}`} />
            <Icon size={13} className={l.ok ? 'text-studio-muted' : 'text-studio-accent'} />
            <span className={`text-[11px] ${l.ok ? 'text-studio-muted' : 'font-bold text-studio-accent'}`}>
              {l.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
