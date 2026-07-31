// Schlanker, konsistenter Logger für den Main-Prozess.
// Schreibt in die Console UND (nach initFileLogging) in eine Log-Datei pro
// App-Start unter userData/logs/ — damit Fehler auf dem Stream-PC nachvollziehbar
// bleiben, auch ohne offene DevTools. Alte Logs werden auf die letzten N begrenzt.
import fs from 'node:fs';
import path from 'node:path';

type Level = 'debug' | 'info' | 'warn' | 'error';

const KEEP_LOGS = 15;

/** Zeitstempel in LOKALER Zeit (ISO-ähnlich, ohne Z). So passen die Logs zur Uhr
 *  des jeweiligen Nutzers (toISOString wäre UTC → Zeitzonen-Verwirrung). */
export function formatLocalStamp(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
const stampNow = () => formatLocalStamp(new Date());
let stream: fs.WriteStream | null = null;
let logDir = '';

// Original-Console VOR dem Patchen sichern — write() nutzt diese (sonst Doppel-
// Schreiben), und der Patch unten leitet ALLE Fremd-Logs (Libs!) in die Datei.
const orig = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

/** Beliebige Argumente robust zu einer Zeile machen (Error → message+stack). */
function fmtArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.message}${a.stack ? `\n${a.stack}` : ''}`;
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
      return String(a);
    })
    .join(' ');
}

// Byte-Deckel je Logdatei. KEEP_LOGS begrenzt bisher nur die ANZAHL der
// Dateien (eine pro App-Start) — nicht ihre GRÖSSE. Eine Timer-Regel ohne
// Intervall oder ein Format-Ausfall schreibt in einem 8-Stunden-Stream eine
// einzige, hunderte MB große Datei. Die ist dann weder zu lesen noch zu
// verschicken, also genau dann wertlos, wenn man sie am nötigsten braucht.
export const MAX_LOG_BYTES = 20 * 1024 * 1024;
let geschrieben = 0;
let deckelErreicht = false;

/** Passt diese Zeile noch in die Datei? Pure Entscheidung, damit sie prüfbar
 *  ist, ohne echte Dateien zu schreiben. */
export function passtNochInsLog(bisherBytes: number, zeileBytes: number, maxBytes = MAX_LOG_BYTES): boolean {
  return bisherBytes + zeileBytes <= maxBytes;
}

function appendFile(line: string): void {
  if (!stream || deckelErreicht) return;
  try {
    // +1 fürs Zeilenende. Byte-genau muss das nicht sein — es geht um die
    // Größenordnung, nicht um die letzten Bytes.
    const bytes = Buffer.byteLength(line, 'utf-8') + 1;
    if (!passtNochInsLog(geschrieben, bytes)) {
      deckelErreicht = true;
      stream.write(`[${stampNow()}] [WARN] [Logger] Diese Logdatei hat ${Math.round(MAX_LOG_BYTES / 1024 / 1024)} MB `
        + 'erreicht und wird ab hier NICHT weiter beschrieben — sonst wäre sie weder lesbar noch verschickbar. '
        + 'Meist steckt dahinter eine Regel, die im Sekundentakt feuert (z.B. eine Timer-Regel ohne Intervall). '
        + 'Nach einem Neustart der App wird wieder normal geloggt.\n');
      return;
    }
    geschrieben += bytes;
    stream.write(line + '\n');
  } catch { /* Schreibfehler nicht eskalieren */ }
}

/** console.* so umbiegen, dass Fremd-Ausgaben (TikTok-Lib, OBS, ws, Electron …)
 *  ebenfalls in der Log-Datei landen — nicht nur unsere log.*-Aufrufe. */
function patchConsole(): void {
  console.log = (...a: unknown[]) => { orig.log(...a); appendFile(`[${stampNow()}] [LOG] [console] ${fmtArgs(a)}`); };
  console.info = (...a: unknown[]) => { orig.info(...a); appendFile(`[${stampNow()}] [INFO] [console] ${fmtArgs(a)}`); };
  console.warn = (...a: unknown[]) => { orig.warn(...a); appendFile(`[${stampNow()}] [WARN] [console] ${fmtArgs(a)}`); };
  console.error = (...a: unknown[]) => { orig.error(...a); appendFile(`[${stampNow()}] [ERROR] [console] ${fmtArgs(a)}`); };
}

/** Datei-Logging initialisieren (im Main nach app-ready aufrufen). */
export function initFileLogging(userDataDir: string, stamp: string): string {
  try {
    logDir = path.join(userDataDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    // Auf die letzten KEEP_LOGS Dateien begrenzen.
    const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.log')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - (KEEP_LOGS - 1)))) {
      try { fs.unlinkSync(path.join(logDir, old)); } catch { /* egal */ }
    }
    const safe = stamp.replace(/[:.]/g, '-');
    const file = path.join(logDir, `studio-${safe}.log`);
    stream = fs.createWriteStream(file, { flags: 'a' });
    geschrieben = 0;
    deckelErreicht = false;
    patchConsole(); // ab jetzt landen auch Fremd-Console-Ausgaben in der Datei
    write('info', 'Logger', `Datei-Log gestartet: ${file}`);
    return file;
  } catch (err) {
    orig.error('Datei-Logging konnte nicht starten:', (err as Error).message);
    return '';
  }
}

export function getLogDir(): string {
  return logDir;
}

function write(level: Level, scope: string, message: string, detail?: string): void {
  const line = `[${stampNow()}] [${level.toUpperCase()}] [${scope}] ${message}${detail ? ` — ${detail}` : ''}`;
  // Anzeige über die ORIGINAL-Console (der Patch oben würde sonst doppelt in die
  // Datei schreiben). Die Datei wird hier genau einmal beschrieben.
  if (level === 'error') orig.error(line);
  else if (level === 'warn') orig.warn(line);
  else orig.log(line);
  // debug ist ephemer: nur Konsole (Dev), NICHT in die Logdatei — sonst mülen
  // hochfrequente Entscheidungs-Logs (z.B. TTS-Filter) das Stream-Log zu.
  // AUSSER im Diagnose-Modus: der ist genau dafür da, ein reproduzierbares
  // Problem einmal in voller Auflösung mitzuschneiden.
  if (level !== 'debug' || diagnoseBisMs > Date.now()) appendFile(line);
}

// ── Diagnose-Modus ──────────────────────────────────────────────────────────
// Zeitlich begrenztes „alles mitschreiben". Ohne ihn gab es nur zwei Zustände:
// normal (debug fällt weg, gedrosselte Zeilen kommen höchstens einmal) oder
// gar nichts. Für ein Problem, das man gerade reproduzieren kann, ist beides
// falsch. Automatisch auslaufend, damit er nicht versehentlich einen ganzen
// Stream lang mitläuft und die Datei sprengt.
let diagnoseBisMs = 0;

/** Ist der Diagnose-Modus gerade aktiv? Drosselungen schalten dann durch. */
export function diagnoseAktiv(jetzt = Date.now()): boolean {
  return diagnoseBisMs > jetzt;
}

/** Restlaufzeit in Millisekunden (0 = aus) — für die Anzeige. */
export function diagnoseRestMs(jetzt = Date.now()): number {
  return Math.max(0, diagnoseBisMs - jetzt);
}

/** Diagnose-Modus für `dauerMs` einschalten (0 = sofort aus). */
export function setzeDiagnoseModus(dauerMs: number, jetzt = Date.now()): void {
  const vorher = diagnoseBisMs > jetzt;
  diagnoseBisMs = dauerMs > 0 ? jetzt + dauerMs : 0;
  // Anfang UND Ende ins Log: Beim Lesen muss erkennbar sein, in welchem Modus
  // ein Abschnitt entstanden ist — sonst hält man die dichte Stelle für
  // Normalbetrieb (oder umgekehrt die stille für einen Ausfall).
  if (dauerMs > 0) {
    write('info', 'Diagnose', `──── Diagnose-Modus AN für ${Math.round(dauerMs / 60_000)} Minuten — ab hier wird alles `
      + 'mitgeschrieben, auch normalerweise unterdrückte Wiederholungen. ────');
  } else if (vorher) {
    write('info', 'Diagnose', '──── Diagnose-Modus AUS — ab hier wieder normales Log. ────');
  }
}

// ── Drosselung ──────────────────────────────────────────────────────────────
// Die nützlichsten Log-Zeilen stehen an den heißesten Stellen: „dieses Geschenk
// trifft keine Regel", „dieser Kanal ist stumm", „dieses Ereignis hat keinen
// Absender". Ungedrosselt wären das hunderte Zeilen pro Minute — und die eine
// wichtige Meldung ginge darin unter. Deshalb hier EIN Ort für „sag es nur
// einmal" und „sag es höchstens alle N Sekunden".
//
// Das Muster wurde im Projekt bereits fünfmal einzeln nachgebaut (Spotify,
// TTS-Entscheidungen, Overlay-ohne-Clients, verworfene Nachrichten, die
// Runtime-Meldungen). Genau daraus entstehen die Abweichungen, die später
// niemand mehr findet.
const gemeldet = new Map<string, number>();
/** Nach so vielen verschiedenen Schlüsseln wird aufgeräumt (Speicherbremse). */
const MAX_SCHLUESSEL = 500;

/**
 * Die eigentliche Entscheidung — bewusst als pure Funktion mit übergebbarer
 * Zeit, damit sie prüfbar ist, ohne die Log-Ausgabe abfangen zu müssen.
 * `abstandMs = 0` heißt „genau einmal".
 */
export function darfMelden(schluessel: string, abstandMs: number, jetzt = Date.now()): boolean {
  // Im Diagnose-Modus jede Wiederholung durchlassen — genau die will man dann
  // sehen (z.B. „wie oft kommt dieses Geschenk wirklich an?").
  if (diagnoseBisMs > jetzt) return true;
  const zuletzt = gemeldet.get(schluessel);
  if (zuletzt !== undefined && (abstandMs === 0 || jetzt - zuletzt < abstandMs)) return false;
  if (gemeldet.size > MAX_SCHLUESSEL) gemeldet.clear();
  gemeldet.set(schluessel, jetzt);
  return true;
}

/** Merker leeren (ohne Präfix alles) — Gegenstück zu log.merkerZuruecksetzen. */
export function merkerLeeren(praefix?: string): void {
  if (!praefix) { gemeldet.clear(); return; }
  for (const k of [...gemeldet.keys()]) if (k.startsWith(praefix)) gemeldet.delete(k);
}

export const log = {
  debug: (scope: string, message: string, detail?: string) => write('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: string) => write('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: string) => write('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: string) => write('error', scope, message, detail),

  /**
   * Diese Meldung genau EINMAL schreiben — je Schlüssel.
   *
   * Für Zustände, die entweder gar nicht oder dauernd auftreten: „die Daten von
   * TikTok haben keinen Absender", „das Format ist unlesbar". Beim nächsten
   * Verbinden per `merkerZuruecksetzen()` wieder scharf schalten, sonst bleibt
   * die App nach einem behobenen Problem für den Rest des Abends stumm.
   */
  einmal: (schluessel: string, level: Exclude<Level, 'debug'>, scope: string, message: string, detail?: string) => {
    if (darfMelden(schluessel, 0)) write(level, scope, message, detail);
  },

  /** Höchstens alle `abstandMs` — für Dinge, die im Sekundentakt auftreten
   *  können, aber trotzdem sichtbar bleiben sollen (z.B. „Regel X pausiert
   *  gerade wegen Abklingzeit"). */
  gedrosselt: (schluessel: string, abstandMs: number, level: Exclude<Level, 'debug'>, scope: string, message: string, detail?: string) => {
    if (darfMelden(schluessel, abstandMs)) write(level, scope, message, detail);
  },

  /** Merker vergessen, damit dieselbe Meldung wieder erscheinen darf. Ohne
   *  Präfix alles. Gehört an jeden Punkt, an dem ein neuer Abschnitt beginnt:
   *  TikTok-Verbindung aufgebaut, neuer Stream, Regeln neu geladen. */
  merkerZuruecksetzen: (praefix?: string) => merkerLeeren(praefix),
};
