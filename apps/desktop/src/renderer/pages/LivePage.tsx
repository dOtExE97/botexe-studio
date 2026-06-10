// LivePage — verbinden, zuschauen, testen. Test-Werkzeuge sind bewusst
// immer sichtbar (Single-User-Tool, keine versteckten Dev-Gates).
import { useEffect, useState } from 'react';
import type { useStudio } from '../hooks/useStudio';
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
      {/* Connect-Zeile */}
      <div className="flex items-center gap-3">
        <div className="clip-slant flex items-center border border-studio-border bg-studio-panel">
          <span className="pl-4 pr-1 font-display text-studio-muted">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && username && void toggleConnect()}
            placeholder="dein TikTok-Name"
            disabled={connected}
            className="w-56 bg-transparent py-2.5 pr-4 text-sm outline-none placeholder:text-studio-muted/50 disabled:opacity-60"
          />
        </div>
        <button
          onClick={() => void toggleConnect()}
          disabled={busy || (!connected && !username.trim())}
          className={`clip-slant px-6 py-2.5 font-display text-sm tracking-wide transition-colors disabled:opacity-40 ${
            connected
              ? 'bg-studio-raised text-studio-muted hover:text-studio-text'
              : 'bg-studio-accent text-black hover:bg-studio-accent-soft'
          }`}
        >
          {busy ? '…' : connected ? 'TRENNEN' : 'GO LIVE'}
        </button>
        {error && <span className="text-xs text-studio-accent">{error}</span>}
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
          <div key={card.label} className="clip-slant border-t-2 border-studio-accent bg-studio-panel p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-studio-muted">{card.label}</div>
            <div className="mt-1 font-display text-2xl">{card.value.toLocaleString('de-DE')}</div>
            {card.peak !== undefined && card.peak > 0 && (
              <div className="font-mono text-[10px] text-studio-muted">Peak {card.peak}</div>
            )}
          </div>
        ))}
      </div>

      {/* Event-Feed + Test-Panel */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-4">
        <section className="flex min-h-0 flex-col border border-studio-border bg-studio-panel">
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
        <section className="flex flex-col gap-2 border border-studio-border bg-studio-panel p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">Testen ohne Live</h2>
          <p className="mb-1 text-[11px] leading-relaxed text-studio-muted">
            Schickt echte Events durch die komplette Kette — Trigger, Overlay und Sounds reagieren wie im Stream.
          </p>
          {[
            { label: '🌹 Test-Gift (1 Coin)', event: { type: 'gift', ts: 0, user: { id: 'test', nickname: 'TestUser', profilePic: AVATARS.test }, gift: { slug: 'Rose', count: 1, coinsPerUnit: 1, totalCoins: 1, icon: svgEmoji('🌹') } } },
            { label: '🦁 Test-Gift (500 Coins)', event: { type: 'gift', ts: 0, user: { id: 'spender', nickname: 'BigSpender', profilePic: AVATARS.spender }, gift: { slug: 'Lion', count: 1, coinsPerUnit: 500, totalCoins: 500, icon: svgEmoji('🦁') } } },
            { label: '➕ Test-Follow', event: { type: 'follow', ts: 0, user: { id: 'fan', nickname: 'NeuerFan', profilePic: AVATARS.fan } } },
            { label: '💬 Test-Chat', event: { type: 'chat', ts: 0, user: { id: 'chatter', nickname: 'Chatter', profilePic: AVATARS.chatter }, text: 'Das Overlay sieht stark aus! 🔥' } },
            { label: '❤️ Test-Likes (+50)', event: { type: 'like', ts: 0, user: { id: 'liker', nickname: 'Liker', profilePic: AVATARS.liker }, likeCount: 50, totalLikes: 0 } },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={() => void window.studio.sendTestEvent(btn.event as unknown as Record<string, unknown>)}
              className="clip-slant border border-studio-border bg-studio-raised px-3 py-2 text-left text-xs transition-colors hover:border-studio-accent/50 hover:text-studio-accent"
            >
              {btn.label}
            </button>
          ))}
          <div className="mt-2 border-t border-studio-border pt-3">
            <h3 className="mb-2 text-[10px] uppercase tracking-[0.3em] text-studio-muted">Replay</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void window.studio.replayRecordStart()} className="clip-slant bg-studio-raised px-3 py-1.5 text-[11px] hover:text-studio-accent">● Aufnahme</button>
              <button onClick={() => void window.studio.replayRecordStop()} className="clip-slant bg-studio-raised px-3 py-1.5 text-[11px] hover:text-studio-accent">■ Stop+Save</button>
              <button onClick={() => void window.studio.replayPlay(1)} className="clip-slant bg-studio-raised px-3 py-1.5 text-[11px] hover:text-studio-teal">▶ Abspielen</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
