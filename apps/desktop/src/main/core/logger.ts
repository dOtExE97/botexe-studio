// Schlanker, konsistenter Logger für den Main-Prozess.
// Schreibt in die Console UND (nach initFileLogging) in eine Log-Datei pro
// App-Start unter userData/logs/ — damit Fehler auf dem Stream-PC nachvollziehbar
// bleiben, auch ohne offene DevTools. Alte Logs werden auf die letzten N begrenzt.
import fs from 'node:fs';
import path from 'node:path';

type Level = 'debug' | 'info' | 'warn' | 'error';

const KEEP_LOGS = 15;
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

function appendFile(line: string): void {
  if (stream) { try { stream.write(line + '\n'); } catch { /* Schreibfehler nicht eskalieren */ } }
}

/** console.* so umbiegen, dass Fremd-Ausgaben (TikTok-Lib, OBS, ws, Electron …)
 *  ebenfalls in der Log-Datei landen — nicht nur unsere log.*-Aufrufe. */
function patchConsole(): void {
  console.log = (...a: unknown[]) => { orig.log(...a); appendFile(`[${new Date().toISOString()}] [LOG] [console] ${fmtArgs(a)}`); };
  console.info = (...a: unknown[]) => { orig.info(...a); appendFile(`[${new Date().toISOString()}] [INFO] [console] ${fmtArgs(a)}`); };
  console.warn = (...a: unknown[]) => { orig.warn(...a); appendFile(`[${new Date().toISOString()}] [WARN] [console] ${fmtArgs(a)}`); };
  console.error = (...a: unknown[]) => { orig.error(...a); appendFile(`[${new Date().toISOString()}] [ERROR] [console] ${fmtArgs(a)}`); };
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
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}${detail ? ` — ${detail}` : ''}`;
  // Anzeige über die ORIGINAL-Console (der Patch oben würde sonst doppelt in die
  // Datei schreiben). Die Datei wird hier genau einmal beschrieben.
  if (level === 'error') orig.error(line);
  else if (level === 'warn') orig.warn(line);
  else orig.log(line);
  appendFile(line);
}

export const log = {
  debug: (scope: string, message: string, detail?: string) => write('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: string) => write('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: string) => write('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: string) => write('error', scope, message, detail),
};
