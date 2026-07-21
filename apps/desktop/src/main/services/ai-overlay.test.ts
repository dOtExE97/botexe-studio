import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, sanitizeLayers, buildPrompt } from './ai-overlay';

test('extractJson: schält JSON aus Fences/Text, null bei Müll', () => {
  assert.equal(extractJson('```json\n{"layers":[]}\n```'), '{"layers":[]}');
  assert.equal(extractJson('Hier dein Layout: {"a":1} fertig!'), '{"a":1}');
  assert.equal(extractJson('{"außen":{"innen":2}}'), '{"außen":{"innen":2}}');
  assert.equal(extractJson('kein json hier'), null);
  assert.equal(extractJson(''), null);
});

const CANVAS = { width: 1080, height: 1920 };
const KNOWN = new Set(['chat-box', 'goal-bar']);

test('sanitizeLayers: unbekannte Typen fliegen raus, Zahlen geklemmt, id ergänzt', () => {
  const layers = sanitizeLayers({ layers: [
    { widgetType: 'chat-box', x: 40, y: 1400, w: 400, h: 400, props: { max: 8 } },
    { widgetType: 'hacker-widget', x: 0, y: 0, w: 100, h: 100 },   // erfunden → raus
    { widgetType: 'goal-bar', x: -50, y: 99999, w: 900, h: 90 },   // klemmen
  ] }, KNOWN, CANVAS);
  assert.ok(layers);
  assert.equal(layers.length, 2, 'erfundener Typ entfernt');
  assert.equal(layers[0]?.widgetType, 'chat-box');
  assert.ok(String(layers[0]?.id).length > 0, 'id ergänzt');
  assert.equal(layers[1]?.x, 0, 'negatives x auf 0 geklemmt');
  assert.ok(Number(layers[1]?.y) <= CANVAS.height, 'y in den Canvas geklemmt');
});

test('sanitizeLayers: nur Müll → null (kein leeres Layout speichern)', () => {
  assert.equal(sanitizeLayers({ layers: [{ widgetType: 'nix' }] }, KNOWN, CANVAS), null);
  assert.equal(sanitizeLayers('quatsch', KNOWN, CANVAS), null);
  assert.equal(sanitizeLayers({}, KNOWN, CANVAS), null);
});

test('buildPrompt: enthält Regeln, Katalog, Layout und Wunsch', () => {
  const p = buildPrompt({
    wish: 'Chat in pink unten links',
    layout: { canvas: CANVAS, layers: [{ id: 'l1', widgetType: 'chat-box' }] },
    catalog: [{ type: 'chat-box', label: 'Chat-Box', desc: 'Chat', w: 400, h: 500, props: { max: 8 } }],
  });
  assert.ok(p.includes('NUR mit JSON'));
  assert.ok(p.includes('chat-box'));
  assert.ok(p.includes('Chat in pink unten links'));
  assert.ok(p.includes('HOCHFORMAT'), 'Hochformat-Hinweis bei 1080×1920');
  assert.ok(p.includes('"l1"'), 'aktuelles Layout eingebettet');
});
