// settings-store.ts — persistente App-Einstellungen als JSON-File mit
// Schema-Version und atomarem Write (tmp + rename). Trigger-Regeln werden
// beim Laden gefiltert — eine kaputte Regel macht nicht alle Regeln kaputt.
import fs from 'node:fs';
import path from 'node:path';
import type { TriggerRule, Redemption, PanelButton, ChatCommand } from '@botexe/trigger-engine';
import { DEFAULT_POINTS_CONFIG, type PointsConfig } from './points-store';
import { migrateReadWho, type ReadGroup } from './tts-filter';
import type { AnnounceConfig, GiftAnnounceConfig } from './tts-announce';
import { DEFAULT_MIXER, normalizeMixer, type MixerSettings } from '../../shared/mixer';
import { log } from '../core/logger';
import { schreibeAtomar } from '../core/atomar-schreiben';
import { packe, entpacke, type Krypto } from './secret-box';

export const SETTINGS_SCHEMA_VERSION = 7;

export interface TTSSettings {
  enabled: boolean;
  voice: string;
  volume: number;
  readChat: boolean;
  /** 'fixed' = eine Stimme für alle · 'perUser' = stabile Zufalls-Stimme pro User */
  chatVoiceMode: 'fixed' | 'perUser';
  /** Sprech-Tempo in % (-50..+50, 0 = normal) — wirkt bei den Edge-Stimmen. */
  rate: number;
  /** Tonhöhe in Hz-Versatz (-20..+20, 0 = normal) — wirkt bei den Edge-Stimmen. */
  pitch: number;
  /** Mindest-Teamherz-Stufe, damit die Gruppe „Teamherz" vorgelesen wird
   *  (0 = jede Stufe). TikTok liefert die Stufe als Fan-Club-Level mit. */
  teamMinLevel?: number;
  /** Nachrichten, die mit ! beginnen, nicht vorlesen (Befehle). */
  skipCommands: boolean;
  /** Nachrichten, die nur aus einer Zahl bestehen, nicht vorlesen.
   *
   *  Für Zahlenraten & Co.: Dort besteht der Chat minutenlang aus „42", „7",
   *  „100" — jede einzeln vorgelesen ist Lärm, kein Erlebnis. */
  skipNumbers?: boolean;
  /** Emojis im NACHRICHTENTEXT nicht mitsprechen. */
  skipEmojiText?: boolean;
  /** Emojis im NAMEN des Zuschauers nicht mitsprechen („☀️Sarüüüh❤️✨" →
   *  „Sarüüüh"). Besteht ein Name NUR aus Emojis, bleibt er wie er ist —
   *  ein leerer Name wäre schlimmer. */
  skipEmojiName?: boolean;
  maxTextLen: number;
  /** Vorlese-Format, z.B. '{user} sagt: {text}' */
  chatTemplate: string;
  /** Wer vorgelesen wird — Multi-Select (ODER): alle/Follower/Teamherz/Mods/VIPs. */
  readGroups: ReadGroup[];
  /** Nur Nachrichten mit diesem Start-Zeichen vorlesen ('' = aus), z.B. '.'. */
  readPrefix: string;
  /** Ansage „neuer Follower" (unabhängig vom Chat-Vorlesen). */
  announceFollow: AnnounceConfig;
  /** Ansage „großes Gift ab X Coins". */
  announceGift: GiftAnnounceConfig;
  /** Regler-Werte PRO ANBIETER (Edge/Piper/OpenAI/Polly/ElevenLabs) — siehe
   *  tts-tuning.ts. `rate`/`pitch` oben bleiben vorerst als Legacy-Fallback
   *  erhalten; Task 3 liest nur noch aus `tuning`. */
  tuning: Record<string, Record<string, number | string>>;
}

export interface StudioSettings {
  schemaVersion: number;
  lastUsername: string;
  /** Room-ID des zuletzt verbundenen Live — Wechsel = neuer Stream (setzt die
   *  „Letztes Live"-Gift-Markierung zurück, robust gegen Reconnect/Neustart). */
  lastLiveRoomId?: string;
  /** Zoomstufe der App-Oberfläche (1 = normal). Strg +/- verstellte sie bisher
   *  nur bis zum nächsten Start — wer größere Schrift braucht, musste sie jedes
   *  Mal neu einstellen. Wird jetzt gemerkt. */
  uiZoom?: number;
  /** Absturzberichte (Sentry): 'unset' = noch nie gefragt (Erststart zeigt die
   *  Nachfrage), 'on' = zugestimmt, 'off' = abgelehnt. Ohne 'on' wird Sentry
   *  gar nicht initialisiert — es geht nichts raus. */
  telemetry?: 'unset' | 'on' | 'off';
  /** Geschenknamen im OVERLAY: 'original' = wie TikTok sie schickt (Standard,
   *  Zuschauer kennen sie aus der TikTok-Oberfläche), 'de' = deutscher Name und
   *  eigene Umbenennungen aus der Galerie. Betrifft nur die Anzeige im Stream —
   *  Trigger und Zuordnungen laufen immer über den Originalnamen. */
  giftNameLang?: 'original' | 'de';
  /** Wann das persönliche Intro eines Zuschauers läuft:
   *  'join'      = wenn er den Stream betritt (das übliche „Intro")
   *  'sub'       = bei einem Teamherz (bisheriges Verhalten)
   *  'beides'    = bei beidem
   *  'aus'       = nie */
  introTrigger?: 'join' | 'sub' | 'teamherz' | 'beides' | 'aus';
  /** Anzeigename, Profilbild und Livetitel des Streamers selbst.
   *
   *  Kommt aus `WebcastLiveIntroMessage` — NICHT aus `roomInfo`, auf das die App
   *  bis v0.50.0 gewartet hat und das eulerstream nie schickt. Deshalb blieben
   *  diese Felder dauerhaft leer, ohne dass irgendwo ein Fehler stand. */
  hostNickname?: string;
  hostAvatar?: string;
  /** Der Titel des letzten Live („Zocken bis die Sonne aufgeht"). */
  hostTitel?: string;
  /** Follower-Gesamtzahl des Kanals (aus der Raum-Info, nicht aus dem Live-Strom). */
  hostFollower?: number;
  /** Die eigene TikTok-Nutzer-ID (rein numerisch, als Text).
   *
   *  Wird beim Verbinden aus dem Raum-Datensatz gelesen und hier behalten,
   *  damit die Auswertung auch dann weiß, welche Seite die eigene war, wenn
   *  gerade kein Stream läuft. Kein Geheimnis: Die ID steht in jedem
   *  öffentlichen Profil. */
  hostUserId?: string;
  /** Bewegung in der Oberfläche: Zahlen zählen hoch, Kurven zeichnen sich,
   *  Balken wachsen. Auf einem schwachen Rechner kostet das spürbar Leistung —
   *  und wer die App den ganzen Abend offen hat, will die Schau vielleicht
   *  ohnehin nur einmal sehen. `prefers-reduced-motion` des Systems zählt
   *  weiterhin und schaltet unabhängig davon ab. */
  animationen?: boolean;
  soundVolume: number;
  /** Audio-Ausgabegerät für lokale Sounds/TTS (deviceId), '' = Standard. */
  audioOutputId: string;
  /** Label des gewählten Geräts — Fallback, falls die deviceId nach einem
   *  Neustart/Umstecken nicht mehr matcht (dann per Name wiederfinden). */
  audioOutputLabel: string;
  /** App-Mixer: Lautstärke/Mute/Ausgabegerät pro Sound-Kategorie. */
  mixer: MixerSettings;
  triggerRules: TriggerRule[];
  /** Punkte-Einlöse-Store: Chat-Befehl → Punkte ausgeben → Aktion. */
  redemptions: Redemption[];
  /** Manuelles Auslöse-Panel (Soundboard/Schnell-Aktionen) mit Hotkeys. */
  panelButtons: PanelButton[];
  /** Chat-Befehle (Bot): !befehl → Antwort (Overlay/TTS/Chat). */
  chatCommands: ChatCommand[];
  activeLayoutId: string | null;
  tts: TTSSettings;
  /** BYOK-Zugangsdaten pro Provider (lokal, klartext — single-user-tool). */
  ttsCredentials: Record<string, Record<string, string>>;
  points: PointsConfig;
  /** Chat-Moderation: gesperrte Wörter werden nicht vorgelesen. */
  moderation: ModerationSettings;
  /** Giveaway/Verlosung: Zuschauer treten per Join-Wort bei. */
  giveaway: GiveawaySettings;
  /** Stammgast-Begrüßung: wiederkehrende Zuschauer per TTS willkommen heißen. */
  greetReturning: GreetReturningSettings;
  /** football-data.org API-Key für den Sport-Liveticker (lokal). */
  sportApiKey: string;
  /** OBS-Studio-Steuerung (WebSocket) — Trigger können Szenen/Quellen schalten. */
  obs: ObsSettings;
  /** Persistenter Overlay-/Steuer-Token (stabil über Neustarts). */
  controlToken: string;
  /** TikTok „sessionid"-Cookie — schaltet das Chat-Senden frei (sensibel, lokal). */
  tiktokSessionId: string;
  /** TikTok „tt-target-idc"-Cookie — von der Lib zum Senden ZWINGEND verlangt. */
  tiktokTargetIdc: string;
  /** Euler-API-Key (Community gratis) — fürs Verbinden über den Cloud-WebSocket
   *  UND fürs zuverlässige Senden. */
  tiktokSignApiKey: string;
  /** Verbindungsweg: 'cloud' = Eulers gehosteter WebSocket (gratis, Standard),
   *  'direct' = selbst signieren via tiktok-live-connector (braucht Business-Key,
   *  kann dafür Chat senden). */
  tiktokConnectMode: 'cloud' | 'direct';
  /** Beim App-Start automatisch warten, bis der letzte Account live geht, und
   *  dann verbinden (wie TikFinity) — billiger Live-Check, kein Sign-Kontingent. */
  autoLiveWatch: boolean;
  /** KI-Overlay-Assistent: Provider + Modell (Key separat als Secret). */
  ai: { provider: 'gemini' | 'ollama'; model: string };
  /** API-Key für den KI-Assistenten (Gemini) — Secret, nie exportieren. */
  aiApiKey: string;
  /** Gift-Sound-Bremse: frühestens alle N Sekunden derselbe Gift-Sound
   *  (0 = jedes Geschenk triggert). Schützt vor „Rosen-Regen"-Sound-Spam. */
  giftSoundGapSec: number;
  /** Tägliches Auto-Backup der Konfiguration (userData/backups, letzte 7). */
  autoBackup: boolean;
  /** App automatisch mit Windows starten — damit Overlay-Server läuft, BEVOR
   *  OBS/TTLS die Browser-Quelle lädt (sonst „Seite nicht erreichbar"). */
  autostart: boolean;
  /** Fenster schließen legt die App in den Infobereich, statt sie zu beenden.
   *  Schützt vor dem versehentlichen Klick aufs X mitten im Stream — der
   *  Overlay-Server läuft in diesem Prozess. */
  minimizeToTray: boolean;
  /** Merker: Der einmalige Hinweis „App liegt jetzt im Infobereich" wurde
   *  gezeigt. Nur damit er nicht bei jedem Schließen wiederkommt. */
  trayHinweisGezeigt: boolean;
  /** Streamer.bot-Brücke (WebSocket-Client). */
  streamerbot: { enabled: boolean; url: string };
  /** Spotify: vom Nutzer registrierte App-Client-ID (öffentlich, PKCE). */
  spotifyClientId: string;
  /** Spotify OAuth-Tokens (sensibel, lokal — nie an den Renderer). */
  spotifyTokens: import('./spotify-service').SpotifyTokens | null;
}

export interface ObsSettings {
  enabled: boolean;
  url: string;
  password: string;
}

export interface ModerationSettings {
  /** Wörter/Phrasen (kommagetrennt eingegeben) — Nachrichten damit werden vom TTS gesperrt. */
  blockedWords: string[];
}

export interface GiveawaySettings {
  /** Beitritt aktiv (sammelt Teilnehmer, sobald jemand das Join-Wort schreibt). */
  enabled: boolean;
  /** Wort/Befehl zum Beitreten, z.B. '!join' (führende ! egal). */
  joinWord: string;
  /** Eintritts-Kosten in Punkten (0 = gratis). Reicht's nicht, kein Beitritt. */
  entryCost: number;
}

export interface GreetReturningSettings {
  /** Stammgäste beim ersten Chat der Session per TTS begrüßen. */
  enabled: boolean;
  /** Ab dem wievielten Besuch begrüßt wird (2 = ab dem 2. Mal). */
  minVisits: number;
  /** Vorlage, {user} = Name, {visits} = Anzahl Besuche. */
  template: string;
}

const TTS_DEFAULTS: TTSSettings = {
  enabled: true,
  voice: 'de-DE-KatjaNeural',
  volume: 0.8,
  readChat: false,
  chatVoiceMode: 'perUser',
  rate: 0,
  pitch: 0,
  skipCommands: true,
  // Standard AUS: Wer bisher Zahlen vorgelesen bekam, soll das nach einem
  // Update nicht stillschweigend verlieren.
  skipNumbers: false,
  // Beide Standard AUS: Emojis im Text sind oft Teil der Aussage, und ein
  // Update soll niemandem still das Vorlesen verändern.
  skipEmojiText: false,
  skipEmojiName: false,
  maxTextLen: 200,
  chatTemplate: '{user} sagt: {text}',
  readGroups: ['all'],
  readPrefix: '',
  announceFollow: { enabled: false, template: '{user} folgt jetzt! ❤️', voice: '' },
  announceGift: { enabled: false, template: '{user} schenkt {gift}!', voice: '', minCoins: 1000 },
  tuning: {},
};

const DEFAULTS: StudioSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  lastUsername: '',
  telemetry: 'unset',
  giftNameLang: 'original',
  // Standard ist das TEAMHERZ-GESCHENK — das ist, was Streamer meinen. Bis
  // v0.47 stand hier 'sub' (das bezahlte Abo), war aber als „Beim Teamherz"
  // beschriftet. Ergebnis: Intros liefen praktisch nie.
  introTrigger: 'teamherz',
  // Bewegung standardmäßig AN — sie erklärt etwas (Verläufe, Wachstum) und
  // die meisten Rechner tragen sie mühelos. Wer sie nicht will oder braucht,
  // schaltet sie aus; das System-Signal prefers-reduced-motion greift ohnehin.
  animationen: true,
  soundVolume: 0.7,
  audioOutputId: '',
  audioOutputLabel: '',
  mixer: DEFAULT_MIXER,
  triggerRules: [],
  redemptions: [],
  panelButtons: [],
  chatCommands: [],
  activeLayoutId: null,
  tts: TTS_DEFAULTS,
  ttsCredentials: {},
  points: DEFAULT_POINTS_CONFIG,
  moderation: { blockedWords: [] },
  giveaway: { enabled: false, joinWord: '!join', entryCost: 0 },
  greetReturning: { enabled: false, minVisits: 2, template: 'Willkommen zurück, {user}! Schön, dass du wieder dabei bist.' },
  sportApiKey: '',
  obs: { enabled: false, url: 'ws://127.0.0.1:4455', password: '' },
  controlToken: '',
  tiktokSessionId: '',
  tiktokTargetIdc: '',
  tiktokSignApiKey: '',
  tiktokConnectMode: 'cloud',
  autoLiveWatch: true,
  autostart: false,
  minimizeToTray: true,
  trayHinweisGezeigt: false,
  giftSoundGapSec: 0,
  autoBackup: true,
  ai: { provider: 'gemini', model: '' },
  aiApiKey: '',
  streamerbot: { enabled: false, url: 'ws://127.0.0.1:8080/' },
  spotifyClientId: '',
  spotifyTokens: null,
};

function isValidRule(rule: unknown): rule is TriggerRule {
  if (typeof rule !== 'object' || rule === null) return false;
  const r = rule as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.event === 'string' &&
    Array.isArray(r.actions) &&
    typeof r.enabled === 'boolean'
  );
}

function isValidRedemption(red: unknown): red is Redemption {
  if (typeof red !== 'object' || red === null) return false;
  const r = red as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.command === 'string' &&
    typeof r.cost === 'number' &&
    Array.isArray(r.actions) &&
    typeof r.enabled === 'boolean'
  );
}

/** Electrons safeStorage, verpackt und ausfallsicher. Wird per require geholt
 *  statt importiert, damit dieser Store auch außerhalb von Electron läuft
 *  (node:test) — dort meldet er schlicht „keine Verschlüsselung" und alles
 *  verhält sich wie vor dem Tresor. */
function electronKrypto(): Krypto {
  const safeStorage = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return (require('electron') as typeof import('electron')).safeStorage;
    } catch {
      return null;
    }
  })();
  return {
    isEncryptionAvailable: () => safeStorage?.isEncryptionAvailable() ?? false,
    encryptString: (s) => {
      if (!safeStorage) throw new Error('safeStorage nicht verfügbar');
      return safeStorage.encryptString(s);
    },
    decryptString: (b) => {
      if (!safeStorage) throw new Error('safeStorage nicht verfügbar');
      return safeStorage.decryptString(b);
    },
    // Nur Linux liefert hier etwas Sinnvolles; auf Windows/macOS fehlt die
    // Methode (oder meldet 'unknown'). Den Rohwert durchreichen — wie er im Log
    // benannt wird, entscheidet backendName() in secret-box.ts.
    getSelectedStorageBackend: () => safeStorage?.getSelectedStorageBackend?.() ?? '',
  };
}

export class SettingsStore {
  private readonly file: string;
  private readonly krypto: Krypto;
  private cache: StudioSettings;

  /** `krypto` nur für Tests — im Betrieb immer Electrons safeStorage. */
  /** Wird gerufen, wenn Einstellungen NICHT auf die Platte kamen — das Studio
   *  hängt daran eine sichtbare Meldung. Optional, damit der Store in Tests
   *  ohne Drumherum funktioniert. */
  private readonly onSchreibfehler?: (text: string) => void;

  constructor(userDataDir: string, krypto: Krypto = electronKrypto(), onSchreibfehler?: (text: string) => void) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.file = path.join(userDataDir, 'settings.json');
    this.krypto = krypto;
    this.onSchreibfehler = onSchreibfehler;
    this.cache = this.load();
  }

  private load(): StudioSettings {
    if (!fs.existsSync(this.file)) return { ...DEFAULTS };
    try {
      const roh = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Record<string, unknown>;
      // Geheimnisse aus dem verschlüsselten Block zurückholen (s. secret-box.ts).
      // Eine alte Klartext-Datei hat keinen Block und geht unverändert durch.
      const raw = entpacke(roh, this.krypto) as Partial<StudioSettings>;
      if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SETTINGS_SCHEMA_VERSION) {
        // Neuere Version (Downgrade-Szenario): nichts kaputt-migrieren,
        // bekannte Felder defensiv übernehmen.
        log.warn('Settings', `Settings-Version ${raw.schemaVersion} ist neuer als ${SETTINGS_SCHEMA_VERSION}`);
      }
      const merged: StudioSettings = { ...DEFAULTS, ...raw, schemaVersion: SETTINGS_SCHEMA_VERSION };
      // Migration v1→v2: tts-block ergänzen; defensiv mergen falls teilweise da.
      const rawTts = (typeof raw.tts === 'object' && raw.tts !== null ? raw.tts : {}) as Record<string, unknown>;
      merged.tts = { ...TTS_DEFAULTS, ...rawTts };
      // Migration v5→v6: altes Einzel-readWho → Multi-Select readGroups, sofern
      // der gespeicherte Block noch kein Gruppen-Array hatte (altes Verhalten erhalten).
      if (!Array.isArray(rawTts.readGroups) && typeof rawTts.readWho === 'string') {
        merged.tts.readGroups = migrateReadWho(rawTts.readWho);
      }
      delete (merged.tts as unknown as Record<string, unknown>).readWho; // Legacy-Feld entfernen
      // Migration: „Superfans" und „Teamherz" waren EIN Häkchen — die
      // Mindeststufe hing unter „Superfans", obwohl sie zum Teamherz-Fanclub
      // gehört. Wer eine Stufe eingestellt hatte, meinte also Teamherz.
      //
      // Deshalb wird aus „Superfans + Stufe" hier einmalig „Teamherz + Stufe".
      // Ohne das behielte die alte Einstellung ihre Optik und verlöre ihren
      // Sinn: „Superfans" ohne Stufe liest ab sofort JEDEN Superfan vor — das
      // Gegenteil dessen, was eingestellt war.
      const gruppenVorher = merged.tts.readGroups;
      if (Array.isArray(gruppenVorher)
        && gruppenVorher.includes('subs')
        && !gruppenVorher.includes('teamherz')
        && (merged.tts.teamMinLevel ?? 0) > 0) {
        merged.tts.readGroups = gruppenVorher.map((g) => (g === 'subs' ? 'teamherz' : g));
        log.info('Einstellungen', 'Beim Vorlesen wurden „Superfans" und „Teamherz" getrennt — sie sind '
          + 'zweierlei (Superfan = bezahltes Abo, Teamherz = gratis Fanclub mit Stufe). '
          + `Deine Mindeststufe ${merged.tts.teamMinLevel} gehört zum Teamherz und ist dorthin umgezogen.`);
      }
      // Migration: Tuning-Regler PRO ANBIETER (vorher galt rate/pitch global,
      // wirkte aber nur bei Edge). Waren rate/pitch gesetzt und existiert noch
      // kein tuning.edge, wird daraus einmalig tuning.edge gebaut — sonst
      // wären bestehende Edge-Einstellungen nach dem Update weg.
      merged.tts.tuning =
        typeof rawTts.tuning === 'object' && rawTts.tuning !== null
          ? (rawTts.tuning as Record<string, Record<string, number | string>>)
          : {};
      if (!merged.tts.tuning.edge && (typeof rawTts.rate === 'number' || typeof rawTts.pitch === 'number')) {
        merged.tts.tuning = {
          ...merged.tts.tuning,
          edge: { rate: merged.tts.rate, pitch: merged.tts.pitch },
        };
      }
      // Migration v2→v3: credentials-block ergänzen.
      merged.ttsCredentials =
        typeof raw.ttsCredentials === 'object' && raw.ttsCredentials !== null ? raw.ttsCredentials : {};
      // Migration v3→v4: points-config ergänzen.
      merged.points = { ...DEFAULT_POINTS_CONFIG, ...(typeof raw.points === 'object' && raw.points !== null ? raw.points : {}) };
      merged.triggerRules = (Array.isArray(raw.triggerRules) ? raw.triggerRules : []).filter(
        (r: unknown): r is TriggerRule => {
          const ok = isValidRule(r);
          // Mit Namen statt anonym: Sonst weiß man zwar, DASS eine Regel weg
          // ist, aber nicht welche — und sucht sie beim nächsten Stream.
          if (!ok) {
            const bez = (r as { name?: string })?.name ?? (r as { id?: string })?.id ?? 'ohne Namen';
            log.warn('Settings', `Die Trigger-Regel „${bez}" wurde beim Laden verworfen (unvollständiger Eintrag in `
              + 'settings.json) — sie fehlt jetzt in der Regelliste und reagiert auf nichts mehr.');
          }
          return ok;
        },
      );
      // Migration v4→v5: Einlöse-Store + Audio-Output ergänzen.
      merged.redemptions = (Array.isArray(raw.redemptions) ? raw.redemptions : []).filter(
        (r: unknown): r is Redemption => {
          const ok = isValidRedemption(r);
          if (!ok) log.warn('Settings', 'Ungültige Einlösung beim Laden verworfen');
          return ok;
        },
      );
      merged.audioOutputId = typeof raw.audioOutputId === 'string' ? raw.audioOutputId : '';
      merged.audioOutputLabel = typeof raw.audioOutputLabel === 'string' ? raw.audioOutputLabel : '';
      // App-Mixer (additiv): fehlend/kaputt → Defaults, Zahlen geklemmt.
      merged.mixer = normalizeMixer(raw.mixer);
      // Migration v6→v7: Es gab ZWEI globale Master — `soundVolume` (Sounds-Seite)
      // und `mixer.master` —, die BEIDE alles multiplizierten („leise trotz
      // vollem Mixer"). Zusammengeführt zu EINEM (der Mixer-Master führt). Der
      // alte Sounds-Master wird EINMALIG in den Mixer-Master eingerechnet, damit
      // die tatsächliche Lautstärke exakt gleich bleibt; danach ist soundVolume
      // neutral (1) und wird nicht mehr als Master benutzt. Versions-gated, damit
      // es nicht doppelt einrechnet.
      if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion < 7) {
        const altMaster = typeof raw.soundVolume === 'number' ? raw.soundVolume : 1;
        merged.mixer = normalizeMixer({ ...merged.mixer, master: merged.mixer.master * altMaster });
      }
      // Migration v0.47→v0.48: „sub" hieß in der Oberfläche IMMER „Beim
      // Teamherz" — niemand hat je bewusst das bezahlte Abo gewählt, alle
      // haben das gelesen, was dastand. Deshalb auf den Auslöser umstellen,
      // den die Beschriftung versprochen hat. Wer wirklich das Abo will, kann
      // es jetzt gezielt wählen (die Option heißt endlich „Beim Abo").
      if (raw.introTrigger === 'sub') {
        merged.introTrigger = 'teamherz';
        log.info('Settings', 'Intro-Auslöser von „Abo" auf „Teamherz-Geschenk" umgestellt — die Einstellung hieß '
          + 'bisher „Beim Teamherz", meinte aber das bezahlte Abo. Jetzt läuft das Intro beim Teamherz-Geschenk, '
          + 'so wie es dastand. Umstellen kannst du das in den Einstellungen.');
      }
      merged.soundVolume = 1; // Legacy — der Master liegt jetzt allein im Mixer.
      // KI-Assistent (additiv): defensiv mergen.
      const rawAi = (typeof raw.ai === 'object' && raw.ai !== null ? raw.ai : {}) as Record<string, unknown>;
      let aiModel = typeof rawAi.model === 'string' ? rawAi.model.slice(0, 60) : '';
      // Migration: die alten Gemini-Modelle haben kein Gratis-Kontingent mehr
      // (gemini-2.0-flash → limit:0/429, gemini-2.5-flash → 404 für neue Nutzer).
      // Gespeicherte Altwerte auf leer setzen → Fallback nutzt gemini-flash-latest.
      if (/^gemini-2\.(0|5)-flash/i.test(aiModel)) {
        // Sonst wundert man sich, warum in den Einstellungen plötzlich ein
        // anderes Modell steht als zuletzt ausgewählt.
        log.info('Settings', `Das gespeicherte KI-Modell „${aiModel}" wird von Google nicht mehr kostenlos angeboten — `
          + 'die App nimmt jetzt wieder das Standardmodell. Bei Bedarf in den Einstellungen neu wählen.');
        aiModel = '';
      }
      merged.ai = {
        provider: rawAi.provider === 'ollama' ? 'ollama' : 'gemini',
        model: aiModel,
      };
      merged.aiApiKey = typeof raw.aiApiKey === 'string' ? raw.aiApiKey : '';
      const gw = raw.giveaway as Record<string, unknown> | undefined;
      merged.giveaway = {
        enabled: typeof gw?.enabled === 'boolean' ? gw.enabled : false,
        joinWord: typeof gw?.joinWord === 'string' && gw.joinWord.trim() ? gw.joinWord.trim().slice(0, 30) : '!join',
        entryCost: typeof gw?.entryCost === 'number' && gw.entryCost >= 0 ? Math.floor(gw.entryCost) : 0,
      };
      const gr = raw.greetReturning as Record<string, unknown> | undefined;
      merged.greetReturning = {
        enabled: typeof gr?.enabled === 'boolean' ? gr.enabled : false,
        minVisits: typeof gr?.minVisits === 'number' && gr.minVisits >= 2 ? Math.floor(gr.minVisits) : 2,
        template: typeof gr?.template === 'string' && gr.template.trim() ? gr.template.slice(0, 200) : DEFAULTS.greetReturning.template,
      };
      let panelVerworfen = 0;
      merged.panelButtons = (Array.isArray(raw.panelButtons) ? raw.panelButtons : []).filter(
        (b: unknown): b is PanelButton => {
          if (typeof b !== 'object' || b === null) { panelVerworfen++; return false; }
          const r = b as Record<string, unknown>;
          const gueltig = (
            typeof r.id === 'string' &&
            typeof r.label === 'string' &&
            typeof r.action === 'object' && r.action !== null &&
            (r.accelerator === undefined || typeof r.accelerator === 'string')
          );
          if (!gueltig) panelVerworfen++;
          return gueltig;
        },
      );
      if (panelVerworfen > 0) {
        log.warn('Settings', `${panelVerworfen} Knopf/Knöpfe des Auslöse-Panels wurden beim Laden verworfen (kaputter `
          + 'Eintrag in settings.json) — sie fehlen jetzt im Panel, samt ihrer Tastenkürzel.');
      }
      return merged;
    } catch (err) {
      // Der teuerste stille Fall überhaupt: Die App läuft mit LEEREN
      // Einstellungen weiter und überschreibt die kaputte Datei beim nächsten
      // Speichern — dann sind Regeln, Overlays und Zugänge endgültig weg.
      log.error('Settings', `settings.json ist nicht lesbar (${(err as Error).message}) — die App startet mit LEEREN `
        + 'Einstellungen und überschreibt die Datei beim nächsten Speichern. Jetzt nichts umstellen: erst die Datei '
        + 'sichern und über Einstellungen → Backup einspielen ein Auto-Backup aus dem Ordner „backups" zurückholen.');
      return { ...DEFAULTS };
    }
  }

  get(): StudioSettings {
    // Tiefe Kopie — sonst leakt der persistierte Cache als mutable Referenz
    // (eine In-Place-Mutation im Renderer/Engine würde still überleben).
    return structuredClone(this.cache);
  }

  /** Clone-FREIE Read-Referenz auf den Cache — NUR für interne, rein lesende
   *  Hot-Path-Zugriffe (pro Event mehrfach aufgerufen). structuredClone des
   *  ganzen Settings-Objekts bei jeder Chat-Nachricht wäre sonst spürbar.
   *  Niemals mutieren (Readonly erzwingt das auf Top-Level via tsc). */
  peek(): Readonly<StudioSettings> {
    return this.cache;
  }

  update(patch: Partial<Omit<StudioSettings, 'schemaVersion'>>): StudioSettings {
    // Der Cache wird ZUERST gesetzt, und das ist Absicht: Scheitert das
    // Schreiben (Virenscanner oder Backup-Tool hält settings.json offen →
    // EBUSY/EPERM), soll die Sitzung trotzdem mit dem neuen Stand weiterlaufen.
    // Andersherum entstünde echter Schaden — etwa bei Spotify: Die App bekommt
    // beim Erneuern ein NEUES Refresh-Token, kann es nicht speichern, arbeitet
    // weiter mit dem alten, und das lehnt Spotify beim nächsten Versuch zu
    // Recht ab. Ergebnis wäre eine Zwangs-Abmeldung mitten im Stream.
    this.cache = { ...this.cache, ...patch, schemaVersion: SETTINGS_SCHEMA_VERSION };
    // Geheimnisse wandern in den verschlüsselten Block, statt im Klartext auf
    // der Platte zu liegen (s. secret-box.ts).
    const aufPlatte = packe(this.cache as unknown as Record<string, unknown>, SECRET_TOP_LEVEL_FIELDS, this.krypto);
    try {
      schreibeAtomar(this.file, JSON.stringify(aufPlatte, null, 2));
    } catch (err) {
      // Das war der eigentliche Mangel: Der Fehlschlag war vollkommen stumm.
      // Der Streamer sah seine Änderung wirken und fand sie nach dem Neustart
      // nicht wieder, ohne je einen Hinweis bekommen zu haben.
      log.error('Settings', 'Einstellungen konnten NICHT gespeichert werden', (err as Error).message);
      this.onSchreibfehler?.(
        'Einstellungen konnten nicht gespeichert werden — sie gelten nur bis zum Beenden. '
        + 'Blockiert ein Virenscanner oder ein Backup-Programm den Ordner?',
      );
    }
    return this.get();
  }
}

/** Einen TTS-Ansage-Block säubern (nested merge auf den aktuellen Stand,
 *  Bounds) — Teil der Settings-Allowlist-Härtung, s. sanitizeSettingsPatch(). */
function sanitizeAnnounce<T extends { enabled: boolean; template: string; voice: string }>(
  current: T,
  incoming: unknown,
): T {
  if (typeof incoming !== 'object' || incoming === null) return current;
  const i = incoming as Record<string, unknown>;
  return {
    ...current,
    ...(typeof i.enabled === 'boolean' ? { enabled: i.enabled } : {}),
    ...(typeof i.template === 'string' ? { template: i.template.slice(0, 300) } : {}),
    ...(typeof i.voice === 'string' ? { voice: i.voice.slice(0, 100) } : {}),
  };
}

/** Feld-für-Feld-Allowlist mit Typ-Checks/Clamping für PARTIELLE Settings-
 *  Patches — die EINE Härtung, die für `IPC.SETTINGS_UPDATE` UND für den
 *  Backup-Import (`studio.ts#importConfig`) gilt (P3a-Audit).
 *
 *  Vorher lag diese Logik nur inline im `IPC.SETTINGS_UPDATE`-Handler
 *  (main.ts) — der Import-Pfad validierte separat nur triggerRules/
 *  chatCommands/redemptions/panelButtons und reichte ALLE anderen Felder
 *  (mixer, tts, points, giveaway, obs, moderation, …) roh an
 *  `SettingsStore.update()` durch. Das ist exakt dieselbe Fehlerklasse wie
 *  der `actions:[null]`-Crash (Commit f5b6441), nur an einem zweiten,
 *  ungepatchten Eingang zum selben Store: ein altes/manipuliertes Backup mit
 *  z.B. `mixer.master: "laut"` oder `points.perChat: "10"` (String statt
 *  Zahl) überschrieb den Live-Cache ungeprüft und wurde beim nächsten Write
 *  wieder auf Platte persistiert.
 *
 *  Unbekannte/falsch typisierte Felder werden NICHT übernommen — der
 *  jeweils aktuelle Wert (`current`) bleibt bestehen, statt auf einen
 *  Default zurückzufallen (wichtig für PARTIELLE Updates: ein Patch, der nur
 *  `mixer` ändert, darf `tts` nicht anfassen). */
export function sanitizeSettingsPatch(patch: unknown, current: StudioSettings): Partial<StudioSettings> {
  if (typeof patch !== 'object' || patch === null) return {};
  const p = patch as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};

  if (typeof p.soundVolume === 'number') allowed.soundVolume = Math.min(1, Math.max(0, p.soundVolume));
  if (typeof p.lastUsername === 'string') allowed.lastUsername = p.lastUsername;
  if (typeof p.lastLiveRoomId === 'string') allowed.lastLiveRoomId = p.lastLiveRoomId.slice(0, 60);
  if (typeof p.audioOutputId === 'string') allowed.audioOutputId = p.audioOutputId.slice(0, 200);
  if (typeof p.audioOutputLabel === 'string') allowed.audioOutputLabel = p.audioOutputLabel.slice(0, 120);
  if (typeof p.uiZoom === 'number' && Number.isFinite(p.uiZoom)) allowed.uiZoom = Math.min(2, Math.max(0.5, p.uiZoom));
  if (p.activeLayoutId === null || typeof p.activeLayoutId === 'string') allowed.activeLayoutId = p.activeLayoutId;

  if (typeof p.points === 'object' && p.points !== null) {
    const pc = p.points as Record<string, unknown>;
    const cur = current.points;
    allowed.points = {
      ...cur,
      ...(typeof pc.enabled === 'boolean' ? { enabled: pc.enabled } : {}),
      ...(typeof pc.perChat === 'number' ? { perChat: Math.max(0, pc.perChat) } : {}),
      ...(typeof pc.perFollow === 'number' ? { perFollow: Math.max(0, pc.perFollow) } : {}),
      ...(typeof pc.perLike === 'number' ? { perLike: Math.max(0, pc.perLike) } : {}),
      ...(typeof pc.perCoin === 'number' ? { perCoin: Math.max(0, pc.perCoin) } : {}),
      ...(typeof pc.perMinute === 'number' ? { perMinute: Math.max(0, pc.perMinute) } : {}),
      ...(typeof pc.currencyName === 'string' ? { currencyName: pc.currencyName.slice(0, 24) } : {}),
    };
  }
  if (typeof p.tts === 'object' && p.tts !== null) {
    const t = p.tts as Record<string, unknown>;
    const cur = current.tts;
    allowed.tts = {
      ...cur,
      ...(typeof t.enabled === 'boolean' ? { enabled: t.enabled } : {}),
      ...(typeof t.voice === 'string' ? { voice: t.voice } : {}),
      ...(typeof t.volume === 'number' ? { volume: Math.min(1, Math.max(0, t.volume)) } : {}),
      ...(typeof t.readChat === 'boolean' ? { readChat: t.readChat } : {}),
      ...(t.chatVoiceMode === 'fixed' || t.chatVoiceMode === 'perUser' ? { chatVoiceMode: t.chatVoiceMode } : {}),
      ...(typeof t.skipCommands === 'boolean' ? { skipCommands: t.skipCommands } : {}),
      ...(typeof t.skipNumbers === 'boolean' ? { skipNumbers: t.skipNumbers } : {}),
      ...(typeof t.skipEmojiText === 'boolean' ? { skipEmojiText: t.skipEmojiText } : {}),
      ...(typeof t.skipEmojiName === 'boolean' ? { skipEmojiName: t.skipEmojiName } : {}),
      ...(typeof t.maxTextLen === 'number' ? { maxTextLen: Math.min(500, Math.max(20, t.maxTextLen)) } : {}),
      ...(typeof t.chatTemplate === 'string' ? { chatTemplate: t.chatTemplate } : {}),
      ...(typeof t.teamMinLevel === 'number' ? { teamMinLevel: Math.min(50, Math.max(0, Math.round(t.teamMinLevel))) } : {}),
      ...(typeof t.rate === 'number' ? { rate: Math.min(50, Math.max(-50, Math.round(t.rate))) } : {}),
      ...(typeof t.pitch === 'number' ? { pitch: Math.min(20, Math.max(-20, Math.round(t.pitch))) } : {}),
      ...(Array.isArray(t.readGroups)
        ? {
            readGroups: (t.readGroups as unknown[]).filter(
              (g): g is ReadGroup =>
                typeof g === 'string' && ['all', 'followers', 'subs', 'teamherz', 'mods', 'vips'].includes(g),
            ),
          }
        : {}),
      ...(typeof t.readPrefix === 'string' ? { readPrefix: t.readPrefix.slice(0, 3) } : {}),
      ...(t.announceFollow !== undefined ? { announceFollow: sanitizeAnnounce(cur.announceFollow, t.announceFollow) } : {}),
      ...(t.announceGift !== undefined
        ? {
            announceGift: {
              ...sanitizeAnnounce(cur.announceGift, t.announceGift),
              minCoins: (() => {
                const m = (t.announceGift as { minCoins?: unknown })?.minCoins;
                return typeof m === 'number' && Number.isFinite(m) ? Math.min(1_000_000, Math.max(0, Math.round(m))) : cur.announceGift.minCoins;
              })(),
            },
          }
        : {}),
      // Regler pro Anbieter — Werte werden ohnehin beim Anwenden über
      // resolveTuning() geklemmt (tts-tuning.ts), hier nur roh durchlassen.
      ...(typeof t.tuning === 'object' && t.tuning !== null ? { tuning: t.tuning as TTSSettings['tuning'] } : {}),
    };
  }
  if (typeof p.sportApiKey === 'string') allowed.sportApiKey = p.sportApiKey.trim().slice(0, 120);
  if (typeof p.aiApiKey === 'string') allowed.aiApiKey = p.aiApiKey.trim().slice(0, 200);
  if (typeof p.ai === 'object' && p.ai !== null) {
    const a = p.ai as Record<string, unknown>;
    allowed.ai = {
      provider: a.provider === 'ollama' ? 'ollama' : 'gemini',
      model: typeof a.model === 'string' ? a.model.trim().slice(0, 60) : '',
    };
  }
  if (typeof p.tiktokSignApiKey === 'string') allowed.tiktokSignApiKey = p.tiktokSignApiKey.trim().slice(0, 200);
  if (p.tiktokConnectMode === 'cloud' || p.tiktokConnectMode === 'direct') allowed.tiktokConnectMode = p.tiktokConnectMode;
  if (typeof p.autoLiveWatch === 'boolean') allowed.autoLiveWatch = p.autoLiveWatch;
  if (typeof p.autostart === 'boolean') allowed.autostart = p.autostart;
  if (typeof p.minimizeToTray === 'boolean') allowed.minimizeToTray = p.minimizeToTray;
  if (typeof p.animationen === 'boolean') allowed.animationen = p.animationen;
  if (typeof p.trayHinweisGezeigt === 'boolean') allowed.trayHinweisGezeigt = p.trayHinweisGezeigt;
  if (typeof p.giftSoundGapSec === 'number') allowed.giftSoundGapSec = Math.min(600, Math.max(0, Math.round(p.giftSoundGapSec)));
  if (typeof p.autoBackup === 'boolean') allowed.autoBackup = p.autoBackup;
  if (p.telemetry === 'on' || p.telemetry === 'off') allowed.telemetry = p.telemetry;
  if (p.giftNameLang === 'original' || p.giftNameLang === 'de') allowed.giftNameLang = p.giftNameLang;
  if (p.introTrigger === 'join' || p.introTrigger === 'sub' || p.introTrigger === 'teamherz'
    || p.introTrigger === 'beides' || p.introTrigger === 'aus') {
    allowed.introTrigger = p.introTrigger;
  }
  if (typeof p.mixer === 'object' && p.mixer !== null) allowed.mixer = normalizeMixer(p.mixer);
  if (typeof p.spotifyClientId === 'string') allowed.spotifyClientId = p.spotifyClientId.trim().slice(0, 100);
  if (typeof p.moderation === 'object' && p.moderation !== null) {
    const m = p.moderation as Record<string, unknown>;
    if (Array.isArray(m.blockedWords)) {
      allowed.moderation = {
        blockedWords: m.blockedWords
          .filter((w): w is string => typeof w === 'string')
          .map((w) => w.trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 200),
      };
    }
  }
  // OBS/Streamer.bot/Giveaway/Stammgast-Begrüßung haben sonst eigene, dedizierte
  // Setter (setObsConfig/setStreamerbotConfig/setGiveawayConfig/setGreetReturning)
  // mit derselben Art Härtung — die braucht aber jeder Aufrufer EINZELN. Der
  // Backup-Import mergt alle Felder in EINEM Rutsch über settings.update(),
  // also müssen sie auch hier (in der gemeinsamen Allowlist) behandelt werden,
  // sonst bleibt genau diese Lücke bestehen (P3a-Audit).
  if (typeof p.obs === 'object' && p.obs !== null) {
    const o = p.obs as Record<string, unknown>;
    const cur = current.obs;
    allowed.obs = {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : cur.enabled,
      url: typeof o.url === 'string' ? o.url.slice(0, 200) : cur.url,
      password: typeof o.password === 'string' ? o.password.slice(0, 200) : cur.password,
    };
  }
  if (typeof p.streamerbot === 'object' && p.streamerbot !== null) {
    const s = p.streamerbot as Record<string, unknown>;
    const cur = current.streamerbot;
    allowed.streamerbot = {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : cur.enabled,
      url: typeof s.url === 'string' ? s.url.slice(0, 200) : cur.url,
    };
  }
  if (typeof p.giveaway === 'object' && p.giveaway !== null) {
    const g = p.giveaway as Record<string, unknown>;
    const cur = current.giveaway;
    allowed.giveaway = {
      enabled: typeof g.enabled === 'boolean' ? g.enabled : cur.enabled,
      joinWord: typeof g.joinWord === 'string' && g.joinWord.trim() ? g.joinWord.trim().slice(0, 30) : cur.joinWord,
      entryCost: typeof g.entryCost === 'number' && g.entryCost >= 0 ? Math.floor(g.entryCost) : cur.entryCost,
    };
  }
  if (typeof p.greetReturning === 'object' && p.greetReturning !== null) {
    const g = p.greetReturning as Record<string, unknown>;
    const cur = current.greetReturning;
    allowed.greetReturning = {
      enabled: typeof g.enabled === 'boolean' ? g.enabled : cur.enabled,
      minVisits: typeof g.minVisits === 'number' && g.minVisits >= 2 ? Math.floor(g.minVisits) : cur.minVisits,
      template: typeof g.template === 'string' && g.template.trim() ? g.template.slice(0, 200) : cur.template,
    };
  }
  // triggerRules/chatCommands/redemptions/panelButtons laufen NICHT über diese
  // Allowlist — die werden von den Aufrufern (IPC RULES_SET/… bzw. der Import
  // in studio.ts) bereits vorher durch die scharfen Trigger-Validatoren
  // (validateTriggerRules etc.) gejagt. Hier nur unverändert durchreichen,
  // wenn der Aufrufer sie bereits validiert und angehängt hat.
  if (Array.isArray(p.triggerRules)) allowed.triggerRules = p.triggerRules;
  if (Array.isArray(p.chatCommands)) allowed.chatCommands = p.chatCommands;
  if (Array.isArray(p.redemptions)) allowed.redemptions = p.redemptions;
  if (Array.isArray(p.panelButtons)) allowed.panelButtons = p.panelButtons;

  return allowed as Partial<StudioSettings>;
}

/** Top-Level-Settings-Felder, die NIE in eine exportierte Backup-Datei dürfen
 *  UND NIE aus einer importierten Backup-Datei übernommen werden dürfen.
 *
 *  EINE Liste für beide Richtungen (P1-Audit) — vorher hatte der Import eine
 *  eigene, von Hand gepflegte Kopie dieser Liste in studio.ts#importConfig,
 *  die beim Hinzufügen von aiApiKey zum Export NICHT mitgepflegt wurde. Ein
 *  importiertes Backup konnte dadurch den lokal gespeicherten Gemini/KI-Key
 *  überschreiben (Export strippte ihn korrekt, Import-Whitelist erlaubte ihn
 *  aber weiterhin durch). Jetzt: eine Quelle, kein Auseinanderlaufen mehr. */
export const SECRET_TOP_LEVEL_FIELDS = [
  'tiktokSessionId',
  'tiktokTargetIdc',
  'tiktokSignApiKey',
  'ttsCredentials',
  'controlToken', // bleibt pro Maschine eigen
  'sportApiKey',
  'aiApiKey', // KI-Key nie ins Backup / nie aus Backup übernehmen
  'spotifyTokens', // OAuth-Tokens nie ins Backup / nie aus Backup übernehmen
] as const;

function stripSecretFields(copy: Record<string, unknown>): Record<string, unknown> {
  for (const k of SECRET_TOP_LEVEL_FIELDS) delete copy[k];
  if (copy.obs && typeof copy.obs === 'object') {
    delete (copy.obs as Record<string, unknown>).password;
  }
  return copy;
}

/** Tiefe Kopie der Einstellungen OHNE Geheimnisse — für Konfig-Backups, die der
 *  Nutzer als Datei speichert/teilt. Sonst lägen TikTok-Session, Sign-Key,
 *  OBS-Passwort, TTS-API-Keys und der Steuer-Token im Klartext im Backup.
 *  Mutiert das Original NICHT. */
export function redactSecretsForExport(settings: StudioSettings): Record<string, unknown> {
  const copy = structuredClone(settings) as unknown as Record<string, unknown>;
  return stripSecretFields(copy);
}

/** Entfernt dieselben Geheimnis-Felder aus einem IMPORTIERTEN Backup-Objekt
 *  (neue Kopie, mutiert `raw` nicht) — verhindert, dass ein (ggf. manipuliertes
 *  oder einfach altes) Backup lokale Secrets/Tokens überschreibt. Nutzt
 *  bewusst dieselbe Feldliste wie redactSecretsForExport, siehe Kommentar dort. */
export function stripSecretFieldsForImport(raw: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...raw };
  delete copy.schemaVersion;
  return stripSecretFields(copy);
}
