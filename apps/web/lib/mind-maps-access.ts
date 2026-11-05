import 'server-only';
import { redirect } from 'next/navigation';
import { getPreferences } from './api';
import { mindMapsEnabledOf } from './types';

/**
 * « Espace cartes mentales » off (Réglages › Général): the pages of the
 * space are hidden too, the addresses as well: back to the home page.
 */
export async function requireMindMaps(): Promise<void> {
  if (!mindMapsEnabledOf(await getPreferences())) redirect('/');
}
