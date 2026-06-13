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
    nickname: raw.nickname || id,
    profilePic: raw.profilePicture?.url?.[0],
  };
}

interface RawUserIdentity {
  isSubscriberOfAnchor?: boolean;
  isModeratorOfAnchor?: boolean;
  isFollowerOfAnchor?: boolean;
}

export function normalizeChat(
  data: { user?: RawUser; comment?: string; userIdentity?: RawUserIdentity },
  ts: number,
): StudioEvent {
  const user = toUser(data.user);
  // Rollen (Teamherz/Mod/Follower) fürs TTS-Vorlese-Filter und künftige Trigger.
  if (user && data.userIdentity) {
    if (data.userIdentity.isSubscriberOfAnchor) user.isSub = true;
    if (data.userIdentity.isModeratorOfAnchor) user.isMod = true;
    if (data.userIdentity.isFollowerOfAnchor) user.isFollower = true;
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
  data: { user?: RawUser; likeCount?: number; totalLikeCount?: number },
  ts: number,
): StudioEvent {
  return {
    type: 'like',
    ts,
    user: toUser(data.user),
    likeCount: data.likeCount ?? 1,
    totalLikes: data.totalLikeCount ?? 0,
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

export function normalizeViewerCount(data: { viewerCount?: number }, ts: number): StudioEvent {
  return { type: 'viewer_count', ts, viewerCount: data.viewerCount ?? 0 };
}
