// goal-countdown.test.ts — reine View-Logik des Ziel-Countdowns (DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalCountdownView } from './goal-countdown.js';

const T = 'Noch {n} {label} bis zum Ziel!';

test('zeigt verbleibende Zahl (deutsch formatiert) + Label, nicht done', () => {
  const v = goalCountdownView(0, 50000, T, 'Likes', 'Ziel erreicht!');
  assert.equal(v.done, false);
  assert.match(v.html, /Noch <span class="bx-gcd-n">50\.000<\/span> Likes bis zum Ziel!/);
});

test('rechnet Rest korrekt', () => {
  const v = goalCountdownView(1200, 5000, T, 'Follower', 'fertig');
  assert.match(v.html, />3\.800</); // 5000-1200
});

test('Ziel erreicht → done + doneText', () => {
  const v = goalCountdownView(5000, 5000, T, 'Likes', 'Ziel erreicht! 🎉');
  assert.equal(v.done, true);
  assert.equal(v.html, 'Ziel erreicht! 🎉');
  // auch bei Überschreitung
  assert.equal(goalCountdownView(6000, 5000, T, 'Likes', 'fertig').done, true);
});

test('{target}-Platzhalter + HTML im Template wird escaped (kein XSS)', () => {
  const v = goalCountdownView(0, 1000, 'von {target} — <b>hi</b>', 'Likes', 'x');
  assert.match(v.html, /von 1\.000/);
  assert.match(v.html, /&lt;b&gt;hi&lt;\/b&gt;/); // escaped
});
