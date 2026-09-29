import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDeckCsv } from './csv';
import { gradeAnswer } from './grade';

/**
 * The example decks ship with the app, so they are held to the same standard
 * as the code: every row has to import cleanly and be gradeable.
 */

const files = ['example-english.csv', 'example-persian.csv'];

function read(file: string): string {
  return readFileSync(join(process.cwd(), 'data', file), 'utf8');
}

describe.each(files)('data/%s', (file) => {
  const parsed = parseDeckCsv(read(file));

  it('imports without errors or skipped rows', () => {
    expect(parsed.fatal).toBeUndefined();
    expect(parsed.skipped).toBe(0);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.cards.length).toBeGreaterThan(40);
  });

  it('has both columns filled in for every card', () => {
    for (const card of parsed.cards) {
      expect(card.source.trim(), card.answer).not.toBe('');
      expect(card.answer.trim(), card.source).not.toBe('');
    }
  });

  it('marks the Persian deck as right-to-left and the English deck as left-to-right', () => {
    const expected = file.includes('persian') ? 'fa' : 'en';
    expect(new Set(parsed.cards.map((card) => card.sourceLang))).toEqual(new Set([expected]));
  });

  it('accepts the stored answer when it is typed back verbatim', () => {
    for (const card of parsed.cards) {
      const result = gradeAnswer({
        answer: card.answer,
        reference: card.answer,
        alternates: card.alternates,
        mode: 'strict',
      });
      expect(result.verdict, `${card.source} -> ${card.answer}`).toBe('correct');
    }
  });

  it('accepts every listed alternate in smart mode', () => {
    for (const card of parsed.cards) {
      for (const alternate of card.alternates) {
        const result = gradeAnswer({
          answer: alternate,
          reference: card.answer,
          alternates: card.alternates,
          mode: 'smart',
        });
        expect(result.verdict, `${alternate} for ${card.answer}`).toBe('correct');
      }
    }
  });
});
