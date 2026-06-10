import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { StudioEvent } from '@botexe/trigger-engine';
import { EventBus } from '../core/event-bus';
import { TikTokAdapter, type LiveConnectionLike, type AdapterStatusInfo } from './tiktok-adapter';

class FakeConnection extends EventEmitter implements LiveConnectionLike {
  connectCalls = 0;
  disconnectCalls = 0;
  removeAllCalls = 0;
  failConnect = false;

  async connect(): Promise<Record<string, unknown>> {
    this.connectCalls++;
    if (this.failConnect) throw new Error('verbindung fehlgeschlagen');
    return { roomId: '123', viewerCount: 10 };
  }

  disconnect(): void {
    this.disconnectCalls++;
  }

  override removeAllListeners(): this {
    this.removeAllCalls++;
    return super.removeAllListeners();
  }
}

function setup(opts: { failFirst?: boolean } = {}) {
  const bus = new EventBus();
  const events: StudioEvent[] = [];
  bus.subscribeAll((e) => events.push(e));

  const connections: FakeConnection[] = [];
  const statuses: AdapterStatusInfo[] = [];
  const adapter = new TikTokAdapter(bus, {
    factory: () => {
      const c = new FakeConnection();
      if (opts.failFirst && connections.length === 0) c.failConnect = true;
      connections.push(c);
      return c;
    },
    onStatus: (s) => statuses.push(s),
    baseReconnectDelayMs: 1,
    jitterMs: 0,
    maxReconnect: 3,
  });
  return { bus, adapter, connections, events, statuses };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('connect: verbindet und meldet status connected (kein reconnect-flag)', async () => {
  const { adapter, connections, statuses } = setup();
  await adapter.connect('@testuser');

  assert.equal(connections.length, 1);
  assert.equal(connections[0]?.connectCalls, 1);
  const connected = statuses.find((s) => s.status === 'connected');
  assert.ok(connected);
  assert.equal(connected?.isReconnect, false);
});

test('chat-event der connection landet normalisiert auf dem bus', async () => {
  const { adapter, connections, events } = setup();
  await adapter.connect('testuser');

  connections[0]?.emit('chat', { user: { uniqueId: 'anna' }, comment: 'hi' });

  assert.equal(events.filter((e) => e.type === 'chat').length, 1);
  assert.equal(events.find((e) => e.type === 'chat')?.text, 'hi');
});

test('K2: auto-reconnect räumt alte connection ab (removeAllListeners + disconnect)', async () => {
  const { adapter, connections, statuses } = setup();
  await adapter.connect('testuser');

  connections[0]?.emit('disconnected');
  await wait(15);

  assert.equal(connections.length, 2, 'neue connection wurde erstellt');
  assert.ok((connections[0]?.removeAllCalls ?? 0) >= 1, 'alte: removeAllListeners');
  assert.ok((connections[0]?.disconnectCalls ?? 0) >= 1, 'alte: disconnect');
  const reconnected = statuses.filter((s) => s.status === 'connected');
  assert.equal(reconnected.length, 2);
  assert.equal(reconnected[1]?.isReconnect, true, 'K1: zweiter connect als reconnect markiert');
});

test('K2: events der alten connection nach reconnect erzeugen KEINE doppel-events', async () => {
  const { adapter, connections, events } = setup();
  await adapter.connect('testuser');

  const old = connections[0];
  assert.ok(old);
  old.emit('disconnected');
  await wait(15);

  // Alte (eigentlich tote) Connection feuert noch — darf nirgends ankommen.
  old.emit('chat', { user: { uniqueId: 'geist' }, comment: 'zombie' });
  connections[1]?.emit('chat', { user: { uniqueId: 'anna' }, comment: 'echt' });

  const chats = events.filter((e) => e.type === 'chat');
  assert.equal(chats.length, 1);
  assert.equal(chats[0]?.text, 'echt');
});

test('K2: manueller connect während pending auto-reconnect → genau EINE aktive connection', async () => {
  const { adapter, connections, events } = setup();
  await adapter.connect('testuser');

  connections[0]?.emit('disconnected'); // auto-reconnect geplant (timer läuft)
  await adapter.connect('testuser'); // user klickt sofort selbst auf verbinden
  await wait(20); // pending timer wäre jetzt gefeuert

  const total = connections.length;
  // egal wieviele erstellt wurden: nur die letzte darf events liefern
  for (let i = 0; i < total - 1; i++) connections[i]?.emit('chat', { comment: `alt-${i}` });
  connections[total - 1]?.emit('chat', { comment: 'aktiv' });

  const chats = events.filter((e) => e.type === 'chat');
  assert.equal(chats.length, 1, 'nur die aktive connection liefert');
  assert.equal(chats[0]?.text, 'aktiv');
});

test('fehlgeschlagener connect wird mit backoff erneut versucht', async () => {
  const { adapter, connections } = setup({ failFirst: true });
  await adapter.connect('testuser');
  await wait(25);

  assert.equal(connections.length, 2, 'retry hat zweite connection erstellt');
  assert.equal(connections[1]?.connectCalls, 1);
});

test('disconnect: räumt connection auf und stoppt auto-reconnect', async () => {
  const { adapter, connections } = setup();
  await adapter.connect('testuser');

  connections[0]?.emit('disconnected'); // reconnect geplant
  await adapter.disconnect();
  await wait(20);

  assert.equal(connections.length, 1, 'kein reconnect nach manuellem disconnect');
  assert.ok((connections[0]?.disconnectCalls ?? 0) >= 1);
});

test('streamEnd: kein auto-reconnect (stream ist vorbei)', async () => {
  const { adapter, connections, statuses } = setup();
  await adapter.connect('testuser');

  connections[0]?.emit('streamEnd', { action: 3 });
  connections[0]?.emit('disconnected'); // v2 disconnected nach streamEnd
  await wait(20);

  assert.equal(connections.length, 1);
  assert.equal(statuses.at(-1)?.status, 'disconnected');
});

test('gift-events: laufender streak unterdrückt, finale combo landet auf dem bus', async () => {
  const { adapter, connections, events } = setup();
  await adapter.connect('testuser');

  const giftData = (repeatEnd: number, repeatCount: number) => ({
    user: { uniqueId: 'gifter' },
    giftId: 1,
    repeatCount,
    repeatEnd,
    giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 },
  });
  connections[0]?.emit('gift', giftData(0, 1));
  connections[0]?.emit('gift', giftData(0, 2));
  connections[0]?.emit('gift', giftData(1, 3));

  const gifts = events.filter((e) => e.type === 'gift');
  assert.equal(gifts.length, 1);
  assert.equal(gifts[0]?.gift?.count, 3);
});

test('viewer_count wird beim connect aus dem initial-state publiziert', async () => {
  const { adapter, events } = setup();
  await adapter.connect('testuser');

  const vc = events.filter((e) => e.type === 'viewer_count');
  assert.equal(vc.length, 1);
  assert.equal(vc[0]?.viewerCount, 10);
});
