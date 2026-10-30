'use client';

import { useRef, useState } from 'react';

/** A piece of the answer the front of a card can show on request (MEM-108): the author, the start of a quote. */
export interface Reveal {
  /** Stable name of the piece, for its ids. */
  key: string;
  /** The label of the line: « Auteur », « Début de la citation ». */
  label: string;
  /** The text of its button: « Afficher l’auteur ». */
  button: string;
  /** What the button shows; null when there is nothing to show… */
  value: string | null;
  /** …and then what the line says instead (« Auteur inconnu »). */
  missing?: string;
  lang?: string;
}

/**
 * MEM-108: the pieces of a quote that its front shows only on request, each
 * with its own button. A piece not shown yet is not in the page at all (not
 * only hidden), and showing it is not an answer: nothing is sent, the card is
 * not rated. Once shown, it stays until the answer; the next card mounts a
 * new list (the card is keyed by the session), all hidden again. The buttons
 * handle Space and Enter themselves: the card's shortcut does not reveal the
 * answer from them (review-card.tsx).
 */
export function QuoteReveals({ reveals, id }: { reveals: Reveal[]; id: string }) {
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const values = useRef(new Map<string, HTMLElement | null>());

  function show(key: string) {
    setShown((before) => new Set(before).add(key));
    // The button gives way to its value: the focus goes there, not lost to the page.
    requestAnimationFrame(() => values.current.get(key)?.focus());
  }

  return (
    <dl className="quote-reveals">
      {reveals.map((reveal) => {
        const valueId = `${id}-${reveal.key}`;
        return (
          <div key={reveal.key} className="quote-reveals__row">
            <dt className="quote-reveals__label">{reveal.label}</dt>
            <dd className="quote-reveals__value">
              {reveal.value === null ? (
                <span className="quote-reveals__missing">{reveal.missing}</span>
              ) : (
                <>
                  {!shown.has(reveal.key) && (
                    <button
                      type="button"
                      className="quote-reveals__button"
                      aria-expanded={false}
                      aria-controls={valueId}
                      onClick={() => show(reveal.key)}
                    >
                      {reveal.button}
                    </button>
                  )}
                  {/* Always in the page, empty until shown: screen readers announce what comes in. */}
                  <span
                    id={valueId}
                    ref={(element) => {
                      values.current.set(reveal.key, element);
                    }}
                    className="quote-reveals__shown"
                    aria-live="polite"
                    tabIndex={shown.has(reveal.key) ? -1 : undefined}
                    lang={reveal.lang}
                  >
                    {shown.has(reveal.key) ? reveal.value : null}
                  </span>
                </>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
