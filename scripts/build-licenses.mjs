// build-licenses.mjs — erzeugt die Lizenz-Daten für die In-App-Anzeige
// (Einstellungen → Open-Source-Lizenzen) aus dem echten Dependency-Baum.
// Lauf: `node scripts/build-licenses.mjs` (nach Dependency-Änderungen).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'apps/desktop/src/renderer/lib/third-party-licenses.json');

// Vollständigen Lizenz-Baum holen.
const raw = execSync('npx --yes license-checker-rseidelsohn --json', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const all = JSON.parse(raw);

// Direkte (selbst gewählte) Dependencies aus allen Workspaces sammeln.
const direct = new Set();
for (const p of ['package.json', 'apps/desktop/package.json', 'packages/overlay-engine/package.json', 'packages/trigger-engine/package.json', 'packages/widget-kit/package.json']) {
  try {
    const j = JSON.parse(readFileSync(join(root, p), 'utf8'));
    for (const d of Object.keys(j.dependencies ?? {})) if (!d.startsWith('@botexe/')) direct.add(d);
  } catch { /* Workspace evtl. nicht vorhanden */ }
}

const entryFor = (name) => {
  const key = Object.keys(all).find((k) => k.startsWith(`${name}@`));
  return key ? all[key] : null;
};
const clean = (r) => String(r ?? '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://');

const directList = [...direct].sort().map((name) => {
  const i = entryFor(name) ?? {};
  return { name, license: i.licenses ?? '?', author: i.publisher ?? '', repo: clean(i.repository) };
});

const byLicense = {};
for (const info of Object.values(all)) { const l = info.licenses ?? '?'; byLicense[l] = (byLicense[l] ?? 0) + 1; }
const stats = Object.entries(byLicense).sort((a, b) => b[1] - a[1]).map(([license, count]) => ({ license, count }));

writeFileSync(OUT, JSON.stringify({ direct: directList, total: Object.keys(all).length, byLicense: stats }, null, 2));
console.log(`✅ ${OUT} — ${directList.length} direkte Libs, ${Object.keys(all).length} Pakete gesamt`);
