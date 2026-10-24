'use client';

import { useActionState, useEffect, useRef } from 'react';
import { firstWords } from '../../lib/format';
import type { QuoteRow } from '../../lib/quote-table';
import { closeDialog, RowActions, SubmitButton } from '../lists/row-actions';
import { deleteQuoteAction, type QuoteEditState, updateQuoteAction } from './actions';
import { QuoteFields } from './quote-fields';

/** How a quote is named to screen readers: its first words. */
export const quoteName = (row: QuoteRow) => firstWords(row.text, 5);

/**
 * The actions of a row of the list of the quotes (MEM-69): back in the
 * review, modify and delete; into the learning queue or out of it
 * (MEM-70). The buttons and dialogs are those of every list (RowActions).
 */
export function QuoteActions({
  row,
  authors,
  queue,
  queueMenu,
}: {
  row: QuoteRow;
  authors: string[];
  /** Into the learning queue and out of it (MEM-70). */
  queue: boolean;
  /** Where to move a quote of the learning queue (built by the table). */
  queueMenu?: React.ReactNode;
}) {
  const name = quoteName(row);
  return (
    <RowActions
      type="Quote"
      row={row}
      name={name}
      queue={queue}
      queueMenu={queueMenu}
      relearn={{ title: 'Remettre en révision', label: `Remettre « ${name} » en révision` }}
      editTitle="Modifier la citation"
      editForm={<EditForm row={row} authors={authors} />}
      deleteTitle="Supprimer la citation ?"
      deletePreview={
        <blockquote className="dialog__quote">
          {firstWords(row.text, 20)}
          {row.author && <cite> — {row.author}</cite>}
        </blockquote>
      }
      deleteHint="Elle disparaît de la liste et de la révision, avec tout son historique."
      deleteAction={deleteQuoteAction.bind(null, row.id)}
    />
  );
}

function EditForm({ row, authors }: { row: QuoteRow; authors: string[] }) {
  const [state, action] = useActionState<QuoteEditState, FormData>(updateQuoteAction.bind(null, row.id), {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) closeDialog(form.current);
  }, [state]);

  const values = state.values ?? { text: row.text, author: row.author ?? '', source: row.source ?? '' };

  return (
    <form ref={form} action={action} className="dialog__form" noValidate>
      <QuoteFields values={values} errors={state.fieldErrors} idPrefix={`edit-${row.id}`} authors={authors} />
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <div className="dialog__buttons">
        <button type="button" className="button--secondary" onClick={() => closeDialog(form.current)}>
          Annuler
        </button>
        <SubmitButton label="Enregistrer" pendingLabel="Enregistrement…" />
      </div>
    </form>
  );
}
