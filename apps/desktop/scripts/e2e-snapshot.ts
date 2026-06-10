// e2e-snapshot.ts — automatisierter Durchstich gegen die LAUFENDE App
// (gestartet mit --remote-debugging-port=9222):
//   1. Demo-Layout über die echte IPC-Kette speichern + aktiv setzen (K3-Pfad)
//   2. Test-Events injizieren (Trigger/Stats/Overlay reagieren echt)
//   3. Screenshot App-Shell → dann Overlay-Link laden → Screenshot Overlay
// Nutzt rohes CDP über ws — keine Extra-Dependencies.
import WebSocket from 'ws';
import fs from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
const OUT_DIR = process.argv[2] ?? '/tmp';

interface Target {
  webSocketDebuggerUrl: string;
  url: string;
  type: string;
}

let msgId = 0;
function send(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const onMessage = (data: unknown) => {
      const msg = JSON.parse(String(data));
      if (msg.id === id) {
        ws.off('message', onMessage);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(ws: WebSocket, expression: string): Promise<unknown> {
  const result = (await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })) as { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  if (result.exceptionDetails) throw new Error(`JS-Fehler: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}

async function screenshot(ws: WebSocket, file: string): Promise<void> {
  const shot = (await send(ws, 'Page.captureScreenshot', { format: 'png' })) as { data: string };
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`📸 ${file}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEMO_LAYOUT = {
  schemaVersion: 1,
  id: 'demo-e2e',
  name: 'E2E-Demo',
  canvas: { width: 1920, height: 1080, background: 'transparent' },
  layers: [
    { id: 'l-alert', widgetType: 'gift-alert', name: 'Gift-Alert', x: 560, y: 300, w: 800, h: 360, z: 10, visible: true, props: { minCoins: 0, durationMs: 60000 } },
    { id: 'l-follow', widgetType: 'follow-alert', name: 'Follow-Alert', x: 40, y: 60, w: 460, h: 90, z: 5, visible: true, props: { durationMs: 60000 } },
    { id: 'l-goal', widgetType: 'goal-bar', name: 'Goal', x: 560, y: 40, w: 760, h: 90, z: 4, visible: true, props: { metric: 'coins', target: 1000 } },
    { id: 'l-board', widgetType: 'leaderboard', name: 'Leaderboard', x: 1520, y: 60, w: 360, h: 300, z: 3, visible: true, props: { limit: 5 } },
    { id: 'l-feed', widgetType: 'gift-feed', name: 'Gift-Feed', x: 1520, y: 420, w: 380, h: 260, z: 2, visible: true, props: { max: 5, ttlMs: 120000 } },
    { id: 'l-chat', widgetType: 'chat-box', name: 'Chat', x: 40, y: 620, w: 440, h: 420, z: 1, visible: true, props: { max: 8 } },
  ],
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
};

const TEST_EVENTS = [
  { type: 'viewer_count', ts: 0, viewerCount: 142 },
  { type: 'chat', ts: 0, user: { id: 'mia', nickname: 'Mia' }, text: 'Erster! 🔥' },
  { type: 'chat', ts: 0, user: { id: 'leon', nickname: 'LeonGG' }, text: 'Das Overlay ist krass' },
  { type: 'chat', ts: 0, user: { id: 'sara', nickname: 'Sara_99' }, text: 'W Stream' },
  { type: 'follow', ts: 0, user: { id: 'neu', nickname: 'NeuerFan' } },
  { type: 'gift', ts: 0, user: { id: 'mia', nickname: 'Mia' }, gift: { slug: 'Rose', count: 3, coinsPerUnit: 1, totalCoins: 3 } },
  { type: 'gift', ts: 0, user: { id: 'ben', nickname: 'BigBen' }, gift: { slug: 'Galaxy', count: 1, coinsPerUnit: 1000, totalCoins: 1000 } },
  { type: 'like', ts: 0, user: { id: 'mia', nickname: 'Mia' }, likeCount: 50, totalLikes: 412 },
];

async function main(): Promise<void> {
  const targets = (await (await fetch(`${CDP}/json`)).json()) as Target[];
  const appTarget = targets.find((t) => t.type === 'page' && !t.url.includes('devtools'));
  if (!appTarget) throw new Error(`Kein App-Target gefunden: ${JSON.stringify(targets.map((t) => t.url))}`);
  console.log(`Verbunden mit: ${appTarget.url}`);

  const ws = new WebSocket(appTarget.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  // 1. Layout über echte IPC speichern + aktivieren
  const saveResult = await evalJs(ws, `window.studio.saveLayout(${JSON.stringify(DEMO_LAYOUT)})`);
  console.log('saveLayout:', JSON.stringify(saveResult).slice(0, 120));
  if (!(saveResult as { ok: boolean }).ok) throw new Error('Layout-Save fehlgeschlagen!');
  await evalJs(ws, `window.studio.setActiveLayout('demo-e2e')`);

  // 2. Test-Events durch die echte Kette jagen
  for (const e of TEST_EVENTS) {
    await evalJs(ws, `window.studio.sendTestEvent(${JSON.stringify(e)})`);
    await sleep(150);
  }
  await sleep(600);

  // 3. Screenshot App-Shell (Live-Page mit Feed + Stats)
  await screenshot(ws, `${OUT_DIR}/e2e-app-live.png`);

  // 4. Overlay-URL holen und im selben Fenster laden (echter TTLS-Pfad)
  const info = (await evalJs(ws, 'window.studio.getOverlayInfo()')) as { url: string };
  console.log(`Overlay: ${info.url}`);
  const appUrl = appTarget.url;
  await send(ws, 'Page.navigate', { url: info.url });
  await sleep(2500);
  // Events nochmal? — sticky last-values + stats kommen beim connect automatisch.
  await send(ws, 'Emulation.setDefaultBackgroundColorOverride', {
    color: { r: 24, g: 26, b: 34, a: 255 }, // dunkler Hintergrund statt transparent, nur für den Screenshot
  });
  await sleep(500);
  await screenshot(ws, `${OUT_DIR}/e2e-overlay.png`);

  // 5. zurück zur App
  await send(ws, 'Emulation.setDefaultBackgroundColorOverride', {});
  await send(ws, 'Page.navigate', { url: appUrl });
  ws.close();
  console.log('E2E-Durchstich OK');
}

main().catch((err) => {
  console.error('E2E FEHLGESCHLAGEN:', err.message);
  process.exit(1);
});
