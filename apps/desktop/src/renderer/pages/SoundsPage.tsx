// SoundsPage — lokale Sound-Bibliothek: importieren, probehören, löschen.
// Wiedergabe läuft immer über den App-SoundPlayer (wie im echten Trigger-Fall).
import { useEffect, useState } from 'react';

interface SoundEntry {
  id: string;
  filename: string;
  sizeBytes: number;
}

interface MyInstantsResult {
  title: string;
  mp3Url: string;
  thumbnail: string | null;
  color: string | null;
}

export default function SoundsPage() {
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [volume, setVolume] = useState(0.7);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MyInstantsResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const refresh = async () => {
    setSounds((await window.studio.listSounds()) as SoundEntry[]);
  };

  useEffect(() => {
    void refresh();
    void window.studio.getSettings().then((s: { soundVolume: number }) => setVolume(s.soundVolume));
  }, []);

  const search = async () => {
    setSearching(true);
    setSearchError('');
    try {
      const r = (await window.studio.searchMyInstants(query)) as {
        ok: boolean;
        error?: string;
        results: MyInstantsResult[];
      };
      setResults(r.results);
      if (!r.ok) setSearchError(r.error ?? 'Suche fehlgeschlagen');
      else if (r.results.length === 0) setSearchError('Nichts gefunden — anderer Begriff?');
    } finally {
      setSearching(false);
    }
  };

  const importResult = async (r: MyInstantsResult) => {
    setImporting(r.mp3Url);
    try {
      const res = (await window.studio.importMyInstants(r.mp3Url, r.title)) as { ok: boolean; id?: string; error?: string };
      if (res.ok) {
        await refresh();
        if (res.id) void window.studio.testSound(res.id); // direkt probehören
      } else {
        setSearchError(res.error ?? 'Import fehlgeschlagen');
      }
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg uppercase">Sounds</h1>
          <p className="mt-1 text-xs text-studio-muted">
            Die App spielt Alert-Sounds lokal ab — sie laufen über dein System-Audio in den Rodecaster, nicht über das Overlay.
          </p>
        </div>
        <button
          onClick={() => void window.studio.importSounds().then(refresh)}
          className="clip-slant bg-studio-accent px-5 py-2.5 font-display text-sm text-black hover:bg-studio-accent-soft"
        >
          + SOUNDS IMPORTIEREN
        </button>
      </div>

      <label className="flex w-72 items-center gap-3 text-xs text-studio-muted">
        Lautstärke
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            void window.studio.updateSettings({ soundVolume: v });
          }}
          className="flex-1 accent-[#ff4d2e]"
        />
        <span className="w-9 font-mono">{Math.round(volume * 100)}%</span>
      </label>

      {/* MyInstants-Suche */}
      <section className="border border-studio-border bg-studio-panel p-4">
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.3em] text-studio-teal">
          MyInstants durchsuchen
        </h2>
        <p className="mb-3 text-[11px] text-studio-muted">
          Sound suchen, Klick auf „Importieren" — landet direkt in deiner Bibliothek und wird einmal angespielt.
        </p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim().length >= 2 && void search()}
            placeholder="z.B. airhorn, bruh, anime wow…"
            className="clip-slant w-80 border border-studio-border bg-studio-raised px-4 py-2 text-sm outline-none placeholder:text-studio-muted/50 focus:border-studio-teal"
          />
          <button
            onClick={() => void search()}
            disabled={searching || query.trim().length < 2}
            className="clip-slant bg-studio-teal/15 px-5 py-2 text-sm font-bold text-studio-teal transition-colors hover:bg-studio-teal hover:text-black disabled:opacity-40"
          >
            {searching ? 'Suche…' : 'SUCHEN'}
          </button>
          {searchError && <span className="self-center text-xs text-studio-accent">{searchError}</span>}
        </div>
        {results.length > 0 && (
          <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1">
            {results.map((r) => (
              <div key={r.mp3Url} className="flex items-center gap-2.5 border border-studio-border bg-studio-raised px-3 py-2">
                <div
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-studio-bg bg-cover bg-center text-sm"
                  style={
                    r.thumbnail
                      ? { backgroundImage: `url("${r.thumbnail}")` }
                      : r.color
                        ? { backgroundColor: r.color }
                        : undefined
                  }
                >
                  {!r.thumbnail && '🔊'}
                </div>
                <div className="min-w-0 flex-1 truncate text-xs" title={r.title}>{r.title}</div>
                <button
                  onClick={() => void importResult(r)}
                  disabled={importing !== null}
                  className="clip-slant flex-none bg-studio-teal/15 px-2.5 py-1 text-[10px] font-bold text-studio-teal hover:bg-studio-teal hover:text-black disabled:opacity-40"
                >
                  {importing === r.mp3Url ? '…' : '+ IMPORT'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {sounds.length === 0 && (
        <div className="border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          Noch keine Sounds. Importiere MP3/WAV/OGG/M4A — z.B. deine TikFinity-Sounds — oder such oben bei MyInstants.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {sounds.map((s) => (
          <div key={s.id} className="clip-slant flex items-center gap-3 border border-studio-border bg-studio-panel px-4 py-3">
            <button
              onClick={() => void window.studio.testSound(s.id)}
              className="clip-slant flex h-9 w-9 flex-none items-center justify-center bg-studio-teal/15 text-studio-teal transition-colors hover:bg-studio-teal hover:text-black"
              title="Probehören (läuft über den echten Sound-Player)"
            >
              ▶
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">{s.filename}</div>
              <div className="font-mono text-[10px] text-studio-muted">{(s.sizeBytes / 1024).toFixed(0)} KB</div>
            </div>
            <button
              onClick={() => void window.studio.deleteSound(s.id).then(refresh)}
              className="text-[11px] text-studio-muted hover:text-studio-accent"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
