'use client';

import { useId } from 'react';
import { PAGE_SIZES, pageNumbers } from '../../lib/vocabulary-table';

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

/**
 * Under the vocabulary table (MEM-58): how many items per page, and the
 * navigation between pages (hidden when there is only one). On a phone,
 * only « Précédent », « Page X sur Y » and « Suivant »; on a computer, the
 * page numbers too.
 */
export function Pagination({ page, pageCount, pageSize, onPage, onPageSize }: PaginationProps) {
  const sizeId = useId();
  return (
    <div className="pagination">
      <p className="pagination__size">
        <label htmlFor={sizeId}>Afficher</label>
        <select id={sizeId} value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span aria-hidden="true">par page</span>
        <span className="visually-hidden">éléments par page</span>
      </p>

      {pageCount > 1 && (
        <nav className="pagination__nav" aria-label="Pagination">
          <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>
            <span aria-hidden="true">‹ </span>Précédent
          </button>
          <ol className="pagination__pages">
            {pageNumbers(page, pageCount).map((number, index) =>
              number === null ? (
                <li key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
                  …
                </li>
              ) : (
                <li key={number}>
                  <button
                    type="button"
                    aria-current={number === page ? 'page' : undefined}
                    aria-label={`Page ${number}`}
                    onClick={() => onPage(number)}
                  >
                    {number}
                  </button>
                </li>
              ),
            )}
          </ol>
          <span className="pagination__where" aria-live="polite">
            Page {page} sur {pageCount}
          </span>
          <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)}>
            Suivant<span aria-hidden="true"> ›</span>
          </button>
        </nav>
      )}
    </div>
  );
}
