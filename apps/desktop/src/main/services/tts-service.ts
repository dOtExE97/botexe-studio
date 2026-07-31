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
  SYNTH_TIMEOUT_MS,
  PIPER_VOICES,
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
// SYNTH_TIMEOUT_MS kommt aus tts-providers.ts (geteilt mit dem Edge-Client-Timeout).
/** Geduld für LOKALE Synthese (Piper): rechnet auf der CPU und darf länger brauchen
 *  als der kurze Online-Riegel. Passt zu Pipers eigenem 15s-Abbruch. */
const LOCAL_SYNTH_TIMEOUT_MS = 15_000;
/** So viele Fehlschläge in Folge, bis der Online-Dienst als „streikt" gilt. */
const ONLINE_FEHLER_BIS_PAUSE = 3;
/** So lange wird er dann übersprungen (danach automatisch wieder probiert). */
const ONLINE_PAUSE_MS = 10 * 60_000;

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

/** Einsatzbereite lokale Stimme als Notnagel, wenn die Online-Stimme streikt.
 *  Gibt null zurück, wenn die aktuelle Stimme schon lokal ist (kein Kreisverkehr)
 *  oder nichts vorbereitet wurde. */
export function pickLocalFallbackVoice(piper: PiperRuntime, currentVoice: string): string | null {
  if (normalizeVoiceId(currentVoice).startsWith('piper:')) return null;
  if (!piper.hasBinary?.()) return null;
  const ready = PIPER_VOICES.find((v) => piper.voiceReady(v.id));
  return ready ? `piper:${ready.id}` : null;
}

export class TTSService {
  readonly piper: PiperRuntime;
  private readonly cacheDir: string;
  private readonly onAudio: (playback: TTSPlayback) => void;
  private queue: QueueItem[] = [];
  private processing = false;
  /** Zähler/Sperre für den Online-Dienst (siehe processNext). */
  private onlineFehler = 0;
  private onlineGesperrtBis = 0;
  private dropped = 0;
  /** fileId → Auflöser, der feuert, wenn der Renderer das echte Audio-Ende meldet. */
  private pendingEnded = new Map<string, () => void>();

  private getCredentials: () => Record<string, ByokCredentials>;
  private readonly onError?: (message: string) => void;
  /** Pro-Anbieter aufgelöstes Tuning (resolveTuning aus tts-tuning.ts) —
   *  jeder Provider (edge/piper/openai/polly/elevenlabs/…) bekommt seine
   *  eigenen, bereits mit Vorgaben gefüllten und geklemmten Regler-Werte. */
  private readonly getTuning?: (provider: string) => Record<string, number | string>;

  constructor(
    userDataDir: string,
    onAudio: (playback: TTSPlayback) => void,
    getCredentials: () => Record<string, ByokCredentials> = () => ({}),
    onError?: (message: string) => void,
    getTuning?: (provider: string) => Record<string, number | string>,
  ) {
    this.cacheDir = path.join(userDataDir, 'tts-cache');
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.piper = new PiperRuntime(userDataDir);
    this.getCredentials = getCredentials;
    this.onAudio = onAudio;
    this.onError = onError;
    this.getTuning = getTuning;
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
      // Auch NACKTE Domains nicht vorlesen ("xyz.com", "www.spam.de") —
      // Werbe-/Scam-Links sind der Hauptgrund, warum Streamer TTS fürchten.
      .replace(/\b(?:www\.)?[\w-]+\.(?:com|net|org|de|at|ch|tv|gg|io|me|app|xyz|shop|info|online|site|club|live|store|link|co|to|cc|biz|fun|top)(?:\/\S*)?\b/gi, '')
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
      // Fällt der Fallback statt der echten Rückmeldung, wurde die Ansage
      // vermutlich gar nicht abgespielt (App-Fenster zu, Ton-Ausgabe hängt).
      // Bisher lief die Warteschlange dann einfach still weiter — die Ansagen
      // „verschwanden", ohne dass irgendwo etwas stand.
      const timer = setTimeout(() => {
        if (!settled) {
          log.gedrosselt('tts:keine-rueckmeldung', 60_000, 'warn', 'TTS',
            'Es kam keine Rückmeldung, dass die Ansage fertig gespielt wurde — nach der Sicherheits-Wartezeit wurde '
            + 'weitergemacht. Meist heißt das: Der Ton wurde gar nicht abgespielt (App-Fenster geschlossen oder die '
            + 'Ton-Ausgabe hängt).');
        }
        finish();
      }, p.durationMs + 4000);
      this.pendingEnded.set(p.fileId, finish);
    });
  }

  /** Warteschlange abarbeiten.
   *
   *  Der ganze Rumpf liegt in einem try/catch: Wirft irgendetwas nach dem
   *  Setzen von `processing` (onAudio, onError, waitForPlayback), wurde der
   *  abschließende processNext()-Aufruf früher übersprungen — `processing`
   *  blieb true, und speak() pumpte nie wieder an. Die Sprachausgabe war damit
   *  für den Rest der Sitzung tot: Nachrichten landeten weiter in der Queue,
   *  aber nichts wurde mehr vorgelesen. Ohne Fehler, ohne Meldung, mitten im
   *  Stream. Jetzt wird der Fehler gemeldet und die Queue läuft weiter. */
  private async processNext(): Promise<void> {
    const item = this.queue.shift();
    if (!item) {
      this.processing = false;
      return;
    }
    this.processing = true;
    try {
      await this.processItem(item);
    } catch (err) {
      log.error('TTS', 'Vorlesen abgebrochen', err instanceof Error ? err.message : String(err));
      this.onError?.('Sprachausgabe hat einen Eintrag übersprungen — die Warteschlange läuft weiter.');
    }
    void this.processNext();
  }

  private async processItem(item: QueueItem): Promise<void> {

    let playback: TTSPlayback | null = null;
    let lastMsg = '';

    // Ist der Online-Dienst gerade als „streikt" gemerkt, gar nicht erst warten:
    // sonst kostet JEDE Ansage erneut ~19s Anlauf, bevor die lokale Stimme
    // übernimmt (bei einem Nutzer mit dauerhaft blockiertem Edge-Zugang real
    // beobachtet). Direkt lokal sprechen — das ist sofort da.
    const pauseVoice = this.onlineGesperrtBis > Date.now() ? pickLocalFallbackVoice(this.piper, item.voice) : null;
    if (pauseVoice) {
      try { playback = await this.synthesize(item.text, pauseVoice); }
      catch (err) { lastMsg = (err as Error)?.message || String(err) || 'unbekannter Fehler'; }
    }

    // Bis zu 2 Versuche bei TRANSIENTEN Fehlern (z.B. Edge-TTS 503/Timeout) — schnell
    // scheitern statt lange Stille, danach greift der lokale Fallback unten. Permanente
    // Fehler (falscher Key etc.) brechen sofort ab.
    for (let attempt = 1; !playback && attempt <= 2; attempt++) {
      try { playback = await this.synthesize(item.text, item.voice); break; }
      catch (err) {
        lastMsg = (err as Error)?.message || String(err) || 'unbekannter Fehler';
        if (attempt < 2 && isTransientTtsError(lastMsg)) {
          log.warn('TTS', `Synthese-Versuch ${attempt} fehlgeschlagen (${lastMsg}) — neuer Versuch…`);
          await new Promise((r) => setTimeout(r, 350 * attempt));
          continue;
        }
        break;
      }
    }
    // Online-Stimme streikt weiter? Auf eine bereite lokale Piper-Stimme ausweichen,
    // statt komplett stumm zu bleiben (echter Nutzer-Bug: 30s Stille trotz fertig
    // eingerichtetem Piper).
    if (!playback) {
      // Streik zählen: nach mehreren Fehlschlägen in Folge wird der Online-Dienst
      // eine Weile übersprungen (siehe oben) — sonst wartet jede Ansage aufs Neue.
      this.onlineFehler += 1;
      if (this.onlineFehler >= ONLINE_FEHLER_BIS_PAUSE && this.onlineGesperrtBis <= Date.now()) {
        this.onlineGesperrtBis = Date.now() + ONLINE_PAUSE_MS;
        log.warn('TTS', `Online-Stimme mehrfach nicht erreichbar — für ${Math.round(ONLINE_PAUSE_MS / 60000)} Min. direkt die lokale Stimme nutzen.`);
      }
      const local = pickLocalFallbackVoice(this.piper, item.voice);
      if (local) {
        log.warn('TTS', `Online-Stimme nicht erreichbar (${lastMsg}) → lokale Stimme ${local}`);
        try { playback = await this.synthesize(item.text, local); }
        catch (err) { lastMsg = (err as Error)?.message || lastMsg; }
      }
    } else if (!pauseVoice) {
      // Online hat wieder geklappt → Zähler zurück, Pause aufheben.
      this.onlineFehler = 0;
      this.onlineGesperrtBis = 0;
    }
    if (playback) {
      this.onAudio(playback);
      // Seriell bleiben: auf das ECHTE Audio-Ende warten (Renderer-Rückmeldung),
      // sonst greift nach durationMs+Puffer der Sicherheits-Fallback.
      await this.waitForPlayback(playback);
    } else {
      log.error('TTS', `Synthese fehlgeschlagen (voice=${item.voice})`, lastMsg);
      this.onError?.(
        `Sprachausgabe fehlgeschlagen: ${lastMsg}. Tipp: unter „Stimme" eine lokale ` +
          `Piper-Stimme vorbereiten — die läuft ohne Internet.`,
      );
    }
  }

  async synthesize(text: string, voice: string): Promise<TTSPlayback> {
    const normalized = normalizeVoiceId(voice);
    const ns = normalized.split(':', 1)[0] as string;
    const byokDef = BYOK_PROVIDERS.find((p) => p.id === ns);
    const fileId = `tts-${crypto.randomBytes(6).toString('hex')}.${extForVoice(voice)}`;
    const target = path.join(this.cacheDir, fileId);

    const tuning = this.getTuning?.(ns);
    const work = byokDef
      ? byokSynthesize(
          ns as ByokProviderId,
          text,
          normalized.slice(ns.length + 1),
          this.getCredentials()[ns] ?? {},
          target,
          tuning,
        )
      : synthesizeWith(this.piper, text, voice, target, tuning);

    // Lokale Stimmen (Piper) brauchen auf schwacher Hardware länger als der auf den
    // Online-Dienst getrimmte kurze Riegel — mit 7s würde ausgerechnet der Notnagel
    // scheitern und es bliebe doch still. Piper bricht intern nach 15s selbst ab.
    const budget = ns === 'piper' ? LOCAL_SYNTH_TIMEOUT_MS : SYNTH_TIMEOUT_MS;
    await Promise.race([
      work,
      new Promise((_r, reject) => setTimeout(() => reject(new Error('TTS-Timeout')), budget)),
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
