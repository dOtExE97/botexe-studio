// twitch-normalize.ts — Twitch-EventSub-Ereignisse in unsere StudioEvents
// übersetzen. Reine Funktion: kein Netz, keine Uhr, kein Log — damit jede
// Zuordnung ohne Twitch prüfbar ist.
//
// Feldnamen ausschließlich aus docs/twitch-api-belege.md (Abschnitte 5.1–5.8
// und 6). Alles wird defensiv gelesen: Ein fehlendes oder umbenanntes Feld
// darf nie einen Wurf auslösen — es fehlt dann eben im Ereignis.
import type { StudioEvent, StudioSticker, StudioUser } from '@botexe/trigger-engine';

/** Belege 6: das wörtliche `template` aus Get Global Emotes. */
export const TWITCH_EMOTE_VORLAGE = 'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}';

/** Twitch-Nutzer-IDs bekommen immer dieses Präfix — so kollidieren sie nie mit
 *  TikTok-IDs (Punkte, Spiele, Erst-Follow). */
export const TWITCH_ID_PRAEFIX = 'twitch:';

/** Stellvertreter für anonyme Geschenk-Abos und anonyme Cheers. */
/** Stellvertreter-ID für anonyme Geschenk-Abos und Cheers. Einzige Quelle —
 *  points-store.ts importiert sie (dort sammelt dieser „Nutzer" nichts). */
export const TWITCH_ANONYM_ID = `${TWITCH_ID_PRAEFIX}anonym`;
const ANONYM: StudioUser = { id: TWITCH_ANONYM_ID, nickname: 'Anonym' };

type Roh = Record<string, unknown>;

function obj(v: unknown): Roh | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Roh) : undefined;
}

/** Nicht-leerer String oder undefined. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function zahl(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Sticker-IDs landen im Sticker-Katalog auch im DATEINAMEN des lokalen
 *  Bildes (`sticker-<id>.<ext>`). Ein Doppelpunkt wäre unter Windows kein
 *  gültiger Dateiname — deshalb hier Bindestrich-Präfix und nur sichere
 *  Zeichen. Das Präfix hält Twitch-Emotes von TikTok-Stickern getrennt. */
function stickerId(art: 'emote' | 'gif', id: string): string {
  const sicher = id.replace(/[^A-Za-z0-9_-]/g, '_');
  return art === 'emote' ? `twitch-${sicher}` : `twitch-gif-${sicher}`;
}

/** Bild-Adresse eines Emotes aus der Vorlage (Belege 6). `animated` nur, wenn
 *  das Fragment das Format ausdrücklich anbietet — ein rein statisches Emote
 *  darf nicht als animiert angefragt werden. Dunkles Thema, weil Overlays fast
 *  immer auf dunklem Bild liegen; Stufe 2.0 (56×56) bleibt in der Chat-Zeile
 *  scharf. */
export function twitchEmoteBild(id: string, animiert: boolean): string {
  return TWITCH_EMOTE_VORLAGE
    .replace('{{id}}', encodeURIComponent(id))
    .replace('{{format}}', animiert ? 'animated' : 'static')
    .replace('{{theme_mode}}', 'dark')
    .replace('{{scale}}', '2.0');
}

/** Ein Twitch-Nutzer in unserer Form. `nickname` = Anzeigename, `userId` =
 *  Login (kleingeschrieben), `id` = 'twitch:' + numerische Twitch-ID. Ohne ID
 *  gibt es keinen Nutzer — ein erfundener Schlüssel würde Punkte sammeln. */
function nutzer(
  id: unknown, login: unknown, name: unknown, bild?: (userId: string) => string | undefined,
): StudioUser | undefined {
  const rohId = str(id);
  if (!rohId) return undefined;
  const l = str(login);
  const pic = bild?.(rohId);
  return {
    id: TWITCH_ID_PRAEFIX + rohId,
    ...(l ? { userId: l } : {}),
    nickname: str(name) ?? l ?? 'Unbekannt',
    ...(pic ? { profilePic: pic } : {}),
  };
}

function basis(type: StudioEvent['type'], now: number, user: StudioUser | undefined): StudioEvent {
  return { type, ts: now, plattform: 'twitch', ...(user ? { user } : {}) };
}

/** Chat-Fragmente (Belege 5.2) zu Text + Stickern. Emote- und GIF-Fragmente
 *  werden Sticker an der Stelle, an der sie im Text stehen (`index` = Anzahl
 *  Zeichen davor — so setzt sticker-text.js sie zurück in den Satz). Ihr
 *  Kürzel (z. B. „Kappa") kommt NICHT in den Text, sonst stünde es doppelt da
 *  und die Sprachausgabe läse es vor. Text, Erwähnungen und Cheermotes
 *  bleiben Text. */
function chatInhalt(message: Roh | undefined): { text: string; sticker: StudioSticker[] } {
  const fragmente = message?.fragments;
  if (!Array.isArray(fragmente)) return { text: str(message?.text) ?? '', sticker: [] };
  let text = '';
  const sticker: StudioSticker[] = [];
  for (const roh of fragmente) {
    const f = obj(roh);
    if (!f) continue;
    const emote = obj(f.emote);
    const emoteId = str(emote?.id);
    if (f.type === 'emote' && emoteId) {
      const formate = Array.isArray(emote?.format) ? emote.format : [];
      const animiert = formate.includes('animated');
      sticker.push({ id: stickerId('emote', emoteId), bild: twitchEmoteBild(emoteId, animiert), index: text.length, animiert });
      continue;
    }
    const gif = obj(f.gif);
    const gifUrl = str(gif?.url);
    if (f.type === 'gif' && gifUrl && /^https:\/\//i.test(gifUrl)) {
      // Belege 5.2: die volle URL unverändert benutzen.
      sticker.push({ id: stickerId('gif', str(gif?.id) ?? String(sticker.length)), bild: gifUrl, index: text.length, animiert: true });
      continue;
    }
    if (typeof f.text === 'string') text += f.text;
  }
  return { text, sticker };
}

function chat(e: Roh, now: number, bild?: (userId: string) => string | undefined): StudioEvent[] {
  const user = nutzer(e.chatter_user_id, e.chatter_user_login, e.chatter_user_name, bild);
  if (user) {
    const badges = Array.isArray(e.badges) ? e.badges.map(obj) : [];
    const sets = new Set(badges.map((b) => b?.set_id).filter((s): s is string => typeof s === 'string'));
    // Broadcaster = Mod. Erkannt am Vergleich der IDs (beide Felder belegt),
    // nicht an einem Badge-Namen, den die Belege nicht nennen.
    const istKanal = str(e.chatter_user_id) !== undefined && e.chatter_user_id === e.broadcaster_user_id;
    if (sets.has('moderator') || istKanal) user.isMod = true;
    if (sets.has('subscriber')) user.isSub = true;
  }
  const { text, sticker } = chatInhalt(obj(e.message));
  const nachricht: StudioEvent = { ...basis('chat', now, user), text, ...(sticker.length ? { sticker } : {}) };
  // Wie beim TikTok-Adapter: je Sticker ein 'emote' mit GENAU EINEM Sticker,
  // damit Sticker-Regeln greifen und bei zwei Emotes nicht doppelt feuern.
  const emotes = sticker.map((s): StudioEvent => ({ ...basis('emote', now, user), sticker: [s] }));
  return [nachricht, ...emotes];
}

/** `channel.subscribe` mit `is_gift: true` ist ein verschenktes Abo, das schon
 *  als `channel.subscription.gift` (mit `total`) gezählt wird. Ob Twitch beides
 *  schickt, ist unbelegt (Belege, Offene Punkte 10) — ein Geschenk mit zehn
 *  Abos löste sonst womöglich elf Alarme aus. Deshalb zählt nur das Gift-
 *  Ereignis. Exportiert, damit der Adapter das Überspringen ins Log schreibt. */
export function istGeschenkAbo(subscriptionType: string, event: unknown): boolean {
  return subscriptionType === 'channel.subscribe' && obj(event)?.is_gift === true;
}

/**
 * Ein EventSub-Ereignis (`payload.event`) in null oder mehr StudioEvents.
 *
 * `bild` liefert das zwischengespeicherte Profilbild zu einer Twitch-Nutzer-ID
 * (ohne Präfix), falls schon bekannt. `stream.online`/`offline` erzeugen
 * keine Ereignisse — die betreffen den Status des Adapters.
 */
export function normalizeTwitch(
  subscriptionType: string,
  event: unknown,
  now: number,
  bild?: (userId: string) => string | undefined,
): StudioEvent[] {
  const e = obj(event);
  if (!e) return [];
  switch (subscriptionType) {
    case 'channel.follow':
      return [basis('follow', now, nutzer(e.user_id, e.user_login, e.user_name, bild))];

    case 'channel.chat.message':
      return chat(e, now, bild);

    case 'channel.subscribe':
      if (istGeschenkAbo(subscriptionType, e)) return [];
      // Neues Abo ohne Nachricht (Resubs kommen als subscription.message).
      return [{ ...basis('sub', now, nutzer(e.user_id, e.user_login, e.user_name, bild)), subMonths: 1 }];

    case 'channel.subscription.message': {
      const monate = zahl(e.cumulative_months);
      const text = str(obj(e.message)?.text);
      return [{
        ...basis('sub', now, nutzer(e.user_id, e.user_login, e.user_name, bild)),
        ...(monate !== undefined && monate > 0 ? { subMonths: monate } : {}),
        ...(text ? { text } : {}),
      }];
    }

    case 'channel.subscription.gift': {
      // Belege 5.5: user_* ist null beim anonymen Geschenk.
      const anonym = e.is_anonymous === true;
      const user = anonym ? undefined : nutzer(e.user_id, e.user_login, e.user_name, bild);
      const anzahl = zahl(e.total);
      const tier = str(e.tier);
      return [{
        ...basis('sub', now, user ?? { ...ANONYM }),
        subGeschenk: { anzahl: anzahl !== undefined && anzahl > 0 ? anzahl : 1, ...(tier ? { tier } : {}), anonym },
      }];
    }

    case 'channel.cheer': {
      // Belege 5.6: user_* ist null, wenn anonym gejubelt wurde.
      const anonym = e.is_anonymous === true;
      const user = anonym ? undefined : nutzer(e.user_id, e.user_login, e.user_name, bild);
      const bits = zahl(e.bits);
      const text = str(e.message);
      return [{
        ...basis('cheer', now, user ?? { ...ANONYM }),
        cheer: { bits: bits !== undefined && bits > 0 ? bits : 0 },
        ...(text ? { text } : {}),
      }];
    }

    case 'channel.raid': {
      const viewers = zahl(e.viewers);
      return [{
        ...basis('raid', now, nutzer(e.from_broadcaster_user_id, e.from_broadcaster_user_login, e.from_broadcaster_user_name, bild)),
        raid: { viewers: viewers !== undefined && viewers > 0 ? viewers : 0 },
      }];
    }

    default:
      // stream.online/offline und alles Unbekannte: kein Ereignis.
      return [];
  }
}
