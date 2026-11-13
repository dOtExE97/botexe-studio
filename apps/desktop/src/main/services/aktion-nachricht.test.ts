// Ausgelöste Aktionen tragen die Plattform des auslösenden Ereignisses —
// sonst erscheint der Alarm eines Twitch-Follows auch im TikTok-Overlay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { aktionsNachricht } from './aktion-nachricht';

const ALARM = { kind: 'fire_alert', targetId: 'l1' } as const;

test('Aktion eines Twitch-Follows trägt plattform „twitch"', () => {
  const m = aktionsNachricht('r1', ALARM, { plattform: 'twitch' });
  assert.deepEqual(m, { kind: 'action', ruleId: 'r1', action: ALARM, plattform: 'twitch' });
});

test('Aktion eines TikTok-Ereignisses trägt plattform „tiktok"', () => {
  assert.equal(aktionsNachricht('r1', ALARM, { plattform: 'tiktok' }).plattform, 'tiktok');
});

test('Ereignis ohne Plattform (Timer, Test, manuell) → Aktion ohne Feld = an alle Overlays', () => {
  const m = aktionsNachricht('manual', ALARM, {});
  assert.equal('plattform' in m, false);
});

// Wächter: Studio muss JEDE Aktions-Nachricht in runAction über
// aktionsNachricht() bauen. Ein von Hand gebautes `{ kind: 'action', … }`
// dort vergisst die Plattform wieder — und alle anderen Tests blieben grün.
test('studio.ts: runAction baut Aktions-Nachrichten nur über aktionsNachricht()', () => {
  const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
    ? join(process.cwd(), 'src')
    : join(process.cwd(), 'apps', 'desktop', 'src');
  const quelle = readFileSync(join(SRC, 'main', 'services', 'studio.ts'), 'utf8');
  const von = quelle.indexOf('  private runAction(');
  assert.ok(von > 0, 'runAction nicht gefunden — Wächter anpassen');
  const bis = quelle.indexOf('\n  private ', von + 10);
  const rumpf = quelle.slice(von, bis);
  assert.equal(/kind:\s*'action'/.test(rumpf), false, 'runAction baut eine Aktions-Nachricht von Hand (ohne Plattform?)');
  const aufrufe = rumpf.match(/this\.server\.broadcast\(aktionsNachricht\([^;]*,\s*event\)\)/g) ?? [];
  assert.equal(aufrufe.length, 2, 'Spin-Rad- und allgemeiner Zweig müssen beide aktionsNachricht(…, event) nutzen');
});
