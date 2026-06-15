// OnboardingTour — freiwillige Willkommens-/Einrichtungs-Tour. Erscheint beim
// allerersten Start und ist jederzeit wiederholbar (Einstellungen → Tour, feuert
// das Fenster-Event 'bx-show-tour'). Rein informativ + optionale „dorthin"-Sprünge.
import { useEffect, useState, type ReactNode } from 'react';
import { Rocket, Radio, LayoutPanelTop, Link as LinkIcon, Sparkles, X, ChevronRight, ChevronLeft } from 'lucide-react';

const DONE_KEY = 'bx-onboarding-done';

interface Slide {
  icon: typeof Rocket;
  title: string;
  body: ReactNode;
  cta?: { label: string; page: string };
}

const SLIDES: Slide[] = [
  {
    icon: Rocket,
    title: 'Willkommen bei bOtExE Studio! 👋',
    body: (
      <>Dein <b>lokaler TikFinity-Ersatz</b> — Geschenke, Alerts, Sounds, Spiele, Overlays, TTS. Alles läuft auf <b>deinem PC</b>, kostenlos. Diese kurze Tour zeigt dir die 4 Schritte. Du kannst sie jederzeit wiederholen (Einstellungen → Tour).</>
    ),
  },
  {
    icon: Radio,
    title: '1. Verbinden',
    body: (
      <>Auf der <b>Live</b>-Seite deinen TikTok-Namen eingeben → <b>Verbinden</b>. Die App lauscht dann auf Gifts, Follows, Likes &amp; Chat. Noch nicht live? Rechts <b>„Testen ohne Live"</b> schickt Demo-Events durch die App.</>
    ),
    cta: { label: 'Zur Live-Seite', page: 'live' },
  },
  {
    icon: LayoutPanelTop,
    title: '2. Overlay bauen',
    body: (
      <>Auf der <b>Overlay</b>-Seite siehst du jedes Widget schon <b>live in der Liste</b>. <b>▶ Test</b> zeigt die Aktion, <b>➕ Hinzufügen</b> legt es aufs Bild — rechts einstellen (Farbe, Sound, Design …).</>
    ),
    cta: { label: 'Zur Overlay-Seite', page: 'overlay' },
  },
  {
    icon: LinkIcon,
    title: '3. In deinen Stream einbinden',
    body: (
      <>Oben im Overlay-Editor kopierst du den Link: <b>TIKTOK-STUDIO-LINK</b> für TikTok Live Studio (einmalig <i>Einstellungen → TikTok Live Studio → Automatisch einrichten</i>) oder <b>OBS-LINK</b> für OBS. Als <b>Browser-Quelle</b> einfügen — fertig, transparenter Hintergrund.</>
    ),
  },
  {
    icon: Sparkles,
    title: '4. Mehr entdecken',
    body: (
      <>In der Seitenleiste: <b>Trigger</b> (wenn Gift → tu was), <b>Sounds</b>, <b>TTS</b> (Chat vorlesen), <b>Punkte &amp; Store</b>, <b>Befehle</b>, Spiele &amp; Glücksrad. Viel Spaß beim Streamen! 🎉 <br /><span className="text-studio-muted">Diese Tour gibt's jederzeit wieder unter Einstellungen → Tour.</span></>
    ),
  },
];

export default function OnboardingTour({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (localStorage.getItem(DONE_KEY) !== '1') { setStep(0); setOpen(true); }
    const reopen = () => { setStep(0); setOpen(true); };
    window.addEventListener('bx-show-tour', reopen);
    return () => window.removeEventListener('bx-show-tour', reopen);
  }, []);

  if (!open) return null;
  const slide = SLIDES[step];
  if (!slide) return null;
  const Icon = slide.icon;
  const last = step === SLIDES.length - 1;

  const finish = () => { localStorage.setItem(DONE_KEY, '1'); setOpen(false); };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={finish}>
      <div
        className="bx-card relative mx-4 w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'bx-toast-in 240ms cubic-bezier(.2,1.3,.35,1)' }}
      >
        <button onClick={finish} className="absolute right-3 top-3 text-studio-muted hover:text-studio-text" title="Tour schließen">
          <X size={18} />
        </button>

        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-studio-accent/15 text-studio-accent">
          <Icon size={28} />
        </div>
        <h2 className="mb-2 font-display text-xl text-studio-text">{slide.title}</h2>
        <p className="text-sm leading-relaxed text-studio-text/85">{slide.body}</p>

        {slide.cta && onNavigate && (
          <button
            onClick={() => { const target = slide.cta?.page; if (target) onNavigate(target); finish(); }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-studio-raised px-3 py-1.5 text-xs font-bold text-studio-teal hover:bg-studio-teal hover:text-black"
          >
            {slide.cta.label} <ChevronRight size={14} />
          </button>
        )}

        {/* Fortschritt + Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-studio-accent' : 'w-1.5 bg-studio-border'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-studio-muted hover:text-studio-text">
                <ChevronLeft size={14} /> Zurück
              </button>
            )}
            {!last ? (
              <button onClick={() => setStep((s) => s + 1)} className="bx-btn-accent flex items-center gap-1 px-4 py-1.5 text-xs">
                Weiter <ChevronRight size={14} />
              </button>
            ) : (
              <button onClick={finish} className="bx-btn-accent flex items-center gap-1.5 px-4 py-1.5 text-xs">
                <Rocket size={14} /> Los geht's!
              </button>
            )}
          </div>
        </div>

        {step === 0 && (
          <button onClick={finish} className="mt-3 block w-full text-center text-[11px] text-studio-muted/70 hover:text-studio-muted">
            Tour überspringen
          </button>
        )}
      </div>
    </div>
  );
}
