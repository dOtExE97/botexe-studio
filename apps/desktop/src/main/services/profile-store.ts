// profile-store.ts — benannte Konfigurations-Profile. Ein Profil ist ein
// Snapshot des Config-Bundles (settings + layouts + viewers, wie exportConfig).
// Zwischen Profilen kann umgeschaltet werden; der aktuelle Stand wird dabei
// vorher ins aktive Profil gesichert (kein Datenverlust). Reine Persistenz —
// das Anwenden/Auslesen der Config erledigt Studio.
import fs from 'node:fs';
import path from 'node:path';

export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Herkunft — z.B. 'tikfinity' für importierte Profile (UI-Badge). */
  source?: string;
}
export interface ProfileData extends ProfileMeta {
  bundle: Record<string, unknown>;
}

const SAFE_ID = /[^a-zA-Z0-9_-]/g;

export class ProfileStore {
  private readonly dir: string;
  private readonly activeFile: string;

  constructor(userDataDir: string) {
    this.dir = path.join(userDataDir, 'profiles');
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch { /* egal */ }
    this.activeFile = path.join(this.dir, '_active.json');
  }

  private fileFor(id: string): string {
    return path.join(this.dir, `${id.replace(SAFE_ID, '')}.json`);
  }

  /** Eindeutige ID aus Name + Zeitstempel (kollisionsarm, dateisystemsicher). */
  private makeId(name: string, now: number): string {
    const base = name.toLowerCase().replace(SAFE_ID, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'profil';
    return `${base}-${now.toString(36)}`;
  }

  list(): ProfileMeta[] {
    let files: string[] = [];
    try { files = fs.readdirSync(this.dir); } catch { return []; }
    const out: ProfileMeta[] = [];
    for (const f of files) {
      if (!f.endsWith('.json') || f === '_active.json') continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')) as ProfileData;
        if (d?.id && d?.name) out.push({ id: d.id, name: d.name, createdAt: d.createdAt, updatedAt: d.updatedAt, source: d.source });
      } catch { /* defekte Datei überspringen */ }
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): ProfileData | null {
    try { return JSON.parse(fs.readFileSync(this.fileFor(id), 'utf8')) as ProfileData; } catch { return null; }
  }

  /** Neues Profil aus einem Config-Bundle anlegen. */
  create(name: string, bundle: Record<string, unknown>, now: number, source?: string): ProfileData {
    const p: ProfileData = { id: this.makeId(name, now), name: name.slice(0, 60) || 'Profil', bundle, createdAt: now, updatedAt: now, ...(source ? { source } : {}) };
    fs.writeFileSync(this.fileFor(p.id), JSON.stringify(p));
    return p;
  }

  /** Bundle eines bestehenden Profils aktualisieren (beim Umschalten/Speichern). */
  saveBundle(id: string, bundle: Record<string, unknown>, now: number): boolean {
    const p = this.get(id);
    if (!p) return false;
    p.bundle = bundle; p.updatedAt = now;
    fs.writeFileSync(this.fileFor(id), JSON.stringify(p));
    return true;
  }

  rename(id: string, name: string, now: number): boolean {
    const p = this.get(id);
    if (!p) return false;
    p.name = name.slice(0, 60) || p.name; p.updatedAt = now;
    fs.writeFileSync(this.fileFor(id), JSON.stringify(p));
    return true;
  }

  delete(id: string): void {
    try { fs.unlinkSync(this.fileFor(id)); } catch { /* egal */ }
    if (this.getActiveId() === id) this.setActiveId(null);
  }

  getActiveId(): string | null {
    try { return (JSON.parse(fs.readFileSync(this.activeFile, 'utf8')) as { activeId: string }).activeId ?? null; } catch { return null; }
  }
  setActiveId(id: string | null): void {
    try { fs.writeFileSync(this.activeFile, JSON.stringify({ activeId: id })); } catch { /* egal */ }
  }
}
