'use server';

import { revalidatePath } from 'next/cache';
import { relearnCard } from '../../lib/api';

/** « Remettre en révision » (MEM-48): a learned mind map branch goes back to the review. */
export async function relearnCardAction(cardId: string): Promise<void> {
  if (typeof cardId !== 'string') {
    throw new Error('Invalid card');
  }
  await relearnCard(cardId);
  revalidatePath('/', 'layout'); // the space, the map and the counters
}
