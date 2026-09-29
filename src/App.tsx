import { useEffect, useState } from 'react';
import { useDecks } from './hooks/useDecks';
import LibraryView from './components/LibraryView';
import PracticeView from './components/PracticeView';
import StatsView from './components/StatsView';
import SettingsView from './components/SettingsView';

type Tab = 'library' | 'practice' | 'stats' | 'settings';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'library', label: 'Decks', icon: '🗂' },
  { id: 'practice', label: 'Practice', icon: '🎯' },
  { id: 'stats', label: 'Progress', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const store = useDecks();
  const [tab, setTab] = useState<Tab>('library');
  /** Deck chosen in the library, carried into the practice screen. */
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const theme =
        store.settings.theme === 'system'
          ? media.matches
            ? 'light'
            : 'dark'
          : store.settings.theme;
      root.dataset.theme = theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [store.settings.theme]);

  const startPractice = (deckId: string) => {
    setActiveDeckId(deckId);
    setTab('practice');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            🇲🇽
          </span>
          <div>
            <h1>Flashcards · Español de México</h1>
            <p>Type or speak your translation — the app checks it for you.</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tab ${tab === item.id ? 'is-active' : ''}`}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="tab-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {!store.ready ? (
          <p className="muted">Loading your decks…</p>
        ) : tab === 'library' ? (
          <LibraryView
            decks={store.decks}
            onImport={store.addDeck}
            onDelete={store.removeDeck}
            onRename={store.renameDeck}
            onPractice={startPractice}
          />
        ) : tab === 'practice' ? (
          <PracticeView
            decks={store.decks}
            settings={store.settings}
            activeDeckId={activeDeckId}
            onSelectDeck={setActiveDeckId}
            onRecordAttempt={store.recordAttempt}
          />
        ) : tab === 'stats' ? (
          <StatsView decks={store.decks} settings={store.settings} onPractice={startPractice} />
        ) : (
          <SettingsView
            settings={store.settings}
            onPatch={store.patchSettings}
            onExport={store.exportBackup}
            onImport={store.importBackup}
            deckCount={store.decks.length}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>Everything runs in this browser tab. Your CSV is never uploaded.</span>
      </footer>
    </div>
  );
}
