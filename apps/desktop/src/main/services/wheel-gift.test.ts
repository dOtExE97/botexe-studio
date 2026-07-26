import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingWheelSpins } from './wheel-gift';

test('matchingWheelSpins liefert IDs sichtbarer Räder mit passendem spinGift', () => {
  const layers = [
    { id: 'w1', widgetType: 'wheel', visible: true, props: { spinGift: 'galaxy' } },
    { id: 'w2', widgetType: 'wheel', visible: true, props: { spinGift: 'rose' } },
    { id: 'w3', widgetType: 'wheel', visible: false, props: { spinGift: 'galaxy' } }, // unsichtbar
    { id: 'w4', widgetType: 'wheel', visible: true, props: { spinGift: '' } }, // leer = nie
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { spinGift: 'galaxy' } }, // kein Rad
  ];
  assert.deepEqual(matchingWheelSpins(layers, 'galaxy'), ['w1']);
  assert.deepEqual(matchingWheelSpins(layers, 'rose'), ['w2']);
  assert.deepEqual(matchingWheelSpins(layers, 'diamond'), []);
});
