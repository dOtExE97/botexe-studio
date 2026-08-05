// analyse-teile.tsx — die Bausteine der Auswertungsseite.
//
// Bewusst eigene Datei: Die Seite selbst (AnalysePage.tsx) beantwortet die
// Frage „was zeigen wir in welcher Reihenfolge", diese hier die Frage „wie
// sieht ein einzelnes Stück aus". Zusammen in einer Datei wären es 900 Zeilen,
// in denen man beides gleichzeitig lesen muss.
//
// GRUNDREGELN DIESER SEITE (aus dem Design-Spec):
//  • Farben BEDEUTEN etwas: Gold = Wert, Teal = Wachstum, Orangerot = „das ist
//    der bewertete Abend". Nie „eine andere Farbe, weil bunt".
//  • Kein backdrop-filter, kein Verlauf als Deko, kein Schatten-Karten-Raster.
//    Ein Nutzer streamt auf einem Laptop ohne Grafikbeschleunigung.
//  • Jede Bewegung ist EINMALIG (beim Aufbau) oder folgt einer Eingabe. Nichts
//    läuft dauerhaft. Wer sie ganz abschalten will, tut das in den
//    Einstellungen — `bewegung` schaltet hier alles still.
import { useEffect, useRef, useState } from 'react';

const fmt = (n: number) => n.toLocaleString('de-DE');

/** Respektiert die Systemeinstellung UND den App-Schalter. */
export function magBewegung(schalter: boolean): boolean {
  if (!schalter) return false;
  if (typeof matchMedia !== 'function') return true;
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Zahl, die einmal hochzählt. Bei abgeschalteter Bewegung steht sie sofort. */
export function ZaehlZahl({ wert, bewegung, ms = 900 }: { wert: number; bewegung: boolean; ms?: number }) {
  const [zeige, setZeige] = useState(() => (magBewegung(bewegung) ? 0 : wert));
  const raf = useRef(0);
  useEffect(() => {
    if (!magBewegung(bewegung)) { setZeige(wert); return undefined; }
    const start = performance.now();
    const schritt = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setZeige(Math.round(wert * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(schritt);
    };
    raf.current = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf.current);
  }, [wert, bewegung, ms]);
  return <>{fmt(zeige)}</>;
}

/* ── Die Anzeigetafel ─────────────────────────────────────────────────── */

export interface TafelZahl {
  wert: number;
  label: string;
  /** Einordnung („+180 % gegenüber sonst"). */
  hinweis: string;
  richtung: 'hoch' | 'gleich' | 'runter';
  /** true = gedämpft darstellen. Für Werte, die zu klein sind, um etwas zu
   *  bedeuten — sie werden nicht versteckt, aber auch nicht gefeiert. */
  leise?: boolean;
}

export function Tafel({ urteilText, urteilArt, wann, zahlen, bewegung }: {
  urteilText: string;
  urteilArt: 'stark' | 'ruhig' | 'normal' | 'zu-wenig-daten';
  wann: string;
  zahlen: TafelZahl[];
  bewegung: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[#2c3140] p-6"
      style={{ background: '#0a0b10' }}
    >
      {/* Feines Zeilenraster — die einzige Deko der Seite, und sie kostet keine
          eigene Ebene: ein wiederholter Verlauf statt eines Bildes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'repeating-linear-gradient(0deg,rgba(255,255,255,.026) 0 1px,transparent 1px 3px)' }}
      />
      <div className="relative flex flex-wrap items-baseline justify-between gap-3">
        <h2
          className="m-0 max-w-[17ch] leading-none"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px,3.8vw,38px)',
            textTransform: 'uppercase',
            // Gold nur beim starken Abend. Ein ruhiger Abend ist nicht rot —
            // Orangerot heißt auf dieser Seite nie „schlecht".
            color: urteilArt === 'stark' ? 'var(--color-studio-gold)' : 'var(--color-studio-text)',
          }}
        >
          {urteilText}
        </h2>
        <span className="font-mono text-[11px] tracking-[0.09em] text-studio-muted">{wann}</span>
      </div>
      <div className="relative mt-5 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(146px,1fr))' }}>
        {zahlen.map((z) => (
          <div key={z.label} className="rounded-lg border border-[#262b3a] p-3" style={{ background: '#101219' }}>
            <div
              className="tabular-nums leading-[0.9]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(32px,5vw,50px)',
                color: z.leise ? '#454c61' : 'var(--color-studio-gold)',
                textShadow: z.leise ? 'none' : '0 0 18px rgba(255,210,62,.15)',
              }}
            >
              <ZaehlZahl wert={z.wert} bewegung={bewegung} />
            </div>
            <div className="mt-1.5 text-[10px] uppercase tracking-[0.22em] text-studio-muted">{z.label}</div>
            <div className={`mt-0.5 font-mono text-[11px] ${z.richtung === 'hoch' ? 'text-studio-teal' : 'text-studio-muted'}`}>
              {z.hinweis}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Der Verlauf ──────────────────────────────────────────────────────── */

export interface KurvenReihe {
  id: string;
  label: string;
  einheit: string;
  punkte: number[];
  /** Beschriftung der x-Achse, links/mitte/rechts. */
  achse: [string, string, string];
}

/**
 * Verlaufskurve mit Fadenkreuz.
 *
 * Bewusst SVG statt Canvas: Die Kurve hat höchstens ein paar hundert Punkte,
 * bleibt damit im Zugriff der Bedienungshilfen und braucht keine zweite
 * Zeichenfläche im Speicher.
 */
export function Kurve({ reihe, bewegung }: { reihe: KurvenReihe; bewegung: boolean }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = 900;
  const H = 200;
  const pkt = reihe.punkte.length > 1 ? reihe.punkte : [0, 0];
  const max = Math.max(...pkt, 1);
  const x = (i: number) => (i / (pkt.length - 1)) * W;
  const y = (v: number) => H - 8 - (v / max) * (H - 26);
  const d = pkt.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const bewegt = magBewegung(bewegung);

  const verfolge = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const rel = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setCursor(Math.round(rel * (pkt.length - 1)));
  };

  return (
    <div>
      <div
        ref={box}
        className="relative"
        style={{ touchAction: 'none' }}
        onPointerMove={verfolge}
        onPointerLeave={() => setCursor(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[200px] w-full" role="img"
          aria-label={`Verlauf: ${reihe.label}`}>
          <defs>
            <linearGradient id="bx-kurve-fl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(33,230,193,.22)" />
              <stop offset="100%" stopColor="rgba(33,230,193,0)" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1="0" x2={W} y1={8 + f * (H - 26)} y2={8 + f * (H - 26)}
              stroke="rgba(38,42,54,.75)" strokeWidth="1" />
          ))}
          <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#bx-kurve-fl)"
            style={bewegt ? { opacity: 0, animation: 'bx-ein .7s .5s ease forwards' } : undefined} />
          <path
            d={d}
            fill="none"
            stroke="var(--color-studio-teal)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={bewegt ? {
              strokeDasharray: 2400,
              strokeDashoffset: 2400,
              animation: 'bx-zeichnen 1.1s cubic-bezier(.16,1,.3,1) forwards',
            } : undefined}
          />
          {cursor !== null && (
            <>
              <line x1={x(cursor)} x2={x(cursor)} y1="0" y2={H} stroke="rgba(255,77,46,.55)" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x(cursor)} cy={y(pkt[cursor] ?? 0)} r="5" fill="var(--color-studio-accent)"
                stroke="var(--color-studio-bg)" strokeWidth="2.5" />
            </>
          )}
        </svg>
        {cursor !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-[#39405a] px-3 py-2 text-[12.5px]"
            style={{
              background: '#0a0b10',
              left: `${(x(cursor) / W) * 100}%`,
              top: `${(y(pkt[cursor] ?? 0) / H) * 100}%`,
              transform: 'translate(-50%,-115%)',
              boxShadow: '0 6px 22px rgba(0,0,0,.55)',
            }}
          >
            <span className="font-mono" style={{ color: 'var(--color-studio-gold)' }}>{fmt(pkt[cursor] ?? 0)}</span>
            {' '}{reihe.einheit}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-studio-muted">
        {reihe.achse.map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  );
}

/* ── Die Heatmap ──────────────────────────────────────────────────────── */

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
/** Achse von 12 bis 12 — NICHT 0–24. Sonst zerschneidet sie jeden Stream über
 *  Mitternacht, und TikTok-Streamer sind genau dann live. */
const STUNDEN_MARKEN = ['12', '14', '16', '18', '20', '22', '0', '2', '4', '6', '8', '10'];

function heatFarbe(anteil: number): string {
  if (anteil <= 0) return '#12141c';
  if (anteil >= 0.8) return 'var(--color-studio-gold)';
  if (anteil >= 0.55) return 'rgba(255,210,62,.62)';
  if (anteil >= 0.3) return 'rgba(33,230,193,.5)';
  return 'rgba(33,230,193,.24)';
}

export function Heatmap({ zellen, satz }: { zellen: number[][]; satz: string }) {
  const max = Math.max(1, ...zellen.flat());
  return (
    <div>
      <div className="grid gap-[3px] font-mono text-[9px] text-studio-muted"
        style={{ gridTemplateColumns: '34px repeat(12,1fr)' }}>
        <span />
        {STUNDEN_MARKEN.map((h) => <span key={h} className="grid min-h-[15px] place-items-center">{h}</span>)}
        {zellen.map((zeile, t) => (
          <Zeile key={WOCHENTAGE[t]} tag={WOCHENTAGE[t] ?? ''} werte={zeile} max={max} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-studio-muted">
        <span>seltener</span>
        {[0, 0.2, 0.45, 0.7, 1].map((f) => (
          <i key={f} className="block h-[9px] w-[15px] rounded-sm" style={{ background: heatFarbe(f) }} />
        ))}
        <span>öfter</span>
      </div>
      {satz && <p className="mt-3 max-w-[70ch] text-[11.5px] text-studio-muted">{satz}</p>}
    </div>
  );
}

function Zeile({ tag, werte, max }: { tag: string; werte: number[]; max: number }) {
  return (
    <>
      <span className="grid min-h-[15px] place-items-center">{tag}</span>
      {werte.map((v, i) => (
        <button
          key={i}
          type="button"
          className="aspect-square min-h-[15px] rounded-sm border-0 p-0 transition-transform hover:scale-125"
          style={{ background: heatFarbe(v / max) }}
          title={`${tag} · ${STUNDEN_MARKEN[i]}–${STUNDEN_MARKEN[(i + 1) % 12]} Uhr — ${
            v === 0 ? 'nie live gewesen' : `${v} Stream${v > 1 ? 's' : ''}`}`}
          aria-label={`${tag} ${STUNDEN_MARKEN[i]} Uhr: ${v === 0 ? 'nie live' : `${v} Streams`}`}
        />
      ))}
    </>
  );
}

/* ── Coin-Herkunft ────────────────────────────────────────────────────── */

export interface GeberAnteil { name: string; wert: number; farbe: string }

export function Herkunft({ geber, einheit }: { geber: GeberAnteil[]; einheit: string }) {
  const [aktiv, setAktiv] = useState<number | null>(null);
  const summe = geber.reduce((s, g) => s + g.wert, 0) || 1;
  const U = 2 * Math.PI * 42;
  let off = 0;
  const kreise = geber.map((g, i) => {
    const len = (g.wert / summe) * U;
    const c = (
      <circle
        key={g.name}
        r="42" cx="50" cy="50" fill="none"
        stroke={g.farbe}
        strokeWidth={aktiv === i ? 19 : 15}
        strokeDasharray={`${len.toFixed(2)} ${(U - len).toFixed(2)}`}
        strokeDashoffset={(-off).toFixed(2)}
        style={{ transition: 'stroke-width .16s' }}
      />
    );
    off += len;
    return c;
  });
  const gezeigt = aktiv !== null ? geber[aktiv] : null;

  return (
    <div className="grid items-center gap-6" style={{ gridTemplateColumns: 'minmax(150px,190px) 1fr' }}>
      <div className="relative grid place-items-center">
        <svg viewBox="0 0 100 100" className="w-full max-w-[180px]" style={{ transform: 'rotate(-90deg)' }} aria-hidden>
          {kreise}
        </svg>
        <div className="pointer-events-none absolute text-center">
          <b className="block tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)', fontSize: 26 }}>
            {fmt(gezeigt ? gezeigt.wert : summe)}
          </b>
          <span className="mt-1 block text-[9.5px] uppercase tracking-[0.2em] text-studio-muted">
            {gezeigt ? `${Math.round((gezeigt.wert / summe) * 100)} % · ${gezeigt.name}` : `${einheit} gesamt`}
          </span>
        </div>
      </div>
      <div className="flex flex-col">
        {geber.map((g, i) => (
          <button
            key={g.name}
            type="button"
            className={`grid items-center gap-3 border-0 border-t border-[rgba(38,42,54,.7)] px-1 py-2 text-left first:border-t-0 ${
              aktiv === i ? 'bg-white/[.035]' : 'bg-transparent'}`}
            style={{ gridTemplateColumns: '24px 1fr auto' }}
            onPointerEnter={() => setAktiv(i)}
            onPointerLeave={() => setAktiv(null)}
            onFocus={() => setAktiv(i)}
            onBlur={() => setAktiv(null)}
          >
            <em className="mx-auto block h-2.5 w-2.5 rounded-full" style={{ background: g.farbe }} />
            <span className="truncate text-[14px]">{g.name}</span>
            <span className="font-mono text-[13px] text-studio-muted">
              {fmt(g.wert)} · {Math.round((g.wert / summe) * 100)} %
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Podest ───────────────────────────────────────────────────────────── */

export interface PodestPlatz { platz: number; name: string; wert: string; bild?: string; team?: number }

export function Podest({ plaetze, bewegung }: { plaetze: PodestPlatz[]; bewegung: boolean }) {
  const bewegt = magBewegung(bewegung);
  const hoehe = [66, 92, 52];
  return (
    <div className="grid max-w-[430px] items-end gap-3" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
      {plaetze.map((p, i) => (
        <div key={p.name} className="text-center">
          <Gesicht name={p.name} bild={p.bild} gross={i === 1} />
          <div
            className="rounded-t-lg border border-b-0 border-studio-border px-1.5 pb-3 pt-2"
            style={{
              background: 'var(--color-studio-raised)',
              height: hoehe[i],
              transformOrigin: 'bottom',
              ...(bewegt ? { transform: 'scaleY(0)', animation: `bx-wachsenY .55s cubic-bezier(.16,1,.3,1) ${260 + i * 100}ms forwards` } : {}),
            }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, color: i === 1 ? 'var(--color-studio-gold)' : 'var(--color-studio-muted)' }}>
              {p.platz}
            </div>
            <div className="truncate text-[12.5px]" title={p.name}>{p.name}</div>
            <div className="font-mono text-[11px] text-studio-muted">{p.wert}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Avatar mit Rückfall auf den Anfangsbuchstaben.
 *
 * TikToks Bild-Adressen laufen ab — ein `<img>` ohne Rückfall zeigt dann das
 * kaputte Bildsymbol des Browsers. Das gab es im Renderer bisher nirgends.
 */
export function Gesicht({ name, bild, gross }: { name: string; bild?: string; gross?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  const groesse = gross ? 64 : 52;
  const gemeinsam = 'mx-auto mb-2 grid place-items-center rounded-full';
  if (!bild || kaputt) {
    return (
      <div
        className={gemeinsam}
        style={{
          width: groesse, height: groesse, background: 'var(--color-studio-raised)',
          fontFamily: 'var(--font-display)', fontSize: gross ? 25 : 20, color: 'var(--color-studio-muted)',
          ...(gross ? { boxShadow: '0 0 0 2px var(--color-studio-gold)' } : {}),
        }}
        aria-hidden
      >
        {(name.match(/\p{L}|\p{N}/u)?.[0] ?? '?').toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={bild}
      alt=""
      className={`${gemeinsam} object-cover`}
      style={{ width: groesse, height: groesse, ...(gross ? { boxShadow: '0 0 0 2px var(--color-studio-gold)' } : {}) }}
      onError={() => setKaputt(true)}
    />
  );
}
