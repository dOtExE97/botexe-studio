import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createDefaultLayout } from '@botexe/overlay-engine';
import { EventBus } from '../core/event-bus';
import { OverlayServer } from './overlay-server';

function makeDirs(): { runtimeDir: string; widgetDir: string; mediaDir: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'botexe-overlay-test-'));
  const runtimeDir = path.join(base, 'runtime');
  const widgetDir = path.join(base, 'widgets');
  const mediaDir = path.join(base, 'media');
  fs.mkdirSync(runtimeDir);
  fs.mkdirSync(widgetDir);
  fs.mkdirSync(mediaDir);
  fs.writeFileSync(path.join(runtimeDir, 'overlay.html'), '<!doctype html><html><head></head><body>RUNTIME</body></html>');
  fs.writeFileSync(path.join(runtimeDir, 'runtime.js'), '// runtime');
  fs.writeFileSync(path.join(widgetDir, 'gift-alert.js'), '// widget');
  fs.writeFileSync(path.join(widgetDir, 'combo.js'), 'export const x = 1;');
  fs.writeFileSync(path.join(widgetDir, 'with-import.js'), "import { x } from './combo.js';\n");
  fs.writeFileSync(path.join(mediaDir, 'logo.png'), Buffer.from('PNGDATA-0123456789'));
  return { runtimeDir, widgetDir, mediaDir };
}

async function setup(heartbeatMs = 0, extra: Record<string, unknown> = {}) {
  const bus = new EventBus();
  const layout = createDefaultLayout('Test-Layout', 'test-layout');
  const profileB = createDefaultLayout('Profil-B', 'profile-b');
  const server = new OverlayServer(bus, {
    port: 0,
    ...makeDirs(),
    heartbeatMs,
    getLayout: (id) => (id === 'profile-b' ? profileB : id === 'test-layout' || !id ? layout : null),
    getDefaultLayoutId: () => 'test-layout',
    ...extra,
  });
  await server.start();
  return { bus, server, layout, profileB };
}

interface WsClient {
  ws: WebSocket;
  next(): Promise<Record<string, unknown>>;
  /** Die hello-Begrüßung (App-Version), die der Server als ALLERERSTES schickt. */
  whenHello(): Promise<Record<string, unknown>>;
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
    // hello (App-Version) kommt immer zuerst — separat halten, damit die übrigen
    // Tests ihre erste Inhalts-Nachricht (layout/event) unverändert sehen.
    let hello: Record<string, unknown> | null = null;
    let helloWaiter: ((m: Record<string, unknown>) => void) | null = null;
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as Record<string, unknown>;
      if (msg.kind === 'hello') {
        hello = msg;
        helloWaiter?.(msg);
        return;
      }
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
        whenHello: () =>
          new Promise((res) => {
            if (hello) res(hello);
            else helloWaiter = res;
          }),
        close: () => ws.close(),
      }),
    );
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('http: /api/panel listet Knöpfe + /api/panel/fire löst per ID aus (token-geschützt)', async () => {
  const fired: string[] = [];
  const { server } = await setup(0, {
    listPanelButtons: () => [{ id: 'b1', label: 'Airhorn' }],
    firePanelButton: (id: string) => { fired.push(id); return id === 'b1'; },
  });
  try {
    const base = `http://127.0.0.1:${server.getPort()}`;
    const token = server.getToken();

    const denied = await fetch(`${base}/api/panel`);
    assert.equal(denied.status, 403);

    const list = await (await fetch(`${base}/api/panel?token=${token}`)).json();
    assert.equal(list.buttons[0]?.label, 'Airhorn');

    const ok = await fetch(`${base}/api/panel/fire?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'b1' }),
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(fired, ['b1']);

    const miss = await fetch(`${base}/api/panel/fire?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'nope' }),
    });
    assert.equal(miss.status, 404);
  } finally {
    await server.stop();
  }
});

test('ws: gamewin wird pro winId genau EINMAL gezählt (Dedup über mehrere Clients)', async () => {
  const wins: Array<{ winId: string; user: { id: string } }> = [];
  const { server } = await setup(0, { onGameWin: (winId: string, user: { id: string }) => wins.push({ winId, user }) });
  try {
    const url = `ws://127.0.0.1:${server.getPort()}/ws?token=${server.getToken()}`;
    const a = await wsConnect(url);
    const b = await wsConnect(url);
    const msg = JSON.stringify({ kind: 'gamewin', winId: 'layer1-3', user: { id: 'mia', nickname: 'Mia' } });
    a.ws.send(msg); // Client A (z.B. OBS)
    b.ws.send(msg); // Client B (z.B. TTLS) — gleiche Runde
    await wait(40);
    assert.equal(wins.length, 1, 'gleiche winId → nur 1× gezählt');
    assert.equal(wins[0]?.user.id, 'mia');

    a.ws.send(JSON.stringify({ kind: 'gamewin', winId: 'layer1-4', user: { id: 'ben', nickname: 'Ben' } }));
    await wait(40);
    assert.equal(wins.length, 2, 'neue Runde (winId) → neu gezählt');
    a.close(); b.close();
  } finally {
    await server.stop();
  }
});

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

test('http: /overlay nutzt den Request-Host für wsUrl/baseUrl (TTLS via localtest.me)', async () => {
  const { server } = await setup();
  // fetch() erlaubt kein eigenes Host-Header-Override → roher http-Request.
  const get = (hostHeader: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: server.getPort(), path: `/overlay?token=${server.getToken()}`, headers: { Host: hostHeader } },
        (res) => {
          let body = '';
          res.on('data', (d) => { body += String(d); });
          res.on('end', () => resolve(body));
        },
      );
      req.on('error', reject);
      req.end();
    });
  try {
    const port = server.getPort();

    // Whitelisted Host (localtest.me) wird durchgereicht — Seite, WS und
    // Widgets laufen dann über denselben Hostnamen.
    const viaDomain = await get(`localtest.me:${port}`);
    assert.match(viaDomain, new RegExp(`ws://localtest\\.me:${port}/ws`));
    assert.match(viaDomain, new RegExp(`"baseUrl":"http://localtest\\.me:${port}"`));

    // Fremder/gespoofter Host fällt auf 127.0.0.1 zurück.
    const spoofed = await get('evil.example.com');
    assert.match(spoofed, new RegExp(`ws://127\\.0\\.0\\.1:${port}/ws`));
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

test('http: /media liefert Bild aus + unterstützt Range, lehnt Fremd-Endung ab', async () => {
  const { server } = await setup();
  try {
    const base = `http://127.0.0.1:${server.getPort()}`;
    const token = server.getToken();

    const ok = await fetch(`${base}/media/logo.png?token=${token}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.equal(ok.headers.get('accept-ranges'), 'bytes');

    const ranged = await fetch(`${base}/media/logo.png?token=${token}`, { headers: { Range: 'bytes=0-3' } });
    assert.equal(ranged.status, 206);
    assert.match(ranged.headers.get('content-range') ?? '', /bytes 0-3\//);

    const bad = await fetch(`${base}/media/logo.txt?token=${token}`);
    assert.equal(bad.status, 400);

    const traversal = await fetch(`${base}/media/..%2F..%2Fetc%2Fpasswd?token=${token}`);
    assert.notEqual(traversal.status, 200);
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

test('http: relative ES-Modul-Imports in Widget-JS bekommen den Token angehängt', async () => {
  const { server } = await setup();
  try {
    const base = `http://127.0.0.1:${server.getPort()}`;
    const token = server.getToken();
    const res = await fetch(`${base}/widgets/with-import.js?token=${token}`);
    assert.equal(res.status, 200);
    const body = await res.text();
    // Sonst würde der Browser ./combo.js ohne Token anfragen → 403.
    assert.match(body, new RegExp(`from\\s*['"]\\./combo\\.js\\?token=${token}['"]`));
    // Und das so referenzierte Modul ist dann auch wirklich abrufbar.
    const combo = await fetch(`${base}/widgets/combo.js?token=${token}`);
    assert.equal(combo.status, 200);
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

test('preview-proxy: nur MyInstants-URLs erlaubt (SSRF-Schutz), Token nötig', async () => {
  const { server } = await setup();
  try {
    const base = `http://127.0.0.1:${server.getPort()}`;
    const token = server.getToken();
    // Ohne Token → 403.
    assert.equal((await fetch(`${base}/preview?url=https://www.myinstants.com/x.mp3`)).status, 403);
    // Fremde Domain → 400 (kein offener Proxy).
    assert.equal((await fetch(`${base}/preview?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}&token=${token}`)).status, 400);
    assert.equal((await fetch(`${base}/preview?url=${encodeURIComponent('https://evil.example.com/a.mp3')}&token=${token}`)).status, 400);
  } finally {
    await server.stop();
  }
});

test('ws: ALLERERSTE nachricht ist hello mit der App-Version (Auto-Reload-Handshake)', async () => {
  const { server } = await setup(0, { appVersion: '9.9.9' });
  try {
    const client = await wsConnect(server.getWsUrl());
    const hello = await client.whenHello();
    assert.equal(hello.kind, 'hello');
    assert.equal(hello.version, '9.9.9');
    client.close();
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
