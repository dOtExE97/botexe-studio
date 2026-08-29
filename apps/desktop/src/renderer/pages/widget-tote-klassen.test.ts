// Wächter: Spricht ein Widget im CSS eine Klasse an, die es selbst nie vergibt?
//
// Solche Regeln sehen aus wie ein fertiges Design und tun nichts. Der Anlass:
// Der Stil „Neon" des Geschenkzählers gestaltete `.bx-gco-count` und
// `.bx-gco-label` — beide Klassen gab es in dem Widget nie (sie heißen `-prog`
// und `-title`). Ergebnis: „Neon" war Pixel für Pixel derselbe Stil wie „Glas",
// jahrelang, ohne dass es auffiel. Ein Regler ohne Wirkung ist schlimmer als
// gar keiner — der Nutzer stellt um, sieht nichts und sucht den Fehler bei sich.
//
// Der Test ist bewusst großzügig: Alles, was auch nur aussieht wie ein
// zusammengesetzter Klassenname (`'bx-gm-t-' + kachelStil`), zählt als benutzt.
// Lieber ein echter Blindgänger durchgelassen als ein grüner Lauf, dem niemand
// mehr traut.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WIDGET_TYPES } from './widget-types';

const WURZEL = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), '..', '..')
  : process.cwd();
const WK = join(WURZEL, 'packages', 'widget-kit');
const BASIS = readFileSync(join(WK, 'widget-base.css'), 'utf-8');

/** Klassen, die NICHT das Widget vergibt, sondern die Laufzeit oder die Basis. */
const VON_AUSSEN = new Set([
  'bx-frameless', 'bx-premium', 'bx-hit', 'bx-perf',
  'bx-glass', 'bx-sheen', 'bx-shimmer', 'bx-display', 'bx-mono', 'bx-neon',
  'bx-outline', 'bx-av', 'bx-av-img',
]);

/** Alle Werte, die die Auswahlfelder eines Widgets anbieten. Daraus setzen die
 *  Widgets ihre Klassennamen zusammen (`'bx-gco-' + stil`), was im Quelltext
 *  nie als ganzes Wort auftaucht. */
function optionsWerte(typ: string): string[] {
  const raus = new Set<string>();
  for (const d of WIDGET_TYPES.filter((x) => x.type === typ)) {
    for (const f of d.fields ?? []) {
      for (const o of f.options ?? []) if (o.value) raus.add(String(o.value).toLowerCase());
    }
  }
  return [...raus];
}

test('keine CSS-Regel für eine Klasse, die das Widget nie vergibt', () => {
  const tote: string[] = [];
  for (const datei of readdirSync(WK).filter((f) => f.endsWith('.js'))) {
    const quelle = readFileSync(join(WK, datei), 'utf-8');
    // Der CSS-Block: `const CSS = \`` … Zeilenumbruch, Backtick, Semikolon.
    const start = quelle.indexOf('= `\n');
    const ende = start < 0 ? -1 : quelle.indexOf('\n`;', start);
    if (start < 0 || ende < 0) continue;
    // Kommentare raus, sonst zählt eine im Fließtext erwähnte Klasse mit.
    const css = quelle.slice(start, ende).replace(/\/\*[\s\S]*?\*\//g, '');
    const code = quelle.slice(0, start) + quelle.slice(ende);
    const werte = optionsWerte(datei.replace(/\.js$/, ''));

    for (const klasse of new Set([...css.matchAll(/\.(bx-[a-z0-9-]+)/g)].map((m) => m[1] as string))) {
      if (VON_AUSSEN.has(klasse) || BASIS.includes(`.${klasse}`)) continue;
      // Aus einem Einstellungswert zusammengesetzt? Dann ist sie in Ordnung.
      if (werte.some((w) => klasse.endsWith(`-${w}`) || klasse.endsWith(`--${w}`))) continue;
      const kurz = klasse.replace(/^bx-/, '');
      if (new RegExp(`${klasse}\\b|['"\`]${kurz}['"\`]`).test(code)) continue;
      tote.push(`${datei}: .${klasse}`);
    }
  }
  assert.deepEqual(
    tote,
    [],
    `Diese Klassen werden gestaltet, aber nie vergeben — die Regeln tun nichts:\n  ${tote.join('\n  ')}`,
  );
});
