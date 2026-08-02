// Wächter gegen die teuerste stille Fehlerklasse dieses Projekts:
// „Der Adapter hört auf ein Ereignis, das der Cloud-Weg gar nicht liefern kann."
//
// WARUM ES DEN TEST BRAUCHT
// Der Adapter abonniert Ereignisse (`on('gift', …)`), der Cloud-Router bildet
// Nachrichtenarten darauf ab (TYPE_TO_EVENT). Das sind ZWEI von Hand gepflegte
// Listen für dieselbe Sache — die Fehlerklasse „dasselbe Wissen an zwei
// Stellen", die in AGENTS.md als eine der beiden wiederkehrenden benannt ist.
//
// Genau das ist mehrfach passiert, und JEDES Mal fiel es erst Wochen später auf,
// weil der Direkt-Modus weiterlief und im Cloud-Modus einfach nichts geschah:
//   • rankUpdate — die Ranglisten-Anzeige („Platz 7") war im Cloud-Modus, also
//     im Standard, seit jeher tot. Die App las die Daten sauber aus; sie kamen
//     nur nie an.
//   • subNotify / envelope — Teamherz-Abos und Coin-Kisten wurden eingebaut,
//     im Cloud-Modus aber weiterhin verworfen.
//   • superFan / superFanJoin — kamen als Kurzname an und landeten im
//     default-Zweig, während der Router nur Protokoll-Namen kannte.
//
// Ein Mensch entdeckt so etwas nicht durch Lesen. Deshalb liest dieser Test
// BEIDE Seiten aus dem Quelltext und vergleicht sie — wie es
// validators-exhaustiveness.test.ts für die Trigger-Bedingungen tut.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Tests laufen per npm-Script aus apps/desktop; aus dem Repo-Wurzelverzeichnis
// aufgerufen liegt die Quelle eine Ebene tiefer (gleiches Muster wie
// validators-exhaustiveness.test.ts).
const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');
const HIER = join(SRC, 'main', 'adapters');
const adapter = readFileSync(join(HIER, 'tiktok-adapter.ts'), 'utf-8');
const cloud = readFileSync(join(HIER, 'tiktok-cloud.ts'), 'utf-8');

/** Alle Ereignisse, die der Adapter abonniert (`on('xyz', …)`). */
function abonnierte(): string[] {
  return [...new Set([...adapter.matchAll(/\bon\('([a-zA-Z]+)'/g)].map((m) => m[1] as string))].sort();
}

/** Alle Ereignisse, die der Cloud-Weg erzeugen KANN — egal über welchen Weg:
 *  die Tabelle, ein Sonderfall im switch oder ein direktes emit(). */
function lieferbare(): Set<string> {
  const out = new Set<string>();
  // a) Tabelle: `WebcastXyz: 'ereignis'` bzw. `kurzname: 'ereignis'`
  for (const m of cloud.matchAll(/^\s*[A-Za-z]+:\s*'([a-zA-Z]+)',/gm)) out.add(m[1] as string);
  // b) Sonderfälle: `{ kind: 'event', event: 'follow' … }`
  for (const m of cloud.matchAll(/event:\s*'([a-zA-Z]+)'/g)) out.add(m[1] as string);
  // c) Direkte Signale: `this.emit('xyz'`
  for (const m of cloud.matchAll(/emit\('([a-zA-Z]+)'/g)) out.add(m[1] as string);
  // d) Verbindungs-Signale, die der Adapter aus `kind` ableitet.
  for (const m of cloud.matchAll(/kind:\s*'([a-zA-Z]+)'/g)) out.add(m[1] as string);
  return out;
}

test('JEDES abonnierte Ereignis kann der Cloud-Weg auch liefern', () => {
  const kann = lieferbare();
  const blind = abonnierte().filter((e) => !kann.has(e));
  assert.deepEqual(
    blind, [],
    'Diese Ereignisse abonniert der Adapter, der Cloud-Weg kann sie aber NICHT liefern.\n'
    + 'Im Cloud-Modus — dem Standard — passiert dazu also gar nichts, ohne jede Fehlermeldung.\n'
    + `Blind: ${blind.join(', ')}\n`
    + 'Lösung: die passende Nachrichtenart in TYPE_TO_EVENT (tiktok-cloud.ts) eintragen —\n'
    + 'am besten in BEIDEN Schreibweisen (Protokoll-Name und Kurzname der Bibliothek).',
  );
});

test('Die Grundarten sind in BEIDER Schreibweise abgedeckt', () => {
  // eulerstream mischt nachweislich beide Formen. Für die Ereignisse, ohne die
  // die App wertlos ist, wollen wir deshalb keine Wette eingehen.
  const unverzichtbar = ['chat', 'gift', 'like', 'member', 'roomUser'];
  const fehlen: string[] = [];
  for (const ev of unverzichtbar) {
    const lang = new RegExp(`^\\s*Webcast[A-Za-z]+:\\s*'${ev}',`, 'm').test(cloud);
    const kurz = new RegExp(`^\\s*${ev}:\\s*'${ev}',`, 'm').test(cloud);
    if (!lang || !kurz) fehlen.push(`${ev} (${lang ? '' : 'Protokoll-Name fehlt'}${!lang && !kurz ? ', ' : ''}${kurz ? '' : 'Kurzname fehlt'})`);
  }
  assert.deepEqual(fehlen, [],
    'Wechselt eulerstream bei diesen Arten die Schreibweise, wäre die App schlagartig taub:\n'
    + fehlen.join('\n'));
});

test('Der Wächter erkennt eine Lücke auch wirklich (Selbsttest)', () => {
  // Ohne diese Probe wäre nicht gesagt, dass der Test überhaupt etwas prüft:
  // Ein zu großzügiges Muster würde IMMER grün sein.
  const kann = lieferbare();
  assert.ok(kann.has('gift'), 'gift muss als lieferbar erkannt werden');
  assert.ok(!kann.has('diesesEreignisGibtEsNicht'), 'Erfundenes darf nicht als lieferbar gelten');
});
