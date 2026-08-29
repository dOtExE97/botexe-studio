// baue-widget-galerie.mjs — docs/widgets.md aus dem echten Katalog erzeugen.
//
// Warum: Die Galerie war von Hand gepflegt und lief auseinander. Das
// Befehl-Karussell stand dort unter „Ambient & Deko", obwohl es in der App
// längst bei „Gifts & Ziele" liegt — wer die Doku liest, sucht es dann im
// falschen Reiter. Jede Umsortierung in der Palette musste man daran denken
// hier nachzuziehen; genau das vergisst man.
//
// Aufruf: npm run galerie  (laeuft ueber tsx, weil der Katalog TypeScript ist)
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const { WIDGET_TYPES } = await import(join(WURZEL, 'apps/desktop/src/renderer/pages/widget-types.ts'));
const { PALETTE_KATEGORIEN, CATEGORY_OF } = await import(
  join(WURZEL, 'apps/desktop/src/renderer/pages/palette-gruppen.ts')
);

const SHOTS = new Set(readdirSync(join(WURZEL, 'docs/screenshots')));

/** Drei Bilder je Zeile — zwei Markdown-Zeilen (Namen, dann Bilder). */
function tabelle(eintraege) {
  const zeilen = ['|   |   |   |', '| --- | --- | --- |'];
  for (let i = 0; i < eintraege.length; i += 3) {
    const drei = eintraege.slice(i, i + 3);
    while (drei.length < 3) drei.push(null);
    zeilen.push(`| ${drei.map((e) => (e ? `**${e.label}**` : '')).join(' | ')} |`);
    zeilen.push(`| ${drei.map((e) => (e ? `![${e.label}](screenshots/${e.datei})` : '')).join(' | ')} |`);
  }
  return zeilen.join('\n');
}

const ohneBild = [];
const abschnitte = [];
for (const kat of PALETTE_KATEGORIEN) {
  // „Beliebt" ist ein kuratierter Quer-Reiter der App, keine eigene Sorte —
  // in einer Galerie stünde dort nur alles ein zweites Mal.
  if (kat.id === 'beliebt') continue;
  const eintraege = [];
  for (const w of WIDGET_TYPES) {
    if ((CATEGORY_OF[w.type] ?? 'deko') !== kat.id) continue;
    const datei = `${w.type}.png`;
    if (!SHOTS.has(datei)) { ohneBild.push(w.label); continue; }
    eintraege.push({ label: w.label, datei });
  }
  if (eintraege.length) abschnitte.push(`## ${kat.label}\n\n${tabelle(eintraege)}`);
}

const gesamt = WIDGET_TYPES.length;
const hinweis = ohneBild.length
  ? `\n> Stand: ${gesamt - ohneBild.length} der ${gesamt} Einträge sind hier abgebildet. Es fehlt noch ein Bild von:\n> ${ohneBild.join(', ')} — in der App ganz normal vorhanden (Overlay → Widget hinzufügen).\n`
  : '';

writeFileSync(
  join(WURZEL, 'docs/widgets.md'),
  `# Widget-Galerie

<!-- Erzeugt von scripts/baue-widget-galerie.mjs — nicht von Hand ändern.
     Neu bauen mit: npm run galerie -->

Alle Widgets von bOtExE Studio im Überblick — gerendert auf dunklem Hintergrund.
Im Stream liegt darunter dein Videobild, der Hintergrund der Widgets ist transparent.

Viele Widgets haben zusätzlich mehrere **Stile** und 24 **Themes** (Glas, Neon, Arcade,
Synthwave …), die das Aussehen komplett verändern. Hier ist jeweils nur die Grundform zu sehen.

Die Überschriften sind dieselben Reiter wie in der App (Overlay → Widgets).
${hinweis}
${abschnitte.join('\n\n')}
`,
);
console.log(`docs/widgets.md neu gebaut — ${gesamt - ohneBild.length} Bilder, ${abschnitte.length} Abschnitte.`);
if (ohneBild.length) console.log(`ohne Bild: ${ohneBild.join(', ')}`);
