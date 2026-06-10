import { useState } from 'react';
import { Radio, LayoutPanelTop, Zap, Volume2 } from 'lucide-react';
import { useStudio } from './hooks/useStudio';
import SoundPlayer from './components/SoundPlayer';
import LivePage from './pages/LivePage';
import OverlayPage from './pages/OverlayPage';
import TriggersPage from './pages/TriggersPage';
import SoundsPage from './pages/SoundsPage';

type Page = 'live' | 'overlay' | 'triggers' | 'sounds';

const NAV: { id: Page; label: string; icon: typeof Radio }[] = [
  { id: 'live', label: 'Live', icon: Radio },
  { id: 'overlay', label: 'Overlay', icon: LayoutPanelTop },
  { id: 'triggers', label: 'Trigger', icon: Zap },
  { id: 'sounds', label: 'Sounds', icon: Volume2 },
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

  const st = STATUS_STYLE[studio.status.status] ?? STATUS_FALLBACK;

  const copyLink = () => {
    void navigator.clipboard.writeText(studio.overlayUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <SoundPlayer />

      {/* Sidebar */}
      <aside className="flex w-52 flex-none flex-col border-r border-studio-border bg-studio-panel">
        <div className="px-5 pt-6 pb-7">
          <div className="font-display text-xl leading-none tracking-tight">
            <span className="text-studio-accent">b</span>OtExE
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.4em] text-studio-muted">Studio</div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`clip-slant flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                page === id
                  ? 'bg-studio-accent font-bold text-black'
                  : 'text-studio-muted hover:bg-studio-raised hover:text-studio-text'
              }`}
            >
              <Icon size={16} strokeWidth={2.5} />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-5 pb-4 text-[10px] text-studio-muted">v0.1.0 · lokal</div>
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
            title="Diesen Link in TikTok Live Studio als Browser-Quelle einfügen"
          >
            {copied ? '✓ KOPIERT' : 'OVERLAY-LINK KOPIEREN'}
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {page === 'live' && <LivePage studio={studio} />}
          {page === 'overlay' && <OverlayPage />}
          {page === 'triggers' && <TriggersPage />}
          {page === 'sounds' && <SoundsPage />}
        </main>
      </div>
    </div>
  );
}
