import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, getMindMap } from '../../../lib/api';
import type { MindMap } from '../../../lib/types';
import { AppHeader } from '../../app-header';
import { RelearnCardButton } from '../../items/relearn-card-button';
import { DeleteMindMapButton } from '../delete-mind-map-button';
import { MindMapEditor } from '../mind-map-editor';

// MEM-28: « <title of the map> · Cartes mentales · Mementorize ».
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const map = await getMindMap(id).catch(notFoundOn404);
  return { title: `${map.title} · Cartes mentales` };
}

export default async function MindMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const map = await getMindMap(id).catch(notFoundOn404);

  return (
    <>
      <AppHeader />
      <main className="page">
        <p className="mind-map-page__back">
          <Link href="/cartes-mentales/liste">← Mes cartes mentales</Link>
        </p>
        <h1 className="mind-map-page__title">{map.title}</h1>
        {/* initialNodes is only read on mount: after a save, the editor keeps
          its own state (selection, zoom), which already matches the API. */}
        <MindMapEditor mapId={map.id} initialNodes={map.nodes} />
        <LearnedBranches map={map} />
        <DeleteMindMapButton mapId={map.id} />
      </main>
    </>
  );
}

// Unknown id, or someone else's map: the API answers 404 either way.
function notFoundOn404(error: unknown): never {
  if (error instanceof ApiError && error.status === 404) notFound();
  throw error;
}

/**
 * MEM-48: the branches marked « Appris » in a review, out of the review, each
 * with « Remettre en révision ». The other branches are reviewed as usual.
 */
function LearnedBranches({ map }: { map: MindMap }) {
  const learned = map.cards.filter((card) => card.learnedAt);
  if (learned.length === 0) return null;
  const label = (nodeId: string) => map.nodes.find((node) => node.id === nodeId)?.label ?? '?';
  return (
    <section className="learned-branches" aria-labelledby="learned-branches-title">
      <h2 id="learned-branches-title" className="learned-branches__title">
        Branche{learned.length > 1 ? 's' : ''} apprise{learned.length > 1 ? 's' : ''} : plus en révision
      </h2>
      <ul className="learned-branches__list">
        {learned.map((card) => (
          <li key={card.id}>
            <span className="learned-branches__badge">Appris</span> {label(card.nodeId)}
            <RelearnCardButton cardId={card.id} what={`la branche « ${label(card.nodeId)} »`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
