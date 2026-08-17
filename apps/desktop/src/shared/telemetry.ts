// telemetry.ts — gemeinsame Bausteine für Sentry (Haupt- + Renderer-Prozess).
//
// Sentry ist der „Rauchmelder": stürzt bei einem Nutzer etwas ab, kommt eine
// Meldung (Fehler, Ort, App-Version) in unser Dashboard. NUR wenn der Nutzer
// zugestimmt hat (Einstellung `telemetry === 'on'`) — sonst wird Sentry gar
// nicht erst initialisiert.

// Write-only-DSN: kann ausschließlich Ereignisse SENDEN, nichts lesen. Darf
// deshalb öffentlich im Code stehen (Standard bei ausgelieferten Apps).
export const SENTRY_DSN =
  'https://179d04d510025e330092ff0496d9ee10@o4511055917481984.ingest.us.sentry.io/4511798098264064';

// Feldnamen, deren WERT nie in einem Bericht landen darf.
const SECRET_KEY_HINT = /(token|key|secret|passwor?t|session|credential|cookie|authorization|dsn|apikey)/i;

// Werte, die AUSSEHEN wie ein Schlüssel — auch in freiem Text maskieren.
// Konkrete Formate der Anbieter, die die App nutzt, ZUERST (die generische
// Länge-Heuristik allein verfehlte z.B. Google-Keys mit 39 Zeichen):
//   euler_…            eulerstream (TikTok-Signatur)
//   AIza…              Google/Gemini (KI-Assistent)
//   sk-… / sk_…        OpenAI/ElevenLabs (TTS-BYOK)
//   xoxb-/xoxp-…       Slack-artige Tokens
//   eyJ….….…          JWT
//   lange Hex/Base64   generischer Fallback (Sentry-DSN-Key, Session-IDs …)
const SECRET_VALUE = new RegExp(
  [
    'euler_[A-Za-z0-9]+',
    'AIza[0-9A-Za-z_-]{20,}',
    'sk[-_][A-Za-z0-9_-]{16,}',
    'xox[baprs]-[A-Za-z0-9-]{10,}',
    'eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}',
    '\\b[A-Fa-f0-9]{32,}\\b',
    '\\b[A-Za-z0-9+/_-]{40,}={0,2}\\b',
  ].join('|'),
  'g',
);

const REDACTED = '[entfernt]';

/** Schlüssel-artige Zeichenfolgen in freiem Text maskieren.
 *
 *  Exportiert, weil nicht nur Sentry-Berichte das braucht: Auch was aus einer
 *  fremden API-Fehlermeldung ins Log wandert, kann einen Schlüssel enthalten —
 *  und Logdateien schickt man weiter. */
export function scrubString(s: string): string {
  return s.replace(SECRET_VALUE, REDACTED);
}

/** Rekursiv: Werte unter „geheim"-klingenden Schlüsseln komplett entfernen,
 *  alles andere auf schlüssel-artige Muster prüfen. */
function scrubDeep(value: unknown, keyName = ''): unknown {
  if (typeof value === 'string') {
    return SECRET_KEY_HINT.test(keyName) ? REDACTED : scrubString(value);
  }
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_HINT.test(k) ? REDACTED : scrubDeep(v, k);
    }
    return out;
  }
  return value;
}

/** beforeSend-Filter: Nutzer-Identität raus, Request-Daten raus, alle
 *  schlüssel-artigen Werte maskiert. Wird von Haupt- UND Renderer-Init genutzt. */
export function scrubEvent<T extends Record<string, unknown>>(event: T): T {
  const e = event as Record<string, unknown>;
  delete e.user; // keine Nutzer-Identität übertragen
  delete e.server_name; // kann Rechnername/Nutzername enthalten
  if (e.request && typeof e.request === 'object') {
    const r = e.request as Record<string, unknown>;
    delete r.cookies;
    delete r.headers;
    delete r.data;
  }
  for (const field of ['contexts', 'extra', 'tags', 'breadcrumbs'] as const) {
    if (e[field] != null) e[field] = scrubDeep(e[field]);
  }
  if (typeof e.message === 'string') e.message = scrubString(e.message);
  const exc = e.exception as { values?: Array<{ value?: string }> } | undefined;
  if (exc?.values) {
    exc.values = exc.values.map((v) => ({ ...v, value: typeof v.value === 'string' ? scrubString(v.value) : v.value }));
  }
  return event;
}

/** Umgebung fürs Sentry-Dashboard: unterscheidet echte Nutzer von Entwicklung. */
export function telemetryEnvironment(packaged: boolean): string {
  return packaged ? 'production' : 'development';
}
