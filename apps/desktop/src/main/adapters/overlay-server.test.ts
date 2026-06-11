import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createDefaultLayout } from '@botexe/overlay-engine';
import { EventBus } from '../core/event-bus';
import { OverlayServer } from './overlay-server';

function makeDirs(): { runtimeDir: string; widgetDir: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'botexe-overlay-test-'));
  const runtimeDir = path.join(base, 'runtime');
  const widgetDir = path.join(base, 'widgets');
  fs.mkdirSync(runtimeDir);
  fs.mkdirSync(widgetDir);
  fs.writeFileSync(path.join(runtimeDir, 'overlay.html'), '<!doctype html><html><head></head><body>RUNTIME</body></html>');
  fs.writeFileSync(path.join(runtimeDir, 'runtime.js'), '// runtime');
  fs.writeFileSync(path.join(widgetDir, 'gift-alert.js'), '// widget');
  return { runtimeDir, widgetDir };
}

async function setup(heartbeatMs = 0) {
  const bus = new EventBus();
  const layout = createDefaultLayout('Test-Layout', 'test-layout');
  const profileB = createDefaultLayout('Profil-B', 'profile-b');
  const server = new OverlayServer(bus, {
    port: 0,
    ...makeDirs(),
    heartbeatMs,
    getLayout: (id) => (id === 'profile-b' ? profileB : id === 'test-layout' || !id ? layout : null),
    getDefaultLayoutId: () => 'test-layout',
  });
  await server.start();
  return { bus, server, layout, profileB };
}

interface WsClient {
  ws: WebSocket;
  next(): Promise<Record<string, unknown>>;
  close(): void;
}

// Message-Listener hängt VOR dem open-await — sonst Race: Handshake + erste
// Server-Nachricht können im selben TCP-Paket ankommen und die Nachricht
// wäre verloren, bevor der Test lauscht.
function wsConnect(url: string): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue: Record<string, unknown>[] = [];
    const waiters: Array<(m: Record<string, unknown>) => void> = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as Record<string, unknown>;
      const waiter = waiters.shift();
      if (waiter) waiter(msg);
      else queue.push(msg);
    });
    ws.on('error', reject);
    ws.on('open', () =>
      resolve({
        ws,
        next: () =>
          new Promise((res) => {
            const queued = queue.shift();
            if (queued) res(queued);
            else waiters.push(res);
          }),
        close: () => ws.close(),
      }),
    );
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('http: /overlay ohne token → 403, mit token → 200 + html', async () => {
  const { server } = await setup();
  try {
    const base = `http://127.0.0.1:${server.getPort()}`;
    const denied = await fetch(`${base}/overlay`);
    assert.equal(denied.status, 403);

    const ok = await fetch(server.getOverlayUrl());
    assert.equal(ok.status, 200);
    const html = await ok.text();
    assert.match(html, /RUNTIME/);
  } finally {
    await server.stop();
  }
});

test('http: /overlay?preview=1 injiziert preview:true, ohne param preview:false', async () => {
  const { server } = await setup();
  try {
    const token = server.getToken();
    const base = `http://127.0.0.1:${server.getPort()}`;

    const normal = await (await fetch(`${base}/overlay?token=${token}`)).text();
    assert.match(normal, /"preview":false/);

    const prev = await (await fetch(`${base}/overlay?token=${token}&preview=1`)).text();
    assert.match(prev, /"preview":true/);
  } finally {
    await server.stop();
  }
});

test('http: widget-files werden ausgeliefert, path-traversal abgewehrt', async () => {
  const { server } = await setup();
  try {
    const base = `http://127.0.0.1:${server.getPort()}`;
    const token = server.getToken();
    const ok = await fetch(`${base}/widgets/gift-alert.js?token=${token}`);
    assert.equal(ok.status, 200);

    const evil = await fetch(`${base}/widgets/..%2F..%2Fetc%2Fpasswd?token=${token}`);
    assert.notEqual(evil.status, 200);
  } finally {
    await server.stop();
  }
});

test('ws: ohne gültigen token wird die verbindung geschlossen', async () => {
  const { server } = await setup();
  try {
    const closed = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.getPort()}/ws?token=falsch`);
      ws.on('close', () => resolve(true));
      ws.on('error', () => undefined);
      setTimeout(() => resolve(false), 500);
    });
    assert.equal(closed, true);
  } finally {
    await server.stop();
  }
});

test('ws: client bekommt beim connect das aktive layout als erste nachricht', async () => {
  const { server, layout } = await setup();
  try {
    const client = await wsConnect(server.getWsUrl());
    const msg = await client.next();
    assert.equal(msg.kind, 'layout');
    assert.deepEqual((msg.layout as { id: string }).id, layout.id);
    client.close();
  } finally {
    await server.stop();
  }
});

test('bus-events erreichen verbundene clients', async () => {
  const { bus, server } = await setup();
  try {
    const client = await wsConnect(server.getWsUrl());
    await client.next(); // layout
    bus.publish({ type: 'follow', ts: 1, user: { id: 'anna', nickname: 'Anna' } });
    const msg = await client.next();
    assert.equal(msg.kind, 'event');
    assert.equal((msg.event as { type: string }).type, 'follow');
    client.close();
  } finally {
    await server.stop();
  }
});

test('genau EIN bus-listener, egal wie viele clients (H8-leak-fix)', async () => {
  const { bus, server } = await setup();
  try {
    const before = bus.listenerCount();
    const clients = await Promise.all([
      wsConnect(server.getWsUrl()),
      wsConnect(server.getWsUrl()),
      wsConnect(server.getWsUrl()),
    ]);
    assert.equal(bus.listenerCount(), before, 'kein listener pro client');
    for (const c of clients) c.close();
    await wait(50);
    assert.equal(bus.listenerCount(), before);
  } finally {
    await server.stop();
  }
});

test('H8: toter client (kein pong) wird per heartbeat terminiert und aufgeräumt', async () => {
  const { server } = await setup(40); // heartbeat alle 40ms
  try {
    const client = await wsConnect(server.getWsUrl());
    // pong-handling kappen: lib antwortet sonst automatisch auf pings
    (client.ws as unknown as { _socket: { pause(): void } })._socket.pause();
    await wait(150); // > 2 heartbeat-zyklen
    assert.equal(server.getClientCount(), 0, 'toter client wurde entfernt');
  } finally {
    await server.stop();
  }
});

test('broadcast: action-nachrichten erreichen clients', async () => {
  const { server } = await setup();
  try {
    const client = await wsConnect(server.getWsUrl());
    await client.next(); // layout
    server.broadcast({ kind: 'action', ruleId: 'r1', action: { kind: 'fire_alert', targetId: 'l1' } });
    const msg = await client.next();
    assert.equal(msg.kind, 'action');
    client.close();
  } finally {
    await server.stop();
  }
});

test('profile: WS-client mit ?profile=… bekommt genau dieses layout', async () => {
  const { server } = await setup();
  try {
    const client = await wsConnect(`${server.getWsUrl()}&profile=profile-b`);
    const msg = await client.next();
    assert.equal(msg.kind, 'layout');
    assert.equal((msg.layout as { id: string }).id, 'profile-b');
    client.close();
  } finally {
    await server.stop();
  }
});

test('profile: layout-broadcast erreicht nur clients desselben profils', async () => {
  const { bus, server } = await setup();
  try {
    const a = await wsConnect(`${server.getWsUrl()}&profile=test-layout`);
    const b = await wsConnect(`${server.getWsUrl()}&profile=profile-b`);
    await a.next(); // initial layout
    await b.next();

    // Layout für profile-b neu broadcasten — nur b darf es kriegen.
    server.broadcastLayout('profile-b');
    const bMsg = await b.next();
    assert.equal((bMsg.layout as { id: string }).id, 'profile-b');

    // a bekam KEIN layout: als nächstes erreicht a ein event (Kanal offen),
    // wäre fälschlich ein layout an a gegangen, käme das hier statt 'event'.
    bus.publish({ type: 'follow', ts: 1 });
    const aMsg = await a.next();
    assert.equal(aMsg.kind, 'event', 'a bekam event, kein b-layout');
    a.close();
    b.close();
  } finally {
    await server.stop();
  }
});

test('profile: getOverlayUrl(id) hängt profile-param an', async () => {
  const { server } = await setup();
  try {
    assert.match(server.getOverlayUrl('profile-b'), /profile=profile-b/);
    assert.match(server.getOverlayUrl('profile-b'), /token=/);
  } finally {
    await server.stop();
  }
});
