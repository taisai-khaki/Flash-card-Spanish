import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attempt, Card, Deck, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { makeId } from '../lib/id';
import { review } from '../lib/srs';
import {
  buildBackup,
  deleteDeck as deleteDeckFromStorage,
  loadDecks,
  loadSettings,
  parseBackup,
  saveDeck as saveDeckToStorage,
  saveSettings as saveSettingsToStorage,
} from '../lib/storage';

/** How long to wait after the last change before writing a deck to storage. */
const SAVE_DELAY_MS = 400;
/** How many attempts we keep per deck (plenty for the stats screen). */
const MAX_ATTEMPTS = 1000;

export interface UseDecks {
  ready: boolean;
  decks: Deck[];
  settings: Settings;
  addDeck: (cards: Card[], name: string, sourceFile: string) => Deck;
  removeDeck: (deckId: string) => void;
  renameDeck: (deckId: string, name: string) => void;
  recordAttempt: (deckId: string, cardId: string, attempt: Omit<Attempt, 'cardId' | 'at'>) => void;
  patchSettings: (patch: Partial<Settings>) => void;
  exportBackup: () => string;
  importBackup: (text: string) => { ok: boolean; message: string };
}

export function useDecks(): UseDecks {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedDecks, storedSettings] = await Promise.all([loadDecks(), loadSettings()]);
      if (cancelled) return;
      setDecks(storedDecks.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt));
      setSettings(storedSettings);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flush any pending writes when the tab goes away.
  useEffect(() => {
    const flush = () => {
      Object.values(timers.current).forEach((timer) => window.clearTimeout(timer));
      timers.current = {};
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const persistLater = useCallback((deck: Deck) => {
    const existing = timers.current[deck.meta.id];
    if (existing) window.clearTimeout(existing);
    timers.current[deck.meta.id] = window.setTimeout(() => {
      delete timers.current[deck.meta.id];
      void saveDeckToStorage(deck);
    }, SAVE_DELAY_MS);
  }, []);

  const addDeck = useCallback(
    (cards: Card[], name: string, sourceFile: string) => {
      const now = Date.now();
      const deck: Deck = {
        meta: { id: makeId('deck'), name, sourceFile, createdAt: now, updatedAt: now },
        cards,
        schedule: {},
        attempts: [],
      };
      setDecks((current) => [deck, ...current]);
      void saveDeckToStorage(deck);
      return deck;
    },
    [],
  );

  const removeDeck = useCallback((deckId: string) => {
    setDecks((current) => current.filter((deck) => deck.meta.id !== deckId));
    void deleteDeckFromStorage(deckId);
  }, []);

  const renameDeck = useCallback(
    (deckId: string, name: string) => {
      setDecks((current) =>
        current.map((deck) =>
          deck.meta.id === deckId
            ? { ...deck, meta: { ...deck.meta, name, updatedAt: Date.now() } }
            : deck,
        ),
      );
    },
    [],
  );

  const recordAttempt = useCallback(
    (deckId: string, cardId: string, attempt: Omit<Attempt, 'cardId' | 'at'>) => {
          const now = Date.now();
      setDecks((current) =>
        current.map((deck) => {
          if (deck.meta.id !== deckId) return deck;
          const entry: Attempt = { ...attempt, cardId, at: now };
          const next: Deck = {
            ...deck,
            meta: { ...deck.meta, updatedAt: now },
            schedule: {
              ...deck.schedule,
              [cardId]: review(deck.schedule[cardId], attempt.verdict, now),
            },
            attempts: [...deck.attempts, entry].slice(-MAX_ATTEMPTS),
          };
          persistLater(next);
          return next;
        }),
      );
    },
    [persistLater],
  );

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveSettingsToStorage(next);
      return next;
    });
  }, []);

  const exportBackup = useCallback(() => JSON.stringify(buildBackup(settings, decks), null, 2), [decks, settings]);

  const importBackup = useCallback(
    (text: string) => {
      const backup = parseBackup(text);
      if (!backup) return { ok: false, message: 'That file is not a Flashcards backup.' };
      setSettings((current) => {
        const next = { ...current, ...(backup.settings ?? {}) };
        void saveSettingsToStorage(next);
        return next;
      });
      setDecks((current) => {
        const byId = new Map(current.map((deck) => [deck.meta.id, deck]));
        for (const deck of backup.decks) byId.set(deck.meta.id, deck);
        void Promise.all([...byId.values()].map((deck) => saveDeckToStorage(deck)));
        return [...byId.values()].sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
      });
      return { ok: true, message: `Restored ${backup.decks.length} deck(s).` };
    },
    [],
  );

  return {
    ready,
    decks,
    settings,
    addDeck,
    removeDeck,
    renameDeck,
    recordAttempt,
    patchSettings,
    exportBackup,
    importBackup,
  };
}
