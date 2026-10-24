'use client';

import { useActionState } from 'react';
import type { ItemType } from '../../lib/types';
import { createItemAction } from './actions';

/**
 * The add form of a space: the space decides the type of item (MEM-7), so
 * the form only shows the fields of that type. The type travels in a hidden
 * field, read by the Server Action. The Anglais and Citations spaces have
 * their own "Ajouter" tab (MEM-27, MEM-71).
 */
export function ItemForm({ type }: { type: ItemType }) {
  const [state, formAction, pending] = useActionState(createItemAction, {});
  const values = state.type === type ? (state.values ?? {}) : {};

  // After a successful submit React resets the fields; after an error,
  // `state.values` refills them.
  return (
    <form action={formAction} className="items__form">
      <input type="hidden" name="type" value={type} />

      {type === 'MindMap' ? (
        <input
          name="topic"
          placeholder="Sujet central (ex. La Révolution française)"
          maxLength={200}
          defaultValue={values.topic}
          required
        />
      ) : (
        <>
          <div className="items__row">
            <input name="word" placeholder="Mot ou expression en anglais" defaultValue={values.word} required />
            <input name="translation" placeholder="Traduction en français" defaultValue={values.translation} required />
          </div>
          <input name="example" placeholder="Phrase d'exemple (optionnel)" defaultValue={values.example} />
        </>
      )}

      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Enregistrement…' : type === 'MindMap' ? 'Créer et ouvrir l’éditeur' : 'Ajouter'}
      </button>
    </form>
  );
}
