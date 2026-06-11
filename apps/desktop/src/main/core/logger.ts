// Schlanker, konsistenter Logger für den Main-Prozess.
type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, scope: string, message: string, detail?: string): void {
  const line = `[${new Date().toISOString()}] [${scope}] ${message}${detail ? ` — ${detail}` : ''}`;
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
}

export const log = {
  debug: (scope: string, message: string, detail?: string) => write('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: string) => write('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: string) => write('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: string) => write('error', scope, message, detail),
};
