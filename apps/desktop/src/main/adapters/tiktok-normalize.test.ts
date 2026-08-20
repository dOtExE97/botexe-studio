import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSuperfan,
  normalizeEmote,
  normalizeSub,
  normalizeEnvelope,
  normalizeChat,
  normalizeGift,
  normalizeLike,
  normalizeSocial,
  normalizeViewerCount,
  detectRoles,
} from './tiktok-normalize';

// Fixtures entsprechen den v2-Shapes aus tiktok-live-connector@2.1.1-beta1
// (dist/types/tiktok-schema.d.ts: WebcastChatMessage, WebcastGiftMessage, …).

const user = {
  userId: '123',
  uniqueId: 'anna_99',
  nickname: 'Anna',
  profilePicture: { url: ['https://cdn.example/anna.jpg'] },
};

test('chat: comment + user werden normalisiert', () => {
  const e = normalizeChat({ user, comment: 'hallo stream!' }, 5_000);

  assert.equal(e.type, 'chat');
  assert.equal(e.ts, 5_000);
  assert.equal(e.text, 'hallo stream!');
  assert.equal(e.user?.id, 'anna_99');
  assert.equal(e.user?.nickname, 'Anna');
  assert.equal(e.user?.profilePic, 'https://cdn.example/anna.jpg');
});

test('chat: fehlender user wird zu undefined statt crash', () => {
  const e = normalizeChat({ comment: 'anon' }, 1);
  assert.equal(e.user, undefined);
  assert.equal(e.text, 'anon');
});

test('gift: finalisierter streak (giftType 1, repeatEnd 1) liefert event mit total-coins', () => {
  const e = normalizeGift(
    {
      user,
      giftId: 5655,
      repeatCount: 12,
      repeatEnd: 1,
      giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 },
    },
    2_000,
  );

  assert.ok(e, 'finalisierter streak erzeugt event');
  assert.equal(e?.type, 'gift');
  assert.equal(e?.gift?.slug, 'Rose');
  assert.equal(e?.gift?.giftId, 5655);
  assert.equal(e?.gift?.count, 12);
  assert.equal(e?.gift?.coinsPerUnit, 1);
  assert.equal(e?.gift?.totalCoins, 12);
});

// ── Direkt-Weg: v3-Schema des Connectors ────────────────────────────────────
// Dort heißen dieselben Felder anders (aus `giftDetails` wurde `gift`, aus
// `profilePicture` wurde `avatarThumb`, giftId ist ein String). Ohne diese
// Tests war die Suite blind: Sie prüfte nur den Cloud-Weg und blieb grün,
// während im Direkt-Modus Combos vervielfacht wurden und Coins auf 0 standen.
const userV3 = { id: '77', displayId: 'anna', nickname: 'Anna', avatarThumb: { urlList: ['pic-v3.jpg'] } };

test('gift v3: finalisierter streak zählt einmal, mit Coins und Namen', () => {
  const e = normalizeGift(
    {
      user: userV3,
      giftId: '5655',
      repeatCount: 12,
      repeatEnd: 1,
      gift: { name: 'Rose', type: 1, diamondCount: 1 },
    },
    2_000,
  );
  assert.ok(e, 'finalisierter streak erzeugt event');
  assert.equal(e?.gift?.slug, 'Rose', 'Name aus gift.name statt Platzhalter „gift"');
  assert.equal(e?.gift?.giftId, 5655, 'String-giftId wird zur Zahl vereinheitlicht');
  assert.equal(e?.gift?.count, 12);
  assert.equal(e?.gift?.coinsPerUnit, 1, 'Coins aus gift.diamondCount');
  assert.equal(e?.gift?.totalCoins, 12);
  assert.equal(e?.user?.id, 'anna', 'displayId ist der sprechende Schlüssel');
  assert.equal(e?.user?.userId, '77');
  assert.equal(e?.user?.profilePic, 'pic-v3.jpg', 'Bild aus avatarThumb.urlList');
});

test('gift v3: Combo-Zwischenstufe wird unterdrückt (sonst zählt jede Stufe)', () => {
  const zwischen = normalizeGift(
    { user: userV3, giftId: '5655', repeatCount: 3, repeatEnd: 0, gift: { name: 'Rose', type: 1, diamondCount: 1 } },
    2_000,
  );
  assert.equal(zwischen, null);
  // Auch über das v3-Feld `combo`, falls `type` mal fehlt.
  const perCombo = normalizeGift(
    { user: userV3, repeatCount: 3, repeatEnd: 0, gift: { name: 'Rose', combo: true, diamondCount: 1 } },
    2_000,
  );
  assert.equal(perCombo, null);
});

test('gift v3: nicht-streakbares Geschenk kommt sofort durch', () => {
  const e = normalizeGift(
    { user: userV3, giftId: '6090', repeatCount: 1, repeatEnd: 0, gift: { name: 'Fireworks', type: 2, diamondCount: 1088 } },
    2_000,
  );
  assert.ok(e);
  assert.equal(e?.gift?.slug, 'Fireworks');
  assert.equal(e?.gift?.totalCoins, 1088);
});

test('gift: laufender streak (giftType 1, repeatEnd 0) wird unterdrückt', () => {
  const e = normalizeGift(
    {
      user,
      giftId: 5655,
      repeatCount: 3,
      repeatEnd: 0,
      giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 },
    },
    2_000,
  );
  assert.equal(e, null);
});

test('gift: nicht-streakbares gift (giftType != 1) kommt sofort durch', () => {
  const e = normalizeGift(
    {
      user,
      giftId: 7777,
      repeatCount: 1,
      repeatEnd: 0,
      giftDetails: { giftName: 'Lion', giftType: 2, diamondCount: 2999 },
    },
    3_000,
  );

  assert.equal(e?.gift?.totalCoins, 2999);
});

test('like: count + total werden übernommen', () => {
  const e = normalizeLike({ user, likeCount: 15, totalLikeCount: 1234 }, 1);
  assert.equal(e.type, 'like');
  assert.equal(e.likeCount, 15);
  assert.equal(e.totalLikes, 1234);
});

test('social: follow und share werden unterschieden', () => {
  const follow = normalizeSocial({ user }, 'follow', 1);
  const share = normalizeSocial({ user }, 'share', 1);
  assert.equal(follow.type, 'follow');
  assert.equal(share.type, 'share');
  assert.equal(follow.user?.nickname, 'Anna');
});

test('viewer_count aus roomUser-message', () => {
  const e = normalizeViewerCount({ viewerCount: 256 }, 1);
  assert.equal(e.type, 'viewer_count');
  assert.equal(e.viewerCount, 256);
});

test('user-fallbacks: uniqueId fehlt → userId, nickname fehlt → uniqueId', () => {
  const e = normalizeChat(
    { user: { userId: '42', nickname: '', uniqueId: '' }, comment: 'x' },
    1,
  );
  assert.equal(e.user?.id, '42');
  assert.equal(e.user?.nickname, '42');
});

test('gift: icon-url aus giftDetails.giftImage wird übernommen', () => {
  const e = normalizeGift(
    {
      user,
      giftId: 1,
      repeatCount: 1,
      repeatEnd: 0,
      giftDetails: {
        giftName: 'Lion',
        giftType: 2,
        diamondCount: 2999,
        giftImage: { url: ['https://cdn.example/lion.webp'] },
      },
    },
    1,
  );
  assert.equal(e?.gift?.icon, 'https://cdn.example/lion.webp');
});

// ── Rollen-Erkennung (TTS-Vorlese-Filter) ──────────────────────────────────
test('detectRoles: Mod/Sub/Follower aus userIdentity (camelCase, Direkt-Modus)', () => {
  assert.deepEqual(
    detectRoles({ userIdentity: { isModeratorOfAnchor: true } }),
    { isMod: true, isSub: false, isFollower: false, isMutual: false, hatGeschenkt: false },
  );
  assert.deepEqual(
    detectRoles({ userIdentity: { isSubscriberOfAnchor: true } }),
    { isMod: false, isSub: true, isFollower: false, isMutual: false, hatGeschenkt: false },
  );
  assert.equal(detectRoles({ userIdentity: { isFollowerOfAnchor: true } }).isFollower, true);
});

test('detectRoles: gegenseitiges Folgen und Schon-Schenker', () => {
  // Beide Angaben liegen an JEDER Chat-Nachricht bei und wurden bis v0.49.0
  // weggeworfen. Sie sagen etwas über die BEZIEHUNG: „folgt euch gegenseitig"
  // ist mehr als ein Follower, „hat schon mal geschenkt" gilt auch für einen
  // früheren Stream, den die App nie gesehen hat.
  assert.equal(detectRoles({ userIdentity: { isMutualFollowingWithAnchor: true } }).isMutual, true);
  assert.equal(detectRoles({ userIdentity: { isGiftGiverOfAnchor: true } }).hatGeschenkt, true);
  // Ein Follower ist NICHT automatisch gegenseitig — sonst wäre die Angabe wertlos.
  assert.equal(detectRoles({ userIdentity: { isFollowerOfAnchor: true } }).isMutual, false);
  // Auch in der GROSS-Schreibweise (defensive Cloud-Variante).
  assert.equal(detectRoles({ UserIdentity: { isGiftGiverOfAnchor: true } }).hatGeschenkt, true);
});

test('detectRoles: Follower auch aus followInfo.followStatus / isFollower', () => {
  assert.equal(detectRoles({ user: { followInfo: { followStatus: 1 } } }).isFollower, true);
  assert.equal(detectRoles({ user: { followInfo: { followStatus: 2 } } }).isFollower, true);
  assert.equal(detectRoles({ user: { followStatus: 1 } }).isFollower, true);
  assert.equal(detectRoles({ user: { isFollower: true } }).isFollower, true);
  // followStatus 0 = folgt nicht
  assert.equal(detectRoles({ user: { followInfo: { followStatus: 0 } } }).isFollower, false);
});

test('detectRoles: GROSS geschriebenes UserIdentity (Cloud-Variante) wird auch gelesen', () => {
  assert.equal(detectRoles({ UserIdentity: { isModeratorOfAnchor: true } }).isMod, true);
});

test('detectRoles: leere/unbekannte Daten → alles false (kein Crash)', () => {
  const nichts = { isMod: false, isSub: false, isFollower: false, isMutual: false, hatGeschenkt: false };
  assert.deepEqual(detectRoles({}), nichts);
  assert.deepEqual(detectRoles({ user: {} }), nichts);
});

test('normalizeChat: reichert user mit Rollen an (Mod wird erkannt → wird vorgelesen)', () => {
  const e = normalizeChat({ user, comment: 'mod hier', userIdentity: { isModeratorOfAnchor: true } }, 1);
  assert.equal(e.user?.isMod, true);
  assert.ok(!e.user?.isSub); // kein Sub → bleibt unbesetzt (Filter prüft truthy)
});

// Teamherz-Stufe: TikTok liefert sie je nach Nachrichtenart an einer von drei
// Stellen (belegt in tiktok-live-proto/v3). Alle drei müssen greifen, sonst
// bleibt die Stufe bei manchen Ereignissen auf 0 und eine Schwelle wie
// „erst ab Stufe 3 vorlesen" würde still nie erfüllt.
test('Teamherz-Stufe: aus fansClub.data.level', () => {
  const e = normalizeChat({ user: { uniqueId: 'anna', nickname: 'Anna', fansClub: { data: { level: 5, clubName: 'Löwen' } } }, comment: 'hi' }, 0);
  assert.equal(e?.user?.teamLevel, 5);
});

test('Teamherz-Stufe: aus fansClubInfo.fansLevel (kommt als Text)', () => {
  const e = normalizeChat({ user: { uniqueId: 'ben', nickname: 'Ben', fansClubInfo: { fansLevel: '3' } }, comment: 'hi' }, 0);
  assert.equal(e?.user?.teamLevel, 3);
});

test('Teamherz-Stufe: aus der Abzeichen-Liste (sceneType FANS)', () => {
  const e = normalizeChat({
    user: { uniqueId: 'cara', nickname: 'Cara', badgeList: [
      { sceneType: 8, privilegeLogExtra: { level: '12' } },   // Geschenke-Stufe
      { sceneType: 10, privilegeLogExtra: { level: '7' } },   // Teamherz
    ] },
    comment: 'hi',
  }, 0);
  assert.equal(e?.user?.teamLevel, 7, 'muss die FANS-Stufe nehmen, nicht die Geschenke-Stufe');
  assert.equal(e?.user?.gifterLevel, 12);
});

test('Teamherz-Stufe: ohne Angabe bleibt das Feld WEG (überschreibt nichts)', () => {
  // Wichtig: Nicht 0 setzen. Sonst würde ein Ereignis ohne Abzeichen-Daten das
  // überschreiben, was das Rollen-Gedächtnis vom Chat schon weiß.
  const e = normalizeChat({ user: { uniqueId: 'dee', nickname: 'Dee' }, comment: 'hi' }, 0);
  assert.equal('teamLevel' in (e?.user ?? {}), false);
  assert.equal('gifterLevel' in (e?.user ?? {}), false);
});

test('Teamherz-Stufe: Geschenke-Stufe aus payGrade', () => {
  const e = normalizeChat({ user: { uniqueId: 'eve', nickname: 'Eve', payGrade: { level: 21 } }, comment: 'hi' }, 0);
  assert.equal(e?.user?.gifterLevel, 21);
});

// ── v3-Schema im Direkt-Weg (Regression zu v0.46.1) ────────────────────────
// Für Geschenke wurde das in v0.45.1 repariert, für Chat/Likes/Zuschauer NICHT.
// Folge im Direkt-Modus: Chat ohne Text, jeder Like-Schwall zählte als 1,
// Zuschauerzahl als Text. Diese Tests halten beide Schreibweisen fest.

test('Chat: v3 liefert `content` statt `comment` — Text darf nicht leer sein', () => {
  const cloud = normalizeChat({ user: { uniqueId: 'a', nickname: 'A' }, comment: 'hallo' }, 1);
  const direkt = normalizeChat({ user: { uniqueId: 'a', nickname: 'A' }, content: 'hallo' }, 1);
  assert.equal(cloud.text, 'hallo');
  assert.equal(direkt.text, 'hallo', 'v3-Feld `content` muss gelesen werden');
});

test('Like: v3 liefert `count` — ein Schwall zählt nicht als 1', () => {
  assert.equal(normalizeLike({ likeCount: 12 }, 1).likeCount, 12);
  assert.equal(normalizeLike({ count: 12 }, 1).likeCount, 12, 'v3-Feld `count`');
  assert.equal(normalizeLike({}, 1).likeCount, 1, 'ohne Angabe mindestens 1');
});

test('Like: `total` kommt als TEXT und muss Zahl werden', () => {
  const e = normalizeLike({ count: 3, total: '4711' }, 1);
  assert.strictEqual(e.totalLikes, 4711);
  assert.equal(typeof e.totalLikes, 'number');
});

test('Zuschauerzahl: Text aus dem v3-Schema wird zur Zahl', () => {
  const e = normalizeViewerCount({ totalUser: '1234' }, 1);
  assert.strictEqual(e.viewerCount, 1234);
  assert.equal(typeof e.viewerCount, 'number');
  assert.strictEqual(normalizeViewerCount({}, 1).viewerCount, 0);
  assert.strictEqual(normalizeViewerCount({ total: 'kaputt' }, 1).viewerCount, 0, 'Unsinn ergibt 0, nicht NaN');
});

// ── Teamherz-Abo ───────────────────────────────────────────────────────────
// Der Ereignis-Typ 'sub' und die Trigger-Vorlage „Neuer Sub" gab es seit
// Monaten — ausgelöst hat ihn NIE etwas. Der Test-Knopf funktionierte, im
// Stream blieb es still. Diese Tests halten die Verdrahtung fest.

test('Abo: erzeugt ein sub-Ereignis mit Nutzer', () => {
  const e = normalizeSub({ user: { uniqueId: 'fan', nickname: 'Fan' } }, 5);
  assert.equal(e.type, 'sub');
  assert.equal(e.user?.id, 'fan');
  assert.equal(e.user?.isSub, true, 'wer gerade abonniert hat, IST Teamherz');
});

test('Abo: Monate kommen als Text und werden Zahl', () => {
  assert.equal(normalizeSub({ user: { uniqueId: 'a', nickname: 'A' }, subMonth: '7' }, 1).subMonths, 7);
  assert.equal(normalizeSub({ user: { uniqueId: 'a', nickname: 'A' } }, 1).subMonths, undefined);
});

// ── Coin-Kiste / Truhe ─────────────────────────────────────────────────────

test('Truhe: Absender, Coins und Gewinnerzahl werden gelesen', () => {
  const e = normalizeEnvelope({
    envelopeInfo: { sendUserName: 'Mia', sendUserId: '4711', diamondCount: '500', peopleCount: '20' },
  }, 9);
  assert.ok(e);
  assert.equal(e.type, 'envelope');
  assert.equal(e.user?.nickname, 'Mia');
  assert.equal(e.user?.id, '4711');
  assert.equal(e.envelope?.coins, 500, 'Text-Zahlen werden umgewandelt');
  assert.equal(e.envelope?.winners, 20);
  assert.equal(e.envelope?.superFan, false);
});

test('Truhe: Superfan-Truhe über businessType 19 erkannt', () => {
  const e = normalizeEnvelope({ envelopeInfo: { sendUserName: 'A', businessType: 19 } }, 1);
  assert.equal(e?.envelope?.superFan, true);
});

test('Truhe: Superfan-Truhe auch über den Anzeigetext erkannt', () => {
  const e = normalizeEnvelope(
    { envelopeInfo: { sendUserName: 'A' }, common: { displayText: { key: 'ttlive_superfanbox_v2' } } },
    1,
  );
  assert.equal(e?.envelope?.superFan, true);
});

test('Truhe: ohne envelopeInfo kommt null statt eines leeren Ereignisses', () => {
  assert.equal(normalizeEnvelope({}, 1), null);
});

test('Truhe: ohne Absender bleibt der Nutzer leer statt zu raten', () => {
  const e = normalizeEnvelope({ envelopeInfo: { diamondCount: 100 } }, 1);
  assert.equal(e?.user, undefined);
  assert.equal(e?.envelope?.coins, 100, 'die Truhe zählt trotzdem');
});

// ── TikToks eigene Raum-Bestenliste + anonyme Zuschauer ────────────────────
// Beides kommt in JEDEM Zuschauer-Tick mit und wurde bis v0.47 weggeworfen.

test('Zuschauer-Tick: Bestenliste und anonyme Zuschauer werden gelesen', () => {
  const e = normalizeViewerCount({
    totalUser: '250',
    anonymous: '40',
    ranks: [
      { rank: '1', score: '9000', user: { uniqueId: 'top', nickname: 'Top' } },
      { rank: '2', score: '500', user: { uniqueId: 'zwei', nickname: 'Zwei' } },
    ],
  }, 1);
  assert.equal(e.viewerCount, 250);
  assert.equal(e.anonymousViewers, 40);
  assert.equal(e.raumBeste?.length, 2);
  assert.equal(e.raumBeste?.[0]?.platz, 1);
  assert.equal(e.raumBeste?.[0]?.punkte, 9000, 'Punktzahl kommt als Text');
  assert.equal(e.raumBeste?.[0]?.user.nickname, 'Top');
});

test('Zuschauer-Tick: Plätze ohne erkennbaren Zuschauer fallen raus', () => {
  const e = normalizeViewerCount({ totalUser: '5', ranks: [{ rank: 1, score: 10 }, { rank: 2, score: 5, user: { uniqueId: 'b', nickname: 'B' } }] }, 1);
  assert.equal(e.raumBeste?.length, 1, 'ein Platz ohne Nutzer ist wertlos');
  assert.equal(e.raumBeste?.[0]?.user.id, 'b');
});

test('Zuschauer-Tick ohne Zusatzdaten bleibt schlank (keine leeren Felder)', () => {
  const e = normalizeViewerCount({ totalUser: '7' }, 1);
  assert.equal(e.raumBeste, undefined);
  assert.equal(e.anonymousViewers, undefined);
});

// ── Superfans ──────────────────────────────────────────────────────────────
// Aus Chris' Log vom 02.08.2026: „superFan" kam zweimal an und landete im
// Papierkorb — jedes Mal Sekunden bevor die App denselben Zuschauer als
// Teamherz erkannte. Der Zuschauer steckt NICHT auf oberster Ebene, sondern in
// den Textbausteinen des Banners.

test('Superfan: Zuschauer wird aus den Textbausteinen des Banners geholt', () => {
  const e = normalizeSuperfan({
    content: { pieces: [{}, { userValue: { user: { uniqueId: 'fan1', nickname: 'Fan Eins' } } }] },
  }, true, 7);
  assert.equal(e.type, 'superfan');
  assert.equal(e.user?.id, 'fan1');
  assert.equal(e.user?.nickname, 'Fan Eins');
  assert.equal(e.superfanNeu, true);
});

test('Superfan: Beitritt und sonstige Meldung bleiben unterscheidbar', () => {
  const daten = { user: { uniqueId: 'a', nickname: 'A' } };
  assert.equal(normalizeSuperfan(daten, true, 1).superfanNeu, true);
  assert.equal(normalizeSuperfan(daten, false, 1).superfanNeu, false);
});

test('Superfan: Nutzer auf oberster Ebene hat Vorrang vor den Bausteinen', () => {
  const e = normalizeSuperfan({
    user: { uniqueId: 'direkt', nickname: 'Direkt' },
    content: { pieces: [{ userValue: { user: { uniqueId: 'baustein', nickname: 'Baustein' } } }] },
  }, true, 1);
  assert.equal(e.user?.id, 'direkt');
});

test('Superfan ohne jeden Nutzer ergibt trotzdem ein Ereignis', () => {
  const e = normalizeSuperfan({}, false, 1);
  assert.equal(e.type, 'superfan');
  assert.equal(e.user, undefined);
});

test('Emote: erzeugt ein Beteiligungs-Ereignis mit Zuschauer', () => {
  const e = normalizeEmote({ user: { uniqueId: 'x', nickname: 'X' } }, 3);
  assert.equal(e.type, 'emote');
  assert.equal(e.user?.id, 'x');
});

// ── Superfan (= TikToks Abo, seit 15.09.2025 „Super Fan") ──────────────────
// TikTok unterscheidet selbst zwischen Erst-Abo und Verlängerung
// (OldSubscribeStatus: FIRST=0, RESUB=1) und liefert die Treue-Monate mit.

test('Superfan: NEU und Verlängerung bleiben unterscheidbar', () => {
  const u = { user: { uniqueId: 'a', nickname: 'A' } };
  assert.equal(normalizeSub({ ...u, oldSubscribeStatus: 0 }, 1).superfanNeu, true, 'FIRST = neu');
  assert.equal(normalizeSub({ ...u, oldSubscribeStatus: 1 }, 1).superfanNeu, false, 'RESUB = Verlängerung');
  assert.equal(normalizeSub({ ...u, oldSubscribeStatus: '1' }, 1).superfanNeu, false, 'auch als Text');
});

test('Superfan: ohne Angabe wird NICHTS behauptet', () => {
  // Lieber keine Aussage als eine falsche — sonst zählt jede Verlängerung als
  // neuer Superfan und die Auswertung ist geschönt.
  assert.equal(normalizeSub({ user: { uniqueId: 'a', nickname: 'A' } }, 1).superfanNeu, undefined);
});

test('Superfan: Treue-Monate kommen als Text und werden Zahl', () => {
  assert.equal(normalizeSub({ user: { uniqueId: 'a', nickname: 'A' }, subMonth: '14' }, 1).subMonths, 14);
});

// ── Sticker (TikToks „emotes") ─────────────────────────────────────────────
// Sie liegen an JEDER Chat-Nachricht an und wurden bisher verworfen. Weil eine
// reine Sticker-Nachricht als Text nur ein Leerzeichen trägt, verschwand sie
// damit spurlos. Die Werte unten stammen aus einem echten Mitschnitt
// (@hi_im_billa, 20.08.2026) — dort waren 8 von 21 Chat-Nachrichten Sticker.

test('normalizeChat: Sticker aus emotes werden übernommen', () => {
  const e = normalizeChat({
    user: { userId: '1', nickname: 'Solo Leveling' },
    content: ' ',
    emotes: [{
      index: 0,
      emote: {
        emoteId: '7444741533452225312',
        image: { urlList: ['https://p16-webcast.tiktokcdn.com/img/x.webp'], avgColor: '#DCDCFA', isAnimated: false },
        packageId: 'fansclub',
      },
    }],
  }, 1_000);
  assert.equal(e.sticker?.length, 1);
  assert.equal(e.sticker?.[0]?.id, '7444741533452225312');
  assert.equal(e.sticker?.[0]?.bild, 'https://p16-webcast.tiktokcdn.com/img/x.webp');
  assert.equal(e.sticker?.[0]?.index, 0);
  assert.equal(e.sticker?.[0]?.paket, 'fansclub');
  assert.equal(e.sticker?.[0]?.farbe, '#DCDCFA');
  assert.equal(e.text, ' ', 'Text bleibt unverändert');
});

test('normalizeChat: ohne emotes bleibt sticker undefined', () => {
  const e = normalizeChat({ user: { userId: '1' }, content: 'hallo' }, 1_000);
  assert.equal(e.sticker, undefined, 'kein leeres Array — sonst denkt jeder Leser, da wären welche');
});

test('normalizeChat: Sticker ohne emoteId wird verworfen, der Rest überlebt', () => {
  // Ohne ID ist ein Sticker für Regeln wertlos — aber er darf die Nachricht
  // nicht mitreißen.
  const e = normalizeChat({
    user: { userId: '1' },
    content: '',
    emotes: [
      { index: 0, emote: { image: { urlList: ['https://x/1.webp'] } } },
      { index: 1, emote: { emoteId: '42', image: { urlList: ['https://x/2.webp'] } } },
    ],
  }, 1_000);
  assert.equal(e.sticker?.length, 1);
  assert.equal(e.sticker?.[0]?.id, '42');
});

test('normalizeChat: Sticker mitten im Text behält seine Position', () => {
  const e = normalizeChat({
    user: { userId: '1' },
    content: '@J.Ezra ',
    emotes: [{ index: 8, emote: { emoteId: '99', image: { urlList: ['https://x/9.webp'] } } }],
  }, 1_000);
  assert.equal(e.sticker?.[0]?.index, 8);
});

test('normalizeEmote: emoteList wird nicht mehr weggeworfen', () => {
  const e = normalizeEmote({
    user: { uniqueId: 'a', nickname: 'A' },
    emoteList: [{ emoteId: '99', image: { urlList: ['https://x/9.webp'], isAnimated: true } }],
  }, 1_000);
  assert.equal(e.sticker?.length, 1);
  assert.equal(e.sticker?.[0]?.id, '99');
  assert.equal(e.sticker?.[0]?.animiert, true);
  assert.equal(e.sticker?.[0]?.index, 0, 'reine Sticker-Nachricht: Position 0');
});

test('normalizeEmote: ohne emoteList bleibt sticker undefined', () => {
  const e = normalizeEmote({ user: { uniqueId: 'a', nickname: 'A' } }, 1_000);
  assert.equal(e.sticker, undefined);
});
