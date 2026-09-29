import type { GradeMode, Verdict } from './lib/grade';

export type { GradeMode, Verdict };

/** The language of the *prompt* (the side that is shown). */
export type SourceLang = 'en' | 'fa' | 'unknown';

export interface Card {
  id: string;
  /** English or Persian text — the question side. */
  source: string;
  sourceLang: SourceLang;
  /** Mexican-Spanish translation. Never rendered until the check is done. */
  answer: string;
  /** Other phrasings that are also accepted, from the CSV "also accept" column. */
  alternates: string[];
  /** Free-form notes/tags from the CSV, shown after revealing. */
  note?: string;
}

/** Spaced-repetition state for one card (SM-2). */
export interface CardSchedule {
  /** Ease factor, minimum 1.3. */
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Number of successful repetitions in a row. */
  reps: number;
  /** Total number of times the card has been missed. */
  lapses: number;
  /** Epoch milliseconds when the card becomes due again. */
  due: number;
  lastReviewed?: number;
}

export const NEW_CARD: CardSchedule = {
  ease: 2.5,
  interval: 0,
  reps: 0,
  lapses: 0,
  due: 0,
};

export interface Attempt {
  cardId: string;
  /** What the learner wrote/said. */
  given: string;
  verdict: Verdict;
  score: number;
  mode: GradeMode;
  /** Epoch milliseconds. */
  at: number;
}

export interface DeckMeta {
  id: string;
  name: string;
  /** Original file name, for your reference. */
  sourceFile: string;
  createdAt: number;
  updatedAt: number;
}

export interface Deck {
  meta: DeckMeta;
  cards: Card[];
  /** Schedules keyed by card id. */
  schedule: Record<string, CardSchedule>;
  /** Most recent attempts, newest last, capped. */
  attempts: Attempt[];
}

export interface Settings {
  gradeMode: GradeMode;
  /** BCP-47 tag handed to the speech recogniser. */
  speechLocale: string;
  /** Show the letter-by-letter diff after a check. */
  showDiff: boolean;
  /** Cards per practice session; 0 = "everything that is due". */
  sessionSize: number;
  /** Include cards that are not due yet. */
  includeNotDue: boolean;
  /** Show a hint (the "gotchas" tip) on the practice screen. */
  showHints: boolean;
  theme: 'dark' | 'light' | 'system';
}

export const DEFAULT_SETTINGS: Settings = {
  gradeMode: 'smart',
  speechLocale: 'es-MX',
  showDiff: true,
  sessionSize: 20,
  includeNotDue: false,
  showHints: true,
  theme: 'dark',
};
