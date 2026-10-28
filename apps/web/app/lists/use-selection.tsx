'use client';

import { useEffect, useRef, useState } from 'react';
import { agree, countOf, type Noun } from '../../lib/nouns';

/**
 * MEM-59: the items checked in a list, Gmail-style: those checked one by
 * one, or all those of the search and filters at once. Shared by the lists
 * of the spaces (vocabulary, quotes, and the mind maps since MEM-98).
 * `shownIds`: the items of the search and filters, in the order of the
 * list; `pageIds`: those of the page.
 */
export function useSelection(shownIds: string[], pageIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const clear = () => {
    setSelected(new Set());
    setAllMatching(false);
  };

  // In the order of the list.
  const ids = allMatching ? shownIds : shownIds.filter((id) => selected.has(id));
  const isSelected = (id: string) => allMatching || selected.has(id);
  const pageAll = pageIds.length > 0 && pageIds.every(isSelected);
  const pageSome = pageIds.some(isSelected);
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = pageSome && !pageAll;
  }, [pageSome, pageAll]);

  /** From "all those of the filters" back to a list of ids, to uncheck some of them. */
  const explicit = () => (allMatching ? new Set(shownIds) : new Set(selected));
  function toggleRow(id: string) {
    const next = explicit();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setAllMatching(false);
  }
  function togglePage() {
    const next = explicit();
    for (const id of pageIds) {
      if (pageAll) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
    setAllMatching(false);
  }

  return {
    ids,
    isSelected,
    pageAll,
    allMatching,
    headerBox,
    toggleRow,
    togglePage,
    clear,
    selectAllMatching: () => setAllMatching(true),
  };
}

export type Selection = ReturnType<typeof useSelection>;

/**
 * Under the selection bar, once the whole page is checked and the list has
 * more: « Sélectionner les 85 éléments de la liste », or « Annuler la sélection ».
 */
export function SelectAllNotice({
  selection,
  noun,
  shownCount,
  pageCount,
  filtered,
}: {
  selection: Selection;
  noun: Noun;
  /** The items of the search and filters. */
  shownCount: number;
  /** The items of the page. */
  pageCount: number;
  filtered: boolean;
}) {
  if (!selection.pageAll || shownCount <= pageCount) return null;
  return (
    <p className="selection-all">
      {selection.allMatching ? (
        <>
          Les {countOf(shownCount, noun)} sont {agree('sélectionné', noun, shownCount)}.{' '}
          <button type="button" className="link-button" onClick={selection.clear}>
            Annuler la sélection
          </button>
        </>
      ) : (
        <>
          Les {countOf(pageCount, noun)} de cette page sont {agree('sélectionné', noun, pageCount)}.{' '}
          <button type="button" className="link-button" onClick={selection.selectAllMatching}>
            Sélectionner les {countOf(shownCount, noun)}{' '}
            {filtered ? 'correspondant à la recherche et aux filtres' : 'de la liste'}
          </button>
        </>
      )}
    </p>
  );
}
