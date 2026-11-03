'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { CatalogList } from '../../../../lib/admin-api';
import { CATALOG_MAX, type CatalogField, type CatalogValues, LEVELS } from '../../../../lib/catalog';
import { closeDialog, SubmitButton } from '../../../lists/row-actions';
import { type CatalogFormState, saveCatalogListAction } from './actions';

const EMPTY: CatalogValues = { title: '', level: '', description: '', published: false };

/**
 * MEM-116: the form of a predefined list, in its dialog: a new one, or the
 * one given. Title, level (A1 to C2, with its name), description and
 * « Publiée »; the errors under their field, as the other forms. Closes its
 * dialog once saved; the dialog gives it a new key each time it opens.
 */
export function CatalogForm({ list, idPrefix }: { list?: CatalogList; idPrefix: string }) {
  // Each answer numbered: the fields are built again from the values sent, the
  // level included (a <select> doesn't follow a new default value when the
  // form is reset after an action).
  const [state, action] = useActionState<CatalogFormState & { version?: number }, FormData>(
    async (previous, formData) => ({
      ...(await saveCatalogListAction(list?.id ?? null, previous, formData)),
      version: (previous.version ?? 0) + 1,
    }),
    {},
  );
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) closeDialog(form.current);
    else form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const values =
    state.values ??
    (list
      ? { title: list.title, level: list.level, description: list.description ?? '', published: list.published }
      : EMPTY);
  const error = (field: CatalogField) => state.fieldErrors?.[field];
  const described = (field: CatalogField, help?: string) => {
    const ids = [help, error(field) && `${idPrefix}-${field}-error`].filter(Boolean).join(' ');
    return { 'aria-invalid': error(field) ? true : undefined, 'aria-describedby': ids || undefined } as const;
  };
  const message = (field: CatalogField) =>
    error(field) && (
      <span id={`${idPrefix}-${field}-error`} className="field-error">
        {error(field)}
      </span>
    );

  return (
    <form key={state.version ?? 0} ref={form} action={action} className="dialog__form catalog-form" noValidate>
      <label>
        <span>
          Titre{' '}
          <span className="vocab-fields__required" aria-hidden="true">
            *
          </span>
        </span>
        <input
          name="title"
          defaultValue={values.title}
          maxLength={CATALOG_MAX.title}
          autoComplete="off"
          // The form is mounted again each time its dialog opens: the cursor in the title.
          autoFocus
          aria-required
          {...described('title')}
        />
        {message('title')}
      </label>
      <label>
        <span>
          Niveau{' '}
          <span className="vocab-fields__required" aria-hidden="true">
            *
          </span>
        </span>
        <select name="level" defaultValue={values.level} aria-required {...described('level')}>
          <option value="" disabled>
            Choisir un niveau
          </option>
          {LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
        {message('level')}
      </label>
      <label>
        <span>
          Description <span className="add-form__optional">(facultative)</span>
        </span>
        <textarea
          name="description"
          rows={3}
          defaultValue={values.description}
          maxLength={CATALOG_MAX.description}
          {...described('description')}
        />
        {message('description')}
      </label>
      <label className="catalog-form__published">
        <input
          type="checkbox"
          name="published"
          defaultChecked={values.published}
          {...described('published', `${idPrefix}-published-help`)}
        />
        <span>Publiée</span>
      </label>
      <span id={`${idPrefix}-published-help`} className="field-help">
        Une liste publiée est proposée aux utilisateurs ; une liste vide ne peut pas l’être.
      </span>
      {message('published')}
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <div className="dialog__buttons">
        <button type="button" className="button--secondary" onClick={() => closeDialog(form.current)}>
          Annuler
        </button>
        <SubmitButton label={list ? 'Enregistrer' : 'Créer la liste'} pendingLabel="Enregistrement…" />
      </div>
    </form>
  );
}
