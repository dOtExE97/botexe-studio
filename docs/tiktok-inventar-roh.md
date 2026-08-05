# Rohe Maschinen-Sicht auf die TikTok-Datenquellen

<!-- ERZEUGT von scripts/tiktok-inventar.mjs — nicht von Hand ändern.
     Neu erzeugen mit: npm run inventar

     Die GEPRÜFTE Übersicht mit Belegen und Bewertung steht daneben in
     docs/tiktok-datenquellen.md. Diese Datei hier ist nur der Rohabzug: Sie
     sieht, was im Schema steht — nicht, was davon wirklich ankommt. -->

Diese Übersicht entsteht aus drei Quellen im Repo: dem Protokoll-Schema von
`tiktok-live-proto`, dem Cloud-Router (`tiktok-cloud.ts`) und den Abos des
Adapters (`tiktok-adapter.ts`). Sie beantwortet damit die Frage, die sonst
jedes Mal von Hand beantwortet wurde: **Was liegt ungenutzt herum?**

- **72** Nachrichtenarten kennt das Protokoll
- **9** davon wertet die App aus
- **12** ungenutzte tragen Felder, die nach etwas aussehen

## Was die App auswertet

| Nachrichtenart | Ereignis in der App |
| --- | --- |
| `WebcastChatMessage` | `chat` |
| `WebcastEmoteChatMessage` | `emote` |
| `WebcastEnvelopeMessage` | `envelope` |
| `WebcastGiftMessage` | `gift` |
| `WebcastLikeMessage` | `like` |
| `WebcastMemberMessage` | `member` |
| `WebcastRankUpdateMessage` | `rankUpdate` |
| `WebcastRoomUserSeqMessage` | `roomUser` |
| `WebcastSubNotifyMessage` | `subNotify` |

## Ungenutzt — aber vermutlich wertvoll

Sortiert danach, wie viele aussagekräftige Felder drinstecken (Nutzer, Coins,
Punktzahl, Text …). Die reine Feldzahl ist nur ein Hinweis, kein Beweis: Ob es
sich lohnt, entscheidet der Blick ins Schema.

| Nachrichtenart | Interessante Felder |
| --- | --- |
| `WebcastLinkMicBattle` | `battleId`, `battleSettings`, `battleResult`, `battleComboV2`, `teamMember`, `actionByUserId`, `teamBattleResult`, `teamArmies` |
| `WebcastLinkMicArmies` | `battleId`, `fromUserId`, `giftId`, `giftCount`, `giftIconImage`, `totalDiamondCount`, `teamArmies`, `battleSettings` |
| `WebcastLinkMicMethod` | `messageType`, `userId`, `totalLinkmicFanTicket`, `userScores`, `toUserId`, `fromUserId`, `secFromUserId`, `secToUserId` |
| `WebcastBarrageMessage` | `content`, `user`, `userGradeParam`, `giftGalleryParams` |
| `WebcastRankTextMessage` | `curUserId`, `content`, `rankType`, `userEnigmaInfo` |
| `WebcastBottomMessage` | `content`, `textType`, `violationUserId` |
| `WebcastLiveIntroMessage` | `content`, `user`, `contentLanguage` |
| `WebcastRoomNotifyMessage` | `content`, `user`, `fromUserId` |
| `WebcastLinkMessage` | `messageType`, `userToastContent` |
| `WebcastLinkMicBattlePunishFinish` | `battleId`, `battleSettings` |
| `WebcastMarqueeAnnouncementMessage` | `messageScene`, `messageEntity` |
| `WebcastSocialMessage` | `user`, `targetUserId` |

## Ungenutzt und vermutlich uninteressant

`WebcastAccessControlMessage` · `WebcastAccessRecallMessage` · `WebcastBoostCardMessage` · `WebcastCapsuleMessage` · `WebcastCaptionMessage` · `WebcastControlMessage` · `WebcastGameRankNotifyMessage` · `WebcastGiftBroadcastMessage` · `WebcastGiftDynamicRestrictionMessage` · `WebcastGiftPanelUpdateMessage` · `WebcastGiftPromptMessage` · `WebcastGoalUpdateMessage` · `WebcastGuideMessage` · `WebcastHourlyRankRewardMessage` · `WebcastImDeleteMessage` · `WebcastImEnterRoomMessage` · `WebcastInRoomBannerMessage` · `WebcastLinkLayerMessage` · `WebcastLinkMicArmies_ArmiesEntry` · `WebcastLinkMicBattleItemCard` · `WebcastLinkMicBattle_AnchorMatchSettingsEntry` · `WebcastLinkMicBattle_BattleComboV2Entry` · `WebcastLinkMicBattle_BattleResultEntry` · `WebcastLinkMicBattle_LeagueInfoMapEntry` · `WebcastLinkMicBattle_LeagueScoreInfoMapEntry` · `WebcastLinkMicBattle_TrackingExtraEntry` · `WebcastLinkMicFanTicketMethod` · `WebcastLinkMicLayoutStateMessage` · `WebcastLinkStateMessage` · `WebcastLinkmicBattleTaskMessage` · `WebcastLiveGameIntroMessage` · `WebcastMemberMessage_AdminPermissionsEntry` · `WebcastMsgDetectMessage` · `WebcastNoticeMessage` · `WebcastOecLiveShoppingMessage` · `WebcastPartnershipDropsUpdateMessage` · `WebcastPartnershipGameOfflineMessage` · `WebcastPartnershipPunishMessage` · `WebcastPerceptionMessage` · `WebcastPollMessage` · `WebcastPushFrame` · `WebcastQuestionNewMessage` · `WebcastRoomMessage` · `WebcastRoomPinMessage` · `WebcastRoomVerifyMessage` · `WebcastSpeakerMessage` · `WebcastSubPinEventMessage` · `WebcastSystemMessage` · `WebcastToastMessage` · `WebcastUnauthorizedMemberMessage` · `WebcastViewerPicksUpdateMessage`

---

*Erzeugt aus `tiktok-live-proto` — bei einem Update der Bibliothek neu
erzeugen, dann zeigt die Liste die neuen Arten.*
