import { firstWords } from '../../lib/format';
import type { QuoteContent } from '../../lib/types';
import type { CardFace } from './review-card';

/**
 * The two sides of the card of a quote, the same in the review and in the
 * learning process of the quotes (MEM-68).
 * MEM-108: the front shows only the recall hint, as the question, under a
 * neutral heading; the author (with the source) and the start of the quote
 * are shown on request, each with its button. The back is the whole quote,
 * with its author and its source; the hint is not repeated.
 */
export function quoteFaces({ text, author, source, hint }: QuoteContent): { front: CardFace; back: CardFace } {
  const by = [author, source].filter(Boolean).join(' · ');
  return {
    front: {
      heading: 'Citation',
      main: hint,
      reveals: [
        author || source
          ? {
              key: 'author',
              label: 'Auteur',
              button: author ? 'Afficher l’auteur' : 'Afficher la source',
              // Without author, the button shows the source alone.
              value: author ? by : `Auteur inconnu · ${source}`,
            }
          : { key: 'author', label: 'Auteur', button: '', value: null, missing: 'Auteur inconnu' },
        {
          key: 'start',
          label: 'Début de la citation',
          button: 'Afficher le début',
          value: firstWords(text),
        },
      ],
    },
    back: { heading: author ?? 'Auteur inconnu', subheading: source, main: text },
  };
}
