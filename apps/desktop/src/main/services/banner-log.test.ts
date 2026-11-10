// banner-log.test.ts — die Logzeilen, die das erste Live mit dem Ereignis-Alarm
// belegen sollen (LIVE-Ziel nur an der Flanke, Truhe mit envelopeId).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { log, merkerLeeren } from '../core/logger';
import { logBannerEreignis } from './banner-log';

function mitschreiben() {
  const info = mock.method(log, 'info', () => undefined);
  const gedrosselt = mock.method(log, 'gedrosselt', () => undefined);
  return {
    info: () => info.mock.calls.map((c) => String(c.arguments[1])),
    gedrosselt: () => gedrosselt.mock.calls.map((c) => String(c.arguments[4])),
    weg: () => { info.mock.restore(); gedrosselt.mock.restore(); },
  };
}

test('LIVE-Ziel: „erreicht" nur an der Flanke, weitere Updates gehen gedrosselt raus', () => {
  merkerLeeren();
  const m = mitschreiben();
  try {
    const ziel = (geradeErreicht: boolean) => ({ type: 'live_ziel' as const, ts: 1, ziel: { id: 'g', fortschritt: 50, ziel: 50, erreicht: true, geradeErreicht, geschenk: { name: 'Rose' } } });
    logBannerEreignis(ziel(true));
    logBannerEreignis(ziel(false));
    logBannerEreignis(ziel(false));
    assert.deepEqual(m.info().filter((z) => z.startsWith('LIVE-Ziel erreicht')), ['LIVE-Ziel erreicht: 50/50 Rose — Beitrag von —']);
    assert.equal(m.gedrosselt().filter((z) => z.startsWith('LIVE-Ziel:')).length, 2, 'Zwischenstände über die Drossel');
  } finally { m.weg(); }
});

test('Truhe: Logzeile nennt Art und envelopeId (oder „—")', () => {
  const m = mitschreiben();
  try {
    logBannerEreignis({ type: 'envelope', ts: 1, user: { id: '1', nickname: 'Mia' }, envelope: { coins: 500, winners: 3, superFan: false, businessType: 1, envelopeId: '7345' } });
    logBannerEreignis({ type: 'envelope', ts: 1, envelope: { coins: 1, winners: 0, superFan: false } });
    assert.deepEqual(m.info(), [
      'Schatztruhe von Mia: 500 Coins, 3 Leute (Art 1, ID 7345)',
      'Schatztruhe von —: 1 Coins, 0 Leute (Art ?, ID —)',
    ]);
  } finally { m.weg(); }
});
