// KeyWizard — geführter Assistent für die eulerstream-Key-Beschaffung, DIE
// Stolperstelle für neue Streamer. Ein Fenster, drei klare Schritte, und zwei
// Automatiken: (1) kopierte euler_-Keys werden aus der Zwischenablage erkannt
// (nur solange der Assistent offen ist), (2) der Key wird SOFORT gegen die
// eulerstream-API geprüft — „funktioniert" sieht man hier, nicht erst beim
// Verbinden. Öffnen via Fenster-Event 'bx-key-wizard' (Live-Seite, Tour, Settings).
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, ExternalLink, X, CheckCircle2, XCircle, Loader2, ClipboardPaste } from 'lucide-react';
import { toast } from './ToastHost';

type TestState = 'idle' | 'testing' | 'valid' | 'invalid' | 'offline';

export default function KeyWizard() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [test, setTest] = useState<TestState>('idle');
  const [saved, setSaved] = useState(false);
  const testedKey = useRef(''); // letzter geprüfter Wert (kein Doppel-Test)

  useEffect(() => {
    const show = () => { setOpen(true); setKey(''); setTest('idle'); setSaved(false); testedKey.current = ''; };
    window.addEventListener('bx-key-wizard', show);
    return () => window.removeEventListener('bx-key-wizard', show);
  }, []);

  // Key sofort prüfen + bei Erfolg direkt speichern (ein Schritt weniger).
  const validate = useCallback(async (candidate: string) => {
    const k = candidate.trim();
    if (!k || testedKey.current === k) return;
    testedKey.current = k;
    setTest('testing');
    const result = await window.studio.testSignKey(k);
    if (result.ok) {
      setTest('valid');
      await window.studio.updateSettings({ tiktokSignApiKey: k });
      setSaved(true);
      // Live-Seite/Settings sofort informieren (Key-Gate verschwindet ohne Neustart).
      window.dispatchEvent(new CustomEvent('bx-key-saved'));
      toast('success', 'Key geprüft & gespeichert — du kannst verbinden! 🎉');
    } else {
      setTest(result.reason === 'offline' ? 'offline' : 'invalid');
    }
  }, []);

  // Zwischenablage-Wächter: NUR solange der Assistent offen ist. Der Main-
  // Prozess liefert ausschließlich Text im euler_-Format zurück.
  useEffect(() => {
    if (!open || saved) return;
    const iv = setInterval(() => {
      void window.studio.readClipboardKey().then((k) => {
        if (k && k !== key) { setKey(k); void validate(k); }
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [open, saved, key, validate]);

  if (!open) return null;

  const done = () => setOpen(false);
  const StepNo = ({ n }: { n: number }) => (
    <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-studio-accent/15 font-display text-sm text-studio-accent">{n}</span>
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={done}>
      <div
        className="bx-card relative mx-4 w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'bx-toast-in 240ms cubic-bezier(.2,1.3,.35,1)' }}
      >
        <button onClick={done} className="absolute right-3 top-3 text-studio-muted hover:text-studio-text" title="Schließen">
          <X size={18} />
        </button>

        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-studio-accent/15 text-studio-accent"><KeyRound size={24} /></div>
          <div>
            <h2 className="font-display text-lg text-studio-text">Gratis-Key holen — in 2 Minuten</h2>
            <p className="text-[11px] text-studio-muted">Einmalig nötig, damit die App deinen TikTok-Live empfangen kann. Kostenlos.</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Schritt 1 */}
          <div className="flex items-start gap-3 rounded-lg border border-studio-border/60 p-3">
            <StepNo n={1} />
            <div className="flex-1 text-[12px] text-studio-muted">
              <b className="text-studio-fg">Konto bei eulerstream anlegen</b> — der Dienst, der die TikTok-Verbindung möglich macht.
              <span className="text-amber-300"> Nicht dein TikTok-Login!</span> Registrieren geht mit Google, GitHub oder E-Mail.
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => void window.studio.openExternal('https://www.eulerstream.com/register')} className="bx-btn-accent text-[11px]">
                  Konto erstellen <ExternalLink size={11} className="opacity-70" />
                </button>
                <button onClick={() => void window.studio.openExternal('https://www.eulerstream.com/dashboard/api-keys')} className="bx-pill text-[11px] hover:text-studio-accent">
                  Habe schon ein Konto → direkt zur Key-Seite
                </button>
              </div>
            </div>
          </div>

          {/* Schritt 2 */}
          <div className="flex items-start gap-3 rounded-lg border border-studio-border/60 p-3">
            <StepNo n={2} />
            <div className="flex-1 text-[12px] text-studio-muted">
              <b className="text-studio-fg">Key erstellen & kopieren</b> — auf der Key-Seite (Menü „API Keys") auf{' '}
              <span className="font-mono text-[11px]">Create Key</span> klicken, dann den Key kopieren (beginnt mit{' '}
              <span className="font-mono text-[11px] text-studio-teal">euler_</span>).
            </div>
          </div>

          {/* Schritt 3 — mit Clipboard-Automatik + Sofort-Test */}
          <div className="flex items-start gap-3 rounded-lg border border-studio-border/60 p-3">
            <StepNo n={3} />
            <div className="flex-1 text-[12px] text-studio-muted">
              <b className="text-studio-fg">Fertig — die App übernimmt</b>
              {!saved && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px]">
                  <ClipboardPaste size={13} className="text-studio-teal" />
                  Sobald du den Key kopierst, erscheint er hier <b>automatisch</b> — oder unten selbst einfügen.
                </p>
              )}
              <input
                value={key}
                onChange={(e) => { setKey(e.target.value); setTest('idle'); }}
                onBlur={() => void validate(key)}
                onKeyDown={(e) => e.key === 'Enter' && void validate(key)}
                placeholder="euler_…"
                disabled={saved}
                className="bx-input mt-2 w-full font-mono text-xs"
              />
              {test === 'testing' && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-studio-muted"><Loader2 size={13} className="animate-spin" /> Prüfe Key…</p>
              )}
              {test === 'valid' && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-emerald-300"><CheckCircle2 size={14} /> Key funktioniert & ist gespeichert!</p>
              )}
              {test === 'invalid' && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-studio-accent"><XCircle size={14} /> Dieser Key wird von eulerstream abgelehnt — nochmal kopieren? (Vollständig, beginnt mit „euler_")</p>
              )}
              {test === 'offline' && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-300"><XCircle size={14} /> Konnte den Key gerade nicht prüfen (Internet?) — er wird beim Verbinden getestet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[10px] text-studio-muted/70">Warum? TikTok hat keine offene Schnittstelle — eulerstream stellt sie bereit (Community-Key gratis).</p>
          {saved ? (
            <button onClick={done} className="bx-btn-accent px-4 py-1.5 text-xs">Los geht's! 🎉</button>
          ) : (
            <button onClick={done} className="bx-pill px-3 py-1.5 text-[11px] hover:text-studio-text">Später</button>
          )}
        </div>
      </div>
    </div>
  );
}
