// Wächter: Liest ein Widget eine Einstellung, die der Nutzer gar nicht setzen
// kann? Dann ist die Einstellung praktisch tot — sie steht im Code, wirkt aber
// immer nur mit ihrem Standardwert. Umgekehrt: Gibt es ein Bedienfeld für etwas,
// das kein Widget liest? Dann dreht der Nutzer an einem Regler ohne Wirkung.
//
// Beides ist schon vorgekommen (luckyDrawMs wurde gelesen, hatte aber kein
// Feld; showVotes ebenso). Der Test macht die Lücke sichtbar, statt sie im
// Code verstecken zu lassen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WIDGET_TYPES } from './widget-types';

const WURZEL = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), '..', '..')
  : process.cwd();
const WK = join(WURZEL, 'packages', 'widget-kit');

/** Reine Logik-Bausteine — kein eigenes Widget, keine Bedienfelder. */
const BAUSTEINE = new Set(['gift-rules', 'combo', 'gift-countdown', 'sticker-text']);

/** Felder, die über CSS-Variablen wirken statt über den Widget-Code: Die
 *  Runtime setzt --bx-fs, --bx-accent & Co. am Container; das Widget liest sie
 *  nie selbst aus props. Sie zählen deshalb nicht als „totes Feld". */
const UEBER_CSS = new Set(['theme', 'fontFamily', 'fontScale', 'textColor']);

/** Von der Laufzeit gesetzt (Editor/Overlay), nie vom Nutzer im Formular. */
const LAUFZEIT = new Set([
  'source',    // 'trigger' | 'manual' — kommt aus der Quelle-Auswahl
  'items',     // vom Listen-Editor befüllt
  'preview',   // Editor-Vorschau
  'perf',      // TikTok-Live-Studio-Modus
  'layerId',
  'token',
  'baseUrl',
  // media: Der Editor legt die fertige Adresse selbst hinein, und die Aktion
  // „Medium abspielen" kann sie mitgeben — der Nutzer wählt statt dessen eine
  // Datei aus der Bibliothek (mediaId). `kind` leitet das Widget daraus ab.
  'mediaUrl',
  'kind',
]);

function widgetQuelle(typ: string): string | null {
  const p = join(WK, `${typ}.js`);
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

/** Manche Einstellungen wertet NICHT das Widget aus, sondern der Hauptprozess:
 *  „Bei welchem Geschenk drehen?" (wheel-gift/slot-gift/lucky-draw) oder die
 *  Widget-Sounds, die absichtlich lokal statt im Overlay klingen. Sie sind
 *  genauso verdrahtet — nur eben auf der anderen Seite. */
const MAIN_QUELLE = (() => {
  const dir = join(WURZEL, 'apps', 'desktop', 'src', 'main');
  let alles = '';
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const pfad = join(d, e.name);
      if (e.isDirectory()) walk(pfad);
      else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) alles += readFileSync(pfad, 'utf-8');
    }
  };
  walk(dir);
  return alles;
})();

test('jede Einstellung, die ein Widget liest, hat auch ein Bedienfeld', () => {
  const luecken: string[] = [];
  for (const def of WIDGET_TYPES) {
    if (BAUSTEINE.has(def.type)) continue;
    const quelle = widgetQuelle(def.type);
    if (!quelle) continue;
    const felder = new Set((def.fields ?? []).map((f) => f.key));
    const gelesen = new Set([...quelle.matchAll(/\bprops\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1] as string));
    for (const p of gelesen) {
      if (LAUFZEIT.has(p) || felder.has(p)) continue;
      luecken.push(`${def.type}.${p}`);
    }
  }
  assert.deepEqual(
    luecken,
    [],
    `Diese Einstellungen liest das Widget, aber der Nutzer kann sie nirgends setzen:\n  ${luecken.join('\n  ')}`,
  );
});

test('jedes Bedienfeld wird von seinem Widget auch gelesen', () => {
  const tote: string[] = [];
  for (const def of WIDGET_TYPES) {
    if (BAUSTEINE.has(def.type)) continue;
    const quelle = widgetQuelle(def.type);
    if (!quelle) continue;
    for (const f of def.fields ?? []) {
      if (UEBER_CSS.has(f.key)) continue;
      // Ein Feld gilt als benutzt, wenn sein Name irgendwo in der Widget-Quelle
      // auftaucht — auch als `this.x = props.x` oder in einer Zerlegung.
      const genutzt = new RegExp(`\\b${f.key}\\b`).test(quelle) || new RegExp(`\\b${f.key}\\b`).test(MAIN_QUELLE);
      if (!genutzt) tote.push(`${def.type}.${f.key}`);
    }
  }
  assert.deepEqual(
    tote,
    [],
    `Für diese Felder gibt es einen Regler, aber das Widget liest ihn nie:\n  ${tote.join('\n  ')}`,
  );
});

test('jedes ausgelieferte Widget ist auch registriert (sonst unsichtbar)', () => {
  const registriert = new Set(WIDGET_TYPES.map((d) => d.type));
  const fehlend = readdirSync(WK)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/\.js$/, ''))
    .filter((n) => !BAUSTEINE.has(n) && !registriert.has(n));
  assert.deepEqual(fehlend, [], `Diese Widgets liegen im Paket, tauchen aber in der App nicht auf:\n  ${fehlend.join('\n  ')}`);
});

test('jedes registrierte Widget existiert auch als Datei', () => {
  const fehlend = WIDGET_TYPES.map((d) => d.type).filter((t) => !existsSync(join(WK, `${t}.js`)));
  assert.deepEqual(fehlend, [], `Diese Widgets sind in der App wählbar, aber die Datei fehlt:\n  ${fehlend.join('\n  ')}`);
});

// Der Wächter „jedes Widget hat eine Kategorie“ ist nach palette-gruppen.test.ts
// umgezogen: seit die Einteilung in palette-gruppen.ts liegt, kann er sie
// importieren, statt CATEGORY_OF als Text aus der Ansicht zu klauben.

// ── Wächter: Ist jede Einstellung sauber vorbelegt? ────────────────────────
// Zwei stille Fehler, die ein Nutzer nur als „komisch" wahrnimmt:
//  • Ein Feld ohne Standardwert steht beim ersten Öffnen leer da, obwohl das
//    Widget im Hintergrund längst mit einem eigenen Wert arbeitet (der Titel des
//    Gambling-Automaten hieß „Gambling-Automat", das Feld war leer).
//  • Ein Standardwert, den die Auswahlliste gar nicht anbietet — dann zeigt das
//    Feld irgendetwas an, und schon das erste Anfassen ändert das Aussehen.

/** Setzt die Laufzeit als CSS-Variable/Klasse, nicht das Widget aus props. */
const LAUFZEIT_FELDER = new Set(['theme', 'fontFamily', 'fontScale', 'textColor', 'frameless', 'polish', 'accent']);
/** Vom Nutzer aus einer Bibliothek gewählt — leer ist hier der richtige Anfang. */
const OHNE_VORBELEGUNG = new Set(['soundId', 'mediaId']);

test('jede Einstellung hat einen Standardwert', () => {
  const luecken: string[] = [];
  for (const def of WIDGET_TYPES) {
    for (const f of def.fields ?? []) {
      if (LAUFZEIT_FELDER.has(f.key) || OHNE_VORBELEGUNG.has(f.key)) continue;
      if (!(f.key in def.props)) luecken.push(`${def.type}.${f.key} („${f.label}")`);
    }
  }
  assert.deepEqual(luecken, [], `Diese Felder stehen beim ersten Öffnen leer da:\n  ${luecken.join('\n  ')}`);
});

test('der Standardwert eines Auswahlfelds steht auch in seiner Liste', () => {
  const falsch: string[] = [];
  for (const def of WIDGET_TYPES) {
    for (const f of def.fields ?? []) {
      if (f.type !== 'select' || !f.options) continue;
      const std = def.props[f.key];
      if (std === undefined) continue;
      const werte = f.options.map((o) => o.value);
      if (!werte.includes(String(std))) {
        falsch.push(`${def.type}.${f.key}: „${String(std)}" fehlt in [${werte.join(', ')}]`);
      }
    }
  }
  assert.deepEqual(falsch, [], falsch.join('\n  '));
});

test('Auswahl- und Zahlenfelder erklären sich', () => {
  // Die Endnutzer sind Streamer. Ein Auswahlfeld ohne Erklärung heißt raten —
  // und wer rät, probiert im Live aus.
  const stumm: string[] = [];
  for (const def of WIDGET_TYPES) {
    for (const f of def.fields ?? []) {
      if (f.hint || LAUFZEIT_FELDER.has(f.key) || f.key === 'style') continue;
      if (['select', 'number', 'seconds'].includes(String(f.type))) stumm.push(`${def.type}.${f.key} („${f.label}")`);
    }
  }
  assert.deepEqual(stumm, [], `Ohne Erklärung im Panel:\n  ${stumm.join('\n  ')}`);
});
