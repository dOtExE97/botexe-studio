// Changelog-Parser — liest das gepflegte deutsche CHANGELOG.md und macht daraus
// strukturierte Einträge fürs „Was ist neu?"-Popup. Rein, keine I/O — das Lesen
// der Datei passiert in main.ts (packaged vs. dev, siehe dort).

export interface ChangelogEntry {
  version: string;
  date: string;
  /** Markdown-Rumpf der Sektion (ohne die `## [x.y.z] — Datum`-Zeile), getrimmt. */
  body: string;
}

// `## [0.38.0] — 2026-07-26` — Trenner zwischen Version und Datum ist im Repo
// mal ein Em-Dash (—), mal ein normaler Bindestrich — beides zulassen.
const HEADING_RE = /^##\s*\[([^\]]+)\]\s*(?:—|-|–)\s*(\d{4}-\d{2}-\d{2})\s*$/;

/** Zerlegt den Changelog-Text in Versions-Sektionen (Reihenfolge wie im File — neueste zuerst). */
export function parseChangelog(raw: string): ChangelogEntry[] {
  const lines = raw.split(/\r?\n/);
  const entries: ChangelogEntry[] = [];
  let current: { version: string; date: string; lines: string[] } | null = null;

  const flush = () => {
    if (current) {
      entries.push({ version: current.version, date: current.date, body: current.lines.join('\n').trim() });
    }
  };

  for (const line of lines) {
    const m = HEADING_RE.exec(line.trim());
    if (m) {
      flush();
      current = { version: m[1]!, date: m[2]!, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return entries;
}

/** "0.38.0" → [0, 38, 0]; tolerant ggü. Suffixen wie "0.38.0-beta.1" (Suffix ignoriert). */
function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Vergleicht zwei Versionsstrings numerisch (SemVer-light: nur major.minor.patch).
 * Gibt 0 zurück, wenn eine der beiden nicht geparst werden kann — bewusst
 * konservativ, damit ein unbekannter/kaputter Wert nie fälschlich "neuer" wirkt.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return (pa[i] as number) - (pb[i] as number);
  }
  return 0;
}

/**
 * Alle Einträge, die NEUER sind als `lastSeen` (z.B. übersprungene Versionen
 * 0.36→0.38 liefern beide). `lastSeen` fehlend/leer/unparsbar → leere Liste
 * (Aufrufer entscheidet dann separat über den Erstinstall-Fall).
 */
export function entriesSince(entries: ChangelogEntry[], lastSeen: string | null | undefined): ChangelogEntry[] {
  if (!lastSeen) return [];
  return entries.filter((e) => compareVersions(e.version, lastSeen) > 0);
}
