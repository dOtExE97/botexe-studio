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

test('Chat-Box Stil „piraten“: Karten mit Name, Text, Abzeichen und eigenen Schriften', () => {
  const root = installiereFakeDom();
  const w: any = new ChatBox(root, { style: 'piraten' }, {});
  const wurzel = root.children[0]!;
  assert.ok(wurzel.classList.contains('bx-cb') && wurzel.classList.contains('bx-cb-piraten'));
  // Ohne eigene Schriftwahl bringt der Stil Lilita One + Saira mit.
  assert.match(wurzel.style.getPropertyValue('--bx-font-body'), /Saira Semi Condensed/);
  assert.match(wurzel.style.getPropertyValue('--bx-font-display'), /Lilita One/);
  w.onEvent({ type: 'chat', ts: 1, plattform: 'twitch', user: { id: 't:1', nickname: 'Seemann42' }, text: 'Ahoi 🏴‍☠️' });
  w.onEvent({ type: 'chat', ts: 2, plattform: 'twitch', user: { id: 't:2', nickname: 'KäptnBlaubär', isMod: true, isSub: true }, text: 'Segel setzen!' });
  w.onEvent({ type: 'chat', ts: 3, plattform: 'twitch', user: { id: 't:3', nickname: 'dOtExE_97', isMod: true, isBroadcaster: true }, text: 'Moin' });
  assert.equal(mitKlasse(root, 'bx-cb-msg').length, 3);
  assert.deepEqual(mitKlasse(root, 'bx-cb-nm').map((n) => n.textContent), ['Seemann42', 'KäptnBlaubär', 'dOtExE_97']);
  // Emojis kommen im Piraten-Stil als Bild (alt = das Zeichen).
  assert.deepEqual(mitKlasse(root, 'bx-cb-text').map((t) => t.children.map((k: any) => (k.tagName === 'IMG' ? `[${k.alt}]` : k.textContent)).join('')), ['Ahoi [🏴‍☠️]', 'Segel setzen!', 'Moin']);
  // Abzeichen: keins für normale Zuschauer, Säbel + Stern für Mod-Abo,
  // nur die Krone für den Streamer (nicht zusätzlich die Säbel).
  const namen = mitKlasse(root, 'bx-cb-name');
  assert.equal(mitKlasse(namen[0]!, 'bx-cb-b').length, 0);
  assert.deepEqual(mitKlasse(namen[1]!, 'bx-cb-b').map((b) => b.className), ['bx-cb-b bx-cb-b-mod', 'bx-cb-b bx-cb-b-sub']);
  assert.deepEqual(mitKlasse(namen[2]!, 'bx-cb-b').map((b) => b.className), ['bx-cb-b bx-cb-b-host']);
  // Namensfarbe aus der kuratierten Palette (Hex), nicht der Regenbogen-HSL.
  assert.match(namen[0]!.style.color, /^#[0-9a-f]{6}$/);
  w.destroy();
  // Eigene Schriftwahl des Nutzers gewinnt: dann setzt der Stil nichts.
  const zwei = installiereFakeDom();
  const v: any = new ChatBox(zwei, { style: 'piraten', fontFamily: 'bebas' }, {});
  assert.equal(zwei.children[0]!.style.getPropertyValue('--bx-font-body'), '');
  v.destroy();
});

test('Chat-Box Standard-Stil bleibt unverändert: gleiche Klassen, nackter Name, keine Abzeichen', () => {
  const root = installiereFakeDom();
  const w: any = new ChatBox(root, {}, {});
  const wurzel = root.children[0]!;
  assert.equal(wurzel.className, 'bx-cb');
  assert.equal(wurzel.style.getPropertyValue('--bx-font-body'), '');
  w.onEvent({ type: 'chat', ts: 1, plattform: 'twitch', user: { id: 't:2', nickname: 'KäptnBlaubär', isMod: true, isSub: true, isBroadcaster: true }, text: 'Segel setzen!' });
  const msg = mitKlasse(root, 'bx-cb-msg')[0]!;
  // (Die Attrappe legt alle Elemente aus dem innerHTML flach nebeneinander.)
  assert.deepEqual(msg.children.map((k) => k.className), ['bx-cb-pic bx-av', 'bx-cb-body', 'bx-cb-name', 'bx-cb-text']);
  const name = mitKlasse(root, 'bx-cb-name')[0]!;
  assert.equal(name.textContent, 'KäptnBlaubär');
  assert.equal(name.children.length, 0);
  assert.match(name.style.color, /^hsl\(\d+ 88% 70%\)$/);
  assert.equal(mitKlasse(root, 'bx-cb-b').length, 0);
  w.destroy();
});

test('Emoji-Bilder: Piraten von sich aus an, alte Stile aus — Schalter überstimmt beides', () => {
  const zaehle = (props: Record<string, unknown>) => {
    const root = installiereFakeDom();
    const w: any = new ChatBox(root, props, {});
    w.onEvent({ type: 'chat', ts: 1, plattform: 'twitch', user: { id: 't:1', nickname: 'Seemann🏴‍☠️' }, text: 'Ahoi 🏴‍☠️ 💰' });
    const text = mitKlasse(root, 'bx-cb-text')[0]!;
    const bilder = alle(root).filter((k) => k.tagName === 'IMG' && k.className === 'emoji');
    const ergebnis = { bilder: bilder.length, textKnoten: text.children.length };
    w.destroy();
    return ergebnis;
  };
  // Alte Stile ohne Einstellung (= jedes vorhandene Overlay): ein Textknoten, kein Bild.
  for (const style of [undefined, 'glas', 'clean', 'sticker']) {
    assert.deepEqual(zaehle(style ? { style } : {}), { bilder: 0, textKnoten: 1 }, `Stil ${style ?? '(Standard)'}`);
  }
  assert.deepEqual(zaehle({ style: 'glas', emojiBilder: 'auto' }), { bilder: 0, textKnoten: 1 });
  // Piraten: 2 im Text + 1 im Namen.
  assert.equal(zaehle({ style: 'piraten' }).bilder, 3);
  assert.equal(zaehle({ style: 'piraten', emojiBilder: 'aus' }).bilder, 0);
  assert.equal(zaehle({ style: 'glas', emojiBilder: 'an' }).bilder, 3);
  assert.equal(zaehle({ style: 'clean', emojiBilder: true }).bilder, 3);
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
