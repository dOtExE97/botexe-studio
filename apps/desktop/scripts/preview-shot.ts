// preview-shot.ts — navigiert zum Overlay-Editor, wartet bis die Live-Vorschau
// (iframe + Demo-Daten) läuft, und macht einen Screenshot.
import WebSocket from 'ws';
import fs from 'node:fs';

const PAGE_WS = process.argv[2];
const OUT = process.argv[3] ?? '/tmp/preview-shot.png';
if (!PAGE_WS) throw new Error('usage: preview-shot.ts <pageWsUrl> [out.png]');

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
    result?: { value?: unknown }; exceptionDetails?: unknown;
  };
  if (r.exceptionDetails) throw new Error(`JS: ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`);
  return r.result?.value;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const ws = new WebSocket(PAGE_WS);
  await new Promise<void>((res, rej) => { ws.on('open', () => res()); ws.on('error', rej); });
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  // Zum Overlay-Editor navigieren
  await evalJs(ws, `[...document.querySelectorAll('aside button')].find(b => b.textContent.trim() === 'Overlay')?.click()`);
  await sleep(1500);
  // Demo-Daten laufen lassen (Gifts/Likes/Rad)
  await sleep(6000);
  await send(ws, 'Page.bringToFront', {}, 3000).catch(() => undefined);
  const s = (await send(ws, 'Page.captureScreenshot', { format: 'png', fromSurface: false }, 8000)) as { data: string };
  fs.writeFileSync(OUT, Buffer.from(s.data, 'base64'));
  console.log(`📸 ${OUT}`);
  ws.close();
}
void main();
