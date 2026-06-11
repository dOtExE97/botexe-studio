// tts-service.ts — Text-to-Speech über Microsoft Edge-TTS (gratis, ~20
// kuratierte Stimmen, kein Setup). Liest Chat vor (wie TikFinity) und
// spricht Trigger-Ansagen. Wiedergabe läuft LOKAL im App-Renderer
// (gleiche Schiene wie Alert-Sounds → Mischpult).
//
// Schutzmechanismen:
// • Queue mit Cap (Chat-Spam → älteste fliegen raus, H6-Prinzip)
// • Serielle Wiedergabe über Dauer-Schätzung (~60ms/Zeichen, Muster Alt-App)
// • Text-Hygiene: Längen-Cap, Links raus, Emoji-Fluten eingedampft
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { log } from '../core/logger';
import {
  PiperRuntime,
  getVoiceGroups,
  normalizeVoiceId,
  extForVoice,
  synthesizeWith,
  type VoiceGroup,
} from './tts-providers';

export const DEFAULT_VOICE = 'edge:de-DE-KatjaNeural';
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
  readonly piper: PiperRuntime;
  private readonly cacheDir: string;
  private readonly onAudio: (playback: TTSPlayback) => void;
  private queue: QueueItem[] = [];
  private processing = false;
  private dropped = 0;

  constructor(userDataDir: string, onAudio: (playback: TTSPlayback) => void) {
    this.cacheDir = path.join(userDataDir, 'tts-cache');
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.piper = new PiperRuntime(userDataDir);
    this.onAudio = onAudio;
    // Alte Cache-Files vom letzten Lauf wegräumen
    for (const f of fs.readdirSync(this.cacheDir)) {
      fsp.unlink(path.join(this.cacheDir, f)).catch(() => undefined);
    }
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  getVoiceGroups(): VoiceGroup[] {
    return getVoiceGroups(this.piper);
  }

  /** Piper-Binary + Stimme herunterladen (einmalig, danach offline). */
  async setupPiper(voiceId: string): Promise<void> {
    const id = normalizeVoiceId(voiceId).replace(/^piper:/, '');
    await this.piper.setup(id);
  }

  /**
   * Stabile Stimme pro User (Hash über die User-ID). Pool = bereite Stimmen
   * desselben Providers + derselben Sprache wie die Default-Stimme — bei
   * Piper also nur heruntergeladene Stimmen.
   */
  voiceForUser(userId: string, defaultVoice: string, language: 'de' | 'en' = 'de'): string {
    const normalized = normalizeVoiceId(defaultVoice);
    const provider = normalized.split(':', 1)[0];
    const group = this.getVoiceGroups().find((g) => g.provider === provider);
    const pool = (group?.voices ?? []).filter((v) => v.ready && v.language === language);
    if (pool.length === 0) return normalized;
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    return pool[Math.abs(hash) % pool.length]?.id ?? normalized;
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
    const ext = extForVoice(voice);
    const fileId = `tts-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const target = path.join(this.cacheDir, fileId);

    await Promise.race([
      synthesizeWith(this.piper, text, voice, target),
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
