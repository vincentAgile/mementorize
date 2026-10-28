'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createMindMapAction, type MindMapAddState } from './actions';

/**
 * The form of the tab « Ajouter » (MEM-99): the central topic only, the
 * cursor in it when the tab opens. After an error the topic stays as typed,
 * with the message next to the field (aria-invalid, aria-describedby).
 */
export function AddMindMapForm() {
  const [state, action] = useActionState<MindMapAddState, FormData>(createMindMapAction, {});
  return (
    <form action={action} className="add-form add-form--mind-map" noValidate>
      <label htmlFor="mind-map-topic">Sujet central</label>
      <input
        // A new key after each answer: the field shows the topic sent back.
        key={state.topic ?? ''}
        id="mind-map-topic"
        name="topic"
        placeholder="ex. La Révolution française"
        maxLength={200}
        defaultValue={state.topic}
        required
        autoFocus
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? 'mind-map-topic-error' : 'mind-map-topic-hint'}
      />
      {state.error ? (
        <p id="mind-map-topic-error" className="field-error" role="alert">
          {state.error}
        </p>
      ) : (
        <p id="mind-map-topic-hint" className="add-form__hint">
          Les branches et les idées s’ajoutent ensuite dans l’éditeur.
        </p>
      )}
      <div className="add-form__actions">
        <CreateButton />
      </div>
    </form>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Création…' : 'Créer et ouvrir l’éditeur'}
    </button>
  );
}
