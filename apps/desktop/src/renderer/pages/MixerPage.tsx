// MixerPage — App-interner Sound-Mixer. Pro Kategorie (Vorlese-Stimme, Alerts &
// Gifts, Soundboard, Spiele): Lautstärke, Mute und optional ein EIGENES
// Ausgabegerät. So kann man z.B. die TTS-Stimme auf einen separaten Rodecaster-/
// VoiceMeeter-Kanal legen und getrennt im Stream mischen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sliders, Mic, Gift, AudioLines, Gamepad2, Volume2, VolumeX, Play } from 'lucide-react';
import {
  DEFAULT_MIXER, normalizeMixer, channelGain, SOUND_CATEGORIES, CATEGORY_LABEL,
  type MixerSettings, type SoundCategory,
} from '../../shared/mixer';

const ICON: Record<SoundCategory, typeof Mic> = {
  tts: Mic, alert: Gift, soundboard: AudioLines, game: Gamepad2,
};
const DESC: Record<SoundCategory, string> = {
  tts: 'Die vorgelesene Stimme — Chat-Nachrichten & Ansagen.',
  alert: 'Gift-, Follow- & Alert-Sounds.',
  soundboard: 'Sounds, die du manuell oder per Trigger auslöst.',
  game: 'Spiel-Sounds: Quiz-Auflösung, Glücksrad, Feuerwerk, Gewinner.',
};

interface AudioOut { deviceId: string; label: string }

/** Kurzer Test-Ton auf einem bestimmten Gerät mit gegebener Lautstärke. */
async function playTestTone(deviceId: string, volume: number): Promise<void> {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const withSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (deviceId && withSink.setSinkId) { try { await withSink.setSinkId(deviceId); } catch { /* Standardgerät */ } }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 523; // C5 — freundlicher „pling"
    gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.25; // sanft, nicht erschrecken
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => void ctx.close();
  } catch { /* Test-Ton egal, wenn er scheitert */ }
}

export default function MixerPage() {
  const [mixer, setMixer] = useState<MixerSettings>(DEFAULT_MIXER);
  const [outputs, setOutputs] = useState<AudioOut[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void window.studio.getSettings().then((s: { mixer?: unknown }) => setMixer(normalizeMixer(s.mixer)));
    // Ausgabegeräte auflisten (mit Permission-Dance, sonst leere Namen).
    const md = navigator.mediaDevices;
    const list = () => md?.enumerateDevices()
      .then((ds) => setOutputs(ds.filter((d) => d.kind === 'audiooutput').map((d) => ({ deviceId: d.deviceId, label: d.label || 'Gerät' }))))
      .catch(() => setOutputs([]));
    Promise.resolve(md?.getUserMedia?.({ audio: true }))
      .then((stream) => stream?.getTracks().forEach((t) => t.stop()))
      .catch(() => undefined)
      .finally(() => void list());
  }, []);

  // Live anwenden (Event sofort → SoundPlayer reagiert), Datei-Write gedrosselt.
  const apply = useCallback((next: MixerSettings) => {
    setMixer(next);
    window.dispatchEvent(new CustomEvent('bx-mixer', { detail: next }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void window.studio.updateSettings({ mixer: next }); }, 300);
  }, []);

  const setChannel = (c: SoundCategory, patch: Partial<MixerSettings['channels'][SoundCategory]>) =>
    apply({ ...mixer, channels: { ...mixer.channels, [c]: { ...mixer.channels[c], ...patch } } });

  const setDevice = (c: SoundCategory, deviceId: string) => {
    const label = outputs.find((o) => o.deviceId === deviceId)?.label ?? '';
    setChannel(c, { sinkId: deviceId, sinkLabel: label });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Sliders size={20} className="text-studio-accent" />
        <h1 className="text-lg font-bold">Mixer</h1>
      </div>
      <p className="text-[13px] text-studio-muted">
        Regle jede Sound-Quelle einzeln — Lautstärke, stummschalten, oder auf ein <b>eigenes Ausgabegerät</b> legen.
        So kannst du z.B. die Vorlese-Stimme auf einen separaten Rodecaster-/VoiceMeeter-Kanal schicken und im Stream getrennt mischen. 🎚️
      </p>

      {/* Master */}
      <div className="bx-card p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-bold">Master — alles zusammen</span>
          <span className="font-mono text-xs text-studio-muted">{Math.round(mixer.master * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={1} step={0.01} value={mixer.master}
          onChange={(e) => apply({ ...mixer, master: Number(e.target.value) })}
          className="w-full accent-studio-accent"
        />
      </div>

      {/* Kanäle */}
      {SOUND_CATEGORIES.map((c) => {
        const ch = mixer.channels[c];
        const Icon = ICON[c];
        const effective = channelGain(mixer, c); // Master × Kanal, 0 wenn stumm
        return (
          <div key={c} className={`bx-card space-y-3 p-4 ${ch.muted ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
              <Icon size={20} className="mt-0.5 flex-none text-studio-teal" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{CATEGORY_LABEL[c]}</span>
                  <span className="font-mono text-xs text-studio-muted">
                    {ch.muted ? 'stumm' : `${Math.round(ch.volume * 100)}%`}
                  </span>
                </div>
                <div className="text-[11px] text-studio-muted">{DESC[c]}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setChannel(c, { muted: !ch.muted })}
                title={ch.muted ? 'Ton wieder an' : 'Stummschalten'}
                className={`flex-none rounded-lg p-2 ${ch.muted ? 'bg-studio-accent/20 text-studio-accent' : 'bg-studio-raised/60 text-studio-muted hover:text-studio-text'}`}
              >
                {ch.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range" min={0} max={1} step={0.01} value={ch.volume} disabled={ch.muted}
                onChange={(e) => setChannel(c, { volume: Number(e.target.value) })}
                className="flex-1 accent-studio-teal disabled:opacity-40"
              />
              <button
                onClick={() => void playTestTone(ch.sinkId, effective || ch.volume)}
                title="Test-Ton auf diesem Kanal"
                className="bx-pill flex-none text-xs"
              >
                <Play size={12} className="inline" /> Test
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex-none text-[11px] text-studio-muted">Ausgabegerät:</span>
              <select
                value={ch.sinkId}
                onChange={(e) => setDevice(c, e.target.value)}
                className="flex-1 rounded-lg bg-studio-bg px-2.5 py-1.5 text-xs"
              >
                <option value="">Wie Standard (Einstellungen)</option>
                {outputs.map((o) => <option key={o.deviceId} value={o.deviceId}>{o.label}</option>)}
              </select>
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-studio-muted">
        Das globale Standard-Gerät stellst du in den <b>Einstellungen → Audio-Ausgabe</b> ein. Hier legst du nur fest,
        welche Quelle davon abweichen soll.
      </p>
    </div>
  );
}
