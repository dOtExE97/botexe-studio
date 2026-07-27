// OverlayHealthBanner.test.ts — reine Entscheidungs-Logik der drei „Overlay
// ist still tot"-Warnungen, DOM-frei getestet (keine React-Render-Tests im
// Repo — siehe GiftCommandListEditor.test.ts für das gleiche Muster).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPortMismatch,
  isOverlayEmptyWhileLive,
  isTtlsRelevant,
  isTtlsBroken,
  persistedSince,
  graceElapsed,
} from './OverlayHealthBanner';
import { OVERLAY_PORT } from '../../shared/constants';

test('isPortMismatch: nur wahr, wenn der Server NICHT auf dem Standard-Port lauscht', () => {
  assert.equal(isPortMismatch({ port: OVERLAY_PORT }), false);
  assert.equal(isPortMismatch({ port: OVERLAY_PORT + 1 }), true);
});

test('isOverlayEmptyWhileLive: nur wahr, wenn verbunden UND 0 Clients', () => {
  assert.equal(isOverlayEmptyWhileLive({ clientCount: 0, platformConnected: true }), true);
  assert.equal(isOverlayEmptyWhileLive({ clientCount: 0, platformConnected: false }), false, 'nicht live = kein Grund zu warnen');
  assert.equal(isOverlayEmptyWhileLive({ clientCount: 2, platformConnected: true }), false, 'Quelle verbunden = alles gut');
});

test('isTtlsRelevant: hosts-Eintrag ODER schon mal kopiert', () => {
  assert.equal(isTtlsRelevant(false, false), false, 'reiner OBS-Nutzer wird nicht belästigt');
  assert.equal(isTtlsRelevant(true, false), true);
  assert.equal(isTtlsRelevant(false, true), true);
});

test('isTtlsBroken: nur relevant + nicht bereit', () => {
  assert.equal(isTtlsBroken({ ready: false, hostsEntry: false }, false), false, 'nie genutzt → keine Warnung');
  assert.equal(isTtlsBroken({ ready: false, hostsEntry: true }, false), true);
  assert.equal(isTtlsBroken({ ready: true, hostsEntry: true }, false), false, 'löst wieder auf → keine Warnung');
  assert.equal(isTtlsBroken({ ready: false, hostsEntry: false }, true), true, 'vorher kopiert, jetzt kaputt');
});

test('persistedSince: startet den Timer beim ersten Auftreten, hält ihn, resettet bei false', () => {
  assert.equal(persistedSince(false, null, 1000), null);
  const since = persistedSince(true, null, 1000);
  assert.equal(since, 1000);
  assert.equal(persistedSince(true, since, 5000), 1000, 'unverändert, solange weiter wahr');
  assert.equal(persistedSince(false, since, 6000), null, 'Bedingung weg → Timer weg');
});

test('graceElapsed: erst nach Ablauf der Gnadenfrist wahr — kein Nörgeln bei kurzen Aussetzern', () => {
  assert.equal(graceElapsed(null, 10_000, 3000), false);
  assert.equal(graceElapsed(1000, 3000, 3000), false, 'erst 2s vergangen');
  assert.equal(graceElapsed(1000, 4001, 3000), true, 'Gnadenfrist überschritten');
});
