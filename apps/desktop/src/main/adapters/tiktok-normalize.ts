// tiktok-normalize.ts — pure Normalisierung der TikTok-Payloads
// (WebcastChatMessage, WebcastGiftMessage, …) in unser StudioEvent-Modell.
// Bewusst tolerant getypt: die Lib liefert Protobuf-dekodierte Objekte, bei
// denen jedes Feld fehlen kann.
//
// ZWEI PROTOKOLL-FASSUNGEN, und die App bekommt beide:
//  · Der Cloud-Weg (eulerstream, Standard) liefert die ältere Schreibweise:
//    `giftDetails` mit `giftName`/`giftType`/`giftImage`, User mit `uniqueId`
//    und `profilePicture`.
//  · Der Direkt-Weg (tiktok-live-connector ab 2.4.x) dekodiert mit dem
//    v3-Schema, und dort wurden dieselben Felder umbenannt: aus `giftDetails`
//    wurde `gift` (mit `name`/`type`/`image`), aus `profilePicture` wurde
//    `avatarThumb`, und `giftId` ist plötzlich ein String statt einer Zahl.
//    (Belegt in node_modules/tiktok-live-proto/dist/node/v3.d.ts — dort kommt
//    „giftDetails" kein einziges Mal mehr vor; die README des Connectors zeigt
//    noch die alte Form, sie hinkt dem Schema hinterher.)
// Deshalb wird JEDES Feld unter beiden Namen gesucht. Kommt eine dritte
// Fassung, ist hier die einzige Stelle, die es wissen muss.
import type { StudioEvent, StudioUser, RaumPlatz, StudioSticker, StudioBeziehung } from '@botexe/trigger-engine';

interface RawImage {
  url?: string[];
  urlList?: string[];
  /** v2 (Cloud-Weg): EIN fertiger Link statt einer Liste. */
  imageUrl?: string;
  avgColor?: string;
  isAnimated?: boolean;
}

/** Der Sticker selbst.
 *
 *  DREI Formen, alle belegt im Protokoll-Schema:
 *   · v3 (Direkt-Weg):  image.urlList[]        — `EmoteModel`
 *   · v2 (Cloud-Weg):   image.imageUrl         — `EmoteDetails`/`EmoteImage`
 *   · v2, reine Sticker-Nachricht: image.url[] — `Emote`
 *  Wer nur die erste liest, bekommt im Cloud-Modus leere Kacheln — genau das
 *  war am 21.08.2026 im echten Stream zu sehen. */
interface RawEmote {
  emoteId?: string;
  packageId?: string;
  image?: RawImage;
}

/** Ein Etikett am Zuschauer, wie TikTok es liefert. */
interface RawPortraitTag {
  /** Übersetzungsschlüssel, z.B. `ttlive_ls_msgGroups_viewerLabel_followedDays`. */
  showValue?: string;
  /** JSON als TEXT (!), z.B. `{"s_num":"437","num":"437"}`. */
  showArgs?: string;
}

/** Die Zahl aus `showArgs` holen. Ist der Text kein gültiges JSON, kostet das
 *  nur die Zahl — niemals das ganze Ereignis. */
function zahlAusArgs(args: string | undefined): number | undefined {
  if (!args) return undefined;
  try {
    const o = JSON.parse(args) as Record<string, unknown>;
    const roh = o['num'] ?? o['s_num'];
    const n = typeof roh === 'number' ? roh : parseInt(String(roh ?? ''), 10);
    // > 0 statt >= 0: TikTok schickt keine echten Nullen, und eine 0 aus einem
    // kaputten Feld darf nicht als Angabe durchgehen.
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * TikToks Etiketten am Zuschauer auswerten (`portraitTag`).
 *
 * Sie liegen an fast jeder Nachricht an und sagen MIT ZAHL, wie lange jemand
 * folgt, im Fanclub ist und Superfan ist. Bisher komplett verworfen — sie
 * stecken tief in `publicAreaMessageCommon`, weshalb sie auch dem aus dem
 * Protokoll-Schema erzeugten Inventar entgangen sind.
 *
 * `showValue` ist ein Übersetzungsschlüssel; ausgewertet wird nur die Endung
 * nach dem letzten `_`. Unbekannte Endungen werden ignoriert — TikTok erfindet
 * neue, und was sie bedeuten, wissen wir nicht.
 */
export function beziehungAuslesen(data: unknown): StudioBeziehung | undefined {
  const tags = (data as { publicAreaMessageCommon?: { portraitInfo?: { portraitTag?: RawPortraitTag[] } } })
    ?.publicAreaMessageCommon?.portraitInfo?.portraitTag;
  if (!Array.isArray(tags) || tags.length === 0) return undefined;

  const raus: StudioBeziehung = {};
  let etwasErkannt = false;
  for (const tag of tags) {
    const art = String(tag?.showValue ?? '').split('_').pop();
    if (!art) continue;
    switch (art) {
      case 'followedDays':
        raus.folgtSeitTagen = zahlAusArgs(tag.showArgs);
        etwasErkannt = true;
        break;
      case 'memberDays':
        raus.fanclubSeitTagen = zahlAusArgs(tag.showArgs);
        etwasErkannt = true;
        break;
      case 'subForMo':
        raus.superfanSeitMonaten = zahlAusArgs(tag.showArgs);
        etwasErkannt = true;
        break;
      case 'followedToday':
        // Brandneuer Follower — TikTok schickt hier KEINE Zahl, das Etikett
        // selbst ist die Aussage. Gefunden erst beim Lauf gegen echte Daten.
        raus.folgtSeitHeute = true;
        etwasErkannt = true;
        break;
      // 'notSub' („kein Superfan", im Mitschnitt 13x) wird BEWUSST ignoriert:
      // Es sagt nichts, was das Fehlen von subForMo nicht schon sagt. Ein
      // eigenes Feld waere doppeltes Wissen.
      case 'topGifter':
        raus.istTopGifter = true;
        etwasErkannt = true;
        break;
      case 'notFollower':
        raus.folgtNicht = true;
        etwasErkannt = true;
        break;
      default:
        // Unbekanntes Etikett — bewusst still. Im Diagnose-Modus fällt es über
        // die Feldnamen-Ausgabe ohnehin auf.
        break;
    }
  }
  return etwasErkannt ? raus : undefined;
}

/**
 * Rohe TikTok-Sticker in unsere Form bringen.
 *
 * Nimmt BEIDE Bauarten: `EmoteWithIndex` aus dem Chat (`{index, emote}`) und den
 * nackten `EmoteModel` aus der reinen Sticker-Nachricht (`emoteList`). Einträge
 * ohne `emoteId` fliegen raus — ohne diesen Anker lässt sich keine Regel daran
 * binden. Sie dürfen die Nachricht aber nicht mitreißen.
 */
export function stickerAusListe(rohe: unknown): StudioSticker[] | undefined {
  if (!Array.isArray(rohe) || rohe.length === 0) return undefined;
  const raus: StudioSticker[] = [];
  rohe.forEach((eintrag, i) => {
    const e = (eintrag ?? {}) as { index?: number; placeInComment?: number; emote?: RawEmote } & RawEmote;
    const emote: RawEmote = e.emote ?? e;
    const id = emote?.emoteId;
    if (!id) return;
    const bild = emote.image?.urlList?.[0] ?? emote.image?.url?.[0] ?? emote.image?.imageUrl ?? '';
    // v3 nennt die Stelle im Text `index`, v2 `placeInComment`. Fehlt beides
    // (reine Sticker-Nachricht), zählt die Reihenfolge in der Liste.
    const stelle = typeof e.index === 'number' ? e.index
      : typeof e.placeInComment === 'number' ? e.placeInComment
      : i;
    raus.push({
      id: String(id),
      bild,
      index: stelle,
      animiert: !!emote.image?.isAnimated,
      ...(emote.packageId ? { paket: emote.packageId } : {}),
      ...(emote.image?.avgColor ? { farbe: emote.image.avgColor } : {}),
    });
  });
  return raus.length > 0 ? raus : undefined;
}

interface RawUser {
  userId?: string;
  uniqueId?: string;
  /** v3: die eigentliche Kennung heißt hier schlicht `id`. */
  id?: string;
  /** v3: der @-Name heißt hier `displayId`. */
  displayId?: string;
  nickname?: string;
  profilePicture?: { url?: string[] };
  /** v3-Schreibweisen des Profilbilds. */
  avatarThumb?: RawImage;
  avatarMedium?: RawImage;
  /** Teamherz: TikTok nennt es im Protokoll „Fan-Club". Die Stufe steckt je
   *  nach Nachrichtenart an einer von drei Stellen — deshalb werden alle drei
   *  geprüft. (Belegt in tiktok-live-proto/v3: User.fansClub.data.level,
   *  User.fansClubInfo.fansLevel, sowie das Abzeichen mit sceneType FANS=10.) */
  fansClub?: { data?: { level?: number; clubName?: string } };
  fansClubInfo?: { fansLevel?: string | number };
  /** Wie gross der ZUSCHAUER selbst ist. Lag immer an, gelesen wurde bisher
   *  nur der Folge-Status weiter unten. */
  followInfo?: RawFollowInfo;
  /** Geschenke-Stufe des Zuschauers bei TikTok insgesamt. */
  payGrade?: { level?: number };
  /** Abzeichen-Liste mit den Stufen. Auch hier zwei Schreibweisen:
   *   · v3 (Direkt-Weg): `badgeList` mit `sceneType` + `privilegeLogExtra.level`
   *   · v2 (Cloud-Weg):  `badges`    mit `badgeScene` + `logExtra.level`
   *  Nur die erste zu lesen heißt: im Cloud-Modus gibt es über diesen Weg nie
   *  eine Teamherz- oder Geschenke-Stufe. */
  badgeList?: RawBadge[];
  badges?: RawBadge[];
}

interface RawBadge {
  sceneType?: number;
  badgeSceneType?: number;
  /** v2-Name derselben Angabe. */
  badgeScene?: number;
  privilegeLogExtra?: { level?: string };
  /** v2-Name derselben Angabe. */
  logExtra?: { level?: string };
}

/** Abzeichen-Arten laut Protokoll (tiktok-live-proto/v3, BadgeSceneType). */
const BADGE_FANS = 10;
const BADGE_USER_GRADE = 8;

/** Erste brauchbare Zahl aus mehreren Kandidaten — TikTok liefert Stufen mal
 *  als Zahl, mal als Text, und je nach Nachrichtenart an anderer Stelle. */
function ersteZahl(...werte: unknown[]): number {
  for (const w of werte) {
    const n = typeof w === 'string' ? parseInt(w, 10) : typeof w === 'number' ? w : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Stufe aus der Abzeichen-Liste (beide Feldnamen, je nach Protokoll-Fassung). */
function abzeichenStufe(raw: RawUser, art: number): number {
  const alle = [...(raw.badgeList ?? []), ...(raw.badges ?? [])];
  const treffer = alle.find((b) => (b.sceneType ?? b.badgeSceneType ?? b.badgeScene) === art);
  return ersteZahl(treffer?.privilegeLogExtra?.level, treffer?.logExtra?.level);
}

/**
 * eulerstream hängt an WIEDERHOLTE Felder ein „List" an: `pieces` heißt dort
 * `piecesList`, `ranks` heißt `ranksList`. Die Bibliothek im Direkt-Modus
 * benutzt die kurze Form. Wer nur eine Schreibweise liest, ist im jeweils
 * anderen Modus blind — und zwar lautlos: Die Nachricht kommt an, das Feld ist
 * schlicht `undefined`, und die Funktion gibt eine leere Liste zurück.
 *
 * Belegt in einem echten Cloud-Stream (Diagnose-Modus):
 *   WebcastRoomUserSeqMessage → `ranksList[4]`   (gelesen wurde `ranks`)
 *   superFan                  → `content{…,piecesList}` (gelesen wurde `pieces`)
 * Beide Auswertungen liefen dadurch ins Leere: TikToks Raum-Bestenliste blieb
 * im Cloud-Modus dauerhaft leer, und Superfan-Ereignisse kamen ohne Absender an.
 *
 * Diese beiden Helfer sind die EINE Stelle, an der das behandelt wird — damit
 * nicht jede Normalisierung ihre eigene Fassung erfindet.
 */
export function liste<T>(kurz: T[] | undefined, lang: T[] | undefined): T[] {
  if (Array.isArray(kurz) && kurz.length) return kurz;
  if (Array.isArray(lang) && lang.length) return lang;
  return [];
}

/** Text-Bausteine einer Banner-Nachricht, in beiden Schreibweisen. */
interface Bausteine {
  pieces?: Array<{ userValue?: { user?: RawUser } }>;
  piecesList?: Array<{ userValue?: { user?: RawUser } }>;
}
function bausteine(b: Bausteine | undefined): Array<{ userValue?: { user?: RawUser } }> {
  return liste(b?.pieces, b?.piecesList);
}

/** Erstes Bild aus einer der beiden Protokoll-Schreibweisen (url / urlList). */
function ersteBildUrl(...bilder: Array<RawImage | { url?: string[] } | undefined>): string | undefined {
  for (const b of bilder) {
    const treffer = b?.url?.[0] ?? (b as RawImage | undefined)?.urlList?.[0];
    if (treffer) return treffer;
  }
  return undefined;
}

function toUser(raw: RawUser | undefined): StudioUser | undefined {
  if (!raw) return undefined;
  // Reihenfolge = Vorliebe: der @-Name ist der stabilere, sprechende Schlüssel.
  // `displayId`/`id` sind die v3-Namen derselben Dinge (Direkt-Weg).
  const id = raw.uniqueId || raw.displayId || raw.userId || raw.id || '';
  if (!id) return undefined;
  const roheId = raw.userId || raw.id || '';
  const teamLevel = ersteZahl(
    raw.fansClub?.data?.level,
    raw.fansClubInfo?.fansLevel,
  ) || abzeichenStufe(raw, BADGE_FANS);
  const gifterLevel = ersteZahl(raw.payGrade?.level) || abzeichenStufe(raw, BADGE_USER_GRADE);
  const follower = ersteZahl(raw.followInfo?.followerCount);
  const folgt = ersteZahl(raw.followInfo?.followingCount);
  return {
    id,
    // Zweiter Schlüssel fürs Rollen-Gedächtnis: rohe userId, falls sie von der
    // primären id (= uniqueId) abweicht. So findet das Gedächtnis denselben
    // User auch, wenn ein Event mal nur die userId trägt.
    ...(roheId && roheId !== id ? { userId: roheId } : {}),
    nickname: raw.nickname || id,
    profilePic: ersteBildUrl(raw.profilePicture, raw.avatarThumb, raw.avatarMedium),
    // Stufen nur setzen, wenn wirklich eine kam — sonst überschreibt ein
    // Ereignis ohne Abzeichen-Daten das, was das Rollen-Gedächtnis schon weiß.
    ...(teamLevel > 0 ? { teamLevel } : {}),
    ...(gifterLevel > 0 ? { gifterLevel } : {}),
    // Nur setzen, wenn eine Zahl kam: eine 0 saehe aus wie „keine Follower".
    ...(follower > 0 ? { followerCount: follower } : {}),
    ...(folgt > 0 ? { followingCount: folgt } : {}),
  };
}

interface RawFollowInfo {
  followerCount?: number | string;
  followingCount?: number | string;
}

interface RawUserIdentity {
  isSubscriberOfAnchor?: boolean;
  isModeratorOfAnchor?: boolean;
  isFollowerOfAnchor?: boolean;
  /** Ihr folgt euch GEGENSEITIG. */
  isMutualFollowingWithAnchor?: boolean;
  /** Dieser Zuschauer hat dir schon einmal etwas geschenkt. */
  isGiftGiverOfAnchor?: boolean;
}

/** Daten, aus denen sich die Rolle eines Zuschauers ableiten lässt. */
interface RawRoleData {
  /** camelCase — im Direkt-Modus (tiktok-live-connector v2) am Chat-Event. */
  userIdentity?: RawUserIdentity;
  /** GROSS — defensiv für eine evtl. abweichende Cloud-Variante. */
  UserIdentity?: RawUserIdentity;
  user?: {
    isFollower?: boolean;
    followStatus?: number | string;
    followInfo?: { followStatus?: number | string };
  };
}

/**
 * Mod/Teamherz/Follower MEHRGLEISIG erkennen — TikTok liefert die Rolle je nach
 * Modus/Event unterschiedlich. OR über alle bekannten Quellen, damit der
 * TTS-Filter ("nur Mods/Follower") zuverlässig greift (sonst werden z.B. Mods
 * übersprungen, weil ein einzelnes Flag fehlt). Reine Funktion → testbar.
 */
export function detectRoles(data: RawRoleData): {
  isMod: boolean; isSub: boolean; isFollower: boolean; isMutual: boolean; hatGeschenkt: boolean;
} {
  const id = data.userIdentity ?? data.UserIdentity;
  const u = data.user;
  const followStatus = Number(u?.followInfo?.followStatus ?? u?.followStatus ?? 0);
  return {
    isMod: !!id?.isModeratorOfAnchor,
    isSub: !!id?.isSubscriberOfAnchor,
    isFollower: !!(id?.isFollowerOfAnchor || u?.isFollower || (Number.isFinite(followStatus) && followStatus >= 1)),
    // Zwei Angaben, die TikTok an JEDER Chat-Nachricht mitschickt und die die
    // App bisher weggeworfen hat. Beide sagen etwas über die BEZIEHUNG, nicht
    // nur über den Status: „folgt euch gegenseitig" ist mehr als ein Follower,
    // und „hat schon mal geschenkt" ist der Unterschied zwischen einem Gast und
    // einem Stammgast. (Belegt: UserIdentity in tiktok-live-proto/v3, und in
    // einem echten Cloud-Stream an jeder WebcastChatMessage vorhanden.)
    isMutual: !!id?.isMutualFollowingWithAnchor,
    hatGeschenkt: !!id?.isGiftGiverOfAnchor,
  };
}

export function normalizeChat(
  // `comment` = Cloud-Weg (eulerstream), `content` = v3-Schema im Direkt-Weg.
  // Dieselbe Falle wie bei den Geschenken in v0.45.1: TikTok hat die Felder
  // umbenannt, und wer nur den alten Namen liest, bekommt LEEREN Text — kein
  // Vorlesen, kein Schlüsselwort, kein !befehl. Besonders bitter, weil die App
  // bei Problemen selbst den Direkt-Modus vorschlägt.
  // `emotes` = Sticker in der Nachricht. Lag immer an und wurde immer verworfen.
  data: { user?: RawUser; comment?: string; content?: string; emotes?: unknown } & RawRoleData,
  ts: number,
): StudioEvent {
  const user = toUser(data.user);
  // Rollen (Teamherz/Mod/Follower) fürs TTS-Vorlese-Filter und künftige Trigger.
  if (user) {
    const roles = detectRoles(data);
    if (roles.isSub) user.isSub = true;
    if (roles.isMod) user.isMod = true;
    if (roles.isFollower) user.isFollower = true;
    // Nur setzen, wenn WAHR: Ein `false` würde sonst überschreiben, was das
    // Rollen-Gedächtnis aus einem früheren Ereignis schon weiß. Nicht jede
    // Nachricht trägt alle Angaben mit.
    if (roles.isMutual) user.isMutual = true;
    if (roles.hatGeschenkt) user.hatGeschenkt = true;
  }
  const sticker = stickerAusListe(data.emotes);
  const beziehung = beziehungAuslesen(data);
  return {
    type: 'chat', ts, user,
    text: data.comment ?? data.content ?? '',
    ...(sticker ? { sticker } : {}),
    ...(beziehung ? { beziehung } : {}),
  };
}

/**
 * Gifts: giftType 1 = streakbar — nur das finale Event (repeatEnd) zählt,
 * sonst würde jede Combo-Stufe als eigenes Gift gewertet (Doppel-Zählung).
 * Liefert null für unterdrückte Zwischen-Events.
 */
export function normalizeGift(
  data: {
    user?: RawUser;
    /** Ältere Fassung: Zahl. v3 (Direkt-Weg): String. */
    giftId?: number | string;
    repeatCount?: number;
    repeatEnd?: number | boolean;
    /** Schreibweise des Cloud-Wegs. */
    giftDetails?: {
      giftName?: string;
      describe?: string;
      giftType?: number;
      diamondCount?: number;
      giftImage?: RawImage;
      icon?: RawImage;
    };
    /** Schreibweise des Direkt-Wegs (v3-Schema, dieselben Daten). */
    gift?: {
      name?: string;
      describe?: string;
      type?: number;
      combo?: boolean;
      diamondCount?: number;
      image?: RawImage;
      icon?: RawImage;
    };
  },
  ts: number,
): StudioEvent | null {
  // Beide Protokoll-Fassungen bedienen (siehe Kopf der Datei). Ohne diesen
  // Fallback war im Direkt-Modus ALLES daneben: jede Combo-Zwischenstufe zählte
  // als eigenes Geschenk, die Coins blieben 0, und jedes Geschenk hieß „gift" —
  // womit auch keine einzige Trigger-Regel mehr griff.
  const alt = data.giftDetails;
  const neu = data.gift;
  const giftName = alt?.giftName || neu?.name || alt?.describe || neu?.describe || '';
  // `type === 1` heißt streakbar; v3 sagt dasselbe zusätzlich über `combo`.
  const streakable = (alt?.giftType ?? neu?.type) === 1 || neu?.combo === true;
  const repeatEnd = Boolean(data.repeatEnd);
  if (streakable && !repeatEnd) return null;

  const count = data.repeatCount || 1;
  const coinsPerUnit = alt?.diamondCount ?? neu?.diamondCount ?? 0;
  const icon = ersteBildUrl(alt?.giftImage, neu?.image, alt?.icon, neu?.icon);
  // giftId als ZAHL vereinheitlichen: v3 liefert einen String, und der
  // Gift-Katalog wie auch die Bedingung „genau dieses Geschenk" (gift_id_is)
  // vergleichen strikt — ein String hätte dort nie getroffen.
  const giftId = Number(data.giftId) || undefined;
  const beziehung = beziehungAuslesen(data);
  return {
    type: 'gift',
    ts,
    user: toUser(data.user),
    gift: {
      slug: giftName || 'gift',
      giftId,
      count,
      coinsPerUnit,
      totalCoins: coinsPerUnit * count,
      ...(icon ? { icon } : {}),
    },
    ...(beziehung ? { beziehung } : {}),
  };
}

export function normalizeLike(
  // `likeCount`/`totalLikeCount` = Cloud-Weg, `count`/`total` = v3 im Direkt-Weg.
  // Ohne `count` zählte ein Like-Schwall (TikTok bündelt bis zu 15 Stück) immer
  // nur als EINS — der Like-Meilenstein wäre nie erreicht worden.
  // `total` kommt im v3-Schema als TEXT ("1234"), deshalb überall Number().
  data: {
    user?: RawUser; likeCount?: number; count?: number;
    totalLikeCount?: number; totalLikes?: number; total?: number | string;
  },
  ts: number,
): StudioEvent {
  const beziehung = beziehungAuslesen(data);
  return {
    type: 'like',
    ts,
    user: toUser(data.user),
    likeCount: zahl(data.likeCount ?? data.count) || 1,
    totalLikes: zahl(data.totalLikeCount ?? data.totalLikes ?? data.total),
    ...(beziehung ? { beziehung } : {}),
  };
}

/** Zahl aus etwas machen, das auch Text sein kann (v3 liefert Zähler als String). */
function zahl(wert: unknown): number {
  const n = Number(wert);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Teamherz-Abo (TikTok „subNotify" / WebcastSubNotifyMessage).
 *
 * WARUM DAS HIER NEU IST: Die App kannte den Ereignis-Typ 'sub' und bot in der
 * Trigger-Seite sogar eine fertige Vorlage („Neuer Sub (Teamherz)") an — nur
 * hat ihn NIE etwas ausgelöst. Der Typ kam im ganzen Code ausschließlich im
 * Test-Knopf und in der Demo-Vorschau vor. Die Vorlage bestand also den Test
 * und blieb im echten Stream für immer stumm.
 */
export function normalizeSub(
  data: {
    user?: RawUser;
    subMonth?: number | string; subMonths?: number | string;
    /** 0 = FIRST (neu), 1 = RESUB (Verlängerung), 2/3 = Kulanzfrist. */
    oldSubscribeStatus?: number | string;
  } & RawRoleData,
  ts: number,
): StudioEvent {
  const user = toUser(data.user);
  // Wer gerade abonniert hat, IST per Definition Superfan — auch wenn das
  // Abzeichen in dieser Nachricht (noch) fehlt.
  if (user) user.isSub = true;
  const monate = zahl(data.subMonth ?? data.subMonths);
  // TikTok unterscheidet selbst zwischen Erst-Abo und Verlängerung
  // (OldSubscribeStatus: FIRST=0, RESUB=1). Ohne diese Unterscheidung klingt
  // jede Verlängerung wie ein neuer Superfan — schön für die Statistik,
  // gelogen für den Streamer.
  const roh = data.oldSubscribeStatus;
  const neu = roh === undefined || roh === null ? undefined : Number(roh) === 0;
  return {
    type: 'sub',
    ts,
    user,
    ...(monate > 0 ? { subMonths: monate } : {}),
    ...(neu !== undefined ? { superfanNeu: neu } : {}),
  };
}

/**
 * Coin-Kiste / Schatztruhe (TikTok „envelope" / WebcastEnvelopeMessage).
 *
 * Der Absender steht NICHT als volles Zuschauer-Objekt drin, sondern als drei
 * Einzelfelder (sendUserName/sendUserId/sendUserAvatar). Deshalb wird hier ein
 * Minimal-Nutzer gebaut statt toUser() zu benutzen — sonst käme `undefined`
 * heraus und die Ansage hätte keinen Namen.
 *
 * Die Superfan-Truhe erkennt man an businessType 19; der Direkt-Weg liefert
 * zusätzlich einen Anzeigetext, der „ttlive_superfanbox" enthält.
 */
export function normalizeEnvelope(
  data: {
    envelopeInfo?: {
      sendUserName?: string; sendUserId?: string | number; sendUserAvatar?: RawImage;
      diamondCount?: number | string; peopleCount?: number | string; businessType?: number | string;
    };
    common?: { displayText?: { key?: string } };
  },
  ts: number,
): StudioEvent | null {
  const info = data.envelopeInfo;
  if (!info) return null;
  const id = String(info.sendUserId ?? '').trim();
  const name = String(info.sendUserName ?? '').trim();
  const bild = ersteBildUrl(info.sendUserAvatar);
  const user: StudioUser | undefined = id || name
    ? { id: id || name, nickname: name || id, ...(bild ? { profilePic: bild } : {}) }
    : undefined;
  const superFan = Number(info.businessType) === ENVELOPE_SUPER_FAN_BOX
    || String(data.common?.displayText?.key ?? '').toLowerCase().includes('ttlive_superfanbox');
  return {
    type: 'envelope',
    ts,
    user,
    envelope: {
      coins: zahl(info.diamondCount),
      winners: zahl(info.peopleCount),
      superFan,
    },
  };
}

/**
 * Superfan-Meldung (TikTok „superFan" / „superFanJoin").
 *
 * Diese Ereignisse kommen als BANNER-Nachricht (WebcastBarrageMessage), deren
 * Anzeigetext den Schlüssel „ttlive_superfan" enthält. Der Zuschauer steckt
 * nicht auf oberster Ebene, sondern in den Textbausteinen des Banners
 * (content.pieces[].userValue.user) — genau deshalb wäre er beim schlichten
 * Auslesen von `data.user` verloren gegangen.
 *
 * `beigetreten` unterscheidet den Neu-Beitritt von sonstigen Superfan-Meldungen
 * (Verlängerung, Stufenaufstieg). Die Bibliothek trennt das selbst in zwei
 * Ereignisse; wir behalten die Unterscheidung, statt alles in einen Topf zu
 * werfen — ein „X ist neuer Superfan!"-Alert bei jeder Stufenmeldung wäre
 * schnell nervig.
 */
export function normalizeSuperfan(
  data: {
    user?: RawUser;
    content?: Bausteine;
    commonBarrageContent?: Bausteine;
    /** Teamherz-Angaben — hier steckt die STUFE, die bisher immer fehlte. */
    fansLevelParam?: { currentGrade?: number | string; user?: RawUser };
  },
  beigetreten: boolean,
  ts: number,
): StudioEvent {
  const ausBausteinen = [...bausteine(data.content), ...bausteine(data.commonBarrageContent)]
    .map((p) => p?.userValue?.user)
    .find((u) => u);
  // Drei Wege zum Absender, in absteigender Verlässlichkeit. `fansLevelParam.user`
  // ist neu: In einem echten Cloud-Stream war es das EINZIGE Feld mit einem
  // Nutzer darin — die anderen beiden waren leer, und das Ereignis lief ohne
  // Namen durch (keine Punkte, kein Eintrag in der Bestenliste, kein Name in
  // der Ansage).
  const user = toUser(data.user ?? ausBausteinen ?? data.fansLevelParam?.user);
  // Die Teamherz-Stufe steckt bei dieser Nachricht in `fansLevelParam.currentGrade`
  // und NICHT beim Nutzer. Sie wandert trotzdem in den Nutzer statt in ein
  // eigenes Ereignis-Feld: Dann greifen Rollen-Gedächtnis, Anzeige und Logzeile
  // automatisch mit — sonst wäre dieselbe Angabe an zwei Stellen gepflegt, und
  // eine davon liefe irgendwann hinterher. Genau daran ist diese App schon
  // mehrfach erblindet.
  const stufe = ersteZahl(data.fansLevelParam?.currentGrade);
  return {
    type: 'superfan',
    ts,
    user: user && stufe > 0 && !user.teamLevel ? { ...user, teamLevel: stufe } : user,
    superfanNeu: beigetreten,
  };
}

/**
 * Emote/Sticker eines Zuschauers — reines Beteiligungs-Signal.
 *
 * Kostet nichts und beantwortet in der Auswertung die Frage „wie lebendig war
 * der Chat wirklich?" besser als die reine Zahl der Kommentare.
 */
export function normalizeEmote(
  data: { user?: RawUser; emoteList?: unknown[] } & RawRoleData,
  ts: number,
): StudioEvent {
  const sticker = stickerAusListe(data.emoteList);
  return { type: 'emote', ts, user: toUser(data.user), ...(sticker ? { sticker } : {}) };
}

/** businessType der Superfan-Truhe (belegt im Protokoll-Schema, EnvelopeBusinessType). */
export const ENVELOPE_SUPER_FAN_BOX = 19;

/** v2 splittet WebcastSocialMessage selbst in follow/share/join — wir mappen 1:1. */
export function normalizeSocial(
  data: {
    user?: RawUser;
    /** Nur beim Betreten (WebcastMemberMessage): TikTok sagt dabei mit, ob der
     *  Zuschauer zu den Top-Supportern des Streams gehört — inklusive Platz und
     *  Punktzahl. Die Angaben lagen an jedem Beitritt bei und wurden bisher
     *  verworfen. Für einen kleinen Kanal ist „Platz 2 betritt den Raum" die
     *  wertvollste Sekunde des Abends. */
    isTopUser?: boolean;
    rankScore?: number | string;
    topUserNo?: number | string;
    /** Woher der Zuschauer kam (nur beim Betreten). TikTok liefert Werte wie
     *  `live_merge-live_cover`; was es alles gibt, ist NICHT dokumentiert. */
    clientEnterSource?: string;
  } & RawRoleData,
  kind: 'follow' | 'share' | 'join',
  ts: number,
): StudioEvent {
  const user = toUser(data.user);
  if (user) {
    // Auch am Beitritt hängen die Beziehungs-Angaben — nur setzen, wenn wahr
    // (siehe normalizeChat).
    const roles = detectRoles(data);
    if (roles.isMod) user.isMod = true;
    if (roles.isSub) user.isSub = true;
    if (roles.isFollower) user.isFollower = true;
    if (roles.isMutual) user.isMutual = true;
    if (roles.hatGeschenkt) user.hatGeschenkt = true;
  }
  const platz = ersteZahl(data.topUserNo);
  const punkte = ersteZahl(data.rankScore);
  // „Ehrengast" nur, wenn TikTok es sagt ODER ein echter Platz mitkam. Eine
  // Punktzahl allein reicht nicht: Die hat fast jeder, der schon mal da war.
  const ehrengast = !!data.isTopUser || platz > 0;
  const beziehung = beziehungAuslesen(data);
  return {
    type: kind,
    ts,
    user,
    ...(kind === 'join' && ehrengast
      ? { ehrengast: { ...(platz > 0 ? { platz } : {}), ...(punkte > 0 ? { punkte } : {}) } }
      : {}),
    // Herkunft NUR beim Betreten: bei follow/share sagt TikTok nichts darueber,
    // ein Wert dort waere geraten.
    ...(kind === 'join' && data.clientEnterSource ? { herkunft: data.clientEnterSource } : {}),
    ...(beziehung ? { beziehung } : {}),
  };
}

export function normalizeViewerCount(
  // v3 liefert `totalUser`/`total` als TEXT. Ohne Umwandlung stünde in
  // viewerCount ein String — die Zuschauer-Bedingung („mind. X Zuschauer")
  // verglich dann Text mit Zahl, und in der Auswertung landete Text.
  //
  // `ranks` und `anonymous` kommen in DERSELBEN Nachricht mit und wurden
  // bisher restlos verworfen: TikToks eigene Bestenliste (Punktzahl + voller
  // Zuschauer je Platz) und die Zahl der unsichtbaren Zuschauer.
  data: {
    viewerCount?: number | string; totalUser?: number | string; total?: number | string;
    anonymous?: number | string;
    ranks?: Array<{ rank?: number | string; score?: number | string; user?: RawUser }>;
    /** Dieselbe Liste in eulerstreams Schreibweise — siehe liste(). */
    ranksList?: Array<{ rank?: number | string; score?: number | string; user?: RawUser }>;
    /** TikToks EIGENER Beliebtheitswert für den Raum. Kommt im Sekundentakt mit
     *  und wurde bisher weggeworfen. Laut Schema ein String (v3: `popularity:
     *  string`), `popStr` ist die bereits aufbereitete Anzeigeform. */
    popularity?: number | string;
    popStr?: string;
  },
  ts: number,
): StudioEvent {
  // TikToks eigener Beliebtheitswert. `popularity` ist laut Schema ein String;
  // `popStr` kann eine gekürzte Anzeigeform sein („1.2K"), deshalb erst die
  // rohe Zahl versuchen. Kommt nichts Zählbares, bleibt das Feld weg statt auf
  // 0 zu stehen — eine 0 sähe aus wie „Beliebtheit null" statt „nicht geliefert".
  const beliebtheit = ersteZahl(data.popularity, data.popStr);
  const beste: RaumPlatz[] = [];
  for (const [i, eintrag] of liste(data.ranks, data.ranksList).entries()) {
    const user = toUser(eintrag?.user);
    if (!user) continue; // ohne erkennbaren Zuschauer ist der Platz wertlos
    beste.push({ platz: zahl(eintrag?.rank) || i + 1, punkte: zahl(eintrag?.score), user });
  }
  return {
    type: 'viewer_count',
    ts,
    viewerCount: zahl(data.viewerCount ?? data.totalUser ?? data.total),
    ...(data.anonymous !== undefined ? { anonymousViewers: zahl(data.anonymous) } : {}),
    ...(beste.length > 0 ? { raumBeste: beste } : {}),
    ...(beliebtheit > 0 ? { beliebtheit } : {}),
  };
}
