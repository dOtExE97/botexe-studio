// GameGuide — Kurz-Anleitung je Chat-Spiel, direkt in der App.
//
// Warum: Die Spiele funktionieren nur, wenn drei Dinge zusammenkommen —
// das passende Widget liegt im Overlay, der Streamer startet richtig, und die
// Zuschauer kennen die Chat-Befehle. Das dritte stand nirgends: Die Befehle
// waren nur im Quelltext nachlesbar. Wer „!guess" nicht kennt, hält das Spiel
// für kaputt.
//
// Die Befehle hier sind aus der Spiel-Logik übernommen (games/*.ts) — bei einer
// Änderung dort MUSS dieser Text mitgezogen werden.
import { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

export interface SpielAnleitung {
  /** Wie der Streamer es startet. */
  start: string;
  /** Was die Zuschauer in den Chat schreiben — die echten Befehle. */
  chat: { befehl: string; bedeutung: string }[];
  /** Welches Widget im Overlay liegen muss. */
  widget: string;
  /** Was danach passiert — damit man weiß, was man erwarten darf. */
  ablauf: string;
}

export const SPIEL_ANLEITUNGEN: Record<string, SpielAnleitung> = {
  quiz: {
    start: 'Thema wählen, Anzahl Fragen und Sekunden pro Frage einstellen, dann „Auto-Quiz starten".',
    chat: [
      { befehl: 'A  B  C  D', bedeutung: 'Antwort abgeben — ein einzelner Buchstabe genügt' },
      { befehl: '!a  !b  !c  !d', bedeutung: 'geht genauso, falls jemand lieber Befehle tippt' },
    ],
    widget: 'Quiz',
    ablauf:
      'Läuft von selbst durch: Frage einblenden → Sammelzeit → auflösen → nächste Frage. '
      + 'Pro Zuschauer zählt die ERSTE Antwort, spätere Änderungen werden ignoriert. '
      + 'Vor dem Auflösen verrät die Anzeige nicht, welche Option richtig ist.',
  },
  hangman: {
    start: 'Geheimes Wort eintippen und auf „Start". Das Wort erscheint verdeckt im Overlay.',
    chat: [
      { befehl: 'A  (einzelner Buchstabe)', bedeutung: 'Buchstabe raten' },
      { befehl: '!guess LÖSUNGSWORT', bedeutung: 'das ganze Wort auf einmal lösen' },
    ],
    widget: 'Galgenmännchen',
    ablauf:
      'Jeder Fehlversuch zeichnet einen Strich mehr. Wer den letzten fehlenden Buchstaben '
      + 'trifft oder das Wort errät, gewinnt. Umlaute zählen als eigene Buchstaben.',
  },
  'tic-tac-toe': {
    start: 'Einfach auf „Tic Tac Toe" klicken — die ersten zwei Zuschauer, die beitreten, spielen.',
    chat: [
      { befehl: '!join', bedeutung: 'mitspielen — die ersten zwei verschiedenen Leute werden ✗ und ○' },
      { befehl: '1 bis 9', bedeutung: 'Feld setzen (1 = oben links, 9 = unten rechts)' },
    ],
    widget: 'Tic Tac Toe',
    ablauf: 'Abwechselnd ziehen. Wer zuerst drei in einer Reihe hat, gewinnt.',
  },
  'connect-four': {
    start: 'Auf „4 Gewinnt" klicken — die ersten zwei Zuschauer, die beitreten, spielen.',
    chat: [
      { befehl: '!join', bedeutung: 'mitspielen — die ersten zwei verschiedenen Leute' },
      { befehl: '1 bis 7', bedeutung: 'Stein in diese Spalte werfen (er fällt nach unten)' },
    ],
    widget: '4 Gewinnt',
    ablauf: 'Abwechselnd werfen. Vier in einer Reihe — waagrecht, senkrecht oder schräg — gewinnt.',
  },
  boss: {
    start: 'Auf „Stream-Boss starten". Ab dann zählt jedes Geschenk als Schaden.',
    chat: [{ befehl: '— keine Befehle —', bedeutung: 'Zuschauer greifen mit Geschenken an, nicht per Chat' }],
    widget: 'Stream-Boss',
    ablauf:
      'Der Schaden richtet sich nach den Coins des Geschenks. Fällt der Boss, gibt es einen '
      + 'Moment im Overlay und der nächste Boss ist stärker.',
  },
};

/** Aufklappbare Anleitung für ein Spiel. Standardmäßig zu — wer sie einmal
 *  gelesen hat, will sie nicht dauerhaft im Weg haben. */
export default function GameGuide({ spiel, titel }: { spiel: keyof typeof SPIEL_ANLEITUNGEN; titel: string }) {
  const [offen, setOffen] = useState(false);
  const a = SPIEL_ANLEITUNGEN[spiel];
  if (!a) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOffen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-studio-muted transition-colors hover:text-studio-teal"
        title={`Kurz-Anleitung für ${titel}`}
      >
        <HelpCircle size={11} />
        So funktioniert&apos;s
        <ChevronDown size={10} className={`transition-transform ${offen ? 'rotate-180' : ''}`} />
      </button>

      {offen && (
        <div className="mt-1.5 rounded-lg border border-studio-border bg-studio-bg/60 p-2.5 text-[11px] leading-relaxed">
          <p className="text-studio-text/90">{a.start}</p>

          <div className="mt-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-studio-gold">
              Das schreiben deine Zuschauer
            </div>
            <table className="mt-1 w-full">
              <tbody>
                {a.chat.map((c) => (
                  <tr key={c.befehl}>
                    <td className="whitespace-nowrap pr-3 align-top font-mono text-studio-teal">{c.befehl}</td>
                    <td className="align-top text-studio-muted">{c.bedeutung}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-studio-muted">{a.ablauf}</p>
          <p className="mt-1.5 text-studio-muted/80">
            Nötig im Overlay: <b className="text-studio-text/90">{a.widget}</b>-Widget — ohne das sehen
            deine Zuschauer nichts. Die App warnt dich beim Start, wenn es fehlt.
          </p>
        </div>
      )}
    </div>
  );
}
