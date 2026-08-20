// StickerPage — die Sticker, die im Stream durchgekommen sind, mit Sound belegen.
//
// Gebaut wie die Geschenke-Galerie, mit EINEM wichtigen Unterschied: Diese Seite
// hat keinen eigenen Regelspeicher. Ein zugewiesener Sound wird eine ganz
// normale Trigger-Regel (sticker-mapping.ts) — dieselbe, die auf der
// Trigger-Seite steht und dort um Video, Overlay oder Bedingungen erweitert
// werden kann.
//
// Warum die Liste erst mit der Zeit voll wird: TikTok gibt die Sticker eines
// Kanals nicht heraus. Untersucht und ausgeschlossen am 20.08.2026 — die
// Begründung steht im Kopf von main/services/sticker-catalog.ts.
import { useEffect, useMemo, useState } from 'react';
import { Search, Volume2, Play, Trash2, Pencil, Check, X, Info } from 'lucide-react';
import type { TriggerRule, TriggerAction } from '@botexe/trigger-engine';
import { findStickerRule, upsertStickerRule, otherStickerRules } from '@botexe/trigger-engine';
import { useStickerCatalog, stickerName, type StickerEintrag } from '../hooks/useStickerCatalog';
import { passt } from '../../shared/suche';
import { toast } from '../components/ToastHost';

interface SoundEntry { id: string; filename: string }

type Sortierung = 'zuletzt' | 'haeufig' | 'name';

const SORTIERUNGEN: { id: Sortierung; label: string }[] = [
  { id: 'zuletzt', label: 'Zuletzt gesehen' },
  { id: 'haeufig', label: 'Am häufigsten' },
  { id: 'name', label: 'Name' },
];

export default function StickerPage() {
  const { sticker, geladen, neuLaden } = useStickerCatalog();
  const [regeln, setRegeln] = useState<TriggerRule[]>([]);
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [q, setQ] = useState('');
  const [sortierung, setSortierung] = useState<Sortierung>('zuletzt');
  const [umbenennt, setUmbenennt] = useState<string | null>(null);
  const [nameEntwurf, setNameEntwurf] = useState('');

  useEffect(() => {
    void (async () => {
      setRegeln((await window.studio.getRules()) as TriggerRule[]);
      setSounds((await window.studio.listSounds()) as SoundEntry[]);
    })();
  }, []);

  const regelnSpeichern = (naechste: TriggerRule[]) => {
    setRegeln(naechste);
    void window.studio.setRules(naechste as unknown as unknown[]);
  };

  const soundSetzen = (e: StickerEintrag, soundId: string) => {
    // TriggerAction ist FLACH: { kind: 'play_sound', soundId }. Hier stand
    // einmal ein verschachteltes { kind: { kind: … } }, versteckt hinter einem
    // `as unknown as`-Cast — die Regel wäre beim Speichern still verworfen
    // worden (validateTriggerAction erwartet einen Text in `kind`), und die
    // Sticker-Seite hätte gar nichts ausgelöst.
    const aktionen: TriggerAction[] = soundId ? [{ kind: 'play_sound', soundId }] : [];
    regelnSpeichern(upsertStickerRule(regeln, e.id, aktionen, e.eigenerName));
    toast('success', soundId
      ? `Sound gesetzt — ${stickerName(e)} spielt ihn ab sofort.`
      : `Sound entfernt — ${stickerName(e)} löst nichts mehr aus.`);
  };

  const namenSpeichern = (id: string) => {
    void window.studio.setStickerName(id, nameEntwurf).then(() => {
      setUmbenennt(null);
      neuLaden();
    });
  };

  const gefiltert = useMemo(() => {
    const suche = q.trim();
    // Tolerante Suche über eigenen Namen UND Nummer — wer den Namen nicht
    // vergeben hat, sucht zwangsläufig nach der Nummer.
    const liste = suche
      ? sticker.filter((e) => passt(suche, e.eigenerName ?? '', e.id, e.paket ?? ''))
      : [...sticker];
    return liste.sort((a, b) => {
      if (sortierung === 'haeufig') return b.anzahl - a.anzahl;
      if (sortierung === 'name') return stickerName(a).localeCompare(stickerName(b), 'de');
      return b.zuletztGesehen - a.zuletztGesehen;
    });
  }, [sticker, q, sortierung]);

  return (
    <div className="p-5 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-studio-gold">Sticker</h1>
        <p className="text-sm text-studio-muted">
          {sticker.length === 0
            ? 'Noch keine Sticker gesehen.'
            : `${sticker.length} Sticker gesehen · ${sticker.filter((e) => findStickerRule(regeln, e.id)).length} mit Sound belegt`}
        </p>
      </header>

      {/* Erklärt beides auf einmal: warum die Liste wächst statt vollständig zu
          sein, und dass eine Sticker-Nachricht auch Chat-Regeln auslöst. */}
      <div className="flex gap-2 rounded-lg border border-studio-border bg-studio-panel/50 p-3 text-sm text-studio-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-studio-teal" />
        <div className="space-y-1">
          <p>
            TikTok gibt die Sticker deines Kanals nicht vorab heraus — sie erscheinen hier,
            sobald jemand im Stream einen schickt. Am schnellsten geht es, wenn du sie einmal
            selbst per Handy in deinen eigenen Live schickst.
          </p>
          <p>
            Eine Chat-Nachricht mit Sticker löst <strong>beides</strong> aus: deine
            Chat-Regeln und deine Sticker-Regeln.
          </p>
        </div>
      </div>

      {sticker.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-studio-border bg-studio-panel px-3 py-2">
            <Search size={14} className="text-studio-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sticker suchen (Name oder Nummer)…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={sortierung}
            onChange={(e) => setSortierung(e.target.value as Sortierung)}
            className="bx-select w-44"
          >
            {SORTIERUNGEN.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}

      {!geladen && <p className="text-sm text-studio-muted">Lade…</p>}

      {geladen && sticker.length === 0 && (
        <div className="rounded-lg border border-dashed border-studio-border p-8 text-center text-sm text-studio-muted">
          Sobald im Stream der erste Sticker durchkommt, steht er hier — mit Bild,
          und du kannst ihm einen Sound geben.
        </div>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
        {gefiltert.map((e) => {
          const regel = findStickerRule(regeln, e.id);
          const erste = regel?.actions?.[0];
          const soundId = erste?.kind === 'play_sound' ? erste.soundId : '';
          const fremde = otherStickerRules(regeln, e.id);
          return (
            <div key={e.id} className="space-y-2 rounded-xl border border-studio-border bg-studio-panel p-3">
              <div
                className="grid h-24 place-items-center rounded-lg"
                style={{ background: e.farbe ?? 'rgba(255,255,255,.04)' }}
              >
                {/* Kein Alt-Text mit Nummer: der stünde bei fehlendem Bild als
                    kryptische Zahl da. Der Name steht ohnehin darunter. */}
                <img src={e.bild} alt="" className="max-h-20 max-w-20 object-contain" />
              </div>

              {umbenennt === e.id ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={nameEntwurf}
                    onChange={(ev) => setNameEntwurf(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') namenSpeichern(e.id);
                      if (ev.key === 'Escape') setUmbenennt(null);
                    }}
                    placeholder="eigener Name"
                    className="bx-input flex-1 text-sm"
                  />
                  <button onClick={() => namenSpeichern(e.id)} title="Speichern" className="p-1 text-studio-teal">
                    <Check size={15} />
                  </button>
                  <button onClick={() => setUmbenennt(null)} title="Abbrechen" className="p-1 text-studio-muted">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm" title={`Nummer: ${e.id}`}>{stickerName(e)}</span>
                  <button
                    onClick={() => { setUmbenennt(e.id); setNameEntwurf(e.eigenerName ?? ''); }}
                    title="Eigenen Namen vergeben (TikTok liefert keinen mit)"
                    className="p-1 text-studio-muted hover:text-studio-teal"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}

              <p className="text-xs text-studio-muted">
                {e.anzahl}× gesehen{e.paket ? ` · ${e.paket}` : ''}
              </p>

              <div className="flex items-center gap-1">
                <Volume2 size={14} className="shrink-0 text-studio-muted" />
                <select
                  value={soundId}
                  onChange={(ev) => soundSetzen(e, ev.target.value)}
                  className="bx-select flex-1 text-xs"
                >
                  <option value="">— kein Sound —</option>
                  {sounds.map((s) => <option key={s.id} value={s.id}>{s.filename}</option>)}
                </select>
                {soundId && (
                  <>
                    <button
                      onClick={() => void window.studio.testSound(soundId)}
                      title="Anhören"
                      className="p-1 text-studio-muted hover:text-studio-teal"
                    >
                      <Play size={14} />
                    </button>
                    <button
                      onClick={() => soundSetzen(e, '')}
                      title="Sound entfernen"
                      className="p-1 text-studio-muted hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>

              {fremde.length > 0 && (
                // Ehrlich bleiben: sonst wundert sich der Streamer, warum noch
                // etwas passiert, obwohl hier „kein Sound" steht.
                <p className="text-xs text-studio-gold">
                  Auf der Trigger-Seite hängt {fremde.length === 1 ? 'noch eine Regel' : `hängen noch ${fremde.length} Regeln`} an diesem Sticker.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
