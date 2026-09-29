# Flashcards · Español de México

A flash card system for learning **English → Mexican Spanish** and **Persian → Mexican Spanish**.

You bring a CSV word bank. The app turns it into flash cards where **the answer is never shown** — you
translate the prompt yourself, type it or say it out loud, and the app checks whether you were right.

Everything runs in your browser. Your CSV is never uploaded to any server.

---

## Quick start

```bash
npm install
npm run dev        # open http://localhost:5173
```

Then drop in `data/example-english.csv` or `data/example-persian.csv` from the **Decks** tab.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-checks and builds to `dist/` |
| `npm run preview` | Serves the production build |
| `npm test` | Runs the test suite (66 tests) |

---

## The CSV format

Two columns are all you need:

```csv
source,answer
car,carro
house,casa
خانه,casa
```

The first column is what you see on the card (English or Persian), the second is the Mexican-Spanish
answer the app checks against.

### Optional extra columns

| Column | Header names the app recognises | What it does |
| --- | --- | --- |
| 3rd | `also accept`, `alternates`, `accepted`, `variants`, … | Extra correct phrasings, separated by `\|` or `;` |
| 4th | `notes`, `note`, `hint`, `comment`, … | Shown to you after you reveal the answer |

```csv
source,answer,also accept,notes
car,carro,coche\|auto,vehicle in Mexico
money,dinero,lana\|varo,slang: lana / varo
```

### What the importer handles for you

- Comma, semicolon, tab and `|` separators (it sniffs which one you used)
- Quoted fields, escaped quotes (`""`) and line breaks inside a cell
- UTF-8 BOM, Persian digits, Arabic letter variants
- Files **with or without** a header row — without one, column 1 is the prompt and column 2 the answer
- Header names in any order, plus `english` / `persian` headers to force the prompt language
- Duplicate rows, empty prompts and missing answers are reported with line numbers and skipped rather
  than failing the whole import — you always see a preview before anything is saved

Persian prompts are detected automatically and rendered right-to-left.

---

## How the answer is checked

This is the part that matters, because the card has no answer on it.

### Smart mode (default)

Accepted, in order of how forgiving they are:

- Case, accents, punctuation, article order and extra whitespace — `¡El carro!` = `carro rojo`
- Articles (`el`, `la`, `de`, …) — `la casa` = `casa`
- **Mexican synonyms** — `coche`, `chambear`, `lana`, `elote`, `soda`, `cuate` are all correct for
  `carro`, `trabajar`, `dinero`, `maíz`, `refresco`, `amigo`
- Singular/plural — `amigo` = `amigos`
- Number words — `tres` = `3`, `treinta y dos` = `32`, `primero` = `1`
- Phrases — `agua de cola` = `refresco`, `muchas gracias` = `gracias`
- Close-but-not-quite answers come back as **close**, with the words you missed or added highlighted

### Strict mode

Word-for-word only. Case, accents, punctuation and articles are still ignored, but synonyms, plurals and
number words are not.

### Make it accept *your* words

The synonym table is a plain file you can edit: **`src/data/synonyms.es.ts`**.

```ts
{ canonical: 'carro', variants: ['coche', 'auto', 'automóvil', 'vehiculo'] },
```

Add a word to `variants` and the app starts accepting it — in your CSV and in what you type.

---

## Typing or speaking

- **Type** in the box. `Enter` checks the answer, `Shift+Enter` adds a line break.
- **Say it**: press 🎙 and speak Spanish. The browser transcribes it and fills the same box, then you
  check it exactly as if you had typed it. Uses the Web Speech API, so it works in **Chrome and Edge**
  on a secure (https) page and the audio never leaves your machine. Firefox and Safari fall back to
  typing — the app tells you when that happens instead of showing a dead button.

---

## Spaced repetition

Cards use SM-2, so the app shows you what you are about to forget:

- Correct → the interval grows (1 day, 6 days, then × your ease factor)
- Close → the interval is cut, so it comes back the same day
- Wrong → the card resets and returns within minutes, and future intervals get harder
- Nothing is ever lost: progress is stored in IndexedDB per deck

The **Progress** tab shows accuracy, streaks, a 14-day activity chart and the cards you keep missing.

---

## Your data

- Decks and progress live in this browser only (IndexedDB, falling back to localStorage)
- **Settings → Download backup** writes a single JSON file with every deck and all your progress;
  **Restore from backup** reads it back
- **Export** on a deck writes it back out as a CSV in the same two-column shape, so
  export → edit → import never loses anything

---

## Project layout

```
data/                     example word banks (English and Persian)
src/
  components/             Decks, Practice, Progress and Settings screens
  hooks/
    useDecks.ts           deck storage and progress
    useSpeechRecognition.ts   microphone dictation
  lib/
    csv.ts                CSV parsing and import
    grade.ts              the answer checker  ← start here
    srs.ts                SM-2 scheduler
    text.ts               Spanish/English/Persian normalisation
    storage.ts            IndexedDB persistence
  data/synonyms.es.ts     Mexican-Spanish equivalences  ← edit this
```

`src/lib/grade.ts` and `src/data/synonyms.es.ts` are the two files worth reading if you want to change
how answers are judged.

## Tech

React 18 · TypeScript · Vite · Vitest. No backend, no API keys, no network calls.
