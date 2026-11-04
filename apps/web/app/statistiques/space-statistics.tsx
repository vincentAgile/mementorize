import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { getLearningProgress } from '../../lib/api';
import { spaceOf } from '../../lib/spaces';
import type { LearningProgress, ListType } from '../../lib/types';
import { ProgressSummary } from '../apprendre/learning-progress';

/**
 * MEM-114: a tab of « Mes statistiques », the vocabulary or the quotes: the
 * same next review and progress as at the end of a learning session or a
 * review (ProgressSummary, ProgressChart), read at each display, without
 * cache. Nothing learned yet: a message and the way to learn; the API in
 * error: a message, the rest of the page (header, tabs) still works.
 */
export async function SpaceStatistics({ type }: { type: ListType }) {
  const space = spaceOf(type);
  let progress: LearningProgress | null = null;
  try {
    progress = await getLearningProgress(type);
  } catch (error) {
    unstable_rethrow(error); // the session expired: to the login page, as elsewhere
  }

  if (!progress) {
    return (
      <section className="statistics">
        <p className="statistics__message" role="alert">
          Les statistiques ne sont pas disponibles pour le moment. Réessaie dans un instant.
        </p>
      </section>
    );
  }
  if (progress.days.length === 0) {
    return (
      <section className="statistics">
        <p className="statistics__message">
          Rien à afficher pour le moment : les statistiques apparaissent dès qu’une première carte est apprise.{' '}
          <Link href={space.href}>Apprendre · Réviser</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="statistics">
      <ProgressSummary progress={progress} type={type} title={`Progression · ${space.label}`} level={2} />
    </section>
  );
}
