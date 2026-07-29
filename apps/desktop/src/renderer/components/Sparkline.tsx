// Sparkline — Mini-Kurve für die Zahlen-Karten auf der Live-Seite.
//
// Warum: Ein nackter Zähler („Coins: 4.200") sagt nicht, ob gerade etwas läuft
// oder seit zwanzig Minuten Stillstand herrscht. Die Kurve zeigt genau das —
// und zwar den ZUWACHS je Zeitabschnitt, nicht den Gesamtstand. Ein Gesamtstand
// steigt immer und sieht deshalb selbst bei totem Stream nach Erfolg aus.
import { useMemo } from 'react';

interface Props {
  /** Messwerte in zeitlicher Reihenfolge (Gesamtstände, nicht Zuwächse). */
  werte: number[];
  /** Farbe der Linie — passt sich sonst dem Text an. */
  farbe?: string;
  breite?: number;
  hoehe?: number;
}

export default function Sparkline({ werte, farbe = 'currentColor', breite = 96, hoehe = 24 }: Props) {
  const pfad = useMemo(() => {
    // Aus Gesamtständen die Zuwächse bilden — das ist die eigentliche Aussage.
    const zuwachs: number[] = [];
    for (let i = 1; i < werte.length; i++) {
      zuwachs.push(Math.max(0, (werte[i] ?? 0) - (werte[i - 1] ?? 0)));
    }
    if (zuwachs.length < 2) return null;

    const max = Math.max(...zuwachs, 1);
    const schritt = breite / (zuwachs.length - 1);
    // Etwas Luft oben und unten, damit die Linie nicht am Rand klebt.
    const y = (v: number) => hoehe - 2 - (v / max) * (hoehe - 4);
    return zuwachs
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * schritt).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(' ');
  }, [werte, breite, hoehe]);

  // Zu wenig Daten: Platz freihalten statt springen zu lassen, wenn die erste
  // Kurve erscheint.
  if (!pfad) {
    return (
      <div
        style={{ width: breite, height: hoehe }}
        className="flex items-end text-[9px] text-studio-muted/50"
        title="Die Kurve erscheint, sobald genug Messpunkte da sind (alle 20 Sekunden einer)."
      >
        …
      </div>
    );
  }

  return (
    <svg
      width={breite}
      height={hoehe}
      viewBox={`0 0 ${breite} ${hoehe}`}
      className="overflow-visible"
      aria-hidden
    >
      <path d={pfad} fill="none" stroke={farbe} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
    </svg>
  );
}
