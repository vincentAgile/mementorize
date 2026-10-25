'use client';

import { useEffect, useState, useTransition } from 'react';
import { NBSP } from '../../lib/format';
import { SPACES } from '../../lib/spaces';
import type { ItemType, SpaceOptimization } from '../../lib/types';
import { type OptimizationResult, optimizationStatusAction, optimizeAction, resetOptimizationAction } from './actions';

/** In the order of the story: Anglais, Citations, Cartes mentales. */
const ORDER: ItemType[] = ['Vocabulary', 'Quote', 'MindMap'];

/** How often a running optimization is checked: it takes a few seconds. */
const POLL_MS = 2000;

const count = (value: number) => value.toLocaleString('fr-FR');
const date = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const plural = (value: number, word: string) => `${count(value)}${NBSP}${word}${value > 1 ? 's' : ''}`;

/**
 * The optimization of the FSRS weights of each space on the user's own
 * history (MEM-76). It runs in the background: while it does, the status is
 * checked every few seconds, and a message says when it ends or fails.
 */
export function OptimizationForm({ spaces }: { spaces: SpaceOptimization[] }) {
  const [states, setStates] = useState(spaces);
  const running = states.some((space) => space.status === 'Running');

  // Follow the running optimizations until they end.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const latest = await optimizationStatusAction();
      if (latest) setStates(latest);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running]);

  const update = (space: SpaceOptimization) =>
    setStates((current) => current.map((one) => (one.type === space.type ? space : one)));

  return (
    <section className="settings">
      <h2>Optimisation</h2>
      <p className="page__subtitle">
        Mementorize peut ajuster son algorithme de révision (FSRS) à votre mémoire, à partir de l’historique de vos
        révisions dans chaque espace. Il faut au moins {count(spaces[0]?.minReviews ?? 1000)} révisions pour que
        l’optimisation soit fiable ; d’ici là, les valeurs par défaut s’appliquent. Les nouveaux réglages s’appliquent à
        la prochaine révision de chaque carte.
      </p>
      <div className="settings__form optimization">
        {ORDER.map((type) => {
          const space = states.find((one) => one.type === type);
          return space && <SpaceRow key={type} space={space} onChange={update} />;
        })}
      </div>
    </section>
  );
}

function SpaceRow({ space, onChange }: { space: SpaceOptimization; onChange: (space: SpaceOptimization) => void }) {
  const label = SPACES.find((one) => one.type === space.type)!.label;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  // An optimization was started here: when it ends, say how.
  const [watching, setWatching] = useState(false);
  const running = space.status === 'Running';
  const missing = space.minReviews - space.reviewCount;

  // A run started here that has ended: the message says how.
  const ended: typeof message =
    watching && !running
      ? space.status === 'Succeeded'
        ? { text: 'Optimisation terminée : les nouveaux réglages s’appliquent dès la prochaine révision.' }
        : { text: space.error ?? 'L’optimisation a échoué : les réglages précédents restent en place.', error: true }
      : null;
  const shown = message ?? ended;

  const act = (action: (type: ItemType) => Promise<OptimizationResult>, done?: string) =>
    startTransition(async () => {
      setMessage(null);
      setWatching(false);
      let result: OptimizationResult;
      try {
        result = await action(space.type);
      } catch {
        result = { error: 'La demande a échoué : vérifiez la connexion et réessayez.' };
      }
      if ('error' in result) {
        setMessage({ text: result.error, error: true });
        return;
      }
      onChange(result.space);
      if (result.space.status === 'Running') setWatching(true);
      else if (done) setMessage({ text: done });
    });

  const descriptionId = `optimization-${space.type}`;
  return (
    <div className="optimization__space" role="group" aria-labelledby={`${descriptionId}-label`}>
      <h3 id={`${descriptionId}-label`}>{label}</h3>
      <p className="settings__hint" id={descriptionId}>
        {plural(space.reviewCount, 'révision')} notée{space.reviewCount > 1 ? 's' : ''} ·{' '}
        {space.custom && space.optimizedAt ? `optimisé le ${date(space.optimizedAt)}` : 'valeurs par défaut'}
        {missing > 0 && (
          <>
            <br />
            Encore {plural(missing, 'révision')} avant de pouvoir optimiser.
          </>
        )}
      </p>
      <div className="optimization__actions">
        <button
          type="button"
          disabled={pending || running || missing > 0}
          aria-describedby={descriptionId}
          onClick={() => act(optimizeAction)}
        >
          {running ? 'Optimisation en cours…' : 'Optimiser maintenant'}
        </button>
        <button
          type="button"
          className="button--secondary"
          disabled={pending || running || !space.custom}
          onClick={() => act(resetOptimizationAction, 'Valeurs par défaut rétablies.')}
        >
          Revenir aux valeurs par défaut
        </button>
      </div>
      <p role="status" aria-live="polite" className={shown?.error ? 'form-error' : 'settings__hint'}>
        {shown?.text}
      </p>
    </div>
  );
}
