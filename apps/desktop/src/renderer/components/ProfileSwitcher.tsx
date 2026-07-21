// ProfileSwitcher — Umschalter für Konfigurations-Profile (Topbar). Wechseln
// sichert serverseitig erst den aktuellen Stand; danach lädt die App neu, damit
// alle Seiten die Daten des neuen Profils ziehen.
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Pencil, Trash2, Check, X, FolderSync, Download } from 'lucide-react';
import { toast } from './ToastHost';

interface ProfileMeta { id: string; name: string; source?: string }
interface ImportResult {
  ok: boolean; profileId?: string; profileName?: string; error?: string;
  summary?: { triggers: number; commands: number; sounds: number; widgets: number };
  imported?: string[]; skipped?: string[];
}

export default function ProfileSwitcher() {
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () =>
    void window.studio.listProfiles().then((r: { profiles: ProfileMeta[]; activeId: string | null }) => {
      setProfiles(r.profiles); setActiveId(r.activeId);
    });
  useEffect(() => { load(); }, []);

  // Import auch von außerhalb des Profil-Menüs auslösbar (Settings-Karte, Startklar).
  useEffect(() => {
    const onImport = () => void doImport();
    window.addEventListener('bx-tikfinity-import', onImport);
    return () => window.removeEventListener('bx-tikfinity-import', onImport);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setEditId(null); setCreating(false); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = profiles.find((p) => p.id === activeId);

  const doSwitch = async (id: string) => {
    if (id === activeId || busy) return;
    setBusy(true);
    const r = await window.studio.switchProfile(id);
    if (r.ok) { toast('info', 'Profil gewechselt — lade neu…'); setTimeout(() => window.location.reload(), 400); }
    else { toast('error', r.error ?? 'Wechsel fehlgeschlagen'); setBusy(false); }
  };

  const doCreate = async () => {
    const name = draft.trim();
    if (!name) return;
    const r = await window.studio.createProfile(name);
    setCreating(false); setDraft('');
    if (r.ok) { toast('success', `Profil „${name}" angelegt (Snapshot vom aktuellen Stand)`); load(); }
  };

  const doRename = async (id: string) => {
    const name = draft.trim();
    if (name) { await window.studio.renameProfile(id, name); load(); }
    setEditId(null); setDraft('');
  };

  const doDelete = async (id: string, name: string) => {
    const r = await window.studio.deleteProfile(id);
    if (r.ok) { toast('info', `Profil „${name}" gelöscht`); load(); }
    else toast('warn', r.error ?? 'Löschen nicht möglich');
  };

  const doImport = async () => {
    if (busy) return;
    setBusy(true); setOpen(false);
    toast('info', 'TikFinity-Import läuft — Sounds werden geladen…');
    const r = await window.studio.importTikfinity() as ImportResult;
    setBusy(false);
    if (r?.ok) { load(); setImportResult(r); }            // Ergebnis-Dialog statt flüchtigem Toast
    else if (r?.error !== 'abgebrochen') toast('error', r?.error ?? 'Import fehlgeschlagen');
  };

  // „Jetzt aktivieren" aus dem Ergebnis-Dialog: auf das importierte Profil wechseln.
  const activateImported = () => {
    const id = importResult?.profileId;
    setImportResult(null);
    if (id) void doSwitch(id);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="clip-slant flex items-center gap-2 border border-studio-border bg-studio-raised px-3 py-1.5 text-[11px] font-bold tracking-wide text-studio-text transition-colors hover:border-studio-accent/50 disabled:opacity-60"
        title="Profil wechseln"
      >
        <FolderSync size={13} className="text-studio-accent" />
        <span className="max-w-[140px] truncate">{active?.name ?? 'Profil'}</span>
        <ChevronDown size={13} className="text-studio-muted" />
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-1 w-64 rounded-xl border border-studio-border bg-studio-panel p-1.5 shadow-2xl">
          {profiles.map((p) => (
            <div key={p.id} className={`group flex items-center gap-1 rounded-lg px-1 ${p.id === activeId ? 'bg-studio-accent/15' : 'hover:bg-studio-raised'}`}>
              {editId === p.id ? (
                <input
                  autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void doRename(p.id); if (e.key === 'Escape') { setEditId(null); setDraft(''); } }}
                  className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none"
                />
              ) : (
                <button onClick={() => void doSwitch(p.id)} className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs">
                  {p.id === activeId ? <Check size={13} className="flex-none text-studio-accent" /> : <span className="w-[13px]" />}
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.source === 'tikfinity' && <span className="flex-none rounded bg-studio-gold/20 px-1 text-[8px] font-bold text-studio-gold">TF</span>}
                </button>
              )}
              {editId === p.id ? (
                <button onClick={() => void doRename(p.id)} className="flex-none p-1 text-studio-accent"><Check size={13} /></button>
              ) : (
                <div className="flex flex-none opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => { setEditId(p.id); setDraft(p.name); }} className="p-1 text-studio-muted hover:text-studio-text" title="Umbenennen"><Pencil size={12} /></button>
                  {p.id !== activeId && profiles.length > 1 && (
                    <button onClick={() => void doDelete(p.id, p.name)} className="p-1 text-studio-muted hover:text-studio-accent" title="Löschen"><Trash2 size={12} /></button>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="my-1 border-t border-studio-border/60" />

          {creating ? (
            <div className="flex items-center gap-1 px-1">
              <input
                autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Profilname…"
                onKeyDown={(e) => { if (e.key === 'Enter') void doCreate(); if (e.key === 'Escape') { setCreating(false); setDraft(''); } }}
                className="flex-1 bg-studio-bg px-2 py-1.5 text-xs outline-none rounded-md"
              />
              <button onClick={() => void doCreate()} className="p-1 text-studio-accent"><Check size={14} /></button>
              <button onClick={() => { setCreating(false); setDraft(''); }} className="p-1 text-studio-muted"><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => { setCreating(true); setDraft(''); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-studio-muted hover:bg-studio-raised hover:text-studio-text">
              <Plus size={13} /> Neues Profil (vom aktuellen Stand)
            </button>
          )}
          <button onClick={() => void doImport()} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-studio-gold hover:bg-studio-raised">
            <Download size={13} /> Aus TikFinity importieren…
          </button>
        </div>
      )}

      {importResult?.ok && (
        <ImportResultModal result={importResult} onActivate={activateImported} onClose={() => setImportResult(null)} />
      )}
    </div>
  );
}

/** Ergebnis-Dialog nach dem TikFinity-Import: was kam rein, was nicht — und der
 *  entscheidende „jetzt aktivieren"-Knopf (sonst denkt man, es sei nichts passiert). */
function ImportResultModal({ result, onActivate, onClose }: { result: ImportResult; onActivate: () => void; onClose: () => void }) {
  const s = result.summary;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-studio-border bg-studio-panel p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-2xl">✅</span>
          <h2 className="font-display text-lg">TikFinity importiert</h2>
        </div>
        <p className="mb-4 text-xs text-studio-muted">
          Als Profil <b className="text-studio-text">„{result.profileName}"</b> angelegt. Aktiviere es, um dein Setup zu übernehmen — dein aktuelles Profil bleibt unangetastet.
        </p>

        {s && (
          <div className="mb-4 grid grid-cols-4 gap-2 text-center">
            {[['Trigger', s.triggers], ['Befehle', s.commands], ['Sounds', s.sounds], ['Widgets', s.widgets]].map(([label, n]) => (
              <div key={label as string} className="rounded-lg bg-studio-raised/50 py-2">
                <div className="text-xl font-bold text-studio-text" style={{ fontFamily: 'var(--font-chunky)' }}>{n as number}</div>
                <div className="text-[10px] uppercase tracking-wider text-studio-muted">{label as string}</div>
              </div>
            ))}
          </div>
        )}

        {!!result.imported?.length && (
          <div className="mb-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-400">Übernommen</div>
            <ul className="space-y-0.5 text-xs text-studio-text/90">
              {result.imported.map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-400">✓</span> {t}</li>)}
            </ul>
          </div>
        )}

        {!!result.skipped?.length && (
          <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">Nicht übernommen (manuell nachbauen)</div>
            <ul className="space-y-0.5 text-[11px] text-studio-muted">
              {result.skipped.map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-amber-400">•</span> {t}</li>)}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onActivate} className="bx-btn-accent flex-1 py-2.5 font-display text-sm tracking-wide">Profil jetzt aktivieren →</button>
          <button onClick={onClose} className="bx-pill px-4 text-xs hover:text-studio-text">Später</button>
        </div>
      </div>
    </div>
  );
}
