// media-library.ts — eigene Bilder & Videos in userData/media/.
// Für das Media-Widget: Logos/Banner dauerhaft einblenden oder per Trigger
// abspielen (z.B. Begrüßungsvideo bei einem Superfan-Gift).
// Import = Datei-Kopie (vom OS-File-Picker), Liste & Löschen fürs UI.
import fs from 'node:fs';
import path from 'node:path';

export type MediaKind = 'image' | 'video';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.webm']);
// Videos dürfen größer sein als Sounds — Begrüßungsclips sind kurz, aber HD.
const MAX_BYTES = 50 * 1024 * 1024;

export interface MediaEntry {
  id: string;
  filename: string;
  kind: MediaKind;
  sizeBytes: number;
}

function kindForExt(ext: string): MediaKind | null {
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  return null;
}

export class MediaLibrary {
  private readonly dir: string;

  constructor(userDataDir: string) {
    this.dir = path.join(userDataDir, 'media');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  getDir(): string {
    return this.dir;
  }

  list(): MediaEntry[] {
    return fs
      .readdirSync(this.dir)
      .map((f) => ({ f, kind: kindForExt(path.extname(f).toLowerCase()) }))
      .filter((x): x is { f: string; kind: MediaKind } => x.kind !== null)
      .map(({ f, kind }) => ({
        id: f,
        filename: f,
        kind,
        sizeBytes: fs.statSync(path.join(this.dir, f)).size,
      }))
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }

  import(sourcePath: string): { ok: true; entry: MediaEntry } | { ok: false; error: string } {
    const ext = path.extname(sourcePath).toLowerCase();
    const kind = kindForExt(ext);
    if (!kind) return { ok: false, error: `Format ${ext || '?'} nicht unterstützt` };
    const stat = fs.statSync(sourcePath);
    if (stat.size > MAX_BYTES) return { ok: false, error: 'Datei größer als 50 MB' };

    const base = path
      .basename(sourcePath)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-');
    let target = path.join(this.dir, base);
    let n = 1;
    while (fs.existsSync(target)) {
      const p = path.parse(base);
      target = path.join(this.dir, `${p.name}-${n}${p.ext}`);
      n++;
    }
    fs.copyFileSync(sourcePath, target);
    const filename = path.basename(target);
    return { ok: true, entry: { id: filename, filename, kind, sizeBytes: stat.size } };
  }

  delete(id: string): boolean {
    const safe = path.basename(id);
    if (!kindForExt(path.extname(safe).toLowerCase())) return false;
    const target = path.join(this.dir, safe);
    if (!fs.existsSync(target)) return false;
    fs.unlinkSync(target);
    return true;
  }
}
