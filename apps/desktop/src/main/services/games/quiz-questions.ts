// quiz-questions.ts — eingebaute Quiz-Fragenpools nach Thema. Die einzelnen
// Themen-Dateien liegen in quiz-pool/ (vom Fragen-Team generiert). Hier werden
// sie zu einer Registry gebündelt + zufällig gezogen.
import { FRAGEN as fortnite } from './quiz-pool/fortnite';
import { FRAGEN as gaming } from './quiz-pool/gaming';
import { FRAGEN as allgemeinwissen } from './quiz-pool/allgemeinwissen';
import { FRAGEN as musik } from './quiz-pool/musik';
import { FRAGEN as filmSerien } from './quiz-pool/film-serien';

export interface QuizQuestion {
  q: string;
  options: string[];
  /** 0-basierter Index der richtigen Antwort. */
  correct: number;
}

export interface QuizTheme { id: string; label: string; questions: QuizQuestion[] }

export const QUIZ_THEMES: QuizTheme[] = [
  { id: 'fortnite', label: 'Fortnite', questions: fortnite },
  { id: 'gaming', label: 'Gaming allgemein', questions: gaming },
  { id: 'allgemeinwissen', label: 'Allgemeinwissen', questions: allgemeinwissen },
  { id: 'musik', label: 'Musik', questions: musik },
  { id: 'film-serien', label: 'Film & Serien', questions: filmSerien },
  { id: 'mix', label: 'Bunt gemischt', questions: [...fortnite, ...gaming, ...allgemeinwissen, ...musik, ...filmSerien] },
];

/** n zufällige, eindeutige Fragen eines Themas (gemischt). rng injizierbar (Test). */
export function pickQuestions(themeId: string, n: number, rng: () => number = Math.random): QuizQuestion[] {
  const theme = QUIZ_THEMES.find((t) => t.id === themeId) ?? QUIZ_THEMES[QUIZ_THEMES.length - 1];
  const pool = [...(theme?.questions ?? [])];
  // Fisher-Yates-Shuffle mit injizierbarem rng.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as QuizQuestion, pool[i] as QuizQuestion];
  }
  return pool.slice(0, Math.max(1, n));
}
