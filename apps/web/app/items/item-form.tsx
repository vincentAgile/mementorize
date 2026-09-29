'use client';

import { useActionState, useState } from 'react';
import type { ItemType } from '../../lib/types';
import { createItemAction } from './actions';

const TYPES: { value: ItemType; label: string }[] = [
  { value: 'Quote', label: 'Citation' },
  { value: 'Vocabulary', label: 'Vocabulaire' },
];

export function ItemForm({ defaultType = 'Quote' }: { defaultType?: ItemType }) {
  const [type, setType] = useState<ItemType>(defaultType);
  const [state, formAction, pending] = useActionState(createItemAction, {});
  const values = state.type === type ? (state.values ?? {}) : {};

  // After a successful submit React resets the fields (the selected type is
  // React state, so it stays); after an error, `state.values` refills them.
  return (
    <form action={formAction} className="items__form">
      <div className="segmented" role="radiogroup" aria-label="Type de fiche">
        {TYPES.map((option) => (
          <label key={option.value} className={type === option.value ? 'is-active' : ''}>
            <input
              type="radio"
              name="type"
              value={option.value}
              checked={type === option.value}
              onChange={() => setType(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>

      {type === 'Quote' ? (
        <>
          <textarea name="text" placeholder="Texte de la citation" rows={3} defaultValue={values.text} required />
          <input name="author" placeholder="Auteur (optionnel)" defaultValue={values.author} />
        </>
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
        {pending ? 'Enregistrement…' : 'Ajouter'}
      </button>
    </form>
  );
}
