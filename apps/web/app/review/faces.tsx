import { TO_ENGLISH } from '../../lib/guided-questions';
import { subtreeIds } from '../../lib/mind-map';
import { pronunciationUrl } from '../../lib/pronunciation-url';
import type { DueItem } from '../../lib/types';
import { MindMapViewer } from '../mind-maps/mind-map-viewer';
import { quoteFaces } from './quote-faces';
import type { CardFace } from './review-card';

/**
 * What each side of a card shows, depending on its kind. This is the only
 * place in the web app that knows how to turn an item into a question.
 */
export function facesOf(
  { item, card }: DueItem,
  canAssess: boolean,
  guided: boolean,
): { front: CardFace; back: CardFace; repeatFront: boolean } {
  if (item.type === 'MindMap') {
    const { nodes } = item.content;
    const root = nodes.find((node) => node.parentId === null);
    const branch = subtreeIds(nodes, card.nodeId ?? '');
    const heading = root?.label ?? 'Carte mentale';
    const size = branch.size - 1;
    return {
      // The labels of the branch are blanked here, on the server: the front
      // side never carries them. Its shape (how many sub-ideas) stays
      // visible, as a cue.
      front: {
        heading,
        main: '',
        figure: (
          <MindMapViewer
            nodes={nodes.map((node) => (branch.has(node.id) ? { ...node, label: '', masked: true } : node))}
          />
        ),
        prompt:
          size === 0
            ? 'Retrouve la branche masquée, puis vérifie.'
            : size === 1
              ? "Retrouve la branche masquée et l'idée qui en part, puis vérifie."
              : `Retrouve la branche masquée et les ${size} idées qui en partent, puis vérifie.`,
      },
      back: {
        heading,
        main: '',
        figure: <MindMapViewer nodes={nodes.map((node) => ({ ...node, highlighted: branch.has(node.id) }))} />,
      },
      repeatFront: false,
    };
  }

  if (item.type === 'Quote') {
    return { ...quoteFaces(item.content), repeatFront: false };
  }

  const { word, translation, example, frenchExample } = item.content;
  const notes = { note: example, frenchNote: frenchExample ?? null }; // back only (MEM-42)
  const english = { main: word, lang: 'en', speak: true, audioUrl: pronunciationUrl(item.id, word) };
  // MEM-91: the frame « Évaluer ma prononciation » on the answer, when it is English and the assessment is configured.
  const assessed = canAssess ? { ...english, assessItemId: item.id } : english;
  const french = { main: translation, lang: 'fr' };

  // MEM-40: the API only serves French → English cards; the English → French
  // side stays here for when that direction comes back (a setting, later).
  return card.kind === 'EnglishToFrench'
    ? {
        front: { heading: 'Anglais → français', ...english, prompt: 'Quelle est la traduction ?' },
        back: { heading: 'Anglais → français', ...french, ...notes },
        repeatFront: true,
      }
    : {
        // MEM-100: no heading and no question, as in the evaluation of the learning;
        // MEM-128: the question in the Guided mode.
        front: { ...french, ...(guided && { prompt: TO_ENGLISH }) },
        back: { ...assessed, ...notes },
        repeatFront: true,
      };
}
