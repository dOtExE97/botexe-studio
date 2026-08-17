// tiktok-cloud.ts — GRATIS Verbindungsweg über Eulers „Cloud WebSocket".
//
// Hintergrund: tiktok-live-connector signiert die Webcast-Verbindung selbst und
// braucht dafür Eulers Webcast-Signatur — die ist im Gratis-Plan gesperrt
// („requires a Business plan"). Euler hostet die Verbindung aber ALTERNATIV
// selbst („Cloud WebSocket", 10 Stück im Community-Free-Plan). Man verbindet
// sich nur zu wss://ws.eulerstream.com, Euler signiert intern.
//
// Trick für minimale Divergenz: EulerCloudConnection emittiert EXAKT die
// gleichen High-Level-Events ('chat','gift','like','follow','share','member',
// 'roomUser','streamEnd','disconnected','error') wie tiktok-live-connector.
// Dadurch funktioniert der komplette bestehende TikTokAdapter unverändert —
// nur die Factory wird getauscht.
import { EventEmitter } from 'node:events';
import { log, diagnoseAktiv } from '../core/logger';
import { Artenbuch } from './tiktok-artenbuch';
import type { LiveConnectionLike } from './tiktok-adapter';

const CLOUD_BASE_URL = 'wss://ws.eulerstream.com';

/** @username/URL-Form → reiner uniqueId (gleiche Regeln wie das Euler-SDK). */
export function normalizeUniqueId(uniqueId: string): string {
  return uniqueId
    .replace('https://www.tiktok.com/', '')
    .replace('/live', '')
    .replace('@', '')
    .trim();
}

export function buildCloudUrl(opts: { uniqueId: string; apiKey: string; baseUrl?: string }): string {
  const params = new URLSearchParams({
    uniqueId: normalizeUniqueId(opts.uniqueId),
    apiKey: opts.apiKey,
    // Gebündelte, bereits dekodierte JSON-Events (kein Protobuf im Client).
    'features.bundleEvents': 'true',
  });
  return `${opts.baseUrl ?? CLOUD_BASE_URL}?${params.toString()}`;
}

export type CloudEmitEvent = 'chat' | 'gift' | 'like' | 'follow' | 'share' | 'member' | 'roomUser'
  | 'subNotify' | 'envelope' | 'superFan' | 'superFanJoin' | 'emote' | 'rankUpdate'
  | 'linkMicBattle' | 'linkMicArmies' | 'roomPin';

/** Name, Bild und Livetitel des STREAMERS selbst.
 *
 *  WOHER DAS KOMMT — und warum es lange nicht ankam:
 *  Die App wartete auf eine Nachricht namens `roomInfo`. In einem echten
 *  Cloud-Stream mit Diagnose-Modus kam die KEIN EINZIGES MAL — eulerstream
 *  schickt sie schlicht nicht. Name und Profilbild blieben deshalb dauerhaft
 *  leer, ohne dass irgendwo ein Fehler stand.
 *
 *  Tatsächlich liefert `WebcastLiveIntroMessage` genau das, und noch mehr:
 *    host{userId,nickname,bioDescription,profilePicture}, description, language
 *  `description` ist der LIVETITEL — den kannte die App bisher überhaupt nicht. */
export interface HostInfo {
  nickname?: string;
  avatar?: string;
  /** Die eigene TikTok-Nutzer-ID (rein numerisch, als Text).
   *
   *  Klingt nach Kleinkram, ist aber die Antwort auf „welche der beiden Zahlen
   *  ist meine?". Im PK-Kampf stehen die Punkte in einem Objekt, dessen
   *  SCHLÜSSEL die Streamer-IDs sind — ohne die eigene ID lässt sich nicht
   *  sagen, wer führt. Genau deshalb stand im Log bisher „4200 : 3100" in
   *  beliebiger Reihenfolge.
   *
   *  Belegt in node_modules/tiktok-live-api-sdk/dist/index.d.ts:
   *    TikTokLiveUserUser { avatar_url?, nickname?, sec_uid?,
   *                         numeric_uid?, followers?, unique_id }
   *  Also dasselbe Objekt, aus dem Name und Bild ohnehin schon kommen —
   *  kein zusätzlicher Abruf, kein Bezahlplan. */
  userId?: string;
  /** Der Titel, den der Streamer seinem Live gegeben hat. */
  titel?: string;
  /** Sprache des Streams laut TikTok (z.B. „de"). */
  sprache?: string;
  /** Wann TikTok den Stream gestartet hat (ms). Kommt NUR aus dem
   *  HTTP-Abruf `fetchRoomInfoFromEulerRoute`, nicht aus dem Live-Strom —
   *  und ist die Angabe, ohne die sich „wann läuft es bei dir" nicht
   *  auswerten lässt. */
  startetAt?: number;
  /** Follower-Gesamtzahl des Kanals, ebenfalls nur per HTTP-Abruf. */
  follower?: number;
}

export type CloudEmit =
  | { kind: 'event'; event: CloudEmitEvent; data: unknown }
  | { kind: 'connected'; host?: HostInfo }
  | { kind: 'streamEnd' }
  | { kind: 'disconnected' };

/** Direkte Typ→Event-Tabelle (entspricht tiktok-live-connector WebcastEventMap). */
const TYPE_TO_EVENT: Record<string, CloudEmitEvent> = {
  WebcastChatMessage: 'chat',
  WebcastGiftMessage: 'gift',
  WebcastLikeMessage: 'like',
  WebcastMemberMessage: 'member',
  WebcastRoomUserSeqMessage: 'roomUser',
  // Teamherz-Abos und Coin-Kisten. Beide kamen bisher im default-Zweig an und
  // wurden verworfen — im Cloud-Modus (dem Standard!) gab es sie also schlicht
  // nicht, obwohl der Direkt-Weg sie liefert.
  WebcastSubNotifyMessage: 'subNotify',
  WebcastEnvelopeMessage: 'envelope',

  // WICHTIG — eulerstream schickt ZWEI Schreibweisen durcheinander:
  // neben den Protokoll-Namen („WebcastGiftMessage") auch die KURZEN
  // Ereignisnamen der Bibliothek. Belegt in einem echten Stream: Dort stand
  // „Unbekannte TikTok-Nachrichtenart „superFan"" im Log — ein Kurzname, kein
  // Webcast-Name. Wer nur die lange Form abbildet, verliert genau die
  // Ereignisse, die es nur in der kurzen gibt. Deshalb beide Formen.
  subNotify: 'subNotify',
  envelope: 'envelope',
  superFanBox: 'envelope', // Superfan-Truhe — normalizeEnvelope erkennt sie an businessType 19
  // Superfans und Emotes: In einem echten Stream kam „superFan" zweimal an und
  // landete im Papierkorb — jedes Mal Sekunden bevor die App denselben
  // Zuschauer als Teamherz erkannte. Genau die Ereignisse, die man NICHT
  // wegwerfen will.
  superFan: 'superFan',
  superFanJoin: 'superFanJoin',
  emote: 'emote',
  WebcastEmoteChatMessage: 'emote',
  // Ranglisten (Stunden, Tag, Woche, Spiele, Newcomer …). Die App liest sie
  // seit jeher aus (tiktok-rank.ts) und zeigt „Platz 7" an — im Cloud-Modus,
  // also im Standard, kamen sie aber nie an: Der Router kannte die Art nicht.
  // Die Anzeige war damit für die meisten Nutzer dauerhaft tot.
  WebcastRankUpdateMessage: 'rankUpdate',
  rankUpdate: 'rankUpdate',

  // PK-Kämpfe. Bis v0.49.0 standen beide auf der Liste „harmlos, nicht
  // melden" und wurden stumm verworfen — für viele Streamer der wichtigste
  // Moment des Abends. Nach dem Entstummen hat ein echter Kampf gezeigt,
  // was ankommt: der Rahmen 2×, der Punktestand 62×.
  WebcastLinkMicBattle: 'linkMicBattle',
  linkMicBattle: 'linkMicBattle',
  WebcastLinkMicArmies: 'linkMicArmies',
  linkMicArmies: 'linkMicArmies',

  // Angepinnte Nachrichten. Stand bis eben auf der Liste „harmlos" — dabei
  // ist es das, was der Streamer AUSDRÜCKLICH hervorheben wollte.
  WebcastRoomPinMessage: 'roomPin',
  roomPin: 'roomPin',

  // BEIDE Schreibweisen konsequent, auch für die Grundarten. eulerstream mischt
  // Protokoll-Namen („WebcastChatMessage") und Kurznamen der Bibliothek
  // („superFan") — belegt in einem echten Stream. Für Chat, Geschenke, Likes,
  // Beitritte und Zuschauerzahl kam bisher nur die lange Form an; würde
  // eulerstream dort auf die kurze wechseln, wäre die App schlagartig taub,
  // ohne dass ein Test es merkt. Die zweite Zeile kostet nichts.
  chat: 'chat',
  gift: 'gift',
  like: 'like',
  member: 'member',
  roomUser: 'roomUser',
  follow: 'follow',
  share: 'share',
  // Zu den Superfan-Arten gibt es KEINE Gegenrichtung — und das ist kein
  // Versehen. Nachgeschlagen in der Zuordnungstabelle der Bibliothek
  // (node_modules/tiktok-live-connector/dist/lib-CbB_CSnH.js, `WebcastEventMap`,
  // 61 Einträge): Dort steht für superFan / superFanJoin / superFanBox NICHTS.
  // Es gibt für sie also gar keinen Protokoll-Namen, den eulerstream schicken
  // könnte — die Kurzform oben ist die einzige Form, in der sie ankommen.
  //
  // Genauer: Die Bibliothek DEKLARIERT superFan/superFanJoin sehr wohl, und
  // laut ihrer eigenen Typdefinition tragen beide eine WebcastBarrageMessage als
  // Nutzlast (`ClientEventMap`). Sie FEUERT sie aber nirgends — im gesamten
  // Bibliothekscode kommt „superFan" ausschließlich in der Aufzählung vor, in
  // keiner einzigen emit-Stelle. Dieselbe Tabelle bildet WebcastBarrageMessage
  // stattdessen auf 'barrage' ab: eine Sammelart für BANNER aller Sorten.
  //
  // Praktisch heißt das: Diese Ereignisse erreichen uns nur über eulerstream,
  // das offenbar selbst entscheidet, welches Banner ein Superfan-Banner ist.
  // Ein früherer Kommentar verwies hier auf einen „Sonderfall unten", den es
  // nie gab.
  //
  // WebcastBarrageMessage kam in echten Streams mehrfach an und wird bewusst
  // NICHT gemappt: Ein Banner trägt zwar oft einen Nutzer, aber welcher Anlass
  // dahintersteckt, steht in Feldern, die wir noch nie gesehen haben. Es als
  // Superfan-Beitritt zu werten wäre geraten — und würde die Superfan-Zahl in
  // der Auswertung verfälschen. Der Diagnose-Modus zeigt die Feldnamen; sobald
  // ein Log sie hergibt, wird hier entschieden.
};

// Stream-Ende laut ControlAction (3 = ENDED, 4 = SUSPENDED).
const CONTROL_STREAM_ENDED = 3;
const CONTROL_STREAM_SUSPENDED = 4;

/**
 * Reiner Router: bildet eine dekodierte Cloud-Nachricht {type,data} auf ein
 * High-Level-Event ab — oder auf ein Verbindungs-Signal. null = ignorieren.
 * Spiegelt die Routing-Logik von tiktok-live-connector (inkl. Social-Split).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapCloudMessage(type: string, data: any): CloudEmit | null {
  const direct = TYPE_TO_EVENT[type];
  if (direct) {
    // Auch bei BEKANNTEN Arten einmal zeigen, was alles mitkommt. Die App
    // nutzt oft nur einen Bruchteil der Felder — welche das sind und was
    // daneben liegt, war bisher unsichtbar. Nur im Diagnose-Modus und nur
    // einmal je Art; wieder ausschließlich die NAMEN, nie die Werte.
    zeigeFelder(type, data);
    return { kind: 'event', event: direct, data };
  }

  // Auch die SONDERFÄLLE unten zeigen im Diagnose-Modus, was sie mitbringen.
  // Vorher taten das nur die Tabellen-Arten und die unbekannten — die Rahmen
  // `roomInfo` und `tiktok.connect` blieben unsichtbar. Folge: Es war nicht
  // feststellbar, ob `roomInfo` überhaupt ankommt und was darin steht. Aus
  // seinem Fehlen im Log wurde geschlossen, es käme nie — tatsächlich kommt es
  // einmal je Verbindung.
  zeigeFelder(type, data);

  switch (type) {
    case 'WebcastSocialMessage': {
      const dt: string = data?.common?.displayText?.displayType ?? '';
      if (dt.includes('follow')) return { kind: 'event', event: 'follow', data };
      if (dt.includes('share')) return { kind: 'event', event: 'share', data };
      return null; // sonstige Social-Nachrichten interessieren uns nicht
    }
    case 'WebcastControlMessage':
      // Aktion 3 = regulär beendet, Aktion 4 = von TikTok UNTERBROCHEN
      // (Moderation/Sperre). Beides wird zum selben 'streamEnd' — die
      // Unterscheidung existierte bisher genau eine Zeile lang und wurde dann
      // weggeworfen. Für den Streamer ist das aber DIE wichtigste Frage am
      // Stream-Ende: „habe ich aufgehört oder hat TikTok mich gestoppt?"
      if (data?.action === CONTROL_STREAM_SUSPENDED) {
        log.warn('TikTok', 'TikTok hat deinen Live UNTERBROCHEN — das war kein normales Stream-Ende, '
          + 'sondern eine Maßnahme von TikTok (Moderation/Sperre). Schau in der TikTok-App nach einer Benachrichtigung.');
        return { kind: 'streamEnd' };
      }
      return data?.action === CONTROL_STREAM_ENDED ? { kind: 'streamEnd' } : null;
    // Euler-Custom-Frames (kein Webcast-Protobuf):
    case 'tiktok.connect':
      return { kind: 'connected' };
    // ZWEI Quellen für dieselben Angaben, und beide kommen wirklich an:
    //   `roomInfo`                 → Name, BILD (avatarUrl), Follower, Startzeit
    //   `WebcastLiveIntroMessage`  → Name, Bild, Livetitel, Sprache
    // Sie ergänzen sich: Der Titel steht nur in der Live-Ansage, Follower und
    // Startzeit nur im roomInfo-Rahmen. Deshalb werden BEIDE ausgewertet und
    // das Ergebnis oben zusammengeführt — wer zuerst kommt, gewinnt nicht.
    case 'WebcastLiveIntroMessage':
    case 'roomInfo':
      // Hier stecken Name und Profilbild des Streamers — bisher landete der
      // ganze Rahmen im Papierkorb. DEFENSIV auslesen: TikTok liefert das
      // Objekt untypisiert, und die Verschachtelung hat sich schon geändert.
      // Findet sich nichts, ist das kein Fehler — dann bleibt es eben leer.
      return { kind: 'connected', host: leseHost(data) };
    case 'tiktok.disconnect':
      return { kind: 'disconnected' };
    default:
      // Unbekannte Arten sind im Normalfall harmlos (workerInfo, decodeError,
      // SyntheticPresence). Benennt TikTok aber eine BEKANNTE Art um,
      // verschwindet eine ganze Ereignisgattung — und bisher stand nirgends,
      // dass da überhaupt etwas ankam. Je Art nur einmal pro Verbindung
      // (manche kommen im Sekundentakt), Merker wird beim Connect geleert.
      // Im DIAGNOSE-Modus auch die harmlosen zeigen. Sonst hätte die Frage
      // „sehe ich mit Diagnose wirklich ALLES, was reinkommt?" die unbefriedigende
      // Antwort „fast" — und genau die stillen Ausnahmen sind die, bei denen sich
      // später herausstellt, dass sie doch etwas bedeuten. So ist es passiert:
      // Ranglisten und PK-Kämpfe standen beide fälschlich auf „harmlos" und waren
      // dadurch unsichtbar, auch für den, der gezielt nachsah.
      if (!HARMLOSE_ARTEN.has(type) || diagnoseAktiv()) {
        log.einmal(`tiktok:art:${type}`, 'info', 'TikTok',
          `Unbekannte TikTok-Nachrichtenart „${type}" — die App kennt diese Art nicht und überspringt sie. `
          + 'Wenn dir Geschenke oder Follower fehlen, ist das die Spur.'
          // Im Diagnose-Modus zusätzlich, WAS drinsteckt. Bisher stand nur der
          // Name da — man wusste also, dass etwas ankommt, aber nicht, ob es
          // sich lohnt. Mit den Feldnamen sieht man auf einen Blick, ob ein
          // Nutzer, ein Coin-Wert oder nur Anzeige-Kram drin ist.
          //
          // NUR die NAMEN der Felder, NIEMALS die Werte: In diesen Nachrichten
          // stecken Raum- und Sitzungsdaten, und die Logdatei wird
          // weitergegeben. Der Name allein verrät nichts und reicht völlig,
          // um zu entscheiden, ob sich das Auswerten lohnt.
          + (diagnoseAktiv() ? ` Enthaltene Felder: ${felderVon(data)}.` : ''));
      }
      return null;
  }
}

/** Die FELDNAMEN einer Nachricht auflisten — ohne einen einzigen Wert.
 *
 *  Damit lässt sich im Diagnose-Modus entscheiden, ob eine bisher ignorierte
 *  Nachrichtenart etwas Brauchbares trägt: Steht dort `user`, `giftId` oder
 *  `diamondCount`, lohnt sich das Auswerten. Steht dort nur `displayConfig`
 *  und `duration`, ist es Anzeige-Kram.
 *
 *  Verschachtelte Objekte werden EINE Ebene tief aufgelöst (`common.msgId`),
 *  weil genau dort die interessanten Sachen liegen. Tiefer nicht — sonst wird
 *  die Zeile unlesbar und die Gefahr wächst, doch noch etwas mitzunehmen,
 *  das niemanden etwas angeht. */
export function felderVon(daten: unknown, max = 24): string {
  if (!daten || typeof daten !== 'object') return typeof daten;
  const namen: string[] = [];
  for (const [schluessel, wert] of Object.entries(daten as Record<string, unknown>)) {
    if (namen.length >= max) { namen.push('…'); break; }
    if (wert && typeof wert === 'object' && !Array.isArray(wert)) {
      // Zwölf statt vier Unterfelder. Vier waren zu wenig: Bei der Coin-Truhe
      // stand `envelopeInfo{envelopeId,businessType,envelopeIdc,sendUserName}`
      // — und der Rest, in dem der Absender stecken könnte, war abgeschnitten.
      // Die Zeile ist ohnehin nur im Diagnose-Modus zu sehen und wird jetzt
      // genau EINMAL je Art geschrieben; sie darf also ruhig lang sein.
      const alle = Object.keys(wert as Record<string, unknown>);
      const kinder = alle.slice(0, 12);
      const rest = alle.length > kinder.length ? `,+${alle.length - kinder.length}` : '';
      namen.push(kinder.length ? `${schluessel}{${kinder.join(',')}${rest}}` : schluessel);
    } else if (Array.isArray(wert)) {
      namen.push(`${schluessel}[${wert.length}]`);
    } else {
      namen.push(schluessel);
    }
  }
  return namen.join(', ') || '(leer)';
}

/**
 * Im Diagnose-Modus zeigen, welche Felder eine Nachricht mitbringt.
 *
 * NICHT nur beim ersten Mal — und das ist der Punkt. Eine Nachrichtenart kann
 * je nach Anlass ganz VERSCHIEDEN aussehen: `WebcastRoomPinMessage` trägt mal
 * `giftMessage`, mal `chatMessage`, mal `memberMessage`. Wer nur das erste
 * Vorkommen protokolliert, sieht genau eine Form und hält sie für die einzige.
 *
 * Belegt: In einem echten Stream wurde erst ein Geschenk und danach eine
 * Chat-Nachricht angepinnt. Im Log stand nur die Geschenk-Form — die zweite
 * Nachricht wurde stillschweigend verschluckt. Ein daraus gebautes Widget wäre
 * bei jeder gepinnten Chat-Nachricht leer geblieben.
 *
 * Deshalb: die ersten DREI Vorkommen je Art. Genug, um Varianten zu sehen,
 * wenig genug, dass 1122 Zuschauer-Ticks nicht das Log fluten.
 */
const felderGezeigt = new Map<string, number>();
const FELDER_MAX_PRO_ART = 3;

function zeigeFelder(type: string, data: unknown): void {
  if (!diagnoseAktiv()) return;
  const bisher = felderGezeigt.get(type) ?? 0;
  if (bisher >= FELDER_MAX_PRO_ART) return;
  felderGezeigt.set(type, bisher + 1);
  const wievielt = bisher === 0 ? '' : ` (${bisher + 1}. Form)`;
  log.info('TikTok', `„${type}"${wievielt} bringt diese Felder mit: ${felderVon(data)}.`);
}

/** Beim Verbinden zurücksetzen — sonst zeigt der zweite Stream des Abends nichts. */
export function felderMerkerLeeren(): void {
  felderGezeigt.clear();
}

/** Arten, die bekanntermaßen nichts bedeuten — die sollen das Log nicht füllen.
 *
 *  ACHTUNG BEIM ERWEITERN: Hier gehört NUR hinein, was die App auch dann nicht
 *  bräuchte, wenn sie es verstünde. Die Ranglisten-Nachrichten standen kurz
 *  fälschlich hier — die App wertet sie im Direkt-Weg sehr wohl aus
 *  (onRank → merkeRang → Ranglisten-Anzeige). Sie hier stumm zu stellen hätte
 *  die einzige Spur beseitigt, dass diese Anzeige im Cloud-Modus tot ist.
 *
 *  DASSELBE ist mit den PK-Kämpfen passiert (`WebcastLinkMicBattle`,
 *  `WebcastLinkMicArmies`) — im selben Commit, in dem auch die Ranglisten
 *  fälschlich hier landeten. Ein PK-Kampf ist für viele Streamer das größte
 *  Ereignis des Abends; die beiden Arten waren also nicht harmlos, sondern nur
 *  ungenutzt. Der Unterschied ist wesentlich: Ungenutztes gehört ins Log, damit
 *  man sieht, dass es ankommt. Wer sie hier einträgt, macht die Frage
 *  „kommt das überhaupt?" für immer unbeantwortbar.
 *
 *  Kurz: Diese Liste ist für RAUSCHEN, nicht für „noch nicht gebaut". */
const HARMLOSE_ARTEN = new Set([
  'workerInfo', 'decodeError', 'SyntheticPresence',
  'WebcastCaptionMessage', 'WebcastImDeleteMessage',
  'WebcastInRoomBannerMessage', 'WebcastMsgDetectMessage',
]);

/** Streamer-Daten aus dem roomInfo-Rahmen fischen.
 *
 *  Bewusst über mehrere bekannte Pfade: `data.owner`, `owner` und `data.data.owner`
 *  sind alle in freier Wildbahn gesehen worden. Lieber drei Versuche als eine
 *  fest verdrahtete Annahme, die beim nächsten TikTok-Umbau still bricht. */
export function leseHost(roh: unknown): HostInfo | undefined {
  const d = roh as Record<string, unknown> | undefined;
  if (!d) return undefined;

  // Der Nutzer-Teil. Alle Pfade sind BELEGT aus echten Streams:
  //   `user`  → roomInfo-Rahmen (eulerstream)
  //   `host`  → WebcastLiveIntroMessage
  //   `owner` → ältere/andere Fassungen, nie beobachtet, aber harmlos
  const kandidaten = [
    d['user'], d['host'], d['owner'],
    (d['data'] as Record<string, unknown> | undefined)?.['owner'],
    ((d['data'] as Record<string, unknown> | undefined)?.['data'] as Record<string, unknown> | undefined)?.['owner'],
  ].filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');

  let nickname: string | undefined;
  let avatar: string | undefined;
  let follower: number | undefined;
  let userId: string | undefined;
  for (const o of kandidaten) {
    if (!nickname && typeof o['nickname'] === 'string' && o['nickname']) nickname = o['nickname'];
    if (!avatar) avatar = leseBild(o);
    if (follower === undefined && typeof o['followers'] === 'number') follower = o['followers'];
    if (!userId) userId = leseUserId(o);
    if (nickname && avatar && follower !== undefined && userId) break;
  }

  // Der RAUM-Teil: Titel, Startzeit, Zuschauer-Gesamtzahl. Nur im
  // roomInfo-Rahmen; die Live-Ansage trägt den Titel unter `description`.
  const raum = d['roomInfo'] as Record<string, unknown> | undefined;
  const titel = [raum?.['title'], d['description']]
    .find((t): t is string => typeof t === 'string' && t.trim().length > 0)?.trim();
  const startetAt = leseZeit(raum?.['startTime']);
  const sprache = typeof d['language'] === 'string' && d['language'] ? d['language'] : undefined;

  const info: HostInfo = {
    ...(nickname ? { nickname } : {}),
    ...(avatar ? { avatar } : {}),
    ...(userId ? { userId } : {}),
    ...(titel ? { titel } : {}),
    ...(sprache ? { sprache } : {}),
    ...(startetAt ? { startetAt } : {}),
    ...(follower !== undefined && follower > 0 ? { follower } : {}),
  };
  return Object.keys(info).length > 0 ? info : undefined;
}

/**
 * Die eigene Nutzer-ID aus dem Streamer-Objekt.
 *
 * Sechs Feldnamen, weil dieselbe Zahl je nach Weg anders heißt.
 *
 * BEIDE SCHREIBWEISEN, und das ist kein Übereifer: Die Typdefinition des SDK
 * sagt `numeric_uid` mit Unterstrich — auf der Leitung kommt aber `numericUid`
 * in Höckerschrift an (belegt in streamer-daten.test.ts, nachgebaut aus einem
 * echten Stream). Wer nur der Typdefinition folgt, findet nichts und merkt es
 * nicht. Dieselbe Doppelschreibung ist uns bei eulerstream schon einmal
 * begegnet, damals bei den Ereignisnamen.
 *
 *   `numericUid` / `numeric_uid`  Raum-Datensatz über eulerstream
 *   `userId`                      Live-Ansage (WebcastLiveIntroMessage)
 *   `idStr` / `id_str`            Direktweg (WebcastFeedResponseUser)
 *   `id`                          dieselbe Zahl, dort numerisch
 *
 * `secUid` wird BEWUSST NICHT genommen: Das ist eine lange Buchstabenkennung
 * („MS4wLjA…"), eine völlig andere Größe. Im PK-Kampf sind die Schlüssel rein
 * numerisch — eine secUid würde dort nie passen, und der Fehler wäre still.
 */
function leseUserId(o: Record<string, unknown>): string | undefined {
  for (const feld of ['numericUid', 'numeric_uid', 'userId', 'idStr', 'id_str', 'id'] as const) {
    const w = o[feld];
    let s = '';
    if (typeof w === 'string') {
      s = w.trim();
    } else if (typeof w === 'number') {
      // ZAHLEN NUR, WENN SIE HEIL SIND.
      //
      // TikTok-IDs haben 19 Stellen, JavaScript rechnet nur 16 sicher. Kommt
      // die ID als Zahl an, sind die letzten Stellen schon gerundet, bevor wir
      // sie sehen: aus …602885 wird …603000. Genau dafür gibt es die
      // Text-Felder (`id_str`).
      //
      // Eine falsche ID ist SCHLIMMER als gar keine: Sie sieht richtig aus,
      // passt aber nie zu den Schlüsseln im PK-Punktestand. „Du führst" ginge
      // dann dauerhaft nicht — ohne Fehler, ohne Meldung. Lieber nichts
      // zurückgeben und das nächste Feld probieren.
      if (!Number.isSafeInteger(w)) continue;
      s = String(w);
    }
    // Dieselbe Prüfung wie beim PK-Punktestand: mindestens sechs Ziffern, sonst
    // ist es keine TikTok-Nutzer-ID.
    if (/^\d{6,}$/.test(s)) return s;
  }
  return undefined;
}

/**
 * Profilbild — TikTok liefert es in DREI Formen, alle belegt:
 *   `avatarUrl`       fertige Adresse als Text   (roomInfo)
 *   `profilePicture`  Objekt mit url/urlList     (Live-Ansage, Chat-Nutzer)
 *   `avatarThumb` …   dasselbe unter altem Namen
 * Die erste Fassung kannte nur die Objekt-Form und ließ das Bild deshalb leer,
 * obwohl es als fertige Adresse danebenstand.
 */
function leseBild(o: Record<string, unknown>): string | undefined {
  const direkt = o['avatarUrl'] ?? o['avatar_url'];
  if (typeof direkt === 'string' && direkt.startsWith('http')) return direkt;
  const objekt = o['profilePicture'] ?? o['avatar_thumb'] ?? o['avatarThumb']
    ?? o['avatar_medium'] ?? o['avatarMedium'];
  const liste = objekt as { url?: unknown[]; url_list?: unknown[]; urlList?: unknown[] } | undefined;
  const url = [...(liste?.url ?? []), ...(liste?.url_list ?? []), ...(liste?.urlList ?? [])]
    .find((u) => typeof u === 'string' && u.startsWith('http'));
  return url ? String(url) : undefined;
}

/** Zeitstempel in ms. TikTok liefert mal Sekunden, mal Millisekunden —
 *  unterschieden an der Größenordnung, nicht geraten. */
function leseZeit(wert: unknown): number | undefined {
  const n = typeof wert === 'string' ? Number(wert) : typeof wert === 'number' ? wert : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Alles unter 10^12 kann keine Millisekunden-Zeit nach 2001 sein.
  const ms = n < 1e12 ? n * 1000 : n;
  // Sicherheitsnetz gegen Unfug: nicht vor 2020, nicht in der Zukunft.
  if (ms < 1_577_836_800_000 || ms > Date.now() + 60_000) return undefined;
  return ms;
}


/** Minimal-Interface eines WebSocket — in Tests durch Fake ersetzt. */
export interface CloudWsLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, cb: (...args: any[]) => void): unknown;
  close(): void;
  /** Beim Trennen die WS-Handler abräumen (die echte ws-Lib kann das). */
  removeAllListeners?(): void;
}

export type CloudWsFactory = (url: string) => CloudWsLike;

export interface EulerCloudOptions {
  apiKey: string;
  wsFactory?: CloudWsFactory;
  baseUrl?: string;
  connectTimeoutMs?: number;
}

function defaultWsFactory(url: string): CloudWsLike {
  // Lazy import: hält Tests/Startpfad frei von der ws-Lib.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const WebSocket = require('ws');
  return new WebSocket(url) as CloudWsLike;
}

/** Schließt einen Close-Code in eine Fehlermeldung um, deren Wortlaut die
 *  Klassifizierung im TikTokAdapter (isOfflineError / isSignServerError) trifft. */
function closeRejectMessage(code: number, reason: string): string {
  switch (code) {
    case 4404: // NOT_LIVE → als „offline" werten (App wartet ggf. auf Live)
      return `Streamer ist nicht live (isn't live): ${reason || 'noch nicht online'}`;
    case 4401: // INVALID_AUTH
    case 4403: // NO_PERMISSION
      return `eulerstream Cloud-Sign abgelehnt (Code ${code}, API-Key/Plan): ${reason}`;
    default:
      // Klartext statt nackter Zahl: Mit einem Gratis-Key sind unbekannte
      // Close-Codes fast immer die Plan-Grenzen (Tageskontingent, zu viele
      // gleichzeitige Verbindungen). Ohne diesen Satz trägt der Streamer
      // seinen Key immer wieder neu ein, obwohl der völlig in Ordnung ist.
      return `Cloud-WS geschlossen (Code ${code})${reason ? `: ${reason.slice(0, 120)}` : ''}`
        + ' — bei einem Gratis-Key sind das fast immer die Grenzen des Community-Plans:'
        + ' Tageskontingent aufgebraucht oder schon zu viele Verbindungen offen.'
        + ' Nachsehen kannst du das im Dashboard auf eulerstream.com; sonst hilft warten.';
  }
}

const STREAM_END_CLOSE_CODES = new Set([4005 /* STREAM_END */]);

/**
 * Verbindung über Eulers Cloud-WebSocket, getarnt als LiveConnectionLike, damit
 * der bestehende TikTokAdapter sie 1:1 wie eine tiktok-live-connector-Connection
 * nutzen kann.
 */
export class EulerCloudConnection extends EventEmitter implements LiveConnectionLike {
  private readonly url: string;
  private readonly wsFactory: CloudWsFactory;
  private readonly connectTimeoutMs: number;
  private ws: CloudWsLike | null = null;
  private settled = false;
  private connectedOnce = false;
  /** true ab disconnect() → unterdrückt Geister-Events eines selbst ausgelösten Close. */
  private closing = false;
  /** Führt Buch, welche Nachrichtenarten in DIESER Verbindung ankamen. */
  private readonly artenbuch = new Artenbuch();

  constructor(username: string, opts: EulerCloudOptions) {
    super();
    this.url = buildCloudUrl({ uniqueId: username, apiKey: opts.apiKey, baseUrl: opts.baseUrl });
    this.wsFactory = opts.wsFactory ?? defaultWsFactory;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 20_000;
  }

  connect(): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.settled = false;
      this.closing = false;
      // Doppel-connect()/Alt-WS schützen: eine evtl. bestehende WS sauber schließen
      // (sonst leakt sie gegen das 10-Cloud-WS-Limit).
      if (this.ws) { try { this.ws.removeAllListeners?.(); this.ws.close(); } catch { /* egal */ } this.ws = null; }
      const ws = this.wsFactory(this.url);
      this.ws = ws;

      const timer = setTimeout(() => {
        if (this.settled) return;
        this.settled = true;
        try { ws.close(); } catch { /* egal */ }
        reject(new Error('Cloud-WS antwortet nicht (Timeout)'));
      }, this.connectTimeoutMs);

      const settleOk = () => {
        if (this.settled) return;
        this.settled = true;
        this.connectedOnce = true;
        clearTimeout(timer);
        resolve({});
      };

      ws.on('message', (raw: unknown) => {
        for (const m of parseFrames(raw)) {
          const r = mapCloudMessage(m.type, m.data);
          // Buch führen, BEVOR verworfen wird: Gerade das Verworfene ist die
          // interessante Hälfte. Hier und nicht im Router — der bleibt eine
          // reine Funktion ohne Gedächtnis.
          //
          // AUSGEWERTET ist alles, was der Router NICHT wegwirft — nicht nur
          // Bus-Ereignisse. Die erste Fassung zählte `r?.kind === 'event'`, und
          // damit standen `roomInfo`, `tiktok.connect` und die Live-Ansage in
          // der Bilanz unter VERWORFEN, obwohl die App sie sehr wohl verarbeitet
          // (Streamer-Name, Verbindungsaufbau). Eine Bilanz, die das Falsche
          // behauptet, ist schlimmer als keine — sie schickt beim Suchen in die
          // falsche Richtung, und genau das ist mir damit passiert.
          this.artenbuch.verbuche(m.type, r !== null);
          if (!r) continue;
          if (r.kind === 'event') { settleOk(); this.emit(r.event, r.data); }
          else if (r.kind === 'connected') { if (r.host) this.emit('hostInfo', r.host); settleOk(); }
          else if (r.kind === 'streamEnd') this.emit('streamEnd', {});
          else if (r.kind === 'disconnected') this.emit('disconnected');
        }
      });

      ws.on('close', (code: number, reasonBuf: unknown) => {
        const reason = reasonBuf ? String(reasonBuf) : '';
        if (!this.settled) {
          this.settled = true;
          clearTimeout(timer);
          reject(new Error(closeRejectMessage(Number(code), reason)));
          return;
        }
        // Selbst ausgelöster Close (disconnect) → keine Geister-Events.
        if (this.closing) return;
        if (STREAM_END_CLOSE_CODES.has(Number(code))) { this.emit('streamEnd', {}); this.emit('disconnected'); return; }
        // Grund festhalten, BEVOR er verloren geht: Nach außen geht nur ein
        // nacktes „disconnected", und im Log stand danach nur „Verbindung
        // getrennt". Die Frage „hat TikTok den Live beendet oder brach die
        // Leitung weg?" war damit nicht mehr zu beantworten — der Streamer
        // startet dann seinen Router neu, obwohl es daran nie lag.
        log.warn('TikTok', `Die Cloud-Leitung wurde von außen geschlossen (Code ${code}${reason ? `, Grund: ${reason}` : ', ohne Angabe'}) `
          + '— das war NICHT das reguläre Stream-Ende. Typisch: kurzer Internet-Aussetzer, oder eulerstream hat die Verbindung gekappt. '
          + 'Die App verbindet gleich automatisch neu.');
        this.emit('disconnected');
      });

      ws.on('error', (err: { message?: string } | undefined) => {
        // Nur message loggen — niemals das ganze Objekt (kann den Key enthalten).
        log.warn('TikTokCloud', 'WS-Fehler', err?.message ?? 'unbekannt');
        this.emit('error', { message: err?.message });
      });
    });
  }

  disconnect(): void {
    this.closing = true;
    // Zum Schluss EINE Zeile, die den ganzen Stream zusammenfasst — statt
    // dass jemand hinterher die Logdatei nach „Unbekannte Nachrichtenart"
    // durchsucht und von Hand auszählt. Bei den kurzlebigen Live-Check-
    // Verbindungen ist das Buch leer, dort passiert nichts.
    this.artenbuch.schreibeBericht();
    this.artenbuch.leeren();
    felderMerkerLeeren();
    if (this.ws) {
      // Erst Handler abräumen (kein Geister-'disconnected'/'streamEnd' nach close),
      // dann schließen.
      try { this.ws.removeAllListeners?.(); this.ws.close(); } catch { /* egal */ }
      this.ws = null;
    }
  }

  /** Live-Check für den Auto-Connect-Watch: kurz verbinden, sofort wieder
   *  trennen. connect() löst nur bei echtem Live auf, sonst (Close 4404) reject. */
  async fetchIsLive(): Promise<boolean> {
    try {
      await this.connect();
      this.disconnect();
      return true;
    } catch {
      this.disconnect();
      return false;
    }
  }

  /** Ob bereits einmal eine Live-Verbindung stand (für Diagnose/Tests). */
  get isLive(): boolean {
    return this.connectedOnce;
  }
}

/** Ein WS-Frame kann ein Bündel ({messages:[…]}) oder eine einzelne Nachricht sein. */
export function parseFrames(raw: unknown): Array<{ type: string; data: unknown }> {
  let parsed: unknown;
  const laenge = typeof raw === 'string' ? raw.length : 0;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    // Schaltet eulerstream das Format um, kommen weiter Daten an — sie werden
    // nur restlos verworfen: Verbindung steht, Overlay bleibt tot, Log schweigt.
    // NUR Länge melden, niemals den Inhalt: Die Frames tragen Raum- und
    // Session-Daten.
    meldeVerworfen(laenge);
    return [];
  }
  const obj = parsed as { messages?: Array<{ type: string; data: unknown }>; type?: string; data?: unknown };
  if (Array.isArray(obj.messages)) return obj.messages.filter((m) => m && typeof m.type === 'string');
  if (typeof obj.type === 'string') return [{ type: obj.type, data: obj.data }];
  meldeVerworfen(laenge);
  return [];
}

/** Im Fehlerfall betrifft das JEDEN Frame (mehrere pro Sekunde) — deshalb nur
 *  einmal je Verbindung, mit der Länge als einzigem Detail. */
function meldeVerworfen(laenge: number): void {
  log.einmal('tiktok:frames-unlesbar', 'warn', 'TikTok',
    'Von eulerstream kommen Daten, die die App nicht lesen kann — deshalb bleiben Chat, Geschenke und Likes komplett aus. '
    + 'Erst Verbindung trennen und neu verbinden; hilft das nicht, in Einstellungen → TikTok-Verbindung auf „Direkt" umstellen.',
    `${laenge} Zeichen im ersten verworfenen Frame`);
}
