// tiktok-normalize.ts — pure Normalisierung der v2-Payloads von
// tiktok-live-connector (WebcastChatMessage, WebcastGiftMessage, …) in unser
// StudioEvent-Modell. Bewusst tolerant getypt: die Lib liefert Protobuf-
// dekodierte Objekte, bei denen jedes Feld fehlen kann.
import type { StudioEvent, StudioUser } from '@botexe/trigger-engine';

interface RawUser {
  userId?: string;
  uniqueId?: string;
  nickname?: string;
  profilePicture?: { url?: string[] };
}

function toUser(raw: RawUser | undefined): StudioUser | undefined {
  if (!raw) return undefined;
  const id = raw.uniqueId || raw.userId || '';
  if (!id) return undefined;
  return {
    id,
    // Zweiter Schlüssel fürs Rollen-Gedächtnis: rohe userId, falls sie von der
    // primären id (= uniqueId) abweicht. So findet das Gedächtnis denselben
    // User auch, wenn ein Event mal nur die userId trägt.
    ...(raw.userId && raw.userId !== id ? { userId: raw.userId } : {}),
    nickname: raw.nickname || id,
    profilePic: raw.profilePicture?.url?.[0],
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
  data: { user?: RawUser; comment?: string } & RawRoleData,
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
  return { type: 'chat', ts, user, text: data.comment ?? '' };
}

/**
 * Gifts: giftType 1 = streakbar — nur das finale Event (repeatEnd) zählt,
 * sonst würde jede Combo-Stufe als eigenes Gift gewertet (Doppel-Zählung).
 * Liefert null für unterdrückte Zwischen-Events.
 */
export function normalizeGift(
  data: {
    user?: RawUser;
    giftId?: number;
    repeatCount?: number;
    repeatEnd?: number | boolean;
    giftDetails?: {
      giftName?: string;
      describe?: string;
      giftType?: number;
      diamondCount?: number;
      giftImage?: { url?: string[] };
      icon?: { url?: string[] };
    };
  },
  ts: number,
): StudioEvent | null {
  const details = data.giftDetails;
  const streakable = details?.giftType === 1;
  const repeatEnd = Boolean(data.repeatEnd);
  if (streakable && !repeatEnd) return null;

  const count = data.repeatCount || 1;
  const coinsPerUnit = details?.diamondCount ?? 0;
  const icon = details?.giftImage?.url?.[0] ?? details?.icon?.url?.[0];
  return {
    type: 'gift',
    ts,
    user: toUser(data.user),
    gift: {
      slug: details?.giftName || details?.describe || 'gift',
      giftId: data.giftId,
      count,
      coinsPerUnit,
      totalCoins: coinsPerUnit * count,
      ...(icon ? { icon } : {}),
    },
  };
}

export function normalizeLike(
  // Fallback-Feldnamen, falls der Cloud-WS (Euler) leicht andere Casings liefert.
  data: { user?: RawUser; likeCount?: number; totalLikeCount?: number; totalLikes?: number; total?: number },
  ts: number,
): StudioEvent {
  return {
    type: 'like',
    ts,
    user: toUser(data.user),
    likeCount: data.likeCount ?? 1,
    totalLikes: data.totalLikeCount ?? data.totalLikes ?? data.total ?? 0,
  };
}

/** v2 splittet WebcastSocialMessage selbst in follow/share/join — wir mappen 1:1. */
export function normalizeSocial(
  data: { user?: RawUser },
  kind: 'follow' | 'share' | 'join',
  ts: number,
): StudioEvent {
  return { type: kind, ts, user: toUser(data.user) };
}

export function normalizeViewerCount(
  data: { viewerCount?: number; totalUser?: number; total?: number },
  ts: number,
): StudioEvent {
  return { type: 'viewer_count', ts, viewerCount: data.viewerCount ?? data.totalUser ?? data.total ?? 0 };
}
