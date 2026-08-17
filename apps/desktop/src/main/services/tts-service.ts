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
// 25s statt 15s: Die lokale Stimme rechnet auf der CPU. Auf einem Laptop, der
// nebenher streamt, encodiert und den Browser offen hat, reichen 15 Sekunden
// nachweislich oft nicht — dann blieb die Ansage komplett stumm, obwohl die
// Stimme korrekt eingerichtet war. Dass die Ansage dadurch spät kommt, fängt
// das Verwerfen veralteter Ansagen ab (ANSAGE_MAX_ALTER_MS).
const LOCAL_SYNTH_TIMEOUT_MS = 25_000;

/**
 * Wie lange dauert das Vorlesen ungefähr?
 *
 * Die alte Rechnung war „60 ms pro Zeichen". Das geht bei normalem Text auf,
 * aber NICHT bei TikTok-Namen: Ein Emoji ist ein bis zwei Zeichen, wird aber
 * als ganzes Wort gesprochen („Flagge Deutschland", „gekreuzte Schwerter").
 * Ein Name wie „Mika🇩🇪⚽️" wurde dadurch dramatisch unterschätzt.
 *
 * Belegt in einem echten 10-Stunden-Stream: Bei 13 % der Ansagen lief die
 * Sicherheits-Wartezeit ab, BEVOR der Ton fertig war — und die Ansagen ohne
 * Rückmeldung hatten im Schnitt 50 % längere, emoji-reichere Namen als die
 * anderen. Folge: Die Warteschlange lief zu früh weiter und die nächste
 * Ansage redete in die laufende hinein.
 */
export function geschaetzteDauerMs(text: string): number {
  // [...text] zerlegt nach Zeichen, nicht nach UTF-16-Einheiten — ein Emoji
  // zählt so als EINS und nicht als zwei halbe.
  let ms = 0;
  for (const zeichen of text) {
    ms += zeichen.codePointAt(0)! > 0x2100 ? 700 : 60; // Symbol/Emoji vs. Buchstabe
  }
  return Math.max(600, ms);
}
/** So viele Fehlschläge in Folge, bis der Online-Dienst als „streikt" gilt. */
/** Älter als das? Dann lieber schweigen als hinterherhinken. */
const ANSAGE_MAX_ALTER_MS = 90_000;

const ONLINE_FEHLER_BIS_PAUSE = 3;
/** So lange wird er dann übersprungen (danach automatisch wieder probiert). */
// 3 statt 10 Minuten: Bei schwankendem WLAN ist die Leitung oft nach einer
// halben Minute wieder da. Zehn Minuten Roboterstimme nach einem kurzen
// Aussetzer sind für den Zuschauer eine gefühlte Ewigkeit — und der Grund,
// warum es sich anfühlt, als „ginge TTS mal und mal nicht".
const ONLINE_PAUSE_MS = 3 * 60_000;
/** So viele Fehlschläge IN FOLGE schieben einen Notnagel nach hinten.
 *  Drei, nicht einer: Ein einzelner Ausrutscher (kurze Lastspitze, ein
 *  hängendes Paket) soll die Reihenfolge nicht umwerfen — erst ein Muster. */
const NOTNAGEL_FEHLER_BIS_TAUSCH = 3;

interface QueueItem {
  /** Wann die Ansage eingereiht wurde — veraltete werden verworfen (siehe unten). */
  at?: number;
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
  /** Wie viele Ansagen als „zu alt" übersprungen wurden (siehe processNext). */
  private veraltet = 0;
  /** Läuft gerade ein Vorab-Holen? Nur EINE Ansage im Voraus (siehe holeVorab). */
  private vorabLaeuft = false;
  private processing = false;
  /** Zähler/Sperre für den Online-Dienst (siehe processNext). */
  private onlineFehler = 0;
  private onlineGesperrtBis = 0;
  /** Fehlschläge IN FOLGE der beiden Notnägel — entscheidet ihre Reihenfolge. */
  private lokalFehler = 0;
  private gttsFehler = 0;
  /** Nur fürs Log: Ist der Tausch schon gemeldet? */
  private tauschGemeldet = false;

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
    this.queue.push({ text: clean, voice: voice || DEFAULT_VOICE, at: Date.now() });
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
      // GROSSZÜGIG bemessen — und das ist Absicht: Der Renderer hat einen
      // eigenen Wachhund, der einen wirklich hängenden Ton nach 20 Sekunden
      // ohne Fortschritt meldet. Dieser Wecker hier muss also nur den Fall
      // abfangen, dass GAR KEINE Antwort kommt (Fenster weg, IPC verloren).
      //
      // Vorher stand hier `durationMs + 4000` — knapp bemessen auf eine
      // Schätzung, die bei Emoji-Namen deutlich danebenlag. Der Wecker feuerte
      // dann mitten in der laufenden Ansage, die Warteschlange machte weiter,
      // und zwei Stimmen redeten übereinander. Aus einem Sicherheitsnetz war
      // ein Fehlerverursacher geworden.
      const timer = setTimeout(() => {
        if (!settled) {
          log.gedrosselt('tts:keine-rueckmeldung', 60_000, 'warn', 'TTS',
            'Eine Ansage hat sich nicht zurückgemeldet — die Warteschlange läuft weiter, damit sie nicht stehen bleibt. '
            + 'Wenn das öfter vorkommt: Ist das App-Fenster offen und ist im Mischpult der Kanal „Ansagen" hörbar?');
        }
        finish();
      }, p.durationMs * 2 + 10_000);
      // Dieser Wecker darf den Prozess NIEMALS am Leben halten. In der App
      // ändert das nichts (Fenster und IPC halten die Schleife offen), im
      // Testlauf alles: Eine einzige Ansage mit großzügiger Schätzdauer hielt
      // den Node-Prozess nach dem letzten Test noch dreieinhalb Minuten offen.
      // Derselbe Fehler wie beim Verbindungs-Wachhund — deshalb hier gleich
      // mit erledigt.
      timer.unref?.();
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
    // Veraltete Ansagen wegwerfen, statt sie verspätet vorzulesen.
    //
    // Bei langsamer Leitung staut sich die Warteschlange: Erst kommt die
    // Synthese nicht durch, dann liest die App minutenlang alte Follows vor,
    // während im Chat längst etwas anderes passiert. Eine Ansage, die zwei
    // Minuten hinterherhinkt, hilft niemandem — sie verwirrt nur.
    let item = this.queue.shift();
    while (item && item.at !== undefined && Date.now() - item.at > ANSAGE_MAX_ALTER_MS) {
      this.veraltet++;
      log.gedrosselt('tts:veraltet', 60_000, 'info', 'TTS',
        `${this.veraltet} Ansage(n) waren beim Drankommen älter als ${Math.round(ANSAGE_MAX_ALTER_MS / 1000)} Sekunden `
        + 'und wurden übersprungen — sie hätten nur noch verwirrt. Ursache ist fast immer eine langsame Verbindung.');
      item = this.queue.shift();
    }
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
    // WICHTIG: Die Sperre gilt AUCH hier. Vorher lief diese Schleife auch dann
    // gegen die Online-Stimme, wenn sie gerade als „streikt" gesperrt war — man
    // musste nur Pech mit der lokalen Stimme haben, dann war `playback` noch
    // null und Edge wurde trotz Sperre wieder voll angelaufen. Genau der Fall
    // bei einem Nutzer mit schwachem WLAN UND lahmer lokaler Stimme: Die
    // 3-Minuten-Bremse hat nie gegriffen, jede Ansage kostete erneut 12 s.
    const onlineGesperrt = this.onlineGesperrtBis > Date.now();
    for (let attempt = 1; !playback && !onlineGesperrt && attempt <= 2; attempt++) {
      try { playback = await this.synthesize(item.text, item.voice); break; }
      catch (err) {
        lastMsg = (err as Error)?.message || String(err) || 'unbekannter Fehler';
        // Bei einer ZEITÜBERSCHREITUNG bringt ein sofortiger zweiter Versuch mit
        // demselben knappen Budget fast nie etwas — er verdoppelt nur die
        // Wartezeit, bevor die lokale Stimme einspringt. Genau das kostete bei
        // schwachem WLAN ~14 s Stille pro Ansage. Wiederholt wird deshalb nur
        // bei anderen vorübergehenden Fehlern (z.B. 503 vom Dienst).
        const zeitueberschreitung = /timeout|zeit/i.test(lastMsg);
        if (attempt < 2 && isTransientTtsError(lastMsg) && !zeitueberschreitung) {
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
      // ZWEI Notnägel, und die Reihenfolge ist nicht fest.
      //
      // Sie fallen aus verschiedenen Gründen aus: Die lokale Stimme scheitert,
      // wenn der RECHNER ausgelastet ist; Google scheitert, wenn das NETZ weg
      // ist. Welcher der bessere ist, hängt also am Gerät — und ändert sich im
      // Lauf eines Abends. Im Log eines Streamers sprang die lokale Stimme
      // zehnmal ein und war zehnmal zu langsam; Google übernahm danach und
      // lieferte zehn von zehn Mal. Eine feste Reihenfolge kostete ihn also
      // jedes Mal erst eine Wartezeit, bevor überhaupt etwas zu hören war.
      //
      // Darum: Wer zuletzt geliefert hat, kommt zuerst dran. Dieselbe Mechanik
      // wie die Online-Sperre oben, nur eine Ebene tiefer.
      for (const weg of this.notnagelReihenfolge()) {
        if (playback) break;

        if (weg === 'lokal') {
          const local = pickLocalFallbackVoice(this.piper, item.voice);
          if (!local) continue;
          // Den Grund NICHT blind übernehmen: Läuft die Online-Sperre, wurde
          // oben zuerst die LOKALE Stimme versucht — scheitert die, steht in
          // `lastMsg` „Piper-Timeout". Die Meldung behauptete dann
          // „Online-Stimme nicht erreichbar (Piper-Timeout)", also einen
          // Widerspruch in sich. Im echten Log neunmal so aufgetaucht.
          const wegenSperre = this.onlineGesperrtBis > Date.now();
          log.warn('TTS', wegenSperre
            ? `Online-Stimme ist gerade gesperrt (zu viele Fehlversuche) → lokale Stimme ${local}`
            : `Online-Stimme nicht erreichbar (${lastMsg}) → lokale Stimme ${local}`);
          try {
            playback = await this.synthesize(item.text, local);
            this.lokalFehler = 0;
          } catch (err) {
            this.lokalFehler += 1;
            lastMsg = (err as Error)?.message || lastMsg;
          }
          continue;
        }

        // Google: eine ZWEITE Online-Stimme bei einem ganz anderen Anbieter.
        // Technisch der anspruchsloseste Weg von allen — ein einzelner Abruf
        // statt eines Dauergesprächs in vielen Häppchen wie bei Microsoft.
        // Genau deshalb kommt er bei schwachem WLAN oft noch durch.
        if (normalizeVoiceId(item.voice).startsWith('gtts:')) continue;
        const sprache = normalizeVoiceId(item.voice).includes('en-') ? 'gtts:en' : 'gtts:de';
        try {
          playback = await this.synthesize(item.text, sprache);
          this.gttsFehler = 0;
          log.warn('TTS', this.lokalFehler >= NOTNAGEL_FEHLER_BIS_TAUSCH
            ? 'Die Online-Stimme war nicht erreichbar — diese Ansage lief direkt über die einfache '
              + 'Google-Stimme, weil die lokale Stimme zuletzt mehrfach zu langsam war. Sie klingt '
              + 'schlechter, kommt dafür aber an.'
            : 'Weder die gewählte Online-Stimme noch die lokale Stimme haben geantwortet — '
              + 'diese Ansage lief über die einfache Google-Stimme. Sie klingt schlechter, ist aber besser als Stille.');
        } catch (err) {
          this.gttsFehler += 1;
          lastMsg = (err as Error)?.message || lastMsg;
        }
      }
    } else if (!pauseVoice) {
      // Online hat wieder geklappt → Zähler zurück, Pause aufheben.
      this.onlineFehler = 0;
      this.onlineGesperrtBis = 0;
    }
    if (playback) {
      this.onAudio(playback);
      // WÄHREND gesprochen wird, die NÄCHSTE Ansage schon holen.
      //
      // Vorher lief alles streng nacheinander: sprechen, warten, dann erst die
      // nächste Ansage aus dem Netz holen. Die Leitung lag also genau während
      // der 2–6 Sekunden brach, in denen ohnehin nichts zu tun war — und bei
      // schwachem WLAN entstand nach jeder Ansage eine spürbare Lücke.
      //
      // Es braucht keine Übergabe: Die Datei landet unter einem aus dem Text
      // berechneten Namen im Zwischenspeicher. Ist die nächste Ansage dran,
      // findet synthesize() sie dort und ist sofort fertig.
      this.holeVorab();
      // Seriell bleiben: auf das ECHTE Audio-Ende warten (Renderer-Rückmeldung),
      // sonst greift nach durationMs+Puffer der Sicherheits-Fallback.
      await this.waitForPlayback(playback);
    } else {
      // Klartext statt Rätsel: Im Log stand vorher „Synthese fehlgeschlagen
      // (voice=edge:de-DE-KlausNeural) — Piper-Timeout". Der Name sagt Edge,
      // der Fehler sagt Piper — das liest sich wie ein Widerspruch, ist aber
      // die ZWEITE Stufe: Erst streikte die Online-Stimme, dann auch noch die
      // lokale Ersatzstimme. Genau das gehört dagestanden.
      const lokalVersucht = /piper/i.test(lastMsg);
      log.error('TTS', lokalVersucht
        ? `Diese Ansage wurde GAR NICHT gesprochen: erst war die Online-Stimme (${item.voice}) nicht erreichbar, `
          + `dann hat auch die lokale Ersatzstimme nicht geantwortet (${lastMsg}). `
          + 'Prüf unter „Stimme", ob die lokale Stimme wirklich fertig eingerichtet ist.'
        : `Diese Ansage wurde GAR NICHT gesprochen — die Stimme ${item.voice} hat nicht geantwortet (${lastMsg}). `
          + 'Tipp: unter „Stimme" eine lokale Piper-Stimme einrichten, die läuft ohne Internet.');
      this.onError?.(
        `Sprachausgabe fehlgeschlagen: ${lastMsg}. Tipp: unter „Stimme" eine lokale ` +
          `Piper-Stimme vorbereiten — die läuft ohne Internet.`,
      );
    }
  }

  /** Die nächste Ansage im Hintergrund vorbereiten, während die aktuelle läuft.
   *
   *  BEWUSST NUR FÜR ONLINE-STIMMEN: Die warten auf das Netz und kosten kaum
   *  Rechenzeit — das lässt sich gefahrlos parallel machen. Die lokale Stimme
   *  (Piper) rechnet dagegen auf der CPU. Sie parallel zur laufenden Wiedergabe
   *  zu starten, würde auf einem ohnehin ausgelasteten Laptop genau das
   *  Stottern erzeugen, das wir vermeiden wollen.
   *
   *  Fehler werden hier verschluckt: Klappt das Vorabholen nicht, wird die
   *  Ansage später ganz normal erzeugt — inklusive Fehlermeldung. Ein zweites
   *  Mal gemeldet würde sie nur doppelt im Log stehen. */
  private holeVorab(): void {
    const naechste = this.queue[0];
    if (!naechste) return;
    if (this.vorabLaeuft) return; // immer nur EINE Ansage im Voraus
    // Auch bei den ERSTEN Fehlern schon aufhören, nicht erst bei der Sperre:
    // Solange die Leitung hakt, ist ein zusätzlicher Vorab-Versuch parallel zur
    // laufenden Ansage genau das, was die Lage verschlimmert (zwei gleichzeitige
    // Verbindungsaufbauten über dieselbe schwache Leitung).
    const stimme = this.onlineGesperrtBis > Date.now() || this.onlineFehler > 0
      ? null
      : naechste.voice;
    if (!stimme || normalizeVoiceId(stimme).startsWith('piper:')) return;
    this.vorabLaeuft = true;
    void this.synthesize(naechste.text, stimme)
      .catch(() => undefined)
      .finally(() => { this.vorabLaeuft = false; });
  }

  /** Dateiname für Text+Stimme — gleiche Eingabe ergibt immer denselben Namen.
   *  Öffentlich, damit die Namensbildung prüfbar ist, ohne zu synthetisieren. */
  cacheNameFuer(text: string, voice: string, tuning?: Record<string, number | string>): string {
    const normalized = normalizeVoiceId(voice);
    const ns = normalized.split(':', 1)[0] as string;
    const t = tuning ?? this.getTuning?.(ns);
    const schluessel = crypto.createHash('sha1')
      .update(`${normalized}|${text}|${JSON.stringify(t ?? {})}`)
      .digest('hex')
      .slice(0, 16);
    return `tts-${schluessel}.${extForVoice(voice)}`;
  }

  async synthesize(text: string, voice: string): Promise<TTSPlayback> {
    const normalized = normalizeVoiceId(voice);
    const ns = normalized.split(':', 1)[0] as string;
    const byokDef = BYOK_PROVIDERS.find((p) => p.id === ns);
    const tuning = this.getTuning?.(ns);
    // Wiedererkennbarer Name statt Zufall: Derselbe Text mit derselben Stimme
    // ergibt dieselbe Datei — dann muss sie kein zweites Mal erzeugt werden.
    //
    // WARUM DAS WICHTIG IST: Bei schwachem WLAN (Keller, Hotspot) war JEDE
    // Ansage ein neuer Netz-Zugriff mit Verbindungsaufbau zu Microsoft. In
    // einem echten Stream tauchen dieselben Namen aber ständig wieder auf —
    // derselbe Zuschauer kommt rein, folgt, schreibt. Aus dem Zwischenspeicher
    // kommt die Ansage SOFORT und ohne Netz, also auch dann, wenn die Leitung
    // gerade weg ist.
    const fileId = this.cacheNameFuer(text, voice, tuning);
    const target = path.join(this.cacheDir, fileId);

    if (fs.existsSync(target) && fs.statSync(target).size > 0) {
      // Zeitstempel auffrischen, damit das Aufräumen (ältestes zuerst) genau
      // die Ansagen behält, die tatsächlich wiederkehren.
      try { fs.utimesSync(target, new Date(), new Date()); } catch { /* egal */ }
      // Nur im Diagnose-Modus interessant — im Normalbetrieb wäre es Rauschen.
      log.debug('TTS', 'Diese Ansage lag schon fertig vor — kein Netz nötig.');
      return { fileId, durationMs: geschaetzteDauerMs(text) };
    }

    // ERST unter einem Zwischennamen erzeugen, dann umbenennen.
    //
    // Ohne das würde ein Abbruch mitten im Schreiben (Zeitüberschreitung, WLAN
    // weg) eine HALBE Audiodatei unter dem festen Namen hinterlassen — und weil
    // der Name jetzt aus dem Text berechnet wird, käme genau diese abgehackte
    // Ansage von da an immer wieder. Das Umbenennen passiert erst, wenn die
    // Datei vollständig ist, und ist auf einem Datenträger unteilbar.
    // Zwischenname mit ZUFALLSANTEIL. Ohne ihn kollidieren zwei Erzeugungen
    // derselben Ansage: Das Vorabholen schreibt bereits an der Datei, die
    // laufende Ansage endet früher als gedacht, und die reguläre Synthese
    // beginnt an DERSELBEN Zwischendatei — zwei Schreiber, eine Datei, am Ende
    // eine kaputte Ansage unter einem festen Namen. Der Zielname bleibt fest
    // (darum geht es beim Zwischenspeicher), nur der Weg dorthin ist eigen.
    const teil = `${target}.${crypto.randomBytes(4).toString('hex')}.teil`;
    const work = byokDef
      ? byokSynthesize(
          ns as ByokProviderId,
          text,
          normalized.slice(ns.length + 1),
          this.getCredentials()[ns] ?? {},
          teil,
          tuning,
        )
      : synthesizeWith(this.piper, text, voice, teil, tuning);

    // Lokale Stimmen (Piper) brauchen auf schwacher Hardware länger als der auf den
    // Online-Dienst getrimmte kurze Riegel — mit 7s würde ausgerechnet der Notnagel
    // scheitern und es bliebe doch still. Piper bricht intern nach 15s selbst ab.
    const budget = ns === 'piper' ? LOCAL_SYNTH_TIMEOUT_MS : SYNTH_TIMEOUT_MS;
    // Der Zeitriegel MUSS abgeräumt werden, auch (und gerade) wenn die Synthese
    // rechtzeitig fertig war.
    //
    // Vorher lief er nach jeder gelungenen Ansage weiter — bis zu 25 Sekunden
    // ein Timer ohne Zweck, je Ansage einer. Zu sehen war das nirgends: Der
    // Fehler kostet keine Funktion, nur einen Prozess, der nicht zur Ruhe
    // kommt. Im Testlauf hing der Node-Prozess dadurch nach dem letzten
    // grünen Test noch 25 Sekunden.
    let riegel: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work,
        new Promise((_r, reject) => { riegel = setTimeout(() => reject(new Error('TTS-Timeout')), budget); }),
      ]);
      if (!fs.existsSync(teil) || fs.statSync(teil).size === 0) throw new Error('Keine Audio-Datei erzeugt');
      fs.renameSync(teil, target);
    } catch (err) {
      // Bruchstück wegräumen, sonst wächst der Ordner mit unbrauchbaren Resten.
      try { fs.rmSync(teil, { force: true }); } catch { /* dann eben nicht */ }
      throw err;
    } finally {
      clearTimeout(riegel);
    }

    this.cleanupCache();
    return { fileId, durationMs: geschaetzteDauerMs(text) };
  }

  private cleanupCache(): void {
    try {
      // Bruchstücke wegräumen, die ein Absturz mitten in der Synthese
      // hinterlassen hat (im Normalfall räumt synthesize() selbst auf).
      for (const f of fs.readdirSync(this.cacheDir)) {
        if (!f.endsWith('.teil')) continue;
        const pfad = path.join(this.cacheDir, f);
        try {
          if (Date.now() - fs.statSync(pfad).mtimeMs > 5 * 60_000) fs.unlinkSync(pfad);
        } catch { /* egal */ }
      }
      const files = fs
        .readdirSync(this.cacheDir)
        // Liegengebliebene Bruchstücke (.teil) zählen nicht als Ansage — sonst
        // verdrängen sie beim Aufräumen echte, wiederverwendbare Dateien.
        .filter((f) => !f.endsWith('.teil'))
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

  /** In welcher Reihenfolge die beiden Notnägel versucht werden.
   *
   *  Standard ist die lokale Stimme zuerst — sie braucht kein Netz und klingt
   *  besser als Google. Erst wenn sie MEHRFACH IN FOLGE nicht liefert (lahmer
   *  Rechner), rutscht Google davor. Streikt Google seinerseits, geht es
   *  zurück: Bei einem Funkloch ist die lokale Stimme die einzige Rettung. */
  private notnagelReihenfolge(): Array<'lokal' | 'gtts'> {
    const googleZuerst = this.lokalFehler >= NOTNAGEL_FEHLER_BIS_TAUSCH
      && this.gttsFehler < NOTNAGEL_FEHLER_BIS_TAUSCH;
    if (googleZuerst !== this.tauschGemeldet) {
      this.tauschGemeldet = googleZuerst;
      log.info('TTS', googleZuerst
        ? `Die lokale Stimme hat ${this.lokalFehler}× hintereinander nicht rechtzeitig geliefert — `
          + 'ab jetzt wird zuerst die Google-Stimme versucht. Das spart pro Ansage die Wartezeit auf '
          + 'einen Rechner, der gerade nicht hinterherkommt.'
        : 'Die Google-Stimme kommt gerade auch nicht durch — ab jetzt wieder zuerst die lokale Stimme. '
          + 'Die braucht kein Internet.');
    }
    return googleZuerst ? ['gtts', 'lokal'] : ['lokal', 'gtts'];
  }

}
