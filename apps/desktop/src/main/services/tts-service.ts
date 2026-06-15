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
import {
  BYOK_PROVIDERS,
  byokSynthesize,
  isConfigured,
  type ByokCredentials,
  type ByokProviderId,
} from './tts-byok';

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

/** Vorübergehender Fehler (Server überlastet/Netz) → Retry sinnvoll. Permanente
 *  Fehler (falscher Key, unbekannte Stimme) → kein Retry. */
export function isTransientTtsError(msg: string): boolean {
  return /\b(429|500|502|503|504)\b|timed?\s*out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|fetch failed|server response|temporarily/i
    .test(String(msg || ''));
}

export class TTSService {
  readonly piper: PiperRuntime;
  private readonly cacheDir: string;
  private readonly onAudio: (playback: TTSPlayback) => void;
  private queue: QueueItem[] = [];
  private processing = false;
  private dropped = 0;
  /** fileId → Auflöser, der feuert, wenn der Renderer das echte Audio-Ende meldet. */
  private pendingEnded = new Map<string, () => void>();

  private getCredentials: () => Record<string, ByokCredentials>;
  private readonly onError?: (message: string) => void;

  constructor(
    userDataDir: string,
    onAudio: (playback: TTSPlayback) => void,
    getCredentials: () => Record<string, ByokCredentials> = () => ({}),
    onError?: (message: string) => void,
  ) {
    this.cacheDir = path.join(userDataDir, 'tts-cache');
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.piper = new PiperRuntime(userDataDir);
    this.getCredentials = getCredentials;
    this.onAudio = onAudio;
    this.onError = onError;
    // Alte Cache-Files vom letzten Lauf wegräumen
    for (const f of fs.readdirSync(this.cacheDir)) {
      fsp.unlink(path.join(this.cacheDir, f)).catch(() => undefined);
    }
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  getVoiceGroups(): VoiceGroup[] {
    const base = getVoiceGroups(this.piper);
    const creds = this.getCredentials();
    const byok: VoiceGroup[] = [];
    for (const def of BYOK_PROVIDERS) {
      if (!isConfigured(def.id, creds[def.id])) continue;
      byok.push({
        provider: def.id as unknown as VoiceGroup['provider'],
        label: def.label,
        voices: def.voices.map((v) => ({
          id: `${def.id}:${v.id}`,
          name: v.name,
          language: v.language,
          ready: true,
        })),
      });
    }
    return [...base, ...byok];
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
    // Laufende Wartezeit beenden, damit ein Reset nicht hängt.
    for (const f of [...this.pendingEnded.values()]) f();
  }

  /** Renderer meldet: dieses Audio ist fertig abgespielt → nächste Ansage darf starten. */
  notifyEnded(fileId: string): void {
    this.pendingEnded.get(fileId)?.();
  }

  /** Wartet auf das ECHTE Audio-Ende (Renderer-Rückmeldung) statt auf eine
   *  Zeichen-Schätzung — so überlappen sich mehrere Ansagen nicht mehr. Die
   *  geschätzte Dauer dient nur noch als Sicherheits-Fallback (falls kein 'ended'
   *  kommt, z.B. wenn der Sound wegen Überlast gar nicht gespielt wurde). */
  private waitForPlayback(p: TTSPlayback): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pendingEnded.delete(p.fileId);
        // Kleine Atempause zwischen zwei Ansagen.
        setTimeout(resolve, 180);
      };
      const timer = setTimeout(finish, p.durationMs + 4000);
      this.pendingEnded.set(p.fileId, finish);
    });
  }

  private async processNext(): Promise<void> {
    const item = this.queue.shift();
    if (!item) {
      this.processing = false;
      return;
    }
    this.processing = true;

    // Bis zu 3 Versuche bei TRANSIENTEN Fehlern (z.B. Edge-TTS 503/Timeout) — so
    // schluckt ein Server-Schluckauf keine Ansage mehr. Permanente Fehler (falscher
    // Key etc.) brechen sofort ab.
    let playback: TTSPlayback | null = null;
    let lastMsg = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { playback = await this.synthesize(item.text, item.voice); break; }
      catch (err) {
        lastMsg = (err as Error)?.message || String(err) || 'unbekannter Fehler';
        if (attempt < 3 && isTransientTtsError(lastMsg)) {
          log.warn('TTS', `Synthese-Versuch ${attempt} fehlgeschlagen (${lastMsg}) — neuer Versuch…`);
          await new Promise((r) => setTimeout(r, 350 * attempt));
          continue;
        }
        break;
      }
    }
    if (playback) {
      this.onAudio(playback);
      // Seriell bleiben: auf das ECHTE Audio-Ende warten (Renderer-Rückmeldung),
      // sonst greift nach durationMs+Puffer der Sicherheits-Fallback.
      await this.waitForPlayback(playback);
    } else {
      log.error('TTS', `Synthese fehlgeschlagen (voice=${item.voice})`, lastMsg);
      this.onError?.(`Sprachausgabe fehlgeschlagen: ${lastMsg}`);
    }

    void this.processNext();
  }

  async synthesize(text: string, voice: string): Promise<TTSPlayback> {
    const normalized = normalizeVoiceId(voice);
    const ns = normalized.split(':', 1)[0] as string;
    const byokDef = BYOK_PROVIDERS.find((p) => p.id === ns);
    const fileId = `tts-${crypto.randomBytes(6).toString('hex')}.${extForVoice(voice)}`;
    const target = path.join(this.cacheDir, fileId);

    const work = byokDef
      ? byokSynthesize(
          ns as ByokProviderId,
          text,
          normalized.slice(ns.length + 1),
          this.getCredentials()[ns] ?? {},
          target,
        )
      : synthesizeWith(this.piper, text, voice, target);

    await Promise.race([
      work,
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
