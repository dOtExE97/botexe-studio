// tts-service.ts — Text-to-Speech über Microsoft Edge-TTS (gratis, ~20
// kuratierte Stimmen, kein Setup). Liest Chat vor (wie TikFinity) und
// spricht Trigger-Ansagen. Wiedergabe läuft LOKAL im App-Renderer
// (gleiche Schiene wie Alert-Sounds → Mischpult).
//
// Schutzmechanismen:
// • Queue mit Cap (Chat-Spam → älteste fliegen raus, H6-Prinzip)
// • Serielle Wiedergabe über Dauer-Schätzung (~60ms/Zeichen, Muster Alt-App)
// • Text-Hygiene: Längen-Cap, Links raus, Emoji-Fluten eingedampft
import { EdgeTTS } from 'node-edge-tts';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { log } from '../core/logger';

export interface TTSVoice {
  id: string;
  name: string;
  language: 'de' | 'en';
  gender: 'female' | 'male';
}

// Kuratierte Edge-TTS-Stimmen (aus botexe-app übernommen).
export const TTS_VOICES: TTSVoice[] = [
  { id: 'de-DE-KatjaNeural', name: 'Katja (DE, Frau)', language: 'de', gender: 'female' },
  { id: 'de-DE-AmalaNeural', name: 'Amala (DE, Frau)', language: 'de', gender: 'female' },
  { id: 'de-DE-ElkeNeural', name: 'Elke (DE, Frau)', language: 'de', gender: 'female' },
  { id: 'de-DE-LouisaNeural', name: 'Louisa (DE, Frau)', language: 'de', gender: 'female' },
  { id: 'de-DE-MajaNeural', name: 'Maja (DE, Frau)', language: 'de', gender: 'female' },
  { id: 'de-DE-SeraphinaMultilingualNeural', name: 'Seraphina (DE, multilingual)', language: 'de', gender: 'female' },
  { id: 'de-DE-ConradNeural', name: 'Conrad (DE, Mann)', language: 'de', gender: 'male' },
  { id: 'de-DE-FlorianMultilingualNeural', name: 'Florian (DE, multilingual)', language: 'de', gender: 'male' },
  { id: 'de-DE-KillianNeural', name: 'Killian (DE, Mann)', language: 'de', gender: 'male' },
  { id: 'de-DE-KlausNeural', name: 'Klaus (DE, Mann)', language: 'de', gender: 'male' },
  { id: 'de-AT-IngridNeural', name: 'Ingrid (AT, Frau)', language: 'de', gender: 'female' },
  { id: 'de-AT-JonasNeural', name: 'Jonas (AT, Mann)', language: 'de', gender: 'male' },
  { id: 'en-US-JennyNeural', name: 'Jenny (EN-US, Frau)', language: 'en', gender: 'female' },
  { id: 'en-US-AriaNeural', name: 'Aria (EN-US, Frau)', language: 'en', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy (EN-US, Mann)', language: 'en', gender: 'male' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (EN-GB, Frau)', language: 'en', gender: 'female' },
];

export const DEFAULT_VOICE = 'de-DE-KatjaNeural';
const QUEUE_CAP = 8;
const MAX_CACHE_FILES = 60;
const SYNTH_TIMEOUT_MS = 12_000;

interface QueueItem {
  text: string;
  voice: string;
}

export interface TTSPlayback {
  /** Dateiname im tts-Cache — der Overlay-Server serviert ihn unter /tts/. */
  fileId: string;
  durationMs: number;
}

export class TTSService {
  private readonly cacheDir: string;
  private readonly onAudio: (playback: TTSPlayback) => void;
  private queue: QueueItem[] = [];
  private processing = false;
  private dropped = 0;

  constructor(userDataDir: string, onAudio: (playback: TTSPlayback) => void) {
    this.cacheDir = path.join(userDataDir, 'tts-cache');
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.onAudio = onAudio;
    // Alte Cache-Files vom letzten Lauf wegräumen
    for (const f of fs.readdirSync(this.cacheDir)) {
      fsp.unlink(path.join(this.cacheDir, f)).catch(() => undefined);
    }
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  /** Stabile Stimme pro User (Hash über die User-ID → Stimmen-Pool). */
  voiceForUser(userId: string, language: 'de' | 'en' = 'de'): string {
    const pool = TTS_VOICES.filter((v) => v.language === language);
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    return pool[Math.abs(hash) % pool.length]?.id ?? DEFAULT_VOICE;
  }

  /** Text-Hygiene gegen TTS-Trolling: Links raus, Emoji-Fluten kürzen, Cap. */
  static sanitize(text: string, maxLen: number): string {
    let t = text
      .replace(/https?:\/\/\S+/gi, '') // links
      .replace(/(\p{Extended_Pictographic})\1{2,}/gu, '$1') // emoji-fluten → eins
      .replace(/(.)\1{6,}/g, '$1$1$1') // zeichen-spam ("aaaaaaaa")
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length > maxLen) t = `${t.slice(0, maxLen)}…`;
    return t;
  }

  speak(text: string, voice: string): void {
    const clean = text.trim();
    if (!clean) return;
    if (this.queue.length >= QUEUE_CAP) {
      this.queue.shift();
      this.dropped++;
      if (this.dropped % 10 === 1) log.warn('TTS', `Queue voll — ${this.dropped} ansagen gedroppt`);
    }
    this.queue.push({ text: clean, voice: voice || DEFAULT_VOICE });
    if (!this.processing) void this.processNext();
  }

  clear(): void {
    this.queue = [];
  }

  private async processNext(): Promise<void> {
    const item = this.queue.shift();
    if (!item) {
      this.processing = false;
      return;
    }
    this.processing = true;

    try {
      const playback = await this.synthesize(item.text, item.voice);
      this.onAudio(playback);
      // Seriell bleiben: ungefähre Sprechdauer abwarten, dann nächste Ansage.
      await new Promise((r) => setTimeout(r, playback.durationMs + 250));
    } catch (err) {
      log.error('TTS', 'Synthese fehlgeschlagen', (err as Error).message);
    }

    void this.processNext();
  }

  async synthesize(text: string, voice: string): Promise<TTSPlayback> {
    const fileId = `tts-${crypto.randomBytes(6).toString('hex')}.mp3`;
    const target = path.join(this.cacheDir, fileId);
    const lang = voice.split('-').slice(0, 2).join('-');
    const engine = new EdgeTTS({ voice, lang, volume: '+0%' });

    await Promise.race([
      engine.ttsPromise(text, target),
      new Promise((_r, reject) => setTimeout(() => reject(new Error('TTS-Timeout')), SYNTH_TIMEOUT_MS)),
    ]);
    if (!fs.existsSync(target)) throw new Error('Keine Audio-Datei erzeugt');

    this.cleanupCache();
    // ~60ms pro Zeichen (Schätzung aus Alt-App) — gut genug fürs Sequencing.
    return { fileId, durationMs: Math.max(600, text.length * 60) };
  }

  private cleanupCache(): void {
    try {
      const files = fs
        .readdirSync(this.cacheDir)
        .map((f) => ({ f, mtime: fs.statSync(path.join(this.cacheDir, f)).mtimeMs }))
        .sort((a, b) => a.mtime - b.mtime);
      while (files.length > MAX_CACHE_FILES) {
        const oldest = files.shift();
        if (oldest) fs.unlinkSync(path.join(this.cacheDir, oldest.f));
      }
    } catch {
      // cache-aufräumen darf nie was kaputt machen
    }
  }
}
