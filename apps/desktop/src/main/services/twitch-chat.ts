// twitch-chat.ts — Antworten der App (Regel „In den Chat schreiben", Chat-
// Befehle) in den Twitch-Chat senden.
//
// Endpunkt, Scope und Felder aus docs/twitch-api-belege.md, Abschnitte 8 und
// 11.3/11.4: POST /helix/chat/messages mit User-Token (`user:write:chat`),
// Absender = der angemeldete Kanal selbst (broadcaster_id = sender_id).
//
// Drei Schutzregeln:
// • Höchstens eine Nachricht alle 1,5 s (Warteschlange, ≤ 20 je 30 s — unter
//   Twitchs Grenze für normale Nutzer, Belege 11.4).
// • Doppelte fliegen raus: steht derselbe Text schon in der Schlange oder ging
//   er in den letzten 30 s raus, würde Twitch ihn ohnehin als `msg_duplicate`
//   verwerfen (Belege 8).
// • Kein Echo: Was die App sendet, kommt (vermutlich, Belege 11.3 unbelegt)
//   über `channel.chat.message` zurück. `istEcho()` erkennt das am message_id
//   oder — falls das Echo vor der Antwort eintrifft — am Text, damit eine
//   Antwort wie „!discord …" nicht ihren eigenen Befehl erneut auslöst.
//
// Tokens landen nie im Log.
import {
  TwitchReloginNoetig,
  TWITCH_AKTIONS_SCOPES,
  TWITCH_ANFRAGE_TIMEOUT_MS,
  type TwitchAuth,
  type TwitchTokens,
} from './twitch-auth';

export const TWITCH_CHAT_URL = 'https://api.twitch.tv/helix/chat/messages';
/** Mindestabstand zwischen zwei gesendeten Nachrichten. */
export const TWITCH_CHAT_ABSTAND_MS = 1_500;
/** Belege 8: `msg_duplicate` = gleicher Text wie die vorige Nachricht in den letzten 30 s. */
const DUPLIKAT_FENSTER_MS = 30_000;
/** So lange gilt eine eingehende Kanal-Nachricht mit gleichem Text als Echo. */
const ECHO_FENSTER_MS = 15_000;
/** Mehr wartet nicht — sonst kämen Antworten Minuten zu spät. */
export const TWITCH_CHAT_SCHLANGE_MAX = 10;
/** Belege 8: höchstens 500 Zeichen. */
const MAX_ZEICHEN = 500;
/** Pause nach einem 429 ohne brauchbaren `Ratelimit-Reset`. */
const PAUSE_429_MS = 10_000;
/** Höchstens so oft dieselbe Art Hinweis ins Log. */
const HINWEIS_ABSTAND_MS = 60_000;

type TimerHandle = unknown;

export type TwitchChatEinreihung = 'eingereiht' | 'leer' | 'doppelt' | 'voll';

export interface TwitchChatDeps {
  auth: Pick<TwitchAuth, 'getValidToken'>;
  fetch: typeof fetch;
  now: () => number;
  getClientId(): string;
  log(stufe: 'info' | 'warn', text: string): void;
  setTimeout?: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout?: (h: TimerHandle) => void;
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function kurz(t: string): string {
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

/** Vergleichsform: Rand-Leerzeichen und mehrfache Leerzeichen zählen nicht. */
function norm(t: string): string {
  return t.trim().replace(/\s+/g, ' ');
}

export class TwitchChat {
  private readonly deps: TwitchChatDeps;
  private readonly setT: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearT: (h: TimerHandle) => void;
  private readonly schlange: string[] = [];
  private laeuft = false;
  private timer: TimerHandle | null = null;
  /** Ab wann die nächste Nachricht raus darf. */
  private frei = 0;
  /** Zuletzt gesendete Texte (für Duplikat und Echo). */
  private gesendet: Array<{ text: string; ts: number; echo?: boolean }> = [];
  private readonly eigeneIds = new Set<string>();
  private readonly eigeneIdReihe: string[] = [];
  private readonly hinweisZuletzt = new Map<string, number>();

  constructor(deps: TwitchChatDeps) {
    this.deps = deps;
    this.setT = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearT = deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Nachricht einreihen. Gesendet wird asynchron; das Ergebnis steht im Log. */
  senden(roh: string): TwitchChatEinreihung {
    const text = norm(roh).slice(0, MAX_ZEICHEN);
    if (!text) return 'leer';
    const jetzt = this.deps.now();
    this.aufraeumen(jetzt);
    if (this.schlange.includes(text) || this.gesendet.some((g) => g.text === text && jetzt - g.ts < DUPLIKAT_FENSTER_MS)) {
      this.hinweis('doppelt', 'info', `Twitch-Chat: „${kurz(text)}" nicht erneut gesendet — dieselbe Nachricht ging gerade schon raus (Twitch würde sie verwerfen).`);
      return 'doppelt';
    }
    if (this.schlange.length >= TWITCH_CHAT_SCHLANGE_MAX) {
      this.hinweis('voll', 'warn', `Twitch-Chat: „${kurz(text)}" verworfen — schon ${TWITCH_CHAT_SCHLANGE_MAX} Antworten warten (höchstens eine alle 1,5 s). Regeln/Befehle mit Abklingzeit bremsen.`);
      return 'voll';
    }
    this.schlange.push(text);
    this.pumpe();
    return 'eingereiht';
  }

  /** Ist diese eingehende Nachricht des eigenen Kanals unser eigenes Echo?
   *  Ein Treffer über den Text wird verbraucht — tippt der Streamer denselben
   *  Satz danach selbst, zählt der wieder. */
  istEcho(messageId: string | undefined, roh: string): boolean {
    if (messageId && this.eigeneIds.has(messageId)) return true;
    const text = norm(roh);
    if (!text) return false;
    const jetzt = this.deps.now();
    const treffer = this.gesendet.find((g) => g.text === text && jetzt - g.ts < ECHO_FENSTER_MS && !g.echo);
    if (!treffer) return false;
    treffer.echo = true;
    return true;
  }

  /** Warteschlange leeren (App beendet, abgemeldet). */
  stop(): void {
    this.schlange.length = 0;
    if (this.timer !== null) { this.clearT(this.timer); this.timer = null; }
  }

  // ── intern ────────────────────────────────────────────────────────────────

  private aufraeumen(jetzt: number): void {
    this.gesendet = this.gesendet.filter((g) => jetzt - g.ts < DUPLIKAT_FENSTER_MS);
  }

  private hinweis(art: string, stufe: 'info' | 'warn', text: string): void {
    const jetzt = this.deps.now();
    const zuletzt = this.hinweisZuletzt.get(art);
    if (zuletzt !== undefined && jetzt - zuletzt < HINWEIS_ABSTAND_MS) return;
    this.hinweisZuletzt.set(art, jetzt);
    this.deps.log(stufe, text);
  }

  private merkeId(id: string): void {
    this.eigeneIds.add(id);
    this.eigeneIdReihe.push(id);
    if (this.eigeneIdReihe.length > 50) {
      const alt = this.eigeneIdReihe.shift();
      if (alt !== undefined) this.eigeneIds.delete(alt);
    }
  }

  private pumpe(): void {
    if (this.laeuft || this.timer !== null || this.schlange.length === 0) return;
    const warten = this.frei - this.deps.now();
    if (warten > 0) {
      this.timer = this.setT(() => { this.timer = null; this.pumpe(); }, warten);
      return;
    }
    const text = this.schlange.shift() as string;
    this.laeuft = true;
    const jetzt = this.deps.now();
    this.frei = jetzt + TWITCH_CHAT_ABSTAND_MS;
    // VOR dem Senden merken: das Echo kann vor der HTTP-Antwort ankommen.
    this.gesendet.push({ text, ts: jetzt });
    void this.sende(text)
      .catch((err: unknown) => {
        this.deps.log('warn', `Twitch-Chat: „${kurz(text)}" nicht gesendet (${(err as Error)?.message ?? 'unbekannter Fehler'}).`);
      })
      .finally(() => {
        this.laeuft = false;
        this.pumpe();
      });
  }

  private async sende(text: string): Promise<void> {
    const clientId = this.deps.getClientId().trim();
    let tokens: TwitchTokens;
    try {
      tokens = await this.deps.auth.getValidToken();
    } catch (err) {
      this.verwerfeAlles();
      if (err instanceof TwitchReloginNoetig) {
        this.hinweis('anmeldung', 'warn', 'Chat-Antwort nach Twitch nicht gesendet — nicht (mehr) mit Twitch angemeldet. Einstellungen → Twitch → „Mit Twitch verbinden".');
      } else {
        this.hinweis('anmeldung-netz', 'warn', `Chat-Antwort nach Twitch nicht gesendet — Anmeldung gerade nicht prüfbar (${(err as Error).message}).`);
      }
      return;
    }
    if (!tokens.scopes.includes(TWITCH_AKTIONS_SCOPES.chat)) {
      this.verwerfeAlles();
      this.hinweis('scope', 'warn', 'Chat-Antwort nach Twitch nicht gesendet — der Anmeldung fehlt das Recht zum Schreiben (user:write:chat). '
        + 'Bitte Twitch einmal neu verbinden (Einstellungen → Twitch).');
      return;
    }
    for (let versuch = 1; ; versuch++) {
      const res = await this.deps.fetch(TWITCH_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Client-Id': clientId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcaster_id: tokens.userId, sender_id: tokens.userId, message: text }),
        signal: AbortSignal.timeout(TWITCH_ANFRAGE_TIMEOUT_MS),
      });
      const json = obj(await res.json().catch(() => undefined)) ?? {};
      if (res.status === 401 && versuch === 1) {
        tokens = await this.deps.auth.getValidToken({ abgelehntesToken: tokens.accessToken });
        continue;
      }
      if (res.status === 200) {
        const d = Array.isArray(json.data) ? obj(json.data[0]) : undefined;
        const id = d?.message_id;
        if (typeof id === 'string' && id) this.merkeId(id);
        if (d?.is_sent === false) {
          // Belege 8: 200 heißt nicht „angekommen" — Twitch nennt den Grund.
          const grund = obj(d.drop_reason);
          const code = typeof grund?.code === 'string' ? grund.code : 'ohne Angabe';
          const msg = typeof grund?.message === 'string' && grund.message ? ` — ${grund.message.slice(0, 120)}` : '';
          this.deps.log('warn', `Twitch hat die Chat-Antwort „${kurz(text)}" nicht angenommen (${code}${msg}).`);
          return;
        }
        this.deps.log('info', `Twitch-Chat: „${kurz(text)}" gesendet.`);
        return;
      }
      if (res.status === 429) {
        const reset = Number(res.headers.get('Ratelimit-Reset'));
        const bis = Number.isFinite(reset) && reset * 1000 > this.deps.now() && reset * 1000 - this.deps.now() <= 10 * 60_000
          ? reset * 1000 : this.deps.now() + PAUSE_429_MS;
        this.frei = Math.max(this.frei, bis);
        this.deps.log('warn', `Twitch bremst den Chat (zu viele Nachrichten) — „${kurz(text)}" verworfen, Pause ${Math.ceil((bis - this.deps.now()) / 1000)} s.`);
        return;
      }
      const m = typeof json.message === 'string' && json.message ? ` (Twitch: ${json.message.slice(0, 120)})` : '';
      if (res.status === 401) {
        this.deps.log('warn', `Twitch hat die Anmeldung beim Chat-Senden abgelehnt${m} — bitte Twitch neu verbinden.`);
      } else if (res.status === 403) {
        this.deps.log('warn', `Twitch lässt die App gerade nicht in deinen Chat schreiben${m}.`);
      } else {
        this.deps.log('warn', `Chat-Antwort nach Twitch nicht gesendet (HTTP ${res.status})${m}.`);
      }
      return;
    }
  }

  /** Ohne Anmeldung wird keine wartende Nachricht mehr etwas — sonst stünde
   *  dieselbe Zeile zehnmal im Log. */
  private verwerfeAlles(): void {
    this.schlange.length = 0;
  }
}
