import { useCallback, useMemo, useRef, useState } from 'react';
import type { Card, Deck } from '../types';
import { CSV_TEMPLATE, parseDeckCsv } from '../lib/csv';
import { computeStats, describeSchedule } from '../lib/srs';
import { deckToCsv } from '../lib/exportCsv';

interface LibraryViewProps {
  decks: Deck[];
  onImport: (cards: Card[], name: string, file: string) => void;
  onDelete: (deckId: string) => void;
  onRename: (deckId: string, name: string) => void;
  onPractice: (deckId: string) => void;
}

type Pending = {
  parsed: ReturnType<typeof parseDeckCsv>;
  fileName: string;
  name: string;
};

export default function LibraryView({ decks, onImport, onDelete, onRename, onPractice }: LibraryViewProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback((text: string, fileName: string) => {
    const parsed = parseDeckCsv(text);
    const guess = fileName.replace(/\.(csv|txt|tsv)$/i, '').trim();
    setPending({
      parsed,
      fileName,
      name: guess && !guess.toLowerCase().includes('sheet') ? guess : 'My Spanish deck',
    });
  }, []);

  const readFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      load(text, file.name);
    },
    [load],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void readFile(file);
    },
    [readFile],
  );

  const commit = useCallback(() => {
    if (!pending || pending.parsed.cards.length === 0) return;
    onImport(pending.parsed.cards, pending.name.trim() || 'My Spanish deck', pending.fileName);
    setPending(null);
    setPaste('');
  }, [onImport, pending]);

  const totalCards = useMemo(() => decks.reduce((sum, deck) => sum + deck.cards.length, 0), [decks]);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Add a word bank</h2>
          <p className="muted">
            Two columns: the text to translate (English or Persian) and the Mexican-Spanish answer.
          </p>
        </div>

        {!pending && (
          <>
            <div
              className={`dropzone ${dragging ? 'is-dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click();
              }}
            >
              <span className="dropzone-icon" aria-hidden="true">
                📄
              </span>
              <strong>Drop your .csv here, or click to choose a file</strong>
              <span className="muted">Comma, semicolon, tab or | separated — both are fine.</span>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = '';
              }}
            />

            <details className="paste-details">
              <summary>Or paste the CSV text directly</summary>
              <textarea
                className="paste-box"
                rows={5}
                dir="ltr"
                value={paste}
                placeholder={'source,answer\ncar,carro\nخانه,casa'}
                onChange={(event) => setPaste(event.target.value)}
              />
              <button
                type="button"
                className="button"
                disabled={paste.trim().length === 0}
                onClick={() => load(paste, 'Pasted deck.csv')}
              >
                Read pasted text
              </button>
            </details>

            <div className="template-row">
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'spanish-template.csv';
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                ⬇ Download a template CSV
              </button>
              <span className="muted">
                Columns: <code>source, answer, also accept, notes</code> — only the first two are required.
              </span>
            </div>
          </>
        )}

        {pending && (
          <div className="preview">
            <h3>Check before importing</h3>

            {pending.parsed.fatal ? (
              <p className="error-text">{pending.parsed.fatal}</p>
            ) : (
              <>
                <div className="preview-grid">
                  <label className="field">
                    <span>Deck name</span>
                    <input
                      type="text"
                      value={pending.name}
                      onChange={(event) =>
                        setPending({ ...pending, name: event.target.value })
                      }
                    />
                  </label>
                  <div className="preview-counts">
                    <span className="pill pill-good">{pending.parsed.cards.length} cards</span>
                    {pending.parsed.skipped > 0 && (
                      <span className="pill pill-warn">{pending.parsed.skipped} skipped</span>
                    )}
                    <span className="pill">
                      {pending.parsed.hasHeader ? 'header row detected' : 'no header — used columns 1 & 2'}
                    </span>
                  </div>
                </div>

                <p className="muted small">
                  Prompt column: <code>{pending.parsed.columns.source}</code> · Answer column:{' '}
                  <code>{pending.parsed.columns.answer}</code>
                  {pending.parsed.columns.alt && (
                    <>
                      {' '}
                      · also accepted: <code>{pending.parsed.columns.alt}</code>
                    </>
                  )}
                  {pending.parsed.columns.note && (
                    <>
                      {' '}
                      · notes: <code>{pending.parsed.columns.note}</code>
                    </>
                  )}
                </p>

                {pending.parsed.warnings.length > 0 && (
                  <details className="warnings">
                    <summary>
                      {pending.parsed.warnings.length} note
                      {pending.parsed.warnings.length === 1 ? '' : 's'} about this file
                    </summary>
                    <ul>
                      {pending.parsed.warnings.slice(0, 50).map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="preview-table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Prompt</th>
                        <th>Answer (hidden during practice)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.parsed.cards.slice(0, 6).map((card) => (
                        <tr key={card.id}>
                          <td dir={card.sourceLang === 'fa' ? 'rtl' : 'ltr'} lang={card.sourceLang}>
                            {card.source}
                          </td>
                          <td>
                            {card.answer}
                            {card.alternates.length > 0 && (
                              <span className="muted small"> · also: {card.alternates.join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="button-row">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={pending.parsed.cards.length === 0}
                    onClick={commit}
                  >
                    Import {pending.parsed.cards.length} cards
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setPending(null);
                      setPaste('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Your decks</h2>
          <p className="muted">
            {decks.length === 0
              ? 'Nothing imported yet.'
              : `${decks.length} deck${decks.length === 1 ? '' : 's'} · ${totalCards} cards in total.`}
          </p>
        </div>

        {decks.length === 0 ? (
          <p className="empty-state">
            Start by dropping a CSV above. A good first file looks like this:
            <pre>{CSV_TEMPLATE.trim()}</pre>
          </p>
        ) : (
          <ul className="deck-list">
            {decks.map((deck) => {
              const stats = computeStats(
                deck.cards.length,
                deck.schedule,
                deck.attempts,
              );
              const soonest = deck.cards
                .map((card) => deck.schedule[card.id])
                .filter((schedule) => schedule && schedule.reps > 0)
                .sort((a, b) => a.due - b.due)[0];
              return (
                <li key={deck.meta.id} className="deck-row">
                  <div className="deck-info">
                    {editingId === deck.meta.id ? (
                      <form
                        className="rename-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          onRename(deck.meta.id, editName.trim() || deck.meta.name);
                          setEditingId(null);
                        }}
                      >
                        <input
                          type="text"
                          value={editName}
                          autoFocus
                          onChange={(event) => setEditName(event.target.value)}
                          onBlur={() => {
                            onRename(deck.meta.id, editName.trim() || deck.meta.name);
                            setEditingId(null);
                          }}
                        />
                      </form>
                    ) : (
                      <strong>{deck.meta.name}</strong>
                    )}
                    <span className="muted small">
                      {deck.cards.length} cards · {stats.newCards} new · next {describeSchedule(soonest)} ·{' '}
                      {stats.totalAttempts > 0
                        ? `${Math.round(stats.accuracy * 100)}% correct`
                        : 'not practised yet'}
                    </span>
                    {deck.meta.sourceFile && (
                      <span className="muted small">from {deck.meta.sourceFile}</span>
                    )}
                  </div>

                  <div className="deck-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => onPractice(deck.meta.id)}
                    >
                      {stats.due > 0 ? `Practice ${stats.due}` : 'Practice'}
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        setEditingId(deck.meta.id);
                        setEditName(deck.meta.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        const blob = new Blob([deckToCsv(deck)], { type: 'text/csv;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `${deck.meta.name.replace(/[^\w\-]+/g, '_')}.csv`;
                        link.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${deck.meta.name}" and all of its progress? This cannot be undone.`,
                          )
                        ) {
                          onDelete(deck.meta.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
