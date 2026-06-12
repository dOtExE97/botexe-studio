// LivePage — verbinden, zuschauen, testen. Test-Werkzeuge sind bewusst
// immer sichtbar (Single-User-Tool, keine versteckten Dev-Gates).
import { useEffect, useState, type ComponentType } from 'react';
import { Radio, Gift, UserPlus, MessageSquare, Heart, Wifi, WifiOff, CircleDot, Square, Play, Star, Share2, X, LayoutPanelTop, Zap, RotateCcw } from 'lucide-react';
import type { useStudio } from '../hooks/useStudio';
import ConfirmButton from '../components/ConfirmButton';
import { toast } from '../components/ToastHost';
import type { StudioEvent } from '@botexe/trigger-engine';

const BADGE_FALLBACK = { label: 'EVENT', cls: 'bg-studio-raised text-studio-muted' };

const EVENT_BADGE: Record<string, { label: string; cls: string }> = {
  chat: { label: 'CHAT', cls: 'bg-studio-raised text-studio-muted' },
  gift: { label: 'GIFT', cls: 'bg-studio-accent/20 text-studio-accent' },
  follow: { label: 'FOLLOW', cls: 'bg-studio-teal/20 text-studio-teal' },
  sub: { label: 'SUB', cls: 'bg-studio-gold/20 text-studio-gold' },
  like: { label: 'LIKE', cls: 'bg-pink-500/20 text-pink-400' },
  share: { label: 'SHARE', cls: 'bg-sky-500/20 text-sky-400' },
  viewer_count: { label: 'VIEWER', cls: 'bg-studio-raised text-studio-muted' },
};

function describeEvent(e: StudioEvent): string {
  const who = e.user?.nickname ?? '';
  switch (e.type) {
    case 'chat':
      return `${who}: ${e.text}`;
    case 'gift':
      return `${who} schickt ${e.gift?.count && e.gift.count > 1 ? `${e.gift.count}× ` : ''}${e.gift?.slug} (+${e.gift?.totalCoins} Coins)`;
    case 'follow':
      return `${who} folgt jetzt`;
    case 'sub':
      return `${who} hat subscribed`;
    case 'like':
      return `${who} liked (+${e.likeCount}) — gesamt ${e.totalLikes}`;
    case 'share':
      return `${who} hat den Stream geteilt`;
    case 'viewer_count':
      return `${e.viewerCount} Zuschauer`;
    default:
      return e.type;
  }
}

// Avatar-/Gift-Bilder für Test-Events als Data-URLs — kein Netz nötig,
// aber die Widgets zeigen echte Bilder wie im Live-Betrieb.
function svgAvatar(initial: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${bg}"/><text x="32" y="42" font-family="Arial Black" font-size="30" fill="#fff" text-anchor="middle">${initial}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
function svgEmoji(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><text x="48" y="68" font-size="56" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

const AVATARS = {
  test: svgAvatar('T', '#e8543f'),
  spender: svgAvatar('B', '#7c3aed'),
  fan: svgAvatar('F', '#21a179'),
  chatter: svgAvatar('C', '#2563eb'),
  liker: svgAvatar('L', '#db2777'),
};

export default function LivePage({ studio }: { studio: ReturnType<typeof useStudio> }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testChat, setTestChat] = useState('');
  const [showIntro, setShowIntro] = useState(() => localStorage.getItem('bx-intro-dismissed') !== '1');

  useEffect(() => {
    void window.studio.getSettings().then((s: { lastUsername: string }) => {
      if (s.lastUsername) setUsername(s.lastUsername);
    });
  }, []);

  const connected = studio.status.status === 'connected';

  const toggleConnect = async () => {
    setBusy(true);
    setError('');
    try {
      if (connected) {
        await window.studio.platformDisconnect();
      } else {
        const result = await window.studio.platformConnect(username.trim());
        if (!result.ok) setError(result.error ?? 'Verbindung fehlgeschlagen');
      }
    } finally {
      setBusy(false);
    }
  };

  const t = studio.stats?.totals;

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      {/* First-Run: die 3 Schritte zum laufenden Overlay (dismissbar) */}
      {showIntro && (
        <div className="bx-card flex items-center gap-4 px-5 py-3.5">
          <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="font-display text-[11px] uppercase tracking-[0.25em] text-studio-gold">So geht's los</span>
            <span className="flex items-center gap-1.5"><LayoutPanelTop size={14} className="text-studio-accent" /> <b>1.</b> Unter „Overlay" Widgets platzieren & Link kopieren</span>
            <span className="flex items-center gap-1.5"><Radio size={14} className="text-studio-accent" /> <b>2.</b> Link als Browser-Quelle in OBS / TikTok Live Studio einfügen</span>
            <span className="flex items-center gap-1.5"><Zap size={14} className="text-studio-accent" /> <b>3.</b> Oben mit TikTok verbinden & unter „Trigger" Reaktionen bauen</span>
          </div>
          <button
            onClick={() => { setShowIntro(false); localStorage.setItem('bx-intro-dismissed', '1'); }}
            title="Hinweis ausblenden"
            className="flex-none text-studio-muted hover:text-studio-text"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Kopfzeile + Connect */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-xl uppercase">
          <Radio size={20} className="text-studio-accent" /> Live-Cockpit
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {error && <span className="text-xs text-studio-accent">{error}</span>}
          <div className="bx-input flex w-auto items-center gap-1 !py-0 !pr-0">
            <span className="pl-1 font-display text-studio-muted">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && username && void toggleConnect()}
              placeholder="dein TikTok-Name"
              disabled={connected}
              className="w-52 bg-transparent py-2.5 pr-3 text-sm outline-none placeholder:text-studio-muted/50 disabled:opacity-60"
            />
          </div>
          <button
            onClick={() => void toggleConnect()}
            disabled={busy || (!connected && !username.trim())}
            className={
              connected
                ? 'bx-pill border-studio-border px-5 py-2.5 font-display text-sm tracking-wide hover:text-studio-text disabled:opacity-40'
                : 'bx-btn-accent px-5 py-2.5 font-display text-sm tracking-wide disabled:opacity-40'
            }
          >
            {connected ? <WifiOff size={15} /> : <Wifi size={15} />}
            {busy ? '…' : connected ? 'TRENNEN' : 'GO LIVE'}
          </button>
        </div>
      </div>

      {/* Stats-Karten */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Zuschauer', value: t?.viewers ?? 0, peak: t?.peakViewers },
          { label: 'Coins', value: t?.coins ?? 0 },
          { label: 'Gifts', value: t?.gifts ?? 0 },
          { label: 'Follower', value: t?.follows ?? 0 },
          { label: 'Likes', value: t?.likes ?? 0 },
        ].map((card) => (
          <div key={card.label} className="bx-card overflow-hidden p-4">
            <div
              className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-studio-accent/15 blur-2xl"
              aria-hidden
            />
            <div className="text-[10px] uppercase tracking-[0.3em] text-studio-muted">{card.label}</div>
            <div
              className="mt-1 text-3xl leading-none text-studio-text"
              style={{ fontFamily: 'var(--font-chunky)' }}
            >
              {card.value.toLocaleString('de-DE')}
            </div>
            {card.peak !== undefined && card.peak > 0 && (
              <div className="mt-1 font-mono text-[10px] text-studio-muted">Peak {card.peak}</div>
            )}
          </div>
        ))}
      </div>

      {/* Event-Feed + Test-Panel */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-4">
        <section className="bx-card flex min-h-0 flex-col overflow-hidden">
          <h2 className="border-b border-studio-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">
            Live-Feed
          </h2>
          <div className="flex flex-1 flex-col-reverse overflow-y-auto p-3">
            <div className="flex flex-col gap-1">
              {studio.feed.length === 0 && (
                <p className="py-8 text-center text-xs text-studio-muted">
                  Noch keine Events — verbinde dich oder schick ein Test-Event.
                </p>
              )}
              {studio.feed.map(({ key, event }) => {
                const badge = EVENT_BADGE[event.type] ?? BADGE_FALLBACK;
                return (
                  <div key={key} className="flex items-baseline gap-2 px-1 py-0.5 text-[13px]">
                    <span className={`clip-slant flex-none px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="min-w-0 truncate text-studio-text/90">{describeEvent(event)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Test-Werkzeuge */}
        <section className="bx-card flex flex-col gap-2 p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">Testen ohne Live</h2>
          <p className="mb-1 text-[11px] leading-relaxed text-studio-muted">
            Schickt echte Events durch die komplette Kette — Trigger, Overlay und Sounds reagieren wie im Stream.
          </p>
          {[
            { label: 'Test-Gift (1 Coin)', icon: Gift, event: { type: 'gift', ts: 0, user: { id: 'test', nickname: 'TestUser', profilePic: AVATARS.test }, gift: { slug: 'Rose', count: 1, coinsPerUnit: 1, totalCoins: 1, icon: svgEmoji('🌹') } } },
            { label: 'Test-Gift (500 Coins)', icon: Gift, event: { type: 'gift', ts: 0, user: { id: 'spender', nickname: 'BigSpender', profilePic: AVATARS.spender }, gift: { slug: 'Lion', count: 1, coinsPerUnit: 500, totalCoins: 500, icon: svgEmoji('🦁') } } },
            { label: 'Test-Follow', icon: UserPlus, event: { type: 'follow', ts: 0, user: { id: 'fan', nickname: 'NeuerFan', profilePic: AVATARS.fan } } },
            { label: 'Test-Chat', icon: MessageSquare, event: { type: 'chat', ts: 0, user: { id: 'chatter', nickname: 'Chatter', profilePic: AVATARS.chatter }, text: 'Das Overlay sieht stark aus! 🔥' } },
            { label: 'Test-Likes (+50)', icon: Heart, event: { type: 'like', ts: 0, user: { id: 'liker', nickname: 'Liker', profilePic: AVATARS.liker }, likeCount: 50, totalLikes: 0 } },
            { label: 'Test-Sub', icon: Star, event: { type: 'sub', ts: 0, user: { id: 'subber', nickname: 'SuperSub', profilePic: AVATARS.fan } } },
            { label: 'Test-Share', icon: Share2, event: { type: 'share', ts: 0, user: { id: 'sharer', nickname: 'Teiler', profilePic: AVATARS.chatter } } },
          ].map((btn) => {
            const BtnIcon = btn.icon as ComponentType<{ size?: number; className?: string }>;
            return (
              <button
                key={btn.label}
                onClick={() => void window.studio.sendTestEvent(btn.event as unknown as Record<string, unknown>)}
                className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-raised px-3 py-2 text-left text-xs text-studio-text transition-colors hover:border-studio-accent/50 hover:text-studio-accent"
              >
                <BtnIcon size={14} className="flex-none text-studio-accent" />
                {btn.label}
              </button>
            );
          })}
          {/* Freitext-Chat: damit lassen sich !Befehle (Trigger & Einlösungen) testen */}
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const text = testChat.trim();
              if (!text) return;
              void window.studio.sendTestEvent({
                type: 'chat', ts: 0,
                user: { id: 'chatter', nickname: 'Chatter', profilePic: AVATARS.chatter },
                text,
              } as unknown as Record<string, unknown>);
              setTestChat('');
            }}
          >
            <input
              value={testChat}
              onChange={(e) => setTestChat(e.target.value)}
              placeholder="Eigene Test-Nachricht, z.B. !spin"
              className="bx-input flex-1"
            />
            <button type="submit" className="bx-pill text-[11px] hover:text-studio-teal">
              <MessageSquare size={13} /> Senden
            </button>
          </form>
          <div className="mt-2 border-t border-studio-border pt-3">
            <ConfirmButton
              onConfirm={() => { void window.studio.resetSession(); toast('success', 'Session zurückgesetzt — Zähler & Overlay sind wieder leer.'); }}
              confirmLabel="Zähler & Overlay leeren?"
              className="bx-pill mb-3 w-full justify-center text-[11px] hover:text-studio-accent"
              title="Session-Stats, Bestenlisten und Overlay-Inhalte auf null (z.B. nach Test-Events). Loyalty-Punkte bleiben."
            >
              <RotateCcw size={13} /> Session zurücksetzen
            </ConfirmButton>
            <h3 className="mb-2 text-[10px] uppercase tracking-[0.3em] text-studio-muted">Replay</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void window.studio.replayRecordStart()} className="bx-pill text-[11px] hover:text-studio-accent">
                <CircleDot size={13} /> Aufnahme
              </button>
              <button onClick={() => void window.studio.replayRecordStop()} className="bx-pill text-[11px] hover:text-studio-accent">
                <Square size={13} /> Stop+Save
              </button>
              <button onClick={() => void window.studio.replayPlay(1)} className="bx-pill text-[11px] hover:text-studio-teal">
                <Play size={13} /> Abspielen
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
