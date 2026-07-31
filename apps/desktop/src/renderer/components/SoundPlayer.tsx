// SoundPlayer.tsx — spielt Alert-Sounds & TTS LOKAL im App-Renderer ab.
// Das Ausgabegerät (z.B. Rodecaster, virtuelles Kabel oder einfach Standard)
// wird per setSinkId gewählt. Bewusst NICHT im Overlay: der TTLS-Browser
// spielt Audio unzuverlässig (Spec §5).
//
// App-Mixer: jeder Sound trägt eine Kategorie (tts/alert/soundboard/game). Pro
// Kategorie gelten eigene Lautstärke, Mute und optional ein eigenes Ausgabegerät
// (z.B. TTS auf einen anderen Rodecaster-/VoiceMeeter-Kanal legen).
import { useEffect, useRef } from 'react';
import { toast } from './ToastHost';
import {
  DEFAULT_MIXER, normalizeMixer, channelGain, categoryOf, SOUND_CATEGORIES,
  type MixerSettings,
} from '../../shared/mixer';

const MAX_PARALLEL = 4;
const DUCK = 0.3; // andere Sounds auf 30%, während TTS spricht (Ducking)
/** Wachhund: So lange darf sich die Abspielposition eines Sounds NICHT bewegen,
 *  bevor er als hängengeblieben gilt. Großzügig — lieber einmal zu spät
 *  freigeben als einen laufenden Sound abwürgen. */
const WACHHUND_FENSTER_MS = 20_000;

/** <audio> mit setSinkId — nicht in den DOM-Typen, daher schmales Interface. */
type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

/** Alle gerade laufenden Sounds — mit ihrer Abschluss-Funktion, damit ein
 *  vorzeitiger Stopp dieselben Aufräumschritte auslöst wie ein normales Ende
 *  (Ducking zurücknehmen, Zähler senken, Vorlese-Warteschlange freigeben).
 *  Ohne diese Freigabe würde die Warteschlange nach einem Stopp hängen. */
const laufende = new Set<{ a: HTMLAudioElement; beenden: () => void }>();

/** Alles sofort still: Soundboard, Alerts UND laufende Ansagen. */
export function stoppeAlleSounds(): number {
  const anzahl = laufende.size;
  for (const l of [...laufende]) {
    try {
      l.a.pause();
      l.a.currentTime = 0;
    } catch { /* egal — Hauptsache der Rest laeuft */ }
    l.beenden();
  }
  laufende.clear();
  return anzahl;
}

/** Läuft gerade irgendein Sound? (für die Anzeige des Stopp-Knopfs) */
export function laufenSounds(): boolean {
  return laufende.size > 0;
}

export default function SoundPlayer() {
  const playing = useRef(0);
  const sinkId = useRef('');
  const sinkLabel = useRef('');
  // Aufgelöste deviceIds (mit Label-Fallback): 'global' + eine pro Kategorie.
  const sinks = useRef<Record<string, string>>({ global: '' });
  const mixer = useRef<MixerSettings>(DEFAULT_MIXER);
  // Ducking: laufende Nicht-TTS-Sounds + wie viele TTS gerade sprechen.
  const ttsActive = useRef(0);
  const duckable = useRef(new Set<{ a: HTMLAudioElement; base: number }>());

  useEffect(() => {
    // Effektive Ausgabegeräte bestimmen: gespeicherte deviceId wenn noch
    // vorhanden, sonst per Label wiederfinden (deviceIds können nach Neustart/
    // Umstecken wechseln → sonst fällt der Ton auf „System" zurück). Wird für
    // das globale Gerät UND jedes Kanal-Gerät durchgeführt.
    const resolve = async () => {
      let outs: MediaDeviceInfo[] = [];
      try {
        outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
      } catch { /* keine Geräte auflösbar → IDs unverändert nutzen */ }
      const one = (id: string, label: string): string => {
        if (!id) return '';
        if (outs.some((d) => d.deviceId === id)) return id;
        const byLabel = outs.find((d) => label && d.label === label);
        return byLabel ? byLabel.deviceId : id;
      };
      const globalId = one(sinkId.current, sinkLabel.current);
      const next: Record<string, string> = { global: globalId };
      for (const c of SOUND_CATEGORIES) {
        const ch = mixer.current.channels[c];
        next[c] = ch.sinkId ? one(ch.sinkId, ch.sinkLabel) : globalId; // eigenes Gerät oder global
      }
      sinks.current = next;
    };
    void window.studio.getSettings().then((s: { audioOutputId?: string; audioOutputLabel?: string; mixer?: unknown }) => {
      sinkId.current = s.audioOutputId ?? '';
      sinkLabel.current = s.audioOutputLabel ?? '';
      mixer.current = normalizeMixer(s.mixer);
      void resolve();
    });
    const onOutput = (e: Event) => { sinkId.current = (e as CustomEvent<string>).detail ?? ''; void resolve(); };
    const onMixer = (e: Event) => { mixer.current = normalizeMixer((e as CustomEvent).detail); void resolve(); };
    window.addEventListener('bx-audio-output', onOutput);
    window.addEventListener('bx-mixer', onMixer);
    navigator.mediaDevices?.addEventListener?.('devicechange', resolve);
    return () => {
      window.removeEventListener('bx-audio-output', onOutput);
      window.removeEventListener('bx-mixer', onMixer);
      navigator.mediaDevices?.removeEventListener?.('devicechange', resolve);
    };
  }, []);

  useEffect(() => {
    return window.studio.onSoundPlay((cmd) => {
      // Probehören/Mixer-Test läuft bewusst am Mixer VORBEI (volle Lautstärke,
      // globales Gerät) — beim Einstellen muss man immer etwas hören.
      const isPreview = cmd.soundId === 'preview';
      const category = categoryOf(cmd as { category?: (typeof SOUND_CATEGORIES)[number]; soundId: string });
      const isTts = category === 'tts';
      const gain = isPreview ? 1 : channelGain(mixer.current, category);

      // Kanal stumm (gain 0) → gar nicht erst abspielen, aber TTS-Sequencing
      // freigeben, damit die Vorlese-Warteschlange nicht hängen bleibt.
      if (gain <= 0 && !isPreview) { window.studio.reportSoundEnded(cmd.soundId); return; }
      // Sound-Bombing deckeln — aber TTS-Ansagen haben VORRANG und werden nie
      // verworfen (eine verschluckte Follow-/Gift-Ansage fällt sofort auf).
      if (playing.current >= MAX_PARALLEL && !isTts) {
        window.studio.reportSoundEnded(cmd.soundId); // übersprungen → TTS nicht blockieren
        return;
      }

      const audio = new Audio(cmd.url) as SinkAudio;
      // base = gewünschte Lautstärke nach Mixer-Gain (Ducking kommt oben drauf).
      const base = Math.min(1, Math.max(0, cmd.volume)) * gain;
      audio.volume = isTts ? base : base * (ttsActive.current > 0 ? DUCK : 1);
      const entry = { a: audio as HTMLAudioElement, base };
      if (isTts) {
        ttsActive.current++;
        for (const e of duckable.current) e.a.volume = e.base * DUCK; // laufende leiser
      } else {
        duckable.current.add(entry);
      }
      playing.current++;
      let reported = false;
      const report = () => { if (!reported) { reported = true; window.studio.reportSoundEnded(cmd.soundId); } };
      // Genau EINMAL abräumen. Es gibt mehrere Wege hierher (ended, error, ein
      // abgelehntes play(), der Wachhund weiter unten, der Not-Aus-Knopf), und
      // zwei davon können nacheinander eintreten — z.B. der Wachhund und kurz
      // darauf doch noch 'ended'. Ohne diese Sperre würde der Zähler der
      // laufenden Sounds doppelt heruntergezählt, und der Deckel gegen
      // Sound-Bombing wäre für den Rest des Streams zu lasch.
      let fertig = false;
      let wachhund: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        if (fertig) return;
        fertig = true;
        // Wachhund HIER abräumen, nicht am 'ended'-Ereignis: Damit ist jeder
        // Weg abgedeckt — auch der Not-Aus-Knopf und ein abgelehntes play().
        if (wachhund) { clearTimeout(wachhund); wachhund = null; }
        laufende.delete(eintrag);
        playing.current = Math.max(0, playing.current - 1);
        if (isTts) {
          ttsActive.current = Math.max(0, ttsActive.current - 1);
          if (ttsActive.current === 0) for (const e of duckable.current) e.a.volume = e.base; // zurück
        } else {
          duckable.current.delete(entry);
        }
        report(); // echtes Audio-Ende ans Main melden (TTS-Sequencing)
      };
      const eintrag = { a: audio as HTMLAudioElement, beenden: done };
      laufende.add(eintrag);
      // Anzeige aktualisieren (Stopp-Knopf ein-/ausblenden).
      window.dispatchEvent(new CustomEvent('bx-sounds-changed'));
      audio.addEventListener('ended', done, { once: true });
      audio.addEventListener('error', () => { done(); toast('error', 'Sound konnte nicht abgespielt werden.'); }, { once: true });

      // Wachhund gegen den dritten Fall: Ein Sound, der beim Laden HÄNGT, feuert
      // laut Spezifikation weder 'ended' noch 'error' — er wartet einfach.
      // Ohne diesen Wecker liefe done() nie, und die Vorlese-Warteschlange im
      // Kern wartet ewig auf die Ende-Meldung: Ab da bliebe es still.
      //
      // Er misst FORTSCHRITT, nicht Länge. Das ist der entscheidende Punkt: Die
      // App liefert ihre Sounds über den eigenen Server ohne Längenangabe aus,
      // und Chromium meldet dafür `duration = Infinity`. Ein Wecker, der sich
      // auf die Länge verlässt, würde damit jeden längeren Sound nach kurzer
      // Zeit abwürgen — eine Musikdatei mitten im Stream oder eine lange
      // Ansage mitten im Satz. Bewegt sich die Abspielposition, ist alles gut:
      // dann wird nur neu gestellt. Erst wenn sich über das ganze Fenster
      // NICHTS bewegt, ist der Sound wirklich hängengeblieben.
      let letzteStelle = -1;
      const wachhundStellen = () => {
        if (wachhund) { clearTimeout(wachhund); wachhund = null; }
        wachhund = setTimeout(() => {
          const jetzt = audio.currentTime;
          if (jetzt > letzteStelle) { letzteStelle = jetzt; wachhundStellen(); return; } // läuft ja
          console.warn('[Audio] Sound bewegt sich nicht — Warteschlange freigegeben:', cmd.soundId);
          try { audio.pause(); } catch { /* egal */ }
          done();
        }, WACHHUND_FENSTER_MS);
      };
      wachhundStellen();

      // Nach done() nicht mehr starten: Sonst spielt ein Sound, den der
      // Wachhund oder der Not-Aus gerade abgeräumt hat, doch noch los — und
      // liefe dann komplett außerhalb der Buchführung (kein Zähler, kein
      // Ducking, nicht stoppbar).
      const start = () => { if (fertig) return; void audio.play().catch(done); };
      // Gewähltes Ausgabegerät anwenden: Kanal-Gerät (falls gesetzt) sonst global;
      // Vorhören immer global. Bei Fehler trotzdem abspielen (Fallback Standard).
      const targetSink = isPreview ? sinks.current.global : (sinks.current[category] ?? sinks.current.global);
      if (targetSink && audio.setSinkId) {
        // Fehler NICHT verschlucken: Vorher landete das Fehlerobjekt als erstes
        // Argument in start() und war damit weg. Der Ton lief dann still auf dem
        // falschen Gerät — beim Streamer der Klassiker nach dem Umstecken eines
        // USB-Geräts, und nichts sagte, woran es lag.
        audio.setSinkId(targetSink).catch((err: unknown) => {
          const name = (err as { name?: string } | undefined)?.name ?? String(err);
          console.warn('[Audio] Ausgabegerät nicht setzbar, spiele auf dem Standardgerät:', name, targetSink);
        }).finally(start);
      } else {
        start();
      }
    });
  }, []);

  return null;
}
