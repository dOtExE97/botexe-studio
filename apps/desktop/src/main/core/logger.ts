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
    write('info', 'Logger', `Datei-Log gestartet: ${file}`);
    return file;
  } catch (err) {
    console.error('Datei-Logging konnte nicht starten:', (err as Error).message);
    return '';
  }
}

export function getLogDir(): string {
  return logDir;
}

function write(level: Level, scope: string, message: string, detail?: string): void {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}${detail ? ` — ${detail}` : ''}`;
  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.log(line);
  }
  if (stream) {
    try { stream.write(line + '\n'); } catch { /* Schreibfehler nicht eskalieren */ }
  }
}

export const log = {
  debug: (scope: string, message: string, detail?: string) => write('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: string) => write('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: string) => write('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: string) => write('error', scope, message, detail),
};
