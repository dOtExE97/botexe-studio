// twitch-aktionen.ts — Knöpfe für den Streamer: Clip, Stream-Marker, Werbung,
// Shoutout und Chat-Modi umschalten. Ausgelöst über die lokale, token-
// geschützte HTTP-API des Overlay-Servers (Stream Deck & Co.).
//
// Endpunkte, Scopes, Statuscodes und Abklingzeiten stammen aus
// docs/twitch-api-belege.md, Abschnitt 10. Was dort „unbelegt" ist, steht hier
// ausdrücklich dabei.
//
// Jede Aktion liefert `{ ok: true, info }` oder `{ ok: false, fehler }` — der
// Text ist deutsch und für den Streamer gedacht. Jedes Ergebnis wird genau
// einmal geloggt. Tokens landen NIE im Log und nie im Ergebnis.

import type { StudioEvent } from '@botexe/trigger-engine';
import {
  TwitchReloginNoetig,
  TWITCH_AKTIONS_SCOPES,
  TWITCH_ANFRAGE_TIMEOUT_MS,
  istGueltigeTwitchClientId,
  type TwitchAuth,
  type TwitchTokens,
} from './twitch-auth';
import { TWITCH_ID_PRAEFIX } from '../adapters/twitch-normalize';

export const TWITCH_CLIPS_URL = 'https://api.twitch.tv/helix/clips';
export const TWITCH_MARKER_URL = 'https://api.twitch.tv/helix/streams/markers';
export const TWITCH_WERBUNG_URL = 'https://api.twitch.tv/helix/channels/commercial';
export const TWITCH_SHOUTOUT_URL = 'https://api.twitch.tv/helix/chat/shoutouts';
export const TWITCH_CHAT_SETTINGS_URL = 'https://api.twitch.tv/helix/chat/settings';
const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users';

/** Werbe-Längen, die die App anbietet. Belegt ist nur „max. meist 180 s"
 *  (Belege 10.3) — die Liste selbst ist unbelegt, bleibt aber darunter. */
export const WERBE_LAENGEN = [30, 60, 90, 120, 150, 180] as const;
export type WerbeLaenge = (typeof WERBE_LAENGEN)[number];

export const CHAT_MODI = ['emote', 'langsam', 'follower'] as const;
export type ChatModus = (typeof CHAT_MODI)[number];

export function istWerbeLaenge(n: number): n is WerbeLaenge {
  return (WERBE_LAENGEN as readonly number[]).includes(n);
}
export function istChatModus(s: string): s is ChatModus {
  return (CHAT_MODI as readonly string[]).includes(s);
}

/** Belege 10.4: höchstens ein Shoutout alle 2 Minuten, an denselben Kanal
 *  höchstens alle 60 Minuten. */
const SHOUTOUT_ABSTAND_MS = 2 * 60_000;
const SHOUTOUT_GLEICHER_KANAL_MS = 60 * 60_000;
/** Belege 10.2: Marker-Beschreibung max. 140 Zeichen. */
const MARKER_MAX_ZEICHEN = 140;
/** Twitch-Logins: Buchstaben, Ziffern, Unterstrich (höchstens 25 Zeichen).
 *  Strenger prüfen wir nicht — Twitch entscheidet, ob es den Kanal gibt. */
const LOGIN_MUSTER = /^[a-z0-9_]{1,25}$/i;

export type TwitchAktionErgebnis =
  | { ok: true; info: string; url?: string }
  | { ok: false; fehler: string };

/** Was die HTTP-API an Studio weiterreicht (schon geprüfte Werte). */
export type TwitchAktionAnfrage =
  | { art: 'clip' }
  | { art: 'marker'; beschreibung?: string }
  | { art: 'werbung'; sekunden: WerbeLaenge }
  | { art: 'shoutout'; login?: string }
  | { art: 'chat-modus'; modus: ChatModus };

export const NEU_VERBINDEN = 'Bitte Twitch neu verbinden (Einstellungen → Twitch → „Mit Twitch verbinden").';

export interface TwitchAktionenDeps {
  auth: Pick<TwitchAuth, 'getValidToken'>;
  fetch: typeof fetch;
  now: () => number;
  getClientId(): string;
  /** Für „Shoutout an den letzten Raider". */
  bus?: { subscribe(type: 'raid', cb: (e: StudioEvent) => void): () => void };
  log?(stufe: 'info' | 'warn', text: string): void;
}

interface Raider { id: string; name: string }

type Antwort =
  | { ok: true; status: number; json: Record<string, unknown>; tokens: TwitchTokens }
  | { ok: false; fehler: string };

async function leseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const j: unknown = await res.json();
    return typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Twitchs eigene Begründung (Belege 10.8: Format nicht belegt, `message`
 *  wenn vorhanden) — gekürzt, als Anhang an unseren Text. */
function grund(json: Record<string, unknown>): string {
  const m = json.message;
  return typeof m === 'string' && m.trim() ? ` (Twitch: ${m.trim().slice(0, 120)})` : '';
}

function erstesObjekt(json: Record<string, unknown>): Record<string, unknown> | undefined {
  const d = json.data;
  if (!Array.isArray(d) || d.length === 0) return undefined;
  const o: unknown = d[0];
  return typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : undefined;
}

function sekundenBis(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function dauerText(sek: number): string {
  const h = Math.floor(sek / 3600);
  const m = Math.floor((sek % 3600) / 60);
  const s = Math.floor(sek % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export class TwitchAktionen {
  private readonly deps: TwitchAktionenDeps;
  private letzterRaider: Raider | null = null;
  /** Aus `retry_after` der letzten erfolgreichen Werbung (Belege 10.3). */
  private werbungGesperrtBis = 0;
  private letzterShoutout = 0;
  private shoutoutJeKanal = new Map<string, number>();
  private readonly abmelden: (() => void) | undefined;

  constructor(deps: TwitchAktionenDeps) {
    this.deps = deps;
    this.abmelden = deps.bus?.subscribe('raid', (e) => this.merkeRaid(e));
  }

  destroy(): void {
    this.abmelden?.();
  }

  /** Nur echte Twitch-Raids (keine Test-/Replay-Ereignisse) zählen. */
  merkeRaid(e: StudioEvent): void {
    if (e.type !== 'raid' || e.plattform !== 'twitch' || e.synthetic || e.sticky) return;
    const id = e.user?.id;
    if (!id || !id.startsWith(TWITCH_ID_PRAEFIX)) return;
    const roh = id.slice(TWITCH_ID_PRAEFIX.length);
    if (!/^\d+$/.test(roh)) return;
    this.letzterRaider = { id: roh, name: e.user?.nickname || e.user?.userId || roh };
  }

  /** Eine Anfrage aus der HTTP-API ausführen. */
  ausfuehren(a: TwitchAktionAnfrage): Promise<TwitchAktionErgebnis> {
    switch (a.art) {
      case 'clip': return this.clip();
      case 'marker': return this.marker(a.beschreibung);
      case 'werbung': return this.werbung(a.sekunden);
      case 'shoutout': return this.shoutout(a.login);
      case 'chat-modus': return this.chatModus(a.modus);
    }
  }

  // ── Aktionen ──────────────────────────────────────────────────────────────

  /** Belege 10.1: POST /helix/clips → 202 mit `edit_url`. */
  async clip(): Promise<TwitchAktionErgebnis> {
    return this.melde('Clip', async () => {
      const r = await this.helix('POST', (t) => `${TWITCH_CLIPS_URL}?broadcaster_id=${encodeURIComponent(t.userId)}`,
        undefined, TWITCH_AKTIONS_SCOPES.clip);
      if (!r.ok) return r;
      if (r.status >= 200 && r.status < 300) {
        const d = erstesObjekt(r.json);
        const url = typeof d?.edit_url === 'string' && d.edit_url.startsWith('https://') ? d.edit_url : undefined;
        // Erstellen ist asynchron (Belege 10.1) — „gestartet", nicht „fertig".
        return url
          ? { ok: true, info: `Clip erstellt: ${url}`, url }
          : { ok: true, info: 'Clip erstellt (Twitch hat keinen Bearbeiten-Link mitgeschickt).' };
      }
      if (r.status === 404) return { ok: false, fehler: `Clip geht nur, während du live bist.${grund(r.json)}` };
      if (r.status === 403) {
        return { ok: false, fehler: `Twitch lässt gerade keinen Clip zu — Clips im Kanal aus oder auf Follower/Subs beschränkt?${grund(r.json)}` };
      }
      if (r.status === 400) return { ok: false, fehler: `Twitch hat den Clip abgelehnt (z. B. Kategorie nicht clipbar).${grund(r.json)}` };
      return this.sonstiger('Clip', r.status, r.json);
    });
  }

  /** Belege 10.2: POST /helix/streams/markers → 200 mit `position_seconds`. */
  async marker(beschreibung?: string): Promise<TwitchAktionErgebnis> {
    return this.melde('Marker', async () => {
      const text = (beschreibung ?? '').trim().slice(0, MARKER_MAX_ZEICHEN);
      const r = await this.helix('POST', TWITCH_MARKER_URL,
        (t) => ({ user_id: t.userId, ...(text ? { description: text } : {}) }), TWITCH_AKTIONS_SCOPES.marker);
      if (!r.ok) return r;
      if (r.status >= 200 && r.status < 300) {
        const d = erstesObjekt(r.json);
        const pos = typeof d?.position_seconds === 'number' && Number.isFinite(d.position_seconds) ? d.position_seconds : undefined;
        return { ok: true, info: `Marker gesetzt${pos !== undefined ? ` bei ${dauerText(pos)}` : ''}${text ? ` („${text}")` : ''}.` };
      }
      if (r.status === 404) {
        return {
          ok: false,
          fehler: 'Marker geht nur, während du live bist und „Vergangene Übertragungen speichern" (VODs) an ist. '
            + `Läuft der Stream erst ein paar Sekunden, gleich nochmal drücken.${grund(r.json)}`,
        };
      }
      if (r.status === 400) return { ok: false, fehler: `Twitch hat den Marker abgelehnt (bei Wiederholungen/Premieren geht er nicht).${grund(r.json)}` };
      if (r.status === 403) return { ok: false, fehler: `Twitch erlaubt dir keinen Marker in diesem Kanal.${grund(r.json)}` };
      return this.sonstiger('Marker', r.status, r.json);
    });
  }

  /** Belege 10.3: POST /helix/channels/commercial → 200 mit `length`,
   *  `message`, `retry_after`. 429 = Abklingzeit oder andere Werbung läuft. */
  async werbung(sekunden: number): Promise<TwitchAktionErgebnis> {
    return this.melde('Werbung', async () => {
      if (!istWerbeLaenge(sekunden)) {
        return { ok: false, fehler: `Ungültige Werbe-Länge ${String(sekunden)} — erlaubt sind ${WERBE_LAENGEN.join(', ')} Sekunden.` };
      }
      const rest = this.werbungGesperrtBis - this.deps.now();
      if (rest > 0) return { ok: false, fehler: `Werbung geht erst wieder in ${sekundenBis(rest)} Sekunden.` };
      const r = await this.helix('POST', TWITCH_WERBUNG_URL,
        (t) => ({ broadcaster_id: t.userId, length: sekunden }), TWITCH_AKTIONS_SCOPES.werbung);
      if (!r.ok) return r;
      if (r.status >= 200 && r.status < 300) {
        const d = erstesObjekt(r.json);
        const laenge = typeof d?.length === 'number' && d.length > 0 ? d.length : sekunden;
        const retry = typeof d?.retry_after === 'number' && d.retry_after > 0 ? d.retry_after : 0;
        if (retry > 0) this.werbungGesperrtBis = this.deps.now() + retry * 1000;
        const msg = typeof d?.message === 'string' && d.message.trim() ? ` Twitch: ${d.message.trim().slice(0, 120)}` : '';
        return { ok: true, info: `Werbung gestartet (${laenge} Sekunden).${retry > 0 ? ` Nächste ab in ${retry} Sekunden.` : ''}${msg}` };
      }
      if (r.status === 429) {
        const nochMs = this.werbungGesperrtBis - this.deps.now();
        return {
          ok: false,
          fehler: nochMs > 0
            ? `Werbung geht erst wieder in ${sekundenBis(nochMs)} Sekunden.`
            : `Twitch lässt gerade keine Werbung zu — die Abklingzeit läuft noch oder eine andere Werbung ist gerade dran. Gleich nochmal versuchen.${grund(r.json)}`,
        };
      }
      if (r.status === 400) {
        return { ok: false, fehler: `Werbung geht nur, während du live bist (und nur als Partner oder Affiliate).${grund(r.json)}` };
      }
      return this.sonstiger('Werbung', r.status, r.json);
    });
  }

  /** Belege 10.4: POST /helix/chat/shoutouts → 204. Ohne Login: an den
   *  letzten Raider. */
  async shoutout(login?: string): Promise<TwitchAktionErgebnis> {
    return this.melde('Shoutout', async () => {
      const name = (login ?? '').trim().replace(/^@/, '');
      let ziel: Raider;
      if (name) {
        if (!LOGIN_MUSTER.test(name)) return { ok: false, fehler: `„${name.slice(0, 40)}" ist kein gültiger Twitch-Name.` };
        const gefunden = await this.sucheKanal(name);
        if ('fehler' in gefunden) return { ok: false, fehler: gefunden.fehler };
        ziel = gefunden;
      } else if (this.letzterRaider) {
        ziel = this.letzterRaider;
      } else {
        return { ok: false, fehler: 'Kein Kanal angegeben, und in dieser Sitzung hat noch niemand geraidet — hänge „&login=<name>" an die Adresse.' };
      }
      const sperre = this.shoutoutSperre(ziel.id);
      if (sperre) return { ok: false, fehler: sperre };
      const r = await this.helix('POST', (t) => `${TWITCH_SHOUTOUT_URL}?from_broadcaster_id=${encodeURIComponent(t.userId)}`
        + `&to_broadcaster_id=${encodeURIComponent(ziel.id)}&moderator_id=${encodeURIComponent(t.userId)}`,
      undefined, TWITCH_AKTIONS_SCOPES.shoutout, (t) => (t.userId === ziel.id ? 'Du kannst dir nicht selbst einen Shoutout geben.' : undefined));
      if (!r.ok) return r;
      if (r.status >= 200 && r.status < 300) {
        const jetzt = this.deps.now();
        this.letzterShoutout = jetzt;
        this.shoutoutJeKanal.set(ziel.id, jetzt);
        return { ok: true, info: `Shoutout an ${ziel.name} gesendet.` };
      }
      if (r.status === 429) {
        return {
          ok: false,
          fehler: this.shoutoutSperre(ziel.id)
            ?? `Shoutout-Sperre bei Twitch: höchstens einer alle 2 Minuten, an denselben Kanal nur alle 60 Minuten.${grund(r.json)}`,
        };
      }
      if (r.status === 400) return { ok: false, fehler: `Shoutout geht nur, während du live bist.${grund(r.json)}` };
      if (r.status === 403) return { ok: false, fehler: `Twitch lässt diesen Shoutout nicht zu.${grund(r.json)}` };
      return this.sonstiger('Shoutout', r.status, r.json);
    });
  }

  /** Belege 10.5: aktuellen Stand lesen (GET), dann das eine Boolean
   *  umdrehen (PATCH). Beim Einschalten ohne Dauer → Twitchs Standard
   *  (langsam 30 s, Follower 0 Minuten). */
  async chatModus(modus: string): Promise<TwitchAktionErgebnis> {
    return this.melde('Chat-Modus', async () => {
      if (!istChatModus(modus)) return { ok: false, fehler: `Unbekannter Chat-Modus „${modus.slice(0, 20)}" — erlaubt: ${CHAT_MODI.join(', ')}.` };
      const feld = modus === 'emote' ? 'emote_mode' : modus === 'langsam' ? 'slow_mode' : 'follower_mode';
      const name = modus === 'emote' ? 'Emote-Modus' : modus === 'langsam' ? 'Langsamer Modus' : 'Follower-Modus';
      const scope = TWITCH_AKTIONS_SCOPES.chatModus;
      const lesen = await this.helix('GET', (t) => `${TWITCH_CHAT_SETTINGS_URL}?broadcaster_id=${encodeURIComponent(t.userId)}`,
        undefined, scope);
      if (!lesen.ok) return lesen;
      if (lesen.status !== 200) return this.sonstiger('Chat-Modus', lesen.status, lesen.json);
      const jetzt = erstesObjekt(lesen.json)?.[feld];
      if (typeof jetzt !== 'boolean') return { ok: false, fehler: 'Twitch hat die Chat-Einstellungen nicht vollständig geschickt.' };
      const neu = !jetzt;
      const r = await this.helix('PATCH', (t) => `${TWITCH_CHAT_SETTINGS_URL}?broadcaster_id=${encodeURIComponent(t.userId)}`
        + `&moderator_id=${encodeURIComponent(t.userId)}`, () => ({ [feld]: neu }), scope);
      if (!r.ok) return r;
      if (r.status === 200) {
        const d = erstesObjekt(r.json);
        const stand = typeof d?.[feld] === 'boolean' ? (d[feld] as boolean) : neu;
        let zusatz = '';
        if (stand && modus === 'langsam' && typeof d?.slow_mode_wait_time === 'number') zusatz = ` (${d.slow_mode_wait_time} Sekunden)`;
        if (stand && modus === 'follower' && typeof d?.follower_mode_duration === 'number') {
          zusatz = d.follower_mode_duration > 0 ? ` (ab ${d.follower_mode_duration} Minuten Folgen)` : ' (alle Follower)';
        }
        return { ok: true, info: `${name} ${stand ? 'an' : 'aus'}${zusatz}.` };
      }
      if (r.status === 403) return { ok: false, fehler: `Twitch erlaubt dir nicht, die Chat-Einstellungen zu ändern.${grund(r.json)}` };
      return this.sonstiger('Chat-Modus', r.status, r.json);
    });
  }

  // ── Helfer ────────────────────────────────────────────────────────────────

  private shoutoutSperre(zielId: string): string | undefined {
    const jetzt = this.deps.now();
    const allgemein = this.letzterShoutout ? this.letzterShoutout + SHOUTOUT_ABSTAND_MS - jetzt : 0;
    const gleich = this.shoutoutJeKanal.has(zielId) ? (this.shoutoutJeKanal.get(zielId) ?? 0) + SHOUTOUT_GLEICHER_KANAL_MS - jetzt : 0;
    if (gleich > 0 && gleich >= allgemein) {
      return `Diesem Kanal hast du schon einen Shoutout gegeben — der nächste geht erst in ${sekundenBis(gleich)} Sekunden (Twitch: alle 60 Minuten).`;
    }
    if (allgemein > 0) return `Shoutout geht erst wieder in ${sekundenBis(allgemein)} Sekunden (Twitch: höchstens einer alle 2 Minuten).`;
    return undefined;
  }

  /** Belege 10.6/7: GET /helix/users?login= — leere Liste = gibt es nicht. */
  private async sucheKanal(login: string): Promise<Raider | { fehler: string }> {
    const r = await this.helix('GET', () => `${TWITCH_USERS_URL}?login=${encodeURIComponent(login.toLowerCase())}`);
    if (!r.ok) return { fehler: r.fehler };
    if (r.status !== 200) {
      return { fehler: r.status === 400 ? `„${login}" ist kein gültiger Twitch-Name.` : `Twitch-Kanal „${login}" konnte nicht gesucht werden (HTTP ${r.status}).` };
    }
    const d = erstesObjekt(r.json);
    if (!d || typeof d.id !== 'string' || !d.id) return { fehler: `Den Twitch-Kanal „${login}" gibt es nicht (oder er ist gesperrt).` };
    const anzeige = typeof d.display_name === 'string' && d.display_name ? d.display_name : login;
    return { id: d.id, name: anzeige };
  }

  private sonstiger(was: string, status: number, json: Record<string, unknown>): TwitchAktionErgebnis {
    if (status === 429) return { ok: false, fehler: `Twitch bremst gerade (zu viele Anfragen) — kurz warten.${grund(json)}` };
    if (status >= 500) return { ok: false, fehler: `Twitch hat gerade ein Problem (HTTP ${status}) — gleich nochmal versuchen.` };
    return { ok: false, fehler: `${was} hat nicht geklappt (HTTP ${status}).${grund(json)}` };
  }

  /** Ergebnis genau einmal loggen. Unerwartete Ausnahmen werden zu einem
   *  deutschen Fehler statt zu einem 500 ohne Text. */
  private async melde(was: string, fn: () => Promise<TwitchAktionErgebnis>): Promise<TwitchAktionErgebnis> {
    let e: TwitchAktionErgebnis;
    try {
      e = await fn();
    } catch (err) {
      e = { ok: false, fehler: `${was} hat nicht geklappt: ${(err as Error).message}` };
    }
    if (e.ok) this.deps.log?.('info', e.info);
    else this.deps.log?.('warn', `${was} fehlgeschlagen: ${e.fehler}`);
    return e;
  }

  /** Ein Helix-Aufruf mit gültigem Token. 401 → genau EIN erzwungenes
   *  Erneuern (abgelehntesToken) und eine Wiederholung; danach „neu verbinden".
   *  `scope`: fehlt er im Token, gar nicht erst fragen. */
  private async helix(
    method: 'GET' | 'POST' | 'PATCH',
    url: string | ((t: TwitchTokens) => string),
    body?: (t: TwitchTokens) => Record<string, unknown>,
    scope?: string,
    vorab?: (t: TwitchTokens) => string | undefined,
  ): Promise<Antwort> {
    const clientId = this.deps.getClientId().trim();
    if (!istGueltigeTwitchClientId(clientId)) {
      return { ok: false, fehler: 'Keine gültige Twitch-Client-ID eingetragen (Einstellungen → Twitch).' };
    }
    let tokens: TwitchTokens;
    try {
      tokens = await this.deps.auth.getValidToken();
    } catch (err) {
      return { ok: false, fehler: this.tokenFehler(err) };
    }
    if (scope && !tokens.scopes.includes(scope)) {
      return { ok: false, fehler: `Der Twitch-Anmeldung fehlt das Recht dafür (${scope}). ${NEU_VERBINDEN}` };
    }
    const nein = vorab?.(tokens);
    if (nein) return { ok: false, fehler: nein };
    for (let versuch = 1; ; versuch++) {
      let res: Response;
      try {
        res = await this.deps.fetch(typeof url === 'string' ? url : url(tokens), {
          method,
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Client-Id': clientId,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body(tokens)) } : {}),
          signal: AbortSignal.timeout(TWITCH_ANFRAGE_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, fehler: 'Twitch ist gerade nicht erreichbar (Netz oder Zeitlimit) — gleich nochmal versuchen.' };
      }
      const json = res.status === 204 ? {} : await leseJson(res);
      if (res.status !== 401) return { ok: true, status: res.status, json, tokens };
      if (versuch >= 2) {
        // Belege 10.8: 401 deckt „Scope fehlt" und „Token ungültig" ab — der
        // Text dazu ist unbelegt. Beides heißt für den Streamer: neu verbinden.
        return { ok: false, fehler: `Twitch hat die Anmeldung abgelehnt.${grund(json)} ${NEU_VERBINDEN}` };
      }
      try {
        tokens = await this.deps.auth.getValidToken({ abgelehntesToken: tokens.accessToken });
      } catch (err) {
        return { ok: false, fehler: this.tokenFehler(err) };
      }
    }
  }

  private tokenFehler(err: unknown): string {
    if (err instanceof TwitchReloginNoetig) return `Nicht (mehr) mit Twitch angemeldet. ${NEU_VERBINDEN}`;
    return `Twitch-Anmeldung gerade nicht prüfbar (${(err as Error).message}) — gleich nochmal versuchen.`;
  }
}
