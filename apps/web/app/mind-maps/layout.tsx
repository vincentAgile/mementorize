import { requireMindMaps } from '../../lib/mind-maps-access';

/** The editor of a mind map: only when the space Cartes mentales is on (« Espace cartes mentales »). */
export default async function MindMapEditorLayout({ children }: { children: React.ReactNode }) {
  await requireMindMaps();
  return children;
}
