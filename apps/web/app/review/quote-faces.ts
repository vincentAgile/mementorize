import { firstWords } from '../../lib/format';
import type { QuoteContent } from '../../lib/types';
import type { CardFace } from './review-card';

/**
 * The two sides of the card of a quote: its author (and source) with the
 * first words, then the whole text. The same in the review and in the
 * learning process of the quotes (MEM-68).
 */
export function quoteFaces({ text, author, source }: QuoteContent): { front: CardFace; back: CardFace } {
  const heading = author ?? 'Auteur inconnu';
  return {
    front: { heading, subheading: source, main: firstWords(text), prompt: 'Récite la suite de tête, puis vérifie.' },
    back: { heading, subheading: source, main: text },
  };
}
