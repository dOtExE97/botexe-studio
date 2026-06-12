// SoundPlayer.tsx — spielt Alert-Sounds & TTS LOKAL im App-Renderer ab.
// Das Ausgabegerät (z.B. Rodecaster, virtuelles Kabel oder einfach Standard)
// wird per setSinkId gewählt. Bewusst NICHT im Overlay: der TTLS-Browser
// spielt Audio unzuverlässig (Spec §5).
import { useEffect, useRef } from 'react';

const MAX_PARALLEL = 4;

/** <audio> mit setSinkId — nicht in den DOM-Typen, daher schmales Interface. */
type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

export default function SoundPlayer() {
  const playing = useRef(0);
  const sinkId = useRef('');

  useEffect(() => {
    void window.studio.getSettings().then((s: { audioOutputId?: string }) => {
      sinkId.current = s.audioOutputId ?? '';
    });
    const onChange = (e: Event) => {
      sinkId.current = (e as CustomEvent<string>).detail ?? '';
    };
    window.addEventListener('bx-audio-output', onChange);
    return () => window.removeEventListener('bx-audio-output', onChange);
  }, []);

  useEffect(() => {
    return window.studio.onSoundPlay((cmd) => {
      if (playing.current >= MAX_PARALLEL) return; // sound-bombing deckeln
      const audio = new Audio(cmd.url) as SinkAudio;
      audio.volume = Math.min(1, Math.max(0, cmd.volume));
      playing.current++;
      const done = () => {
        playing.current = Math.max(0, playing.current - 1);
      };
      audio.addEventListener('ended', done, { once: true });
      audio.addEventListener('error', done, { once: true });
      const start = () => void audio.play().catch(done);
      // Gewähltes Ausgabegerät anwenden (leer = Standard)
      if (sinkId.current && audio.setSinkId) {
        audio.setSinkId(sinkId.current).then(start, start);
      } else {
        start();
      }
    });
  }, []);

  return null;
}
