'use client';

import { useActionState } from 'react';
import { SubmitButton } from '../../../../lists/row-actions';
import { type PublishState, publishAction } from './actions';

/**
 * MEM-117: « Publier » / « Dépublier », in the header of the list. Publishing
 * an empty list is refused, with the message of MEM-116.
 */
export function PublishButton({ listId, published }: { listId: string; published: boolean }) {
  const [state, action] = useActionState<PublishState, FormData>(() => publishAction(listId, !published), {});
  return (
    <form action={action} className="catalog-list__publish">
      <SubmitButton
        label={published ? 'Dépublier' : 'Publier'}
        pendingLabel={published ? 'Dépublication…' : 'Publication…'}
        className={published ? 'button--secondary' : 'button--primary'}
      />
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
