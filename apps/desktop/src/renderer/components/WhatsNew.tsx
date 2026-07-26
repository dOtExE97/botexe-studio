// WhatsNew — Popup „Was ist neu?" nach einem Auto-Update. Quelle ist die
// gepackte CHANGELOG.md (offline, kein GitHub-API-Call), geparst im Main-Prozess
// und per IPC geholt (window.studio.getChangelog()). Erscheint NIE beim
// Erstinstall (das übernimmt OnboardingTour) — dafür merkt es sich beim ersten
// Start einfach nur die aktuelle Version, ohne etwas zu zeigen.
// Wiederholbar über Einstellungen → „Was ist neu?" (Fenster-Event 'bx-show-whats-new'),
// analog zu OnboardingTour/'bx-show-tour'.
import { useEffect, useState, type ReactNode } from 'react';
import { X, Sparkles } from 'lucide-react';
import { entriesSince, type ChangelogEntry } from '../../shared/changelog';

const SEEN_KEY = 'bx-whats-new-seen-version';

/** Sehr kleiner, gezielter Inline-Renderer für die paar Markdown-Konstrukte, die
 *  im Changelog wirklich vorkommen: **fett** und [Link](url). Kein Parser für
 *  beliebiges Markdown — nur React-Elemente, kein dangerouslySetInnerHTML. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<span key={`${keyPrefix}-t${i}`}>{text.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      nodes.push(<b key={`${keyPrefix}-b${i}`}>{m[1]}</b>);
    } else if (m[2] !== undefined && m[3] !== undefined) {
      const url = m[3];
      nodes.push(
        <a
          key={`${keyPrefix}-a${i}`}
          href={url}
          onClick={(e) => { e.preventDefault(); if (/^https?:\/\//.test(url)) void window.studio.openExternal(url); }}
          className="text-studio-teal underline decoration-dotted underline-offset-2 hover:text-studio-accent"
        >
          {m[2]}
        </a>,
      );
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(<span key={`${keyPrefix}-t${i}`}>{text.slice(last)}</span>);
  return nodes;
}

/** Markdown-Rumpf einer Changelog-Sektion → lesbare Blöcke: `###`-Überschriften,
 *  `-`/`*`-Listen (zusammengefasst) und normale Absätze — jeweils inline-verarbeitet. */
function renderBody(body: string): ReactNode {
  const lines = body.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let bulletBuf: string[] = [];
  let paraBuf: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletBuf.length) {
      const items = bulletBuf;
      blocks.push(
        <ul key={`ul-${key++}`} className="my-1.5 ml-4 list-disc space-y-1 marker:text-studio-muted">
          {items.map((b, i) => <li key={i}>{renderInline(b, `li${key}-${i}`)}</li>)}
        </ul>,
      );
      bulletBuf = [];
    }
  };
  const flushPara = () => {
    if (paraBuf.length) {
      const text = paraBuf.join(' ');
      blocks.push(<p key={`p-${key++}`} className="my-1.5">{renderInline(text, `p${key}`)}</p>);
      paraBuf = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushBullets(); flushPara(); continue; }
    const heading = /^###\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets(); flushPara();
      blocks.push(<h4 key={`h-${key++}`} className="mb-1 mt-3 font-display text-sm text-studio-gold first:mt-0">{renderInline(heading[1]!, `h${key}`)}</h4>);
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) { flushPara(); bulletBuf.push(bullet[1]!); continue; }
    flushBullets();
    paraBuf.push(line);
  }
  flushBullets(); flushPara();
  return blocks;
}

export default function WhatsNew() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [open, setOpen] = useState(false);

  const load = async (mode: 'auto' | 'reopen') => {
    let data: { version: string; entries: ChangelogEntry[] };
    try {
      data = await window.studio.getChangelog();
    } catch {
      return; // kein Changelog erreichbar — lieber gar nichts zeigen als kaputtes Popup
    }
    const all = data.entries ?? [];
    const version = data.version ?? '';
    if (!version || all.length === 0) return;

    if (mode === 'reopen') {
      // Reopen aus den Einstellungen: nur der neueste Eintrag, wie angefordert.
      setEntries(all.slice(0, 1));
      setOpen(true);
      return;
    }

    const seen = localStorage.getItem(SEEN_KEY);
    if (!seen) {
      // Erstinstallation: OnboardingTour übernimmt die Begrüßung — hier nur
      // stillschweigend merken, nichts zeigen.
      localStorage.setItem(SEEN_KEY, version);
      return;
    }
    const newer = entriesSince(all, seen);
    if (newer.length > 0) {
      setEntries(newer);
      setOpen(true);
    }
    localStorage.setItem(SEEN_KEY, version);
  };

  useEffect(() => {
    void load('auto');
    const reopen = () => { void load('reopen'); };
    window.addEventListener('bx-show-whats-new', reopen);
    return () => window.removeEventListener('bx-show-whats-new', reopen);
  }, []);

  if (!open || entries.length === 0) return null;
  const newest = entries[0]!;
  const finish = () => setOpen(false);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={finish}>
      <div
        className="bx-card relative mx-4 flex max-h-[80vh] w-full max-w-lg flex-col p-6"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'bx-toast-in 240ms cubic-bezier(.2,1.3,.35,1)' }}
      >
        <button onClick={finish} className="absolute right-3 top-3 text-studio-muted hover:text-studio-text" title="Schließen">
          <X size={18} />
        </button>

        <div className="mb-3 flex flex-none items-center gap-3 pr-6">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-studio-accent/15 text-studio-accent">
            <Sparkles size={24} />
          </div>
          <h2 className="font-display text-lg leading-tight text-studio-text">Was ist neu in v{newest.version}?</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-relaxed text-studio-text/85">
          {entries.map((e, i) => (
            <div key={e.version} className={i > 0 ? 'mt-5 border-t border-studio-border pt-4' : ''}>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-studio-muted">v{e.version} — {e.date}</div>
              {renderBody(e.body)}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-none justify-end">
          <button onClick={finish} className="bx-btn-accent px-4 py-1.5 text-xs">Alles klar</button>
        </div>
      </div>
    </div>
  );
}
