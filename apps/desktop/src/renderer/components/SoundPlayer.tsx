// SoundPlayer.tsx — spielt Alert-Sounds LOKAL im App-Renderer ab
// (System-Audio → Rodecaster). Bewusst NICHT im Overlay: der TTLS-Browser
// spielt Audio unzuverlässig (Spec §5).
import { useEffect, useRef } from 'react';

const MAX_PARALLEL = 4;

export default function SoundPlayer() {
  const playing = useRef(0);

  useEffect(() => {
    return window.studio.onSoundPlay((cmd) => {
      if (playing.current >= MAX_PARALLEL) return; // sound-bombing deckeln
      const audio = new Audio(cmd.url);
      audio.volume = Math.min(1, Math.max(0, cmd.volume));
      playing.current++;
      const done = () => {
        playing.current = Math.max(0, playing.current - 1);
      };
      audio.addEventListener('ended', done, { once: true });
      audio.addEventListener('error', done, { once: true });
      void audio.play().catch(done);
    });
  }, []);

  return null;
}
