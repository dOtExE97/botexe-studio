import { useState, useEffect } from 'react';
import { Radio, LayoutPanelTop, Zap, Gift, Gamepad2, Volume2, Mic, Settings, Users, Clapperboard, Images, Terminal } from 'lucide-react';
import { useStudio } from './hooks/useStudio';
import SoundPlayer from './components/SoundPlayer';
import ToastHost, { toast } from './components/ToastHost';
import OnboardingTour from './components/OnboardingTour';
import LivePage from './pages/LivePage';
import OverlayPage from './pages/OverlayPage';
import TriggersPage from './pages/TriggersPage';
import StorePage from './pages/StorePage';
import PanelPage from './pages/PanelPage';
import SoundsPage from './pages/SoundsPage';
import TtsPage from './pages/TtsPage';
import SettingsPage from './pages/SettingsPage';
import ViewersPage from './pages/ViewersPage';
import GalleryPage from './pages/GalleryPage';
import CommandsPage from './pages/CommandsPage';

type Page = 'live' | 'overlay' | 'triggers' | 'commands' | 'gallery' | 'store' | 'panel' | 'sounds' | 'tts' | 'viewers' | 'settings';

const NAV: { id: Page; label: string; icon: typeof Radio; group: string }[] = [
  { id: 'live', label: 'Live', icon: Radio, group: 'Stream' },
  { id: 'overlay', label: 'Overlay', icon: LayoutPanelTop, group: 'Stream' },
  { id: 'gallery', label: 'Geschenke', icon: Images, group: 'Stream' },
  { id: 'triggers', label: 'Trigger', icon: Zap, group: 'Reaktionen' },
  { id: 'commands', label: 'Befehle', icon: Terminal, group: 'Reaktionen' },
  { id: 'store', label: 'Store', icon: Gift, group: 'Reaktionen' },
  { id: 'panel', label: 'Panel', icon: Gamepad2, group: 'Reaktionen' },
  { id: 'sounds', label: 'Sounds', icon: Volume2, group: 'Medien' },
  { id: 'tts', label: 'Stimme', icon: Mic, group: 'Medien' },
  { id: 'viewers', label: 'Zuschauer', icon: Users, group: 'Mehr' },
  { id: 'settings', label: 'Einstellungen', icon: Settings, group: 'Mehr' },
];

interface StatusStyle {
  label: string;
  cls: string;
  dot: string;
}

const STATUS_FALLBACK: StatusStyle = {
  label: 'OFFLINE',
  cls: 'text-studio-muted border-studio-border bg-studio-panel',
  dot: 'bg-studio-muted',
};

const STATUS_STYLE: Record<string, StatusStyle> = {
  connected: { label: 'LIVE VERBUNDEN', cls: 'text-studio-teal border-studio-teal/40 bg-studio-teal/10', dot: 'bg-studio-teal animate-pulse' },
  connecting: { label: 'VERBINDE…', cls: 'text-studio-gold border-studio-gold/40 bg-studio-gold/10', dot: 'bg-studio-gold animate-pulse' },
  reconnecting: { label: 'RECONNECT…', cls: 'text-studio-gold border-studio-gold/40 bg-studio-gold/10', dot: 'bg-studio-gold animate-pulse' },
  disconnected: { label: 'OFFLINE', cls: 'text-studio-muted border-studio-border bg-studio-panel', dot: 'bg-studio-muted' },
  error: { label: 'FEHLER', cls: 'text-studio-accent border-studio-accent/40 bg-studio-accent/10', dot: 'bg-studio-accent' },
};

export default function App() {
  const [page, setPage] = useState<Page>('live');
  const studio = useStudio();
  const [copied, setCopied] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.studio.getAppInfo().then((i: { version?: string }) => setVersion(i?.version ?? ''));
  }, []);

  const st = STATUS_STYLE[studio.status.status] ?? STATUS_FALLBACK;

  const copyLink = () => {
    void window.studio.copyText(studio.overlayUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  // TikTok-Studio-Link (Domain-Form) für das Standard-Profil — prominent in
  // der Topbar, weil TTLS-Nutzer ihn am häufigsten brauchen.
  const copyTtls = async () => {
    const info = (await window.studio.getTtlsLink()) as { url: string; ready: boolean };
    await window.studio.copyText(info.url);
    if (info.ready) {
      toast('success', 'Link kopiert — als Link-Quelle einfügen & benutzerdefinierte Auflösung 1080×1920 setzen.');
    } else {
      toast('warn', 'Link kopiert — einmalige Einrichtung fehlt noch: Einstellungen → TikTok Live Studio.');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <SoundPlayer />
      <ToastHost />
      <OnboardingTour onNavigate={(p) => setPage(p as Page)} />

      {/* Sidebar */}
      <aside className="flex w-52 flex-none flex-col border-r border-studio-border bg-studio-panel">
        <div className="px-5 pt-6 pb-7">
          <div className="font-display text-xl leading-none tracking-tight">
            <span className="text-studio-accent">b</span>OtExE
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.4em] text-studio-muted">Studio</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map(({ id, label, icon: Icon, group }, i) => (
            <div key={id}>
              {(i === 0 || NAV[i - 1]?.group !== group) && (
                <div className="mb-1 mt-3 px-2 text-[9px] font-bold uppercase tracking-[0.3em] text-studio-muted/60 first:mt-0">
                  {group}
                </div>
              )}
              <button
                onClick={() => setPage(id)}
                className={`clip-slant flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  page === id
                    ? 'bg-studio-accent font-bold text-black'
                    : 'text-studio-muted hover:bg-studio-raised hover:text-studio-text'
                }`}
              >
                <Icon size={16} strokeWidth={2.5} />
                {label}
                {id === 'live' && studio.status.status === 'connected' && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-studio-teal" title="Verbunden" />
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="mt-auto px-5 pb-4 text-[10px] text-studio-muted">
          {version ? `v${version}` : ''} · <span className="font-bold text-studio-gold">ALPHA</span> · lokal
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header mit Status-Pills — immer sichtbar */}
        <header className="flex h-14 flex-none items-center gap-3 border-b border-studio-border bg-studio-panel px-5">
          <div className={`clip-slant flex items-center gap-2 border px-3 py-1.5 text-[11px] font-bold tracking-widest ${st.cls}`}>
            <span className={`h-2 w-2 rounded-full ${st.dot}`} />
            {st.label}
            {studio.status.attempt ? ` #${studio.status.attempt}` : ''}
          </div>
          {studio.stats && studio.status.status === 'connected' && (
            <div className="clip-slant border border-studio-border bg-studio-raised px-3 py-1.5 font-mono text-[11px] text-studio-muted">
              👁 {studio.stats.totals.viewers}
            </div>
          )}
          <div className="flex-1" />
          <button
            onClick={copyLink}
            disabled={!studio.overlayUrl}
            className="clip-slant-r border border-studio-teal/40 bg-studio-teal/10 px-4 py-1.5 text-[11px] font-bold tracking-widest text-studio-teal transition-colors hover:bg-studio-teal hover:text-black"
            title="Overlay-Link für OBS / normalen Browser kopieren"
          >
            {copied ? '✓ KOPIERT' : 'OBS-LINK'}
          </button>
          <button
            onClick={() => void copyTtls()}
            disabled={!studio.overlayUrl}
            className="clip-slant-r flex items-center gap-1.5 border border-studio-accent/50 bg-studio-accent/15 px-4 py-1.5 text-[11px] font-bold tracking-widest text-studio-accent transition-colors hover:bg-studio-accent hover:text-black"
            title="Link für TikTok Live Studio kopieren (Domain-Form — TTLS akzeptiert keine IP-Links)"
          >
            <Clapperboard size={13} /> TIKTOK-STUDIO-LINK
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {page === 'live' && <LivePage studio={studio} />}
          {page === 'overlay' && <OverlayPage />}
          {page === 'triggers' && <TriggersPage />}
          {page === 'commands' && <CommandsPage />}
          {page === 'gallery' && <GalleryPage />}
          {page === 'store' && <StorePage />}
          {page === 'panel' && <PanelPage />}
          {page === 'sounds' && <SoundsPage />}
          {page === 'tts' && <TtsPage />}
          {page === 'viewers' && <ViewersPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
