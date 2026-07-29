// AnalysePage — die ausführliche Auswertung deiner Streams.
//
// Anspruch: Jede Zahl beantwortet eine Frage, die man sich als Streamer
// wirklich stellt — nicht „hier sind Daten", sondern „lief es besser als
// sonst, geht es aufwärts, wann lohnt sich streamen".
//
// Deshalb steht neben fast jedem Wert eine Einordnung. Eine nackte Zahl wie
// „4.200 Coins" sagt niemandem etwas; „4.200 — 38 % über deinem Schnitt" schon.
//
// Das Layout passt sich der Breite an (Grid mit auto-fit): auf dem Stream-PC
// mehrspaltig, auf einem schmalen Fenster untereinander. Ein Zugriff vom Handy
// ist ein eigenes Thema — die Seite ist aber schon darauf vorbereitet.
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus, Trophy, CalendarDays, Coins } from 'lucide-react';
import {
  imZeitraum, kennzahl, trend, besteWochentage, besterStream,
  type StreamEintrag,
} from '../../shared/analyse';
import type { useStudio } from '../hooks/useStudio';

const ZEITRAEUME = [
  { id: 7, label: '7 Tage' },
  { id: 30, label: '30 Tage' },
  { id: 90, label: '3 Monate' },
  { id: 365, label: '1 Jahr' },
] as const;

const fmt = (n: number) => n.toLocaleString('de-DE');
const datum = (ts: number) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

export default function AnalysePage({ studio }: { studio: ReturnType<typeof useStudio> }) {
  const [alle, setAlle] = useState<StreamEintrag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [tage, setTage] = useState<number>(30);

  useEffect(() => {
    void window.studio.getStreamHistorie()
      .then((e) => setAlle((e as StreamEintrag[]) ?? []))
      .catch(() => setAlle([]))
      .finally(() => setGeladen(true));
  }, []);

  const jetzt = Date.now();
  const streams = useMemo(() => imZeitraum(alle, tage, jetzt), [alle, tage, jetzt]);
  const laufend = studio.stats?.totals;

  const summe = useMemo(() => streams.reduce(
    (a, e) => ({
      coins: a.coins + e.coins, likes: a.likes + e.likes, gifts: a.gifts + e.gifts,
      chats: a.chats + e.chats, follows: a.follows + e.follows,
    }),
    { coins: 0, likes: 0, gifts: 0, chats: 0, follows: 0 },
  ), [streams]);

  const coinsVerlauf = streams.map((s) => s.coins);
  const coinTrend = trend(coinsVerlauf);
  const wochentage = besteWochentage(streams);
  const bester = besterStream(streams);
  // Der laufende Stream im Vergleich zu den bisherigen — die Frage, die man
  // sich während des Streams stellt.
  const heuteCoins = kennzahl(laufend?.coins ?? 0, coinsVerlauf);

  if (!geladen) return <div className="p-6 text-studio-muted">Lade Auswertung…</div>;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl uppercase">
            <BarChart3 size={20} className="text-studio-accent" /> Auswertung
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-studio-muted">
            Deine vergangenen Streams im Vergleich. Der gerade laufende zählt hier erst mit, wenn er
            beendet ist — sonst würde er jeden Durchschnitt verzerren.
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-studio-border">
          {ZEITRAEUME.map((z) => (
            <button
              key={z.id}
              onClick={() => setTage(z.id)}
              className={`px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
                tage === z.id ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:bg-studio-raised'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {streams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          Für diesen Zeitraum gibt es noch keine beendeten Streams.
          <span className="mt-1 block text-xs text-studio-muted/70">
            Nach deinem nächsten Stream steht hier die erste Auswertung.
          </span>
        </div>
      ) : (
        <>
          {/* Laufender Stream im Vergleich — nur wenn gerade einer läuft. */}
          {studio.status.status === 'connected' && (laufend?.coins ?? 0) > 0 && (
            <div className="bx-card flex flex-wrap items-center gap-4 p-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-studio-muted">Gerade läuft</div>
                <div className="text-2xl leading-none text-studio-text" style={{ fontFamily: 'var(--font-chunky)' }}>
                  {fmt(laufend?.coins ?? 0)} <span className="text-sm text-studio-muted">Coins</span>
                </div>
              </div>
              {heuteCoins.schnitt > 0 && (
                <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${
                  heuteCoins.abweichung >= 0 ? 'bg-studio-teal/15 text-studio-teal' : 'bg-studio-accent/15 text-studio-accent'
                }`}>
                  {heuteCoins.abweichung >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                  {heuteCoins.abweichung >= 0 ? '+' : ''}{heuteCoins.abweichung} %
                  <span className="font-normal text-studio-muted">
                    gegenüber deinem Schnitt ({fmt(heuteCoins.schnitt)})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Summen im Zeitraum */}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {[
              { label: 'Streams', wert: streams.length },
              { label: 'Coins', wert: summe.coins },
              { label: 'Geschenke', wert: summe.gifts },
              { label: 'Likes', wert: summe.likes },
              { label: 'Neue Follower', wert: summe.follows },
              { label: 'Kommentare', wert: summe.chats },
            ].map((k) => (
              <div key={k.label} className="bx-card p-4">
                <div className="text-[10px] uppercase tracking-[0.28em] text-studio-muted">{k.label}</div>
                <div className="mt-1 text-2xl leading-none text-studio-text" style={{ fontFamily: 'var(--font-chunky)' }}>
                  {fmt(k.wert)}
                </div>
                {k.label !== 'Streams' && streams.length > 1 && (
                  <div className="mt-1 font-mono text-[10px] text-studio-muted">
                    ⌀ {fmt(Math.round(k.wert / streams.length))} pro Stream
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Verlauf: ein Balken je Stream */}
          <section className="bx-card p-4">
            <h2 className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
              <span>Coins je Stream</span>
              <span className={`flex items-center gap-1 text-[10px] normal-case tracking-normal ${
                coinTrend.richtung === 'hoch' ? 'text-studio-teal'
                  : coinTrend.richtung === 'runter' ? 'text-studio-accent' : 'text-studio-muted'
              }`}>
                {coinTrend.richtung === 'hoch' ? <TrendingUp size={12} />
                  : coinTrend.richtung === 'runter' ? <TrendingDown size={12} /> : <Minus size={12} />}
                {coinTrend.richtung === 'gleich'
                  ? 'stabil'
                  : `${coinTrend.prozent > 0 ? '+' : ''}${coinTrend.prozent} % gegenüber der ersten Hälfte`}
              </span>
            </h2>
            <StreamBalken streams={streams} />
          </section>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {/* Bester Stream */}
            {bester && (
              <section className="bx-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
                  <Trophy size={13} /> Stärkster Stream
                </h2>
                <div className="text-2xl leading-none text-studio-gold" style={{ fontFamily: 'var(--font-chunky)' }}>
                  {fmt(bester.coins)} <span className="text-sm text-studio-muted">Coins</span>
                </div>
                <div className="mt-1 text-xs text-studio-muted">
                  am {new Date(bester.at).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
                  {bester.peakViewers > 0 && ` · bis zu ${fmt(bester.peakViewers)} Zuschauer`}
                </div>
              </section>
            )}

            {/* Wochentage */}
            <section className="bx-card p-4">
              <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
                <CalendarDays size={13} /> Starke Wochentage
              </h2>
              {wochentage.length === 0 ? (
                <p className="text-xs leading-relaxed text-studio-muted">
                  Dafür braucht es mindestens zwei Streams am selben Wochentag — sonst wäre ein
                  einzelner guter Abend schon „der beste Tag".
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {wochentage.slice(0, 4).map((w) => (
                    <li key={w.tag} className="flex items-center justify-between text-xs">
                      <span className="text-studio-text/90">{w.tag}</span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono text-studio-gold">{fmt(w.schnitt)}</span>
                        <span className="text-[10px] text-studio-muted">⌀ aus {w.anzahl} Streams</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Ranglisten-Platz, falls gerade bekannt */}
            {studio.rang && (
              <section className="bx-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
                  <Coins size={13} /> {studio.rang.art}
                </h2>
                <div className="text-2xl leading-none text-studio-gold" style={{ fontFamily: 'var(--font-chunky)' }}>
                  Platz {studio.rang.platz}
                </div>
                <div className="mt-1 text-xs text-studio-muted">
                  {studio.rang.restSek > 0
                    ? `noch ${Math.max(1, Math.round(studio.rang.restSek / 60))} Minuten in dieser Runde`
                    : 'Stand von TikTok'}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Ein Balken je Stream — zeigt Schwankung und Ausreißer auf einen Blick. */
function StreamBalken({ streams }: { streams: StreamEintrag[] }) {
  const max = Math.max(...streams.map((s) => s.coins), 1);
  // Bei sehr vielen Streams nur die letzten zeigen — sonst werden die Balken
  // zu Haaren und die Anzeige sagt nichts mehr.
  const zeigen = streams.slice(-40);
  return (
    <div className="flex h-32 items-end gap-1">
      {zeigen.map((s) => (
        <div
          key={s.at}
          className="group relative flex-1 rounded-t bg-studio-accent/70 transition-colors hover:bg-studio-accent"
          style={{ height: `${Math.max(2, (s.coins / max) * 100)}%` }}
          title={`${datum(s.at)}: ${fmt(s.coins)} Coins${s.peakViewers ? ` · bis ${fmt(s.peakViewers)} Zuschauer` : ''}`}
        />
      ))}
    </div>
  );
}
