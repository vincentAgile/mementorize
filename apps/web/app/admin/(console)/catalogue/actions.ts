'use server';

import { revalidatePath } from 'next/cache';
import { createCatalogList, deleteCatalogList, updateCatalogList } from '../../../../lib/admin-api';
import { API_MESSAGES, type CatalogField, catalogErrors, type CatalogValues, isLevel } from '../../../../lib/catalog';

export interface CatalogFormState {
  values?: CatalogValues;
  fieldErrors?: Partial<Record<CatalogField, string>>;
  error?: string;
  saved?: boolean;
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
};

/**
 * MEM-116: creates a list (`id` null) or changes it. The fields are checked
 * here first, then by the API: a title taken or a list without any word to
 * publish come back under their field.
 */
export async function saveCatalogListAction(
  id: string | null,
  _previous: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const values: CatalogValues = {
    title: text(formData, 'title'),
    level: text(formData, 'level'),
    description: text(formData, 'description'),
    published: formData.get('published') === 'on',
  };
  const fieldErrors = catalogErrors(values);
  if (Object.keys(fieldErrors).length > 0 || !isLevel(values.level)) return { values, fieldErrors };

  const input = {
    title: values.title.trim(),
    description: values.description.trim() || null,
    level: values.level,
    published: values.published,
  };
  const result = id === null ? await createCatalogList(input) : await updateCatalogList(id, input);
  if (!result.ok) {
    const known = result.message ? API_MESSAGES[result.message] : undefined;
    if (known) return { values, fieldErrors: { [known.field]: known.message } };
    return {
      values,
      error:
        result.status === null
          ? 'Le serveur ne répond pas. Réessaie dans un instant.'
          : result.status === 404
            ? 'Cette liste n’existe plus : recharge la page.'
            : 'Impossible d’enregistrer la liste.',
    };
  }
  revalidatePath('/admin/catalogue', 'layout');
  return { saved: true };
}

/** MEM-116: the list and its words are gone; the vocabularies of the users don't change. */
export async function deleteCatalogListAction(id: string): Promise<void> {
  if (typeof id !== 'string') throw new Error('Invalid list');
  await deleteCatalogList(id);
  revalidatePath('/admin/catalogue', 'layout');
}
