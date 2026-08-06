// tiktok-pin.test.ts — angepinnte Nachrichten.
//
// DIE FALLE, die dieser Test festhält: Im Diagnose-Log eines echten Streams
// stand nur EINE Form der Pin-Nachricht — die mit `giftMessage`. Der Streamer
// hatte aber danach auch eine Chat-Nachricht angepinnt; die tauchte im Log nie
// auf, weil Feldlisten je Art nur einmal ausgegeben werden.
//
// Wer allein danach baut, schreibt ein Widget, das bei jeder gepinnten
// Chat-Nachricht leer bleibt — und merkt es nie, weil nichts abstürzt. Das
// Schema (tiktok-live-proto/v3) kennt fünf Sorten; hier stehen sie alle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lesePin, pinText } from './tiktok-pin';

const OPERATOR = { nickname: 'dOtExE_97', userId: '6635416940436602885' };

test('angepinnte CHAT-Nachricht — die Form, die im Log fehlte', () => {
  const p = lesePin({
    action: 1, pinMsgId: 'p1', displayDuration: '300', operator: OPERATOR,
    chatMessage: { user: { nickname: 'Noni', uniqueId: 'noni' }, comment: 'Heute nur Chill-Zocken' },
  });
  assert.equal(p?.angepinnt, true);
  assert.equal(p?.inhalt?.art, 'chat');
  assert.equal(p?.inhalt?.text, 'Heute nur Chill-Zocken');
  assert.equal(p?.inhalt?.vonNickname, 'Noni');
  assert.equal(p?.vonModerator, 'dOtExE_97');
  assert.equal(p?.dauerSek, 300);
});

test('Chat-Text auch in der v3-Schreibweise (`content`)', () => {
  // Dieselbe Falle wie beim normalen Chat, wo genau das schon einmal zu leerem
  // Text geführt hat: Cloud sagt `comment`, das v3-Schema sagt `content`.
  const p = lesePin({
    action: 1, pinMsgId: 'p2',
    chatMessage: { user: { nickname: 'Liliana' }, content: 'Gleich PK!' },
  });
  assert.equal(p?.inhalt?.text, 'Gleich PK!');
});

test('angepinntes GESCHENK — die Form aus dem echten Log', () => {
  const p = lesePin({
    action: 1, pinMsgId: 'p3', operator: OPERATOR,
    giftMessage: {
      user: { nickname: 'marie_x', uniqueId: 'marie_x' },
      giftDetails: { giftName: 'Löwe' }, repeatCount: 3,
    },
  });
  assert.equal(p?.inhalt?.art, 'geschenk');
  assert.equal(p?.inhalt?.geschenk?.name, 'Löwe');
  assert.equal(p?.inhalt?.geschenk?.anzahl, 3);
  assert.equal(p?.inhalt?.vonNickname, 'marie_x');
});

test('LÖSEN wird als solches erkannt', () => {
  // Ohne das bliebe ein Pin für den Rest des Abends im Overlay stehen.
  const p = lesePin({ action: 2, pinMsgId: 'p1', operator: OPERATOR });
  assert.equal(p?.angepinnt, false);
  assert.equal(p?.pinId, 'p1', 'die ID muss mit, sonst weiß das Overlay nicht, WAS es entfernen soll');
  assert.equal(p?.inhalt, undefined, 'beim Lösen braucht es keinen Inhalt');
});

test('unbekannte Aktion wird NICHT als Anpinnen gewertet', () => {
  // Ein falsch stehengebliebener Pin ist schlimmer als ein verpasster.
  assert.equal(lesePin({ action: 0, pinMsgId: 'x' }), null);
  assert.equal(lesePin({ action: 99, pinMsgId: 'x' }), null);
  assert.equal(lesePin({ pinMsgId: 'x' }), null, 'ohne Aktion gar nichts');
});

test('alle fünf Sorten werden unterschieden', () => {
  const bau = (feld: string) => lesePin({ action: 1, pinMsgId: 'p', [feld]: { user: { nickname: 'X' } } });
  assert.equal(bau('chatMessage')?.inhalt?.art, 'chat');
  assert.equal(bau('giftMessage')?.inhalt?.art, 'geschenk');
  assert.equal(bau('memberMessage')?.inhalt?.art, 'beitritt');
  assert.equal(bau('socialMessage')?.inhalt?.art, 'social');
  assert.equal(bau('likeMessage')?.inhalt?.art, 'like');
});

test('leere und kaputte Nachrichten stürzen nicht ab', () => {
  assert.equal(lesePin(undefined), null);
  assert.equal(lesePin({}), null);
  assert.equal(lesePin('kaputt'), null);
  // Angepinnt, aber ohne erkennbaren Inhalt: Der Rahmen kommt trotzdem, damit
  // die Anzeige wenigstens weiß, dass etwas angepinnt wurde.
  const p = lesePin({ action: 1, pinMsgId: 'p9' });
  assert.equal(p?.angepinnt, true);
  assert.equal(p?.inhalt, undefined);
});

test('Logzeile sagt, WAS angepinnt wurde', () => {
  const chat = lesePin({ action: 1, pinMsgId: 'p', chatMessage: { user: { nickname: 'Noni' }, comment: 'Hi' } });
  assert.equal(pinText(chat!), 'Chat-Nachricht angepinnt von Noni: „Hi"');
  const gift = lesePin({ action: 1, pinMsgId: 'p', giftMessage: { user: { nickname: 'tom_' }, giftDetails: { giftName: 'Rose' }, repeatCount: 2 } });
  assert.equal(pinText(gift!), 'Geschenk angepinnt von tom_: Rose ×2');
  const weg = lesePin({ action: 2, pinMsgId: 'p' });
  assert.match(pinText(weg!), /gelöst/);
});
