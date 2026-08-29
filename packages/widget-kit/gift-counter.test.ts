// gift-counter.test.ts — Ziel-Logik bei Erreichen (DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onGiftGoalReached, findGiftIcon, anzeigeKlassen, STILE, EIGENES_MASS, studioSchichten, sichereBildAdresse } from './gift-counter.js';

test('findGiftIcon: Icon per lowercase-Slug (Katalog-Key ODER entry.slug), sonst leer', () => {
  const cat = {
    galaxy: { slug: 'Galaxy', icon: 'galaxy.png', coins: 1000 },
    rose: { slug: 'Rose', icon: 'rose.png' },
  };
  assert.equal(findGiftIcon(cat, 'galaxy'), 'galaxy.png');
  assert.equal(findGiftIcon(cat, 'Galaxy'), 'galaxy.png', 'case-insensitiv');
  assert.equal(findGiftIcon(cat, 'rose'), 'rose.png');
  assert.equal(findGiftIcon(cat, 'unbekannt'), '');
  assert.equal(findGiftIcon(cat, ''), '');
  // Fallback: Key passt nicht, aber entry.slug schon.
  assert.equal(findGiftIcon({ 'k1': { slug: 'Galaxy', icon: 'g.png' } }, 'galaxy'), 'g.png');
});

test('raise: Ziel um die Schrittweite erhöhen, Zähler läuft weiter', () => {
  assert.deepEqual(onGiftGoalReached(15, 15, 15, 'raise'), { count: 15, target: 30 });
  assert.deepEqual(onGiftGoalReached(32, 30, 15, 'raise'), { count: 32, target: 45 });
});

test('reset: Zähler auf 0, Ziel bleibt', () => {
  assert.deepEqual(onGiftGoalReached(15, 15, 15, 'reset'), { count: 0, target: 15 });
});

test('keep (Default): nichts ändern', () => {
  assert.deepEqual(onGiftGoalReached(15, 15, 15, 'keep'), { count: 15, target: 15 });
  assert.deepEqual(onGiftGoalReached(15, 15, 15, 'irgendwas'), { count: 15, target: 15 });
});

test('Schrittweite ungültig/0 → Ziel bleibt auch bei raise (kein Stillstand-Bug)', () => {
  assert.deepEqual(onGiftGoalReached(15, 15, 0, 'raise'), { count: 15, target: 15 });
});

// ── Anzeige-Schalter (Titel / Zählerstand / Fortschrittsring) ───────────────
test('ohne Angabe bleibt alles sichtbar — bestehende Overlays ändern sich nicht', () => {
  assert.deepEqual(anzeigeKlassen({}), []);
  assert.deepEqual(anzeigeKlassen(undefined), []);
  // Auch ein ausdrückliches true darf nichts ausblenden.
  assert.deepEqual(anzeigeKlassen({ showTitle: true, showCount: true, showRing: true }), []);
});

test('jeder Schalter blendet genau sein Teil aus', () => {
  assert.deepEqual(anzeigeKlassen({ showTitle: false }), ['ohne-titel']);
  assert.deepEqual(anzeigeKlassen({ showCount: false }), ['ohne-zaehler']);
  assert.deepEqual(anzeigeKlassen({ showRing: false }), ['ohne-ring']);
});

test('Titel und Zähler aus → nur das Geschenk, und es füllt die Box', () => {
  assert.deepEqual(anzeigeKlassen({ showTitle: false, showCount: false }), ['ohne-titel', 'ohne-zaehler', 'nur-icon']);
  // Der Ring darf dabei bleiben — „nur-icon" hängt nicht an ihm.
  assert.ok(!anzeigeKlassen({ showTitle: false, showCount: false }).includes('ohne-ring'));
});

test('nur der Zähler aus (der gemeldete Wunsch) lässt den Titel stehen', () => {
  const k = anzeigeKlassen({ showCount: false });
  assert.ok(!k.includes('nur-icon'), 'mit Titel ist es nicht „nur das Geschenk"');
});

// ── Stile: Auswahlfeld, Code und CSS müssen sich decken ────────────────────
// Drei Listen sagen dasselbe: STILE (was der Code annimmt), das Auswahlfeld in
// widget-types.ts (was der Nutzer wählen kann) und die CSS-Regeln (was man
// sieht). Läuft eine davon weg, gibt es entweder einen Eintrag ohne Wirkung
// oder ein fertiges Design, das niemand auswählen kann. Der Katalog liegt in
// TypeScript im anderen Paket — deshalb wird er hier als Text gelesen.
test('jeder Stil steht im Auswahlfeld UND hat eigene CSS-Regeln', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const hier = dirname(fileURLToPath(import.meta.url));

  const katalog = readFileSync(join(hier, '../../apps/desktop/src/renderer/pages/widget-types.ts'), 'utf-8');
  const block = katalog.slice(katalog.indexOf("type: 'gift-counter'"), katalog.indexOf("type: 'gift-fireworks'"));
  assert.ok(block.length > 0, 'gift-counter im Katalog nicht gefunden — Test anpassen');
  // Nur der Stil-Block — sonst zaehlt der Test die Optionen von
  // „Bei Zielerreichung" (raise/reset/keep) mit.
  const stilBlock = block.slice(block.indexOf('styleField(['), block.indexOf(']),'));
  // Bindestrich mit erlauben: Stilwerte wie „karte-voll" wären sonst
  // unsichtbar für den Test — der wäre grün, während der Eintrag fehlt.
  const imFeld = [...stilBlock.matchAll(/\{ value: '([a-z-]+)', label:/g)].map((m) => m[1]);

  assert.deepEqual([...STILE].sort(), [...imFeld].sort(),
    `Auswahlfeld (${imFeld.join(', ')}) und STILE (${STILE.join(', ')}) laufen auseinander`);

  const quelle = readFileSync(join(hier, 'gift-counter.js'), 'utf-8');
  // 'glas' ist der Standard und braucht keine eigene Klasse — er IST die Grundregel.
  const ohneCss = STILE.filter((s) => s !== 'glas' && !quelle.includes(`.bx-gco-${s} `));
  assert.deepEqual(ohneCss, [], `Stil wählbar, sieht aber aus wie der Standard: ${ohneCss.join(', ')}`);
});

// ── Stil „Studio": aus einem flachen Bild einen Körper bauen ───────────────
test('studioSchichten: Kopien von HINTEN nach VORNE, damit die vorderste oben liegt', () => {
  const html = studioSchichten(4);
  const reihenfolge = [...html.matchAll(/--i:(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(reihenfolge, [3, 2, 1, 0], 'sonst verdeckt eine dunkle Kopie die farbige');
  assert.ok(html.includes('bx-gco-glanz'), 'der wandernde Lichtstreif fehlt');
  assert.ok(html.includes('bx-gco-spiegel'), 'die Spiegelung fehlt');
});

test('studioSchichten: Anzahl bleibt in vernünftigen Grenzen', () => {
  const zaehle = (h: string) => [...h.matchAll(/--i:/g)].length;
  assert.equal(zaehle(studioSchichten(0)), 12, 'ungültig → Standardtiefe');
  assert.equal(zaehle(studioSchichten(1)), 2, 'unter 2 ergibt keinen Körper');
  assert.equal(zaehle(studioSchichten(500)), 20, 'nach oben gedeckelt, sonst 500 Bilder im Baum');
});

test('sichereBildAdresse: nichts, was url(…) vorzeitig schließen könnte', () => {
  // Die Adresse landet in einer CSS-Anweisung. Käme aus dem Netz ein
  // Anführungszeichen oder eine Klammer, stünde der Rest als CSS im Dokument.
  assert.equal(sichereBildAdresse('https://x.tiktokcdn.com/a/rose.webp'), 'https://x.tiktokcdn.com/a/rose.webp');
  assert.equal(sichereBildAdresse('a"); body{display:none} /*'), 'a);body{display:none}/*'.replace(/[")(]/g, ''));
  assert.equal(sichereBildAdresse(undefined), '');
  for (const zeichen of ['"', "'", '(', ')', '\\', ' ', '\n']) {
    assert.ok(!sichereBildAdresse(`a${zeichen}b`).includes(zeichen), `${JSON.stringify(zeichen)} bleibt stehen`);
  }
});

// ── Wächter: „nur das Geschenk" darf keine Anordnung zerreißen ─────────────
// Sind Titel und Zählerstand aus, vergrößert eine Regel den Bildrahmen auf die
// ganze Box. Für Stile, die ihren Rahmen SELBST bemessen (Sammelkarte, Rakete,
// Zeile, die Bühnen-Stile …), ist das falsch: gemessen schrumpfte das
// Kartenfenster auf ein Quadrat und darunter blieb die halbe Karte leer.
// Sie stehen deshalb in EIGENES_MASS und werden von der Regel ausgenommen.
// Dieser Test liest die Liste aus dem CSS zurück, damit sie beim nächsten
// neuen Stil nicht vergessen wird.
test('EIGENES_MASS enthält jeden Stil, der seinen Bildrahmen selbst bemisst', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const quelle = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'gift-counter.js'), 'utf-8');

  // „bx-gco-koerper-buehne" ist keine Stil-Klasse, sondern die gemeinsame Bühne
  // der drei aufwendigen Stile — sie steht für alle drei.
  const AUFLOESUNG: Record<string, string[]> = { 'koerper-buehne': ['studio', 'vitrine', 'museum'] };

  const gefunden = new Set<string>();
  for (const m of quelle.matchAll(/\.bx-gco-([a-z-]+)[^{;]*?\.bx-gco-iconwrap[^{]*\{([^}]*)\}/g)) {
    // Nur echte Stile zählen. Sonst meldet sich die Markierungs-Klasse
    // bx-gco-eigenmass selbst als Stil — sie steht in genau der Regel, um die
    // es hier geht (.bx-gco.nur-icon:not(.bx-gco-eigenmass) …).
    const name = m[1] as string;
    if (!(name in AUFLOESUNG) && !STILE.includes(name)) continue;
    if (!/(^|[;\s])width\s*:/.test(m[2] as string)) continue;
    for (const s of AUFLOESUNG[name] ?? [name]) gefunden.add(s);
  }

  assert.ok(gefunden.size > 0, 'keine einzige Regel gefunden — Muster stimmt nicht mehr');
  const fehlen = [...gefunden].filter((s) => !EIGENES_MASS.has(s));
  assert.deepEqual(fehlen, [], `Diese Stile bemessen ihren Bildrahmen selbst, stehen aber nicht in EIGENES_MASS: ${fehlen.join(', ')}`);
  const zuviel = [...EIGENES_MASS].filter((s) => !gefunden.has(s));
  assert.deepEqual(zuviel, [], `Stehen in EIGENES_MASS, bemessen aber nichts selbst: ${zuviel.join(', ')}`);
});
