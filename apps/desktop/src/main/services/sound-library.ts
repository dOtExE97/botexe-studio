// sound-library.ts — lokale Alert-Sounds in userData/sounds/.
// Import = Datei-Kopie (vom OS-File-Picker), Liste & Löschen fürs UI.
import fs from 'node:fs';
import path from 'node:path';

const ALLOWED_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
const MAX_BYTES = 10 * 1024 * 1024;

export interface SoundEntry {
  id: string;
  filename: string;
  sizeBytes: number;
}

export class SoundLibrary {
  private readonly dir: string;

  constructor(userDataDir: string) {
    this.dir = path.join(userDataDir, 'sounds');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  getDir(): string {
    return this.dir;
  }

  list(): SoundEntry[] {
    return fs
      .readdirSync(this.dir)
      .filter((f) => ALLOWED_EXT.has(path.extname(f).toLowerCase()))
      .map((f) => ({
        id: f,
        filename: f,
        sizeBytes: fs.statSync(path.join(this.dir, f)).size,
      }))
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }

  import(sourcePath: string): { ok: true; entry: SoundEntry } | { ok: false; error: string } {
    const ext = path.extname(sourcePath).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return { ok: false, error: `Format ${ext} nicht unterstützt` };
    // Robust gegen gesperrte/verschwundene/unlesbare Dateien: ein einzelner
    // kaputter Pfad darf NICHT den ganzen (Mehrfach-)Import abbrechen.
    try {
      const stat = fs.statSync(sourcePath);
      if (stat.size > MAX_BYTES) return { ok: false, error: 'Datei größer als 10 MB' };

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
      return { ok: true, entry: { id: filename, filename, sizeBytes: stat.size } };
    } catch (err) {
      return { ok: false, error: `„${path.basename(sourcePath)}" konnte nicht gelesen werden: ${(err as Error).message}` };
    }
  }

  delete(id: string): boolean {
    const safe = path.basename(id);
    if (!ALLOWED_EXT.has(path.extname(safe).toLowerCase())) return false;
    const target = path.join(this.dir, safe);
    if (!fs.existsSync(target)) return false;
    fs.unlinkSync(target);
    return true;
  }
}
