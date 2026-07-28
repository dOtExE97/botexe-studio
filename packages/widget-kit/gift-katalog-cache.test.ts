// Beweist: Alle Widgets eines Overlays teilen sich EINEN Katalog-Abruf.
//
// Warum das zählt: Seit der Katalog alle 5000+ TikTok-Geschenke kennt, sind das
// rund 860 KB pro Abruf. Fünf Widget-Arten holen ihn; bei mehreren Widgets in
// zwei Overlay-Quellen (OBS + TikTok Live Studio) wären das mehrere Megabyte
// und ebenso oft JSON-Verarbeitung — jedes Mal mit demselben Ergebnis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ladeGiftKatalog, vergissGiftKatalog } from './gift-rules.js';

test('gift-catalog wird pro Overlay nur EINMAL geholt, egal wie viele Widgets fragen', async () => {
  vergissGiftKatalog();
  let abrufe = 0;
  (globalThis as { fetch?: unknown }).fetch = () => {
    abrufe++;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ rose: { slug: 'Rose', icon: 'x' } }) });
  };

  // Fünf Widgets fragen gleichzeitig — so wie beim Overlay-Start.
  const alle = await Promise.all([
    ladeGiftKatalog('http://x', 't'),
    ladeGiftKatalog('http://x', 't'),
    ladeGiftKatalog('http://x', 't'),
    ladeGiftKatalog('http://x', 't'),
    ladeGiftKatalog('http://x', 't'),
  ]);

  assert.equal(abrufe, 1, `nur ein Abruf erwartet, waren ${abrufe}`);
  // Und alle bekommen dieselben Daten (nicht fünf Momentaufnahmen).
  for (const k of alle) assert.equal((k as Record<string, { slug: string }>).rose?.slug, 'Rose');

  // Ein späterer Nachzügler (Widget wird erst später eingeblendet) auch.
  await ladeGiftKatalog('http://x', 't');
  assert.equal(abrufe, 1, 'auch ein spaeter dazukommendes Widget loest keinen zweiten Abruf aus');
});

test('Fehlschlag liefert leeren Katalog statt zu werfen (Widget zeigt Platzhalter)', async () => {
  vergissGiftKatalog();
  (globalThis as { fetch?: unknown }).fetch = () => Promise.reject(new Error('offline'));
  const k = await ladeGiftKatalog('http://x', 't');
  assert.deepEqual(k, {}, 'leeres Objekt, damit die Widgets weiterlaufen');
});
