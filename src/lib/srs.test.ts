import { describe, expect, it } from 'vitest';
import { computeStats, computeStreak, isDue, review, startOfToday } from './srs';
import { NEW_CARD } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-29T12:00:00').getTime();

describe('review (SM-2)', () => {
  it('gives a brand new card a one-day interval after a correct answer', () => {
    const next = review(NEW_CARD, 'correct', NOW);
    expect(next.interval).toBe(1);
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(0);
  });

  it('jumps to six days on the second success', () => {
    const first = review(NEW_CARD, 'correct', NOW);
    const second = review(first, 'correct', NOW + DAY);
    expect(second.interval).toBe(6);
    expect(second.reps).toBe(2);
  });

  it('multiplies by the ease factor after that', () => {
    let state = review(NEW_CARD, 'correct', NOW);
    state = review(state, 'correct', NOW + DAY);
    state = review(state, 'correct', NOW + 7 * DAY);
    expect(state.interval).toBeGreaterThan(6);
  });

  it('resets the card when it is missed, but not below the minimum ease', () => {
    let state = review(NEW_CARD, 'correct', NOW);
    state = review(state, 'correct', NOW + DAY);
    const lapsed = review(state, 'incorrect', NOW + 2 * DAY);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.interval).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.ease).toBeLessThan(state.ease);

    let floored = { ...state, ease: 1.3 };
    for (let i = 0; i < 20; i++) floored = review(floored, 'incorrect', NOW);
    expect(floored.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('treats "close" as a half-credit answer', () => {
    const perfect = review(NEW_CARD, 'correct', NOW);
    const half = review(NEW_CARD, 'close', NOW);
    expect(half.interval).toBeLessThan(perfect.interval);
  });

  it('schedules a lapsed card to come back within the hour', () => {
    const lapsed = review(NEW_CARD, 'incorrect', NOW);
    expect(lapsed.due - NOW).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});

describe('isDue', () => {
  it('treats a card with no schedule as due', () => {
    expect(isDue(undefined, NOW)).toBe(true);
  });

  it('is false before the due date and true after it', () => {
    expect(isDue({ ...NEW_CARD, due: NOW + DAY }, NOW)).toBe(false);
    expect(isDue({ ...NEW_CARD, due: NOW - 1 }, NOW)).toBe(true);
  });
});

describe('computeStreak', () => {
  it('is zero with no activity', () => {
    expect(computeStreak([], startOfToday(NOW))).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const today = startOfToday(NOW);
    const attempts = [{ at: today + 3600_000 }, { at: today - DAY + 3600_000 }, { at: today - 2 * DAY }];
    expect(computeStreak(attempts, today)).toBe(3);
  });

  it('still counts a streak that ended yesterday', () => {
    const today = startOfToday(NOW);
    const attempts = [{ at: today - DAY + 3600_000 }, { at: today - 2 * DAY }];
    expect(computeStreak(attempts, today)).toBe(2);
  });

  it('breaks on a missed day', () => {
    const today = startOfToday(NOW);
    const attempts = [{ at: today + 3600_000 }, { at: today - 3 * DAY }];
    expect(computeStreak(attempts, today)).toBe(1);
  });
});

describe('computeStats', () => {
  it('counts new cards as due', () => {
    const stats = computeStats(3, {}, [], NOW);
    expect(stats.newCards).toBe(3);
    expect(stats.due).toBe(3);
    expect(stats.accuracy).toBe(0);
  });

  it('computes accuracy from the stored attempts', () => {
    const stats = computeStats(
      1,
      {},
      [
        { verdict: 'correct', at: NOW },
        { verdict: 'correct', at: NOW },
        { verdict: 'incorrect', at: NOW },
        { verdict: 'close', at: NOW },
      ],
      NOW,
    );
    expect(stats.accuracy).toBeCloseTo(0.5);
  });

  it('ignores skipped cards in the accuracy figure', () => {
    const stats = computeStats(
      1,
      {},
      [
        { verdict: 'correct', at: NOW },
        { verdict: 'empty', at: NOW },
        { verdict: 'empty', at: NOW },
      ],
      NOW,
    );
    expect(stats.accuracy).toBe(1);
  });
});
