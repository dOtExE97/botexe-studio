// build-gift-master.mjs — erzeugt apps/desktop/src/renderer/lib/gift-master.json:
// die komplette Liste aller aktuellen TikTok-Gifts (id, Name, deutscher Name,
// Coins, Bild-URL). Quelle: TikFinitys öffentlicher, CORS-offener Gift-Cache
// (zerodys Backend, das die TikTok-`gift/list/`-Daten gratis weiterserviert) —
// kein Account/Signing nötig. lang=en liefert die VOLLE Liste, lang=de nur eine
// lokalisierte Teilmenge → wir mergen die deutschen Namen per giftId dazu.
//
// Aufruf:  node scripts/build-gift-master.mjs
// Hinweis: Drittanbieter-Endpoint ohne Verfügbarkeitsgarantie → lokal cachen
// (genau das tut diese Datei) statt zur Laufzeit live darauf zu hängen.
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = (lang) => `https://tikfinity.zerody.one/api/getAllGifts?lang=${lang}&client=giftlist`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'apps/desktop/src/renderer/lib/gift-master.json');
const DE_TS = path.join(root, 'apps/desktop/src/renderer/lib/gift-names-de.ts');

const asArray = (d) => (Array.isArray(d) ? d : d.data || Object.values(d).find(Array.isArray));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const [en, de] = await Promise.all([
  fetch(API('en')).then((r) => r.json()).then(asArray),
  fetch(API('de')).then((r) => r.json()).then(asArray),
]);
const deById = new Map(de.map((g) => [g.id, g.name]));
// Zusätzliche kuratierte DE-Namen als Fallback (gift-names-de.ts).
const curated = new Map();
for (const m of readFileSync(DE_TS, 'utf8').matchAll(/["']?([a-z0-9 .!?&+_-]+)["']?\s*:\s*["']([^"']+)["']/gi)) {
  curated.set(m[1].trim().toLowerCase(), m[2]);
}

const master = [];
for (const g of en) {
  if (!g.name || g.id == null) continue;
  const deName = deById.get(g.id) || curated.get(g.name.toLowerCase());
  const e = { id: g.id, name: g.name, coins: g.diamond_count ?? 0, icon: g.image?.url_list?.[0] };
  if (deName && deName !== g.name) e.de = deName;
  master.push(e);
}
master.sort((a, b) => a.coins - b.coins || a.name.localeCompare(b.name));
writeFileSync(OUT, JSON.stringify(master));
console.log(`gift-master.json: ${master.length} Gifts, ${Math.round(JSON.stringify(master).length / 1024)} KB ` +
  `(${master.filter((g) => g.de).length} deutsch, ${master.filter((g) => g.icon).length} mit Bild)`);
