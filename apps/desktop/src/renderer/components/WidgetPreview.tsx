// WidgetPreview — Schaufenster-Kärtchen für die Widget-Palette: zeigt das echte
// Widget schon LIVE (Demo-Daten) bevor man es aufs Overlay zieht — wie TikFinity.
// Reuse der bewährten Overlay-Iframe-Maschinerie im „single"-Modus (kein WS,
// Layer kommt per postMessage). Lazy: nur sichtbare Karten laden ihr Widget.
import { useEffect, useRef, useState } from 'react';
import { Plus, Play } from 'lucide-react';

interface Props {
  type: string;
  props: Record<string, unknown>;
  w: number;
  h: number;
  label: string;
  desc: string;
  /** Overlay-Basis-URL inkl. Token (http://host:port/overlay?token=…) oder null. */
  overlayBase: string | null;
  /** Vorschau-Sounds hörbar? (nur beim „Test"-Klick, kurzes Fenster). */
  soundOn: boolean;
  onAdd: () => void;
}

export default function WidgetPreview({ type, props, w, h, label, desc, overlayBase, soundOn, onAdd }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);

  // Nur sichtbare Karten laden ihr Live-Widget (schont CPU/Speicher).
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const root = el.closest('[data-palette-scroll]') as Element | null;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); },
      { root, rootMargin: '160px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Sobald die Vorschau-Runtime „bereit" meldet, das Layer hineinschicken.
  // Außerdem: Sound-Wiedergabe-Wünsche des Single-Widgets im Renderer abspielen.
  useEffect(() => {
    if (!visible) return;
    const onMsg = (ev: MessageEvent) => {
      const cw = frameRef.current?.contentWindow;
      if (ev.source !== cw) return;
      const d = ev.data as { type?: string; soundId?: string } | null;
      if (d?.type === 'bx-preview-ready') {
        cw?.postMessage(
          {
            type: 'bx-preview-mount',
            layer: { id: 'preview', widgetType: type, x: 0, y: 0, w, h, z: 0, opacity: 1, visible: true, props },
            canvas: { width: w, height: h },
          },
          '*',
        );
        cw?.postMessage({ type: 'bx-preview-sound-toggle', enabled: soundOn }, '*');
      } else if (d?.type === 'bx-play-sound' && d.soundId) {
        // Single-Widget hat keinen WS — der Sound wird hier über die App gespielt.
        void window.studio.testSound(d.soundId);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [visible, type, w, h, props, soundOn]);

  // Sound-Schalter live an die Vorschau melden.
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'bx-preview-sound-toggle', enabled: soundOn }, '*');
  }, [soundOn]);

  const test = () =>
    frameRef.current?.contentWindow?.postMessage({ type: 'bx-preview-test', widgetType: type, layerId: 'preview' }, '*');

  const src = overlayBase ? `${overlayBase}&preview=1&perf=1&single=1` : '';

  return (
    <div
      ref={cardRef}
      className="overflow-hidden rounded-lg border border-studio-border bg-studio-raised transition-colors hover:border-studio-accent/60"
    >
      {/* Karo-Hintergrund signalisiert „transparent" (wie im echten Overlay) */}
      <div
        className="relative h-[96px] w-full"
        style={{
          backgroundColor: '#0b0d13',
          backgroundImage:
            'linear-gradient(45deg,#13151d 25%,transparent 25%),linear-gradient(-45deg,#13151d 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#13151d 75%),linear-gradient(-45deg,transparent 75%,#13151d 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
        }}
      >
        {visible && src ? (
          <iframe ref={frameRef} src={src} title={label} className="h-full w-full border-0" scrolling="no" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-studio-muted">Vorschau …</div>
        )}
      </div>
      <div className="p-2">
        <div className="text-xs font-bold text-studio-text">{label}</div>
        <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-studio-muted">{desc}</div>
        <div className="mt-1.5 flex gap-1.5">
          <button
            onClick={onAdd}
            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-studio-accent/15 px-2 py-1 text-[11px] font-bold text-studio-accent hover:bg-studio-accent hover:text-black"
          >
            <Plus size={12} /> Hinzufügen
          </button>
          <button
            onClick={test}
            disabled={!visible}
            className="flex items-center justify-center gap-1 rounded-md border border-studio-border px-2 py-1 text-[11px] text-studio-muted hover:border-studio-teal hover:text-studio-teal disabled:opacity-40"
            title="Aktion/Animation testen"
          >
            <Play size={12} /> Test
          </button>
        </div>
      </div>
    </div>
  );
}
