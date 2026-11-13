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
import { Monitor, Mic, Radio, Tv } from 'lucide-react';
import { useTwitchStatus } from '../hooks/useTwitchStatus';
import type { TwitchUiStatus } from '../../main/services/twitch-steuerung';

interface Lampe {
  label: string;
  ok: boolean;
  /** Was los ist — als Erklärung beim Draufzeigen. */
  hinweis: string;
  icon: typeof Monitor;
  /** Eigene Schriftfarbe der Beschriftung (Twitch-Lila), solange ok. */
  farbe?: string;
}

/** Twitch-Lampe in Alltagssprache. */
function twitchHinweis(t: TwitchUiStatus): string {
  if (t.anmeldungLaeuft) return 'Twitch-Anmeldung läuft — bitte den Code im Browser bestätigen.';
  switch (t.status) {
    case 'verbunden':
      return `Mit Twitch verbunden${t.login ? ` als ${t.login}` : ''}${t.live === true ? ' · du bist live' : t.live === false ? ' · gerade nicht live' : ''}.`;
    case 'verbinde': return 'Verbinde mit Twitch …';
    case 'getrennt': return 'Twitch-Verbindung unterbrochen — verbinde neu …';
    case 'neu-anmelden': return 'Twitch-Anmeldung ist abgelaufen — Einstellungen → Twitch → „Mit Twitch verbinden".';
    case 'fehler': return `Twitch meldet ein Problem${t.detail ? `: ${t.detail}` : ''}.`;
    default:
      return t.angemeldet
        ? 'Twitch ist angemeldet, aber nicht verbunden — es kommen keine Twitch-Ereignisse an.'
        : 'Noch nicht mit Twitch verbunden (Einstellungen → Twitch).';
  }
}

export default function SystemAmpel({ verbunden }: { verbunden: boolean }) {
  const [overlayClients, setOverlayClients] = useState<number | null>(null);
  const [ttsAn, setTtsAn] = useState<boolean | null>(null);
  const twitch = useTwitchStatus();

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
    // Twitch nur zeigen, wenn es überhaupt eingerichtet ist (Client-ID da) —
    // wer nur TikTok streamt, soll keine dauerhaft „rote" Lampe sehen.
    ...(twitch.clientIdGesetzt ? [{
      label: 'Twitch',
      ok: twitch.status === 'verbunden',
      hinweis: twitchHinweis(twitch),
      icon: Tv, // lucide hat seit v1 keine Marken-Symbole mehr
      farbe: '#9146ff',
    }] : []),
  ];

  return (
    <div className="bx-card flex items-center gap-4 px-4 py-3">
      {lampen.map((l) => {
        const Icon = l.icon;
        return (
          <div key={l.label} className="flex items-center gap-1.5" title={l.hinweis}>
            <span className={`h-2 w-2 flex-none rounded-full ${l.ok ? 'bg-studio-teal' : 'bg-studio-accent'}`} />
            <Icon size={13} className={l.ok ? 'text-studio-muted' : 'text-studio-accent'} />
            <span
              className={`text-[11px] ${l.ok ? (l.farbe ? 'font-bold' : 'text-studio-muted') : 'font-bold text-studio-accent'}`}
              style={l.ok && l.farbe ? { color: l.farbe } : undefined}
            >
              {l.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
