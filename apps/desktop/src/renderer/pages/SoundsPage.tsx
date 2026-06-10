// SoundsPage — lokale Sound-Bibliothek: importieren, probehören, löschen.
// Wiedergabe läuft immer über den App-SoundPlayer (wie im echten Trigger-Fall).
import { useEffect, useState } from 'react';

interface SoundEntry {
  id: string;
  filename: string;
  sizeBytes: number;
}

export default function SoundsPage() {
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [volume, setVolume] = useState(0.7);

  const refresh = async () => {
    setSounds((await window.studio.listSounds()) as SoundEntry[]);
  };

  useEffect(() => {
    void refresh();
    void window.studio.getSettings().then((s: { soundVolume: number }) => setVolume(s.soundVolume));
  }, []);

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

      {sounds.length === 0 && (
        <div className="border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          Noch keine Sounds. Importiere MP3/WAV/OGG/M4A — z.B. deine TikFinity-Sounds.
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
