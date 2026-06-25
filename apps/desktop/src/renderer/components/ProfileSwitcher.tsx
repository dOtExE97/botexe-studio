// ProfileSwitcher — Umschalter für Konfigurations-Profile (Topbar). Wechseln
// sichert serverseitig erst den aktuellen Stand; danach lädt die App neu, damit
// alle Seiten die Daten des neuen Profils ziehen.
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Pencil, Trash2, Check, X, FolderSync, Download } from 'lucide-react';
import { toast } from './ToastHost';

interface ProfileMeta { id: string; name: string; source?: string }

export default function ProfileSwitcher() {
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () =>
    void window.studio.listProfiles().then((r: { profiles: ProfileMeta[]; activeId: string | null }) => {
      setProfiles(r.profiles); setActiveId(r.activeId);
    });
  useEffect(() => { load(); }, []);

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
    toast('info', 'TikFinity-Import wird vorbereitet…');
    const r = await window.studio.importTikfinity() as { ok: boolean; error?: string; report?: string; profileName?: string };
    setBusy(false);
    if (r?.ok) { toast('success', `Importiert als „${r.profileName}". ${r.report ?? ''}`.trim()); load(); }
    else if (r?.error !== 'abgebrochen') toast('error', r?.error ?? 'Import fehlgeschlagen');
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
    </div>
  );
}
