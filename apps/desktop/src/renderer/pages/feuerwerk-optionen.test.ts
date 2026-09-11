// Wächter: Stimmen die AUSWAHLWERTE im Bedienfeld mit denen überein, die das
// Feuerwerk-Widget tatsächlich akzeptiert?
//
// WARUM DAS EINEN EIGENEN TEST BRAUCHT: Der Parity-Wächter nebenan prüft nur,
// ob es zu jeder gelesenen Einstellung ein Feld gibt — nicht, ob die WERTE
// zusammenpassen. Das Widget filtert mit einer Positivliste
// (`['rakete','fontaene','beides'].includes(...)`) und fällt bei allem anderen
// stumm auf den Standard zurück. Schreibt jemand im Panel „fontaene" um oder
// ergänzt dort eine Form, die es im Widget nicht gibt, wählt der Streamer sie
// aus, im Overlay passiert aber die Standard-Sache — ohne Fehler, ohne Hinweis.
// Genau die Sorte Fehler, die diese App schon mehrfach getroffen hat: zwei
// Listen für dieselbe Sache, die auseinanderlaufen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WIDGET_TYPES } from './widget-types';

const WURZEL = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), '..', '..')
  : process.cwd();
const QUELLE = readFileSync(join(WURZEL, 'packages', 'widget-kit', 'gift-fireworks.js'), 'utf-8');

const FEUERWERK = WIDGET_TYPES.find((w) => w.type === 'gift-fireworks');

/** Die Auswahlwerte eines Feldes aus dem Bedienfeld. */
function panelWerte(key: string): string[] {
  const feld = FEUERWERK?.fields?.find((f) => f.key === key);
  assert.ok(feld, `Feld „${key}" fehlt im Bedienfeld`);
  assert.ok(Array.isArray(feld.options), `Feld „${key}" hat keine Auswahlliste`);
  return (feld.options ?? []).map((o) => String(o.value));
}

/** Die Positivliste, mit der das Widget die Einstellung filtert. */
function widgetWerte(prop: string): string[] {
  const m = QUELLE.match(new RegExp(`\\[([^\\]]*)\\]\\.includes\\(props\\.${prop}\\)`));
  assert.ok(m, `Im Widget steht keine Positivliste für props.${prop} — Wächter ins Leere gelaufen`);
  const liste = m[1] ?? '';
  const werte = (liste.match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1));
  assert.ok(werte.length > 0, `Positivliste für props.${prop} konnte nicht gelesen werden`);
  return werte;
}

test('Feuerwerk: „Was aufsteigt" — Panel und Widget kennen dieselben Werte', () => {
  assert.deepEqual(panelWerte('typ').sort(), widgetWerte('typ').sort());
});

test('Feuerwerk: Burst-Formen — Panel und Widget kennen dieselben Werte', () => {
  assert.deepEqual(panelWerte('shape').sort(), widgetWerte('shape').sort());
});

test('Feuerwerk: Optik-Stil — Panel bietet genau die zwei Werte, die das Widget unterscheidet', () => {
  // Der Stil wird nicht über eine Positivliste gefiltert, sondern mit einem
  // Vergleich: alles außer 'pro' ist 'klassisch'. Beides muss im Panel stehen —
  // und 'klassisch' MUSS der Standard bleiben, sonst verändert ein Update die
  // Optik bestehender Overlays.
  assert.deepEqual(panelWerte('stil').sort(), ['klassisch', 'pro']);
  assert.match(QUELLE, /props\.stil === 'pro'/, 'Widget unterscheidet den Stil nicht mehr wie erwartet');
  assert.equal(FEUERWERK?.props?.stil, 'klassisch', 'Standard muss „klassisch" bleiben (bestehende Overlays)');
  assert.equal(FEUERWERK?.props?.typ, 'rakete', 'Standard muss „rakete" bleiben (bestehende Overlays)');
  assert.equal(FEUERWERK?.props?.showPb, false, 'Profilbild standardmäßig AUS (bestehende Overlays)');
});

test('Like-Fontäne: Name standardmäßig AUS — sonst verändert ein Update bestehende Overlays', () => {
  const hr = WIDGET_TYPES.find((w) => w.type === 'heart-rain');
  assert.equal(hr?.props?.showName, false);
});
