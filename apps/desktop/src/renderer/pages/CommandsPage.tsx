// CommandsPage — Chat-Befehle („Bot"): !befehl → Antwort. Die App liest den
// Chat mit; passt ein Befehl, antwortet sie per Overlay-Vorlesen (TTS) und/oder
// schreibt direkt in den TikTok-Chat (wenn eingeloggt). Mit Cooldown + Rechten.
import { useEffect, useState } from 'react';
import { Terminal, Plus, Trash2, Power, Play, Mic, MessageSquare, Copy } from 'lucide-react';
import type { ChatCommand } from '@botexe/trigger-engine';
import ConfirmButton from '../components/ConfirmButton';
import { toast } from '../components/ToastHost';

const WHO: { value: NonNullable<ChatCommand['who']>; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'followers', label: 'Follower+' },
  { value: 'subs', label: 'Teamherz/Sub+' },
  { value: 'mods', label: 'Nur Mods' },
];

function newCommand(): ChatCommand {
  return { id: `cmd-${Date.now().toString(36)}`, command: '!discord', response: 'Komm auf meinen Discord: …', speak: true, sendToChat: false, who: 'all', cooldownMs: 5000, enabled: true };
}

export default function CommandsPage() {
  const [cmds, setCmds] = useState<ChatCommand[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void window.studio.getCommands().then((c: ChatCommand[]) => { setCmds(c); setLoaded(true); });
  }, []);

  const save = (next: ChatCommand[]) => { setCmds(next); void window.studio.setCommands(next as unknown as unknown[]); };
  const patch = (id: string, p: Partial<ChatCommand>) => save(cmds.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const duplicate = (c: ChatCommand) => save([...cmds, { ...c, id: `cmd-${Date.now().toString(36)}`, command: `${c.command}2` }]);
  const test = (c: ChatCommand) => { void window.studio.sendChat(c.response).then(() => undefined); toast('info', `„${c.command}" — Antwort getestet (Senden braucht TikTok-Login).`); };

  if (!loaded) return <div className="p-6 text-studio-muted">Lade…</div>;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl uppercase"><Terminal size={20} className="text-studio-accent" /> Chat-Befehle</h1>
          <p className="mt-1 max-w-2xl text-xs text-studio-muted">
            Zuschauer tippen z.B. <span className="font-mono">!discord</span> — die App antwortet per Vorlesen (TTS) und/oder schreibt direkt in den Chat. Platzhalter: <span className="font-mono">{'{user}'}</span>, <span className="font-mono">{'{text}'}</span>.
          </p>
        </div>
        <button onClick={() => save([...cmds, newCommand()])} className="bx-btn-accent"><Plus size={15} /> Neuer Befehl</button>
      </div>

      {cmds.length === 0 && (
        <div className="rounded-xl border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          Noch keine Befehle. Beispiel: <span className="font-mono">!discord</span> → „Komm auf meinen Discord!" (vorgelesen).
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {cmds.map((c) => (
          <div key={c.id} className={`bx-card p-4 transition-opacity ${c.enabled ? '' : 'opacity-60'}`}>
            <div className="mb-3 flex items-center gap-2">
              <button onClick={() => patch(c.id, { enabled: !c.enabled })} className={`clip-slant flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-widest ${c.enabled ? 'bg-studio-teal/15 text-studio-teal' : 'bg-studio-raised text-studio-muted'}`}>
                <Power size={11} /> {c.enabled ? 'AKTIV' : 'AUS'}
              </button>
              <input value={c.command} onChange={(e) => patch(c.id, { command: e.target.value })} className="flex-1 bg-transparent font-mono text-sm outline-none" placeholder="!befehl" />
              <button onClick={() => test(c)} className="flex items-center gap-1 text-[11px] text-studio-muted hover:text-studio-teal"><Play size={13} /> Test</button>
              <button onClick={() => duplicate(c)} className="flex items-center gap-1 text-[11px] text-studio-muted hover:text-studio-text"><Copy size={13} /> Kopie</button>
              <ConfirmButton onConfirm={() => save(cmds.filter((x) => x.id !== c.id))} className="flex items-center gap-1 text-[11px] text-studio-muted hover:text-studio-accent"><Trash2 size={13} /> Löschen</ConfirmButton>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-studio-muted">Antwort</span>
              <input value={c.response} onChange={(e) => patch(c.id, { response: e.target.value })} placeholder="Antwort-Text… {user} möglich" className="bx-input" />
            </label>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-studio-muted">
                <input type="checkbox" checked={c.speak} onChange={(e) => patch(c.id, { speak: e.target.checked })} className="accent-[#21e6c1]" /> <Mic size={12} /> Vorlesen
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-studio-muted" title="Schreibt direkt in den TikTok-Chat (braucht Login in den Einstellungen)">
                <input type="checkbox" checked={c.sendToChat} onChange={(e) => patch(c.id, { sendToChat: e.target.checked })} className="accent-[#21e6c1]" /> <MessageSquare size={12} /> In Chat senden
              </label>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-studio-muted">
                Wer
                <select value={c.who ?? 'all'} onChange={(e) => patch(c.id, { who: e.target.value as ChatCommand['who'] })} className="bx-select" style={{ width: 'auto', padding: '4px 8px' }}>
                  {WHO.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-studio-muted">
                Cooldown (s)
                <input type="number" min={0} value={(c.cooldownMs ?? 0) / 1000} onChange={(e) => patch(c.id, { cooldownMs: Math.max(0, Number(e.target.value)) * 1000 })} className="bx-input font-mono" style={{ width: '4.5rem' }} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
