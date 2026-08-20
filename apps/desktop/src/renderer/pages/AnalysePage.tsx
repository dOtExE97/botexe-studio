// AnalysePage — die Auswertung deiner Streams.
//
// DIE EINE IDEE: Diese Seite beantwortet zuerst „war das gut?" und erst danach
// „wie viel war es". Die Antwort ist ein SATZ in Schlagzeilengröße; die Zahlen
// belegen ihn. Vorher stand die Antwort klein neben einer großen Zahl — also
// ein Zehntel so groß wie ihr eigener Beleg — und darüber 14 gleich große
// Kacheln, in denen alles gleich wichtig aussah und deshalb nichts wichtig war.
//
// AUFBAU (jeder Abschnitt beantwortet eine Frage):
//   1. Anzeigetafel      war das gut, und woran sieht man das
//   2. Verlauf           wann war was los                    (interaktiv)
//   3. Rekorde           was war besser als je zuvor
//   4. Deine Abende      wie steht dieser zu den anderen     (anklickbar)
//   5. Wann es läuft     welche Zeiten tragen                (Heatmap)
//   6. Woher die Coins   hing der Abend an einem Menschen    (interaktiv)
//   7. Deine Leute       wer war da
//   8. Alles andere      der Rest, gruppiert statt als Kachelgitter
//
// GESTALTUNGSREGELN:
//  • Farben BEDEUTEN etwas: Gold = Wert, Teal = Wachstum, Orangerot = „dieser
//    Abend". Nie „andere Farbe, weil bunt". Vorher war Orangerot gleichzeitig
//    Alarmfarbe UND Balkenfarbe.
//  • Der KLEINE Abend ist der Normalfall, nicht die Ausnahme: 10 Zuschauer,
//    3 Geschenke, 1 Coin. Wo eine Prozentzahl dort albern wäre („−67 %"),
//    steht ein absoluter Satz („2 weniger als sonst").
//  • Kein backdrop-filter, keine Dauer-Animation. Ein Nutzer streamt auf einem
//    Laptop ohne Grafikbeschleunigung, dem der Speicher ausgeht.
import { useEffect, useMemo, useState } from 'react';
import {
  imZeitraum, trend, besteWochentage, urteil, coinsProStunde,
  besteSendezeiten, bestePlatzierung,
  type StreamEintrag,
} from '../../shared/analyse';
import {
  Tafel, Kurve, Heatmap, Herkunft, Podest, Gesicht, magBewegung,
  type TafelZahl, type KurvenReihe, type GeberAnteil, type PodestPlatz,
} from './analyse-teile';
import type { useStudio } from '../hooks/useStudio';

const ZEITRAEUME = [
  { id: 7, label: '7 Tage' },
  { id: 30, label: '30 Tage' },
  { id: 90, label: '3 Monate' },
  { id: 365, label: '1 Jahr' },
] as const;

const fmt = (n: number) => n.toLocaleString('de-DE');
const datum = (ts: number) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

/** Unter diesem Vergleichswert sind Prozente Unsinn: Bei „1 statt 3 Coins"
 *  wären das −67 %, was eine Genauigkeit vortäuscht, die die Zahl nicht hat. */
const PROZENT_AB = 10;

/** Einordnung in Worten — absolut bei kleinen Zahlen, prozentual bei großen. */
export function vergleichsSatz(wert: number, basis: number): { text: string; richtung: 'hoch' | 'gleich' | 'runter' } {
  if (basis <= 0) return { text: wert > 0 ? 'das erste Mal überhaupt' : 'auch sonst keine', richtung: 'gleich' };
  const diff = wert - basis;
  if (basis < PROZENT_AB) {
    if (diff === 0) return { text: 'wie sonst', richtung: 'gleich' };
    return {
      text: `${Math.abs(diff)} ${diff > 0 ? 'mehr' : 'weniger'} als sonst`,
      richtung: diff > 0 ? 'hoch' : 'runter',
    };
  }
  const p = Math.round((diff / basis) * 100);
  if (Math.abs(p) < 25) return { text: 'wie immer', richtung: 'gleich' };
  return { text: `${p > 0 ? '+' : ''}${p} % gegenüber sonst`, richtung: p > 0 ? 'hoch' : 'runter' };
}

/** Median statt Mittelwert: Ein einziger Wal-Abend würde den Schnitt so
 *  hochziehen, dass danach jeder normale Abend „unterdurchschnittlich" wäre. */
export function median(werte: number[]): number {
  if (werte.length === 0) return 0;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2);
}

export default function AnalysePage({ studio }: { studio: ReturnType<typeof useStudio> }) {
  const [alle, setAlle] = useState<StreamEintrag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [tage, setTage] = useState<number>(30);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [reihe, setReihe] = useState<'coins' | 'chats' | 'likes' | 'viewers'>('coins');
  const [topGeschenke, setTopGeschenke] = useState<{ slug: string; count: number; coins: number; icon?: string }[]>([]);
  const [ich, setIch] = useState<{ name: string; bild: string; titel: string; follower: number }>(
    { name: '', bild: '', titel: '', follower: 0 },
  );
  const [bewegung, setBewegung] = useState(true);

  useEffect(() => {
    void window.studio.getStreamHistorie()
      .then((e) => setAlle((e as StreamEintrag[]) ?? []))
      .catch(() => setAlle([]))
      .finally(() => setGeladen(true));
    void window.studio.getGiftCatalog()
      .then((k) => setTopGeschenke(
        Object.values((k ?? {}) as Record<string, { slug?: string; count?: number; coins?: number; icon?: string }>)
          .filter((g) => (g.count ?? 0) > 0)
          .map((g) => ({ slug: g.slug ?? '?', count: g.count ?? 0, coins: (g.coins ?? 0) * (g.count ?? 0), icon: g.icon }))
          .sort((a, b) => b.coins - a.coins || b.count - a.count)
          .slice(0, 5),
      ))
      .catch(() => setTopGeschenke([]));
    void (window.studio.getDiagnostics() as Promise<Record<string, unknown>>)
      .then((d) => {
        setIch({
          name: String(d.hostNickname || d.username || ''),
          bild: String(d.hostAvatar || ''),
          titel: String(d.hostTitel || ''),
          follower: Number(d.hostFollower || 0),
        });
        setBewegung(d.animationen !== false);
      })
      .catch(() => undefined);
  }, []);

  const jetzt = Date.now();
  const streams = useMemo(() => imZeitraum(alle, tage, jetzt), [alle, tage, jetzt]);
  const laufend = studio.stats?.totals;
  const laeuft = studio.status.status === 'connected';

  // Welcher Abend wird bewertet? Standard ist der letzte; ein Klick auf die
  // Reihe wechselt. Der Vergleich läuft IMMER gegen die anderen, nie gegen
  // sich selbst — sonst bewertet ein Abend sich mit sich.
  const idx = gewaehlt !== null && gewaehlt < streams.length ? gewaehlt : streams.length - 1;
  const abend = streams[idx] ?? null;
  const andere = useMemo(() => streams.filter((_, i) => i !== idx), [streams, idx]);

  // Der Maßstab steht EINMAL fest, über die ganze Historie — nicht pro
  // Zeitraum. Sonst könnte ein Wechsel des Zeitraums das Urteil kippen, und
  // ein Umschalter, der laut Beschriftung nur den Zeitraum wechselt, würde
  // den Satz oben entwerten, auf dem die ganze Seite steht.
  const massstab = useMemo<'coins' | 'chats'>(() => {
    const mitCoins = alle.filter((s) => s.coins > 0).length;
    const basis = median(alle.map((s) => s.coins));
    return alle.length > 0 && mitCoins >= alle.length / 2 && basis >= PROZENT_AB ? 'coins' : 'chats';
  }, [alle]);

  const massWert = (s: StreamEintrag) => (massstab === 'coins' ? s.coins : s.chats);
  const urteilObj = abend ? urteil(abend.coins, andere.map((s) => s.coins)) : null;

  // Die Zahlen der Anzeigetafel. Der Maßstab steht vorn: Bei einem Kanal ohne
  // nennenswerte Coins ist das „Kommentare" — sonst stünde dort dauerhaft eine
  // 1 in leuchtendem Gold, und die Seite hätte jeden Abend schlechte Laune.
  const tafelZahlen: TafelZahl[] = useMemo(() => {
    if (!abend) return [];
    const bau = (wert: number, label: string, werte: number[], leise = false): TafelZahl => {
      const v = vergleichsSatz(wert, median(werte));
      return { wert, label, hinweis: v.text, richtung: v.richtung, leise };
    };
    const felder: Array<[number, string, number[], boolean]> = massstab === 'coins'
      ? [
        [abend.coins, 'Coins', andere.map((s) => s.coins), false],
        [abend.chats, 'Kommentare', andere.map((s) => s.chats), false],
        [abend.uniqueViewers ?? 0, 'Leute im Raum', andere.map((s) => s.uniqueViewers ?? 0), false],
      ]
      : [
        [abend.chats, 'Kommentare', andere.map((s) => s.chats), false],
        [abend.uniqueViewers ?? 0, 'Leute im Raum', andere.map((s) => s.uniqueViewers ?? 0), false],
        // Gedämpft: Der Wert steht da, wird aber nicht gefeiert.
        [abend.coins, 'Coins', andere.map((s) => s.coins), true],
      ];
    return felder.map(([w, l, v, leise]) => bau(w, l, v, leise));
  }, [abend, andere, massstab]);

  // Die Kurve: Läuft gerade ein Stream, zeigt sie DIESEN Abend im Verlauf
  // (aus den Messpunkten der Session, siehe session-stats.ts#messeVerlauf).
  // Sonst den Verlauf ÜBER die Abende — dieselbe Frage auf anderer Achse.
  const sessionVerlauf = studio.stats?.verlauf ?? [];
  const detailKurve = laeuft && sessionVerlauf.length > 1;
  const kurve: KurvenReihe = useMemo(() => {
    const felder = {
      coins: { label: 'Coins', einheit: 'Coins' },
      chats: { label: 'Kommentare', einheit: 'Kommentare' },
      likes: { label: 'Likes', einheit: 'Likes' },
      viewers: { label: 'Zuschauer', einheit: 'Zuschauer' },
    } as const;
    if (detailKurve) {
      return { id: reihe, ...felder[reihe], punkte: sessionVerlauf.map((p) => p[reihe]), achse: ['Start', 'Mitte', 'jetzt'] };
    }
    const holen = (s: StreamEintrag) => (reihe === 'viewers' ? s.peakViewers : s[reihe]);
    const erster = streams[0];
    const letzter = streams[streams.length - 1];
    return {
      id: reihe,
      ...felder[reihe],
      punkte: streams.map(holen),
      achse: [erster ? datum(erster.at) : '', '', letzter ? datum(letzter.at) : ''],
    };
  }, [reihe, detailKurve, sessionVerlauf, streams]);

  // Rekorde: nur echte Bestwerte über ALLE Abende, nicht nur den Zeitraum.
  const rekorde = useMemo(() => {
    if (!abend || alle.length < 2) return [];
    const raus: { marke: string; neu: boolean; text: string }[] = [];
    const pruef = (wert: number, hol: (s: StreamEintrag) => number, einheit: string) => {
      const alt = Math.max(0, ...alle.filter((s) => s.at !== abend.at).map(hol));
      if (wert <= 0 || wert <= alt) return;
      raus.push({
        marke: alt === 0 ? 'Zum ersten Mal' : 'Rekord',
        neu: alt === 0,
        text: alt === 0
          ? `${fmt(wert)} ${einheit} an einem Abend — das gab es noch nie.`
          : `Meiste ${einheit} an einem Abend: ${fmt(wert)}. Der alte Bestwert lag bei ${fmt(alt)}.`,
      });
    };
    pruef(abend.coins, (s) => s.coins, 'Coins');
    pruef(abend.chats, (s) => s.chats, 'Kommentare');
    pruef(abend.gifts, (s) => s.gifts, 'Geschenke');
    return raus.slice(0, 3);
  }, [abend, alle]);

  // Heatmap: Wochentag × 2-Stunden-Block. Die Achse läuft von 12 bis 12 —
  // NICHT 0 bis 24, sonst zerschneidet sie jeden Stream über Mitternacht, und
  // TikTok-Streamer sind genau dann live.
  const heat = useMemo(() => {
    const z: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0));
    for (const s of streams) {
      const d = new Date(s.startedAt ?? s.at);
      const tag = (d.getDay() + 6) % 7; // Montag = 0
      const block = Math.floor(((((d.getHours() - 12) % 24) + 24) % 24) / 2);
      const zeile = z[tag];
      if (zeile && zeile[block] !== undefined) zeile[block] += 1;
    }
    return z;
  }, [streams]);

  const wochentage = besteWochentage(streams);
  const sendezeiten = besteSendezeiten(streams);
  const proStunde = coinsProStunde(streams);
  const rangBest = bestePlatzierung(streams);
  const coinTrend = trend(streams.map((s) => s.coins));

  // Woher die Coins kamen — nur für den laufenden bzw. zuletzt beendeten
  // Abend, denn nur dort kennen wir die einzelnen Geber. Das steht auch in der
  // Überschrift, nicht in einer Fußnote.
  const geber: GeberAnteil[] = useMemo(() => {
    const top = studio.stats?.topGifters ?? [];
    if (top.length === 0) return [];
    const farben = ['var(--color-studio-gold)', 'var(--color-studio-teal)', 'var(--color-studio-accent)', '#7d86a8'];
    const erste = top.slice(0, 4).map((g, i) => ({ name: g.nickname, wert: g.coins, farbe: farben[i] ?? '#3a4052' }));
    const rest = top.slice(4).reduce((s, g) => s + g.coins, 0);
    return rest > 0 ? [...erste, { name: 'Alle anderen', wert: rest, farbe: '#3a4052' }] : erste;
  }, [studio.stats]);

  // Wie treu ist das Publikum insgesamt? Kommt aus dem Zuschauer-Gedaechtnis,
  // nicht aus der Session: „wie viele meiner Leute sind Langzeit-Fans" ist
  // keine Frage an einen einzelnen Abend.
  const [treue, setTreue] = useState<{ neu: number; wochen: number; monate: number; jahr: number; unbekannt: number } | null>(null);
  useEffect(() => {
    void window.studio.getTreueVerteilung?.().then(setTreue).catch(() => setTreue(null));
  }, []);

  const treueBalken: GeberAnteil[] = useMemo(() => {
    if (!treue) return [];
    const eintraege = [
      { name: 'Über ein Jahr dabei', wert: treue.jahr, farbe: 'var(--color-studio-gold)' },
      { name: 'Monate dabei', wert: treue.monate, farbe: 'var(--color-studio-teal)' },
      { name: 'Wochen dabei', wert: treue.wochen, farbe: 'var(--color-studio-accent)' },
      { name: 'Neu (unter einer Woche)', wert: treue.neu, farbe: '#7d86a8' },
      // Eigene Gruppe: wer nie mit Etiketten auftauchte, ist deshalb kein Neuling.
      { name: 'Keine Angabe von TikTok', wert: treue.unbekannt, farbe: '#3a4052' },
    ];
    return eintraege.filter((e) => e.wert > 0);
  }, [treue]);

  // Woher die Zuschauer kamen (TikToks clientEnterSource). Die Werte sind ROH —
  // welche es gibt und was sie genau bedeuten, ist nirgends dokumentiert.
  // Deshalb wird nur lesbarer gemacht (Unterstriche raus), nicht uminterpretiert.
  const zuschauerHerkunft: GeberAnteil[] = useMemo(() => {
    const roh = studio.stats?.totals?.herkunft;
    if (!roh) return [];
    const farben = ['var(--color-studio-teal)', 'var(--color-studio-gold)', 'var(--color-studio-accent)', '#7d86a8'];
    const sortiert = Object.entries(roh).sort((a, b) => b[1] - a[1]);
    const erste = sortiert.slice(0, 4).map(([quelle, n], i) => ({
      name: quelle.replace(/[_-]+/g, ' '),
      wert: n,
      farbe: farben[i] ?? '#3a4052',
    }));
    const rest = sortiert.slice(4).reduce((sum, [, n]) => sum + n, 0);
    return rest > 0 ? [...erste, { name: 'Andere Wege', wert: rest, farbe: '#3a4052' }] : erste;
  }, [studio.stats]);

  const podest: PodestPlatz[] = useMemo(() => {
    const top = studio.stats?.topGifters ?? [];
    if (top.length < 3) return [];
    const [a, b, c] = top;
    // Reihenfolge 2–1–3, damit der Erste in der Mitte steht.
    return [
      { platz: 2, name: b?.nickname ?? '', wert: `${fmt(b?.coins ?? 0)} Coins`, bild: b?.profilePic },
      { platz: 1, name: a?.nickname ?? '', wert: `${fmt(a?.coins ?? 0)} Coins`, bild: a?.profilePic },
      { platz: 3, name: c?.nickname ?? '', wert: `${fmt(c?.coins ?? 0)} Coins`, bild: c?.profilePic },
    ];
  }, [studio.stats]);

  // Zeilen mit 0 fallen weg — sonst käme die Kachel „Geteilt 0" durch die
  // Hintertür zurück, gegen die diese Seite gebaut wurde.
  const gruppen = useMemo(() => {
    if (!abend) return [];
    const z = (label: string, wert: string, gold = false) => ({ label, wert, gold });
    return [
      { titel: 'Einnahmen', zeilen: [
        z('Coins', fmt(abend.coins), true),
        z('Geschenke', fmt(abend.gifts)),
        ...(abend.envelopes ? [z('Truhen', `${abend.envelopes} · ${fmt(abend.envelopeCoins ?? 0)} Coins`)] : []),
        ...(abend.durationMin ? [z('Coins pro Stunde', fmt(Math.round(abend.coins / Math.max(1, abend.durationMin / 60))))] : []),
      ] },
      { titel: 'Publikum', zeilen: [
        z('Leute im Raum', fmt(abend.uniqueViewers ?? 0)),
        z('Meiste gleichzeitig', fmt(abend.peakViewers)),
        ...(abend.peakAnonymous ? [z('Unsichtbar dabei', fmt(abend.peakAnonymous))] : []),
        z('Neue Follower', fmt(abend.follows)),
      ] },
      { titel: 'Chat', zeilen: [
        z('Kommentare', fmt(abend.chats)),
        z('Likes', fmt(abend.likes)),
        ...(abend.emotes ? [z('Emotes', fmt(abend.emotes))] : []),
        ...(abend.shares ? [z('Geteilt', fmt(abend.shares))] : []),
      ] },
      { titel: 'Treue', zeilen: [
        ...(abend.superfans ? [z('Neue Superfans', fmt(abend.superfans))] : []),
        ...(abend.subs ? [z('Verlängerungen', fmt(abend.subs))] : []),
        ...(abend.bestePlatzierung ? [z('Beste Platzierung', `Platz ${abend.bestePlatzierung}`)] : []),
        ...(ich.follower ? [z('Follower gesamt', fmt(ich.follower))] : []),
      ] },
    ].filter((g) => g.zeilen.length > 0);
  }, [abend, ich.follower]);

  if (!geladen) return <div className="p-6 text-studio-muted">Lade Auswertung…</div>;

  const wann = abend
    ? new Date(abend.at).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase()
      + (abend.durationMin ? ` · ${Math.floor(abend.durationMin / 60)} H ${abend.durationMin % 60} MIN` : '')
    : 'NOCH KEIN ABEND';

  const bewegt = magBewegung(bewegung);
  const auf = (i: number) => (bewegt
    ? { opacity: 0, animation: `bx-auf .5s cubic-bezier(.16,1,.3,1) ${i * 55}ms forwards` }
    : undefined);
  const kicker = 'mb-3 block font-display text-[11px] uppercase tracking-[0.3em] text-studio-muted';

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <header className="flex flex-wrap items-center justify-between gap-3" style={auf(0)}>
        <div className="flex items-center gap-3">
          <div className="h-[30px] w-[30px] shrink-0">
            <Gesicht name={ich.name || '?'} bild={ich.bild} />
          </div>
          <div>
            <span className="block font-display text-[11px] uppercase tracking-[0.3em] text-studio-muted">{wann}</span>
            {ich.titel && <span className="mt-0.5 block max-w-[52ch] truncate text-[13px] text-studio-muted">„{ich.titel}"</span>}
          </div>
        </div>
        <div className="flex gap-4">
          {ZEITRAEUME.map((z) => (
            <button
              key={z.id}
              type="button"
              aria-pressed={tage === z.id}
              onClick={() => { setTage(z.id); setGewaehlt(null); }}
              className={`border-b-2 pb-1 pt-0.5 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                tage === z.id ? 'border-studio-accent text-studio-text' : 'border-transparent text-studio-muted hover:text-studio-text'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </header>

      {streams.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          Für diesen Zeitraum gibt es noch keine beendeten Streams.
          <span className="mt-1 block text-xs text-studio-muted/70">
            Nach deinem nächsten Stream steht hier die erste Auswertung — ab dem zweiten auch der Vergleich.
          </span>
        </div>
      ) : (
        <>
          <div className="mt-4" style={auf(1)}>
            <Tafel
              urteilText={laeuft ? 'Läuft gerade'
                : urteilObj?.art === 'stark' ? 'Starker Abend'
                  : urteilObj?.art === 'ruhig' ? 'Ruhiger Abend'
                    : urteilObj?.art === 'zu-wenig-daten' ? `Dein ${streams.length}. Abend`
                      : 'Ganz normaler Abend'}
              urteilArt={urteilObj?.art === 'stark' ? 'stark' : urteilObj?.art === 'ruhig' ? 'ruhig' : 'normal'}
              wann={laeuft ? `LÄUFT · ${fmt(laufend?.viewers ?? 0)} ZUSCHAUER` : wann}
              zahlen={tafelZahlen}
              bewegung={bewegung}
            />
            <p className="mt-3 max-w-[70ch] text-[11.5px] text-studio-muted">
              {urteilObj?.satz}
              {massstab === 'chats' && ' Gemessen wird bei dir an Kommentaren — da ist genug los, dass ein Vergleich was taugt. Die Coins stehen weiter unten mit drin.'}
            </p>
          </div>

          <section className="mt-10" style={auf(2)}>
            <span className={kicker}>{detailKurve ? 'Dieser Abend im Verlauf' : 'Deine Abende im Verlauf'}</span>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(['coins', 'chats', 'likes', 'viewers'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reihe === r}
                  onClick={() => setReihe(r)}
                  className={`rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
                    reihe === r
                      ? 'border-studio-teal bg-studio-teal font-semibold text-[#0c0d12]'
                      : 'border-studio-border text-studio-muted hover:border-[#4b5570] hover:text-studio-text'
                  }`}
                >
                  {r === 'coins' ? 'Coins' : r === 'chats' ? 'Kommentare' : r === 'likes' ? 'Likes' : 'Zuschauer'}
                </button>
              ))}
            </div>
            <Kurve reihe={kurve} bewegung={bewegung} />
            <p className="mt-2 max-w-[70ch] text-[11.5px] text-studio-muted">
              {detailKurve
                ? 'Fahr über die Kurve für den Stand zu jedem Zeitpunkt des Abends.'
                : 'Ein Punkt je Abend. Sobald ein Stream läuft, zeigt die Kurve stattdessen den Verlauf dieses Abends.'}
            </p>
          </section>

          {rekorde.length > 0 && (
            <section className="mt-10" style={auf(3)}>
              <span className={kicker}>Rekorde an diesem Abend</span>
              <div className="flex flex-col gap-2.5">
                {rekorde.map((r, i) => (
                  <div key={r.text} className="flex items-baseline gap-3 text-[14.5px]" style={auf(4 + i)}>
                    <i
                      className="shrink-0 rounded-sm px-2 py-[3px] font-display text-[9.5px] uppercase not-italic tracking-[0.16em]"
                      style={{ color: '#0c0d12', background: r.neu ? 'var(--color-studio-teal)' : 'var(--color-studio-gold)' }}
                    >
                      {r.marke}
                    </i>
                    <span>{r.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-10" style={auf(7)}>
            <span className={kicker}>Deine Abende — zum Anklicken</span>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(104px,1fr))' }}>
              {streams.map((s, i) => {
                const wert = massWert(s);
                const bester = Math.max(...streams.map(massWert), 1);
                const mitte = median(streams.map(massWert));
                return (
                  <button
                    key={s.at}
                    type="button"
                    aria-pressed={i === idx}
                    onClick={() => setGewaehlt(i)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      i === idx ? 'border-studio-accent bg-[#221a1a]' : 'border-studio-border bg-studio-raised hover:border-[#4b5570]'
                    }`}
                    title={`${datum(s.at)} · ${fmt(s.coins)} Coins · ${fmt(s.chats)} Kommentare`}
                  >
                    <span className="block font-mono text-[9.5px] tracking-[0.06em] text-studio-muted">{datum(s.at)}</span>
                    <b className="mt-0.5 block font-display text-[19px] font-normal tabular-nums">{fmt(wert)}</b>
                    <i
                      className="mt-2 block h-[3px] rounded-sm"
                      style={{
                        background: wert >= bester ? 'var(--color-studio-gold)'
                          : wert > mitte ? 'var(--color-studio-teal)' : '#39405a',
                        transformOrigin: 'left',
                        ...(bewegt ? { transform: 'scaleX(0)', animation: `bx-wachsenX .6s cubic-bezier(.16,1,.3,1) ${240 + i * 40}ms forwards` } : {}),
                      }}
                    />
                  </button>
                );
              })}
            </div>
            {coinTrend.richtung !== 'gleich' && (
              <p className="mt-3 text-[11.5px] text-studio-muted">
                Über den Zeitraum {coinTrend.richtung === 'hoch' ? 'aufwärts' : 'abwärts'}:{' '}
                {coinTrend.prozent > 0 ? '+' : ''}{coinTrend.prozent} % gegenüber der ersten Hälfte.
              </p>
            )}
          </section>

          <section className="mt-10" style={auf(8)}>
            <span className={kicker}>Wann es bei dir läuft</span>
            <div className="rounded-xl border border-studio-border p-5" style={{ background: 'var(--color-studio-panel)' }}>
              <Heatmap
                zellen={heat}
                satz={[
                  wochentage.length > 0 ? `Deine ${wochentage.slice(0, 2).map((w) => w.tag).join(' und ')} tragen am meisten.` : '',
                  sendezeiten.length > 0 ? `Am besten läuft es, wenn du gegen ${sendezeiten[0]?.stunde} Uhr anfängst.` : '',
                  proStunde !== null && proStunde > 0 ? `Im Schnitt ${fmt(proStunde)} Coins pro Stunde.` : '',
                ].filter(Boolean).join(' ')}
              />
            </div>
          </section>

          {geber.length > 1 && (
            <section className="mt-10" style={auf(9)}>
              <span className={kicker}>Woher die Coins kamen {laeuft ? '(läuft gerade)' : '(letzter Abend)'}</span>
              <div className="rounded-xl border border-studio-border p-5" style={{ background: 'var(--color-studio-panel)' }}>
                <Herkunft geber={geber} einheit="Coins" />
              </div>
            </section>
          )}

          {zuschauerHerkunft.length > 0 && (
            <section className="mt-10" style={auf(9)}>
              <span className={kicker}>Woher deine Zuschauer kamen {laeuft ? '(läuft gerade)' : '(letzter Abend)'}</span>
              <div className="rounded-xl border border-studio-border p-5" style={{ background: 'var(--color-studio-panel)' }}>
                <Herkunft geber={zuschauerHerkunft} einheit="Zuschauer" />
                <p className="mt-4 border-t border-studio-border pt-3 text-xs text-studio-muted">
                  Das sind TikToks eigene Bezeichnungen, unverändert übernommen — was genau dahintersteckt,
                  sagt TikTok nirgends. „homepage hot" heißt, jemand hat dich auf der Startseite gefunden.
                  Gezählt wird jeder Zuschauer nur beim ersten Auftauchen.
                </p>
              </div>
            </section>
          )}

          {treueBalken.length > 1 && (
            <section className="mt-10" style={auf(9)}>
              <span className={kicker}>Wie treu dein Publikum ist</span>
              <div className="rounded-xl border border-studio-border p-5" style={{ background: 'var(--color-studio-panel)' }}>
                <Herkunft geber={treueBalken} einheit="Zuschauer" />
                <p className="mt-4 border-t border-studio-border pt-3 text-xs text-studio-muted">
                  Über alle Zuschauer, die botexe-studio je gesehen hat — nicht nur den letzten Abend.
                  TikTok liefert an fast jeder Nachricht mit, wie lange jemand dir schon folgt.
                </p>
              </div>
            </section>
          )}

          {podest.length === 3 && (
            <section className="mt-10" style={auf(10)}>
              <span className={kicker}>Deine Leute {laeuft ? '(läuft gerade)' : '(letzter Abend)'}</span>
              <Podest plaetze={podest} bewegung={bewegung} />
            </section>
          )}

          {topGeschenke.length > 0 && (
            <section className="mt-10" style={auf(11)}>
              <span className={kicker}>
                Deine Top-Geschenke <span className="normal-case tracking-normal">(über alle Streams)</span>
              </span>
              <div className="flex flex-wrap gap-2.5">
                {topGeschenke.map((g) => (
                  <div key={g.slug} className="flex items-center gap-2.5 rounded-full border border-studio-border bg-studio-raised py-1.5 pl-1.5 pr-4">
                    {g.icon
                      ? <img src={g.icon} alt="" className="h-7 w-7 rounded-full object-contain" />
                      : <span className="grid h-7 w-7 place-items-center rounded-full bg-[#242a3a] font-display text-[11px] text-studio-muted">?</span>}
                    <span className="text-[12.5px]">{g.slug}</span>
                    <span className="font-mono text-[11px] text-studio-muted">{fmt(g.count)}× · {fmt(g.coins)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-10" style={auf(12)}>
            <span className={kicker}>Alles andere an diesem Abend</span>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))' }}>
              {gruppen.map((g) => (
                <div key={g.titel} className="rounded-xl border border-studio-border p-4" style={{ background: 'var(--color-studio-panel)' }}>
                  <h3 className="mb-2 font-display text-[10px] font-normal uppercase tracking-[0.24em] text-studio-muted">{g.titel}</h3>
                  {g.zeilen.map((z) => (
                    <div key={z.label} className="flex items-baseline justify-between gap-2.5 border-t border-[rgba(38,42,54,.6)] py-1.5 first-of-type:border-t-0">
                      <span className="text-[13px] text-studio-muted">{z.label}</span>
                      <b className={`font-mono text-[14px] font-normal tabular-nums ${z.gold ? 'text-studio-gold' : ''}`}>{z.wert}</b>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {rangBest && (
              <p className="mt-3 text-[11.5px] text-studio-muted">
                Beste Platzierung im Zeitraum:{' '}
                <b className="font-mono font-normal text-studio-text">Platz {rangBest.platz}</b>
                {rangBest.art ? ` (${rangBest.art})` : ''}.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
