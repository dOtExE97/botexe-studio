// intro.ts — reine Entscheidung: Soll für dieses Ereignis das persönliche
// Intro eines Zuschauers laufen? Kein I/O, kein Electron — testbar.
//
// Die Regeln sind unscheinbar, aber jede einzelne hat einen Grund:
//   • Einstellung: beim Betreten, beim Teamherz, bei beidem oder gar nicht.
//   • Nur EINMAL pro Zuschauer und Stream. Zuschauer gehen bei TikTok ständig
//     raus und rein — ohne diese Bremse liefe dasselbe Video mehrfach, und bei
//     mehreren Leuten gleichzeitig wäre es unerträglich.
//   • Test-Ereignisse lösen nichts aus, sonst feuert jeder Probelauf Intros.

export type IntroTrigger = 'join' | 'sub' | 'beides' | 'aus';

export interface IntroFrage {
  /** Ereignisart, wie sie im Bus ankommt. */
  typ: string;
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
  switch (f.wann) {
    case 'aus': return false;
    case 'join': return f.typ === 'join';
    case 'sub': return f.typ === 'sub';
    case 'beides': return f.typ === 'join' || f.typ === 'sub';
    default: return false;   // unbekannte Einstellung → lieber nichts abspielen
  }
}
