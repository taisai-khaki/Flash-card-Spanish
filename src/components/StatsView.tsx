import { useMemo, useState } from 'react';
import type { Deck, Settings } from '../types';
import { computeStats, startOfToday } from '../lib/srs';

interface StatsViewProps {
  decks: Deck[];
  settings: Settings;
  onPractice: (deckId: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default function StatsView({ decks, settings, onPractice }: StatsViewProps) {
  const [selectedId, setSelectedId] = useState<string>(decks[0]?.meta.id ?? '');
  const deck = decks.find((candidate) => candidate.meta.id === selectedId) ?? decks[0] ?? null;

  const rows = useMemo(
    () =>
      decks.map((candidate) => ({
        deck: candidate,
        stats: computeStats(
          candidate.cards.length,
          candidate.schedule,
          candidate.attempts,
        ),
      })),
    [decks],
  );

  /** Reviews per day for the last 14 days, oldest first. */
  const activity = useMemo(() => {
    const today = startOfToday();
    const days: Array<{ label: string; count: number; correct: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const start = today - i * DAY_MS;
      const end = start + DAY_MS;
      const inDay = (deck?.attempts ?? []).filter((attempt) => attempt.at >= start && attempt.at < end);
      days.push({
        label: new Date(start).toLocaleDateString(undefined, { weekday: 'narrow' }),
        count: inDay.length,
        correct: inDay.filter((attempt) => attempt.verdict === 'correct').length,
      });
    }
    return days;
  }, [deck]);

  const hardest = useMemo(() => {
    if (!deck) return [];
    const misses = new Map<string, number>();
    for (const attempt of deck.attempts) {
      if (attempt.verdict === 'empty') continue;
      misses.set(attempt.cardId, (misses.get(attempt.cardId) ?? 0) + (attempt.verdict === 'correct' ? 0 : 1));
    }
    return [...misses.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cardId, count]) => ({ card: deck.cards.find((c) => c.id === cardId), count }))
      .filter((entry) => entry.card !== undefined);
  }, [deck]);

  const maxActivity = Math.max(1, ...activity.map((day) => day.count));

  if (decks.length === 0) {
    return (
      <div className="stack">
        <section className="card">
          <div className="card-head">
            <h2>Progress</h2>
          </div>
          <p className="empty-state">Import a deck and start practising to see your progress here.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>All decks</h2>
          <p className="muted">Cards come back sooner when you get them wrong.</p>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table stats-table">
            <thead>
              <tr>
                <th>Deck</th>
                <th>Cards</th>
                <th>New</th>
                <th>Due</th>
                <th>Learning</th>
                <th>Mature</th>
                <th>Accuracy</th>
                <th>Streak</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ deck: rowDeck, stats }) => (
                <tr
                  key={rowDeck.meta.id}
                  className={rowDeck.meta.id === deck?.meta.id ? 'is-selected' : ''}
                  onClick={() => setSelectedId(rowDeck.meta.id)}
                >
                  <td>{rowDeck.meta.name}</td>
                  <td>{stats.total}</td>
                  <td>{stats.newCards}</td>
                  <td>{stats.due}</td>
                  <td>{stats.learning + stats.young}</td>
                  <td>{stats.mature}</td>
                  <td>{stats.totalAttempts ? `${Math.round(stats.accuracy * 100)}%` : '—'}</td>
                  <td>{stats.streakDays > 0 ? `${stats.streakDays} d` : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="button button-small"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPractice(rowDeck.meta.id);
                      }}
                    >
                      Practise
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {deck && (
        <section className="card">
          <div className="card-head">
            <h2>{deck.meta.name}</h2>
            <p className="muted">
              {deck.attempts.length} recorded answer{deck.attempts.length === 1 ? '' : 's'} · checking in{' '}
              {settings.gradeMode} mode
            </p>
          </div>

          <h3>Last 14 days</h3>
          <div className="activity" role="img" aria-label="Reviews per day for the last two weeks">
            {activity.map((day, index) => (
              <div key={index} className="activity-day" title={`${day.count} reviews`}>
                <div className="activity-bar">
                  <div
                    className="activity-fill"
                    style={{ height: `${(day.count / maxActivity) * 100}%` }}
                  />
                  <div
                    className="activity-good"
                    style={{ height: `${(day.correct / maxActivity) * 100}%` }}
                  />
                </div>
                <span className="muted small">{day.label}</span>
              </div>
            ))}
          </div>

          {hardest.length > 0 && (
            <>
              <h3>Hardest so far</h3>
              <ul className="missed-list">
                {hardest.map(({ card, count }) => (
                  <li key={card!.id}>
                    <span dir={card!.sourceLang === 'fa' ? 'rtl' : 'ltr'} className="missed-source">
                      {card!.source}
                    </span>
                    <span className="muted small">
                      {card!.answer} · missed {count}×
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
