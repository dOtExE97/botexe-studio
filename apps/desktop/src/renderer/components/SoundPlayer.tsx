// SoundPlayer.tsx — spielt Alert-Sounds & TTS LOKAL im App-Renderer ab.
// Das Ausgabegerät (z.B. Rodecaster, virtuelles Kabel oder einfach Standard)
// wird per setSinkId gewählt. Bewusst NICHT im Overlay: der TTLS-Browser
// spielt Audio unzuverlässig (Spec §5).
import { useEffect, useRef } from 'react';
import { toast } from './ToastHost';

const MAX_PARALLEL = 4;

/** <audio> mit setSinkId — nicht in den DOM-Typen, daher schmales Interface. */
type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

export default function SoundPlayer() {
  const playing = useRef(0);
  const sinkId = useRef('');
  const sinkLabel = useRef('');
  const effectiveSink = useRef(''); // aufgelöste deviceId (mit Label-Fallback)

  useEffect(() => {
    // Effektives Ausgabegerät bestimmen: gespeicherte deviceId wenn noch
    // vorhanden, sonst per Label wiederfinden (deviceIds können nach Neustart/
    // Umstecken wechseln → sonst fällt der Ton auf „System" zurück).
    const resolve = async () => {
      const id = sinkId.current;
      if (!id) { effectiveSink.current = ''; return; }
      try {
        const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
        if (outs.some((d) => d.deviceId === id)) { effectiveSink.current = id; return; }
        const byLabel = outs.find((d) => sinkLabel.current && d.label === sinkLabel.current);
        effectiveSink.current = byLabel ? byLabel.deviceId : id;
      } catch { effectiveSink.current = id; }
    };
    void window.studio.getSettings().then((s: { audioOutputId?: string; audioOutputLabel?: string }) => {
      sinkId.current = s.audioOutputId ?? '';
      sinkLabel.current = s.audioOutputLabel ?? '';
      void resolve();
    });
    const onChange = (e: Event) => { sinkId.current = (e as CustomEvent<string>).detail ?? ''; void resolve(); };
    window.addEventListener('bx-audio-output', onChange);
    navigator.mediaDevices?.addEventListener?.('devicechange', resolve);
    return () => {
      window.removeEventListener('bx-audio-output', onChange);
      navigator.mediaDevices?.removeEventListener?.('devicechange', resolve);
    };
  }, []);

  useEffect(() => {
    return window.studio.onSoundPlay((cmd) => {
      if (playing.current >= MAX_PARALLEL) {
        window.studio.reportSoundEnded(cmd.soundId); // übersprungen → TTS nicht blockieren
        return; // sound-bombing deckeln
      }
      const audio = new Audio(cmd.url) as SinkAudio;
      audio.volume = Math.min(1, Math.max(0, cmd.volume));
      playing.current++;
      let reported = false;
      const report = () => { if (!reported) { reported = true; window.studio.reportSoundEnded(cmd.soundId); } };
      const done = () => {
        playing.current = Math.max(0, playing.current - 1);
        report(); // echtes Audio-Ende ans Main melden (TTS-Sequencing)
      };
      audio.addEventListener('ended', done, { once: true });
      audio.addEventListener('error', () => { done(); toast('error', 'Sound konnte nicht abgespielt werden.'); }, { once: true });
      const start = () => void audio.play().catch(done);
      // Gewähltes Ausgabegerät anwenden (leer = Standard); bei Fehler trotzdem
      // abspielen (Fallback Standard), damit kein Sound verschluckt wird.
      if (effectiveSink.current && audio.setSinkId) {
        audio.setSinkId(effectiveSink.current).then(start, start);
      } else {
        start();
      }
    });
  }, []);

  return null;
}
