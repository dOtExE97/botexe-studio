import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGiftSounds, findWheelSounds } from './widget-sounds';
import type { OverlayLayout } from '@botexe/overlay-engine';

function layout(layers: Array<Partial<OverlayLayout['layers'][number]>>): OverlayLayout {
  return {
    schemaVersion: 1, id: 'l1', name: 'L', canvas: { width: 1080, height: 1920, background: 'transparent' },
    createdAt: '', updatedAt: '',
    layers: layers.map((l, i) => ({ id: `x${i}`, widgetType: 'gift-fireworks', name: '', x: 0, y: 0, w: 1, h: 1, z: 1, visible: true, props: {}, ...l })),
  } as OverlayLayout;
}

test('collectGiftSounds: Alert-Sound ab minCoins, dedupliziert über Profile', () => {
  const layouts = [
    layout([{ widgetType: 'gift-alert', props: { soundId: 'tada.mp3', minCoins: 100 } }]),
    layout([{ widgetType: 'gift-alert', props: { soundId: 'tada.mp3', minCoins: 100 } }]), // Duplikat
  ];
  assert.deepEqual(collectGiftSounds(layouts, 500), ['tada.mp3']);
  assert.deepEqual(collectGiftSounds(layouts, 50), []); // unter minCoins
});

test('collectGiftSounds: Feuerwerk spielt NICHT server-seitig (Widget-getrieben, getimter Boom)', () => {
  const layouts = [layout([{ widgetType: 'gift-fireworks', props: { soundId: 'boom.mp3' } }])];
  assert.deepEqual(collectGiftSounds(layouts, 1000), []);
});

test('collectGiftSounds: unsichtbare Layer und Widgets ohne Sound zählen nicht', () => {
  const layouts = [
    layout([
      { widgetType: 'gift-alert', visible: false, props: { soundId: 'tada.mp3' } },
      { widgetType: 'gift-alert', props: {} },
    ]),
  ];
  assert.deepEqual(collectGiftSounds(layouts, 1000), []);
});

test('findWheelSounds: liefert spin/result-Sound + Drehdauer des Ziel-Rads', () => {
  const layouts = [
    layout([{ id: 'wheel-1', widgetType: 'wheel', props: { spinSoundId: 'spin.mp3', resultSoundId: 'win.mp3', spinMs: 4000 } }]),
  ];
  assert.deepEqual(findWheelSounds(layouts, 'wheel-1'), { spin: 'spin.mp3', result: 'win.mp3', spinMs: 4000 });
  assert.equal(findWheelSounds(layouts, 'gibtsnicht'), null);
});
