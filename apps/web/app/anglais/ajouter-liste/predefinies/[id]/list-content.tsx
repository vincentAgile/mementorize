'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { agree, countOf, ITEM_NOUN } from '../../../../../lib/nouns';
import type { CatalogListDetail } from '../../../../../lib/types';
import { QueueChoice } from '../../../../lists/queue-choice';
import { type AddFromListResult, addFromListAction } from '../actions';
import { AddedMessage } from '../added-message';

/**
 * MEM-118: the words of a list, each with its box, all checked at first,
 * but those already in the vocabulary (the same English, MEM-50): greyed,
 * unchecked, off, « Déjà dans ma liste ». A box in the header checks or
 * unchecks them all. « Ajouter N cartes » follows the boxes, and the
 * choice of the learning queue, as the « Ajouter » tab (MEM-62). On a
 * phone, the table is a list of rows, and the button stays at the bottom of
 * the screen. Once added, the page is read again: the words added are now
 * « Déjà dans ma liste ».
 */
export function ListContent({ list }: { list: CatalogListDetail }) {
  const available = list.entries.filter((entry) => !entry.owned);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(available.map((entry) => entry.id)));
  const [queue, setQueue] = useState(true);
  const [result, setResult] = useState<AddFromListResult | null>(null);
  const [pending, startTransition] = useTransition();
  const all = useRef<HTMLInputElement>(null);

  // The words checked and still available: after an addition, those added are owned.
  const selected = available.filter((entry) => checked.has(entry.id));
  const count = selected.length;
  const allChecked = available.length > 0 && count === available.length;
  useEffect(() => {
    if (all.current) all.current.indeterminate = count > 0 && !allChecked;
  }, [count, allChecked]);

  function toggle(id: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function add() {
    const ids = selected.map((entry) => entry.id);
    startTransition(async () => setResult(await addFromListAction(list.id, ids, queue)));
  }

  return (
    <div className="catalog-content">
      {result && 'added' in result && <AddedMessage {...result} />}
      {result && 'error' in result && (
        <p className="form-error" role="alert">
          {result.error}
        </p>
      )}
      <table className="catalog-content__table">
        <caption className="visually-hidden">Mots de la liste « {list.title} »</caption>
        <thead>
          <tr>
            <th scope="col" className="catalog-content__check">
              <input
                ref={all}
                type="checkbox"
                aria-label={allChecked ? 'Tout décocher' : 'Tout cocher'}
                checked={allChecked}
                disabled={available.length === 0}
                onChange={(event) =>
                  setChecked(event.target.checked ? new Set(available.map((entry) => entry.id)) : new Set())
                }
              />
            </th>
            <th scope="col">Expression anglaise</th>
            <th scope="col">Expression française</th>
            <th scope="col">Thématique</th>
          </tr>
        </thead>
        <tbody>
          {list.entries.map((entry) => (
            <tr key={entry.id} className={entry.owned ? 'is-owned' : undefined}>
              <td className="catalog-content__check">
                <input
                  type="checkbox"
                  id={`entry-${entry.id}`}
                  checked={!entry.owned && checked.has(entry.id)}
                  disabled={entry.owned}
                  onChange={(event) => toggle(entry.id, event.target.checked)}
                  aria-describedby={entry.owned ? `entry-${entry.id}-owned` : undefined}
                />
              </td>
              <td className="catalog-content__english" lang="en">
                <label htmlFor={`entry-${entry.id}`}>{entry.english}</label>
                {entry.owned && (
                  <span id={`entry-${entry.id}-owned`} className="catalog-content__owned">
                    Déjà dans ma liste
                  </span>
                )}
              </td>
              <td className="catalog-content__french" lang="fr">
                {entry.french}
              </td>
              <td className="catalog-content__topic">{entry.topic}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* On a computer, the button and the choice stay at the bottom of the screen; on a phone, the button only. */}
      <div className="catalog-content__actions">
        <div className="catalog-content__bar">
          <button type="button" disabled={count === 0 || pending} onClick={add}>
            {pending ? 'Ajout…' : `Ajouter ${countOf(count, ITEM_NOUN)}`}
          </button>
        </div>
        <QueueChoiceControlled queue={queue} onChange={setQueue} />
        {available.length === 0 && <p className="catalog-content__none">Tout est déjà dans ta liste.</p>}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {countOf(count, ITEM_NOUN)} {agree('coché', ITEM_NOUN, count)}
      </p>
    </div>
  );
}

/** The two choices of the « Ajouter » tab (MEM-62), here outside a form: read on each change. */
function QueueChoiceControlled({ queue, onChange }: { queue: boolean; onChange: (queue: boolean) => void }) {
  return (
    <div
      onChange={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.name === 'queue') onChange(target.value === 'on');
      }}
    >
      <QueueChoice queue={queue} noun={ITEM_NOUN} idPrefix="catalog-content" many />
    </div>
  );
}
