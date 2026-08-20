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

// ── Wächter: hat jedes Widget eine Kategorie? ──────────────────────────────
// Fehlt ein Eintrag in CATEGORY_OF, fällt das Widget still auf „Ambient & Deko"
// zurück und ist im falschen Reiter praktisch unauffindbar. Genau so lag der
// Gambling-Automat monatelang bei der Deko statt bei den Spielen — und der
// Kommentar im Code warnte sogar davor, ohne dass es jemand merkte.
test('jedes Widget hat eine Kategorie (sonst landet es still in der Deko)', () => {
  const quelle = readFileSync(join(WURZEL, 'apps/desktop/src/renderer/pages/OverlayPage.tsx'), 'utf-8');
  const anfang = quelle.indexOf('const CATEGORY_OF');
  const ende = quelle.indexOf('const RELATED_OF');
  assert.ok(anfang > 0 && ende > anfang, 'CATEGORY_OF nicht gefunden — Test muss angepasst werden');
  const block = quelle.slice(anfang, ende);

  const eingetragen = new Set(
    [...block.matchAll(/'?([a-z0-9-]+)'?\s*:\s*'(?:beliebt|alerts|spiele|gifts|listen|stats|deko|media)'/g)]
      .map((m) => m[1]),
  );
  const fehlen = [...new Set(WIDGET_TYPES.map((w) => w.type))].filter((t) => !eingetragen.has(t));
  assert.deepEqual(
    fehlen, [],
    `Diese Widgets haben keinen Eintrag in CATEGORY_OF und landen dadurch in „Ambient & Deko": ${fehlen.join(', ')}`,
  );
});
