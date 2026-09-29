import { describe, expect, it } from 'vitest';
import { parseCsv, parseDeckCsv, sniffDelimiter } from './csv';

describe('parseCsv', () => {
  it('parses a simple two-column file', () => {
    const table = parseCsv('source,answer\ncar,carro\ndog,perro');
    expect(table.header).toEqual(['source', 'answer']);
    expect(table.rows).toEqual([
      ['car', 'carro'],
      ['dog', 'perro'],
    ]);
  });

  it('keeps commas inside quoted cells', () => {
    const table = parseCsv('source,answer\n"hello, world",hola\n');
    expect(table.rows[0][0]).toBe('hello, world');
  });

  it('handles escaped double quotes', () => {
    const table = parseCsv('a,b\n"say ""hi""",hola\n');
    expect(table.rows[0][0]).toBe('say "hi"');
  });

  it('handles a newline inside a quoted cell', () => {
    const table = parseCsv('a,b\n"line1\nline2",x\n');
    expect(table.rows[0][0]).toBe('line1\nline2');
  });

  it('strips a UTF-8 BOM', () => {
    const table = parseCsv('﻿source,answer\ncar,carro');
    expect(table.header[0]).toBe('source');
  });
});

describe('sniffDelimiter', () => {
  it('detects semicolons', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3\n4;5;6')).toBe(';');
  });

  it('detects tabs', () => {
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3\n4\t5\t6')).toBe('\t');
  });

  it('detects pipes', () => {
    expect(sniffDelimiter('a|b\n1|2\n3|4')).toBe('|');
  });
});

describe('parseDeckCsv', () => {
  it('reads a two-column file with a header', () => {
    const result = parseDeckCsv('source,answer\ncar,carro\nhouse,casa');
    expect(result.fatal).toBeUndefined();
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].source).toBe('car');
    expect(result.cards[0].answer).toBe('carro');
    expect(result.hasHeader).toBe(true);
  });

  it('assumes columns 1 and 2 when there is no header', () => {
    const result = parseDeckCsv('car,carro\nhouse,casa');
    expect(result.hasHeader).toBe(false);
    expect(result.cards).toHaveLength(2);
  });

  it('detects Persian prompts and marks them right-to-left', () => {
    const result = parseDeckCsv('source,answer\nخانه,casa\ncar,carro');
    expect(result.cards[0].sourceLang).toBe('fa');
    expect(result.cards[1].sourceLang).toBe('en');
  });

  it('honours a forced language column named english or persian', () => {
    const result = parseDeckCsv('persian,answer\nخانه,casa');
    expect(result.cards[0].sourceLang).toBe('fa');
  });

  it('reads the "also accept" column as alternates', () => {
    const result = parseDeckCsv('source,answer,also accept\ncar,carro,coche|auto');
    expect(result.cards[0].alternates).toEqual(['coche', 'auto']);
  });

  it('skips rows with no answer and explains why', () => {
    const result = parseDeckCsv('source,answer\ncar,carro\nbroken,');
    expect(result.cards).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.warnings.join(' ')).toMatch(/no Spanish answer/);
  });

  it('skips duplicate rows', () => {
    const result = parseDeckCsv('source,answer\ncar,carro\nCAR,carro');
    expect(result.cards).toHaveLength(1);
    expect(result.warnings.join(' ')).toMatch(/duplicate/);
  });

  it('ignores fully blank lines', () => {
    const result = parseDeckCsv('source,answer\ncar,carro\n\n\ndog,perro');
    expect(result.cards).toHaveLength(2);
  });

  it('reports a fatal problem when there is no answer column', () => {
    const result = parseDeckCsv('source,notes\ncar,some note');
    // "notes" is not an answer header, so it falls back to the other column.
    // With only two columns the file is still usable.
    expect(result.fatal).toBeUndefined();
  });

  it('reports a fatal problem for a single-column file', () => {
    const result = parseDeckCsv('source\ncar');
    expect(result.fatal).toMatch(/two columns/);
  });

  it('accepts a semicolon file with a BOM', () => {
    const result = parseDeckCsv('﻿source;answer\ncar;carro');
    expect(result.cards).toHaveLength(1);
  });
});
