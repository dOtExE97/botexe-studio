// Wächter gegen die live-poll-Fehlerklasse (Fund 10 im Duplicated-Truth-Audit):
// widget-types.ts (Renderer-Katalog, zeigt dem Nutzer den Standardwert im
// Eigenschaften-Panel) und das jeweilige Widget in packages/widget-kit/*.js
// (was PASSIERT, wenn das Prop in einem alten/importierten Layout FEHLT)
// pflegen denselben Default UNABHÄNGIG voneinander. `live-poll.js` behandelte
// ein fehlendes `autoNewRound` als `true` (`props.autoNewRound !== false`),
// widget-types.ts deklarierte aber `autoNewRound: false` — ein Layout ohne
// diesen Schlüssel bekam ungewollt Endlos-Auto-Runden statt der im UI
// gezeigten "aus"-Stellung.
//
// Scope (bewusst eingegrenzt, siehe Auftrag): NUR der `props.X !== false`/
// `props.X === true`-Boolean-Konventions-Bruch, den auch der echte Bug
// verwendet hat — das lässt sich zuverlässig aus dem JS extrahieren. Ein
// vollständiger Abgleich ALLER Default-Arten (Strings, Zahlen mit anderen
// Fallback-Mustern als `?? N`, verschachtelte Objekte) ist zu fragil für
// Regex-Extraktion und wird hier NICHT geprüft (siehe Report).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');
const REPO_ROOT = join(SRC, '..', '..', '..');
const WIDGET_KIT_DIR = join(REPO_ROOT, 'packages', 'widget-kit');
const WIDGET_TYPES_SRC = readFileSync(join(SRC, 'renderer', 'pages', 'widget-types.ts'), 'utf8');

interface BoolConvention {
  file: string;
  widgetType: string;
  prop: string;
  /** Wert, den das Widget für ein FEHLENDES Prop annimmt. */
  missingMeans: boolean;
}

/** Alle `props.X !== false` (fehlend ⇒ true) / `props.X === true` (fehlend ⇒
 *  false) Vorkommen in den Widget-Kit-.js-Dateien — DIESELBE Konvention, die
 *  den live-poll-Bug verursacht hat. `this.props.X` (media.js) wird durch die
 *  fehlende Anker-Regex ebenfalls erfasst. */
function jsBooleanConventions(): BoolConvention[] {
  const out: BoolConvention[] = [];
  for (const name of readdirSync(WIDGET_KIT_DIR)) {
    if (!name.endsWith('.js') || name.includes('.test.')) continue;
    const widgetType = name.replace(/\.js$/, '');
    const code = readFileSync(join(WIDGET_KIT_DIR, name), 'utf8');
    for (const m of code.matchAll(/props\.(\w+)\s*!==\s*false/g)) {
      if (m[1]) out.push({ file: name, widgetType, prop: m[1], missingMeans: true });
    }
    for (const m of code.matchAll(/props\.(\w+)\s*===\s*true/g)) {
      if (m[1]) out.push({ file: name, widgetType, prop: m[1], missingMeans: false });
    }
  }
  return out;
}

/** Balancierte { … } ab text[startIdx] === '{' extrahieren (Klammern in
 *  String-Literalen werden übersprungen — widget-types.ts hat Props wie
 *  `template: 'Noch {n} {label} …'`, ein naives `[^}]*}` würde dort zu früh
 *  abbrechen). */
function extractBalanced(text: string, startIdx: number): string {
  assert.equal(text[startIdx], '{');
  let depth = 0;
  let quote: string | null = null;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  throw new Error('unbalanced braces starting at ' + startIdx);
}

/** Alle `props: { … }`-Blöcke aus widget-types.ts, gruppiert nach dem
 *  vorangehenden `type: '…'` (mehrere Einträge pro Typ möglich, z.B.
 *  'leaderboard' für Top-Gifter UND Like-Liste). */
function widgetTypesPropsBlocks(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const typeRe = /type:\s*'([\w-]+)',/g;
  for (const tm of WIDGET_TYPES_SRC.matchAll(typeRe)) {
    const widgetType = tm[1];
    if (!widgetType || tm.index === undefined) continue;
    // Der zugehörige props-Block liegt zwischen diesem `type:` und dem
    // nächsten `type:` (jeder Katalogeintrag hat genau einen props-Block).
    const propsAt = WIDGET_TYPES_SRC.indexOf('props: {', tm.index);
    if (propsAt < 0) continue;
    const braceAt = propsAt + 'props: '.length;
    const block = extractBalanced(WIDGET_TYPES_SRC, braceAt);
    const list = out.get(widgetType) ?? [];
    list.push(block);
    out.set(widgetType, list);
  }
  return out;
}

test('Boolean-Prop-Defaults: widget-types.ts stimmt mit dem `!== false`/`=== true`-Fallback des Widgets überein', () => {
  const conventions = jsBooleanConventions();
  assert.ok(conventions.length > 0, 'keine props.X !== false/=== true Muster gefunden — Regex prüfen');
  const propsBlocks = widgetTypesPropsBlocks();

  const mismatches: string[] = [];
  for (const conv of conventions) {
    const blocks = propsBlocks.get(conv.widgetType);
    if (!blocks) continue; // Widget-Typ hat (noch) keinen Katalog-Eintrag — nichts zu prüfen
    for (const block of blocks) {
      const m = block.match(new RegExp(`\\b${conv.prop}:\\s*(true|false)\\b`));
      if (!m) continue; // Prop hat in DIESEM Eintrag keinen expliziten Default — nichts zu vergleichen
      const declared = m[1] === 'true';
      if (declared !== conv.missingMeans) {
        mismatches.push(
          `${conv.widgetType}.${conv.prop}: widget-types.ts deklariert ${declared}, `
            + `aber ${conv.file} behandelt ein FEHLENDES Prop als ${conv.missingMeans} — ein Layout ohne `
            + `diesen Schlüssel verhält sich entgegengesetzt zur UI-Anzeige.`,
        );
      }
    }
  }
  assert.deepEqual(mismatches, []);
});
