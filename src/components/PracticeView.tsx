import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Attempt, Card, Deck, Settings, Verdict } from '../types';
import type { DiffToken, GradeResult } from '../lib/grade';
import { gradeAnswer } from '../lib/grade';
import { isDue } from '../lib/srs';
import { GOTCHAS } from '../data/synonyms.es';
import AnswerInput from './AnswerInput';

interface PracticeViewProps {
  decks: Deck[];
  settings: Settings;
  activeDeckId: string | null;
  onSelectDeck: (deckId: string | null) => void;
  onRecordAttempt: (deckId: string, cardId: string, attempt: Omit<Attempt, 'cardId' | 'at'>) => void;
}

interface SessionCard {
  card: Card;
  given: string;
  verdict: Verdict;
  score: number;
}

interface Session {
  deckId: string;
  cards: SessionCard[];
  startedAt: number;
}

const VERDICT_TEXT: Record<Verdict, { title: string; icon: string; className: string }> = {
  correct: { title: '¡Correcto!', icon: '✅', className: 'is-correct' },
  close: { title: 'Close — almost', icon: '🟡', className: 'is-close' },
  incorrect: { title: 'Not quite', icon: '❌', className: 'is-incorrect' },
  empty: { title: 'Skipped', icon: '💤', className: 'is-empty' },
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function DiffView({ diff }: { diff: DiffToken[] }) {
  if (diff.length === 0) return null;
  return (
    <p className="diff" aria-label="Word by word comparison">
      {diff.map((token, index) => (
        <span key={index} className={`diff-token diff-${token.type}`}>
          {token.text}
        </span>
      ))}
    </p>
  );
}

export default function PracticeView({
  decks,
  settings,
  activeDeckId,
  onSelectDeck,
  onRecordAttempt,
}: PracticeViewProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<GradeResult | null>(null);
  const [revealed, setRevealed] = useState(false);

  const deck = useMemo(
    () => decks.find((candidate) => candidate.meta.id === activeDeckId) ?? null,
    [activeDeckId, decks],
  );

  // Abandon the session if its deck gets deleted underneath us.
  useEffect(() => {
    if (activeDeckId && !deck) onSelectDeck(null);
  }, [activeDeckId, deck, onSelectDeck]);

  const dueCount = useMemo(() => {
    if (!deck) return 0;
    return deck.cards.filter((card) => isDue(deck.schedule[card.id])).length;
  }, [deck]);

  const reset = useCallback(() => {
    setSession(null);
    setSummary(null);
    setIndex(0);
    setAnswer('');
    setResult(null);
    setRevealed(false);
  }, []);

  const start = useCallback(
    (target: Deck, extraIds: string[] = []) => {
      let pool: Card[];
      if (extraIds.length > 0) {
        pool = target.cards.filter((card) => extraIds.includes(card.id));
      } else {
        pool = target.cards.filter(
          (card) => settings.includeNotDue || isDue(target.schedule[card.id]),
        );
        if (pool.length === 0 && settings.includeNotDue) pool = target.cards;
      }
      const size = settings.sessionSize > 0 ? settings.sessionSize : pool.length;
      const picked = shuffle(pool).slice(0, size);
      if (picked.length === 0) return;
      setSummary(null);
      setIndex(0);
      setAnswer('');
      setResult(null);
      setRevealed(false);
      setSession({
        deckId: target.meta.id,
        cards: picked.map((card) => ({
          card,
          given: '',
          verdict: 'empty' as Verdict,
          score: 0,
        })),
        startedAt: Date.now(),
      });
    },
    [settings.includeNotDue, settings.sessionSize],
  );

  const current = session?.cards[index] ?? null;

  const commit = useCallback(
    (verdict: Verdict, score: number) => {
      if (!session || !current) return;
      const given = answer.trim();
      onRecordAttempt(session.deckId, current.card.id, {
        given,
        verdict,
        score,
        mode: settings.gradeMode,
      });
      setSession({
        ...session,
        cards: session.cards.map((entry, position) =>
          position === index ? { ...entry, given, verdict, score } : entry,
        ),
      });
    },
    [answer, current, index, onRecordAttempt, session, settings.gradeMode],
  );

  const check = useCallback(() => {
    if (!current) return;
    const graded = gradeAnswer({
      answer,
      reference: current.card.answer,
      alternates: current.card.alternates,
      mode: settings.gradeMode,
    });
    setResult(graded);
    commit(graded.verdict, graded.score);
  }, [answer, commit, current, settings.gradeMode]);

  const next = useCallback(() => {
    if (!session) return;
    if (index + 1 >= session.cards.length) {
      setSummary(session);
      setSession(null);
      return;
    }
    setIndex(index + 1);
    setAnswer('');
    setResult(null);
    setRevealed(false);
  }, [index, session]);

  const skip = useCallback(() => {
    if (!session) return;
    next();
  }, [next, session]);

  // ============================================================ summary screen
  if (summary && deck) {
    const answered = summary.cards.filter((entry) => entry.verdict !== 'empty');
    const correct = summary.cards.filter((entry) => entry.verdict === 'correct').length;
    const close = summary.cards.filter((entry) => entry.verdict === 'close').length;
    const missed = summary.cards.filter((entry) => entry.verdict !== 'correct');
    const seconds = Math.max(1, Math.round((Date.now() - summary.startedAt) / 1000));
    const missedIds = missed.map((entry) => entry.card.id);

    return (
      <div className="stack">
        <section className="card">
          <div className="card-head">
            <h2>Session finished</h2>
            <p className="muted">
              {deck.meta.name} · {summary.cards.length} card
              {summary.cards.length === 1 ? '' : 's'} · {seconds}s
            </p>
          </div>

          <div className="scoreboard">
            <div className="score score-good">
              <strong>{correct}</strong>
              <span>correct</span>
            </div>
            <div className="score score-warn">
              <strong>{close}</strong>
              <span>close</span>
            </div>
            <div className="score score-bad">
              <strong>{summary.cards.length - correct - close}</strong>
              <span>missed</span>
            </div>
            <div className="score">
              <strong>{answered.length === 0 ? '—' : `${Math.round((correct / Math.max(1, answered.length)) * 100)}%`}</strong>
              <span>accuracy</span>
            </div>
          </div>

          {missedIds.length > 0 && (
            <>
              <h3>Worth another look</h3>
              <ul className="missed-list">
                {summary.cards
                  .filter((entry) => entry.verdict !== 'correct')
                  .map((entry) => (
                    <li key={entry.card.id}>
                      <span dir={entry.card.sourceLang === 'fa' ? 'rtl' : 'ltr'} className="missed-source">
                        {entry.card.source}
                      </span>
                      <span className="muted small">
                        {entry.given ? `you wrote “${entry.given}”` : 'skipped'} → {entry.card.answer}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}

          <div className="button-row">
            <button type="button" className="button button-primary" onClick={() => start(deck)}>
              Practise again
            </button>
            {missedIds.length > 0 && (
              <button
                type="button"
                className="button"
                onClick={() => start(deck, missedIds)}
              >
                Repeat the {missedIds.length} I missed
              </button>
            )}
            <button type="button" className="button" onClick={reset}>
              Back to decks
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ============================================================== setup screen
  if (!session || !current) {
    return (
      <div className="stack">
        <section className="card">
          <div className="card-head">
            <h2>Practice</h2>
            <p className="muted">
              Translate the prompt into Mexican Spanish. The answer stays hidden — write it or say it, then
              let the app check.
            </p>
          </div>

          {decks.length === 0 ? (
            <p className="empty-state">
              No decks yet. Add a CSV on the <strong>Decks</strong> tab first.
            </p>
          ) : (
            <>
              <label className="field">
                <span>Deck</span>
                <select
                  value={activeDeckId ?? ''}
                  onChange={(event) => onSelectDeck(event.target.value || null)}
                >
                  <option value="">Choose a deck…</option>
                  {decks.map((candidate) => (
                    <option key={candidate.meta.id} value={candidate.meta.id}>
                      {candidate.meta.name} ({candidate.cards.length} cards)
                    </option>
                  ))}
                </select>
              </label>

              {deck && (
                <div className="session-summary">
                  <p>
                    <strong>{dueCount}</strong> card{dueCount === 1 ? '' : 's'} due now ·{' '}
                    <strong>{deck.cards.length}</strong> in total · session size{' '}
                    <strong>{settings.sessionSize > 0 ? settings.sessionSize : 'all'}</strong> · checking in{' '}
                    <strong>{settings.gradeMode === 'strict' ? 'strict' : 'smart'}</strong> mode
                  </p>
                  <button
                    type="button"
                    className="button button-primary button-big"
                    onClick={() => start(deck)}
                  >
                    Start session
                  </button>
                  {!settings.includeNotDue && dueCount === 0 && (
                    <p className="muted small">
                      Nothing is due right now.{' '}
                      <button type="button" className="link-button" onClick={() => start(deck, deck.cards.map((c) => c.id))}>
                        Practise anyway
                      </button>
                      , or turn on “include cards that are not due yet” in Settings.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    );
  }

  // =========================================================== practice screen
  const isRtl = current.card.sourceLang === 'fa';
  const verdict = result ? VERDICT_TEXT[result.verdict] : null;
  const progress = ((index + 1) / session.cards.length) * 100;
  const tip = GOTCHAS.find((entry) =>
    current.card.answer.toLowerCase().includes(entry.use.toLowerCase()),
  );

  return (
    <div className="stack">
      <section className="card practice-card">
        <div className="practice-top">
          <button type="button" className="link-button" onClick={reset}>
            ← End session
          </button>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={session.cards.length}
          >
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="muted small">
            {index + 1} / {session.cards.length}
          </span>
        </div>

        <div className="prompt-block">
          <span className="prompt-label">Translate to Mexican Spanish</span>
          <p
            className="prompt"
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={current.card.sourceLang === 'fa' ? 'fa' : 'en'}
          >
            {current.card.source}
          </p>
          {current.card.note && !result && <p className="muted small note-line">hint: {current.card.note}</p>}
        </div>

        {!result ? (
          <>
            <AnswerInput
              value={answer}
              onChange={setAnswer}
              onSubmit={check}
              disabled={false}
              locale={settings.speechLocale}
              micEnabled
            />
            <div className="button-row">
              <button
                type="button"
                className="button button-primary button-big"
                onClick={check}
                disabled={answer.trim().length === 0}
              >
                Check my answer
              </button>
              <button type="button" className="button" onClick={skip}>
                Skip
              </button>
            </div>
          </>
        ) : (
          <div className={`result ${verdict?.className ?? ''}`} role="status" aria-live="polite">
            <div className="result-head">
              <span className="result-icon" aria-hidden="true">
                {verdict?.icon}
              </span>
              <strong>{verdict?.title}</strong>
              <span className="muted small">{result.reason}</span>
            </div>

            {settings.showDiff && result.verdict !== 'correct' && <DiffView diff={result.diff} />}

            {revealed ? (
              <div className="reveal">
                <span className="prompt-label">The answer</span>
                <p className="correct-answer" dir="ltr" lang="es-MX">
                  {current.card.answer}
                </p>
                {current.card.alternates.length > 0 && (
                  <p className="muted small">Also accepted: {current.card.alternates.join(' · ')}</p>
                )}
                {current.card.note && <p className="muted small">{current.card.note}</p>}
              </div>
            ) : (
              <button type="button" className="button" onClick={() => setRevealed(true)}>
                Show me the answer
              </button>
            )}

            <div className="button-row">
              <button type="button" className="button button-primary button-big" onClick={next}>
                {index + 1 >= session.cards.length ? 'Finish' : 'Next card'}
              </button>
            </div>
          </div>
        )}
      </section>

      {settings.showHints && (
        <p className="muted small hint-strip">
          {tip
            ? `Mexican tip: people say “${tip.use}”, not “${tip.avoid}”.`
            : 'Accents, capital letters and articles are ignored — meaning is not.'}
        </p>
      )}
    </div>
  );
}
