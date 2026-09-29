/**
 * CSV import.
 *
 * The file you give the app has two columns:
 *
 *     source,answer
 *     car,carro
 *     خانه,casa
 *
 * Optional extras the app understands:
 *   - "also accept"  → extra phrasings that count as correct, separated by "|"
 *   - "notes"        → shown to you after you reveal the answer
 *   - a fixed "english" / "persian" header forces the prompt language instead
 *     of auto-detecting it
 *
 * Everything is handled locally in the browser: the file is never uploaded.
 */

import type { Card, SourceLang } from '../types';
import { containsPersian } from './text';
import { makeId } from './id';

export interface CsvTable {
  delimiter: string;
  header: string[];
  rows: string[][];
  lineOf: number[];
}

const DELIMITERS = [',', ';', '\t', '|'] as const;

const SOURCE_HEADERS = [
  'source', 'prompt', 'question', 'front', 'term', 'word', 'text', 'meaning',
  'source text', 'source_text', 'english', 'english word', 'en', 'persian',
  'farsi', 'fa', 'original', 'input',
];

const ANSWER_HEADERS = [
  'answer', 'spanish', 'translation', 'back', 'target', 'es', 'solution',
  'correct', 'expected', 'output', 'mexican spanish', 'mexican', 'target language',
];

const ALT_HEADERS = [
  'alt', 'alts', 'alternates', 'alternatives', 'alt answers', 'alt_answers',
  'also accept', 'also_correct', 'accepted', 'variants', 'other answers', 'accepted answers',
];

const NOTE_HEADERS = ['note', 'notes', 'tag', 'tags', 'comment', 'comments', 'hint', 'pista'];

const ENGLISH_HEADERS = ['english', 'en', 'english word'];
const PERSIAN_HEADERS = ['persian', 'farsi', 'fa', 'persian word'];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ');
}

function indexOfHeader(header: string[], names: string[]): number {
  return header.findIndex((cell) => names.includes(normalizeHeader(cell)));
}

/** Picks the delimiter that yields the most consistent column count. */
export function sniffDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  let best = ',';
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = sample
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(0, 20)
      .map((line) => parseCsvLine(line, delimiter).length);
    if (counts.length === 0) continue;
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    // Reward many columns, punish rows that disagree with each other.
    const score = max - (max - min) * 2;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return firstLine.includes(best) ? best : ',';
}

/** RFC 4180 single-line parser (handles quotes, escaped quotes, newlines). */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** Full CSV parser: supports quoted newlines inside a cell. */
export function parseCsv(text: string, delimiter?: string): CsvTable {
  const clean = text.replace(/^﻿/, '');
  const sep = delimiter ?? sniffDelimiter(clean);

  const rows: string[][] = [];
  const lineOf: number[] = [];
  let cells: string[] = [];
  let current = '';
  let inQuotes = false;
  let line = 1;
  let startLine = 1;

  const pushRow = () => {
    const isBlank = cells.every((cell) => cell.trim() === '');
    if (!isBlank) {
      rows.push(cells);
      lineOf.push(startLine);
    }
    cells = [];
    current = '';
    startLine = line;
  };

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line++;
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      cells.push(current.trim());
      current = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i++;
      cells.push(current.trim());
      pushRow();
      line++;
      startLine = line;
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  pushRow();

  return { delimiter: sep, header: rows[0] ?? [], rows: rows.slice(1), lineOf: lineOf.slice(1) };
}

export interface ParsedDeck {
  cards: Card[];
  /** Problems worth showing the user, one per line, CSV line number included. */
  warnings: string[];
  /** Rows that were skipped entirely. */
  skipped: number;
  /** True when the first row looked like a header. */
  hasHeader: boolean;
  /** Columns that were found, for the confirmation screen. */
  columns: { source: string; answer: string; alt: string; note: string };
  /** Set when the file simply cannot be used, e.g. no answer column. */
  fatal?: string;
}

/** Splits the "also accept" cell into individual phrasings. */
function parseAlternates(value: string): string[] {
  return value
    .split(/\s*[|;]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Turns raw CSV text into cards, collecting warnings instead of throwing so a
 * single bad row never blocks the import.
 */
export function parseDeckCsv(text: string, forcedLanguage?: SourceLang): ParsedDeck {
  const table = parseCsv(text);
  const warnings: string[] = [];
  let skipped = 0;

  if (table.rows.length === 0 && table.header.length === 0) {
    return {
      cards: [],
      warnings,
      skipped: 0,
      hasHeader: false,
      columns: { source: '', answer: '', alt: '', note: '' },
      fatal: 'The file is empty.',
    };
  }

  let sourceIndex = indexOfHeader(table.header, SOURCE_HEADERS);
  let answerIndex = indexOfHeader(table.header, ANSWER_HEADERS);
  const altIndex = indexOfHeader(table.header, ALT_HEADERS);
  const noteIndex = indexOfHeader(table.header, NOTE_HEADERS);

  const englishIndex = indexOfHeader(table.header, ENGLISH_HEADERS);
  const persianIndex = indexOfHeader(table.header, PERSIAN_HEADERS);

  const hasHeader = sourceIndex >= 0 || answerIndex >= 0;
  // `parseCsv` always reports the first row as the header. When that row is
  // really data it has to be put back at the front, or the first card of a
  // headerless file would silently disappear.
  let dataRows = table.rows;
  let lineNumbers = table.lineOf;

  if (hasHeader) {
    if (answerIndex < 0) {
      // The header exists but has no answer column: use the first column that
      // is not the source, so "english,persian,spanish" still works.
      const candidates = table.header
        .map((cell, index) => ({ cell: normalizeHeader(cell), index }))
        .filter(({ cell, index }) => index !== sourceIndex && cell.length > 0);
      if (candidates.length > 0) {
        answerIndex = candidates[0].index;
        warnings.push(
          `No column named "answer" — using "${candidates[0].cell}" as the answer column.`,
        );
      }
    }
    if (sourceIndex < 0) {
      const candidates = table.header
        .map((cell, index) => ({ cell: normalizeHeader(cell), index }))
        .filter(({ cell, index }) => index !== answerIndex && cell.length > 0);
      if (candidates.length > 0) sourceIndex = candidates[0].index;
    }
  } else {
    // No header row: assume column 1 is the prompt and column 2 the answer.
    sourceIndex = 0;
    answerIndex = 1;
    dataRows = [table.header, ...table.rows];
    lineNumbers = [1, ...table.rows.map((_, index) => table.lineOf[index])];
  }

  if (answerIndex < 0 || sourceIndex < 0) {
    return {
      cards: [],
      warnings,
      skipped: 0,
      hasHeader,
      columns: { source: '', answer: '', alt: '', note: '' },
      fatal:
        'This file needs at least two columns: the text to translate and the Mexican-Spanish answer. ' +
        'Expected a header such as "source,answer". You can download a template from the import screen.',
    };
  }

  const cards: Card[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const lineNo = lineNumbers[i] ?? i + 1;
    const source = (row[sourceIndex] ?? '').trim();
    const answer = (row[answerIndex] ?? '').trim();

    if (!source && !answer) continue;

    if (!source) {
      warnings.push(`Line ${lineNo}: the prompt is empty — skipped.`);
      skipped++;
      continue;
    }
    if (!answer) {
      warnings.push(`Line ${lineNo}: "${source}" has no Spanish answer — skipped.`);
      skipped++;
      continue;
    }

    const key = `${source.toLowerCase()}→${answer.toLowerCase()}`;
    if (seen.has(key)) {
      warnings.push(`Line ${lineNo}: duplicate of line ${seen.get(key)} — skipped.`);
      skipped++;
      continue;
    }
    seen.set(key, lineNo);

    let sourceLang: SourceLang = forcedLanguage ?? 'unknown';
    if (sourceLang === 'unknown') {
      if (englishIndex >= 0 && englishIndex !== sourceIndex) sourceLang = 'en';
      else if (persianIndex >= 0 && persianIndex !== sourceIndex) sourceLang = 'fa';
      else if (containsPersian(source)) sourceLang = 'fa';
      else sourceLang = 'en';
    }

    cards.push({
      id: makeId(),
      source,
      sourceLang,
      answer,
      alternates: altIndex >= 0 ? parseAlternates(row[altIndex] ?? '') : [],
      note: noteIndex >= 0 ? (row[noteIndex] ?? '').trim() || undefined : undefined,
    });
  }

  if (cards.length === 0 && warnings.length === 0) {
    warnings.push('No usable rows were found in this file.');
  }

  return {
    cards,
    warnings,
    skipped,
    hasHeader,
    columns: {
      source: hasHeader ? table.header[sourceIndex] : 'column 1',
      answer: hasHeader ? table.header[answerIndex] : 'column 2',
      alt: altIndex >= 0 ? table.header[altIndex] : '',
      note: noteIndex >= 0 ? table.header[noteIndex] : '',
    },
  };
}

/** A small, ready-to-fill template the user can download. */
export const CSV_TEMPLATE = `source,answer,also accept,notes
car,carro,coche|auto,vehicle in Mexico
house,casa,,
apple,manzana,,
book,libro,,
water,agua,,
friend,amigo,compa|cuate,slang in Mexico
`;
