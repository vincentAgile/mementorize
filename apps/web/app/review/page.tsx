import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDueReviews } from '../../lib/api';
import { firstWords, formatDelay } from '../../lib/format';
import { subtreeIds } from '../../lib/mind-map';
import { pronunciationUrl } from '../../lib/pronunciation-url';
import { findSpace } from '../../lib/spaces';
import type { DueItem } from '../../lib/types';
import { AppHeader } from '../app-header';
import { MindMapViewer } from '../mind-maps/mind-map-viewer';
import type { CardFace } from './review-card';
import { ReviewSession, type SessionCard } from './review-session';

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

// "À réviser aujourd'hui": a session over the cards due now (MEM-47), one at
// a time, its pile kept in the browser (review-session.tsx). With ?type=…,
// only the cards of one subject space (MEM-4).
// MEM-28: « Réviser · Anglais · Mementorize », or « Tout réviser · Mementorize ».
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}): Promise<Metadata> {
  const space = findSpace((await searchParams).type);
  return { title: space ? `Réviser · ${space.label}` : 'Tout réviser' };
}

/** The most cards loaded at once (the API's limit); the rest at the end of the session. */
const SESSION_LIMIT = 100;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const space = findSpace((await searchParams).type);
  const due = await getDueReviews(SESSION_LIMIT, space?.type);
  const now = new Date();

  // End of a subject's session: back to its space, which says when the
  // next review of that subject is due.
  if (space && due.items.length === 0) {
    redirect(space.href);
  }

  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden page__sr-title">{space ? `Réviser · ${space.label}` : 'Tout réviser'}</h1>

        {due.items.length === 0 ? (
          <section className="review-empty">
            <h2>Rien à réviser pour le moment{'\u202f'}!</h2>
            <p>
              {due.nextDueAt
                ? `Prochaine révision dans ${formatDelay(now, new Date(due.nextDueAt))}.`
                : "Les fiches reviennent ici quand c'est le bon moment pour les revoir."}{' '}
              <Link href="/">Voir mes fiches</Link>
            </p>
          </section>
        ) : (
          <ReviewSession
            // A new session each time the page is rendered (the end of the
            // previous one refreshes it): its pile starts from the props.
            key={randomUUID()}
            cards={due.items.map((next): SessionCard => ({
              cardId: next.card.id,
              ...facesOf(next),
              learnedItemId: next.item.type === 'Vocabulary' ? next.item.id : undefined,
              nextDue: next.nextDue,
            }))}
            total={due.total}
            now={now.toISOString()}
            space={space && { label: space.label, href: space.href }}
          />
        )}
      </main>
    </>
  );
}
