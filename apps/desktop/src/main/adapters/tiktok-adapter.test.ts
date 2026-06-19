import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { StudioEvent } from '@botexe/trigger-engine';
import { EventBus } from '../core/event-bus';
import { TikTokAdapter, isOfflineError, isSignServerError, type LiveConnectionLike, type AdapterStatusInfo } from './tiktok-adapter';

test('isSignServerError: eulerstream-/Sign-Fehler erkannt (→ kein Retry, Sign-Key nötig)', () => {
  assert.equal(isSignServerError('[fetchWebcastSignatureFromEulerRoute] Failed to sign a request: This endpoint requires a Business plan.'), true);
  assert.equal(isSignServerError('eulerstream rate limit'), true);
  // Abgrenzung: normale Verbindungs-/Offline-Fehler sind KEINE Sign-Fehler.
  assert.equal(isSignServerError('user isn\'t online'), false);
  assert.equal(isSignServerError('Error while connecting'), false);
});

test('isOfflineError: „nicht live" wird als Offline erkannt (→ auf Live warten)', () => {
  assert.equal(isOfflineError("The requested user isn't online :("), true);
  assert.equal(isOfflineError('user not online'), true);
  assert.equal(isOfflineError('LIVE has ended'), true);
  // mehrdeutige/echte Fehler NICHT als offline werten (→ normaler Reconnect,
  // sonst wartet die App ewig): „room not found" (Tippfehler/Auth), Sign, Netz.
  assert.equal(isOfflineError('room not found'), false);
  assert.equal(isOfflineError('sign server error 500'), false);
  assert.equal(isOfflineError('connection timeout'), false);
});

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

test('auto-connect: nach streamEnd wird gepollt und beim nächsten live automatisch verbunden', async () => {
  const bus = new EventBus();
  let live = false;
  const connections: FakeConnection[] = [];
  const adapter = new TikTokAdapter(bus, {
    factory: () => { const c = new FakeConnection(); connections.push(c); return c; },
    onStatus: () => undefined,
    autoConnect: true,
    livePollMs: 5,
    checkLive: async () => live,
    baseReconnectDelayMs: 1,
    jitterMs: 0,
  });
  await adapter.connect('testuser');
  connections[0]?.emit('streamEnd', { action: 3 });
  connections[0]?.emit('disconnected');
  await wait(25);
  assert.equal(connections.length, 1, 'noch nicht live → keine neue connection');

  live = true;
  await wait(25);
  assert.equal(connections.length, 2, 'live erkannt → automatisch verbunden');
  assert.equal(connections[1]?.connectCalls, 1);
});

test('watchForLive: verbindet automatisch sobald live — OHNE vorher zu connecten', async () => {
  const bus = new EventBus();
  let live = false;
  const connections: FakeConnection[] = [];
  const adapter = new TikTokAdapter(bus, {
    factory: () => { const c = new FakeConnection(); connections.push(c); return c; },
    onStatus: () => undefined,
    livePollMs: 5,
    checkLive: async () => live,
    baseReconnectDelayMs: 1,
    jitterMs: 0,
  });
  adapter.watchForLive('testuser');
  await wait(25);
  assert.equal(connections.length, 0, 'noch nicht live → keine Verbindung');

  live = true;
  await wait(25);
  assert.equal(connections.length, 1, 'live erkannt → automatisch verbunden');
  assert.equal(connections[0]?.connectCalls, 1);

  await adapter.disconnect();
});

test('auto-connect: manuelles disconnect stoppt den live-watch', async () => {
  const bus = new EventBus();
  let live = false;
  const connections: FakeConnection[] = [];
  const adapter = new TikTokAdapter(bus, {
    factory: () => { const c = new FakeConnection(); connections.push(c); return c; },
    onStatus: () => undefined,
    autoConnect: true,
    livePollMs: 5,
    checkLive: async () => live,
  });
  await adapter.connect('testuser');
  connections[0]?.emit('streamEnd', { action: 3 });
  connections[0]?.emit('disconnected');
  await adapter.disconnect();

  live = true;
  await wait(25);
  assert.equal(connections.length, 1, 'nach manuellem disconnect kein Auto-Connect mehr');
});

test('auto-connect aus (default): streamEnd startet keinen live-watch', async () => {
  const bus = new EventBus();
  const connections: FakeConnection[] = [];
  const adapter = new TikTokAdapter(bus, {
    factory: () => { const c = new FakeConnection(); connections.push(c); return c; },
    onStatus: () => undefined,
    livePollMs: 5,
    checkLive: async () => true, // wäre live — darf aber nicht gepollt werden
  });
  await adapter.connect('testuser');
  connections[0]?.emit('streamEnd', { action: 3 });
  connections[0]?.emit('disconnected');
  await wait(25);
  assert.equal(connections.length, 1, 'ohne autoConnect kein erneutes Verbinden');
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

test('sendChat: ohne vollständigen Login Fehler, mit Login sendet mit Auth-Optionen', async () => {
  const bus = new EventBus();
  const sent: Array<{ content: string; options?: Record<string, unknown> }> = [];
  class SendableConn extends FakeConnection {
    async sendMessage(content: string, options?: Record<string, unknown>): Promise<unknown> {
      sent.push({ content, options });
      return { ok: true };
    }
  }
  let auth: { sessionId?: string; ttTargetIdc?: string } = {};
  const adapter = new TikTokAdapter(bus, {
    factory: () => new SendableConn(),
    onStatus: () => undefined,
    getAuth: () => auth,
  });
  await adapter.connect('testuser');

  assert.equal((await adapter.sendChat('hallo')).ok, false, 'ohne Login kein Senden');
  auth = { sessionId: 'sid-123' };
  assert.equal((await adapter.sendChat('hallo')).ok, false, 'nur sessionId reicht nicht (ttTargetIdc fehlt)');
  assert.equal(sent.length, 0);

  auth = { sessionId: 'sid-123', ttTargetIdc: 'eu-ttp2' };
  const ok = await adapter.sendChat('  hallo welt  ');
  assert.equal(ok.ok, true);
  assert.equal(sent[0]?.content, 'hallo welt', 'getrimmt gesendet');
  assert.equal(sent[0]?.options?.sessionId, 'sid-123');
  assert.equal(sent[0]?.options?.ttTargetIdc, 'eu-ttp2', 'Auth explizit übergeben');
});

test('viewer_count wird beim connect aus dem initial-state publiziert', async () => {
  const { adapter, events } = setup();
  await adapter.connect('testuser');

  const vc = events.filter((e) => e.type === 'viewer_count');
  assert.equal(vc.length, 1);
  assert.equal(vc[0]?.viewerCount, 10);
});
