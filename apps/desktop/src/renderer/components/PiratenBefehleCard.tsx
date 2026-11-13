// PiratenBefehleCard — Abschnitt „Piraten-Orakel & Befehls-Links" in den
// Einstellungen (direkt unter der Twitch-Verbindung).
//
// Orakel: Bei Twitch-Follows würfelt die APP die Kiste (damit !kiste sie kennt
// und jedes Overlay dieselbe zeigt) — die Herz-Alarm-Einstellungen eines
// einzelnen Overlays kennt sie dabei nicht, darum stehen Chance und Glück hier.
// TikTok-Follows würfelt weiter das Widget selbst mit seinen eigenen Werten.
//
// Links: werden in den Befehls-Antworten als {discord} {tiktok} {insta} eingesetzt.
import { useEffect, useState } from 'react';
import { Anchor } from 'lucide-react';

type Links = { discord: string; tiktok: string; insta: string };
const LEER: Links = { discord: '', tiktok: '', insta: '' };

export default function PiratenBefehleCard() {
  const [chance, setChance] = useState(137500);
  const [glueck, setGlueck] = useState(1000);
  const [links, setLinks] = useState<Links>(LEER);

  useEffect(() => {
    void window.studio.getSettings().then((s: { orakelChance?: number; orakelGlueck?: number; befehlLinks?: Partial<Links> }) => {
      if (typeof s.orakelChance === 'number') setChance(s.orakelChance);
      if (typeof s.orakelGlueck === 'number') setGlueck(s.orakelGlueck);
      setLinks({ ...LEER, ...(s.befehlLinks ?? {}) });
    });
  }, []);

  const speichereLinks = (next: Links) => { void window.studio.updateSettings({ befehlLinks: next }); };

  return (
    <section className="mb-5 break-inside-avoid bx-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold">
        <Anchor size={15} /> Piraten-Orakel &amp; Befehls-Links
      </h2>
      <p className="mb-3 text-[11px] text-studio-muted">
        Folgt dir jemand auf Twitch, würfelt die App seine Orakel-Kiste — einmal pro Stream, für alle Overlays gleich.
        Mit <span className="font-mono">!kiste</span> kann er sie im Chat nachfragen. (TikTok-Follows würfelt weiter der Herz-Alarm selbst.)
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-widest text-studio-muted">Chance 1 : … pro Kiste</span>
          <input
            type="number" min={2} value={chance}
            onChange={(e) => setChance(Number(e.target.value))}
            onBlur={() => { const v = Math.max(2, Math.floor(chance) || 137500); setChance(v); void window.studio.updateSettings({ orakelChance: v }); }}
            className="bx-input font-mono text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-widest text-studio-muted">Glückstreffer bis Kiste</span>
          <input
            type="number" min={0} value={glueck}
            onChange={(e) => setGlueck(Number(e.target.value))}
            onBlur={() => { const v = Math.max(0, Math.floor(glueck) || 0); setGlueck(v); void window.studio.updateSettings({ orakelGlueck: v }); }}
            className="bx-input font-mono text-xs"
          />
        </label>
      </div>

      <p className="mb-2 mt-4 text-[11px] text-studio-muted">
        Links für die Chat-Befehle — in Antworten als <span className="font-mono">{'{discord}'}</span>,{' '}
        <span className="font-mono">{'{tiktok}'}</span> und <span className="font-mono">{'{insta}'}</span>.
      </p>
      {([['discord', 'Discord', 'discord.gg/…'], ['tiktok', 'TikTok', 'tiktok.com/@…'], ['insta', 'Instagram', 'instagram.com/…']] as const).map(([k, label, ph]) => (
        <label key={k} className="mb-2 flex items-center gap-2">
          <span className="w-20 text-[11px] uppercase tracking-widest text-studio-muted">{label}</span>
          <input
            type="text" value={links[k]} placeholder={ph}
            onChange={(e) => setLinks({ ...links, [k]: e.target.value })}
            onBlur={() => speichereLinks(links)}
            className="bx-input flex-1 text-xs"
          />
        </label>
      ))}
    </section>
  );
}
