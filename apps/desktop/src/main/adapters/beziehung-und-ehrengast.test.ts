// beziehung-und-ehrengast.test.ts — drei Angaben, die TikTok immer mitschickt
// und die die App bis v0.49.0 weggeworfen hat.
//
// Gefunden im Diagnose-Log eines echten Streams:
//   WebcastChatMessage   → userIdentity{isGiftGiverOfAnchor, isSubscriberOfAnchor,
//                          isMutualFollowingWithAnchor, isFollowerOfAnchor}
//   WebcastMemberMessage → …, isTopUser, rankScore, topUserNo, …
//   WebcastRoomUserSeqMessage → …, popStr, popularity, …
//
// Warum das zählt: Für einen kleinen Kanal ist „folgt euch gegenseitig" eine
// andere Information als „folgt dir", und „Platz 2 betritt den Raum" ist die
// wertvollste Sekunde des Abends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChat, normalizeSocial, normalizeViewerCount } from './tiktok-normalize';
import { TriggerEngine, type TriggerRule, type StudioEvent } from '@botexe/trigger-engine';

const anna = { userId: '123', uniqueId: 'anna_99', nickname: 'Anna' };

test('Chat: gegenseitiges Folgen und Schon-Schenker landen am Nutzer', () => {
  const e = normalizeChat({
    user: anna,
    comment: 'hi',
    userIdentity: { isMutualFollowingWithAnchor: true, isGiftGiverOfAnchor: true },
  }, 1);
  assert.equal(e.user?.isMutual, true);
  assert.equal(e.user?.hatGeschenkt, true);
});

test('Chat: fehlende Angaben überschreiben NICHTS', () => {
  // Nicht jede Nachricht trägt alle Angaben mit. Ein `false` würde sonst
  // löschen, was das Rollen-Gedächtnis aus einem früheren Ereignis schon weiß.
  const e = normalizeChat({ user: anna, comment: 'hi', userIdentity: {} }, 1);
  assert.equal(e.user?.isMutual, undefined, 'kein false setzen, sondern gar nichts');
  assert.equal(e.user?.hatGeschenkt, undefined);
});

test('Betreten: Ehrengast mit Platz und Punktzahl', () => {
  const e = normalizeSocial({ user: anna, isTopUser: true, topUserNo: 2, rankScore: 4711 }, 'join', 1);
  assert.deepEqual(e.ehrengast, { platz: 2, punkte: 4711 });
});

test('Betreten: TikToks Markierung allein reicht auch ohne Platz', () => {
  const e = normalizeSocial({ user: anna, isTopUser: true }, 'join', 1);
  assert.deepEqual(e.ehrengast, {}, 'markiert, aber ohne Zahlen — trotzdem ein Ehrengast');
});

test('Betreten: ein normaler Zuschauer ist KEIN Ehrengast', () => {
  // Eine Punktzahl allein genügt nicht: Die hat fast jeder, der schon mal da war.
  const e = normalizeSocial({ user: anna, rankScore: 12 }, 'join', 1);
  assert.equal(e.ehrengast, undefined);
});

test('Ehrengast gibt es nur beim Betreten, nicht bei Follow/Share', () => {
  const f = normalizeSocial({ user: anna, isTopUser: true, topUserNo: 1 }, 'follow', 1);
  assert.equal(f.ehrengast, undefined, 'ein Follow ist kein Betreten');
});

test('Betreten: auch hier zählen die Beziehungs-Angaben', () => {
  const e = normalizeSocial({
    user: anna, userIdentity: { isMutualFollowingWithAnchor: true },
  }, 'join', 1);
  assert.equal(e.user?.isMutual, true);
});

test('Zuschauer-Tick: TikToks Beliebtheitswert wird gelesen', () => {
  // Laut Schema ein String (v3: `popularity: string`).
  assert.equal(normalizeViewerCount({ viewerCount: 9, popularity: '1234' }, 1).beliebtheit, 1234);
  assert.equal(normalizeViewerCount({ viewerCount: 9, popularity: 1234 }, 1).beliebtheit, 1234);
  // Fehlt er, bleibt das Feld weg — eine 0 sähe aus wie „Beliebtheit null"
  // statt „nicht geliefert".
  assert.equal(normalizeViewerCount({ viewerCount: 9 }, 1).beliebtheit, undefined);
  assert.equal(normalizeViewerCount({ viewerCount: 9, popularity: '0' }, 1).beliebtheit, undefined);
});

test('Die drei neuen Trigger-Bedingungen greifen', () => {
  // Über die echte Engine statt über Interna — so, wie die Regeln später auch
  // wirklich ausgewertet werden (Muster aus engine.test.ts).
  const e = new TriggerEngine();
  e.setRules([
    { id: 'geg', name: 'Gegenseitig', event: 'chat', enabled: true,
      conditions: [{ kind: 'user_gegenseitig' }], actions: [{ kind: 'speak', template: 'x' }] },
    { id: 'sch', name: 'Hat geschenkt', event: 'chat', enabled: true,
      conditions: [{ kind: 'user_hat_geschenkt' }], actions: [{ kind: 'speak', template: 'y' }] },
  ] as TriggerRule[]);

  const treffer = e.evaluate(normalizeChat({
    user: anna, comment: 'hi',
    userIdentity: { isMutualFollowingWithAnchor: true, isGiftGiverOfAnchor: true },
  }, 1) as StudioEvent);
  assert.deepEqual(treffer.map((t) => t.ruleId).sort(), ['geg', 'sch']);

  const fremder = e.evaluate(normalizeChat({ user: anna, comment: 'hi' }, 2) as StudioEvent);
  assert.equal(fremder.length, 0, 'ein x-beliebiger Zuschauer löst keine der beiden aus');
});

test('Ehrengast-Bedingung: mit und ohne Platz-Grenze', () => {
  const e = new TriggerEngine();
  e.setRules([
    { id: 'alle', name: 'Jeder Ehrengast', event: 'join', enabled: true,
      conditions: [{ kind: 'ehrengast_betritt' }], actions: [{ kind: 'speak', template: 'x' }] },
    { id: 'top3', name: 'Nur Top 3', event: 'join', enabled: true,
      conditions: [{ kind: 'ehrengast_betritt', value: 3 }], actions: [{ kind: 'speak', template: 'y' }] },
  ] as TriggerRule[]);

  const platz2 = e.evaluate(normalizeSocial({ user: anna, isTopUser: true, topUserNo: 2 }, 'join', 1) as StudioEvent);
  assert.deepEqual(platz2.map((t) => t.ruleId).sort(), ['alle', 'top3']);

  const platz9 = e.evaluate(normalizeSocial({ user: anna, isTopUser: true, topUserNo: 9 }, 'join', 2) as StudioEvent);
  assert.deepEqual(platz9.map((t) => t.ruleId), ['alle'], 'Platz 9 ist nicht in den Top 3');

  const normal = e.evaluate(normalizeSocial({ user: anna }, 'join', 3) as StudioEvent);
  assert.equal(normal.length, 0, 'ein normaler Zuschauer löst nichts aus');

  // Ohne Platzangabe darf eine Platz-Grenze NICHT durchlassen — sonst würde
  // „nur die ersten drei" jeden Ehrengast durchwinken, sobald TikTok die
  // Nummer einmal nicht mitschickt.
  const ohneNr = e.evaluate(normalizeSocial({ user: anna, isTopUser: true }, 'join', 4) as StudioEvent);
  assert.deepEqual(ohneNr.map((t) => t.ruleId), ['alle']);
});
