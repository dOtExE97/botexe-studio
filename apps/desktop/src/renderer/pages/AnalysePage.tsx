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
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus, Trophy, CalendarDays, Coins, Clock, Users, Gift as GiftIcon } from 'lucide-react';
import {
  imZeitraum, kennzahl, trend, besteWochentage, besterStream,
  urteil, coinsProStunde, besteSendezeiten, mitDauer, bestePlatzierung,
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

/** Tageszeit-Gruß. Streamer sind meistens abends und nachts unterwegs —
 *  deshalb reicht die Nacht bis 5 Uhr, statt schon um 0 Uhr „Guten Morgen"
 *  zu sagen. */
function begruessung(stunde = new Date().getHours()): string {
  if (stunde < 5) return 'Noch wach';
  if (stunde < 11) return 'Guten Morgen';
  if (stunde < 18) return 'Hallo';
  return 'Guten Abend';
}
const datum = (ts: number) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

export default function AnalysePage({ studio }: { studio: ReturnType<typeof useStudio> }) {
  const [alle, setAlle] = useState<StreamEintrag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [tage, setTage] = useState<number>(30);

  // Top-Geschenke und Top-Leute kommen NICHT aus der Stream-Historie (die
  // kennt nur Summen), sondern aus dem Geschenk-Katalog und der
  // Zuschauer-Datenbank. Beide sind Gesamtstände über alle Streams — das steht
  // auch so an den Karten dran, damit niemand sie für Zeitraum-Zahlen hält.
  const [topGeschenke, setTopGeschenke] = useState<{ slug: string; count: number; coins: number; icon?: string }[]>([]);
  const [topLeute, setTopLeute] = useState<{ id: string; nickname: string; coins?: number; visitCount?: number; teamLevel?: number }[]>([]);
  // Wer schaut hier eigentlich drauf? Name und Bild kommen aus TikToks
  // roomInfo (siehe tiktok-cloud.ts#leseHost) und werden dauerhaft gemerkt —
  // die Begrüßung steht also auch dann da, wenn gerade kein Stream läuft.
  const [ich, setIch] = useState<{ name: string; bild: string }>({ name: '', bild: '' });

  useEffect(() => {
    void window.studio.getStreamHistorie()
      .then((e) => setAlle((e as StreamEintrag[]) ?? []))
      .catch(() => setAlle([]))
      .finally(() => setGeladen(true));
    void window.studio.getGiftCatalog()
      .then((k) => {
        const liste = Object.values((k ?? {}) as Record<string, { slug?: string; count?: number; coins?: number; icon?: string }>)
          .filter((g) => (g.count ?? 0) > 0)
          .map((g) => ({ slug: g.slug ?? '?', count: g.count ?? 0, coins: (g.coins ?? 0) * (g.count ?? 0), icon: g.icon }))
          .sort((a, b) => b.coins - a.coins || b.count - a.count)
          .slice(0, 5);
        setTopGeschenke(liste);
      })
      .catch(() => setTopGeschenke([]));
    void (window.studio.getDiagnostics() as Promise<Record<string, unknown>>)
      .then((d) => setIch({
        name: String(d.hostNickname || d.username || ''),
        bild: String(d.hostAvatar || ''),
      }))
      .catch(() => undefined);
    void window.studio.listViewers('')
      .then((v) => {
        const liste = (v as typeof topLeute ?? [])
          .filter((p) => (p.coins ?? 0) > 0)
          .sort((a, b) => (b.coins ?? 0) - (a.coins ?? 0))
          .slice(0, 5);
        setTopLeute(liste);
      })
      .catch(() => setTopLeute([]));
  }, []);

  const jetzt = Date.now();
  const streams = useMemo(() => imZeitraum(alle, tage, jetzt), [alle, tage, jetzt]);
  const laufend = studio.stats?.totals;

  // `shares`, `peakViewers` und `uniqueViewers` standen schon immer in der
  // Historie — die Seite hat sie nur nie summiert und nie gezeigt. Gerade die
  // Reichweite („wie viele VERSCHIEDENE Menschen waren da") ist auf TikTok die
  // Zahl, nach der man eigentlich fragt.
  const summe = useMemo(() => streams.reduce(
    (a, e) => ({
      coins: a.coins + e.coins, likes: a.likes + e.likes, gifts: a.gifts + e.gifts,
      chats: a.chats + e.chats, follows: a.follows + e.follows,
      shares: a.shares + e.shares,
      reichweite: a.reichweite + (e.uniqueViewers ?? 0),
      peak: Math.max(a.peak, e.peakViewers),
      subs: a.subs + (e.subs ?? 0),
      truhen: a.truhen + (e.envelopes ?? 0),
      superfans: a.superfans + (e.superfans ?? 0),
      emotes: a.emotes + (e.emotes ?? 0),
      truhenCoins: a.truhenCoins + (e.envelopeCoins ?? 0),
      anonym: Math.max(a.anonym, e.peakAnonymous ?? 0),
    }),
    { coins: 0, likes: 0, gifts: 0, chats: 0, follows: 0, shares: 0, reichweite: 0, peak: 0, subs: 0, truhen: 0, superfans: 0, emotes: 0, truhenCoins: 0, anonym: 0 },
  ), [streams]);

  const coinsVerlauf = streams.map((s) => s.coins);
  const coinTrend = trend(coinsVerlauf);
  const wochentage = besteWochentage(streams);
  const sendezeiten = besteSendezeiten(streams);
  const proStunde = coinsProStunde(streams);
  const mitDauerAnzahl = mitDauer(streams).length;
  const bester = besterStream(streams);
  const rangBest = bestePlatzierung(streams);
  // „War der letzte gut?" — die Frage nach dem Live. Verglichen wird gegen
  // ALLE anderen im Zeitraum, der bewertete Stream selbst zählt nicht mit
  // (sonst bewertet er sich mit sich selbst).
  const letzter = streams.length > 0 ? streams[streams.length - 1] : null;
  const letzterUrteil = letzter ? urteil(letzter.coins, streams.slice(0, -1).map((s) => s.coins)) : null;
  // Der laufende Stream im Vergleich zu den bisherigen — die Frage, die man
  // sich während des Streams stellt.
  const heuteCoins = kennzahl(laufend?.coins ?? 0, coinsVerlauf);

  if (!geladen) return <div className="p-6 text-studio-muted">Lade Auswertung…</div>;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Begrüßung: Wer hier draufschaut, soll sich wiedererkennen. Ohne
              Profilbild ein Kreis mit dem Anfangsbuchstaben — nie ein
              kaputtes Bild-Symbol. */}
          {ich.name && (
            ich.bild
              ? <img src={ich.bild} alt="" className="h-11 w-11 shrink-0 rounded-full border border-studio-border object-cover" />
              : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-studio-border bg-studio-raised font-display text-lg text-studio-accent">
                  {ich.name.replace(/^@/, '').charAt(0).toUpperCase()}
                </div>
              )
          )}
          <div>
            <h1 className="flex items-center gap-2 font-display text-xl uppercase">
              <BarChart3 size={20} className="text-studio-accent" />
              {ich.name ? `${begruessung()}, ${ich.name.replace(/^@/, '')}` : 'Auswertung'}
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-studio-muted">
              Deine vergangenen Streams im Vergleich. Der gerade laufende zählt hier erst mit, wenn er
              beendet ist — sonst würde er jeden Durchschnitt verzerren.
            </p>
          </div>
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

          {/* Der letzte Stream als SATZ, bevor irgendeine Zahl kommt. Das ist die
              Frage nach dem Live: „war das gut?" — und die beantwortet keine
              Tabelle, sondern ein Satz mit Einordnung. */}
          {letzter && letzterUrteil && (
            <div className={`bx-card p-4 ${
              letzterUrteil.art === 'stark' ? 'border-studio-teal/40'
                : letzterUrteil.art === 'ruhig' ? 'border-studio-accent/40' : ''
            }`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[10px] uppercase tracking-[0.28em] text-studio-muted">Dein letzter Stream</span>
                <span className="text-xs text-studio-muted">
                  {/* Bewusst „zuletzt aktiv": Ohne aufgezeichneten Beginn ist der
                      Zeitstempel das ENDE — ein Stream, der um 01:30 aufhört,
                      stünde sonst fälschlich auf dem Folgetag. */}
                  {letzter.startedAt
                    ? new Date(letzter.startedAt).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
                    : `zuletzt aktiv am ${new Date(letzter.at).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}`}
                  {letzter.durationMin ? ` · ${Math.floor(letzter.durationMin / 60)} h ${letzter.durationMin % 60} min` : ''}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl leading-none text-studio-gold" style={{ fontFamily: 'var(--font-chunky)' }}>
                  {fmt(letzter.coins)}
                </span>
                <span className="text-sm text-studio-muted">Coins</span>
                <span className={`text-sm ${
                  letzterUrteil.art === 'stark' ? 'text-studio-teal'
                    : letzterUrteil.art === 'ruhig' ? 'text-studio-accent' : 'text-studio-muted'
                }`}>
                  {letzterUrteil.satz}
                </span>
              </div>
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
              // Bisher gespeichert, aber nie gezeigt:
              { label: 'Reichweite', wert: summe.reichweite, hinweis: 'verschiedene Zuschauer' },
              { label: 'Peak', wert: summe.peak, ohneSchnitt: true, hinweis: 'meiste gleichzeitig' },
              { label: 'Geteilt', wert: summe.shares },
              // Neue Superfans und Verlängerungen sind BEWUSST zwei Zahlen: Die
              // eine ist Zuwachs, die andere Treue. Zusammengezählt wäre beides
              // wertlos.
              ...(summe.superfans > 0 ? [{ label: 'Neue Superfans', wert: summe.superfans }] : []),
              ...(summe.subs > 0 ? [{ label: 'Verlängerungen', wert: summe.subs, hinweis: 'Superfans geblieben' }] : []),
              ...(summe.truhen > 0 ? [{ label: 'Truhen', wert: summe.truhen, hinweis: `${fmt(summe.truhenCoins)} Coins darin` }] : []),
              ...(summe.emotes > 0 ? [{ label: 'Emotes', wert: summe.emotes, hinweis: 'Sticker im Chat' }] : []),
              ...(summe.anonym > 0 ? [{ label: 'Unsichtbar', wert: summe.anonym, ohneSchnitt: true, hinweis: 'zugeschaut, ohne sichtbar zu sein' }] : []),
            ].map((k, i) => (
              <div
                key={k.label}
                className="bx-card p-4 transition-colors hover:border-studio-accent/40"
                style={{ animation: `bx-auf 320ms ease-out ${i * 40}ms both` }}
              >
                <div className="text-[10px] uppercase tracking-[0.28em] text-studio-muted">{k.label}</div>
                <div className="mt-1 text-2xl leading-none text-studio-text" style={{ fontFamily: 'var(--font-chunky)' }}>
                  <ZaehlZahl wert={k.wert} />
                </div>
                {k.hinweis && (
                  <div className="mt-1 text-[10px] leading-tight text-studio-muted/80">{k.hinweis}</div>
                )}
                {k.label !== 'Streams' && !k.ohneSchnitt && streams.length > 1 && (
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

            {/* Beste Platzierung in TikToks Ranglisten — Stunden, Tag, Woche,
                Spiele. Für Streamer das Aushängeschild, für eine Agentur die
                Zahl, die im Zweifel zählt. */}
            {rangBest && (
              <section className="bx-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
                  <Trophy size={13} /> Beste Platzierung
                </h2>
                <div className="text-2xl leading-none text-studio-gold" style={{ fontFamily: 'var(--font-chunky)' }}>
                  Platz {rangBest.platz}
                </div>
                <div className="mt-1 text-xs text-studio-muted">
                  {rangBest.art} · am {new Date(rangBest.at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })}
                </div>
              </section>
            )}

            {/* Beste Sendezeit — dieselbe Idee wie die Wochentage, aber für die
                Uhrzeit. Braucht den aufgezeichneten BEGINN, den es erst ab
                v0.47 gibt; deshalb steht bei zu wenig Daten ein ehrlicher Satz
                statt einer erfundenen Liste. */}
            <section className="bx-card p-4">
              <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
                <Clock size={13} /> Beste Sendezeit
              </h2>
              {sendezeiten.length === 0 ? (
                <p className="text-xs leading-relaxed text-studio-muted">
                  Dafür muss die App den Stream-BEGINN kennen — das zeichnet sie erst seit dieser
                  Fassung auf. Nach ein paar Streams steht hier, zu welcher Uhrzeit es sich bei dir lohnt.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sendezeiten.slice(0, 4).map((z) => (
                    <li key={z.stunde} className="flex items-center justify-between text-xs">
                      <span className="text-studio-text/90">{z.label}</span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono text-studio-gold">{fmt(z.schnitt)}</span>
                        <span className="text-[10px] text-studio-muted">⌀ aus {z.anzahl} Streams</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Coins pro Stunde — die ehrlichste Kennzahl: belohnt nicht bloß
                Sitzfleisch. */}
            <section className="bx-card p-4">
              <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
                <Coins size={13} /> Coins pro Stunde
              </h2>
              {proStunde === null ? (
                <p className="text-xs leading-relaxed text-studio-muted">
                  Dafür braucht es die Dauer deiner Streams — die zeichnet die App erst seit dieser
                  Fassung auf. Ab dem nächsten Stream siehst du hier, wie ergiebig deine Zeit war,
                  unabhängig davon, wie lange du live warst.
                </p>
              ) : (
                <>
                  <div className="text-2xl leading-none text-studio-gold" style={{ fontFamily: 'var(--font-chunky)' }}>
                    {fmt(proStunde)}
                  </div>
                  <div className="mt-1 text-xs text-studio-muted">
                    aus {mitDauerAnzahl} Stream{mitDauerAnzahl === 1 ? '' : 's'} mit bekannter Dauer
                    {mitDauerAnzahl < streams.length && ` (${streams.length - mitDauerAnzahl} ältere zählen nicht mit)`}
                  </div>
                </>
              )}
            </section>

            {/* Top-Geschenke — Gesamtstand, nicht Zeitraum (kommt aus dem Katalog). */}
            {topGeschenke.length > 0 && (
              <section className="bx-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
                  <GiftIcon size={13} /> Deine Top-Geschenke
                </h2>
                <ul className="space-y-1.5">
                  {topGeschenke.map((g) => (
                    <li key={g.slug} className="flex items-center gap-2 text-xs">
                      {g.icon ? <img src={g.icon} alt="" className="h-5 w-5 rounded" /> : <span className="h-5 w-5" />}
                      <span className="flex-1 truncate text-studio-text/90">{g.slug}</span>
                      <span className="font-mono text-studio-gold">{fmt(g.coins)}</span>
                      <span className="text-[10px] text-studio-muted">{g.count}×</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[10px] text-studio-muted/80">Gesamt über alle Streams, nicht nur der Zeitraum.</div>
              </section>
            )}

            {/* Deine Leute — ebenfalls Gesamtstand aus der Zuschauer-Datenbank. */}
            {topLeute.length > 0 && (
              <section className="bx-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-studio-gold">
                  <Users size={13} /> Deine Leute
                </h2>
                <ul className="space-y-1.5">
                  {topLeute.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate text-studio-text/90">
                        {p.nickname}
                        {(p.teamLevel ?? 0) > 0 && <span className="ml-1.5 text-[10px] text-studio-accent">💜 {p.teamLevel}</span>}
                      </span>
                      <span className="font-mono text-studio-gold">{fmt(p.coins ?? 0)}</span>
                      {(p.visitCount ?? 0) > 1 && (
                        <span className="text-[10px] text-studio-muted">{p.visitCount}× dabei</span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[10px] text-studio-muted/80">Gesamt über alle Streams, nicht nur der Zeitraum.</div>
              </section>
            )}

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

/** Zahl, die beim Erscheinen hochzählt.
 *
 *  Bewusst kurz (600 ms) und mit einer Bremskurve: Es soll lebendig wirken,
 *  nicht wie eine Ladeanzeige. Wer die Seite nur überfliegt, sieht trotzdem
 *  sofort die Größenordnung.
 *
 *  Respektiert „Bewegung reduzieren" des Betriebssystems — dann steht die Zahl
 *  einfach sofort da. */
function ZaehlZahl({ wert }: { wert: number }) {
  const [gezeigt, setGezeigt] = useState(wert);
  const vorher = useRef(wert);

  useEffect(() => {
    const start = vorher.current;
    vorher.current = wert;
    if (start === wert) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setGezeigt(wert); return; }
    const dauer = 600;
    const t0 = performance.now();
    let laeuft = true;
    const schritt = (jetzt: number) => {
      if (!laeuft) return;
      const p = Math.min(1, (jetzt - t0) / dauer);
      // Ease-out: schnell los, sanft ankommen.
      const e = 1 - Math.pow(1 - p, 3);
      setGezeigt(Math.round(start + (wert - start) * e));
      if (p < 1) requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
    return () => { laeuft = false; };
  }, [wert]);

  return <>{fmt(gezeigt)}</>;
}

/** Ein Balken je Stream — zeigt Schwankung und Ausreißer auf einen Blick. */
function StreamBalken({ streams }: { streams: StreamEintrag[] }) {
  const max = Math.max(...streams.map((s) => s.coins), 1);
  // Bei sehr vielen Streams nur die letzten zeigen — sonst werden die Balken
  // zu Haaren und die Anzeige sagt nichts mehr.
  const zeigen = streams.slice(-40);
  return (
    <div className="flex h-32 items-end gap-1">
      {zeigen.map((s, i) => (
        <div
          key={s.at}
          className="group relative flex-1 rounded-t bg-studio-accent/70 transition-colors hover:bg-studio-accent"
          // Balken wachsen von unten auf, leicht versetzt — das macht den
          // Verlauf lesbar (man sieht die Reihenfolge) statt nur dekorativ zu
          // sein. `transform-origin` unten, damit sie nicht aus der Mitte
          // aufploppen.
          style={{
            height: `${Math.max(2, (s.coins / max) * 100)}%`,
            transformOrigin: 'bottom',
            animation: `bx-balken 420ms cubic-bezier(.2,.8,.3,1) ${Math.min(i * 25, 600)}ms both`,
          }}
          title={`${datum(s.at)}: ${fmt(s.coins)} Coins${s.peakViewers ? ` · bis ${fmt(s.peakViewers)} Zuschauer` : ''}`}
        />
      ))}
    </div>
  );
}
