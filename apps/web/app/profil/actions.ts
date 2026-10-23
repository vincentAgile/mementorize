'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, saveProfile } from '../../lib/api';
import { NAME_MAX_LENGTH } from '../../lib/profile';

export interface ProfileFormState {
  message?: string;
  error?: string;
  // Sent back so the fields aren't emptied after an error.
  firstName?: string;
  lastName?: string;
}

export async function saveProfileAction(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  if (firstName.length > NAME_MAX_LENGTH || lastName.length > NAME_MAX_LENGTH) {
    return {
      firstName,
      lastName,
      error: `Le prénom et le nom ne peuvent pas dépasser ${NAME_MAX_LENGTH}\u00a0caractères.`,
    };
  }

  try {
    await saveProfile({ firstName, lastName });
  } catch (error) {
    if (error instanceof ApiError) return { firstName, lastName, error: "Impossible d'enregistrer le profil." };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/', 'layout'); // the avatar of every header
  return { message: 'Profil enregistré.' };
}
