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
import type { StudioEvent, StudioUser, RaumPlatz } from '@botexe/trigger-engine';

interface RawImage {
  url?: string[];
  urlList?: string[];
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
  /** Geschenke-Stufe des Zuschauers bei TikTok insgesamt. */
  payGrade?: { level?: number };
  /** Abzeichen-Liste — enthält Stufen als Text unter privilegeLogExtra.level. */
  badgeList?: Array<{
    sceneType?: number;
    badgeSceneType?: number;
    privilegeLogExtra?: { level?: string };
  }>;
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
  const treffer = (raw.badgeList ?? []).find((b) => (b.sceneType ?? b.badgeSceneType) === art);
  return ersteZahl(treffer?.privilegeLogExtra?.level);
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
  };
}

interface RawUserIdentity {
  isSubscriberOfAnchor?: boolean;
  isModeratorOfAnchor?: boolean;
  isFollowerOfAnchor?: boolean;
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
export function detectRoles(data: RawRoleData): { isMod: boolean; isSub: boolean; isFollower: boolean } {
  const id = data.userIdentity ?? data.UserIdentity;
  const u = data.user;
  const followStatus = Number(u?.followInfo?.followStatus ?? u?.followStatus ?? 0);
  return {
    isMod: !!id?.isModeratorOfAnchor,
    isSub: !!id?.isSubscriberOfAnchor,
    isFollower: !!(id?.isFollowerOfAnchor || u?.isFollower || (Number.isFinite(followStatus) && followStatus >= 1)),
  };
}

export function normalizeChat(
  // `comment` = Cloud-Weg (eulerstream), `content` = v3-Schema im Direkt-Weg.
  // Dieselbe Falle wie bei den Geschenken in v0.45.1: TikTok hat die Felder
  // umbenannt, und wer nur den alten Namen liest, bekommt LEEREN Text — kein
  // Vorlesen, kein Schlüsselwort, kein !befehl. Besonders bitter, weil die App
  // bei Problemen selbst den Direkt-Modus vorschlägt.
  data: { user?: RawUser; comment?: string; content?: string } & RawRoleData,
  ts: number,
): StudioEvent {
  const user = toUser(data.user);
  // Rollen (Teamherz/Mod/Follower) fürs TTS-Vorlese-Filter und künftige Trigger.
  if (user) {
    const roles = detectRoles(data);
    if (roles.isSub) user.isSub = true;
    if (roles.isMod) user.isMod = true;
    if (roles.isFollower) user.isFollower = true;
  }
  return { type: 'chat', ts, user, text: data.comment ?? data.content ?? '' };
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
  return {
    type: 'like',
    ts,
    user: toUser(data.user),
    likeCount: zahl(data.likeCount ?? data.count) || 1,
    totalLikes: zahl(data.totalLikeCount ?? data.totalLikes ?? data.total),
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
  data: { user?: RawUser; subMonth?: number | string; subMonths?: number | string } & RawRoleData,
  ts: number,
): StudioEvent {
  const user = toUser(data.user);
  // Wer gerade abonniert hat, IST per Definition Teamherz — auch wenn das
  // Abzeichen in dieser Nachricht (noch) fehlt.
  if (user) user.isSub = true;
  const monate = zahl(data.subMonth ?? data.subMonths);
  return { type: 'sub', ts, user, ...(monate > 0 ? { subMonths: monate } : {}) };
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

/** businessType der Superfan-Truhe (belegt im Protokoll-Schema, EnvelopeBusinessType). */
export const ENVELOPE_SUPER_FAN_BOX = 19;

/** v2 splittet WebcastSocialMessage selbst in follow/share/join — wir mappen 1:1. */
export function normalizeSocial(
  data: { user?: RawUser },
  kind: 'follow' | 'share' | 'join',
  ts: number,
): StudioEvent {
  return { type: kind, ts, user: toUser(data.user) };
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
  },
  ts: number,
): StudioEvent {
  const beste: RaumPlatz[] = [];
  for (const [i, eintrag] of (Array.isArray(data.ranks) ? data.ranks : []).entries()) {
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
  };
}
