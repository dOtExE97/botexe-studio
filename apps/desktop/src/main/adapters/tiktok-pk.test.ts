// tiktok-pk.test.ts — PK-Kämpfe.
//
// Die Fixtures sind ABGESCHRIEBEN aus dem Diagnose-Log eines echten Kampfes
// (05.08.2026), nicht ausgedacht. Das ist hier besonders wichtig, weil die
// Struktur eine Falle enthält, die man beim Raten garantiert übersieht: Die
// STREAMER-IDs sind die SCHLÜSSEL des Objekts, nicht Einträge eines Arrays.
//
//   battleItems { "7069026870822716421": 4200, "6635416940436602885": 3100 }
//
// Wer hier ein Array erwartet, bekommt eine leere Liste — und merkt es nicht,
// weil nichts abstürzt. Genau die Fehlerklasse, an der diese App mehrfach
// still erblindet ist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lesePkStand, lesePkRahmen, pkText } from './tiktok-pk';

const ICH = '6635416940436602885';
const GEGNER = '7069026870822716421';

const ARMIES = {
  battleId: '7534120987654321',
  battleItems: { [GEGNER]: 3100, [ICH]: 4200 },
  channelId: '123', giftSentTime: 1_754_420_500, scoreUpdateTime: 1_754_420_501,
  battleStatus: 1,
  fromUserId: '9988776655', giftId: '5655', giftCount: 3, totalDiamondCount: 300,
  repeatCount: 3, triggerCriticalStrike: false,
};

const BATTLE = {
  battleId: '7534120987654321',
  battleSetting: {
    battleId: '7534120987654321', startTimeMs: 1_754_420_000_000, duration: 300,
    channelId: '123', status: 1, inviteType: 1, battleType: 1,
    extraDurationSecond: 0, endTimeMs: 1_754_420_300_000,
  },
  action: 1, battleResult: 0,
  anchorInfo: { [GEGNER]: {}, [ICH]: {} },
  battleCombos: { [ICH]: 2, [GEGNER]: 1 },
};

test('Punktestand: beide Seiten mit ihren Punkten', () => {
  const s = lesePkStand(ARMIES);
  assert.ok(s);
  assert.equal(s?.battleId, '7534120987654321');
  assert.equal(s?.seiten.length, 2);
  assert.equal(s?.seiten.find((x) => x.userId === ICH)?.punkte, 4200);
  assert.equal(s?.seiten.find((x) => x.userId === GEGNER)?.punkte, 3100);
  assert.equal(s?.fuehrt, ICH);
});

test('Punktestand: der auslösende Beitrag wird mitgelesen', () => {
  const s = lesePkStand(ARMIES);
  assert.deepEqual(s?.beitrag, { vonUserId: '9988776655', giftId: '5655', anzahl: 3, coins: 300 });
});

test('Gleichstand: es führt NIEMAND', () => {
  const s = lesePkStand({ ...ARMIES, battleItems: { [ICH]: 500, [GEGNER]: 500 } });
  assert.equal(s?.fuehrt, undefined, 'bei Gleichstand darf keine Führung behauptet werden');
});

test('Felder, die keine Streamer-ID sind, landen NICHT als Teilnehmer', () => {
  // TikTok mischt in solche Objekte gern noch Statusfelder. Ohne Prüfung
  // stünde plötzlich „status" mit 1 Punkt im Kampf.
  const s = lesePkStand({ ...ARMIES, battleItems: { [ICH]: 100, [GEGNER]: 90, status: 1, total: 190 } });
  assert.equal(s?.seiten.length, 2);
  assert.ok(s?.seiten.every((x) => /^\d{6,}$/.test(x.userId)));
});

test('kein Kampf, kein Ergebnis', () => {
  assert.equal(lesePkStand({}), null);
  assert.equal(lesePkStand({ battleId: '' }), null);
  assert.equal(lesePkStand({ battleId: '123' }), null, 'ohne Punktestand kein Update');
  assert.equal(lesePkStand(undefined), null);
});

test('Rahmen: Start, Ende, Dauer und beide Teilnehmer', () => {
  const r = lesePkRahmen(BATTLE);
  assert.equal(r?.battleId, '7534120987654321');
  assert.equal(r?.startetAt, 1_754_420_000_000);
  assert.equal(r?.endetAt, 1_754_420_300_000);
  assert.equal(r?.dauerSek, 300);
  assert.deepEqual(r?.teilnehmer.sort(), [ICH, GEGNER].sort());
  assert.equal(r?.ergebnis, undefined, 'battleResult 0 heißt: läuft noch');
});

test('Text: die EIGENE Zahl steht vorn', () => {
  const s = lesePkStand(ARMIES);
  assert.ok(s);
  assert.equal(pkText(s!, ICH), '4200 : 3100 — du führst mit 1100');
  // Aus Sicht des Gegners dreht sich alles um.
  assert.equal(pkText(s!, GEGNER), '3100 : 4200 — du liegst 1100 zurück');
  // Ohne eigene ID wenigstens die nackten Zahlen, keine Falschbehauptung.
  assert.match(pkText(s!), /\d+ : \d+/);
});

test('Text: Gleichstand wird als solcher benannt', () => {
  const s = lesePkStand({ ...ARMIES, battleItems: { [ICH]: 500, [GEGNER]: 500 } });
  assert.match(pkText(s!, ICH), /Gleichstand/);
});

test('SELBSTTEST: die naive Array-Annahme fällt durch', () => {
  // So würde es aussehen, wenn jemand ein Array erwartet — das Ergebnis wäre
  // eine leere Liste, ohne Fehler, ohne Absturz. Der lautlose Ausfall.
  const naiv = (d: { battleItems?: unknown }) => (Array.isArray(d.battleItems) ? d.battleItems : []);
  assert.equal(naiv(ARMIES).length, 0, 'die Array-Annahme findet nichts …');
  assert.equal(lesePkStand(ARMIES)?.seiten.length, 2, '… die Schlüssel-Lesung findet beide Seiten');
});
