// Wächter gegen dieselbe Fehlerklasse wie settings-allowlist.test.ts, nur eine
// Ebene höher: Ein IPC-Kanal ist erst nutzbar, wenn er an DREI Stellen steht —
// als Konstante (constants.ts), als Brücke (preload.ts) und als Handler
// (main.ts). Fehlt eine davon, merkt das niemand beim Übersetzen:
//   • Handler fehlt  → der Aufruf hängt bzw. wirft erst zur Laufzeit
//   • preload fehlt  → window.studio.xyz ist undefined; mit `?.` (unser Muster)
//                      passiert dann STILL gar nichts, die Oberfläche bleibt leer
// Genau so blieb der OBS-Status auf „Aus" und die Telemetrie-Zustimmung wirkungslos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

const constantsQuelle = readFileSync(join(SRC, 'shared', 'constants.ts'), 'utf-8');
const mainQuelle = readFileSync(join(SRC, 'main.ts'), 'utf-8');
const preloadQuelle = readFileSync(join(SRC, 'preload.ts'), 'utf-8');

/** Alle in constants.ts definierten IPC-Namen (Schlüssel des IPC-Objekts). */
function alleKanaele(): string[] {
  const block = constantsQuelle.slice(constantsQuelle.indexOf('export const IPC = {'));
  return [...block.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):\s*'/gm)].map((m) => m[1] as string);
}

test('jeder IPC-Kanal hat einen Handler oder wird gepusht — kein toter Kanal', () => {
  const fehlend: string[] = [];
  for (const k of alleKanaele()) {
    // Ein Kanal ist „verdrahtet", wenn main.ts ihn irgendwo nennt: als
    // ipcMain.handle/on (Renderer ruft) ODER als send/webContents.send (Main
    // pusht). Beides steht als `IPC.NAME` im Quelltext.
    if (!new RegExp(`IPC\\.${k}\\b`).test(mainQuelle)) fehlend.push(k);
  }
  assert.deepEqual(
    fehlend,
    [],
    `Diese IPC-Kanäle sind in constants.ts definiert, aber in main.ts nirgends verdrahtet:\n  ${fehlend.join('\n  ')}`,
  );
});

test('jeder Kanal, den der Hauptprozess bedient, ist auch im preload erreichbar', () => {
  const fehlend: string[] = [];
  for (const k of alleKanaele()) {
    if (!new RegExp(`IPC\\.${k}\\b`).test(mainQuelle)) continue;    // vom Test oben abgedeckt
    if (!new RegExp(`IPC\\.${k}\\b`).test(preloadQuelle)) fehlend.push(k);
  }
  assert.deepEqual(
    fehlend,
    [],
    `Diese Kanäle bedient main.ts, aber das preload reicht sie nicht durch — die\n`
      + `Oberfläche kann sie nicht aufrufen (mit ?. passiert still gar nichts):\n  ${fehlend.join('\n  ')}`,
  );
});
