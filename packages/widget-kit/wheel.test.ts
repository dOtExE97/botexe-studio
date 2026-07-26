// wheel.test.ts — segmentsFromRules (DOM-frei) absichern: die Radfelder sollen
// bei Quelle "trigger" aus den Geschenk-Trigger-Regeln kommen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentsFromRules } from './wheel.js';

test('segmentsFromRules nimmt die Trigger-Texte als Radfelder', () => {
  const rules = [
    { enabled: true, event: 'gift', name: 'Songwunsch',
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [] },
    { enabled: true, event: 'gift', name: 'Konfetti',
      conditions: [{ kind: 'gift_slug_is', value: 'rose' }], actions: [] },
  ];
  assert.deepEqual(segmentsFromRules(rules), ['Songwunsch', 'Konfetti']);
});
