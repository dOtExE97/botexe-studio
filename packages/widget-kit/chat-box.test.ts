// chat-box.test.ts — Plattform-Zeichen (Standard aus) und eine Twitch-Nachricht
// mit Emotes im Ersatz-DOM. Follow-Alert mit einem Twitch-Follow gleich mit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installiereFakeDom, type FakeElement } from './fake-dom.test-helfer.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
g.ResizeObserver ??= class { observe() {} disconnect() {} };
g.Image ??= class { onload: (() => void) | null = null; src = ''; };

const { default: ChatBox } = await import('./chat-box.js');
const { default: FollowAlert } = await import('./follow-alert.js');

/** Alle Nachkommen (Tiefensuche) — die Attrappe kennt kein querySelectorAll. */
function alle(el: FakeElement): FakeElement[] {
  return el.children.flatMap((k) => [k, ...alle(k)]);
}
const mitKlasse = (el: FakeElement, k: string) => alle(el).filter((x) => x.classList.contains(k));

const twitchChat = {
  type: 'chat', ts: 1, plattform: 'twitch',
  user: { id: 'twitch:123', nickname: 'PiratPaul', userId: 'piratpaul' },
  text: 'Hallo  und ',
  sticker: [
    { id: 'twitch-25', bild: 'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0', index: 6, animiert: false },
    { id: 'twitch-1902', bild: 'https://static-cdn.jtvnw.net/emoticons/v2/1902/static/dark/2.0', index: 11, animiert: false },
  ],
};

test('Chat-Box ohne plattformZeichen: kein Zeichen-Element (altes Aussehen), auch bei Twitch', () => {
  const root = installiereFakeDom();
  const w: any = new ChatBox(root, {}, {});
  w.onEvent(twitchChat);
  w.onEvent({ ...twitchChat, plattform: 'tiktok', sticker: [] });
  assert.equal(mitKlasse(root, 'bx-cb-msg').length, 2);
  assert.equal(mitKlasse(root, 'bx-cb-pf').length, 0);
  w.destroy();
});

test('Chat-Box mit plattformZeichen: Twitch- und TikTok-Zeichen vor dem Namen, keins ohne Plattform', () => {
  const root = installiereFakeDom();
  const w: any = new ChatBox(root, { plattformZeichen: true }, {});
  w.onEvent(twitchChat);
  w.onEvent({ type: 'chat', ts: 2, plattform: 'tiktok', user: { id: '7', nickname: 'Mia' }, text: 'hi' });
  w.onEvent({ type: 'chat', ts: 3, user: { id: '8', nickname: 'Test' }, text: 'ohne Plattform' });
  w.onEvent({ type: 'chat', ts: 4, plattform: 'youtube', user: { id: '9', nickname: 'X' }, text: 'unbekannt' });
  const namen = mitKlasse(root, 'bx-cb-name');
  assert.equal(namen.length, 4);
  // Zeichen steht VOR dem Namen (erstes Kind der Namenszeile).
  assert.ok(namen[0]!.children[0]!.classList.contains('bx-cb-pf-twitch'));
  assert.ok(namen[1]!.children[0]!.classList.contains('bx-cb-pf-tiktok'));
  assert.equal(namen[2]!.children.length, 0);
  assert.equal(namen[3]!.children.length, 0);
  assert.equal(mitKlasse(root, 'bx-cb-pf').length, 2);
  w.destroy();
});

test('Chat-Box zeigt eine Twitch-Nachricht mit Emotes an der richtigen Stelle', () => {
  const root = installiereFakeDom();
  const w: any = new ChatBox(root, {}, {});
  w.onEvent(twitchChat);
  const text = mitKlasse(root, 'bx-cb-text')[0]!;
  const teile = text.children.map((k) => (k.tagName === 'IMG' ? `[${k.src}]` : k.textContent));
  assert.deepEqual(teile, [
    'Hallo ',
    '[https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0]',
    ' und ',
    '[https://static-cdn.jtvnw.net/emoticons/v2/1902/static/dark/2.0]',
  ]);
  assert.equal(mitKlasse(root, 'bx-cb-name')[0]!.textContent, 'PiratPaul');
  // Reine Emote-Nachricht ohne Profilbild, sehr langer Name: kommt an, wirft nicht.
  w.onEvent({ type: 'chat', ts: 5, plattform: 'twitch', user: { id: 'twitch:9', nickname: 'x'.repeat(200) }, text: ' ', sticker: [twitchChat.sticker[0]] });
  assert.equal(mitKlasse(root, 'bx-cb-msg').length, 2);
  w.destroy();
});

test('Chat-Box-Vorschau ohne Schalter bleibt wie vorher, mit Schalter zeigt sie beide Zeichen', () => {
  const ohne = installiereFakeDom();
  const a: any = new ChatBox(ohne, {}, { preview: true });
  assert.equal(mitKlasse(ohne, 'bx-cb-pf').length, 0);
  a.destroy();
  const mit = installiereFakeDom();
  const b: any = new ChatBox(mit, { plattformZeichen: true }, { preview: true });
  assert.ok(mitKlasse(mit, 'bx-cb-pf-twitch').length > 0);
  assert.ok(mitKlasse(mit, 'bx-cb-pf-tiktok').length > 0);
  b.destroy();
});

test('Follow-Alert zeigt einen Twitch-Follow (Twitch-ID, ohne Profilbild)', () => {
  const root = installiereFakeDom();
  const w: any = new FollowAlert(root, { durationMs: 3600 }, {});
  w.onEvent({ type: 'follow', ts: 1, plattform: 'twitch', user: { id: 'twitch:123', nickname: 'PiratPaul', userId: 'piratpaul' } });
  assert.equal(w.busy, true);
  assert.equal(mitKlasse(root, 'bx-fa-name')[0]?.textContent, 'PiratPaul');
  assert.equal(mitKlasse(root, 'bx-fa-label')[0]?.textContent, 'Neuer Follower');
  w.destroy();
});
