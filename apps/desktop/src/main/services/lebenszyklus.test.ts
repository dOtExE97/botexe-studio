import test from 'node:test';
import assert from 'node:assert/strict';
import { darfBeenden, type FensterLage } from './lebenszyklus';

/** Normalfall: Windows, App läuft, Symbol im Infobereich, Weiterlaufen an. */
const lage = (p: Partial<FensterLage> = {}): FensterLage => ({
  hauptfensterErzeugt: true,
  beendetWirklich: false,
  trayLaeuft: true,
  minimizeToTray: true,
  istMac: false,
  ...p,
});

test('Fenster zu, Symbol da → weiterlaufen (Overlays bleiben)', () => {
  assert.equal(darfBeenden(lage()), false);
});

test('„Beenden" gewinnt immer', () => {
  assert.equal(darfBeenden(lage({ beendetWirklich: true })), true);
  assert.equal(darfBeenden(lage({ beendetWirklich: true, istMac: true })), true);
  assert.equal(
    darfBeenden(lage({ beendetWirklich: true, hauptfensterErzeugt: false })), true,
    'auch mitten im Start muss Beenden greifen — sonst hängt ein Prozess',
  );
});

test('Startbild schließt sich vor dem Hauptfenster → NICHT beenden', () => {
  // Der Fall, den der Notaus des Startbilds auslösen kann: 0 Fenster, obwohl
  // die App gerade erst hochkommt. Ohne diese Regel beendet sich die App,
  // bevor sie je sichtbar war.
  assert.equal(darfBeenden(lage({ hauptfensterErzeugt: false, trayLaeuft: false })), false);
});

test('kein Symbol im Infobereich → altes Verhalten, sonst bleibt ein Geisterprozess', () => {
  assert.equal(darfBeenden(lage({ trayLaeuft: false })), true);
});

test('Weiterlaufen abgeschaltet → das X beendet wie früher', () => {
  assert.equal(darfBeenden(lage({ minimizeToTray: false })), true);
});

test('macOS läuft ohne Fenster weiter', () => {
  assert.equal(darfBeenden(lage({ istMac: true, trayLaeuft: false })), false);
});
