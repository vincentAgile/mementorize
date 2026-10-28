'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { firstWords } from '../../lib/format';
import { LEARNING_STATUS_LABELS } from '../../lib/learning-status';
import { countOf, type Noun } from '../../lib/nouns';
import {
  type Candidate,
  INITIAL_SESSION_SIZE,
  MAX_RESULTS,
  MAX_SESSION_SIZE,
  nextOfQueue,
  searchCandidates,
  withList,
} from '../../lib/session-preparation';
import type { ListType } from '../../lib/types';
import { startSessionAction } from './prepare-actions';

interface PrepareSessionProps {
  type: ListType;
  /** The queue in its order, then the items "En attente". */
  candidates: Candidate[];
  noun: Noun;
  cancelHref: string;
  /** MEM-95: the composition kept in the address, back from the selection page. */
  initialList?: Candidate[];
  /**
   * MEM-95 (the Anglais space): the items are added from a selection page,
   * at this address, instead of the search of MEM-94.
   */
  pickHref?: string;
}

/**
 * MEM-94: the list of a learning session, before it starts. It begins with
 * the first five items of the queue; « Retirer » takes one out of this
 * session only, the search or « Ajouter le suivant de la file » add one at
 * the end, ten at most. Nothing is saved before « Commencer ».
 * MEM-95: in a frame; in the Anglais space, « Ajouter » opens a selection
 * page instead, and the composition is kept in the address (?liste=), so
 * that it survives the way there and back.
 */
export function PrepareSession({ type, candidates, noun, cancelHref, initialList, pickHref }: PrepareSessionProps) {
  const quotes = type === 'Quote';
  const [list, setList] = useState<Candidate[]>(
    () =>
      initialList ?? candidates.filter((candidate) => candidate.status === 'ToLearn').slice(0, INITIAL_SESSION_SIZE),
  );
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  // After « Retirer », the focus goes to the next « Retirer » (or the search): never lost.
  const focusAfterRemoval = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLAnchorElement & HTMLButtonElement>(null); // MEM-95: « Ajouter »
  const searchId = useId();
  const fullId = useId();

  const chosen = useMemo(() => new Set(list.map((candidate) => candidate.id)), [list]);
  const results = useMemo(() => searchCandidates(candidates, query, chosen), [candidates, query, chosen]);
  const next = nextOfQueue(candidates, chosen);
  const full = list.length >= MAX_SESSION_SIZE;

  useEffect(() => {
    const index = focusAfterRemoval.current;
    if (index === null) return;
    focusAfterRemoval.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('.prepare__remove') ?? [];
    (buttons[Math.min(index, buttons.length - 1)] ?? searchRef.current ?? addRef.current)?.focus();
  }, [list]);

  // MEM-95: the composition in the address, without a new entry in the history.
  const ids = list.map((candidate) => candidate.id);
  const listParam = ids.join();
  useEffect(() => {
    if (pickHref) window.history.replaceState(null, '', withList(window.location.pathname, listParam.split(',')));
  }, [pickHref, listParam]);

  const label = (candidate: Candidate) => (quotes ? `« ${firstWords(candidate.primary, 6)} »` : candidate.primary);

  function add(candidate: Candidate) {
    if (full || chosen.has(candidate.id)) return;
    setList([...list, candidate]);
    setError(null);
  }

  function remove(index: number) {
    setList(list.filter((_, i) => i !== index));
    focusAfterRemoval.current = index;
  }

  function addFromSearch(candidate: Candidate) {
    add(candidate);
    setQuery('');
    searchRef.current?.focus();
  }

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startSessionAction(type, ids);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <section className="prepare" aria-labelledby="prepare-title">
      <div className="prepare__box">
        <div className="prepare__head">
          <h2 id="prepare-title" className="prepare__title">
            Préparer la session d’apprentissage
          </h2>
          <p className="prepare__count" role="status">
            {countOf(list.length, noun)} ({MAX_SESSION_SIZE} au plus)
          </p>
        </div>

        {list.length === 0 ? (
          <p className="prepare__empty">
            Aucun{noun.feminine ? 'e' : ''} {noun.one} dans cette session : ajoutez-en avec{' '}
            {pickHref ? 'le bouton « Ajouter »' : 'la recherche ci-dessous'}.
          </p>
        ) : (
          <ol className="prepare__list" ref={listRef}>
            {list.map((candidate, index) => (
              <li key={candidate.id} className="prepare__item">
                <span className="prepare__number">{index + 1}.</span>
                <span className="prepare__text">
                  <span className="prepare__primary" lang={quotes ? undefined : 'en'}>
                    {quotes ? firstWords(candidate.primary, 14) : candidate.primary}
                  </span>
                  {candidate.secondary && (
                    <span className="prepare__secondary">
                      {quotes ? '— ' : ''}
                      {candidate.secondary}
                    </span>
                  )}
                </span>
                {candidate.status === 'Waiting' && (
                  <span className="status status--Waiting">{LEARNING_STATUS_LABELS.Waiting}</span>
                )}
                <button
                  type="button"
                  className="prepare__remove"
                  aria-label={`Retirer ${label(candidate)} de la session`}
                  onClick={() => remove(index)}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ol>
        )}

        {pickHref ? (
          // MEM-95: a single « Ajouter », to the selection page.
          <div className="prepare__add">
            {full ? (
              <button type="button" className="prepare__pick" disabled aria-describedby={fullId}>
                + Ajouter
              </button>
            ) : (
              <Link ref={addRef} href={withList(pickHref, ids)} className="prepare__pick">
                + Ajouter
              </Link>
            )}
          </div>
        ) : (
          <div className="prepare__add">
            <label htmlFor={searchId} className="prepare__add-label">
              Ajouter
            </label>
            <input
              id={searchId}
              ref={searchRef}
              type="search"
              className="prepare__search"
              placeholder={`Rechercher ${noun.feminine ? 'une' : 'un'} ${noun.one} à apprendre ou en attente…`}
              value={query}
              disabled={full}
              aria-describedby={full ? fullId : undefined}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter adds the first result; Escape clears the search.
                if (event.key === 'Enter' && results[0]) {
                  event.preventDefault();
                  addFromSearch(results[0]);
                } else if (event.key === 'Escape') {
                  setQuery('');
                }
              }}
            />
            <button type="button" className="prepare__next" disabled={full || !next} onClick={() => next && add(next)}>
              + Ajouter {noun.feminine ? 'la suivante' : 'le suivant'} de la file
            </button>
          </div>
        )}

        {full && (
          <p id={fullId} className="prepare__full">
            {MAX_SESSION_SIZE} {noun.many} au plus par session : retirez-en {noun.feminine ? 'une' : 'un'} pour en
            ajouter {noun.feminine ? 'une autre' : 'un autre'}.
          </p>
        )}

        {!pickHref && !full && query.trim() !== '' && (
          <div className="prepare__results">
            {results.length === 0 ? (
              <p className="prepare__no-result" role="status">
                Aucun{noun.feminine ? 'e' : ''} {noun.one} à apprendre ou en attente ne correspond.
              </p>
            ) : (
              <>
                <ul aria-label="Résultats de la recherche">
                  {results.slice(0, MAX_RESULTS).map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="prepare__result"
                        aria-label={`Ajouter ${label(candidate)} (${LEARNING_STATUS_LABELS[candidate.status]})`}
                        onClick={() => addFromSearch(candidate)}
                      >
                        <span className="prepare__text">
                          <span className="prepare__primary" lang={quotes ? undefined : 'en'}>
                            {quotes ? firstWords(candidate.primary, 14) : candidate.primary}
                          </span>
                          {candidate.secondary && (
                            <span className="prepare__secondary">
                              {quotes ? '— ' : ''}
                              {candidate.secondary}
                            </span>
                          )}
                        </span>
                        <span className={`status status--${candidate.status}`}>
                          {LEARNING_STATUS_LABELS[candidate.status]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {results.length > MAX_RESULTS && (
                  <p className="prepare__more">
                    {results.length - MAX_RESULTS} autre{results.length - MAX_RESULTS > 1 ? 's' : ''} résultat
                    {results.length - MAX_RESULTS > 1 ? 's' : ''} : précisez la recherche.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="prepare__actions">
        <Link href={cancelHref} className="prepare__cancel">
          Annuler
        </Link>
        <button
          type="button"
          className="space__review space__review--learn prepare__start"
          disabled={list.length === 0 || starting}
          onClick={start}
        >
          {starting ? 'Démarrage…' : 'Commencer →'}
        </button>
      </div>
    </section>
  );
}
