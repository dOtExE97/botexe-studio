import test from 'node:test';
import assert from 'node:assert/strict';
import { commandMatches, matchRedemption, type Redemption } from './index';

function red(overrides: Partial<Redemption> = {}): Redemption {
  return {
    id: 'red1',
    name: 'Airhorn',
    command: '!airhorn',
    cost: 100,
    actions: [{ kind: 'play_sound', soundId: 'airhorn.mp3' }],
    enabled: true,
    ...overrides,
  };
}

test('commandMatches: exakter Befehl, mit/ohne !, case-insensitive', () => {
  assert.equal(commandMatches('!airhorn', '!airhorn'), true);
  assert.equal(commandMatches('!AirHorn', 'airhorn'), true);
  assert.equal(commandMatches('!airhorn jetzt', '!airhorn'), true);
  assert.equal(commandMatches('airhorn', '!airhorn'), false); // ohne ! kein Befehl
  assert.equal(commandMatches('!airhornXY', '!airhorn'), false); // kein Teil-Match
  assert.equal(commandMatches('  !airhorn  ', 'airhorn'), true);
});

test('matchRedemption: liefert die erste passende, aktivierte Einlösung', () => {
  const reds = [
    red({ id: 'a', command: '!airhorn' }),
    red({ id: 'b', command: '!hype' }),
  ];
  assert.equal(matchRedemption(reds, '!hype los')?.id, 'b');
  assert.equal(matchRedemption(reds, '!airhorn')?.id, 'a');
  assert.equal(matchRedemption(reds, 'kein befehl'), null);
});

test('matchRedemption: deaktivierte Einlösung matcht nicht', () => {
  const reds = [red({ id: 'a', command: '!airhorn', enabled: false })];
  assert.equal(matchRedemption(reds, '!airhorn'), null);
});
