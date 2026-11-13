// Ausgelöste Aktionen tragen die Plattform des auslösenden Ereignisses —
// sonst erscheint der Alarm eines Twitch-Follows auch im TikTok-Overlay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { aktionsNachricht, momentNachricht, chatZiel } from './aktion-nachricht';
import type { MomentPayload } from '@botexe/overlay-engine';

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

// ── Momente (Abschluss-Review M3/I2) ────────────────────────────────────────

const MOMENT = (userId?: string): MomentPayload => ({
  id: 'm1', channel: 'viewer', type: 'vip-welcome', priority: 1, durationMs: 1000, title: 'Hallo',
  ...(userId ? { user: { id: userId, nickname: 'X' } } : {}),
} as MomentPayload);

test('Moment eines Twitch-Ereignisses trägt plattform „twitch" (kein Twitch-Gast im TikTok-Overlay)', () => {
  assert.equal(momentNachricht(MOMENT('twitch:7'), { plattform: 'twitch' }).plattform, 'twitch');
  assert.equal(momentNachricht(MOMENT('u1'), { plattform: 'tiktok' }).plattform, 'tiktok');
});

test('Moment ohne Ereignis (Spiel-Sieg): Plattform aus der Zuschauer-ID', () => {
  assert.equal(momentNachricht(MOMENT('twitch:7')).plattform, 'twitch');
  assert.equal('plattform' in momentNachricht(MOMENT('u1')), false, 'TikTok-/unbekannte ID → an alle wie bisher');
  assert.equal('plattform' in momentNachricht(MOMENT()), false, 'Boss-Kill ohne Nutzer → an alle');
});

// ── Chat-Antworten (Abschluss-Review I1) ────────────────────────────────────

test('Antworten gehen in den Chat der auslösenden Plattform (Twitch → Twitch, sonst TikTok)', () => {
  assert.equal(chatZiel({ plattform: 'twitch' }), 'twitch');
  assert.equal(chatZiel({ plattform: 'tiktok' }), 'tiktok');
  assert.equal(chatZiel({}), 'tiktok', 'Timer/Test/manuell wie bisher');
});

function studioQuelle(): string {
  const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
    ? join(process.cwd(), 'src')
    : join(process.cwd(), 'apps', 'desktop', 'src');
  return readFileSync(join(SRC, 'main', 'services', 'studio.ts'), 'utf8');
}

test('studio.ts: Regel und Chat-Befehl antworten nur über chatAntwort(), und die wählt per chatZiel()', () => {
  const q = studioQuelle();
  // Regel-Aktion und Befehl gehen über chatAntwort(event, …) …
  assert.match(q, /action\.kind === 'send_chat'\) \{\s*this\.chatAntwort\(event, renderSpeakTemplate\(action\.template, event\)\);/);
  assert.match(q, /if \(cmd\.sendToChat\) this\.chatAntwort\(event, text\);/);
  // … und NUR chatAntwort ruft den TikTok-Versand direkt (sonst ginge eine
  // Twitch-Antwort an der Weiche vorbei in den TikTok-Chat).
  const direkt = q.split('\n').filter((z) => /void this\.sendChat\(/.test(z));
  assert.equal(direkt.length, 1, `direkte sendChat-Aufrufe: ${direkt.map((z) => z.trim()).join(' | ')}`);
  const weiche = q.slice(q.indexOf('private chatAntwort('), q.indexOf('private chatAntwort(') + 400);
  assert.match(weiche, /chatZiel\(event\) === 'twitch'\) this\.twitchChat\.senden\(text\);\s*else void this\.sendChat\(text\);/);
});

test('studio.ts: Momente nur über momentNachricht(); Zuschauer-Moment gibt sein Ereignis mit', () => {
  const q = studioQuelle();
  assert.equal(/kind:\s*'moment'/.test(q), false, 'Moment-Nachricht von Hand gebaut (ohne Plattform?)');
  assert.match(q, /this\.server\.broadcast\(momentNachricht\(moment, quelle\)\)/);
  assert.match(q, /if \(moment\) this\.emitMoment\(moment, event\);/);
  // Intro (welcome-media) trägt ebenfalls die Plattform des Auslösers.
  assert.equal(/ruleId: 'welcome-media'/.test(q), false, 'Intro-Aktion von Hand gebaut (ohne Plattform?)');
  assert.match(q, /aktionsNachricht\('welcome-media', action, quelle\)/);
});
