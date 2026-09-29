import { useRef, useState } from 'react';
import type { GradeMode, Settings } from '../types';
import { SYNONYM_GROUPS, GOTCHAS } from '../data/synonyms.es';

interface SettingsViewProps {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => void;
  onExport: () => string;
  onImport: (text: string) => { ok: boolean; message: string };
  deckCount: number;
}

const SPEECH_LOCALES = [
  { value: 'es-MX', label: 'es-MX — Mexican Spanish (default)' },
  { value: 'es-US', label: 'es-US — US Spanish' },
  { value: 'es-ES', label: 'es-ES — Castilian Spanish' },
  { value: 'es-419', label: 'es-419 — Latin American Spanish' },
];

export default function SettingsView({
  settings,
  onPatch,
  onExport,
  onImport,
  deckCount,
}: SettingsViewProps) {
  const [message, setMessage] = useState<string | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const variantCount = SYNONYM_GROUPS.reduce(
    (total, group) => total + group.variants.length,
    0,
  );

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>How your answer is checked</h2>
          <p className="muted">
            The answer is never shown while you work — the app compares what you wrote against the CSV.
          </p>
        </div>

        <div className="toggle-row" role="radiogroup" aria-label="Grading mode">
          {(
            [
              {
                id: 'smart',
                title: 'Smart',
                text: 'Accepts synonyms (coche for carro), accents, articles, plural differences, number words and small typos. Explains what is missing.',
              },
              {
                id: 'strict',
                title: 'Strict',
                text: 'Only a word-for-word match counts (case, accents, punctuation and articles still ignored).',
              },
            ] as Array<{ id: GradeMode; title: string; text: string }>
          ).map((option) => (
            <label
              key={option.id}
              className={`toggle-card ${settings.gradeMode === option.id ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="gradeMode"
                value={option.id}
                checked={settings.gradeMode === option.id}
                onChange={() => onPatch({ gradeMode: option.id })}
              />
              <strong>{option.title}</strong>
              <span className="muted small">{option.text}</span>
            </label>
          ))}
        </div>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.showDiff}
            onChange={(event) => onPatch({ showDiff: event.target.checked })}
          />
          <span>
            <strong>Show the word-by-word diff</strong>
            <span className="muted small">Highlights which words were missing or extra.</span>
          </span>
        </label>

        <details className="warnings">
          <summary>
            What smart checking accepts ({variantCount} Mexican-Spanish variants in the dictionary)
          </summary>
          <p className="muted small">
            You can edit the list at <code>src/data/synonyms.es.ts</code> in the project — add your own
            words and the app will start accepting them.
          </p>
          <div className="synonym-list">
            {SYNONYM_GROUPS.slice(0, 60).map((group) => (
              <div key={group.canonical} className="synonym-row">
                <strong>{group.canonical}</strong>
                <span className="muted small">= {group.variants.join(', ')}</span>
              </div>
            ))}
            {SYNONYM_GROUPS.length > 60 && (
              <p className="muted small">…and {SYNONYM_GROUPS.length - 60} more groups.</p>
            )}
          </div>
        </details>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Practice</h2>
        </div>

        <label className="field">
          <span>Cards per session</span>
          <input
            type="number"
            min={0}
            max={200}
            value={settings.sessionSize}
            onChange={(event) =>
              onPatch({ sessionSize: Math.max(0, Number(event.target.value) || 0) })
            }
          />
          <span className="muted small">0 means “everything that is due”.</span>
        </label>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.includeNotDue}
            onChange={(event) => onPatch({ includeNotDue: event.target.checked })}
          />
          <span>
            <strong>Include cards that are not due yet</strong>
            <span className="muted small">Turn this off to stick to the spaced-repetition schedule.</span>
          </span>
        </label>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.showHints}
            onChange={(event) => onPatch({ showHints: event.target.checked })}
          />
          <span>
            <strong>Show Mexican-Spanish tips</strong>
            <span className="muted small">Small reminders about regional vocabulary.</span>
          </span>
        </label>

        <label className="field">
          <span>Speech recognition language</span>
          <select
            value={settings.speechLocale}
            onChange={(event) => onPatch({ speechLocale: event.target.value })}
          >
            {SPEECH_LOCALES.map((locale) => (
              <option key={locale.value} value={locale.value}>
                {locale.label}
              </option>
            ))}
          </select>
          <span className="muted small">
            Used by the microphone button. Needs Chrome or Edge, and a secure (https) page.
          </span>
        </label>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Appearance</h2>
        </div>
        <div className="toggle-row" role="radiogroup" aria-label="Theme">
          {(['dark', 'light', 'system'] as const).map((theme) => (
            <label key={theme} className={`toggle-card is-compact ${settings.theme === theme ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={settings.theme === theme}
                onChange={() => onPatch({ theme })}
              />
              <strong>{theme}</strong>
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Your data</h2>
          <p className="muted">
            {deckCount} deck{deckCount === 1 ? '' : 's'} stored in this browser. Nothing leaves your device.
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={() => download(onExport(), 'flashcards-backup.json', 'application/json')}
          >
            ⬇ Download backup
          </button>
          <button type="button" className="button" onClick={() => backupInput.current?.click()}>
            ⬆ Restore from backup
          </button>
          <input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                const result = onImport(await file.text());
                setMessage(result.message);
              }
              event.target.value = '';
            }}
          />
        </div>
        {message && <p className="muted small">{message}</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Mexican-Spanish watch out</h2>
          <p className="muted">Words that sound right but are not what people say in Mexico.</p>
        </div>
        <ul className="gotchas">
          {GOTCHAS.map((entry) => (
            <li key={entry.use}>
              <strong>{entry.use}</strong>
              <span className="muted">not {entry.avoid}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
