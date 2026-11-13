// neuer-pirat.test.ts — wer begrüßt wird (nur echte Erst-Schreiber, Plattform,
// keine Bots/Anonym/Streamer/Replays), Schlange ohne Doppelte, Aufräumen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installiereFakeDom, type FakeElement } from './fake-dom.test-helfer.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
installiereFakeDom();
const { default: NeuerPirat, neuerPirat, ignorierListe, STANDARD_IGNORIEREN } = await import('./neuer-pirat.js');

const opt = { plattform: 'twitch' as const, ignorieren: ignorierListe(STANDARD_IGNORIEREN) };
const chat = (nickname: string, extra: Record<string, unknown> = {}, user: Record<string, unknown> = {}) => ({
  type: 'chat', plattform: 'twitch', firstOfUser: true, text: 'moin', user: { id: `twitch:${nickname}`, nickname, ...user }, ...extra,
});

test('neuerPirat: Erst-Schreiber auf Twitch wird begrüßt, mit Bild nur über http(s)', () => {
  assert.deepEqual(neuerPirat(chat('Mia', {}, { profilePic: 'https://static-cdn.jtvnw.net/x.png' }), opt),
    { id: 'twitch:Mia', name: 'Mia', bild: 'https://static-cdn.jtvnw.net/x.png' });
  assert.equal(neuerPirat(chat('Mia', {}, { profilePic: 'javascript:alert(1)' }), opt)!.bild, '');
});

test('neuerPirat: nur echte Erste, keine Replays, nur Chat', () => {
  assert.equal(neuerPirat(chat('Mia', { firstOfUser: false }), opt), null);
  assert.equal(neuerPirat(chat('Mia', { firstOfUser: undefined }), opt), null);
  assert.equal(neuerPirat(chat('Mia', { sticky: true }), opt), null, 'Replay nach Neuladen');
  assert.equal(neuerPirat(chat('Mia', { type: 'follow' }), opt), null);
});

test('neuerPirat: Plattform-Filter — ohne Plattform (Test-Knopf) zählt immer', () => {
  assert.equal(neuerPirat(chat('Mia', { plattform: 'tiktok' }), opt), null);
  assert.ok(neuerPirat(chat('Mia', { plattform: undefined }), opt));
  assert.ok(neuerPirat(chat('Mia', { plattform: 'tiktok' }), { ...opt, plattform: 'alle' }));
  assert.ok(neuerPirat(chat('Mia', { plattform: 'tiktok' }), { ...opt, plattform: 'tiktok' }));
});

test('neuerPirat: Anonym, Streamer und Bots bleiben draußen (Name oder Login, Groß/klein egal)', () => {
  assert.equal(neuerPirat({ ...chat('Anonym'), user: { id: 'twitch:anonym', nickname: 'Anonym' } }, opt), null);
  assert.equal(neuerPirat(chat('ExE', {}, { isBroadcaster: true }), opt), null);
  assert.equal(neuerPirat(chat('NIGHTBOT'), opt), null);
  assert.equal(neuerPirat(chat('Der Moo', {}, { userId: 'moobot' }), opt), null);
  assert.equal(neuerPirat(chat('streamelements'), opt), null);
  const eigen = { ...opt, ignorieren: ignorierListe('MeinBot, @Kumpel') };
  assert.equal(neuerPirat(chat('kumpel'), eigen), null);
  assert.ok(neuerPirat(chat('Nightbot'), eigen), 'eigene Liste ersetzt die Standardliste');
});

test('ignorierListe: Liste, Text mit Komma/Strich/Zeile, nichts → Standard', () => {
  assert.deepEqual(ignorierListe(['A', ' b ', 3, '']), ['a', 'b']);
  assert.deepEqual(ignorierListe('A, B|C\nD'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ignorierListe(undefined), ['streamelements', 'nightbot', 'moobot']);
  assert.deepEqual(ignorierListe(''), []);
});

test('neuerPirat: Kaputtes wirft nie', () => {
  for (const e of [null, 'x', {}, { type: 'chat', firstOfUser: true }, { type: 'chat', firstOfUser: true, user: {} }, { type: 'chat', firstOfUser: true, user: { id: 'x' } }]) {
    assert.equal(neuerPirat(e, opt), null, JSON.stringify(e));
  }
});

function baue(props: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  const root = (globalThis as any).document.createElement('div') as FakeElement;
  const w: any = new NeuerPirat(root, props, ctx);
  return { root, w };
}

test('Widget: zeigt den ersten, stellt weitere an, ohne Doppelte', () => {
  const { root, w } = baue();
  assert.equal(root.querySelectorAll('.bx-np-schild').length, 0, 'ruhig, bis jemand kommt');
  w.onEvent(chat('Mia'));
  assert.equal(w.aktuell.name, 'Mia');
  assert.equal(root.querySelector('.bx-np-titel')!.textContent, 'NEUER PIRAT AN BORD!');
  w.onEvent(chat('Mia'));
  w.onEvent(chat('Kalle'));
  w.onEvent(chat('Kalle'));
  assert.deepEqual(w.schlange.map((x: any) => x.name), ['Kalle']);
  w.destroy();
  assert.equal(root.querySelector('.bx-np'), null);
  w.onEvent(chat('Nach')); // wirft nicht
});

test('Widget: Vorschau zeigt sofort ein Schild, eigener Titel, echter Gast beendet die Vorführung', () => {
  const { root, w } = baue({ titel: 'Willkommen an Deck!' }, { preview: true });
  assert.ok(root.querySelector('.bx-np-schild'), 'Editor zeigt etwas');
  assert.equal(root.querySelector('.bx-np-titel')!.textContent, 'Willkommen an Deck!');
  assert.ok(w.demoTimer);
  w.onEvent(chat('Echt'));
  assert.equal(w.demoTimer, null);
  w.destroy();
});
