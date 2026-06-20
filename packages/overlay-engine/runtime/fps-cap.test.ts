// fps-cap.test.ts — globaler requestAnimationFrame-Drossel auf ~60fps.
// Kernanforderung (Regression aus v0.3.5): bei echten 60Hz darf KEIN Frame
// verschluckt werden (sonst landet man bei 30), bei 144Hz sauber auf ~60
// runter, und mehrere Callbacks eines erlaubten Frames laufen GEMEINSAM
// (kein gegenseitiges Ausspielen durch ein geteiltes Zeitfenster).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRafThrottle } from './fps-cap.js';

/** Mini-Display: sammelt angemeldete native-rAF-Callbacks und feuert sie auf
 *  „VSync" mit kontrolliertem Zeitstempel — simuliert den Browser. */
function makeDisplay() {
  let queue: Array<(t: number) => void> = [];
  const raf = (cb: (t: number) => void) => { queue.push(cb); return queue.length; };
  const caf = () => { /* Test bricht nicht ab */ };
  const vsync = (t: number) => { const cur = queue; queue = []; for (const cb of cur) cb(t); };
  return { raf, caf, vsync };
}

const MIN = 1000 / 61; // Ziel ~60fps mit etwas Toleranz unter 60

test('60Hz: jeder Frame wird gerendert (keine Halbierung)', () => {
  const d = makeDisplay();
  const thr = createRafThrottle(d.raf, d.caf, MIN);
  let renders = 0;
  const anim = () => { renders++; thr.request(anim); }; // Dauer-rAF-Loop
  thr.request(anim);
  const N = 30;
  for (let f = 0; f < N; f++) d.vsync(f * (1000 / 60));
  assert.equal(renders, N, `bei 60Hz müssen alle ${N} Frames rendern, waren ${renders}`);
});

test('144Hz: gedeckelt auf ~60fps (nicht 48, nicht 72)', () => {
  const d = makeDisplay();
  const thr = createRafThrottle(d.raf, d.caf, MIN);
  let renders = 0;
  const anim = () => { renders++; thr.request(anim); };
  thr.request(anim);
  const N = 144; // 1 Sekunde bei 144Hz
  for (let f = 0; f < N; f++) d.vsync(f * (1000 / 144));
  // 1 Sekunde → ~60 Renders (Toleranz für Quantisierung)
  assert.ok(renders >= 58 && renders <= 62, `~60fps erwartet, waren ${renders}`);
});

test('knapp-zu-früher Frame wird dank Toleranz NICHT verworfen (Regression v0.3.5)', () => {
  // Genau der Bug: ein VSync minimal unter MIN (Jitter) darf nicht den ganzen
  // nächsten Frame-Slot kosten.
  const d = makeDisplay();
  const thr = createRafThrottle(d.raf, d.caf, MIN);
  let renders = 0;
  const anim = () => { renders++; thr.request(anim); };
  thr.request(anim);
  d.vsync(0);            // Frame 1 → rendert
  d.vsync(MIN - 0.3);    // minimal zu früh, aber innerhalb Toleranz → muss rendern
  assert.equal(renders, 2, 'der knapp zu frühe Frame muss trotzdem rendern');
});

test('mehrere Callbacks eines erlaubten Frames laufen GEMEINSAM', () => {
  // Ein geteiltes Zeitfenster darf Widget B nicht blockieren, nur weil Widget A
  // im selben Frame schon gerendert hat.
  const d = makeDisplay();
  const thr = createRafThrottle(d.raf, d.caf, MIN);
  let a = 0; let b = 0;
  thr.request(() => { a++; });
  thr.request(() => { b++; });
  d.vsync(0);
  assert.equal(a, 1, 'Callback A muss laufen');
  assert.equal(b, 1, 'Callback B muss im selben Frame laufen');
});

test('cancel: ein abgemeldeter Callback läuft nicht', () => {
  const d = makeDisplay();
  const thr = createRafThrottle(d.raf, d.caf, MIN);
  let ran = false;
  const id = thr.request(() => { ran = true; });
  thr.cancel(id);
  d.vsync(0);
  assert.equal(ran, false, 'gecancelter Callback darf nicht feuern');
});

test('nach langer Pause (Tab-Stall) wird der Takt resynct, kein Burst', () => {
  const d = makeDisplay();
  const thr = createRafThrottle(d.raf, d.caf, MIN);
  let renders = 0;
  const anim = () => { renders++; thr.request(anim); };
  thr.request(anim);
  d.vsync(0);        // rendert, renders=1
  d.vsync(5000);     // 5s später (Stall) → genau EIN Render, kein Nachhol-Burst
  assert.equal(renders, 2, 'nach Stall genau ein Render, kein aufgestauter Burst');
});
