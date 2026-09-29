import type { Deck } from '../types';

function escapeCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Writes a deck back out in the same two-column shape the importer expects, so
 * a round trip (export → edit → import) never loses anything.
 */
export function deckToCsv(deck: Deck): string {
  const lines = ['source,answer,also accept,notes'];
  for (const card of deck.cards) {
    lines.push(
      [
        escapeCell(card.source),
        escapeCell(card.answer),
        escapeCell(card.alternates.join(' | ')),
        escapeCell(card.note ?? ''),
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
