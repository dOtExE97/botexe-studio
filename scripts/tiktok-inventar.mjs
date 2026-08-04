// tiktok-inventar.mjs — erzeugt docs/tiktok-datenquellen.md
//
// WARUM ES DAS GIBT
// Die Frage „was könnte TikTok uns eigentlich alles schicken, und was davon
// nutzen wir?" wurde bisher jedes Mal von Hand beantwortet — mit grep, aus dem
// Gedächtnis, und je nach Tagesform unterschiedlich. Dabei liegt die Antwort
// vollständig im Repo: `tiktok-live-proto` bringt das komplette Schema mit
// (72 Nachrichtenarten, 784 Strukturen).
//
// Dieses Skript liest drei Quellen und stellt sie gegenüber:
//   1. das Protokoll-Schema        → was TikTok überhaupt schicken KANN
//   2. tiktok-cloud.ts             → was die App im Cloud-Weg annimmt
//   3. tiktok-adapter.ts           → worauf die App tatsächlich hört
//
// Ergebnis ist eine Tabelle, in der man auf einen Blick sieht, was ungenutzt
// herumliegt und ob sich das Auswerten lohnt (die Feldnamen stehen dabei).
//
// Aufruf: npm run inventar
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROTO = path.join(WURZEL, 'node_modules/tiktok-live-proto/dist/node/v3.d.ts');
const CLOUD = path.join(WURZEL, 'apps/desktop/src/main/adapters/tiktok-cloud.ts');
const ADAPTER = path.join(WURZEL, 'apps/desktop/src/main/adapters/tiktok-adapter.ts');
const ZIEL = path.join(WURZEL, 'docs/tiktok-datenquellen.md');

/** Felder je Nachrichtenart aus dem Schema lesen. */
function leseSchema(text) {
  const arten = new Map();
  const re = /^interface (Webcast\w+) \{\n([\s\S]*?)^\}/gm;
  for (const m of text.matchAll(re)) {
    const felder = [...m[2].matchAll(/^\s{2}(\w+)\??:/gm)].map((f) => f[1]);
    arten.set(m[1], felder);
  }
  return arten;
}

/** Welche Arten bildet der Cloud-Weg auf welches Ereignis ab? */
function leseCloud(text) {
  const zu = new Map();
  const tabelle = /const TYPE_TO_EVENT[^{]*\{([\s\S]*?)\n\};/.exec(text);
  if (tabelle) {
    for (const m of tabelle[1].matchAll(/^\s*(\w+):\s*'(\w+)'/gm)) zu.set(m[1], m[2]);
  }
  // Sonderfälle im switch (z.B. WebcastSocialMessage → follow/share).
  for (const m of text.matchAll(/case '(Webcast\w+)':/g)) {
    if (!zu.has(m[1])) zu.set(m[1], '(Sonderfall)');
  }
  return zu;
}

/** Worauf hört der Adapter? */
function leseAdapter(text) {
  return new Set([...text.matchAll(/\bon\('(\w+)'/g)].map((m) => m[1]));
}

const schema = leseSchema(fs.readFileSync(PROTO, 'utf-8'));
const cloud = leseCloud(fs.readFileSync(CLOUD, 'utf-8'));
const abos = leseAdapter(fs.readFileSync(ADAPTER, 'utf-8'));

/** Felder, an denen man erkennt, dass sich eine Art lohnt. */
const INTERESSANT = /^(user|users?|.*[Uu]serId|.*[Nn]ickname|gift|giftId|diamond|coins?|count|total|score|rank|ranks|winner|question|content|text|message|monthly|subMonth|battle|team|emote)/;

const zeilen = [];
for (const [art, felder] of [...schema.entries()].sort()) {
  const ereignis = cloud.get(art);
  const genutzt = ereignis && abos.has(ereignis);
  const wertvoll = felder.filter((f) => INTERESSANT.test(f));
  zeilen.push({ art, felder, ereignis, genutzt, wertvoll });
}

const genutzt = zeilen.filter((z) => z.genutzt);
const ungenutzt = zeilen.filter((z) => !z.genutzt);
const lohnend = ungenutzt.filter((z) => z.wertvoll.length >= 2).sort((a, b) => b.wertvoll.length - a.wertvoll.length);

const tabelle = (liste, mitFeldern) => [
  mitFeldern ? '| Nachrichtenart | Interessante Felder |' : '| Nachrichtenart | Ereignis in der App |',
  mitFeldern ? '| --- | --- |' : '| --- | --- |',
  ...liste.map((z) => (mitFeldern
    ? `| \`${z.art}\` | ${z.wertvoll.slice(0, 8).map((f) => `\`${f}\``).join(', ')} |`
    : `| \`${z.art}\` | \`${z.ereignis}\` |`)),
].join('\n');

const inhalt = `# Was TikTok uns schicken kann — und was wir davon nutzen

<!-- ERZEUGT von scripts/tiktok-inventar.mjs — nicht von Hand ändern.
     Neu erzeugen mit: npm run inventar -->

Diese Übersicht entsteht aus drei Quellen im Repo: dem Protokoll-Schema von
\`tiktok-live-proto\`, dem Cloud-Router (\`tiktok-cloud.ts\`) und den Abos des
Adapters (\`tiktok-adapter.ts\`). Sie beantwortet damit die Frage, die sonst
jedes Mal von Hand beantwortet wurde: **Was liegt ungenutzt herum?**

- **${schema.size}** Nachrichtenarten kennt das Protokoll
- **${genutzt.length}** davon wertet die App aus
- **${lohnend.length}** ungenutzte tragen Felder, die nach etwas aussehen

## Was die App auswertet

${tabelle(genutzt, false)}

## Ungenutzt — aber vermutlich wertvoll

Sortiert danach, wie viele aussagekräftige Felder drinstecken (Nutzer, Coins,
Punktzahl, Text …). Die reine Feldzahl ist nur ein Hinweis, kein Beweis: Ob es
sich lohnt, entscheidet der Blick ins Schema.

${tabelle(lohnend.slice(0, 25), true)}

## Ungenutzt und vermutlich uninteressant

${ungenutzt.filter((z) => z.wertvoll.length < 2).map((z) => `\`${z.art}\``).join(' · ')}

---

*Erzeugt aus \`tiktok-live-proto\` — bei einem Update der Bibliothek neu
erzeugen, dann zeigt die Liste die neuen Arten.*
`;

fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
fs.writeFileSync(ZIEL, inhalt);
console.log(`${schema.size} Arten gelesen · ${genutzt.length} genutzt · ${lohnend.length} lohnend`);
console.log(`geschrieben: ${path.relative(WURZEL, ZIEL)}`);
