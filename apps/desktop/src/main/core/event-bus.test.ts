import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioEvent } from '@botexe/trigger-engine';
import { EventBus } from './event-bus';

const chat = (text: string, ts = 1): StudioEvent => ({ type: 'chat', ts, text });

test('subscribe empfängt nur events des eigenen typs', () => {
  const bus = new EventBus();
  const got: StudioEvent[] = [];
  bus.subscribe('chat', (e) => got.push(e));

  bus.publish(chat('hi'));
  bus.publish({ type: 'follow', ts: 2 });

  assert.equal(got.length, 1);
  assert.equal(got[0]?.text, 'hi');
});

test('subscribeAll empfängt alle events', () => {
  const bus = new EventBus();
  const got: StudioEvent[] = [];
  bus.subscribeAll((e) => got.push(e));

  bus.publish(chat('hi'));
  bus.publish({ type: 'follow', ts: 2 });

  assert.deepEqual(got.map((e) => e.type), ['chat', 'follow']);
});

test('unsubscribe-funktion beendet den empfang', () => {
  const bus = new EventBus();
  const got: StudioEvent[] = [];
  const unsub = bus.subscribe('chat', (e) => got.push(e));

  bus.publish(chat('eins'));
  unsub();
  bus.publish(chat('zwei'));

  assert.equal(got.length, 1);
});

test('getLastValue liefert letztes event pro typ (sticky für late-joiner)', () => {
  const bus = new EventBus();
  bus.publish(chat('eins', 1));
  bus.publish(chat('zwei', 2));

  assert.equal(bus.getLastValue('chat')?.text, 'zwei');
  assert.equal(bus.getLastValue('gift'), undefined);
});

test('werfender subscriber bringt publish nicht um und andere subscriber laufen weiter', () => {
  const bus = new EventBus();
  const got: StudioEvent[] = [];
  bus.subscribe('chat', () => {
    throw new Error('kaputter subscriber');
  });
  bus.subscribe('chat', (e) => got.push(e));

  assert.doesNotThrow(() => bus.publish(chat('hi')));
  assert.equal(got.length, 1);
});

test('Vorfilter verwirft ein Ereignis für ALLE Abonnenten und merkt es nicht als Sticky', () => {
  const bus = new EventBus();
  const got: StudioEvent[] = [];
  bus.subscribeAll((e) => got.push(e));
  bus.setVorfilter((e) => e.text !== 'weg');

  bus.publish(chat('weg'));
  bus.publish(chat('bleibt'));

  assert.deepEqual(got.map((e) => e.text), ['bleibt']);
  assert.equal(bus.getLastValue('chat')?.text, 'bleibt');
});

// ── Sticky-Werte je Art UND Plattform (Twitch-Anbindung) ─────────────────────

test('Sticky: chat von TikTok und chat von Twitch überschreiben sich nicht', () => {
  const bus = new EventBus();
  bus.publish({ type: 'chat', ts: 1, text: 'tt', plattform: 'tiktok' });
  bus.publish({ type: 'chat', ts: 2, text: 'tw', plattform: 'twitch' });
  const chats = bus.getAllLastValues().filter((e) => e.type === 'chat');
  assert.deepEqual(chats.map((e) => e.text), ['tt', 'tw']);
  // Neuer TikTok-Chat ersetzt nur den TikTok-Wert und rückt ans Ende (jüngster zuletzt).
  bus.publish({ type: 'chat', ts: 3, text: 'tt2', plattform: 'tiktok' });
  assert.deepEqual(bus.getAllLastValues().filter((e) => e.type === 'chat').map((e) => e.text), ['tw', 'tt2']);
  assert.equal(bus.getLastValue('chat')?.text, 'tt2', 'getLastValue = jüngster über alle Plattformen');
});

test('Sticky: Ereignis ohne Plattform verhält sich wie bisher (ein Wert je Art, Reihenfolge der Arten bleibt)', () => {
  const bus = new EventBus();
  bus.publish(chat('eins', 1));
  bus.publish({ type: 'follow', ts: 2 });
  bus.publish(chat('zwei', 3));
  const alle = bus.getAllLastValues();
  assert.deepEqual(alle.map((e) => `${e.type}:${e.text ?? ''}`), ['chat:zwei', 'follow:']);
});

test('Sticky: Ereignis ohne Plattform gilt für alle und ersetzt die Plattform-Werte seiner Art', () => {
  const bus = new EventBus();
  bus.publish({ type: 'chat', ts: 1, text: 'tt', plattform: 'tiktok' });
  bus.publish({ type: 'chat', ts: 2, text: 'tw', plattform: 'twitch' });
  bus.publish(chat('test', 3));
  assert.deepEqual(bus.getAllLastValues().map((e) => e.text), ['test']);
});

test('Sticky: clearLastValues leert auch die Plattform-Werte', () => {
  const bus = new EventBus();
  bus.publish({ type: 'chat', ts: 1, text: 'tt', plattform: 'tiktok' });
  bus.publish({ type: 'chat', ts: 2, text: 'tw', plattform: 'twitch' });
  bus.clearLastValues();
  assert.deepEqual(bus.getAllLastValues(), []);
  assert.equal(bus.getLastValue('chat'), undefined);
});


test('follower_stand ist sticky: nur der jüngste Twitch-Stand wird nachgeliefert', () => {
  const bus = new EventBus();
  bus.publish({ type: 'follower_stand', ts: 1, plattform: 'twitch', followerStand: { anzahl: 10 } });
  bus.publish({ type: 'follower_stand', ts: 2, plattform: 'twitch', followerStand: { anzahl: 11 } });
  const nach = bus.getAllLastValues().filter((e) => e.type === 'follower_stand');
  assert.equal(nach.length, 1);
  assert.equal(nach[0]?.followerStand?.anzahl, 11);
});
