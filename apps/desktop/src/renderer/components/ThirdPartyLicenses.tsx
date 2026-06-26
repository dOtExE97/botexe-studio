// ThirdPartyLicenses — zeigt die genutzten Open-Source-Bibliotheken in den
// Einstellungen (Attribution direkt in der App, nicht nur im Repo). Daten aus
// third-party-licenses.json (via scripts/build-licenses.mjs generiert).
import { useState } from 'react';
import { Heart, ChevronDown, ExternalLink } from 'lucide-react';
import data from '../lib/third-party-licenses.json';

const REPO_LICENSES = 'https://github.com/dOtExE97/botexe-studio/blob/main/THIRD-PARTY-LICENSES.md';

export default function ThirdPartyLicenses() {
  const [open, setOpen] = useState(false);
  const top = data.byLicense.slice(0, 5).map((b) => `${b.license} ${b.count}`).join(' · ');

  return (
    <div className="bx-card p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-sm font-bold">
        <Heart size={15} className="text-studio-accent" /> Open-Source-Lizenzen
        <span className="ml-auto flex items-center gap-2 text-[11px] font-normal text-studio-muted">
          {data.direct.length} Libs · {data.total} Pakete
          <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <p className="mt-2 text-xs text-studio-muted">
        bOtExE Studio steht auf großartigen Open-Source-Projekten — alle unter permissiven Lizenzen (MIT/ISC/BSD/Apache). 💜 Danke an alle Maintainer!
      </p>

      {open && (
        <div className="mt-3 space-y-1.5">
          {data.direct.map((lib) => (
            <div key={lib.name} className="flex items-center gap-2 rounded-md bg-studio-raised/50 px-2.5 py-1.5 text-xs">
              {lib.repo ? (
                <button onClick={() => void window.studio.openExternal(lib.repo)} className="font-mono font-bold text-studio-teal hover:underline">
                  {lib.name} <ExternalLink size={9} className="inline" />
                </button>
              ) : (
                <span className="font-mono font-bold">{lib.name}</span>
              )}
              <span className="ml-auto rounded bg-studio-bg px-1.5 py-0.5 text-[10px] text-studio-muted">{lib.license}</span>
              {lib.author && <span className="max-w-[35%] truncate text-[10px] text-studio-muted">{lib.author}</span>}
            </div>
          ))}
          <p className="pt-1 text-[10px] text-studio-muted">
            Insgesamt {data.total} Pakete im Abhängigkeitsbaum ({top} …).{' '}
            <button onClick={() => void window.studio.openExternal(REPO_LICENSES)} className="text-studio-teal hover:underline">
              Vollständige Liste & Lizenztexte
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
