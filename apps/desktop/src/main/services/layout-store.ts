// layout-store.ts — Overlay-Layouts als JSON-Files in userData/layouts/.
// Audit K3: validateLayout läuft vor JEDEM Save und nach JEDEM Load — kein
// kaputtes Layout kommt auf Disk oder in die App. Writes sind atomar
// (tmp + rename): ein Crash mitten im Write zerstört nie das alte File.
import fs from 'node:fs';
import path from 'node:path';
import { validateLayout, type OverlayLayout } from '@botexe/overlay-engine';
import { log } from '../core/logger';

export class LayoutStore {
  private readonly dir: string;

  constructor(userDataDir: string) {
    this.dir = path.join(userDataDir, 'layouts');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  list(): OverlayLayout[] {
    const layouts: OverlayLayout[] = [];
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue;
      const layout = this.loadFile(path.join(this.dir, file));
      if (layout) layouts.push(layout);
    }
    return layouts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): OverlayLayout | null {
    const file = this.fileFor(id);
    return fs.existsSync(file) ? this.loadFile(file) : null;
  }

  save(data: unknown): { ok: true; layout: OverlayLayout } | { ok: false; errors: string[] } {
    const result = validateLayout(data);
    if (!result.ok) {
      log.warn('Layouts', `Save abgelehnt: ${result.errors.join('; ')}`);
      return result;
    }
    const layout: OverlayLayout = { ...result.layout, updatedAt: new Date().toISOString() };
    const file = this.fileFor(layout.id);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(layout, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
    return { ok: true, layout };
  }

  delete(id: string): boolean {
    const file = this.fileFor(id);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }

  private fileFor(id: string): string {
    // IDs kommen aus der App, aber defensiv bleiben: basename + whitelist.
    const safe = path.basename(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }

  private loadFile(file: string): OverlayLayout | null {
    try {
      const result = validateLayout(JSON.parse(fs.readFileSync(file, 'utf-8')));
      if (!result.ok) {
        log.warn('Layouts', `${path.basename(file)} ungültig: ${result.errors.join('; ')}`);
        return null;
      }
      return result.layout;
    } catch (err) {
      log.warn('Layouts', `${path.basename(file)} nicht lesbar`, (err as Error).message);
      return null;
    }
  }
}
