// ViewersPage — Zuschauer-Verwaltung: Punkte, VIP, TTS-Sperre, eigene Stimme.
// Basis fürs Glücksrad und das spätere Kartenspiel.
import { useEffect, useState } from 'react';

interface Viewer {
  id: string;
  nickname: string;
  profilePic?: string;
  points: number;
  vip?: boolean;
  muted?: boolean;
  gifts?: number;
  coins?: number;
  likes?: number;
  voice?: string;
}

interface TtsVoice { id: string; name: string }
interface VoiceGroup { provider: string; label: string; voices: TtsVoice[] }

export default function ViewersPage() {
  const [query, setQuery] = useState('');
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [voices, setVoices] = useState<VoiceGroup[]>([]);
  const [currency, setCurrency] = useState('Punkte');

  const refresh = async () => {
    setViewers((await window.studio.listViewers(query)) as Viewer[]);
  };

  useEffect(() => {
    void refresh();
    void window.studio.getTtsVoices().then((v: VoiceGroup[]) => setVoices(v));
    void window.studio.getSettings().then((s: { points: { currencyName: string } }) => setCurrency(s.points.currencyName));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 200);
    return () => clearTimeout(t);
  }, [query]);

  const patchLocal = (id: string, patch: Partial<Viewer>) =>
    setViewers((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const toggleFlag = (v: Viewer, flag: 'vip' | 'muted') => {
    const next = !v[flag];
    patchLocal(v.id, { [flag]: next });
    void window.studio.setViewerFlag(v.id, flag, next);
  };
  const grant = (v: Viewer, delta: number) => {
    patchLocal(v.id, { points: Math.max(0, v.points + delta) });
    void window.studio.grantPoints(v.id, delta);
  };
  const setVoice = (v: Viewer, voice: string) => {
    patchLocal(v.id, { voice: voice || undefined });
    void window.studio.setViewerVoice(v.id, voice);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg uppercase">Zuschauer</h1>
          <p className="mt-1 text-xs text-studio-muted">
            Punkte ({currency}) verwalten, VIPs markieren, Trolle vom Vorlesen sperren, eigene Stimme zuweisen.
            Die Basis fürs Glücksrad und das Kartenspiel.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Zuschauer suchen…"
          className="clip-slant w-64 border border-studio-border bg-studio-raised px-4 py-2 text-sm outline-none placeholder:text-studio-muted/50 focus:border-studio-accent"
        />
      </div>

      {viewers.length === 0 && (
        <div className="border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          {query ? 'Niemand gefunden.' : 'Noch keine Zuschauer — sie erscheinen, sobald jemand im Stream aktiv ist.'}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {viewers.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border border-studio-border bg-studio-panel px-4 py-2.5">
              <div
                className="h-10 w-10 flex-none rounded-full bg-studio-raised bg-cover bg-center"
                style={v.profilePic ? { backgroundImage: `url("${v.profilePic}")` } : undefined}
              />
              <div className="w-40 min-w-0">
                <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                  {v.nickname}
                  {v.vip && <span className="text-[9px] text-studio-gold" title="VIP">★</span>}
                  {v.muted && <span className="text-[9px] text-studio-accent" title="Vom Vorlesen gesperrt">🔇</span>}
                </div>
                <div className="font-mono text-[10px] text-studio-muted">
                  {v.gifts ?? 0} Gifts · {(v.coins ?? 0).toLocaleString('de-DE')} Coins · {(v.likes ?? 0).toLocaleString('de-DE')} Likes
                </div>
              </div>

              {/* Punkte */}
              <div className="flex items-center gap-1">
                <button onClick={() => grant(v, -10)} className="clip-slant bg-studio-raised px-2 py-1 text-xs hover:text-studio-accent">−10</button>
                <span className="w-20 text-center font-mono text-sm text-studio-gold">{v.points.toLocaleString('de-DE')}</span>
                <button onClick={() => grant(v, 10)} className="clip-slant bg-studio-raised px-2 py-1 text-xs hover:text-studio-teal">+10</button>
                <button onClick={() => grant(v, 100)} className="clip-slant bg-studio-raised px-2 py-1 text-xs hover:text-studio-teal">+100</button>
              </div>

              <div className="flex-1" />

              {/* Eigene Stimme */}
              <select
                value={v.voice ?? ''}
                onChange={(e) => setVoice(v, e.target.value)}
                title="Eigene TTS-Stimme für diesen Zuschauer"
                className="max-w-40 border border-studio-border bg-studio-raised px-2 py-1.5 text-[11px] outline-none focus:border-studio-accent"
              >
                <option value="">Stimme: Standard</option>
                {voices.map((g) => (
                  <optgroup key={g.provider} label={g.label}>
                    {g.voices.map((vo) => (
                      <option key={vo.id} value={vo.id}>{vo.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Flags */}
              <button
                onClick={() => toggleFlag(v, 'vip')}
                className={`clip-slant px-3 py-1.5 text-[11px] font-bold ${v.vip ? 'bg-studio-gold/20 text-studio-gold' : 'bg-studio-raised text-studio-muted'}`}
              >
                ★ VIP
              </button>
              <button
                onClick={() => toggleFlag(v, 'muted')}
                className={`clip-slant px-3 py-1.5 text-[11px] font-bold ${v.muted ? 'bg-studio-accent/20 text-studio-accent' : 'bg-studio-raised text-studio-muted'}`}
                title="Vom Chat-Vorlesen ausschließen"
              >
                🔇 Stumm
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
