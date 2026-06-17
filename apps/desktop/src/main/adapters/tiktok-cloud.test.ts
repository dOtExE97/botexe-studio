import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { buildCloudUrl, mapCloudMessage, EulerCloudConnection, type CloudWsLike } from './tiktok-cloud';
import { isOfflineError, isSignServerError } from './tiktok-adapter';

// --- buildCloudUrl ---------------------------------------------------------
test('buildCloudUrl: enthält uniqueId, apiKey und gebündelte Events; @ wird gestrippt', () => {
  const url = buildCloudUrl({ uniqueId: '@ExE', apiKey: 'euler_abc' });
  assert.match(url, /^wss:\/\/ws\.eulerstream\.com\?/);
  assert.match(url, /uniqueId=ExE/);
  assert.match(url, /apiKey=euler_abc/);
  assert.match(url, /bundleEvents=true/);
});

// --- mapCloudMessage (reiner Router) --------------------------------------
test('mapCloudMessage: Webcast-Nachrichten → High-Level-Events mit Roh-Data', () => {
  const chat = { user: { uniqueId: 'a' }, comment: 'hi' };
  assert.deepEqual(mapCloudMessage('WebcastChatMessage', chat), { kind: 'event', event: 'chat', data: chat });
  const gift = { user: { uniqueId: 'a' }, giftId: 1, repeatEnd: 1 };
  assert.deepEqual(mapCloudMessage('WebcastGiftMessage', gift), { kind: 'event', event: 'gift', data: gift });
  const like = { user: { uniqueId: 'a' }, likeCount: 3 };
  assert.deepEqual(mapCloudMessage('WebcastLikeMessage', like), { kind: 'event', event: 'like', data: like });
  const member = { user: { uniqueId: 'a' } };
  assert.deepEqual(mapCloudMessage('WebcastMemberMessage', member), { kind: 'event', event: 'member', data: member });
  const seq = { viewerCount: 42 };
  assert.deepEqual(mapCloudMessage('WebcastRoomUserSeqMessage', seq), { kind: 'event', event: 'roomUser', data: seq });
});

test('mapCloudMessage: WebcastSocialMessage wird per displayType in follow/share gespalten', () => {
  const follow = { common: { displayText: { displayType: 'pm_main_follow_message_viewer_2' } } };
  assert.deepEqual(mapCloudMessage('WebcastSocialMessage', follow), { kind: 'event', event: 'follow', data: follow });
  const share = { common: { displayText: { displayType: 'pm_mt_guidance_share' } } };
  assert.deepEqual(mapCloudMessage('WebcastSocialMessage', share), { kind: 'event', event: 'share', data: share });
  // sonstige Social-Typen (z.B. „join via share panel") interessieren uns nicht.
  const other = { common: { displayText: { displayType: 'pm_mt_join_message' } } };
  assert.equal(mapCloudMessage('WebcastSocialMessage', other), null);
});

test('mapCloudMessage: Control-Stream-Ende → streamEnd, Pause → ignoriert', () => {
  assert.deepEqual(mapCloudMessage('WebcastControlMessage', { action: 3 }), { kind: 'streamEnd' });
  assert.deepEqual(mapCloudMessage('WebcastControlMessage', { action: 4 }), { kind: 'streamEnd' });
  assert.equal(mapCloudMessage('WebcastControlMessage', { action: 1 }), null);
});

test('mapCloudMessage: Euler-Custom-Frames steuern den Verbindungsstatus', () => {
  assert.deepEqual(mapCloudMessage('tiktok.connect', { agentId: 'x' }), { kind: 'connected' });
  assert.deepEqual(mapCloudMessage('roomInfo', {}), { kind: 'connected' });
  assert.deepEqual(mapCloudMessage('tiktok.disconnect', { reason: 4005 }), { kind: 'disconnected' });
  // workerInfo ist nur eine Begrüßung des Cloud-Workers — kein Live-Signal.
  assert.equal(mapCloudMessage('workerInfo', { isLoggedIn: false }), null);
});

// --- EulerCloudConnection --------------------------------------------------
class FakeWs extends EventEmitter implements CloudWsLike {
  closed = false;
  url: string;
  constructor(url: string) { super(); this.url = url; }
  close(): void { this.closed = true; }
  // Helfer für Tests: einen gebündelten Frame zustellen.
  deliver(messages: Array<{ type: string; data: unknown }>): void {
    this.emit('message', Buffer.from(JSON.stringify({ messages })));
  }
}

function makeConn(opts: { onWs?: (ws: FakeWs) => void } = {}) {
  let ws!: FakeWs;
  const conn = new EulerCloudConnection('@ExE', {
    apiKey: 'euler_abc',
    connectTimeoutMs: 1000,
    wsFactory: (url) => { ws = new FakeWs(url); opts.onWs?.(ws); return ws; },
  });
  return { conn, getWs: () => ws };
}

test('connect: löst auf, sobald die Cloud „connected" meldet', async () => {
  const { conn, getWs } = makeConn();
  const p = conn.connect();
  getWs().emit('open');
  getWs().deliver([{ type: 'workerInfo', data: { isLoggedIn: false } }]); // noch kein Live
  getWs().deliver([{ type: 'tiktok.connect', data: { agentId: 'a' } }]);  // jetzt live verbunden
  await p; // darf nicht hängen / nicht werfen
});

test('connect: Chat-Frame der Cloud landet als chat-Event (gleiche Schnittstelle wie die Lib)', async () => {
  const { conn, getWs } = makeConn();
  const chats: unknown[] = [];
  conn.on('chat', (d) => chats.push(d));
  const p = conn.connect();
  getWs().deliver([{ type: 'tiktok.connect', data: {} }]);
  await p;
  getWs().deliver([{ type: 'WebcastChatMessage', data: { user: { uniqueId: 'anna' }, comment: 'hi' } }]);
  assert.equal(chats.length, 1);
  assert.deepEqual(chats[0], { user: { uniqueId: 'anna' }, comment: 'hi' });
});

test('connect: Streamer offline (Close 4404) → reject mit Offline-Fehler (kein Sign-Fehler)', async () => {
  const { conn, getWs } = makeConn();
  const p = conn.connect();
  getWs().emit('close', 4404, Buffer.from("The TikTok User '@ExE' is not currently live."));
  await assert.rejects(p, (e: Error) => {
    assert.equal(isOfflineError(e.message), true, 'als offline erkannt → App wartet auf Live');
    assert.equal(isSignServerError(e.message), false, 'NICHT als Sign-Fehler');
    return true;
  });
});

test('connect: Key/Plan abgelehnt (Close 4401) → reject als Sign-Fehler (kein Retry-Spam)', async () => {
  const { conn, getWs } = makeConn();
  const p = conn.connect();
  getWs().emit('close', 4401, Buffer.from('invalid auth'));
  await assert.rejects(p, (e: Error) => {
    assert.equal(isSignServerError(e.message), true);
    return true;
  });
});

test('nach erfolgreichem connect: Close → disconnected-Event, Stream-Ende-Code → vorher streamEnd', async () => {
  const { conn, getWs } = makeConn();
  const events: string[] = [];
  conn.on('streamEnd', () => events.push('streamEnd'));
  conn.on('disconnected', () => events.push('disconnected'));
  const p = conn.connect();
  getWs().deliver([{ type: 'tiktok.connect', data: {} }]);
  await p;
  getWs().emit('close', 4005, Buffer.from('stream ended'));
  assert.deepEqual(events, ['streamEnd', 'disconnected']);
});

test('disconnect: selbst ausgelöster Close erzeugt KEIN Geister-disconnected/streamEnd', async () => {
  const { conn, getWs } = makeConn();
  const events: string[] = [];
  conn.on('disconnected', () => events.push('disconnected'));
  conn.on('streamEnd', () => events.push('streamEnd'));
  const p = conn.connect();
  getWs().deliver([{ type: 'tiktok.connect', data: {} }]);
  await p;
  const ws = getWs();
  conn.disconnect();
  ws.emit('close', 4005, Buffer.from('stream ended')); // alter Handler darf nicht mehr feuern
  assert.deepEqual(events, [], 'nach disconnect() keine Events mehr');
});

test('connect: Timeout ohne jede Antwort → reject', async () => {
  const { conn } = makeConn();
  await assert.rejects(conn.connect(), /Timeout|antwortet nicht/i);
});

test('fetchIsLive: Cloud meldet connected → true (für Auto-Connect-Live-Watch)', async () => {
  const { conn, getWs } = makeConn();
  const p = conn.fetchIsLive();
  getWs().deliver([{ type: 'tiktok.connect', data: {} }]);
  assert.equal(await p, true);
});

test('fetchIsLive: Streamer offline (Close 4404) → false', async () => {
  const { conn, getWs } = makeConn();
  const p = conn.fetchIsLive();
  getWs().emit('close', 4404, Buffer.from('not live'));
  assert.equal(await p, false);
});
