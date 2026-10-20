'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, saveProfile } from '../../lib/api';
import { NAME_MAX_LENGTH } from '../../lib/profile';

export interface ProfileFormState {
  message?: string;
  error?: string;
  name?: string; // sent back so the field isn't emptied after an error
}

export async function saveProfileAction(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const name = String(formData.get('name') ?? '').trim();
  if (name.length > NAME_MAX_LENGTH) {
    return { name, error: `Le nom ne peut pas dépasser ${NAME_MAX_LENGTH} caractères.` };
  }

  try {
    await saveProfile(name);
  } catch (error) {
    if (error instanceof ApiError) return { name, error: "Impossible d'enregistrer le profil." };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/', 'layout'); // the avatar of every header
  return { message: name ? 'Profil enregistré.' : 'Nom effacé.' };
}
