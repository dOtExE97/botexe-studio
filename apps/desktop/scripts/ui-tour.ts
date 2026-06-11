// ui-tour.ts — Screenshot-Tour durch alle App-Seiten + Overlay, gegen die
// laufende App (--remote-debugging-port=9222). Demo-Daten werden über die
// echte IPC-Kette angelegt.
import WebSocket from 'ws';
import fs from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
const OUT = process.argv[2] ?? '/tmp';

let msgId = 0;
function send(ws: WebSocket, method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<Record<string, unknown>> {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`TIMEOUT: ${method}`)), timeoutMs);
    const onMessage = (data: unknown) => {
      const msg = JSON.parse(String(data));
      if (msg.id === id) {
        clearTimeout(timer);
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
  // Verdecktes/minimiertes Fenster produziert keine frames → capture hängt.
  // bringToFront + retry macht den capture zuverlässig.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await send(ws, 'Page.bringToFront', {}, 3000).catch(() => undefined);
      const s = (await send(ws, 'Page.captureScreenshot', { format: 'png', fromSurface: false }, 8000)) as { data: string };
      fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
      console.log(`📸 ${file}`);
      return;
    } catch (err) {
      if (attempt === 1) throw err;
      console.log(`shot retry (${(err as Error).message})`);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clickNav(ws: WebSocket, label: string): Promise<void> {
  await evalJs(
    ws,
    `[...document.querySelectorAll('aside button')].find(b => b.textContent.trim() === '${label}')?.click()`,
  );
  await sleep(700);
}

// Hochformat-Layout (TikTok 1080x1920), Widgets in der Focus-Zone platziert.
const avatar = (initial: string, bg: string) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${bg}"/><text x="32" y="42" font-family="Arial Black" font-size="30" fill="#fff" text-anchor="middle">${initial}</text></svg>`).toString('base64');
const giftIcon = (emoji: string) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><text x="48" y="68" font-size="56" text-anchor="middle">${emoji}</text></svg>`).toString('base64');

const DEMO_LAYOUT = {
  schemaVersion: 1,
  id: 'demo-e2e',
  name: 'Mein Stream-Overlay',
  canvas: { width: 1080, height: 1920, background: 'transparent' },
  layers: [
    { id: 'l-fireworks', widgetType: 'gift-fireworks', name: 'Feuerwerk', x: 40, y: 230, w: 1000, h: 1200, z: 1, visible: true, props: { minCoins: 0, maxRockets: 3 } },
    { id: 'l-chips', widgetType: 'stat-chips', name: 'Zähler', x: 110, y: 130, w: 720, h: 70, z: 4, visible: true, props: { metrics: 'viewers,likes,follows,coins' } },
    { id: 'l-goal', widgetType: 'goal-bar', name: 'Goal', x: 110, y: 240, w: 720, h: 90, z: 4, visible: true, props: { metric: 'coins', target: 5000, accent: '#21e6c1' } },
    { id: 'l-board', widgetType: 'leaderboard', name: 'Top Gifter', x: 110, y: 370, w: 350, h: 290, z: 3, visible: true, props: { source: 'gifts', limit: 5 } },
    { id: 'l-likes', widgetType: 'leaderboard', name: 'Like-Liste', x: 490, y: 370, w: 340, h: 290, z: 3, visible: true, props: { source: 'likes', limit: 5 } },
    { id: 'l-alert', widgetType: 'gift-alert', name: 'Gift-Alert', x: 110, y: 700, w: 400, h: 420, z: 10, visible: true, props: { minCoins: 0, durationMs: 30000 } },
    { id: 'l-jar', widgetType: 'gift-jar', name: 'Geschenke-Glas', x: 540, y: 690, w: 290, h: 480, z: 6, visible: true, props: { target: 5000 } },
    { id: 'l-follow', widgetType: 'follow-alert', name: 'Follow-Alert', x: 110, y: 1150, w: 420, h: 90, z: 5, visible: true, props: { durationMs: 30000 } },
    { id: 'l-feed', widgetType: 'gift-feed', name: 'Gift-Feed', x: 460, y: 1255, w: 370, h: 160, z: 2, visible: true, props: { max: 3, ttlMs: 120000 } },
    { id: 'l-chat', widgetType: 'chat-box', name: 'Chat', x: 110, y: 1255, w: 340, h: 160, z: 1, visible: true, props: { max: 4 } },
  ],
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
};

const DEMO_RULES = [
  { id: 'rule-big-gift', name: 'Big Gift Hype', event: 'gift', conditions: [{ kind: 'gift_coins_gte', value: 100 }], actions: [{ kind: 'fire_alert', targetId: 'l-alert' }, { kind: 'play_sound', soundId: 'gift-fanfare.wav' }], cooldownMs: 5000, enabled: true },
  { id: 'rule-follow', name: 'Follower Begrüßung', event: 'follow', conditions: [], actions: [{ kind: 'play_sound', soundId: 'follow-pling.wav' }], cooldownMs: 3000, enabled: true },
  { id: 'rule-hype-keyword', name: 'Hype im Chat', event: 'chat', conditions: [{ kind: 'chat_keyword', value: 'hype' }], actions: [{ kind: 'fire_alert', targetId: 'l-follow' }], cooldownMs: 10000, enabled: false },
];

const USERS = {
  mia: { id: 'mia', nickname: 'Mia', profilePic: avatar('M', '#db2777') },
  leon: { id: 'leon', nickname: 'LeonGG', profilePic: avatar('L', '#2563eb') },
  sara: { id: 'sara', nickname: 'Sara_99', profilePic: avatar('S', '#21a179') },
  ben: { id: 'ben', nickname: 'BigBen', profilePic: avatar('B', '#7c3aed') },
  neu: { id: 'neu', nickname: 'NeuerFan', profilePic: avatar('N', '#e8543f') },
};

const EVENTS = [
  { type: 'viewer_count', ts: 0, viewerCount: 187 },
  { type: 'chat', ts: 0, user: USERS.mia, text: 'Endlich wieder live! 🔥' },
  { type: 'chat', ts: 0, user: USERS.leon, text: 'Das neue Overlay ist krass' },
  { type: 'follow', ts: 0, user: USERS.neu },
  { type: 'gift', ts: 0, user: USERS.mia, gift: { slug: 'Rose', count: 5, coinsPerUnit: 1, totalCoins: 5, icon: giftIcon('🌹') } },
  { type: 'like', ts: 0, user: USERS.mia, likeCount: 320, totalLikes: 731 },
  { type: 'like', ts: 0, user: USERS.leon, likeCount: 145, totalLikes: 876 },
  { type: 'like', ts: 0, user: USERS.sara, likeCount: 89, totalLikes: 965 },
  { type: 'chat', ts: 0, user: USERS.sara, text: 'W Stream, bleib so!' },
  { type: 'gift', ts: 0, user: USERS.ben, gift: { slug: 'Galaxy', count: 1, coinsPerUnit: 1000, totalCoins: 1000, icon: giftIcon('🌌') } },
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
  // MyInstants-suche live demonstrieren (echter scrape)
  await evalJs(ws, `(() => {
    const input = [...document.querySelectorAll('input')].find(i => (i.placeholder||'').includes('airhorn'));
    if (!input) return 'kein input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'airhorn');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'SUCHEN')?.click(), 100);
    return 'suche läuft';
  })()`).catch(() => undefined);
  await sleep(5000);
  await shot(ws, `${OUT}/tour-4-sounds.png`);

  // Overlay selbst: frisches Event reinschieben, damit der Alert "live" ist
  const info = (await evalJs(ws, 'window.studio.getOverlayInfo()')) as { url: string };
  await send(ws, 'Page.navigate', { url: info.url });
  await send(ws, 'Emulation.setDefaultBackgroundColorOverride', { color: { r: 22, g: 24, b: 32, a: 255 } });
  // Während das Overlay offen ist: gift-regen über den test-event-endpoint —
  // das glas füllt sich mit bild-kugeln, raketen steigen mit gift-bildern.
  await sleep(1500);
  const base = info.url.split('/overlay')[0];
  const token = new URL(info.url).searchParams.get('token');
  const fireGift = (user: Record<string, unknown>, slug: string, coins: number, count: number, emoji: string) =>
    fetch(`${base}/api/test-event?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'gift', ts: 0, user,
        gift: { slug, count, coinsPerUnit: coins / count, totalCoins: coins, icon: giftIcon(emoji) },
      }),
    });
  const gifts: Array<[Record<string, unknown>, string, number, number, string]> = [
    [USERS.mia, 'Rose', 5, 5, '🌹'],
    [USERS.leon, 'Donut', 30, 2, '🍩'],
    [USERS.sara, 'Herz', 10, 3, '💖'],
    [USERS.ben, 'Lion', 400, 1, '🦁'],
    [USERS.mia, 'Krone', 200, 2, '👑'],
    [USERS.neu, 'Galaxy', 1000, 1, '🌌'],
  ];
  for (const [user, slug, coins, count, emoji] of gifts) {
    await fireGift(user, slug, coins, count, emoji).catch(() => undefined);
    await sleep(350);
  }
  for (let i = 0; i < 6; i++) {
    await shot(ws, `${OUT}/tour-5-overlay-${i}.png`);
    await sleep(450);
  }

  await send(ws, 'Emulation.setDefaultBackgroundColorOverride', {});
  await send(ws, 'Page.navigate', { url: target.url });
  ws.close();
  console.log('Tour fertig');
}

main().catch((err) => {
  console.error('TOUR FEHLGESCHLAGEN:', err.message);
  process.exit(1);
});
