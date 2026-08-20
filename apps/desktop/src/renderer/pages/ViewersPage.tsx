// ViewersPage — Zuschauer-Verwaltung: Punkte, VIP, TTS-Sperre, eigene Stimme.
// Basis fürs Glücksrad und das spätere Kartenspiel.
import { useEffect, useState } from 'react';
import { Users, Search, Star, VolumeX, Minus, Plus, Play } from 'lucide-react';
import { toast } from '../components/ToastHost';
import { sortiereZuschauer, treueZeile, SORT_LABELS, type SortSchluessel } from './viewers-sortierung';

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
  gameWins?: number;
  welcomeMediaId?: string;
  // Aus TikToks Etiketten (portraitTag) — liegen an fast jeder Nachricht an
  // und wurden bis heute weggeworfen. Fehlt ein Wert, ist er UNBEKANNT.
  folgtSeitTagen?: number;
  fanclubSeitTagen?: number;
  superfanSeitMonaten?: number;
  istTopGifter?: boolean;
  followerCount?: number;
  herkunft?: string;
  lastSeen?: number;
}

interface TtsVoice { id: string; name: string }
interface VoiceGroup { provider: string; label: string; voices: TtsVoice[] }
interface MediaItem { id: string; filename: string; kind: 'image' | 'video' }

/** Punkte-Direkteingabe — controlled, damit live eintreffende Gifts (die die
 *  Punkte extern ändern) eine laufende Eingabe NICHT überschreiben/wegwerfen.
 *  Externe Änderungen werden nur übernommen, wenn das Feld gerade nicht fokussiert ist. */
function PointsInput({ points, onSet }: { points: number; onSet: (target: number) => void }) {
  const [val, setVal] = useState(String(points));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setVal(String(points)); }, [points, focused]);
  return (
    <input
      type="number"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        setFocused(false);
        const target = Math.max(0, Math.round(Number(e.target.value)));
        if (target !== points) onSet(target);
        else setVal(String(points));
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      title="Punkte direkt setzen (Enter)"
      className="bx-input w-20 text-center font-mono text-sm text-studio-gold"
      style={{ padding: '3px 4px' }}
    />
  );
}

export default function ViewersPage() {
  const [query, setQuery] = useState('');
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [voices, setVoices] = useState<VoiceGroup[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [currency, setCurrency] = useState('Punkte');
  const [sortierung, setSortierung] = useState<SortSchluessel>('punkte');

  const refresh = async () => {
    setViewers((await window.studio.listViewers(query)) as Viewer[]);
  };

  useEffect(() => {
    void refresh();
    void window.studio.getTtsVoices().then((v: VoiceGroup[]) => setVoices(v));
    void window.studio.listMedia().then((m: MediaItem[]) => setMedia(m));
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
  const setWelcomeMedia = (v: Viewer, mediaId: string) => {
    patchLocal(v.id, { welcomeMediaId: mediaId || undefined });
    void window.studio.setViewerWelcomeMedia(v.id, mediaId);
  };

  /** Intro einmal ansehen. Läuft über denselben Weg wie im echten Stream —
   *  eine eigene Vorschau-Route würde irgendwann anders aussehen. */
  const introVorschau = async (v: Viewer) => {
    const r = await window.studio.previewIntro(v.id);
    if (!r.ok) toast('warn', r.error ?? 'Vorschau nicht möglich.');
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-lg uppercase">
            <Users size={20} className="text-studio-accent" /> Zuschauer
          </h1>
          <p className="mt-1 text-xs text-studio-muted">
            Punkte ({currency}) verwalten, VIPs markieren, Trolle vom Vorlesen sperren, eigene Stimme zuweisen.
            Darunter steht, was TikTok über jeden mitliefert: wie lange er dir folgt, im Teamherz ist,
            Superfan ist — und wie groß sein eigener Kanal ist.
          </p>
        </div>
        <select
          value={sortierung}
          onChange={(e) => setSortierung(e.target.value as SortSchluessel)}
          title="Sortierung"
          className="bx-select w-48 flex-none py-1.5 text-xs"
        >
          {SORT_LABELS.map((s) => <option key={s.id} value={s.id}>Sortieren: {s.label}</option>)}
        </select>
        <div className="relative w-64 flex-none">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-studio-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zuschauer suchen…"
            className="bx-input"
            style={{ paddingLeft: '2.1rem' }}
          />
        </div>
      </div>

      {viewers.length === 0 && (
        <div className="border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          {query ? 'Niemand gefunden.' : 'Noch keine Zuschauer — sie erscheinen, sobald jemand im Stream aktiv ist.'}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {sortiereZuschauer(viewers, sortierung).map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-lg border border-studio-border bg-studio-raised/40 px-4 py-2.5 transition-colors hover:border-studio-accent/30"
            >
              <div
                className="h-10 w-10 flex-none rounded-full bg-studio-raised bg-cover bg-center"
                style={v.profilePic ? { backgroundImage: `url("${v.profilePic}")` } : undefined}
              />
              <div className="w-52 min-w-0">
                <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                  {v.nickname}
                  {v.vip && <Star size={11} className="flex-none fill-studio-gold text-studio-gold" aria-label="VIP" />}
                  {v.muted && <VolumeX size={11} className="flex-none text-studio-accent" aria-label="Vom Vorlesen gesperrt" />}
                </div>
                <div className="font-mono text-[10px] text-studio-muted">
                  {v.gifts ?? 0} Gifts · {(v.coins ?? 0).toLocaleString('de-DE')} Coins · {(v.likes ?? 0).toLocaleString('de-DE')} Likes
                </div>
                {/* Was TikTok ueber die Beziehung sagt. Bleibt WEG, wenn nichts
                    geliefert wurde — „0 Tage" waere eine erfundene Aussage. */}
                {treueZeile(v) && (
                  <div className="truncate text-[10px] text-studio-teal" title={treueZeile(v)}>
                    {treueZeile(v)}
                  </div>
                )}
              </div>

              {/* Punkte */}
              <div className="flex items-center gap-1">
                <button onClick={() => grant(v, -10)} className="bx-pill px-2 py-1 hover:text-studio-accent" title="−10">
                  <Minus size={12} />10
                </button>
                <PointsInput points={v.points} onSet={(target) => grant(v, target - v.points)} />
                <button onClick={() => grant(v, 10)} className="bx-pill px-2 py-1 hover:text-studio-teal" title="+10">
                  <Plus size={12} />10
                </button>
                <button onClick={() => grant(v, 100)} className="bx-pill px-2 py-1 hover:text-studio-teal" title="+100">
                  <Plus size={12} />100
                </button>
              </div>

              <div className="flex-1" />

              {/* Eigene Stimme */}
              <select
                value={v.voice ?? ''}
                onChange={(e) => setVoice(v, e.target.value)}
                title="Eigene TTS-Stimme für diesen Zuschauer"
                className="bx-select max-w-40 py-1.5 text-[11px]"
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

              {/* Persönliches Intro. WANN es läuft (Betreten/Teamherz), steht in
                  den Einstellungen — hier nur, WER welches bekommt. */}
              <div className="flex items-center gap-1">
                <select
                  value={v.welcomeMediaId ?? ''}
                  onChange={(e) => setWelcomeMedia(v, e.target.value)}
                  title="Persönliches Intro dieses Zuschauers. Wann es läuft (beim Betreten oder beim Teamherz), stellst du unter Einstellungen ein. Braucht ein Medien-Widget im Overlay."
                  className="bx-select max-w-40 py-1.5 text-[11px]"
                >
                  <option value="">Intro: keins</option>
                  {media.map((m) => (
                    <option key={m.id} value={m.id}>{m.kind === 'video' ? '🎬' : '🖼️'} {m.filename}</option>
                  ))}
                </select>
                {/* Vorschau: sonst sieht man erst im echten Stream, ob es passt. */}
                {v.welcomeMediaId && (
                  <button
                    onClick={() => void introVorschau(v)}
                    title="Jetzt im Overlay abspielen — so wie es später beim Zuschauer aussieht"
                    className="rounded px-1.5 py-1 text-studio-muted transition-colors hover:bg-studio-raised hover:text-studio-teal"
                  >
                    <Play size={12} />
                  </button>
                )}
              </div>

              {/* Flags */}
              <button
                onClick={() => toggleFlag(v, 'vip')}
                className={`bx-pill px-3 py-1.5 font-bold ${v.vip ? 'border-studio-gold/40 bg-studio-gold/20 text-studio-gold' : ''}`}
              >
                <Star size={12} className={v.vip ? 'fill-studio-gold' : ''} /> VIP
              </button>
              <button
                onClick={() => toggleFlag(v, 'muted')}
                className={`bx-pill px-3 py-1.5 font-bold ${v.muted ? 'border-studio-accent/40 bg-studio-accent/20 text-studio-accent' : ''}`}
                title="Vom Chat-Vorlesen ausschließen"
              >
                <VolumeX size={12} /> Stumm
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
