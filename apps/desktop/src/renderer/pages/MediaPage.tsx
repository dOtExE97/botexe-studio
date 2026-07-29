// MediaPage — Bilder und Videos verwalten.
//
// Warum es diese Seite gibt: Der Import war bisher NUR im Overlay-Editor
// erreichbar, versteckt in den Eigenschaften eines Medien-Widgets. Wer ein
// Intro-Video hinzufügen wollte, musste erst ein Widget anlegen. Und einen
// Überblick über die eigenen Dateien gab es gar nicht.
//
// Löschen zeigt vorher, WO das Medium überall benutzt wird. Ohne diese Warnung
// verschwindet ein Intro still, und der Streamer merkt es erst, wenn im Stream
// nichts passiert.
import { useCallback, useEffect, useState } from 'react';
import { Images, Upload, Trash2, Play, Search, AlertTriangle } from 'lucide-react';
import { toast } from '../components/ToastHost';
import { passt } from '../../shared/suche';

interface MediaItem {
  id: string;
  filename: string;
  kind: 'image' | 'video';
  url: string;
  sizeBytes: number;
}

interface Verwendung {
  widgets: string[];
  zuschauer: string[];
  regeln: string[];
}

const groesse = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function MediaPage() {
  const [medien, setMedien] = useState<MediaItem[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [suche, setSuche] = useState('');
  const [loeschKandidat, setLoeschKandidat] = useState<{ item: MediaItem; verwendung: Verwendung } | null>(null);

  const laden = useCallback(async () => {
    const list = (await window.studio.listMedia()) as MediaItem[];
    setMedien(list ?? []);
    setGeladen(true);
  }, []);

  useEffect(() => { void laden(); }, [laden]);

  const importieren = async () => {
    const res = (await window.studio.importMedia()) as { ok: boolean; imported?: MediaItem[]; error?: string };
    await laden();
    if (!res?.ok) toast('error', `Import fehlgeschlagen: ${res?.error ?? 'unbekannt'}`);
    else if (res.imported?.length) toast('success', `${res.imported.length} Datei${res.imported.length === 1 ? '' : 'en'} hinzugefügt.`);
  };

  /** Vor dem Löschen nachsehen, was daran hängt. */
  const loeschenFragen = async (item: MediaItem) => {
    const verwendung = (await window.studio.getMediaUsage(item.id)) as Verwendung;
    setLoeschKandidat({ item, verwendung });
  };

  const loeschenAusfuehren = async () => {
    if (!loeschKandidat) return;
    await window.studio.deleteMedia(loeschKandidat.item.id);
    setLoeschKandidat(null);
    await laden();
    toast('info', 'Datei gelöscht.');
  };

  const sichtbar = medien.filter((m) => passt(suche, m.filename));
  const bilder = sichtbar.filter((m) => m.kind === 'image').length;
  const videos = sichtbar.filter((m) => m.kind === 'video').length;

  if (!geladen) return <div className="p-6 text-studio-muted">Lade Medien…</div>;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl uppercase">
            <Images size={20} className="text-studio-accent" /> Bilder &amp; Videos
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-studio-muted">
            Deine Dateien für Intros, Overlay-Einblendungen und Trigger-Aktionen.
            Unterstützt werden <b className="text-studio-text/90">PNG, JPG, GIF, WebP</b> sowie{' '}
            <b className="text-studio-text/90">MP4 und WebM</b>.
          </p>
        </div>
        <button onClick={() => void importieren()} className="bx-btn-accent">
          <Upload size={15} /> Dateien hinzufügen
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-studio-border bg-studio-bg px-2.5 py-1.5">
          <Search size={14} className="text-studio-muted" />
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Datei suchen…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <span className="text-[11px] text-studio-muted">
          {bilder} Bild{bilder === 1 ? '' : 'er'} · {videos} Video{videos === 1 ? '' : 's'}
        </span>
      </div>

      {sichtbar.length === 0 ? (
        <div className="rounded-xl border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          {suche ? 'Nichts gefunden.' : 'Noch keine Dateien.'}
          {!suche && (
            <span className="mt-1 block text-xs text-studio-muted/70">
              Füg ein Bild oder Video hinzu — danach kannst du es einem Zuschauer als Intro geben
              oder in einem Overlay-Widget einblenden.
            </span>
          )}
        </div>
      ) : (
        <div
          className="grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto pr-1"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
        >
          {sichtbar.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded-xl border border-studio-border bg-studio-raised">
              <div className="aspect-video bg-black/40">
                {m.kind === 'video' ? (
                  <video src={m.url} muted loop className="h-full w-full object-cover" onMouseOver={(e) => void e.currentTarget.play()} onMouseOut={(e) => e.currentTarget.pause()} />
                ) : (
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                {m.kind === 'video' && <Play size={10} className="flex-none text-studio-muted" fill="currentColor" />}
                <span className="min-w-0 flex-1 truncate text-[11px]" title={m.filename}>{m.filename}</span>
                <span className="flex-none font-mono text-[9px] text-studio-muted">{groesse(m.sizeBytes)}</span>
                <button
                  onClick={() => void loeschenFragen(m)}
                  title="Löschen"
                  className="flex-none rounded p-1 text-studio-muted opacity-0 transition-opacity hover:text-studio-accent group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Löschen mit Warnung: erst zeigen, was daran hängt. */}
      {loeschKandidat && (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/60 p-6">
          <div className="bx-card max-w-md p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-studio-text">
              <AlertTriangle size={16} className="text-studio-accent" />
              „{loeschKandidat.item.filename}" löschen?
            </h2>
            <Betroffen verwendung={loeschKandidat.verwendung} />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setLoeschKandidat(null)} className="bx-pill px-4 py-1.5">Abbrechen</button>
              <button
                onClick={() => void loeschenAusfuehren()}
                className="rounded-lg bg-studio-accent px-4 py-1.5 text-sm font-bold text-black hover:opacity-90"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Was hängt an dieser Datei? Klartext statt einer stillen Löschung. */
function Betroffen({ verwendung }: { verwendung: Verwendung }) {
  const { widgets, zuschauer, regeln } = verwendung;
  const nichts = widgets.length + zuschauer.length + regeln.length === 0;

  if (nichts) {
    return (
      <p className="mt-2 text-xs leading-relaxed text-studio-muted">
        Die Datei wird nirgends verwendet — sie kann gefahrlos weg.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2 text-xs leading-relaxed">
      <p className="text-studio-accent">Diese Datei ist noch im Einsatz. Nach dem Löschen passiert dort nichts mehr:</p>
      {zuschauer.length > 0 && (
        <p className="text-studio-muted">
          <b className="text-studio-text/90">Intro von:</b> {zuschauer.slice(0, 6).join(', ')}
          {zuschauer.length > 6 && ` und ${zuschauer.length - 6} weiteren`}
        </p>
      )}
      {widgets.length > 0 && (
        <p className="text-studio-muted">
          <b className="text-studio-text/90">Widgets:</b> {widgets.slice(0, 4).join(', ')}
          {widgets.length > 4 && ` und ${widgets.length - 4} weitere`}
        </p>
      )}
      {regeln.length > 0 && (
        <p className="text-studio-muted">
          <b className="text-studio-text/90">Trigger-Regeln:</b> {regeln.slice(0, 4).join(', ')}
          {regeln.length > 4 && ` und ${regeln.length - 4} weitere`}
        </p>
      )}
    </div>
  );
}
