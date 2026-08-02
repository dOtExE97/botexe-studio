// intro.ts — reine Entscheidung: Soll für dieses Ereignis das persönliche
// Intro eines Zuschauers laufen? Kein I/O, kein Electron — testbar.
//
// Die Regeln sind unscheinbar, aber jede einzelne hat einen Grund:
//   • Einstellung: beim Betreten, beim Teamherz, bei beidem oder gar nicht.
//   • Nur EINMAL pro Zuschauer und Stream. Zuschauer gehen bei TikTok ständig
//     raus und rein — ohne diese Bremse liefe dasselbe Video mehrfach, und bei
//     mehreren Leuten gleichzeitig wäre es unerträglich.
//   • Test-Ereignisse lösen nichts aus, sonst feuert jeder Probelauf Intros.

/** Die ID des Geschenks „Teamherz" (englisch „Heart Me", 1 Coin).
 *
 *  DER FEHLER, DER DAHINTER STECKTE: Die App nannte das bezahlte MONATS-ABO
 *  „Teamherz" — TikTok nennt so aber ein Geschenk für 1 Coin, das jeder Fan
 *  täglich einmal gratis schicken kann. Wer „Intro beim Teamherz" einstellte,
 *  wartete also auf ein Abo, während die Teamherzen im Sekundentakt reinkamen.
 *  In einem echten Stream: 10 Teamherzen, null Intros.
 *
 *  Über die ID statt über den Namen, weil der Name lokalisiert ist. */
export const TEAMHERZ_GIFT_ID = 7934;

export type IntroTrigger = 'join' | 'sub' | 'teamherz' | 'beides' | 'aus';

export interface IntroFrage {
  /** Ereignisart, wie sie im Bus ankommt. */
  typ: string;
  /** Nur bei typ === 'gift': die Geschenk-ID (für den Teamherz-Auslöser). */
  giftId?: number;
  /** Test-/Wiedergabe-Ereignis? Dann nie. */
  synthetic?: boolean;
  /** Hat dieser Zuschauer sein Intro in dieser Sitzung schon bekommen? */
  schonGezeigt: boolean;
  /** Einstellung des Streamers. */
  wann: IntroTrigger;
}

/** Soll jetzt ein Intro laufen? */
export function sollIntroLaufen(f: IntroFrage): boolean {
  if (f.synthetic) return false;
  if (f.schonGezeigt) return false;
  const teamherz = f.typ === 'gift' && f.giftId === TEAMHERZ_GIFT_ID;
  switch (f.wann) {
    case 'aus': return false;
    case 'join': return f.typ === 'join';
    case 'teamherz': return teamherz;
    case 'sub': return f.typ === 'sub';
    // „Bei allem" schließt das Teamherz bewusst mit ein — es ist der Fall, den
    // die meisten meinen, wenn sie „wenn jemand mich unterstützt" sagen.
    case 'beides': return f.typ === 'join' || f.typ === 'sub' || teamherz;
    default: return false;   // unbekannte Einstellung → lieber nichts abspielen
  }
}

/** Klartext der Auslöser-Einstellung — für Log und Oberfläche dieselbe Quelle,
 *  damit im Log nicht „sub" steht, während die App „Beim Teamherz" anzeigt. */
export const INTRO_AUSLOESER_TEXT: Record<IntroTrigger, string> = {
  join: 'Beim Betreten',
  teamherz: 'Beim Teamherz-Geschenk',
  sub: 'Wenn jemand Superfan wird',
  beides: 'Bei allem',
  aus: 'Aus',
};
