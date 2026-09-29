import { describe, expect, it } from 'vitest';
import { gradeAnswer, normalizeAnswer, wordDiff } from './grade';

const smart = { mode: 'smart' as const };
const strict = { mode: 'strict' as const };

describe('normalizeAnswer', () => {
  it('ignores case, accents, punctuation and articles', () => {
    const a = normalizeAnswer('¡El CARRO, rojo!');
    const b = normalizeAnswer('carro rojo');
    expect(a.content).toEqual(b.content);
  });

  it('treats singular and plural as the same word in smart mode', () => {
    expect(normalizeAnswer('amigos').content).toEqual(normalizeAnswer('amigo').content);
  });

  it('converts number words to digits', () => {
    expect(normalizeAnswer('tres').content).toEqual(normalizeAnswer('3').content);
    expect(normalizeAnswer('treinta y dos').content).toEqual(normalizeAnswer('32').content);
  });

  it('collapses multi-word phrases but leaves lone words alone', () => {
    expect(normalizeAnswer('agua de cola').content).toEqual(normalizeAnswer('refresco').content);
    // "cola" on its own must not become a refresco.
    expect(normalizeAnswer('cola').content).toEqual(['cola']);
  });
});

describe('gradeAnswer — strict mode', () => {
  it('accepts differences in case, accents, punctuation and articles', () => {
    const result = gradeAnswer({ answer: '¡El carro!', reference: 'carro', ...strict });
    expect(result.verdict).toBe('correct');
  });

  it('rejects a synonym that smart mode would accept', () => {
    const result = gradeAnswer({ answer: 'coche', reference: 'carro', ...strict });
    expect(result.verdict).toBe('incorrect');
  });

  it('rejects a missing word', () => {
    const result = gradeAnswer({ answer: 'carro', reference: 'carro rojo', ...strict });
    expect(result.verdict).toBe('incorrect');
  });
});

describe('gradeAnswer — smart mode', () => {
  it('accepts a Mexican synonym for the stored answer', () => {
    const result = gradeAnswer({ answer: 'el coche', reference: 'carro', ...smart });
    expect(result.verdict).toBe('correct');
  });

  it('accepts the other direction too', () => {
    const result = gradeAnswer({ answer: 'carro', reference: 'coche', ...smart });
    expect(result.verdict).toBe('correct');
  });

  it('accepts an alternate listed in the CSV', () => {
    const result = gradeAnswer({
      answer: 'el compa',
      reference: 'amigo',
      alternates: ['compa'],
      ...smart,
    });
    expect(result.verdict).toBe('correct');
  });

  it('accepts plural vs singular', () => {
    const result = gradeAnswer({ answer: 'amigos', reference: 'amigo', ...smart });
    expect(result.verdict).toBe('correct');
  });

  it('rejects a different word and says what was missing', () => {
    const result = gradeAnswer({ answer: 'camion', reference: 'carro', ...smart });
    expect(result.verdict).toBe('incorrect');
    expect(result.reason).toMatch(/not the same meaning|missing/i);
  });

  it('marks a near miss as close rather than wrong', () => {
    const result = gradeAnswer({ answer: 'carro azul', reference: 'carro rojo', ...smart });
    expect(result.verdict).toBe('close');
  });

  it('reports an empty answer without pretending it was wrong', () => {
    const result = gradeAnswer({ answer: '   ', reference: 'carro', ...smart });
    expect(result.verdict).toBe('empty');
  });

  it('scores an exactly correct answer at 1', () => {
    const result = gradeAnswer({ answer: 'casa', reference: 'casa', ...smart });
    expect(result.verdict).toBe('correct');
    expect(result.score).toBe(1);
  });

  it('handles multi-word sentences with articles and possessives', () => {
    const result = gradeAnswer({
      answer: 'es la hermana de mi amigo',
      reference: 'hermana de mi amigo',
      ...smart,
    });
    expect(result.verdict).toBe('correct');
  });

  it('still counts subject pronouns, which change the meaning', () => {
    const result = gradeAnswer({
      answer: 'él es mi hermana',
      reference: 'ella es mi hermana',
      ...smart,
    });
    expect(result.verdict).not.toBe('correct');
  });

  it('does not confuse tú with tu, nor mí with mi', () => {
    expect(
      gradeAnswer({ answer: 'tú eres mi amigo', reference: 'tu es mi amigo', ...smart }).verdict,
    ).not.toBe('correct');
    expect(
      gradeAnswer({ answer: 'mí sister', reference: 'mi hermana', ...smart }).verdict,
    ).not.toBe('correct');
  });

  it('accepts a possessive the stored answer left out', () => {
    const result = gradeAnswer({ answer: 'mi cuate', reference: 'amigo', ...smart });
    expect(result.verdict).toBe('correct');
  });

  it('is not fooled by a completely different sentence', () => {
    const result = gradeAnswer({
      answer: 'voy a la playa mañana',
      reference: 'el perro corre en el parque',
      ...smart,
    });
    expect(result.verdict).toBe('incorrect');
    expect(result.score).toBeLessThan(0.65);
  });

  it('explains that a synonym was accepted, rather than crediting accents', () => {
    const result = gradeAnswer({ answer: 'el coche', reference: 'carro', ...smart });
    expect(result.reason).toBe('accepted alternative: carro');
  });

  it('reports an exact match plainly when nothing was substituted', () => {
    const result = gradeAnswer({ answer: 'El carro.', reference: 'carro', ...smart });
    expect(result.reason).toBe('exact match');
  });

  it('names the missing words when the answer is wrong', () => {
    const result = gradeAnswer({ answer: 'fuego', reference: 'agua', ...smart });
    expect(result.reason).toMatch(/agua/);
  });
});

describe('wordDiff', () => {
  it('marks the words that are missing from the learner answer', () => {
    const diff = wordDiff(['perro', 'grande'], ['perro', 'pequeno']);
    expect(diff).toEqual([
      { type: 'same', text: 'perro' },
      { type: 'extra', text: 'grande' },
      { type: 'missing', text: 'pequeno' },
    ]);
  });

  it('returns a single "same" run for identical input', () => {
    expect(wordDiff(['a', 'b'], ['a', 'b'])).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ]);
  });
});
