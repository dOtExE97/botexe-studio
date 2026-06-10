// ui-tour.ts — Screenshot-Tour durch alle App-Seiten + Overlay, gegen die
// laufende App (--remote-debugging-port=9222). Demo-Daten werden über die
// echte IPC-Kette angelegt.
import WebSocket from 'ws';
import fs from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
const OUT = process.argv[2] ?? '/tmp';

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
  const r = (await send(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
    result?: { value?: unknown };
    exceptionDetails?: unknown;
  };
  if (r.exceptionDetails) throw new Error(`JS: ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`);
  return r.result?.value;
}

async function shot(ws: WebSocket, file: string): Promise<void> {
  const s = (await send(ws, 'Page.captureScreenshot', { format: 'png' })) as { data: string };
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
  console.log(`📸 ${file}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clickNav(ws: WebSocket, label: string): Promise<void> {
  await evalJs(
    ws,
    `[...document.querySelectorAll('aside button')].find(b => b.textContent.trim() === '${label}')?.click()`,
  );
  await sleep(700);
}

const DEMO_LAYOUT = {
  schemaVersion: 1,
  id: 'demo-e2e',
  name: 'Mein Stream-Overlay',
  canvas: { width: 1920, height: 1080, background: 'transparent' },
  layers: [
    { id: 'l-alert', widgetType: 'gift-alert', name: 'Gift-Alert', x: 560, y: 300, w: 800, h: 360, z: 10, visible: true, props: { minCoins: 0, durationMs: 30000 } },
    { id: 'l-follow', widgetType: 'follow-alert', name: 'Follow-Alert', x: 40, y: 60, w: 460, h: 90, z: 5, visible: true, props: { durationMs: 30000 } },
    { id: 'l-goal', widgetType: 'goal-bar', name: 'Goal', x: 560, y: 40, w: 760, h: 90, z: 4, visible: true, props: { metric: 'coins', target: 5000 } },
    { id: 'l-board', widgetType: 'leaderboard', name: 'Leaderboard', x: 1520, y: 60, w: 360, h: 300, z: 3, visible: true, props: { limit: 5 } },
    { id: 'l-feed', widgetType: 'gift-feed', name: 'Gift-Feed', x: 1520, y: 420, w: 380, h: 260, z: 2, visible: true, props: { max: 5, ttlMs: 120000 } },
    { id: 'l-chat', widgetType: 'chat-box', name: 'Chat', x: 40, y: 620, w: 440, h: 420, z: 1, visible: true, props: { max: 8 } },
  ],
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
};

const DEMO_RULES = [
  { id: 'rule-big-gift', name: 'Big Gift Hype', event: 'gift', conditions: [{ kind: 'gift_coins_gte', value: 100 }], actions: [{ kind: 'fire_alert', targetId: 'l-alert' }, { kind: 'play_sound', soundId: 'gift-fanfare.wav' }], cooldownMs: 5000, enabled: true },
  { id: 'rule-follow', name: 'Follower Begrüßung', event: 'follow', conditions: [], actions: [{ kind: 'play_sound', soundId: 'follow-pling.wav' }], cooldownMs: 3000, enabled: true },
  { id: 'rule-hype-keyword', name: 'Hype im Chat', event: 'chat', conditions: [{ kind: 'chat_keyword', value: 'hype' }], actions: [{ kind: 'fire_alert', targetId: 'l-follow' }], cooldownMs: 10000, enabled: false },
];

const EVENTS = [
  { type: 'viewer_count', ts: 0, viewerCount: 187 },
  { type: 'chat', ts: 0, user: { id: 'mia', nickname: 'Mia' }, text: 'Endlich wieder live! 🔥' },
  { type: 'chat', ts: 0, user: { id: 'leon', nickname: 'LeonGG' }, text: 'Das neue Overlay ist krass' },
  { type: 'follow', ts: 0, user: { id: 'neu', nickname: 'NeuerFan' } },
  { type: 'gift', ts: 0, user: { id: 'mia', nickname: 'Mia' }, gift: { slug: 'Rose', count: 5, coinsPerUnit: 1, totalCoins: 5 } },
  { type: 'like', ts: 0, user: { id: 'mia', nickname: 'Mia' }, likeCount: 50, totalLikes: 731 },
  { type: 'chat', ts: 0, user: { id: 'sara', nickname: 'Sara_99' }, text: 'W Stream, bleib so!' },
  { type: 'gift', ts: 0, user: { id: 'ben', nickname: 'BigBen' }, gift: { slug: 'Galaxy', count: 1, coinsPerUnit: 1000, totalCoins: 1000 } },
];

async function main(): Promise<void> {
  const targets = (await (await fetch(`${CDP}/json`)).json()) as { webSocketDebuggerUrl: string; url: string; type: string }[];
  const target = targets.find((t) => t.type === 'page' && !t.url.includes('devtools'));
  if (!target) throw new Error('Kein App-Target');
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  // Demo-Daten über echte IPC
  await evalJs(ws, `window.studio.saveLayout(${JSON.stringify(DEMO_LAYOUT)})`);
  await evalJs(ws, `window.studio.setActiveLayout('demo-e2e')`);
  await evalJs(ws, `window.studio.setRules(${JSON.stringify(DEMO_RULES)})`);
  for (const e of EVENTS) {
    await evalJs(ws, `window.studio.sendTestEvent(${JSON.stringify(e)})`);
    await sleep(120);
  }
  await sleep(500);

  // Tour durch die Seiten
  await clickNav(ws, 'Live');
  await shot(ws, `${OUT}/tour-1-live.png`);

  await clickNav(ws, 'Overlay');
  await sleep(600);
  // einen Layer anwählen, damit das Property-Panel zu sehen ist
  await evalJs(
    ws,
    `(() => { const el = [...document.querySelectorAll('[data-testid], div')].find(d => d.textContent === 'Leaderboard' && d.className.includes('font-display'));
       const layer = [...document.querySelectorAll('section div')].filter(d => d.style && d.style.outline && d.style.outline.includes('dashed'))[3];
       (layer ?? el)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return 'ok'; })()`,
  ).catch(() => undefined);
  await sleep(400);
  await shot(ws, `${OUT}/tour-2-overlay-editor.png`);

  await clickNav(ws, 'Trigger');
  await shot(ws, `${OUT}/tour-3-trigger.png`);

  await clickNav(ws, 'Sounds');
  await shot(ws, `${OUT}/tour-4-sounds.png`);

  // Overlay selbst: frisches Event reinschieben, damit der Alert "live" ist
  const info = (await evalJs(ws, 'window.studio.getOverlayInfo()')) as { url: string };
  await send(ws, 'Page.navigate', { url: info.url });
  await sleep(2800);
  await send(ws, 'Emulation.setDefaultBackgroundColorOverride', { color: { r: 22, g: 24, b: 32, a: 255 } });
  await sleep(400);
  await shot(ws, `${OUT}/tour-5-overlay.png`);

  await send(ws, 'Emulation.setDefaultBackgroundColorOverride', {});
  await send(ws, 'Page.navigate', { url: target.url });
  ws.close();
  console.log('Tour fertig');
}

main().catch((err) => {
  console.error('TOUR FEHLGESCHLAGEN:', err.message);
  process.exit(1);
});
