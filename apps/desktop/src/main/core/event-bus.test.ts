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
