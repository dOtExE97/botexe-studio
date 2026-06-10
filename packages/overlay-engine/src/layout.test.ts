import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout, createDefaultLayout, type OverlayLayout } from './index';

function validLayout(): OverlayLayout {
  return {
    schemaVersion: 1,
    id: 'layout-1',
    name: 'Mein Stream-Overlay',
    canvas: { width: 1920, height: 1080, background: 'transparent' },
    layers: [
      {
        id: 'layer-1',
        widgetType: 'gift-alert',
        name: 'Gift Alert',
        x: 100,
        y: 100,
        w: 400,
        h: 200,
        z: 1,
        visible: true,
        props: { theme: 'neon' },
      },
    ],
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
  };
}

test('valides layout passiert die validierung', () => {
  const result = validateLayout(validLayout());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.layout.id, 'layout-1');
});

test('fehlende pflichtfelder werden abgelehnt', () => {
  const broken = validLayout() as unknown as Record<string, unknown>;
  delete broken.canvas;
  const result = validateLayout(broken);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.length > 0);
});

test('falsche feldtypen werden abgelehnt (KI-halluzination: x als string)', () => {
  const broken = validLayout();
  (broken.layers[0] as unknown as Record<string, unknown>).x = 'abc';
  const result = validateLayout(broken);
  assert.equal(result.ok, false);
});

test('layers muss array sein — string wird abgelehnt', () => {
  const broken = validLayout() as unknown as Record<string, unknown>;
  broken.layers = 'kaputt';
  assert.equal(validateLayout(broken).ok, false);
});

test('doppelte layer-ids werden abgelehnt', () => {
  const broken = validLayout();
  broken.layers.push({ ...broken.layers[0]! });
  const result = validateLayout(broken);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join(' '), /layer-id/i);
});

test('unbekannte schemaVersion wird abgelehnt', () => {
  const broken = validLayout() as unknown as Record<string, unknown>;
  broken.schemaVersion = 99;
  assert.equal(validateLayout(broken).ok, false);
});

test('non-object input (null, string) wird sauber abgelehnt statt zu werfen', () => {
  assert.equal(validateLayout(null).ok, false);
  assert.equal(validateLayout('{}').ok, false);
  assert.equal(validateLayout(undefined).ok, false);
});

test('createDefaultLayout erzeugt valides layout mit transparentem 1920x1080-canvas', () => {
  const layout = createDefaultLayout('Test');
  const result = validateLayout(layout);
  assert.equal(result.ok, true);
  assert.equal(layout.name, 'Test');
  assert.equal(layout.canvas.width, 1920);
  assert.equal(layout.canvas.height, 1080);
  assert.equal(layout.canvas.background, 'transparent');
});
