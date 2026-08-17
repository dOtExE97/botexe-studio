import { useState, useEffect } from 'react';
import { Radio, LayoutPanelTop, Zap, Gift, Gamepad2, Volume2, Mic, Settings, Users, Clapperboard, Images, Terminal, Stethoscope, Sliders, Square, BarChart3, Frame } from 'lucide-react';
import { useStudio } from './hooks/useStudio';
import SoundPlayer, { stoppeAlleSounds, laufenSounds } from './components/SoundPlayer';
import ToastHost, { toast } from './components/ToastHost';
import UpdateBanner from './components/UpdateBanner';
import OverlayHealthBanner, { markTtlsLinkUsed } from './components/OverlayHealthBanner';
import TelemetryConsent from './components/TelemetryConsent';
import ProfileSwitcher from './components/ProfileSwitcher';
import OnboardingTour from './components/OnboardingTour';
import WhatsNew from './components/WhatsNew';
import KeyWizard from './components/KeyWizard';
import LivePage from './pages/LivePage';
import AnalysePage from './pages/AnalysePage';
import MediaPage from './pages/MediaPage';
import OverlayPage from './pages/OverlayPage';
import DiagnosePage from './pages/DiagnosePage';
import TriggersPage from './pages/TriggersPage';
import StorePage from './pages/StorePage';
import PanelPage from './pages/PanelPage';
import SoundsPage from './pages/SoundsPage';
import TtsPage from './pages/TtsPage';
import SettingsPage from './pages/SettingsPage';
import ViewersPage from './pages/ViewersPage';
import GalleryPage from './pages/GalleryPage';
import CommandsPage from './pages/CommandsPage';
import MixerPage from './pages/MixerPage';

type Page = 'live' | 'analyse' | 'media' | 'overlay' | 'triggers' | 'commands' | 'gallery' | 'store' | 'panel' | 'sounds' | 'tts' | 'mixer' | 'viewers' | 'diagnose' | 'settings';

const NAV: { id: Page; label: string; icon: typeof Radio; group: string; hint: string }[] = [
  { id: 'live', label: 'Live', icon: Radio, group: 'Stream', hint: 'Mit TikTok verbinden, Live-Zahlen & Chat-Spiele starten' },
  { id: 'analyse', label: 'Auswertung', icon: BarChart3, group: 'Stream', hint: 'Deine Streams im Vergleich: Verlauf, starke Wochentage, bester Stream' },
  { id: 'overlay', label: 'Overlay', icon: LayoutPanelTop, group: 'Stream', hint: 'Overlay bauen: Widgets aufs Bild ziehen, Link für OBS/TikTok kopieren' },
  { id: 'gallery', label: 'Geschenke', icon: Images, group: 'Reaktionen', hint: 'Geschenke-Galerie: einem Gift direkt einen Sound/eine Aktion zuweisen (wird zur Trigger-Regel)' },
  { id: 'triggers', label: 'Trigger', icon: Zap, group: 'Reaktionen', hint: 'Reaktion auf Gift/Follow/Like/Sub — „wenn X passiert, dann tu Y"' },
  { id: 'commands', label: 'Befehle', icon: Terminal, group: 'Reaktionen', hint: 'Chat-Befehle: schreibt jemand „!wort", antwortet der Bot' },
  { id: 'store', label: 'Store', icon: Gift, group: 'Reaktionen', hint: 'Zuschauer geben ihre gesammelten Punkte für Aktionen aus' },
  { id: 'panel', label: 'Panel', icon: Gamepad2, group: 'Reaktionen', hint: 'Deine eigenen Knöpfe/Hotkeys, um selbst Aktionen auszulösen' },
  { id: 'sounds', label: 'Sounds', icon: Volume2, group: 'Medien', hint: 'Sound-Dateien hochladen & verwalten' },
  { id: 'media', label: 'Bilder & Videos', icon: Images, group: 'Medien', hint: 'Deine Bilder und Videos für Intros, Einblendungen und Trigger — hinzufügen, ansehen, löschen' },
  { id: 'tts', label: 'Stimme', icon: Mic, group: 'Medien', hint: 'Text-to-Speech: Chat-Nachrichten vorlesen lassen' },
  { id: 'mixer', label: 'Mixer', icon: Sliders, group: 'Medien', hint: 'Lautstärke, Mute & Ausgabegerät pro Sound-Quelle (TTS, Alerts, Soundboard, Spiele)' },
  { id: 'viewers', label: 'Zuschauer', icon: Users, group: 'Mehr', hint: 'Zuschauer-Liste mit Punkten, VIPs, Besuchen' },
  { id: 'diagnose', label: 'Diagnose', icon: Stethoscope, group: 'Mehr', hint: 'Warum sehe ich mein Overlay nicht? Server, verbundene Quellen, Key — auf einen Blick' },
  { id: 'settings', label: 'Einstellungen', icon: Settings, group: 'Mehr', hint: 'TikTok-Verbindung (Key!), Punkte, OBS, Backup, Lizenzen …' },
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
  // Laeuft gerade Ton? Der SoundPlayer meldet jede Aenderung per Event — so
  // erscheint der Stopp-Knopf nur, wenn er auch etwas zu tun hat.
  const [soundsLaufen, setSoundsLaufen] = useState(false);
  useEffect(() => {
    const pruefe = () => setSoundsLaufen(laufenSounds());
    window.addEventListener('bx-sounds-changed', pruefe);
    // Zusaetzlich pollen: das Ende eines Sounds meldet sich nicht als Event.
    const t = setInterval(pruefe, 500);
    return () => { window.removeEventListener('bx-sounds-changed', pruefe); clearInterval(t); };
  }, []);
  const [version, setVersion] = useState('');
  // Empfohlene Größe der Browser-Quelle (Standard-Profil). Steht direkt neben den
  // Link-Knöpfen, weil man sie in TikTok Live Studio nach dem Einfügen von Hand
  // setzen muss — vergisst man das, ist das Overlay verzerrt und nichts sagt
  // einem warum. Beim Seitenwechsel neu holen: im Overlay-Editor kann das
  // Standard-Profil (und damit die Größe) gewechselt haben.
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    void window.studio.getAppInfo().then((i: { version?: string }) => setVersion(i?.version ?? ''));
  }, []);

  useEffect(() => {
    void holeGroesse();
    // Der Overlay-Editor meldet, wenn das Standard-Profil oder sein Format
    // wechselt — dort bleibt man nach dem Klick auf derselben Seite, ein reiner
    // Seitenwechsel-Effekt würde die Pille also genau dann veralten lassen.
    const onGroesse = () => { void holeGroesse(); };
    window.addEventListener('bx-overlay-groesse', onGroesse);
    return () => window.removeEventListener('bx-overlay-groesse', onGroesse);
  }, [page]);

  // Globales Navigations-Event: Seiten können gezielt woandershin springen
  // (z.B. Live-Seite → „Gratis-Key holen" → Einstellungen).
  useEffect(() => {
    const onNav = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      if (typeof target === 'string') setPage(target as Page);
    };
    window.addEventListener('bx-navigate', onNav);
    return () => window.removeEventListener('bx-navigate', onNav);
  }, []);

  // „Warte auf Live" ist KEIN Fehler — eigener ruhiger Zustand statt „RECONNECT… #4"
  // (das sah aus wie eine kaputte Fehlerschleife und war der Haupt-Frust neuer Nutzer).
  const waitingForLive = studio.status.status === 'reconnecting' && studio.status.detail === 'warte auf Live';
  const st = waitingForLive
    ? { label: 'WARTE AUF LIVE', cls: 'text-studio-teal border-studio-teal/40 bg-studio-teal/10', dot: 'bg-studio-teal animate-pulse' }
    : STATUS_STYLE[studio.status.status] ?? STATUS_FALLBACK;

  // Kopieren klappt immer — aber bei leerem Overlay wüsste der User sonst nicht,
  // warum die Browser-Quelle nur Transparenz zeigt („Link kaputt?").
  const warnIfOverlayEmpty = () => {
    void (window.studio.getDiagnostics() as Promise<{ activeLayers?: number }>).then((d) => {
      if ((d.activeLayers ?? 1) === 0) toast('warn', 'Hinweis: Dein Overlay ist noch leer — die Quelle bleibt unsichtbar, bis du unter „Overlay" Widgets hinzufügst.');
    }).catch(() => { /* Diagnose optional */ });
  };

  // Größe frisch holen und die Anzeige gleich mitziehen — das Standard-Profil
  // kann gewechselt worden sein, ohne dass die Seite gewechselt wurde.
  const holeGroesse = async (): Promise<{ width: number; height: number } | null> => {
    try {
      const i = (await window.studio.getOverlayInfo()) as { width?: number; height?: number };
      const g = i?.width && i?.height ? { width: i.width, height: i.height } : null;
      setOverlaySize(g);
      return g;
    } catch {
      return overlaySize;
    }
  };

  const copyLink = () => {
    void window.studio.copyText(studio.overlayUrl).then(async () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      const g = await holeGroesse();
      if (g) toast('success', `Link kopiert — Breite/Höhe der Browser-Quelle auf ${g.width}×${g.height} stellen.`);
      warnIfOverlayEmpty();
    });
  };

  // TikTok-Studio-Link (Domain-Form) für das Standard-Profil — prominent in
  // der Topbar, weil TTLS-Nutzer ihn am häufigsten brauchen.
  const copyTtls = async () => {
    const info = (await window.studio.getTtlsLink()) as { url: string; ready: boolean };
    await window.studio.copyText(info.url);
    markTtlsLinkUsed();
    const g = await holeGroesse();
    if (info.ready) {
      toast('success', `Link kopiert — als Link-Quelle einfügen & benutzerdefinierte Auflösung ${g ? `${g.width}×${g.height}` : '1080×1920'} setzen.`);
    } else {
      toast('warn', 'Link kopiert — einmalige Einrichtung fehlt noch: Einstellungen → TikTok Live Studio.');
    }
    warnIfOverlayEmpty();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <SoundPlayer />
      <ToastHost />
      <UpdateBanner />
      <OverlayHealthBanner />
      <TelemetryConsent />
      <KeyWizard />
      <OnboardingTour onNavigate={(p) => {
        // Sonderziel 'key-wizard': öffnet den Key-Assistenten statt einer Seite.
        if (p === 'key-wizard') window.dispatchEvent(new CustomEvent('bx-key-wizard'));
        else setPage(p as Page);
      }} />
      <WhatsNew />

      {/* Sidebar */}
      <aside className="flex w-52 flex-none flex-col border-r border-studio-border bg-studio-panel">
        <div className="px-5 pt-6 pb-7">
          <div className="font-display text-xl leading-none tracking-tight">
            <span className="text-studio-accent">b</span>OtExE
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.4em] text-studio-muted">Studio</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map(({ id, label, icon: Icon, group, hint }, i) => (
            <div key={id}>
              {(i === 0 || NAV[i - 1]?.group !== group) && (
                <div className="mb-1 mt-3 px-2 text-[9px] font-bold uppercase tracking-[0.3em] text-studio-muted first:mt-0">
                  {group}
                </div>
              )}
              <button
                title={hint}
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
          <div
            className={`clip-slant flex items-center gap-2 border px-3 py-1.5 text-[11px] font-bold tracking-widest ${st.cls}`}
            title={waitingForLive ? 'Kein Fehler — die App verbindet automatisch, sobald du (oder der Kanal) auf TikTok live geht.' : studio.status.detail || undefined}
          >
            <span className={`h-2 w-2 rounded-full ${st.dot}`} />
            {st.label}
            {!waitingForLive && studio.status.attempt ? ` #${studio.status.attempt}` : ''}
          </div>
          {studio.stats && studio.status.status === 'connected' && (
            <div className="clip-slant border border-studio-border bg-studio-raised px-3 py-1.5 font-mono text-[11px] text-studio-muted">
              👁 {studio.stats.totals.viewers}
            </div>
          )}
          <ProfileSwitcher />
          {/* Not-Aus fuer Ton: erscheint nur, wenn wirklich etwas laeuft. Ein
              versehentlich ausgeloester Dauer-Sound liess sich bisher nur durch
              Abwarten beenden — im Stream die laengsten Sekunden. */}
          {soundsLaufen && (
            <button
              onClick={() => { const n = stoppeAlleSounds(); if (n) toast('info', `${n} Sound${n === 1 ? '' : 's'} gestoppt.`); }}
              className="clip-slant flex items-center gap-1.5 border border-studio-accent/60 bg-studio-accent/15 px-3 py-1.5 text-[11px] font-bold tracking-widest text-studio-accent transition-colors hover:bg-studio-accent hover:text-black"
              title="Alle laufenden Sounds und Ansagen sofort stoppen"
            >
              <Square size={11} fill="currentColor" /> STOPP
            </button>
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
          {overlaySize && (
            <span
              className="clip-slant-r flex flex-none items-center gap-1.5 whitespace-nowrap border border-studio-border bg-studio-raised px-3 py-1.5 font-mono text-[11px] font-bold tabular-nums text-studio-text"
              title={`Größe der Browser-Quelle: nach dem Einfügen von Hand auf ${overlaySize.width}×${overlaySize.height} stellen — in OBS die Felder Breite/Höhe, in TikTok Live Studio „benutzerdefinierte Auflösung". Stimmt sie nicht, wird dein Overlay verkleinert und mittig eingepasst: Die Widgets sitzen dann nicht mehr an den Bildrändern, wo du sie gebaut hast.`}
            >
              <Frame size={12} /> {overlaySize.width}×{overlaySize.height}
            </span>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {page === 'live' && <LivePage studio={studio} />}
          {page === 'analyse' && <AnalysePage studio={studio} />}
          {page === 'media' && <MediaPage />}
          {page === 'overlay' && <OverlayPage />}
          {page === 'triggers' && <TriggersPage />}
          {page === 'commands' && <CommandsPage />}
          {page === 'gallery' && <GalleryPage />}
          {page === 'store' && <StorePage />}
          {page === 'panel' && <PanelPage />}
          {page === 'sounds' && <SoundsPage />}
          {page === 'tts' && <TtsPage />}
          {page === 'mixer' && <MixerPage />}
          {page === 'viewers' && <ViewersPage />}
          {page === 'diagnose' && <DiagnosePage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
