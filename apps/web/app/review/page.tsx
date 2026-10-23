import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDueReviews } from '../../lib/api';
import { firstWords, formatDelay } from '../../lib/format';
import { subtreeIds } from '../../lib/mind-map';
import { pronunciationUrl } from '../../lib/pronunciation-url';
import { findSpace } from '../../lib/spaces';
import type { DueItem, ReviewRating } from '../../lib/types';
import { AppHeader } from '../app-header';
import { MindMapViewer } from '../mind-maps/mind-map-viewer';
import { type CardFace, type RatingOption, ReviewCard } from './review-card';

const LABELS: Record<ReviewRating, string> = {
  Again: 'À revoir',
  Hard: 'Difficile',
  Good: 'Correct',
  Easy: 'Facile',
};

/**
 * What each side of a card shows, depending on its kind. This is the only
 * place in the web app that knows how to turn an item into a question.
 */
function facesOf({ item, card }: DueItem): { front: CardFace; back: CardFace; repeatFront: boolean } {
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
    const heading = item.content.author ?? 'Auteur inconnu';
    const subheading = item.content.source;
    return {
      front: {
        heading,
        subheading,
        main: firstWords(item.content.text),
        prompt: 'Récite la suite de tête, puis vérifie.',
      },
      back: { heading, subheading, main: item.content.text },
      repeatFront: false,
    };
  }

  const { word, translation, example, frenchExample } = item.content;
  const notes = { note: example, frenchNote: frenchExample ?? null }; // back only (MEM-42)
  const english = { main: word, lang: 'en', speak: true, audioUrl: pronunciationUrl(item.id, word) };
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
        front: { heading: 'Français → anglais', ...french, prompt: 'Comment le dit-on en anglais ?' },
        back: { heading: 'Français → anglais', ...english, ...notes },
        repeatFront: true,
      };
}

// "À réviser aujourd'hui": one card at a time. After each answer, the
// Server Action revalidates this page, which then shows the next due card.
// With ?type=…, only the cards of one subject space (MEM-4); the query
// string stays in the URL across answers.
// MEM-28: « Réviser · Anglais · Mementorize », or « Tout réviser · Mementorize ».
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}): Promise<Metadata> {
  const space = findSpace((await searchParams).type);
  return { title: space ? `Réviser · ${space.label}` : 'Tout réviser' };
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const space = findSpace((await searchParams).type);
  const due = await getDueReviews(1, space?.type);
  const next = due.items[0];
  const now = new Date();

  // End of a subject's session: back to its space, which says when the
  // next review of that subject is due.
  if (space && !next) {
    redirect(space.href);
  }

  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden page__sr-title">{space ? `Réviser · ${space.label}` : 'Tout réviser'}</h1>

        {!next ? (
          <section className="review-empty">
            <h2>Rien à réviser pour le moment</h2>
            <p>
              {due.nextDueAt
                ? `Prochaine révision dans ${formatDelay(now, new Date(due.nextDueAt))}.`
                : "Les fiches reviennent ici quand c'est le bon moment pour les revoir."}{' '}
              <Link href="/">Voir mes fiches</Link>
            </p>
          </section>
        ) : (
          <>
            <p className="review-progress">
              {space && <strong>{space.label} · </strong>}
              {due.total} carte{due.total > 1 ? 's' : ''} à réviser
              {space && (
                <>
                  {' · '}
                  <Link href={space.href}>Arrêter</Link>
                </>
              )}
            </p>
            <ReviewCard
              key={`${next.card.id}-${next.card.due}`} // fresh (hidden) card after each answer
              cardId={next.card.id}
              {...facesOf(next)}
              learnedItemId={next.item.type === 'Vocabulary' ? next.item.id : undefined}
              options={(Object.keys(LABELS) as ReviewRating[]).map((rating): RatingOption => ({
                rating,
                label: LABELS[rating],
                delay: formatDelay(now, new Date(next.nextDue[rating])),
              }))}
            />
          </>
        )}
      </main>
    </>
  );
}
