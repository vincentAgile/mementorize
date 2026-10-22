import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, getMindMap } from '../../../lib/api';
import { AppHeader } from '../../app-header';
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
    <main className="page">
      <AppHeader />
      <p className="mind-map-page__back">
        <Link href="/cartes-mentales">← Mes cartes mentales</Link>
      </p>
      <h1 className="mind-map-page__title">{map.title}</h1>
      {/* initialNodes is only read on mount: after a save, the editor keeps
          its own state (selection, zoom), which already matches the API. */}
      <MindMapEditor mapId={map.id} initialNodes={map.nodes} />
      <DeleteMindMapButton mapId={map.id} />
    </main>
  );
}

// Unknown id, or someone else's map: the API answers 404 either way.
function notFoundOn404(error: unknown): never {
  if (error instanceof ApiError && error.status === 404) notFound();
  throw error;
}
