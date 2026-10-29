import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDueReviews, getPreferences, pronunciationAssessmentEnabled } from '../../lib/api';
import { formatDelay } from '../../lib/format';
import { subtreeIds } from '../../lib/mind-map';
import { pronunciationUrl } from '../../lib/pronunciation-url';
import { findSpace } from '../../lib/spaces';
import type { DueItem } from '../../lib/types';
import { AppHeader } from '../app-header';
import { MindMapViewer } from '../mind-maps/mind-map-viewer';
import { quoteFaces } from './quote-faces';
import type { CardFace } from './review-card';
import { ReviewSession, type SessionCard } from './review-session';

/**
 * What each side of a card shows, depending on its kind. This is the only
 * place in the web app that knows how to turn an item into a question.
 */
function facesOf(
  { item, card }: DueItem,
  canAssess: boolean,
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
        front: { heading: 'Français → anglais', ...french, prompt: 'Comment le dit-on en anglais ?' },
        back: { heading: 'Français → anglais', ...assessed, ...notes },
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
  const [due, preferences, canAssess] = await Promise.all([
    getDueReviews(SESSION_LIMIT, space?.type),
    getPreferences(),
    pronunciationAssessmentEnabled(),
  ]);
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
              ...facesOf(next, canAssess),
              // Learned per item, except a mind map: per branch (MEM-48, MEM-67).
              learned: next.item.type === 'MindMap' ? { cardId: next.card.id } : { itemId: next.item.id },
              nextDue: next.nextDue,
            }))}
            total={due.total}
            showDelays={preferences.showReviewDelays}
            now={now.toISOString()}
            space={space && { label: space.label, href: space.href }}
          />
        )}
      </main>
    </>
  );
}
