// Wächter gegen die P2-Audit-Fehlerklasse: validateTriggerAction()/die
// Condition-Prüfung in validators.ts kennen NUR die `kind`s, die hier per Hand
// als `case`/Set-Eintrag gepflegt werden — TypeScript erzwingt NICHT, dass die
// Liste vollständig zur Engine-Union (@botexe/trigger-engine) passt (ein
// `Array<T>`/switch mit `default: return null` prüft nur, dass vorhandene
// Einträge gültig sind, nicht dass ALLE Varianten von T abgedeckt sind).
//
// Genau das ist zweimal passiert:
//   - CONDITION_KINDS fehlten gift_id_is/follow_first_time/like_count_gte
//     (gefixt, Commit bc76025) — betraf validateCondition/validateTriggerRule.
//   - validateTriggerAction fehlten spin_slot/start_gift_challenge/lucky_draw
//     (gefixt hier) — betraf validateTriggerAction/validateRedemption/
//     validatePanelButton (alle drei rufen validateTriggerAction auf).
// Beide Male: eine Regel/Aktion mit dem fehlenden `kind` wurde beim
// Speichern/Importieren STILL verworfen, ohne Fehler.
//
// Dieser Test liest beide Seiten aus dem Quellcode (wie settings-allowlist.
// test.ts es für die Settings-Allowlist tut) und vergleicht die `kind`-Mengen
// automatisiert — künftig fehlende kinds fallen hier auf, nicht erst live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Tests laufen per npm-Script aus apps/desktop; aus dem Repo-Wurzelverzeichnis
// aufgerufen liegt die Quelle unter apps/desktop/src (gleiches Muster wie
// settings-allowlist.test.ts).
const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');
const REPO_ROOT = join(SRC, '..', '..', '..');

const ENGINE_SRC = readFileSync(
  join(REPO_ROOT, 'packages', 'trigger-engine', 'src', 'index.ts'),
  'utf8',
);
const VALIDATORS_SRC = readFileSync(join(SRC, 'main', 'services', 'validators.ts'), 'utf8');

/** Extrahiert alle `kind: '...'` Literale aus einem Textausschnitt. */
function kindsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/kind:\s*'([a-z_]+)'/g)) {
    if (m[1]) out.add(m[1]);
  }
  return out;
}

/** TriggerActionKind-Union aus der Engine — zwischen ihrer Deklaration und der
 *  nächsten Typ-Deklaration (TriggerAction). */
function engineActionKinds(): Set<string> {
  const start = ENGINE_SRC.indexOf('export type TriggerActionKind =');
  assert.ok(start > 0, 'TriggerActionKind-Union in trigger-engine/src/index.ts nicht gefunden');
  const end = ENGINE_SRC.indexOf('export type TriggerAction = TriggerActionKind', start);
  assert.ok(end > start, 'Ende der TriggerActionKind-Union nicht gefunden');
  return kindsIn(ENGINE_SRC.slice(start, end));
}

/** TriggerCondition-Union aus der Engine. */
function engineConditionKinds(): Set<string> {
  const start = ENGINE_SRC.indexOf('export type TriggerCondition =');
  assert.ok(start > 0, 'TriggerCondition-Union in trigger-engine/src/index.ts nicht gefunden');
  const end = ENGINE_SRC.indexOf('export type TriggerActionKind =', start);
  assert.ok(end > start, 'Ende der TriggerCondition-Union nicht gefunden');
  return kindsIn(ENGINE_SRC.slice(start, end));
}

/** Alle `case '...':` innerhalb von validateTriggerAction() (validators.ts). */
function validatorActionKinds(): Set<string> {
  const start = VALIDATORS_SRC.indexOf('export function validateTriggerAction');
  assert.ok(start > 0, 'validateTriggerAction nicht gefunden');
  const end = VALIDATORS_SRC.indexOf('// ── TriggerCondition', start);
  assert.ok(end > start, 'Ende von validateTriggerAction nicht gefunden');
  const block = VALIDATORS_SRC.slice(start, end);
  const out = new Set<string>();
  for (const m of block.matchAll(/case\s+'([a-z_]+)':/g)) {
    if (m[1]) out.add(m[1]);
  }
  return out;
}

/** CONDITION_KINDS-Set in validators.ts — das ist die Stelle, die
 *  validateCondition() vor dem eigentlichen switch bereits filtert. */
function validatorConditionKinds(): Set<string> {
  const start = VALIDATORS_SRC.indexOf('const CONDITION_KINDS');
  assert.ok(start > 0, 'CONDITION_KINDS nicht gefunden');
  const end = VALIDATORS_SRC.indexOf(']);', start);
  assert.ok(end > start, 'Ende von CONDITION_KINDS nicht gefunden');
  const block = VALIDATORS_SRC.slice(start, end);
  const out = new Set<string>();
  for (const m of block.matchAll(/'([a-z_]+)'/g)) {
    if (m[1]) out.add(m[1]);
  }
  return out;
}

test('jeder TriggerActionKind der Engine wird von validateTriggerAction behandelt', () => {
  const engineKinds = engineActionKinds();
  const handled = validatorActionKinds();
  assert.ok(engineKinds.size > 0, 'keine Action-kinds in der Engine gefunden — Regex prüfen');

  const fehlend = [...engineKinds].filter((k) => !handled.has(k)).sort();
  assert.deepEqual(
    fehlend,
    [],
    `Diese TriggerActionKinds kennt die Engine, validateTriggerAction() hat aber KEIN case dafür: ${fehlend.join(', ')}. `
      + 'Ohne case fällt der `default: return null`-Zweig sie STILL raus — Regel/Panel-Knopf mit diesem kind verschwindet '
      + 'beim Speichern/Import, ohne Fehler.',
  );
});

test('jeder TriggerConditionKind der Engine steht in CONDITION_KINDS (validators.ts)', () => {
  const engineKinds = engineConditionKinds();
  const allowed = validatorConditionKinds();
  assert.ok(engineKinds.size > 0, 'keine Condition-kinds in der Engine gefunden — Regex prüfen');

  const fehlend = [...engineKinds].filter((k) => !allowed.has(k)).sort();
  assert.deepEqual(
    fehlend,
    [],
    `Diese TriggerConditionKinds kennt die Engine, CONDITION_KINDS (validators.ts) fehlen sie aber: ${fehlend.join(', ')}. `
      + 'Eine Regel-Bedingung mit diesem kind wird beim Speichern/Import STILL aus rule.conditions gefiltert — die '
      + 'Regel feuert danach auf JEDES Event ihres Typs statt nur unter der gedachten Einschränkung (siehe bc76025).',
  );
});

// ── Ereignisarten ──────────────────────────────────────────────────────────
// Gleiche Fehlerklasse wie bei CONDITION_KINDS, nur schlimmer: Fehlt eine Art
// in EVENT_TYPES, wird die GANZE Regel verworfen statt nur ein Feld. Genau so
// liefen Superfan-Regeln ins Leere, und Sticker-Regeln waeren beim ersten
// Speichern spurlos verschwunden.
test('jede StudioEventType-Art steht in EVENT_TYPES (validators.ts)', () => {
  const typQuelle = readFileSync(join(REPO_ROOT, 'packages', 'trigger-engine', 'src', 'index.ts'), 'utf-8');
  const von = typQuelle.indexOf('export type StudioEventType =');
  const bis = typQuelle.indexOf(';', von);
  const arten = [...typQuelle.slice(von, bis).matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);
  assert.ok(arten.length >= 10, `nur ${arten.length} Ereignisarten erkannt — Regex pruefen`);

  const valQuelle = readFileSync(join(SRC, 'main', 'services', 'validators.ts'), 'utf-8');
  const listeVon = valQuelle.indexOf('const EVENT_TYPES');
  const listeBis = valQuelle.indexOf(']);', listeVon);
  const liste = valQuelle.slice(listeVon, listeBis);
  const fehlen = arten.filter((a) => !new RegExp(`'${a}'`).test(liste));
  assert.deepEqual(
    fehlen, [],
    `Diese Ereignisarten kennt die Engine, EVENT_TYPES fehlen sie: ${fehlen.join(', ')}. `
    + 'Eine Regel mit diesem Ereignis wird beim Speichern KOMPLETT verworfen.',
  );
});
