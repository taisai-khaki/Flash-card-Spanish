/**
 * Spaced repetition (SM-2).
 *
 * Every card remembers when it should come back. A correct answer pushes the
 * next review days out; a wrong one brings it back tomorrow.
 */

import type { CardSchedule, Verdict } from '../types';
import { NEW_CARD } from '../types';

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES = 60 * 1000;

/** Grades a verdict into the 0..5 quality scale SM-2 expects. */
export function verdictToQuality(verdict: Verdict, elapsedMs: number): number {
  const overTime = elapsedMs > 60 * DAY_MS;
  switch (verdict) {
    case 'correct':
      return overTime ? 4 : 5;
    case 'close':
      return 3;
    case 'empty':
    case 'incorrect':
      return 1;
    default:
      return 3;
  }
}

export function startOfToday(now = Date.now()): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Applies one review to a card's schedule and returns the new schedule.
 * Pure: the caller decides when to persist it.
 */
export function review(
  current: CardSchedule | undefined,
  verdict: Verdict,
  now: number = Date.now(),
): CardSchedule {
  const card = current ?? NEW_CARD;
  const elapsed = card.lastReviewed ? now - card.lastReviewed : 0;
  const quality = verdictToQuality(verdict, elapsed);

  if (quality < 3) {
    // Lapse: repeat the card soon and make future intervals gentler.
    return {
      ease: Math.max(MIN_EASE, card.ease - 0.2),
      interval: 0,
      reps: 0,
      lapses: card.lapses + 1,
      due: now + 10 * MINUTES,
      lastReviewed: now,
    };
  }

  let interval: number;
  if (card.reps === 0) interval = 1;
  else if (card.reps === 1) interval = 6;
  else interval = Math.round(card.interval * card.ease);

  // "Close" is a half-credit answer: bring the card back well before a fully
  // correct one would return, including on the very first exposure.
  if (quality === 3) {
    interval = interval <= 1 ? 0.5 : Math.max(1, Math.round(interval * 0.6));
  }

  const ease = Math.max(
    MIN_EASE,
    card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  return {
    ease: Math.round(ease * 100) / 100,
    interval,
    reps: card.reps + 1,
    lapses: card.lapses,
    due: startOfToday(now) + interval * DAY_MS,
    lastReviewed: now,
  };
}

/** Interval labels for the library list. */
export function describeSchedule(schedule: CardSchedule | undefined): string {
  if (!schedule || (schedule.reps === 0 && schedule.lapses === 0)) return 'new';
  if (schedule.interval === 0) return 'in 10 min';
  if (schedule.interval < 1) return 'later today';
  if (schedule.interval === 1) return 'tomorrow';
  if (schedule.interval < 30) return `in ${schedule.interval} d`;
  if (schedule.interval < 365) return `in ${Math.round(schedule.interval / 30)} mo`;
  return `in ${(schedule.interval / 365).toFixed(1)} y`;
}

export function isDue(schedule: CardSchedule | undefined, now = Date.now()): boolean {
  if (!schedule) return true;
  return schedule.due <= now;
}

export interface DeckStats {
  total: number;
  newCards: number;
  due: number;
  learning: number;
  young: number;
  mature: number;
  /** Rolling accuracy over the stored attempts, 0..1. */
  accuracy: number;
  totalAttempts: number;
  streakDays: number;
}

export function computeStats(
  total: number,
  schedule: Record<string, CardSchedule>,
  attempts: Array<{ verdict: Verdict; at: number }>,
  now = Date.now(),
): DeckStats {
  const today = startOfToday(now);
  // A card with no entry in `schedule` has never been seen, so it is new and
  // due straight away. Counting them from the deck total keeps the two right
  // even when the schedule is still empty.
  const newCards = Math.max(0, total - Object.keys(schedule).length);
  let due = newCards;
  let learning = 0;
  let young = 0;
  let mature = 0;

  for (const card of Object.values(schedule)) {
    if (card.interval === 0) {
      learning += 1;
      due += 1;
    } else if (card.interval < 21) {
      young += 1;
      if (card.due <= now) due += 1;
    } else {
      mature += 1;
      if (card.due <= now) due += 1;
    }
  }

  const correct = attempts.filter((a) => a.verdict === 'correct').length;
  const counted = attempts.filter((a) => a.verdict !== 'empty').length;

  return {
    total,
    newCards,
    due,
    learning,
    young,
    mature,
    accuracy: counted === 0 ? 0 : correct / counted,
    totalAttempts: counted,
    streakDays: computeStreak(attempts, today),
  };
}

/** Consecutive days (ending today or yesterday) that had at least one review. */
export function computeStreak(attempts: Array<{ at: number }>, today: number): number {
  if (attempts.length === 0) return 0;
  const days = new Set(attempts.map((attempt) => startOfToday(attempt.at)));
  let streak = 0;
  let cursor = days.has(today) ? today : today - DAY_MS;
  if (!days.has(cursor)) return 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

/** Human label for a grade-mode toggle, used in Settings and the summary. */
export function accuracyLabel(accuracy: number): string {
  if (accuracy === 0) return '—';
  return `${Math.round(accuracy * 100)}%`;
}
